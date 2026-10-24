import { describe, expect, it } from 'vitest';
import { SKILL_USE, SPORT_SKILL_KINDS, type SportSkillKind } from '@shared/sports/skills';
import { fightStyleOf } from '../src/sim/brawl';
import { COURT, GAME_TIME, OVERTIME, TEAM_SIZE, type MatchResult } from '../src/sim/types';
import { match, team } from './lineups';

const L = {
  iceFire: team('split', '冰火'),
  bros: team('split', '兄弟'),
  family: team('free', ['妈妈', '404']),
  elements: team('free', ['火', '水']),
  unknown: team('split', '甲乙'),
  mixed: team('free', ['🐱', 'ねこ']),
};
const KEYS = Object.keys(L) as (keyof typeof L)[];

function check(r: MatchResult, m: ReturnType<typeof match>): void {
  expect(r.score[0] + r.score[1]).toBe(r.scores.reduce((s, x) => s + x.points, 0));
  expect(r.events.filter((e) => e.type === 'score')).toHaveLength(r.scores.length);
  for (const t of [0, 1] as const) expect(r.scores.filter((s) => s.team === t).reduce((s, x) => s + x.points, 0)).toBe(r.score[t]);
  for (const s of r.scores) expect([2, 3]).toContain(s.points);
  expect(r.winner).toBe(r.score[0] === r.score[1] ? null : r.score[0] > r.score[1] ? 0 : 1);
  expect(r.time).toBeLessThanOrEqual(GAME_TIME + OVERTIME + 3.1);
  for (const p of m.players) {
    expect(Number.isFinite(p.p.x) && Number.isFinite(p.p.z) && Number.isFinite(p.y)).toBe(true);
    expect(Math.abs(p.p.x)).toBeLessThanOrEqual(COURT.halfL);
    expect(Math.abs(p.p.z)).toBeLessThanOrEqual(COURT.halfW);
  }
  const b = m.ball.p;
  expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)).toBe(true);
  expect(Math.abs(b.x)).toBeLessThanOrEqual(COURT.halfL);
  expect(Math.abs(b.z)).toBeLessThanOrEqual(COURT.halfW);
}

