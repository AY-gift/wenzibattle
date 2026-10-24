import { describe, expect, it } from 'vitest';
import { SOCCER_COMBOS } from '@shared/sports/combos';
import { SKILL_USE, SPORT_SKILL_KINDS, type SportSkillKind } from '@shared/sports/skills';
import { buildReport, decodeResult, encodeResult, highlightOf } from '../src/report';
import { FIELD, MATCH_TIME, GOLDEN_GOAL_TIME, TEAM_SIZE, type MatchResult } from '../src/sim/types';
import { match, team } from './lineups';

const LINEUPS = {
  dragon: team('split', '龙飞凤舞'),
  calm: team('split', '风平浪静'),
  fuel: team('split', '火上浇油'),
  snake: team('split', '画蛇添足'),
  family: team('free', ['妈妈', '爸爸', '宝宝', '奶奶']),
  elements: team('free', ['火', '水', '雷', '风']),
  unknown: team('split', '甲乙丙丁'),
  mixed: team('free', ['🐱', 'ねこ', '(・ω・)', 'お母さん']),
};

function check(r: MatchResult, m: ReturnType<typeof match>): void {
  expect(r.score[0] + r.score[1]).toBe(r.goals.length);
  expect(r.events.filter((e) => e.type === 'goal' || e.type === 'ownGoal')).toHaveLength(r.goals.length);
  for (const team of [0, 1] as const) expect(r.goals.filter((g) => g.team === team)).toHaveLength(r.score[team]);
  expect(r.winner).toBe(r.score[0] === r.score[1] ? null : r.score[0] > r.score[1] ? 0 : 1);
  expect(r.time).toBeLessThanOrEqual(MATCH_TIME + GOLDEN_GOAL_TIME + 0.1);
  for (const p of m.players) {
    expect(Number.isFinite(p.p.x) && Number.isFinite(p.p.z)).toBe(true);
    expect(Math.abs(p.p.x)).toBeLessThanOrEqual(FIELD.halfL);
    expect(Math.abs(p.p.z)).toBeLessThanOrEqual(FIELD.halfW);
  }
  const b = m.ball.p;
  expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)).toBe(true);
  expect(Math.abs(b.x)).toBeLessThanOrEqual(FIELD.halfL + FIELD.goalDepth + 0.01);
  expect(Math.abs(b.z)).toBeLessThanOrEqual(FIELD.halfW);
}

