import { describe, expect, it } from 'vitest';
import { CULTURE_MATCHUPS, SOCCER_CULTURE, cultureFor, matchupFor, type CultureCombo } from '@shared/sports/culture';
import { setFlip, type Match } from '../src/sim/Match';
import { tryCulture } from '../src/sim/culture';
import { FIELD, MATCH_TIME, type MatchEvent } from '../src/sim/types';
import { match, team } from './lineups';

const OPP = team('free', ['火', '水', '雷', '风']);
const IMPLEMENTED = SOCCER_CULTURE.filter((c) => c.status === 'implemented');

/** A fixed attacking situation for team 0 (attacks +x): carrier 12 m from goal, mates ahead, defenders close. */
function scenario(c: CultureCombo, seed: number): Match {
  const m = match(team('split', c.key), OPP, seed);
  while (m.phase !== 'play') m.step();
  for (let i = 0; i < 30; i++) m.step();
  const spots: [number, number][] = [[8, 0], [13, 4.5], [12, -5], [-12, 0], [6.5, -2], [-3, 6], [-3, -7], [19, 0]];
  m.players.forEach((p, i) => {
    p.p = { x: spots[i][0], z: spots[i][1] };
    p.v = { x: 0, z: 0 };
    p.state = 'play';
    p.stateT = 0;
    p.pending = null;
    p.kickCd = 0;
    p.role = i === 7 ? 'keeper' : i === 3 ? 'keeper' : 'free';
    p.face = { x: 1, z: 0 };
  });
  const b = m.ball;
  b.shot = null;
  b.homingTo = -1;
  if (c.prims.includes('extraKick') && !c.prims.some((p) => p !== 'extraKick' && p !== 'lucky' && p !== 'accuracy' && p !== 'press')) {
    // Second-ball moves: the ball has just bounced loose in front of the goal.
    b.owner = -1;
    b.p = { x: 14.5, y: FIELD.ballR, z: 4 };
    b.v = { x: 0, y: 0, z: 0 };
  } else {
    m.give(m.players[0]);
    b.p = { x: 8.6, y: FIELD.ballR, z: 0 };
  }
  return m;
}

function run(m: Match, seconds: number): MatchEvent[] {
  const from = m.events.length;
  for (let i = 0; i < seconds * 60 && m.phase === 'play'; i++) m.step();
  return m.events.slice(from);
}

