/**
 * Team building for the sports games. Two explicit ways, never guessed:
 *  - 'split' (一键组队): one word is split into its user-perceived characters (Unicode grapheme
 *    clusters), one player each — 「龙飞凤舞」 → 龙 / 飞 / 凤 / 舞. Needs exactly `size` of them.
 *  - 'free' (自由组队): every box is one whole player — 「妈妈」 stays 妈妈 (with 妈妈's own move).
 * The word of a split team stays the team name and is what team combos (成语连携) look up;
 * it never becomes an extra player.
 */
import { processInput, splitGraphemes } from '../core/InputProcessor';

export type TeamHow = 'split' | 'free';

export interface TeamInput {
  how: TeamHow;
  /** Display name: the split word, or the members joined with ・ (or a custom name). */
  name: string;
  /** One entry per player (already cleaned). */
  members: string[];
  /** The original word of a split team (for combos). */
  word?: string;
}

export type TeamError =
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'count'; n: number; need: number }
  | { ok: false; reason: 'member'; index: number };

export type TeamResult = ({ ok: true } & TeamInput) | TeamError;

/** Characters of a split word: grapheme clusters, ignoring whitespace (「龙 飞 凤 舞」 works too). */
export function splitWord(word: string): string[] {
  return splitGraphemes(word.normalize('NFC')).filter((g) => !/^\s+$/u.test(g) && !/^[​-‍⁠﻿]+$/u.test(g));
}

export function splitTeam(word: string, size: number): TeamResult {
  const w = word.normalize('NFC').trim();
  if (!w) return { ok: false, reason: 'empty' };
  const chars = splitWord(w);
  if (chars.length !== size) return { ok: false, reason: 'count', n: chars.length, need: size };
  for (let i = 0; i < chars.length; i++) if (!processInput(chars[i]).ok) return { ok: false, reason: 'member', index: i };
  return { ok: true, how: 'split', name: chars.join(''), members: chars, word: chars.join('') };
}

export function freeTeam(members: string[], size: number, name?: string): TeamResult {
  const out: string[] = [];
  for (let i = 0; i < size; i++) {
    const p = processInput(members[i] ?? '');
    if (!p.ok) return { ok: false, reason: 'member', index: i };
    out.push(p.text);
  }
  const custom = name?.normalize('NFC').trim();
  return { ok: true, how: 'free', name: custom || out.join('・'), members: out };
}

export function buildTeam(how: TeamHow, value: string | string[], size: number, name?: string): TeamResult {
  return how === 'split' ? splitTeam(Array.isArray(value) ? value.join('') : value, size) : freeTeam(Array.isArray(value) ? value : [value], size, name);
}
