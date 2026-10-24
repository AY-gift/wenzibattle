/**
 * InputProcessor — turns raw user text into a sanitized, grapheme-aware fighter input.
 * User text is only ever treated as data: it is never parsed as HTML or code.
 */

export type InputKind = 'glyph' | 'word' | 'kaomoji' | 'emoji' | 'mixed';

export interface ProcessedInput {
  ok: true;
  /** NFC-normalized, trimmed text actually used for the fighter. */
  text: string;
  graphemes: string[];
  kind: InputKind;
  /** true if at least one grapheme is an emoji (rendered in colour). */
  hasEmoji: boolean;
  /** true when the raw input was cut to the grapheme limit. */
  truncated: boolean;
}

export interface RejectedInput {
  ok: false;
  reason: 'empty' | 'invisible';
}

export type InputResult = ProcessedInput | RejectedInput;

export const MAX_GRAPHEMES = 14;

const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;

/** Split into user-perceived characters (handles ZWJ sequences, flags, keycaps, combining marks). */
export function splitGraphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  // Fallback: code points, glueing combining marks / ZWJ / variation selectors to the previous one.
  const out: string[] = [];
  let joinNext = false;
  for (const cp of Array.from(text)) {
    const glue = /[\p{M}︎️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u.test(cp);
    if (out.length && (glue || joinNext || cp === '‍')) out[out.length - 1] += cp;
    else out.push(cp);
    joinNext = cp === '‍';
  }
  return out;
}

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const TEXT_PRESENTATION_RE = /︎/;
// Pictographs that are usually drawn as text symbols unless they carry VS16 (U+FE0F).
const TEXTY_PICTOGRAPHS = new Set(['♥', '♠', '♣', '♦', '☆', '★', '☺', '☹', '♡', '©', '®', '™', '‼', '⁉', '↔', '↕', '☀', '☁', '☂', '☃', '☎', '✂', '✈', '✉', '✏', '✒', '✔', '✖', '✝', '✡', '✳', '✴', '❄', '❇', '❣', '❤', '➡', '⬅', '⬆', '⬇', '〰', '〽', '㊗', '㊙', '▶', '◀', '☠', '☢', '☣', '♀', '♂', '⚔', '⚛', '⚠', '⚡', '♻', '☯', '☮', '✌', '☝', '✍']);

export function isEmojiGrapheme(g: string): boolean {
  if (TEXT_PRESENTATION_RE.test(g)) return false;
  if (!EMOJI_RE.test(g)) return false;
  const base = Array.from(g)[0];
  if (TEXTY_PICTOGRAPHS.has(base) && !g.includes('️')) return false;
  // Digits/#/* only count as emoji when they are keycaps.
  if (/^[0-9#*]/.test(g) && !g.includes('⃣')) return false;
  return true;
}

// Characters with no visible ink on their own.
const INVISIBLE_RE = /^[\s\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Mn}\p{Me}ᅟᅠㅤﾠ⠀]+$/u;
const STRIP_RE = /[\p{Cc}​‎‏‪-‮⁦-⁩﻿]/gu;

const KAOMOJI_HINT = /[()（）\[\]{}<>＜＞_＿・ω°^＾;；:：ﾟ゜\-~〜|\\/／`´'"″*＊=＝oOｏ０ಠ╯╰┐┌ノﾉヽ̀-ͯ฀-๿ಀ-೿]/u;
const LETTER_RE = /[\p{L}\p{N}]/u;
const CJK_OR_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function processInput(raw: string): InputResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  // NFC so that "e + ◌́" and "é" behave the same; strip control/bidi chars but keep inner spaces.
  let text = raw.normalize('NFC').replace(STRIP_RE, '').replace(/[\t\r\n]+/g, ' ');
  text = text.replace(/^[\s　]+|[\s　]+$/gu, '');
  if (!text) return { ok: false, reason: 'empty' };

  let graphemes = splitGraphemes(text);
  let truncated = false;
  if (graphemes.length > MAX_GRAPHEMES) {
    graphemes = graphemes.slice(0, MAX_GRAPHEMES);
    truncated = true;
    while (graphemes.length && /^\s+$/u.test(graphemes[graphemes.length - 1])) graphemes.pop();
    text = graphemes.join('');
  }
  // Collapse runs of more than two spaces.
  if (/\s{3,}/u.test(text)) {
    text = text.replace(/\s{3,}/gu, '  ');
    graphemes = splitGraphemes(text);
  }
  if (graphemes.every((g) => INVISIBLE_RE.test(g))) return { ok: false, reason: 'invisible' };

  const emojiFlags = graphemes.map(isEmojiGrapheme);
  const hasEmoji = emojiFlags.some(Boolean);
  const visible = graphemes.filter((g) => !/^\s+$/u.test(g));
  let kind: InputKind;
  if (hasEmoji && emojiFlags.every((e, i) => e || /^\s+$/u.test(graphemes[i]))) kind = 'emoji';
  else if (hasEmoji) kind = 'mixed';
  else if (visible.length <= 1) kind = 'glyph';
  else if (isKaomoji(visible)) kind = 'kaomoji';
  else kind = 'word';

  return { ok: true, text, graphemes, kind, hasEmoji, truncated };
}

function isKaomoji(visible: string[]): boolean {
  const symbolCount = visible.filter((g) => !LETTER_RE.test(g) || KAOMOJI_HINT.test(g)).length;
  const hasBracket = visible.some((g) => /[()（）]/.test(g));
  const allWordy = visible.every((g) => CJK_OR_KANA.test(g) || /^[\p{L}\p{N}]$/u.test(g));
  if (allWordy) return false;
  return hasBracket || symbolCount >= Math.ceil(visible.length / 2);
}

/** Cache key that identifies an input independent of trivial whitespace differences. */
export function inputKey(p: ProcessedInput): string {
  return p.text;
}
