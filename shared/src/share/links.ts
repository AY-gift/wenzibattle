/**
 * Share links. Two kinds, deliberately different:
 *  - **Challenge / config link** — who fights (and optionally a seed): opens the game with the
 *    lineup filled in, ready for a NEW match.  ?mode=arena&v=1&a=火&b=水[&seed=…][&bo=3]
 *  - **Result link** — the same plus `r`, a compact record of what actually happened (winner,
 *    finish, time, HP, one highlight). It is displayed as a report, never re-simulated and
 *    passed off as the original: a replay is offered separately (fonts can differ per device).
 *
 * Old links (?a=…&b=…&seed=…&lang=…) keep working. Fighter text goes through URLSearchParams
 * (UTF-8 percent-encoding), is length-capped and validated on the way in.
 * Team modes (soccer / basketball) can reuse the format with repeated `a` / `b` params.
 */
import { processInput } from '../core/InputProcessor';

export type GameMode = 'arena' | 'soccer' | 'basketball';
/** Bump when the meaning of the parameters changes. */
export const LINK_VERSION = 1;
/** Max characters per fighter in a link (the input box allows 80). */
export const MAX_NAME = 80;
/** Where a visitor came from (set on links we hand out; anonymous, no user data). */
export type ShareSource = 'x' | 'line' | 'bsky' | 'native' | 'copy' | 'challenge' | 'image';
const SOURCES: ShareSource[] = ['x', 'line', 'bsky', 'native', 'copy', 'challenge', 'image'];

export interface Lineup {
  mode: GameMode;
  a: string;
  b: string;
}

export type FinishReason = 'ko' | 'ringout' | 'timeup' | 'draw';
const REASONS: FinishReason[] = ['ko', 'ringout', 'timeup', 'draw'];

/** What actually happened in a finished match (enough to show a report card, nothing more). */
export interface ResultRecord {
  winner: 0 | 1 | null;
  reason: FinishReason;
  /** Seconds, one decimal. */
  time: number;
  hp: [number, number];
  /** The most fun real event, as a report-line key + who did it. */
  highlight?: { key: string; a: 0 | 1; n?: number };
}

export interface ParsedLink {
  lineup: Lineup;
  seed: number | null;
  result: ResultRecord | null;
  source: ShareSource | null;
  lang: string | null;
  /** Match format: a single bout or best of three (arena). */
  bestOf: 1 | 3;
  /** Final series score of a best-of-three result link. */
  series: [number, number] | null;
}

function cleanName(raw: string | null): string | null {
  if (!raw) return null;
  const p = processInput(Array.from(raw).slice(0, MAX_NAME).join(''));
  return p.ok ? p.text : null;
}

function cleanSeed(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const s = Number(raw);
  return Number.isInteger(s) && s >= 0 && s < 2 ** 31 ? s : null;
}

/** r=1.<winner 0|1|d>.<reason>.<time×10>.<hpA>.<hpB>[.<key>.<actor>[.<n>]] */
export function encodeResult(r: ResultRecord): string {
  const parts: (string | number)[] = [1, r.winner === null ? 'd' : r.winner, r.reason, Math.round(r.time * 10), Math.round(r.hp[0]), Math.round(r.hp[1])];
  if (r.highlight) {
    parts.push(r.highlight.key, r.highlight.a);
    if (r.highlight.n !== undefined && Number.isFinite(r.highlight.n)) parts.push(Math.round(r.highlight.n));
  }
  return parts.join('.');
}

/** Strict: anything unexpected → null (the link then just opens the lineup). */
export function decodeResult(code: string | null, isKnownKey: (k: string) => boolean = () => true): ResultRecord | null {
  if (!code || code.length > 80) return null;
  const p = code.split('.');
  if (p[0] !== '1' || p.length < 6) return null;
  const winner = p[1] === 'd' ? null : p[1] === '0' ? 0 : p[1] === '1' ? 1 : undefined;
  const reason = p[2] as FinishReason;
  const t10 = Number(p[3]), ha = Number(p[4]), hb = Number(p[5]);
  if (winner === undefined || !REASONS.includes(reason)) return null;
  if ((winner === null) !== (reason === 'draw')) return null;
  const int = (x: number, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;
  if (!int(t10, 0, 600) || !int(ha, -50, 200) || !int(hb, -50, 200)) return null;
  const r: ResultRecord = { winner, reason, time: t10 / 10, hp: [Math.max(0, ha), Math.max(0, hb)] };
  if (p.length >= 8) {
    const key = p[6], a = p[7], n = p[8] !== undefined ? Number(p[8]) : undefined;
    if (/^[a-zA-Z]{1,24}$/.test(key) && isKnownKey(key) && (a === '0' || a === '1') && (n === undefined || int(n, -9999, 9999))) {
      r.highlight = { key, a: a === '0' ? 0 : 1, ...(n !== undefined ? { n } : {}) };
    }
  }
  return r;
}

export interface LinkOptions {
  seed?: number;
  result?: ResultRecord;
  source?: ShareSource;
  lang?: string;
  bestOf?: 1 | 3;
  series?: [number, number];
  /** Page to link to; defaults to the current page without query/hash. */
  base?: string;
}

export function buildLink(lineup: Lineup, o: LinkOptions = {}): string {
  const u = new URL(o.base ?? location.href);
  u.search = '';
  u.hash = '';
  const q = u.searchParams;
  q.set('mode', lineup.mode);
  q.set('v', String(LINK_VERSION));
  q.set('a', Array.from(lineup.a).slice(0, MAX_NAME).join(''));
  q.set('b', Array.from(lineup.b).slice(0, MAX_NAME).join(''));
  if (o.seed !== undefined) q.set('seed', String(o.seed));
  if (o.bestOf === 3) q.set('bo', '3');
  if (o.result) q.set('r', encodeResult(o.result));
  if (o.result && o.series) q.set('sc', o.series.join('-'));
  if (o.lang) q.set('lang', o.lang);
  if (o.source) q.set('src', o.source);
  return u.toString();
}

/** Parse the page's query. Returns null when it doesn't describe a lineup. */
export function parseLink(search = location.search, isKnownKey?: (k: string) => boolean): ParsedLink | null {
  const q = new URLSearchParams(search);
  const mode = (q.get('mode') ?? 'arena') as GameMode;
  if (mode !== 'arena') return null; // other modes are handled by their own games
  const a = cleanName(q.get('a')), b = cleanName(q.get('b'));
  if (!a || !b) return null;
  const src = q.get('src') as ShareSource | null;
  const lang = q.get('lang');
  const sc = /^([0-3])-([0-3])$/.exec(q.get('sc') ?? '');
  return {
    lineup: { mode, a, b },
    seed: cleanSeed(q.get('seed')),
    result: decodeResult(q.get('r'), isKnownKey),
    source: src && SOURCES.includes(src) ? src : null,
    lang: lang && /^(ja|zh|en)$/.test(lang) ? lang : null,
    bestOf: q.get('bo') === '3' ? 3 : 1,
    series: sc ? [Number(sc[1]), Number(sc[2])] : null,
  };
}

/** Drop the one-shot attribution param from the address bar (so reloads don't count twice). */
export function stripSourceParam(): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('src')) return;
    u.searchParams.delete('src');
    history.replaceState(history.state, '', u.toString());
  } catch {
    /* ignore */
  }
}