describe('Glyph Soccer 4v4', () => {
  it('plays the design-doc matchups from kick-off to full time (4v4, words kept whole)', () => {
    const pairs: [keyof typeof LINEUPS, keyof typeof LINEUPS][] = [['dragon', 'calm'], ['fuel', 'snake'], ['family', 'elements'], ['unknown', 'mixed']];
    for (const [a, b] of pairs) {
      const m = match(LINEUPS[a], LINEUPS[b], 42);
      expect(m.players).toHaveLength(TEAM_SIZE * 2);
      expect(m.teamOf(0)).toHaveLength(4);
      expect(m.teamOf(1)).toHaveLength(4);
      const r = m.runToEnd();
      expect(m.phase).toBe('done');
      check(r, m);
    }
    // Split idioms are four players; free teams keep whole words with their own moves.
    expect(LINEUPS.dragon.input.members).toEqual(['龙', '飞', '凤', '舞']);
    const fam = match(LINEUPS.family, LINEUPS.elements, 1);
    expect(fam.players[0].spec.name).toBe('妈妈');
    expect(fam.players[0].spec.signature.name.zh).toBe('吃饭啦！');
    expect(fam.players[0].skill.kind).toBe('steal');
    expect(fam.players[4].skill).toMatchObject({ kind: 'powerShot', move: 'fireCharge' }); // 火 keeps its fire
    expect(match(LINEUPS.mixed, LINEUPS.unknown, 1).players.map((p) => p.spec.name)).toEqual(['🐱', 'ねこ', '(・ω・)', 'お母さん', '甲', '乙', '丙', '丁']);
  });

  it('is deterministic for the same lineup and seed', () => {
    const r1 = match(LINEUPS.dragon, LINEUPS.family, 777).runToEnd();
    const r2 = match(LINEUPS.dragon, LINEUPS.family, 777).runToEnd();
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.mvp).toBe(r2.mvp);
  });

  it('the AI really plays football: passes, shots, saves, tackles and goals', () => {
    const totals = { pass: 0, shot: 0, save: 0, tackleWin: 0, goal: 0, intercept: 0, kickoff: 0 };
    const keys = Object.keys(LINEUPS) as (keyof typeof LINEUPS)[];
    let scoreless = 0;
    for (let i = 0; i < 24; i++) {
      const m = match(LINEUPS[keys[i % keys.length]], LINEUPS[keys[(i * 3 + 1) % keys.length]], i + 100);
      const r = m.runToEnd();
      check(r, m);
      if (!r.goals.length) scoreless++;
      for (const e of r.events) if (e.type in totals) totals[e.type as keyof typeof totals]++;
      expect(r.events.filter((e) => e.type === 'shot').length).toBeGreaterThan(0);
    }
    expect(totals.pass / 24).toBeGreaterThan(30);
    expect(totals.shot / 24).toBeGreaterThan(6);
    expect(totals.save / 24).toBeGreaterThan(2);
    expect(totals.tackleWin / 24).toBeGreaterThan(5);
    expect(totals.goal / 24).toBeGreaterThan(2);
    expect(totals.goal / 24).toBeLessThan(10);
    expect(scoreless).toBeLessThan(4);
    // Every goal is followed by a fresh kick-off (except the last one of the match).
    expect(totals.kickoff).toBeGreaterThanOrEqual(totals.goal);
  });

  it('a mirror match is fair (no side advantage)', () => {
    let wins0 = 0, decided = 0;
    for (let s = 0; s < 80; s++) {
      const r = match(LINEUPS.elements, LINEUPS.elements, s * 7 + 3).runToEnd();
      if (r.winner !== null) {
        decided++;
        if (r.winner === 0) wins0++;
      }
    }
    expect(wins0 / decided).toBeGreaterThan(0.35);
    expect(wins0 / decided).toBeLessThan(0.65);
  });

  it('a level score goes to a 20 s golden goal, then a draw', () => {
    let golden = 0;
    for (let s = 0; s < 120 && golden < 3; s++) {
      const m = match(LINEUPS.calm, LINEUPS.unknown, s);
      const r = m.runToEnd();
      if (!r.goldenGoal) continue;
      golden++;
      expect(r.events.some((e) => e.type === 'goldenGoal')).toBe(true);
      if (r.winner === null) expect(r.time).toBeGreaterThanOrEqual(MATCH_TIME + GOLDEN_GOAL_TIME - 0.1);
      else expect(r.goals[r.goals.length - 1].t).toBeGreaterThanOrEqual(MATCH_TIME);
    }
    expect(golden).toBeGreaterThan(0);
  });

  it('every registered idiom fires its team combo; unregistered teams never do', () => {
    for (const c of SOCCER_COMBOS) {
      const idiom = team('split', c.keys[0]);
      let fired = 0;
      for (let s = 0; s < 14 && !fired; s++) {
        const r = match(idiom, LINEUPS.elements, s * 11 + 5).runToEnd();
        fired += r.events.filter((e) => e.type === 'combo' && e.team === 0 && e.kind === c.kind).length;
      }
      expect(fired, c.keys[0]).toBeGreaterThan(0);
    }
    for (const s of [1, 2, 3]) {
      const r = match(LINEUPS.unknown, LINEUPS.family, s).runToEnd();
      expect(r.events.filter((e) => e.type === 'combo')).toHaveLength(0);
    }
  });

  it('every sport version of a special move fires in real matches without breaking anything', () => {
    for (const kind of SPORT_SKILL_KINDS) {
      let fired = 0;
      for (let s = 0; s < 10 && fired < 1; s++) {
        const m = match(LINEUPS.unknown, LINEUPS.calm, s * 13 + 1);
        for (const p of m.teamOf(0)) p.skill = { ...p.skill, kind: kind as SportSkillKind, use: SKILL_USE[kind as SportSkillKind], move: 'quake', disable: kind === 'disable' ? 'sleep' : undefined };
        const r = m.runToEnd();
        check(r, m);
        fired += r.events.filter((e) => e.type === 'skill' && e.team === 0 && e.kind === kind).length;
      }
      expect(fired, kind).toBeGreaterThan(0);
    }
  });

  it('report and result code describe the real match', () => {
    const m = match(LINEUPS.dragon, LINEUPS.fuel, 9);
    const r = m.runToEnd();
    const goalLines = buildReport(r).filter((l) => l.key.startsWith('goal'));
    expect(goalLines).toHaveLength(Math.min(14, r.goals.length));
    const code = { score: r.score, golden: r.goldenGoal, time: r.time, mvp: r.mvp, highlight: highlightOf(r) };
    const back = decodeResult(encodeResult(code), () => true)!;
    expect(back.score).toEqual(r.score);
    expect(back.mvp).toBe(r.mvp);
    expect(back.golden).toBe(r.goldenGoal);
    expect(back.highlight?.key).toBe(code.highlight?.key);
    expect(decodeResult('1.3.2.0.1200.99', () => true)).toBeNull();
    expect(decodeResult('2.3.2.0.1200.1', () => true)).toBeNull();
    expect(decodeResult('1.3.2.0.1200.1.<b>.0.1', () => true)?.highlight).toBeNull();
  });

  it('is fast enough to never be the bottleneck', () => {
    const t0 = performance.now();
    let steps = 0;
    for (let s = 0; s < 10; s++) {
      const m = match(LINEUPS.dragon, LINEUPS.family, s);
      m.runToEnd();
      steps += m.steps;
    }
    const msPerStep = (performance.now() - t0) / steps;
    // 60 steps per real second; demand > 100× headroom.
    expect(msPerStep).toBeLessThan(0.16);
  });
});
