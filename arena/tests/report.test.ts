import { describe, expect, it } from 'vitest';
import { BattleSimulator } from '../src/core/battle/BattleSimulator';
import { buildReport } from '../src/core/report';
import { ROSTER, specFor } from '@shared-tests/helpers';

const specs = ROSTER.map(([t, s]) => specFor(t, s));

describe('battle report', () => {
  it('always yields a finish line plus at least one highlight', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 120; s++) {
      const r = new BattleSimulator([specs[s % specs.length], specs[(s * 7 + 3) % specs.length]], s).runToEnd();
      const lines = buildReport(r);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
      for (const l of lines) keys.add(l.key);
    }
    // The comedy should vary from match to match.
    expect(keys.size).toBeGreaterThan(15);
  });

  it('explains how the match was decided', () => {
    const r = new BattleSimulator([specs[0], specs[1]], 5).runToEnd();
    const first = buildReport(r)[0];
    const expected: Record<string, string[]> = {
      ko: ['ko', 'critKO', 'wallKO', 'slamKO', 'burnKO', 'stompKO', 'selfDestruct', 'explodeFinish'],
      ringout: ['ringoutBy', 'selfRingout', 'gasRingout', 'popRingout', 'slipRingout', 'selfDestruct', 'explodeFinish'],
      timeup: ['judge', 'judgeLuck'],
      draw: ['drawKO', 'drawRingout'],
    };
    expect(expected[r.reason]).toContain(first.key);
  });
});
