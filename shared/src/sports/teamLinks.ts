/**
 * Share links for the team games. Same idea as the arena links (shared/src/share/links.ts):
 * a challenge link carries only the lineup; a result link adds `seed` and a game-specific
 * result code `r` (decoded strictly by the game — displayed, never re-simulated as if it were
 * the original match).
 *
 *   ?mode=soccer&v=1&how=split&an=龙飞凤舞&a=龙&a=飞&a=凤&a=舞&bh=free&b=妈妈&b=爸爸&b=宝宝&b=奶奶
 *
 * Each team has its own build method (`how` / `bh`), so a split idiom can play a free team.
 */
import type { ShareSource } from '../share/links';
import { freeTeam, splitTeam, type TeamHow, type TeamInput } from './team';

export type TeamMode = 'soccer' | 'basketball';
export const TEAM_LINK_VERSION = 1;
const MAX_MEMBER = 40;
const MAX_NAME = 40;
const SOURCES: ShareSource[] = ['x', 'line', 'bsky', 'native', 'copy', 'challenge', 'image'];

export interface TeamLineup {
  mode: TeamMode;
  teams: [TeamInput, TeamInput];
}

export interface ParsedTeamLink {
  lineup: TeamLineup;
  seed: number | null;
  /** Raw result code; the game validates it. */
  r: string | null;
  source: ShareSource | null;
  lang: string | null;
}

const cap = (s: string, n: number) => Array.from(s).slice(0, n).join('');

export function buildTeamLink(l: TeamLineup, o: { seed?: number; r?: string; source?: ShareSource; lang?: string; base?: string } = {}): string {
  const u = new URL(o.base ?? location.href);
  u.search = '';
  u.hash = '';
  const q = u.searchParams;
  q.set('mode', l.mode);
  q.set('v', String(TEAM_LINK_VERSION));
  l.teams.forEach((t, i) => {
    const side = i === 0 ? 'a' : 'b';
    q.set(i === 0 ? 'how' : 'bh', t.how);
    if (t.how === 'free' && t.name !== t.members.join('・')) q.set(`${side}n`, cap(t.name, MAX_NAME));
    if (t.how === 'split') q.set(`${side}n`, cap(t.word ?? t.name, MAX_NAME));
    else for (const m of t.members) q.append(side, cap(m, MAX_MEMBER));
  });
  if (o.seed !== undefined) q.set('seed', String(o.seed));
  if (o.r) q.set('r', o.r);
  if (o.lang) q.set('lang', o.lang);
  if (o.source) q.set('src', o.source);
  return u.toString();
}

function readTeam(q: URLSearchParams, side: 'a' | 'b', size: number): TeamInput | null {
  const how = (q.get(side === 'a' ? 'how' : 'bh') ?? 'split') as TeamHow;
  const name = q.get(`${side}n`);
  if (how === 'split') {
    const word = name ?? q.getAll(side).join('');
    const t = splitTeam(cap(word, MAX_NAME), size);
    return t.ok ? { how: t.how, name: t.name, members: t.members, word: t.word } : null;
  }
  if (how !== 'free') return null;
  const t = freeTeam(q.getAll(side).slice(0, size).map((m) => cap(m, MAX_MEMBER)), size, name ? cap(name, MAX_NAME) : undefined);
  return t.ok ? { how: t.how, name: t.name, members: t.members } : null;
}

export function parseTeamLink(search: string, mode: TeamMode, size: number): ParsedTeamLink | null {
  const q = new URLSearchParams(search);
  if (q.get('mode') !== mode) return null;
  const a = readTeam(q, 'a', size), b = readTeam(q, 'b', size);
  if (!a || !b) return null;
  const s = Number(q.get('seed'));
  const src = q.get('src') as ShareSource | null;
  const lang = q.get('lang');
  const r = q.get('r');
  return {
    lineup: { mode, teams: [a, b] },
    seed: q.get('seed') !== null && Number.isInteger(s) && s >= 0 && s < 2 ** 31 ? s : null,
    r: r && r.length <= 120 ? r : null,
    source: src && SOURCES.includes(src) ? src : null,
    lang: lang && /^(ja|zh|en)$/.test(lang) ? lang : null,
  };
}
