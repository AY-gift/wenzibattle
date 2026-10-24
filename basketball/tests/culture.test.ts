import { describe, expect, it } from 'vitest';
import { BASKETBALL_COMBOS, comboFor } from '@shared/sports/combos';
import { BASKETBALL_CULTURE, CULTURE_MATCHUPS, basketCultureFor, matchupFor, type CultureBasketPair } from '@shared/sports/culture';
import { setFlip, type Match } from '../src/sim/Match';
import { tryCulture } from '../src/sim/culture';
import { COURT, GAME_TIME, OVERTIME, type MatchEvent } from '../src/sim/types';
import { match, team } from './lineups';

const OPP = team('free', ['火', '水']);

/** A fixed half-court situation for team 0 (attacks +x): carrier on the wing, partner inside. */
export function scenario(c: CultureBasketPair, seed: number, opts: { loose?: boolean; defend?: boolean } = {}): Match {
  const m = match(team('split', c.key), OPP, seed);
  while (m.phase !== 'play') m.step();
  for (let i = 0; i < 20; i++) m.step();
  const spots: [number, number][] = opts.defend ? [[-7, 0.5], [-8.5, -2], [-6, 0], [-5, 3]] : [[5, 2], [7.5, -2.5], [4.2, 1.2], [-2, -3]];
  m.players.forEach((p, i) => {
    p.p = { x: spots[i][0], z: spots[i][1] };
    p.v = { x: 0, z: 0 };
    p.y = 0;
    p.vy = 0;
    p.state = 'play';
    p.stateT = 0;
    p.pending = null;
    p.actCd = 0;
    p.dunkDrive = 0;
    p.face = { x: i < 2 ? 1 : -1, z: 0 };
  });
  m.players[2].mark = 0;
  m.players[3].mark = 1;
  m.players[0].mark = 2;
  m.players[1].mark = 3;
  const b = m.ball;
  b.shot = null;
  b.homingTo = -1;
  b.rebound = false;
  if (opts.loose) {
    b.owner = -1;
    b.p = { x: COURT.hoopX - 1.2, y: 1.2, z: -1.5 };
    b.v = { x: 0, y: 0, z: 0 };
    b.rebound = true;
    m.players[1].p = { x: COURT.hoopX - 1.6, z: -1.3 };
  } else m.give(opts.defend ? m.players[2] : m.players[0]);
  return m;
}

function run(m: Match, seconds: number): MatchEvent[] {
  const from = m.events.length;
  for (let i = 0; i < seconds * 60 && m.phase === 'play'; i++) m.step();
  return m.events.slice(from);
}

const DEFENSIVE = new Set(['defend', 'danger']);

