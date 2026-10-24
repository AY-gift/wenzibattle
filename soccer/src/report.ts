/**
 * Match report (goals, best moments, MVP) and the compact result code used in result links.
 * Lines are language-neutral ({key, …}); the UI localises them.
 */
import { isSkillShot } from './sim/skills';
import { TEAM_SIZE, type MatchResult } from './sim/types';

export interface ReportLine {
  key: string;
  team: 0 | 1;
  /** Player id (team * 4 + index), −1 if none. */
  p: number;
  /** Assisting player id. */
  a?: number;
  n?: number;
  /** Match clock in seconds. */
  t?: number;
}

export const teamOfId = (id: number): 0 | 1 => (id >= TEAM_SIZE ? 1 : 0);

export function buildReport(r: MatchResult): ReportLine[] {
  const lines: ReportLine[] = [];
  for (const g of r.goals.slice(0, 14)) {
    const key = g.own ? 'goalOwn' : g.shot === 'combo' ? 'goalCombo' : g.shot === 'bonus' ? 'goalBonus' : isSkillShot(g.shot) ? 'goalSkill' : 'goal';
    lines.push({ key, team: g.team, p: g.scorer, a: g.assist >= 0 ? g.assist : undefined, t: g.t });
  }
  if (!r.goals.length) lines.push({ key: 'scoreless', team: 0, p: -1 });
  if (r.goldenGoal && r.winner !== null) lines.push({ key: 'golden', team: r.winner, p: -1 });
  return lines;
}

/** Extra lines from the event log: big saves, flattening specials, combos, steals. */
export function statLines(r: MatchResult): ReportLine[] {
  const saves = new Map<number, number>(), knocks = new Map<number, number>(), steals = new Map<number, number>();
  const combos: [number, number] = [0, 0];
  for (const e of r.events) {
    if (e.type === 'save') saves.set(e.a, (saves.get(e.a) ?? 0) + 1);
    if (e.type === 'skillHit' && e.a >= 0) knocks.set(e.a, (knocks.get(e.a) ?? 0) + 1);
    if (e.type === 'tackleWin') steals.set(e.a, (steals.get(e.a) ?? 0) + 1);
    if (e.type === 'combo' && e.kind !== 'tigerTail') combos[e.team]++;
  }
  const top = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const out: ReportLine[] = [];
  const s = top(saves);
  if (s && s[1] >= 2) out.push({ key: 'saves', team: teamOfId(s[0]), p: s[0], n: s[1] });
  const k = top(knocks);
  if (k && k[1] >= 2) out.push({ key: 'knocks', team: teamOfId(k[0]), p: k[0], n: k[1] });
  for (const team of [0, 1] as const) if (combos[team] > 0) out.push({ key: 'combos', team, p: -1, n: combos[team] });
  const st = top(steals);
  if (st && st[1] >= 4) out.push({ key: 'steals', team: teamOfId(st[0]), p: st[0], n: st[1] });
  return out;
}

/** The one moment for the share card: combo goal > special-move goal > bonus > first goal > saves. */
export function highlightOf(r: MatchResult): ReportLine | null {
  const all = [...buildReport(r), ...statLines(r)];
  for (const key of ['goalCombo', 'goalSkill', 'goalBonus', 'combos', 'knocks', 'saves', 'goal', 'goalOwn', 'scoreless']) {
    const l = all.find((x) => x.key === key);
    if (l) return l;
  }
  return null;
}

// ---------------------------------------------------------------- result code

export interface ResultCode {
  score: [number, number];
  golden: boolean;
  time: number;
  mvp: number;
  highlight: ReportLine | null;
}

/** r=1.<a>.<b>.<golden 0|1>.<time×10>.<mvp>[.<key>.<team>.<p|x>[.<n>]] */
export function encodeResult(c: ResultCode): string {
  const parts: (string | number)[] = [1, c.score[0], c.score[1], c.golden ? 1 : 0, Math.round(c.time * 10), c.mvp];
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
  const a = int(p[1], 0, 99), b = int(p[2], 0, 99), g = int(p[3], 0, 1), t = int(p[4], 0, 3000), mvp = int(p[5], 0, TEAM_SIZE * 2 - 1);
  if (a === null || b === null || g === null || t === null || mvp === null) return null;
  let highlight: ReportLine | null = null;
  if (p.length >= 9 && /^[a-zA-Z]{1,16}$/.test(p[6]) && isKey(p[6])) {
    const team = int(p[7], 0, 1);
    const pid = p[8] === 'x' ? -1 : int(p[8], 0, TEAM_SIZE * 2 - 1);
    const n = p[9] !== undefined ? int(p[9], 0, 999) : undefined;
    if (team !== null && pid !== null && n !== null) highlight = { key: p[6], team: team as 0 | 1, p: pid, ...(n !== undefined ? { n } : {}) };
  }
  return { score: [a, b], golden: g === 1, time: t / 10, mvp, highlight };
}
