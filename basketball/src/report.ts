/**
 * Game report (baskets, best moments, MVP) and the compact result code used in result links.
 * Lines are language-neutral ({key, …}); the UI localises them.
 */
import { TEAM_SIZE, type MatchResult, type ShotKind } from './sim/types';

export interface ReportLine {
  key: string;
  team: 0 | 1;
  /** Player id (team * 2 + index), −1 if none. */
  p: number;
  a?: number;
  n?: number;
  /** Game clock in seconds. */
  t?: number;
}

export const teamOfId = (id: number): 0 | 1 => (id >= TEAM_SIZE ? 1 : 0);

const SKILL_SHOTS: ShotKind[] = ['highArc', 'beam', 'bank'];

/** The baskets worth telling: dunks, threes, special / culture shots (not every layup). */
export function buildReport(r: MatchResult): ReportLine[] {
  const lines: ReportLine[] = [];
  for (const s of r.scores) {
    const key = s.label && s.kind === 'combo' ? 'basketCombo' : s.kind === 'dunk' ? 'dunk' : s.points === 3 ? 'three' : SKILL_SHOTS.includes(s.kind) ? 'basketSkill' : s.kind === 'tip' ? 'tip' : null;
    if (!key) continue;
    lines.push({ key, team: s.team, p: s.scorer, a: s.assist >= 0 ? s.assist : undefined, t: s.t });
    if (lines.length >= 12) break;
  }
  if (!r.scores.length) lines.push({ key: 'scoreless', team: 0, p: -1 });
  if (r.overtime && r.winner !== null) lines.push({ key: 'overtime', team: r.winner, p: -1 });
  const last = r.scores[r.scores.length - 1];
  if (last && r.winner !== null && last.team === r.winner && last.t > 87) lines.push({ key: 'buzzer', team: last.team, p: last.scorer, t: last.t });
  return lines;
}

/** Extra lines from the event log: blocks, rebounds, steals, combos, special-move hits. */
export function statLines(r: MatchResult): ReportLine[] {
  const count = (type: string) => {
    const m = new Map<number, number>();
    for (const e of r.events) if (e.type === type && e.a >= 0) m.set(e.a, (m.get(e.a) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };
  const out: ReportLine[] = [];
  const b = count('block');
  if (b && b[1] >= 2) out.push({ key: 'blocks', team: teamOfId(b[0]), p: b[0], n: b[1] });
  const rb = count('rebound');
  if (rb && rb[1] >= 4) out.push({ key: 'rebounds', team: teamOfId(rb[0]), p: rb[0], n: rb[1] });
  const st = count('steal');
  if (st && st[1] >= 3) out.push({ key: 'steals', team: teamOfId(st[0]), p: st[0], n: st[1] });
  const k = count('skillHit');
  if (k && k[1] >= 2) out.push({ key: 'knocks', team: teamOfId(k[0]), p: k[0], n: k[1] });
  const combos: [number, number] = [0, 0];
  for (const e of r.events) if (e.type === 'combo') combos[e.team]++;
  for (const team of [0, 1] as const) if (combos[team] > 0) out.push({ key: 'combos', team, p: -1, n: combos[team] });
  return out;
}

/** The one moment for the share card. */
export function highlightOf(r: MatchResult): ReportLine | null {
  const all = [...buildReport(r), ...statLines(r)];
  for (const key of ['buzzer', 'basketCombo', 'dunk', 'basketSkill', 'three', 'blocks', 'combos', 'knocks', 'steals', 'tip', 'scoreless']) {
    const l = all.find((x) => x.key === key);
    if (l) return l;
  }
  return null;
}

// ---------------------------------------------------------------- result code

export interface ResultCode {
  score: [number, number];
  overtime: boolean;
  time: number;
  mvp: number;
  highlight: ReportLine | null;
}

/** r=1.<a>.<b>.<overtime 0|1>.<time×10>.<mvp>[.<key>.<team>.<p|x>[.<n>]] */
export function encodeResult(c: ResultCode): string {
  const parts: (string | number)[] = [1, c.score[0], c.score[1], c.overtime ? 1 : 0, Math.round(c.time * 10), c.mvp];
  const h = c.highlight;
  if (h) {
    parts.push(h.key, h.team, h.p >= 0 ? h.p : 'x');
    if (h.n !== undefined) parts.push(Math.round(h.n));
  }
  return parts.join('.');
}

export function decodeResult(code: string | null, isKey: (k: string) => boolean): ResultCode | null {
  if (!code || code.length > 80) return null;
  const p = code.split('.');
  if (p[0] !== '1' || p.length < 6) return null;
  const int = (s: string, lo: number, hi: number) => {
    const v = Number(s);
    return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  };
  const a = int(p[1], 0, 199), b = int(p[2], 0, 199), o = int(p[3], 0, 1), t = int(p[4], 0, 3000), mvp = int(p[5], 0, TEAM_SIZE * 2 - 1);
  if (a === null || b === null || o === null || t === null || mvp === null) return null;
  let highlight: ReportLine | null = null;
  if (p.length >= 9 && /^[a-zA-Z]{1,16}$/.test(p[6]) && isKey(p[6])) {
    const team = int(p[7], 0, 1);
    const pid = p[8] === 'x' ? -1 : int(p[8], 0, TEAM_SIZE * 2 - 1);
    const n = p[9] !== undefined ? int(p[9], 0, 999) : undefined;
    if (team !== null && pid !== null && n !== null) highlight = { key: p[6], team: team as 0 | 1, p: pid, ...(n !== undefined ? { n } : {}) };
  }
  return { score: [a, b], overtime: o === 1, time: t / 10, mvp, highlight };
}