describe('basketball culture pairs (文化搭档)', () => {
  it('all 262 pairs (91 + 171 expansion) are registered with a basketball recipe; the 13 idiom pairs keep their combo names', () => {
    expect(BASKETBALL_CULTURE).toHaveLength(262);
    for (const c of BASKETBALL_CULTURE) {
      expect(basketCultureFor(team('split', c.key).input)?.key, c.key).toBe(c.key);
      expect(c.status).toBe('implemented');
    }
    const idioms = BASKETBALL_CULTURE.filter((c) => c.idiom);
    expect(idioms).toHaveLength(13);
    for (const c of idioms) expect(comboFor(BASKETBALL_COMBOS, team('split', c.key).input), c.key).not.toBeNull();
    // Free teams that spell a pair in order count too; anything else plays without one.
    expect(basketCultureFor({ members: ['冰', '火'] })?.key).toBe('冰火');
    expect(basketCultureFor(team('split', '甲乙').input)).toBeNull();
  });

  it('every pair fires and every primitive in its recipe takes real effect', () => {
    const BALL = ['alleyOop', 'giveAndGo', 'pickAndRoll', 'backdoorCut', 'crossover', 'pumpFake', 'highArc', 'bankShot', 'deepThree', 'powerDunk', 'curvePass', 'fastBreak', 'swapPass'];
    const failures: string[] = [];
    for (const [i, c] of BASKETBALL_CULTURE.entries()) {
      const loose = c.prims.includes('tipIn') && c.prims.every((p) => p === 'tipIn' || !BALL.includes(p));
      const defend = DEFENSIVE.has(c.trigger) && !c.prims.includes('tipIn');
      // Physics decides (a pass can be stolen): each pair must take full effect in one of three seeded scenarios.
      let last = '';
      const ok = [3000, 5000, 7000].some((base) => {
        const m = scenario(c, base + i, { loose, defend });
        m.teams[0].culture = { ...c, risk: 'none' };
        const from = m.events.length;
        const fired = tryCulture(m, 0, true);
        if (defend && c.prims.some((p) => BALL.includes(p))) {
          // Defend now, attack later: the queued attack starts once the ball is won back.
          run(m, 1);
          m.ball.owner = -1;
          m.give(m.players[0]);
        }
        run(m, 6);
        const seen = new Set(m.events.slice(from).filter((e) => e.type === 'prim' && e.team === 0).map((e) => e.kind));
        const missing = c.prims.filter((p) => !seen.has(p));
        last = `${c.key} [${c.trigger}: ${c.prims.join('+')}] missing ${missing.join(',') || '-'} fired=${fired}`;
        return fired && !missing.length;
      });
      if (!ok) failures.push(last);
    }
    expect(failures).toEqual([]);
  });

  it('every kind of backfire really happens', () => {
    const risks = [...new Set(BASKETBALL_CULTURE.map((c) => c.risk))].filter((r) => r !== 'none');
    for (const risk of risks) {
      const pairs = BASKETBALL_CULTURE.filter((x) => x.risk === risk);
      let shown = false;
      for (let s = 0; s < 60 && !shown; s++) {
        const c = pairs[s % pairs.length];
        const m = scenario(c, 4000 + s, { defend: DEFENSIVE.has(c.trigger) });
        tryCulture(m, 0, true);
        run(m, 4);
        shown = m.events.some((e) => e.type === 'prim' && e.kind === `risk:${risk}`);
      }
      expect(shown, risk).toBe(true);
    }
  });

  it('pairs fire unforced in real games (at most five), and points only come from the rim', () => {
    let fires = 0, games = 0;
    for (const [i, c] of BASKETBALL_CULTURE.entries()) {
      if (i % 3) continue;
      const r = match(team('split', c.key), OPP, i).runToEnd();
      games++;
      const n = r.events.filter((e) => e.type === 'combo' && e.kind === 'culture' && e.team === 0).length;
      expect(n).toBeLessThanOrEqual(5);
      fires += n;
      expect(r.score[0] + r.score[1]).toBe(r.scores.reduce((s, x) => s + x.points, 0));
      expect(r.time).toBeLessThanOrEqual(GAME_TIME + OVERTIME + 3.1);
    }
    expect(fires / games).toBeGreaterThan(1);
  });

  it('all 46 basketball rivalries (16 + 30 expansion) are found in either order and announced at the tip-off', () => {
    const pairs = CULTURE_MATCHUPS.filter((mu) => mu.mode === 'basketball');
    expect(pairs).toHaveLength(46);
    for (const mu of pairs) {
      for (const [x, y] of [[mu.a, mu.b], [mu.b, mu.a]]) {
        const m = match(team('split', x), team('split', y), 5);
        expect(m.rivalry?.name, `${x} vs ${y}`).toBe(mu.name);
        expect(m.rivalry?.swapped).toBe(x !== mu.a);
        while (m.phase !== 'play') m.step();
        expect(m.events.some((e) => e.type === 'rivalry' && e.label === mu.name)).toBe(true);
        if (mu.effect === 'weather') expect(m.zones.filter((z) => z.team === 2)).toHaveLength(2);
      }
    }
    expect(matchupFor(team('split', '冰火').input, team('split', '甲乙').input, 'basketball')).toBeNull();
  });

  it('the court is mirror-symmetric: a rotated world plays the rotated game', () => {
    for (const key of ['冰火', '兄弟', '甲乙', '牛顿']) {
      const E = team('split', key);
      setFlip(1);
      const A = match(E, E, 11);
      setFlip(-1);
      const B = match(E, E, 11);
      for (let i = 0; i < 60 * 12; i++) {
        setFlip(1);
        A.step();
        setFlip(-1);
        B.step();
      }
      setFlip(1);
      for (let k = 0; k < 4; k++) {
        expect(Math.abs(A.players[k].p.x + B.players[k].p.x), key).toBeLessThan(1e-6);
        expect(Math.abs(A.players[k].p.z + B.players[k].p.z), key).toBeLessThan(1e-6);
        expect(A.players[k].state).toBe(B.players[k].state);
      }
      expect(A.events.length).toBe(B.events.length);
    }
  });
});
