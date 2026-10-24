import { describe, expect, it } from 'vitest';
import { MOVE_TABLE } from '../src/core/SignatureMoves';
import { SOCCER_COMBOS } from '../src/sports/combos';
import {
  BASKETBALL_CULTURE, EXPANSION_CHARACTER_ROWS, BASKET_PRIM_TEXT, BASKET_PRIM_WORD, BASKET_RISK_TEXT, BASKET_TRIGGER_TEXT, CULTURE_CHARACTER_ROWS, CULTURE_MATCHUPS, PRIM_TEXT, PRIM_WORD, RISK_TEXT,
  SOCCER_CULTURE, TAG_TEXT, TRIGGER_TEXT, basketSummary, cultureFor, cultureSummary, matchupFor,
} from '../src/sports/culture';
import { splitTeam } from '../src/sports/team';

const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;
const norm = (s: string) => s.normalize('NFC').toUpperCase();

describe('culture pack registry', () => {
  it('has every row of both packs (466 culture + 34 V3, deduplicated)', () => {
    expect(SOCCER_CULTURE).toHaveLength(245);
    // 91 from the culture pack + 171 from the basketball expansion pack.
    expect(BASKETBALL_CULTURE).toHaveLength(262);
    expect(BASKETBALL_CULTURE.filter((x) => x.source === 'bx')).toHaveLength(171);
    expect(CULTURE_CHARACTER_ROWS).toHaveLength(126);
    expect(CULTURE_MATCHUPS).toHaveLength(68);
    expect(CULTURE_MATCHUPS.filter((x) => x.source === 'bx')).toHaveLength(30);
    const all = [...SOCCER_CULTURE, ...BASKETBALL_CULTURE, ...CULTURE_CHARACTER_ROWS];
    expect(all.filter((x) => x.source === 'culture').length + CULTURE_MATCHUPS.filter((x) => !x.source).length).toBe(466);
    // Basketball expansion: 85 characters + 171 pairs + 30 rivalries = 286.
    expect(EXPANSION_CHARACTER_ROWS.length + 171 + 30).toBe(286);
  });

  it('football keys are four glyphs, basketball keys two, no duplicates', () => {
    for (const c of SOCCER_CULTURE) expect(graphemes(c.key), c.key).toBe(4);
    for (const b of BASKETBALL_CULTURE) expect(graphemes(b.key), b.key).toBe(2);
    for (const list of [SOCCER_CULTURE, BASKETBALL_CULTURE, CULTURE_CHARACTER_ROWS]) {
      const keys = list.map((x) => norm(x.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every football recipe uses known triggers / primitives / risks, 1–3 primitives, each described in 3 languages', () => {
    for (const c of SOCCER_CULTURE) {
      expect(TRIGGER_TEXT[c.trigger], c.key).toBeDefined();
      expect(RISK_TEXT[c.risk], c.key).toBeDefined();
      expect(TAG_TEXT[c.tag], c.key).toBeDefined();
      expect(c.prims.length, c.key).toBeGreaterThanOrEqual(1);
      expect(c.prims.length, c.key).toBeLessThanOrEqual(3);
      expect(new Set(c.prims).size, c.key).toBe(c.prims.length);
      for (const p of c.prims) {
        expect(PRIM_TEXT[p], `${c.key}:${p}`).toBeDefined();
        expect(PRIM_WORD[p].ja && PRIM_WORD[p].zh && PRIM_WORD[p].en).toBeTruthy();
      }
      for (const l of ['ja', 'zh', 'en'] as const) expect(cultureSummary(c, l).length).toBeGreaterThan(4);
    }
  });

  it('the 12 original idiom combos stay as they are (registered as "existing", never overridden)', () => {
    const idioms = new Set(SOCCER_COMBOS.flatMap((c) => c.keys).map(norm));
    for (const c of SOCCER_CULTURE) expect(c.status === 'existing', c.key).toBe(idioms.has(norm(c.key)));
    for (const c of SOCCER_CULTURE.filter((x) => x.status === 'existing')) expect(cultureFor(splitTeam(c.key, 4) as never)).toBeNull();
  });

  it('every single glyph / word row has its own arena move (exact key)', () => {
    for (const r of CULTURE_CHARACTER_ROWS) expect(MOVE_TABLE.some((e) => e.keys.includes(r.key)), r.key).toBe(true);
    // New moves are tagged so the report can count them; old slang entries are untouched.
    expect(MOVE_TABLE.filter((e) => e.pack === 'culture')).toHaveLength(74);
  });

  it('basketball expansion characters: 80 new moves (3 languages, real arena mechanics); 5 keys keep their old move', () => {
    const newRows = EXPANSION_CHARACTER_ROWS.filter((r) => r.status === 'new');
    expect(newRows).toHaveLength(80);
    expect(EXPANSION_CHARACTER_ROWS.filter((r) => r.status === 'existing').map((r) => r.key)).toEqual(['骨', '投', '尴尬', '再见', '你好']);
    const bx = MOVE_TABLE.filter((e) => e.pack === 'basketball');
    expect(bx).toHaveLength(80);
    for (const e of bx) expect(e.name.ja && e.name.zh && e.name.en, e.keys[0]).toBeTruthy();
    for (const r of EXPANSION_CHARACTER_ROWS) expect(MOVE_TABLE.some((e) => e.keys.includes(r.key)), r.key).toBe(true);
  });

  it('matchups carry a duel rule and are found in either order, in their own sport only', () => {
    for (const m of CULTURE_MATCHUPS) {
      expect(m.status).toBe('implemented');
      expect(m.effect).toBeDefined();
      const size = m.mode === 'soccer' ? 4 : 2;
      const a = splitTeam(m.a, size), b = splitTeam(m.b, size);
      if (!a.ok || !b.ok) throw new Error(m.a + m.b);
      expect(matchupFor(a, b, m.mode)?.swapped).toBe(false);
      expect(matchupFor(b, a, m.mode)?.swapped).toBe(true);
      expect(matchupFor(a, b, m.mode === 'soccer' ? 'basketball' : 'soccer')).toBeNull();
    }
  });

  it('every basketball pair has a valid 1–3 primitive recipe, described in 3 languages', () => {
    for (const c of BASKETBALL_CULTURE) {
      expect(c.status).toBe('implemented');
      expect(BASKET_TRIGGER_TEXT[c.trigger], c.key).toBeDefined();
      expect(BASKET_RISK_TEXT[c.risk], c.key).toBeDefined();
      expect(c.prims.length).toBeGreaterThanOrEqual(1);
      expect(c.prims.length).toBeLessThanOrEqual(3);
      for (const p of c.prims) expect(BASKET_PRIM_TEXT[p] && BASKET_PRIM_WORD[p], `${c.key}:${p}`).toBeTruthy();
      for (const l of ['ja', 'zh', 'en'] as const) expect(basketSummary(c, l).length).toBeGreaterThan(4);
    }
    expect(BASKETBALL_CULTURE.filter((c) => c.idiom)).toHaveLength(13);
  });
});