describe('Glyph Basketball 2v2', () => {
  it('plays from tip-off to the final buzzer, 2v2, words kept whole', () => {
    for (const [a, b] of [['iceFire', 'bros'], ['family', 'elements'], ['unknown', 'mixed']] as const) {
      const m = match(L[a], L[b], 42);
      expect(m.players).toHaveLength(TEAM_SIZE * 2);
      const r = m.runToEnd();
      expect(m.phase).toBe('done');
      expect(r.events.some((e) => e.type === 'tipoff')).toBe(true);
      check(r, m);
    }
    expect(L.iceFire.input.members).toEqual(['冰', '火']);
    expect(match(L.family, L.mixed, 1).players.map((p) => p.spec.name)).toEqual(['妈妈', '404', '🐱', 'ねこ']);
  });

  it('is deterministic for the same lineup and seed', () => {
    const r1 = match(L.iceFire, L.family, 777).runToEnd();
    const r2 = match(L.iceFire, L.family, 777).runToEnd();
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.map((e) => e.type + e.a)).toEqual(r2.events.map((e) => e.type + e.a));
  });

  it('the AI plays basketball: passes, shots, threes, dunks, rebounds, steals and blocks', () => {
    const tot: Record<string, number> = {};
    let pts = 0, games = 0;
    for (let i = 0; i < 30; i++) {
      const m = match(L[KEYS[i % KEYS.length]], L[KEYS[(i * 5 + 1) % KEYS.length]], i + 100);
      const r = m.runToEnd();
      check(r, m);
      games++;
      pts += r.score[0] + r.score[1];
      for (const e of r.events) tot[e.type] = (tot[e.type] ?? 0) + 1;
      tot.three = (tot.three ?? 0) + r.scores.filter((s) => s.points === 3).length;
    }
    expect(pts / games).toBeGreaterThan(12);
    expect(pts / games).toBeLessThan(45);
    expect(tot.pass / games).toBeGreaterThan(8);
    expect(tot.shot / games).toBeGreaterThan(6);
    expect(tot.dunk / games).toBeGreaterThan(1);
    expect(tot.three / games).toBeGreaterThan(0.5);
    expect(tot.rebound / games).toBeGreaterThan(2);
    expect(tot.steal / games).toBeGreaterThan(1);
    expect(tot.block / games).toBeGreaterThan(0.5);
    expect(tot.rim / games).toBeGreaterThan(2);
  });

  it('made shots go through the rim from above; threes only from beyond the arc', () => {
    for (let s = 0; s < 8; s++) {
      const m = match(L.elements, L.unknown, s);
      let prevY = m.ball.p.y;
      while (m.phase !== 'done') {
        const before = m.events.length;
        m.step();
        for (const e of m.events.slice(before)) {
          // (A basket that ties it at the buzzer starts overtime in the same step: the ball is already back at centre.)
          if (e.type !== 'score' || m.phase === 'intro') continue;
          // The ball is at the rim when the basket counts, and it was coming down.
          expect(prevY).toBeGreaterThanOrEqual(COURT.rimH - 0.05);
          expect(Math.abs(Math.abs(m.ball.p.x) - COURT.hoopX)).toBeLessThan(COURT.rimR);
        }
        prevY = m.ball.p.y;
      }
      for (const e of m.events.filter((x) => x.type === 'shot' && x.v === 3)) {
        const hx = (e.team === 0 ? 1 : -1) * COURT.hoopX;
        expect(Math.hypot((e.x ?? 0) - hx, e.z ?? 0)).toBeGreaterThan(COURT.threeR);
      }
    }
  });

  it('a mirror match is fair (no side advantage)', () => {
    let w0 = 0, decided = 0;
    for (let s = 0; s < 120; s++) {
      const r = match(L.elements, L.elements, s * 7 + 3).runToEnd();
      if (r.winner !== null) {
        decided++;
        if (r.winner === 0) w0++;
      }
    }
    expect(w0 / decided).toBeGreaterThan(0.38);
    expect(w0 / decided).toBeLessThan(0.62);
  });

  it('a tie goes to one 15 s overtime, then may end level', () => {
    let ot = 0;
    for (let s = 0; s < 200 && ot < 2; s++) {
      const r = match(L.unknown, L.mixed, s).runToEnd();
      if (!r.overtime) continue;
      ot++;
      expect(r.events.some((e) => e.type === 'overtime')).toBe(true);
      expect(r.time).toBeGreaterThanOrEqual(GAME_TIME + OVERTIME - 0.1);
      expect(r.events.filter((e) => e.type === 'tipoff' && e.a < 0)).toHaveLength(2);
    }
    expect(ot).toBeGreaterThan(0);
  });

  it('the shot clock forces a shot or hands the ball over', () => {
    const m = match(L.elements, L.unknown, 3);
    while (m.phase !== 'play' || m.ball.owner < 0) m.step();
    const team0 = m.players[m.ball.owner].team;
    // Freeze the offence: nobody may act, the 12 s run out.
    for (const p of m.teamOf(team0)) p.actCd = 99;
    m.teams[team0].shotClock = 0.05;
    for (let i = 0; i < 10; i++) m.step();
    expect(m.events.some((e) => e.type === 'shotClock')).toBe(true);
    expect(m.carrier()?.team).not.toBe(team0);
  });

  it('every basketball version of a special move fires without breaking anything', () => {
    for (const kind of SPORT_SKILL_KINDS) {
      let fired = 0;
      for (let s = 0; s < 14 && !fired; s++) {
        const m = match(L.unknown, L.mixed, s * 13 + 1);
        for (const p of m.teamOf(0)) p.skill = { ...p.skill, kind: kind as SportSkillKind, use: SKILL_USE[kind as SportSkillKind], move: 'quake', disable: kind === 'disable' ? 'sleep' : undefined };
        const r = m.runToEnd();
        check(r, m);
        fired += r.events.filter((e) => e.type === 'skill' && e.team === 0 && e.kind === kind).length;
      }
      expect(fired, kind).toBeGreaterThan(0);
    }
  });

  it('arena fights happen now and then with the attacker’s own move; nobody freezes on the ball', () => {
    let fights = 0, holds = 0;
    for (let s = 0; s < 20; s++) {
      const m = match(L[KEYS[s % KEYS.length]], L[KEYS[(s + 2) % KEYS.length]], s + 300);
      let owner = -1, since = 0;
      while (m.phase !== 'done') {
        m.step();
        if (m.phase !== 'play' || m.ball.owner !== owner) {
          owner = m.phase === 'play' ? m.ball.owner : -1;
          since = m.t;
          continue;
        }
        const p = owner >= 0 ? m.players[owner] : null;
        if (p) expect(!p.pending || p.state === 'shoot' || p.state === 'pass' || p.state === 'dunk').toBe(true);
        if (p && m.t - since > 7) holds++;
      }
      for (const e of m.events.filter((x) => x.type === 'fight')) {
        fights++;
        expect(e.label).toBe(m.players[e.a].spec.signature.kind);
        expect(e.kind).toBe(fightStyleOf(m.players[e.a].spec.signature.kind));
      }
    }
    expect(holds).toBe(0);
    expect(fights / 20).toBeGreaterThan(1);
    expect(fights / 20).toBeLessThan(20);
  });

  it('is fast enough to never be the bottleneck', () => {
    const t0 = performance.now();
    let steps = 0;
    for (let s = 0; s < 10; s++) {
      const m = match(L.iceFire, L.family, s);
      m.runToEnd();
      steps += m.steps;
    }
    expect((performance.now() - t0) / steps).toBeLessThan(0.16);
  });
});