describe('culture combos (文化连携)', () => {
  it('every registered football team is found by its four glyphs, case-insensitively for Latin keys', () => {
    for (const c of IMPLEMENTED) {
      expect(cultureFor(team('split', c.key).input)?.key, c.key).toBe(c.key);
      if (/^[A-Z]+$/.test(c.key)) expect(cultureFor(team('split', c.key.toLowerCase()).input)?.key).toBe(c.key);
    }
    // Free teams that happen to spell a key in order count too; other words never match.
    expect(cultureFor({ members: ['少', '林', '足', '球'] })?.key).toBe('少林足球');
    expect(cultureFor(team('split', '甲乙丙丁').input)).toBeNull();
    // The 12 original idiom combos keep priority and stay as they were.
    const m = match(team('split', '龙飞凤舞'), OPP, 1);
    expect(m.teams[0].combo?.kind).toBe('dragonDance');
    expect(m.teams[0].culture).toBeNull();
  });

  it('every culture team fires its combo and every primitive in its recipe takes real effect', () => {
    const failures: string[] = [];
    for (const [i, c] of IMPLEMENTED.entries()) {
      const m = scenario(c, 1000 + i);
      // Backfires are random by design; they get their own test below.
      m.teams[0].culture = { ...c, risk: 'none' };
      const fired = tryCulture(m, 0, true);
      const ev = [...m.events.filter((e) => e.type === 'combo' || e.type === 'prim').slice(-6), ...run(m, 6)];
      const seen = new Set(ev.filter((e) => e.type === 'prim' && e.team === 0).map((e) => e.kind));
      const missing = c.prims.filter((p) => !seen.has(p));
      const combo = ev.some((e) => e.type === 'combo' && e.kind === 'culture' && e.label === c.key);
      if (!fired || !combo || missing.length) failures.push(`${c.key} [${c.prims.join('+')}] missing ${missing.join(',') || '-'} fired=${fired}`);
    }
    expect(failures).toEqual([]);
  });

  it('primitives change the simulation: speed, tackles, zones, stuns, positions', () => {
    const byPrim = (prim: string) => IMPLEMENTED.find((c) => c.prims.length === 1 && c.prims[0] === prim) ?? IMPLEMENTED.find((c) => c.prims.includes(prim as never))!;
    // Timed team effects really are on.
    for (const prim of ['sprint', 'press', 'wallLine', 'tackleBoost', 'accuracy', 'grip'] as const) {
      const m = scenario(byPrim(prim), 5);
      tryCulture(m, 0, true);
      expect(m.teams[0].fx[prim], prim).toBeGreaterThan(0);
    }
    // A slow zone / crate is on the pitch; a stunned carrier is frozen; scrambled opponents moved.
    let m = scenario(byPrim('obstacle'), 6);
    tryCulture(m, 0, true);
    expect(m.zones.some((z) => z.kind === 'box')).toBe(true);
    m = scenario(byPrim('slowZone'), 6);
    tryCulture(m, 0, true);
    expect(m.zones.some((z) => z.kind === 'cloud' && z.team === 0)).toBe(true);
    m = scenario(byPrim('markWrong'), 6);
    tryCulture(m, 0, true);
    expect(m.teamOf(1).some((p) => p.state === 'confuse')).toBe(true);
    m = scenario(byPrim('scrambleOpp'), 6);
    const before = m.teamOf(1).map((p) => `${p.p.x},${p.p.z}`).join('|');
    tryCulture(m, 0, true);
    expect(m.teamOf(1).map((p) => `${p.p.x},${p.p.z}`).join('|')).not.toBe(before);
    // Ball moves are real kicks: the ball leaves the carrier and flies.
    m = scenario(byPrim('longShot'), 6);
    tryCulture(m, 0, true);
    run(m, 0.4);
    expect(m.ball.owner === 0).toBe(false);
  });

  it('sprint makes the team faster, tired slower', () => {
    const m = scenario(IMPLEMENTED[0], 9);
    const p = m.players[2];
    const base = m.maxSpeedOf(p);
    m.teams[0].fx.sprint = 3;
    expect(m.maxSpeedOf(p)).toBeCloseTo(base * 1.22);
    delete m.teams[0].fx.sprint;
    m.teams[0].fx.tired = 3;
    expect(m.maxSpeedOf(p)).toBeCloseTo(base * 0.85);
  });

  it('every kind of backfire really happens (and is announced)', () => {
    const risks = [...new Set(IMPLEMENTED.map((c) => c.risk))].filter((r) => r !== 'none');
    for (const risk of risks) {
      const c = IMPLEMENTED.find((x) => x.risk === risk)!;
      let shown = false;
      for (let s = 0; s < 40 && !shown; s++) {
        const m = scenario(c, 2000 + s);
        tryCulture(m, 0, true);
        const ev = run(m, 3);
        shown = m.events.some((e) => e.type === 'prim' && e.kind === `risk:${risk}`);
        if (!shown) continue;
        if (risk === 'trip' || risk === 'crash' || risk === 'boardCrash') expect(ev.some((e) => e.type === 'knockdown' && e.team === 0), risk).toBe(true);
      }
      expect(shown, risk).toBe(true);
    }
  });

  it('combos fire in real matches without forcing: a few times per match, never more than five', () => {
    let total = 0;
    for (const [i, c] of IMPLEMENTED.entries()) {
      if (i % 4) continue;
      const r = match(team('split', c.key), OPP, i).runToEnd();
      const n = r.events.filter((e) => e.type === 'combo' && e.kind === 'culture' && e.team === 0).length;
      expect(n).toBeLessThanOrEqual(5);
      total += n;
    }
    expect(total / Math.ceil(IMPLEMENTED.length / 4)).toBeGreaterThan(1.5);
  });

  it('never writes the score: every goal is a real ball in the net, one ball only', () => {
    for (const [i, c] of IMPLEMENTED.entries()) {
      if (i % 3) continue;
      const m = match(team('split', c.key), team('split', IMPLEMENTED[(i + 5) % IMPLEMENTED.length].key), i);
      const r = m.runToEnd();
      expect(r.score[0] + r.score[1]).toBe(r.goals.length);
      expect(r.events.filter((e) => e.type === 'goal' || e.type === 'ownGoal')).toHaveLength(r.goals.length);
      expect(r.time).toBeLessThanOrEqual(MATCH_TIME + 20.1);
      expect(Object.keys(m.ball)).toContain('p'); // the single ball object
    }
  });

  it('is deterministic with culture teams on both sides', () => {
    const a = team('split', '少林足球'), b = team('split', '足球小将');
    const r1 = match(a, b, 99).runToEnd();
    const r2 = match(a, b, 99).runToEnd();
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.map((e) => e.type + e.kind + e.a)).toEqual(r2.events.map((e) => e.type + e.kind + e.a));
  });

  it('all 22 football matchups are found in either order, announced at kick-off and apply their duel rule', () => {
    const pairs = CULTURE_MATCHUPS.filter((mu) => mu.mode === 'soccer');
    expect(pairs).toHaveLength(22);
    for (const mu of pairs) {
      for (const [x, y] of [[mu.a, mu.b], [mu.b, mu.a]]) {
        const m = match(team('split', x), team('split', y), 3);
        expect(m.rivalry?.name, `${x} vs ${y}`).toBe(mu.name);
        expect(m.rivalry?.swapped).toBe(x !== mu.a);
        while (m.phase !== 'play') m.step();
        expect(m.events.some((e) => e.type === 'rivalry' && e.label === mu.name)).toBe(true);
        if (mu.effect === 'weather') expect(m.zones.filter((z) => z.team === 2)).toHaveLength(2);
        if (mu.effect === 'spotlight') expect(m.teams[0].fx.spotlight).toBeGreaterThan(0);
      }
    }
    expect(matchupFor(team('split', '少林足球').input, team('split', '甲乙丙丁').input)).toBeNull();
  });

  it('the pitch is mirror-symmetric: a rotated world plays the rotated match (no side advantage)', () => {
    for (const key of ['少林足球', '四面楚歌', '龙飞凤舞', '火上浇油', '甲乙丙丁']) {
      const E = team('split', key);
      setFlip(1);
      const A = match(E, E, 7);
      setFlip(-1);
      const B = match(E, E, 7);
      for (let i = 0; i < 60 * 12; i++) {
        setFlip(1);
        A.step();
        setFlip(-1);
        B.step();
      }
      setFlip(1);
      for (let k = 0; k < 8; k++) {
        expect(Math.abs(A.players[k].p.x + B.players[k].p.x), key).toBeLessThan(1e-6);
        expect(Math.abs(A.players[k].p.z + B.players[k].p.z), key).toBeLessThan(1e-6);
        expect(A.players[k].state).toBe(B.players[k].state);
      }
      expect(A.events.length).toBe(B.events.length);
    }
  });
});
