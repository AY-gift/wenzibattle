/**
 * Picks the funniest, most explanatory moments of a finished battle and returns them as
 * language-neutral report lines ({key, a, b}); the UI localises them.
 */
import type { BattleEvent, BattleResult, EventType } from './battle/types';

export interface ReportLine {
  key: string;
  /** Fighter indices referenced by the template. */
  a: 0 | 1;
  b?: 0 | 1;
  n?: number;
}

const HIGHLIGHT_SCORE: Partial<Record<EventType, number>> = {
  doubleDown: 9, luckyDodge: 9, trip: 9, upset: 9, laughFall: 9, wallCrash: 8, steam: 8, playDead: 8,
  slip: 8, rudeAwakening: 8, explode: 8, pop: 7, slingshot: 8, ropeBounce: 4, panic: 7, revive: 6, gas: 6, charm: 6,
  dizzy: 6, stomp: 6, slam: 6, fooled: 6, zap: 5, sleep: 5, burn: 4, crit: 4, surprise: 5, taunt: 3,
  clash: 5, elementBonus: 4, dodge: 2,
  signature: 7, reflect: 9, bribe: 8, throw: 8, lecture: 8, joke: 9, freeze: 7, giant: 7, quake: 6, chomp: 6, magnet: 6, confuse: 9,
  swallow: 9, blameReflect: 9, soot: 8, vanish: 7, lazy: 6, tremor: 6,
};

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

export function buildReport(r: BattleResult): ReportLine[] {
  const lines: ReportLine[] = [];
  const ev = r.events;
  const finishLine = describeFinish(r);
  lines.push(finishLine);

  const used = new Set<string>([finishLine.key]);
  const cands: { line: ReportLine; score: number; t: number }[] = [];
  const firstOf = new Set<string>();
  for (const e of ev) {
    let score = HIGHLIGHT_SCORE[e.type];
    if (!score) continue;
    if (e.type === 'gas' && !e.v) {
      score = 5;
      cands.push({ line: { key: 'gasMiss', a: e.a, b: e.b }, score, t: e.t });
      continue;
    }
    // Moves that can whiff only make the report when they landed.
    if ((e.type === 'bribe' || e.type === 'lecture' || e.type === 'joke' || e.type === 'quake' || e.type === 'throw' || e.type === 'confuse') && !e.v) continue;
    if (e.type === 'luckyDodge' && !e.v) {
      cands.push({ line: { key: 'miracleDodge', a: e.a, b: e.b }, score: 7, t: e.t });
      continue;
    }
    // Bragging lines only make sense for the side that actually won.
    if ((e.type === 'elementBonus' || e.type === 'taunt' || e.type === 'crit') && r.winner !== null && e.a !== r.winner) continue;
    const dedupe = `${e.type}:${e.a}`;
    if (firstOf.has(dedupe)) continue;
    firstOf.add(dedupe);
    cands.push({ line: { key: e.type, a: e.a, b: e.b ?? other(e.a), n: e.v }, score, t: e.t });
  }
  // Derived highlights.
  if (r.winner !== null) {
    const w = r.winner;
    if (r.counters[w].minHp < 22 && r.counters[w].minHp > 0) cands.push({ line: { key: 'comeback', a: w, b: other(w) }, score: 9, t: 99 });
    if (r.hp[w] >= 99.5) cands.push({ line: { key: 'perfect', a: w, b: other(w) }, score: 7, t: 99 });
    const big = Math.max(r.counters[w].maxHit, 0);
    if (big > 24) cands.push({ line: { key: 'bigHit', a: w, b: other(w), n: Math.round(big) }, score: 5, t: 98 });
  }
  if (r.counters[0].hits + r.counters[1].hits === 0) cands.push({ line: { key: 'noHits', a: 0, b: 1 }, score: 8, t: 99 });
  const totalDowns = r.counters[0].downs + r.counters[1].downs;
  if (totalDowns >= 7) cands.push({ line: { key: 'clumsy', a: r.counters[0].downs >= r.counters[1].downs ? 0 : 1, n: totalDowns }, score: 6, t: 99 });

  cands.sort((x, y) => y.score - x.score || x.t - y.t);
  for (const c of cands) {
    if (lines.length >= 4) break;
    if (used.has(c.line.key)) continue;
    used.add(c.line.key);
    lines.push(c.line);
  }
  if (lines.length === 1) lines.push({ key: 'solid', a: r.winner ?? 0, b: other(r.winner ?? 0) });
  return lines;
}

function lastBefore(ev: BattleEvent[], t: number, pred: (e: BattleEvent) => boolean, window: number): BattleEvent | undefined {
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (e.t > t + 1e-6) continue;
    if (t - e.t > window) break;
    if (pred(e)) return e;
  }
  return undefined;
}

function describeFinish(r: BattleResult): ReportLine {
  if (r.reason === 'draw') return { key: r.drawKind === 'doubleKO' ? 'drawKO' : 'drawRingout', a: 0, b: 1 };
  const w = r.winner!;
  const l = other(w);
  const ev = r.events;
  const d = r.decisive;
  if (r.reason === 'timeup') return { key: r.luckDecided ? 'judgeLuck' : 'judge', a: w, b: l, n: Math.round(r.hp[w] - r.hp[l]) };
  const t = d?.t ?? r.time;
  const sig = lastBefore(ev, t, (e) => e.type === 'signature' && e.a === w, 1.8);
  if (sig) return { key: 'sigFinish', a: w, b: l };
  const byExplode = lastBefore(ev, t, (e) => e.type === 'explode', 2.5);
  if (byExplode) return { key: byExplode.a === l ? 'selfDestruct' : 'explodeFinish', a: byExplode.a, b: other(byExplode.a) };
  if (r.reason === 'ringout') {
    const gas = lastBefore(ev, t, (e) => e.type === 'gas' && e.a === w && !!e.v, 2.5);
    if (gas) return { key: 'gasRingout', a: w, b: l };
    const hit = lastBefore(ev, t, (e) => (e.type === 'hit' || e.type === 'crit' || e.type === 'stomp' || e.type === 'pop') && e.b === l, 2.2);
    const overRope = lastBefore(ev, t, (e) => e.type === 'overRope' && e.a === l, 2.5);
    if (hit && overRope && hit.type !== 'pop') return { key: 'overRopeBy', a: w, b: l };
    if (hit?.type === 'pop') return { key: 'popRingout', a: l, b: w };
    if (hit) return { key: 'ringoutBy', a: w, b: l };
    const slip = lastBefore(ev, t, (e) => e.type === 'slip' && e.a === l, 2.5);
    if (slip) return { key: 'slipRingout', a: l, b: w };
    return { key: 'selfRingout', a: l, b: w };
  }
  // KO
  const wall = lastBefore(ev, t, (e) => (e.type === 'wallCrash' || e.type === 'slam') && e.a === l, 0.3);
  if (wall) return { key: wall.type === 'slam' ? 'slamKO' : 'wallKO', a: l, b: w };
  const burn = lastBefore(ev, t, (e) => e.type === 'burn' && e.a === w, 0.4);
  if (burn) return { key: 'burnKO', a: w, b: l };
  const stomp = lastBefore(ev, t, (e) => e.type === 'stomp' && e.a === w, 0.3);
  if (stomp) return { key: 'stompKO', a: w, b: l };
  const crit = lastBefore(ev, t, (e) => e.type === 'crit' && e.a === w, 0.3);
  return { key: crit ? 'critKO' : 'ko', a: w, b: l };
}
