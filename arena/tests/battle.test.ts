import { describe, expect, it } from 'vitest';
import { ARENA, BATTLE_TIME, BattleSimulator, EPILOGUE_TIME, INTRO_TIME } from '../src/core/battle/BattleSimulator';
import { MOVE_TABLE } from '@shared/core/SignatureMoves';
import { ROSTER, SHAPES, specFor } from '@shared-tests/helpers';

const ARENA_HALF = ARENA.half;
const specs = ROSTER.map(([t, s]) => specFor(t, s));

describe('BattleSimulator', () => {
  it('is deterministic for the same specs and seed', () => {
    const r1 = new BattleSimulator([specs[0], specs[1]], 1234).runToEnd();
    const r2 = new BattleSimulator([specs[0], specs[1]], 1234).runToEnd();
    expect(r1.winner).toBe(r2.winner);
    expect(r1.reason).toBe(r2.reason);
    expect(r1.time).toBe(r2.time);
    expect(r1.events.length).toBe(r2.events.length);
  });

  it('always terminates with a sane result, never NaN, within the time budget', () => {
    const maxSteps = Math.ceil((INTRO_TIME + BATTLE_TIME + EPILOGUE_TIME) * 60) + 5;
    let n = 0;
    for (let i = 0; i < specs.length; i++) {
      for (let j = 0; j < specs.length; j += 3) {
        const sim = new BattleSimulator([specs[i], specs[j]], i * 977 + j);
        const r = sim.runToEnd();
        n++;
        expect(sim.phase).toBe('done');
        expect(sim.steps).toBeLessThanOrEqual(maxSteps);
        expect(r.time).toBeLessThanOrEqual(BATTLE_TIME + 0.05);
        for (const f of sim.fighters) {
          expect(Number.isFinite(f.p.x) && Number.isFinite(f.p.z) && Number.isFinite(f.y)).toBe(true);
          expect(Number.isFinite(f.tilt.x) && Number.isFinite(f.hp)).toBe(true);
        }
        if (r.reason !== 'draw') expect(r.winner === 0 || r.winner === 1).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('produces varied outcomes and a mirror match is roughly fair', () => {
    const tally = { ko: 0, ringout: 0, timeup: 0, draw: 0 };
    let winsA = 0, total = 0, timeSum = 0, hits = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      const sp = specs[s % specs.length];
      const r = new BattleSimulator([sp, sp], s * 31 + 7).runToEnd();
      tally[r.reason]++;
      timeSum += r.time;
      hits += r.counters[0].hits + r.counters[1].hits;
      if (r.winner === 0) winsA++;
      if (r.winner !== null) total++;
    }
    const share = winsA / total;
    console.log('mirror outcomes', tally, 'A share', share.toFixed(2), 'avg time', (timeSum / N).toFixed(1), 'avg hits', (hits / N).toFixed(1));
    expect(share).toBeGreaterThan(0.38);
    expect(share).toBeLessThan(0.62);
    // Not everything should end the same way.
    expect(tally.ko + tally.ringout).toBeGreaterThan(N * 0.3);
    expect(tally.timeup).toBeGreaterThan(0);
    expect(timeSum / N).toBeGreaterThan(5);
  });

  it('no fighter in the roster is unbeatable', () => {
    const wins = new Map<string, number>();
    const games = new Map<string, number>();
    for (let i = 0; i < specs.length; i++) {
      for (let j = 0; j < specs.length; j++) {
        if (i === j) continue;
        for (let s = 0; s < 3; s++) {
          const r = new BattleSimulator([specs[i], specs[j]], i * 100 + j * 7 + s).runToEnd();
          for (const k of [0, 1] as const) {
            const name = specs[k === 0 ? i : j].name;
            games.set(name, (games.get(name) ?? 0) + 1);
            if (r.winner === k) wins.set(name, (wins.get(name) ?? 0) + 1);
          }
        }
      }
    }
    const rates = [...games.keys()].map((k) => [k, (wins.get(k) ?? 0) / games.get(k)!] as const).sort((a, b) => b[1] - a[1]);
    console.log('win rates', rates.map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`).join(' '));
    expect(rates[0][1]).toBeLessThan(0.85);
    expect(rates[rates.length - 1][1]).toBeGreaterThan(0.12);
  });

  it('runs fast enough headless (perf smoke test)', () => {
    const t0 = performance.now();
    let steps = 0;
    for (let s = 0; s < 100; s++) {
      const sim = new BattleSimulator([specs[s % specs.length], specs[(s * 7) % specs.length]], s);
      sim.runToEnd();
      steps += sim.steps;
    }
    const ms = performance.now() - t0;
    console.log(`100 battles, ${steps} steps in ${ms.toFixed(0)} ms → ${((ms / steps) * 1000).toFixed(1)} µs/step`);
    // A real-time match needs 60 steps per second; demand >100× headroom.
    expect(ms / steps).toBeLessThan(0.16);
  });

  it('nobody ends up under the ring: a fighter below the canvas is always a ring-out', () => {
    // Regression: a fighter that slid off the edge used to be pushed back under the platform by the
    // ropes, then fell forever without a ring-out (invisible, match not decided).
    const shapes = Object.keys(SHAPES) as (keyof typeof SHAPES)[];
    const all = [...specs, ...MOVE_TABLE.map((e, i) => specFor(e.keys[0], shapes[i % shapes.length]))];
    const bad: string[] = [];
    for (let i = 0; i < 1500; i++) {
      const sim = new BattleSimulator([all[(i * 7) % all.length], all[(i * 13 + 5) % all.length]], i);
      while (sim.phase !== 'done' && sim.steps < 6000) {
        sim.step();
        for (const f of sim.fighters) {
          if (f.out || f.swallowedBy >= 0) continue;
          const over = Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) <= ARENA_HALF;
          if ((over && f.y < -0.3) || f.y < -0.95) bad.push(`${f.spec.name} seed ${i} y=${f.y.toFixed(2)}`);
        }
      }
      if (sim.phase !== 'done') bad.push(`seed ${i} never ended`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 30000);
});
