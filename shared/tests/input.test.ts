import { describe, expect, it } from 'vitest';
import { isEmojiGrapheme, MAX_GRAPHEMES, processInput, splitGraphemes, type ProcessedInput } from '../src/core/InputProcessor';

const ok = (s: string) => {
  const r = processInput(s);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(s)}: ${r.reason}`);
  return r as ProcessedInput;
};

describe('InputProcessor', () => {
  it('splits by grapheme cluster, not UTF-16 length', () => {
    expect(splitGraphemes('👨‍👩‍👧')).toHaveLength(1); // ZWJ family
    expect(splitGraphemes('🇯🇵🇺🇸')).toHaveLength(2); // flags
    expect(splitGraphemes('1️⃣')).toHaveLength(1); // keycap
    expect(splitGraphemes('é')).toHaveLength(1); // combining accent
    expect(splitGraphemes('👍🏽')).toHaveLength(1); // skin tone
    expect(splitGraphemes('龍')).toHaveLength(1);
  });

  it('classifies every required test input', () => {
    const cases: [string, string][] = [
      ['火', 'glyph'], ['水', 'glyph'], ['田', 'glyph'], ['川', 'glyph'], ['龍', 'glyph'], ['A', 'glyph'], ['Z', 'glyph'],
      ['あ', 'glyph'], ['ア', 'glyph'], ['★', 'glyph'], ['♥', 'glyph'], ['∞', 'glyph'],
      ['😀', 'emoji'], ['💀', 'emoji'], ['🍣', 'emoji'],
      ['ಠ_ಠ', 'kaomoji'], ['(・ω・)', 'kaomoji'], ['(>_<)', 'kaomoji'],
    ];
    for (const [text, kind] of cases) expect(ok(text).kind, text).toBe(kind);
  });

  it('treats text-style symbols as glyphs and VS16 sequences as emoji', () => {
    expect(isEmojiGrapheme('♥')).toBe(false);
    expect(isEmojiGrapheme('❤️')).toBe(true);
    expect(isEmojiGrapheme('★')).toBe(false);
    expect(isEmojiGrapheme('1')).toBe(false);
    expect(isEmojiGrapheme('1️⃣')).toBe(true);
    expect(isEmojiGrapheme('😀︎')).toBe(false);
  });

  it('normalises to NFC so composed and decomposed forms are the same fighter', () => {
    expect(ok('é').text).toBe(ok('é').text);
  });

  it('keeps inner spaces of kaomoji but trims the ends', () => {
    const r = ok('  m(_ _)m  ');
    expect(r.text).toBe('m(_ _)m');
    expect(r.kind).toBe('kaomoji');
  });

  it('rejects empty and invisible input', () => {
    expect(processInput('')).toEqual({ ok: false, reason: 'empty' });
    expect(processInput('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(processInput('　　')).toEqual({ ok: false, reason: 'empty' });
    expect(processInput('​')).toEqual({ ok: false, reason: 'empty' }); // stripped → empty
    expect(processInput('⠀')).toEqual({ ok: false, reason: 'invisible' }); // braille blank
    expect(processInput('́')).toEqual({ ok: false, reason: 'invisible' }); // lone combining mark
  });

  it('caps the length by graphemes without splitting an emoji sequence', () => {
    const r = ok('👨‍👩‍👧'.repeat(30));
    expect(r.truncated).toBe(true);
    expect(r.graphemes).toHaveLength(MAX_GRAPHEMES);
    expect(r.graphemes.every((g) => g === '👨‍👩‍👧')).toBe(true);
  });

  it('never interprets markup — text passes through as plain characters', () => {
    const r = ok('<img src=x onerror=alert(1)>');
    expect(r.text.startsWith('<img')).toBe(true);
    expect(r.graphemes.length).toBeLessThanOrEqual(MAX_GRAPHEMES);
  });

  it('strips control and bidi-override characters', () => {
    expect(ok('A‮B\u0007').text).toBe('AB');
  });
});
