import { describe, expect, it } from 'vitest';
import { fightStyleOf } from '../src/sim/brawl';
import { match, team } from './lineups';

const L = [team('split', '龙飞凤舞'), team('split', '风平浪静'), team('free', ['妈妈', '爸爸', '宝宝', '奶奶']), team('free', ['火', '水', '雷', '风']), team('split', '少林足球'), team('split', '甲乙丙丁')];

describe('arena-style fights on the pitch', () => {
  it('players attack each other with their arena move now and then; hits knock down, misses whiff', () => {
    let fights = 0, hits = 0, brawls = 0, matches = 0;
    for (let s = 0; s < 24; s++) {
      const m = match(L[s % L.length], L[(s + 2) % L.length], s);
      const r = m.runToEnd();
      matches++;
      for (const e of r.events) {
        if (e.type === 'fight') {
          fights++;
          const p = m.players[e.a];
          // The move shown is the attacker's own arena special move.
          expect(e.label).toBe(p.spec.signature.kind);
          expect(e.kind).toBe(fightStyleOf(p.spec.signature.kind));
          expect(m.players[e.b!].team).not.toBe(p.team);
        }
        if (e.type === 'fightHit') {
          hits++;
          // A hit always floors (or freezes) at least one opponent at that moment.
          expect(e.v ?? 0).toBeGreaterThan(0);
          const floored = r.events.some((k) => k.type === 'knockdown' && k.team !== e.team && Math.abs(k.t - e.t) < 0.02);
          if (m.players[e.a].spec.signature.kind && fightStyleOf(m.players[e.a].spec.signature.kind) !== 'freeze') expect(floored).toBe(true);
        }
        if (e.type === 'brawl') brawls++;
      }
    }
    // Football stays the main thing: a handful of fights per match, at most one brawl.
    expect(fights / matches).toBeGreaterThan(4);
    expect(fights / matches).toBeLessThan(25);
    expect(hits).toBeGreaterThan(0);
    expect(brawls).toBeGreaterThan(0);
    expect(brawls).toBeLessThanOrEqual(matches);
  });

  it('nobody stands on the ball doing nothing (old stale-kick freeze at the boards)', () => {
    let holds = 0;
    for (let s = 0; s < 30; s++) {
      const m = match(L[s % L.length], L[(s + 3) % L.length], s + 500);
      let owner = -1, since = 0;
      while (m.phase !== 'done') {
        m.step();
        if (m.phase !== 'play' || m.ball.owner !== owner) {
          owner = m.phase === 'play' ? m.ball.owner : -1;
          since = m.t;
          continue;
        }
        const p = owner >= 0 ? m.players[owner] : null;
        // A wound-up kick only ever exists while kicking.
        if (p) expect(!p.pending || p.state === 'kick').toBe(true);
        if (p && m.t - since > 6) holds++;
      }
    }
    expect(holds).toBe(0);
  });
});
