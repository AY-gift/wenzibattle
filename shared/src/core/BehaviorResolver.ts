/**
 * BehaviorResolver — a small, maintainable rules table that maps the *meaning* of a text
 * to special behaviours. Unknown text simply gets no tags and fights on shape alone.
 */

export type BehaviorTag =
  | 'fire' | 'slippery' | 'flyer' | 'hasty' | 'sleepy' | 'coward' | 'angry' | 'skull'
  | 'slip' | 'charm' | 'chaos' | 'gas' | 'heavy' | 'spinner' | 'royal' | 'pounce'
  | 'loyal' | 'laugh' | 'electric' | 'star' | 'explode' | 'ghost' | 'bouncy' | 'tiny' | 'giant';

export type Element = 'fire' | 'water' | 'thunder' | 'plant' | 'ice' | 'earth' | 'dark' | 'light';

/** Offsets applied to raw (0‥1) stat inputs before budget normalisation. */
export interface StatMods {
  speed?: number;
  attack?: number;
  defense?: number;
  stability?: number;
  luck?: number;
  /** Multiplier on physical mass. */
  mass?: number;
}

export interface BehaviorRule {
  keys: string[];
  tags: BehaviorTag[];
  element?: Element;
  mods?: StatMods;
  /** Preferred base hue (0‥360) for the model colour. */
  hue?: number;
  /** Only applies when the whole input is this key (punctuation inside kaomoji is ignored). */
  solo?: boolean;
}

// Single-character keys match any grapheme of the input; longer keys match as substrings
// (latin keys case-insensitively). Simplified, traditional and Japanese forms are listed together.
export const BEHAVIOR_RULES: BehaviorRule[] = [
  { keys: ['火', '炎', '焔', '燃', '🔥', 'fire', 'ほのお'], tags: ['fire'], element: 'fire', mods: { attack: 0.12 }, hue: 12 },
  { keys: ['水', '💧', '🌊', '海', '泳', 'water', 'みず'], tags: ['slippery'], element: 'water', mods: { defense: 0.06 }, hue: 205 },
  { keys: ['氷', '冰', '雪', '🧊', '❄', '⛄', 'ice'], tags: ['slippery'], element: 'ice', mods: { defense: 0.08 }, hue: 190 },
  { keys: ['飛', '飞', '翔', '羽', '翼', '鳥', '鸟', '🐦', '🦅', '🕊', '✈', '🚀', 'fly'], tags: ['flyer'], mods: { speed: 0.1 }, hue: 175 },
  { keys: ['急', '速', '疾', '走', '奔', '💨', 'fast', 'はやい'], tags: ['hasty'], mods: { speed: 0.18, stability: -0.08 }, hue: 30 },
  { keys: ['眠', '寝', '睡', '💤', '😴', '🥱', '🛌', 'zzz', 'sleep', 'ねむい', 'ねむ'], tags: ['sleepy'], mods: { speed: -0.08, defense: 0.08, luck: 0.15 }, hue: 250 },
  { keys: ['逃', '怖', '怯', '😱', '😨', '🐔', '>_<', '＞＜', 'run'], tags: ['coward'], mods: { speed: 0.14, attack: -0.08 }, hue: 95 },
  { keys: ['怒', '憤', '愤', '💢', '😡', '😠', '🤬', '👿', 'ಠ', '╯', '凸', 'angry', 'rage'], tags: ['angry'], mods: { attack: 0.16, defense: -0.06, stability: -0.04 }, hue: 0 },
  { keys: ['💀', '☠', '死', '骨', '骷', 'skull', 'dead'], tags: ['skull'], element: 'dark', mods: { luck: 0.1 }, hue: 280 },
  { keys: ['🍣', '🍌', '🧈', '鮨', '寿司', '滑', 'banana', 'すし'], tags: ['slip'], mods: { luck: 0.05 }, hue: 15 },
  { keys: ['♥', '❤', '♡', '💕', '💖', '😍', '🥰', '愛', '爱', '恋', '戀', 'love', 'すき', '好'], tags: ['charm'], element: 'light', mods: { luck: 0.08 }, hue: 340 },
  { keys: ['?', '？', '❓', '❔', '謎', '谜', '乱', '亂', '🎲', '🤪', '🌀', '?_?'], tags: ['chaos'], mods: { luck: 0.12 }, hue: 300 },
  { keys: ['屁', '💨', '風', '风', '嵐', '🌪', '🌬', 'fart', 'おなら'], tags: ['gas'], mods: { attack: 0.04 }, hue: 85 },
  { keys: ['山', '岩', '石', '鉄', '铁', '鐵', '壁', '重', '🪨', '🗿', '⛰', 'rock'], tags: ['heavy'], element: 'earth', mods: { stability: 0.16, speed: -0.1, mass: 1.3 }, hue: 35 },
  { keys: ['回', '旋', '渦', '涡', '∞', '@', '＠', '🌀', '🔄', '♾', 'spin'], tags: ['spinner'], mods: { attack: 0.08 }, hue: 265 },
  { keys: ['王', '皇', '帝', '👑', '🤴', '👸', 'king', 'queen'], tags: ['royal'], element: 'light', mods: { attack: 0.06, defense: 0.06, speed: -0.06 }, hue: 48 },
  { keys: ['猫', '貓', '🐱', '🐈', '😺', 'ω', 'ねこ', 'ネコ', 'cat', 'nya'], tags: ['pounce'], mods: { speed: 0.08, luck: 0.06 }, hue: 28 },
  { keys: ['虎', '豹', '🐯', '🐅', '🦁', '獅', '狮', 'tiger', 'lion'], tags: ['pounce', 'angry'], mods: { attack: 0.12 }, hue: 38 },
  { keys: ['犬', '狗', '🐶', '🐕', '🐺', '狼', 'いぬ', 'イヌ', 'dog'], tags: ['loyal'], mods: { speed: 0.08, attack: 0.04 }, hue: 32 },
  { keys: ['龍', '龙', '竜', '🐉', '🐲', 'dragon'], tags: ['fire', 'flyer'], element: 'fire', mods: { attack: 0.08, mass: 1.1 }, hue: 150 },
  { keys: ['笑', '😂', '🤣', '😆', '😀', '😁', '😄', '草', 'www', 'lol', '^^', '＾＾', 'ｗ'], tags: ['laugh'], mods: { luck: 0.1 }, hue: 52 },
  { keys: ['雷', '電', '电', '⚡', '🌩', 'thunder'], tags: ['electric'], element: 'thunder', mods: { speed: 0.08, attack: 0.06 }, hue: 55 },
  { keys: ['★', '☆', '⭐', '🌟', '✨', '星', '幸', '吉', '福', '🍀', 'star', 'luck'], tags: ['star'], element: 'light', mods: { luck: 0.3 }, hue: 50 },
  { keys: ['爆', '💣', '💥', '炸', '🧨', 'bomb', 'boom'], tags: ['explode'], element: 'fire', mods: { attack: 0.1, defense: -0.06 }, hue: 20 },
  { keys: ['👻', '幽', '霊', '灵', '靈', '鬼', 'ghost', 'おばけ'], tags: ['ghost'], element: 'dark', mods: { luck: 0.08, defense: -0.04 }, hue: 230 },
  { keys: ['弾', '弹', '球', '⚽', '🏀', '🎾', '🏐', '⚾', '跳', 'ball'], tags: ['bouncy'], mods: { stability: -0.04 }, hue: 120 },
  { keys: ['小', '微', '少', 'mini'], tags: ['tiny'], mods: { speed: 0.12, mass: 0.75 }, hue: 160 },
  { keys: ['・', '·', '.', '。', '、', ','], tags: ['tiny'], mods: { speed: 0.12, mass: 0.75 }, hue: 160, solo: true },
  { keys: ['大', '巨', '太', '肥', '象', '🐘', 'big'], tags: ['giant'], mods: { speed: -0.08, mass: 1.25, stability: 0.06 }, hue: 25 },
  { keys: ['木', '林', '森', '草', '花', '🌳', '🌲', '🌸', '🌻', 'tree'], tags: [], element: 'plant', mods: { defense: 0.06 }, hue: 110 },
  { keys: ['田', '土', '地', '🌏', '🌍'], tags: [], element: 'earth', mods: { stability: 0.06 }, hue: 40 },
  { keys: ['闇', '暗', '黒', '黑', '🖤', '🌑'], tags: [], element: 'dark', mods: { attack: 0.04 }, hue: 270 },
  { keys: ['光', '日', '☀', '🌞', '聖', '圣'], tags: [], element: 'light', mods: { luck: 0.06 }, hue: 45 },
  { keys: ['💩', 'うんこ'], tags: ['gas', 'slip'], mods: { luck: 0.12 }, hue: 25 },
  { keys: ['🐌', '亀', '龟', '🐢', '遅', '迟', 'slow'], tags: ['heavy'], mods: { speed: -0.14, defense: 0.14 }, hue: 100 },
];

const SINGLE = new Map<string, BehaviorRule[]>();
const MULTI: { key: string; rule: BehaviorRule }[] = [];
for (const r of BEHAVIOR_RULES) {
  for (const k of r.keys) {
    const key = k.normalize('NFC');
    if (Array.from(key).length === 1 || /^\p{Extended_Pictographic}️?$/u.test(key)) {
      const base = key.replace(/️/g, '');
      if (!SINGLE.has(base)) SINGLE.set(base, []);
      SINGLE.get(base)!.push(r);
    } else MULTI.push({ key: key.toLowerCase(), rule: r });
  }
}

export interface ResolvedBehavior {
  tags: BehaviorTag[];
  element: Element | null;
  mods: Required<StatMods>;
  hue: number | null;
  /** Which keys matched (for explanations and tests). */
  matched: string[];
}

export const MAX_TAGS = 3;

export function resolveBehavior(text: string, graphemes: string[]): ResolvedBehavior {
  const hits: { rule: BehaviorRule; key: string; pos: number }[] = [];
  const lower = text.toLowerCase();
  graphemes.forEach((g, pos) => {
    const base = g.replace(/[︎️]/g, '');
    for (const rule of SINGLE.get(base) ?? []) if (!rule.solo || graphemes.length === 1) hits.push({ rule, key: base, pos });
    // Also try the first code point (handles skin tones / ZWJ variants of a listed emoji).
    const first = Array.from(base)[0];
    if (first !== base) for (const rule of SINGLE.get(first) ?? []) hits.push({ rule, key: first, pos });
  });
  for (const { key, rule } of MULTI) {
    const pos = lower.indexOf(key);
    if (pos >= 0) hits.push({ rule, key, pos: pos - 0.5 });
  }
  hits.sort((a, b) => a.pos - b.pos);
  const tags: BehaviorTag[] = [];
  const mods: Required<StatMods> = { speed: 0, attack: 0, defense: 0, stability: 0, luck: 0, mass: 1 };
  let element: Element | null = null;
  let hue: number | null = null;
  const seen = new Set<BehaviorRule>();
  const matched: string[] = [];
  for (const { rule, key } of hits) {
    if (seen.has(rule)) continue;
    seen.add(rule);
    matched.push(key);
    for (const t of rule.tags) if (!tags.includes(t) && tags.length < MAX_TAGS) tags.push(t);
    if (!element && rule.element) element = rule.element;
    if (hue === null && rule.hue !== undefined) hue = rule.hue;
    // Diminishing contribution so stacking many meaningful characters cannot snowball.
    const k = 1 / seen.size;
    const m = rule.mods ?? {};
    mods.speed += (m.speed ?? 0) * k;
    mods.attack += (m.attack ?? 0) * k;
    mods.defense += (m.defense ?? 0) * k;
    mods.stability += (m.stability ?? 0) * k;
    mods.luck += (m.luck ?? 0) * k;
    mods.mass *= 1 + ((m.mass ?? 1) - 1) * k;
  }
  return { tags, element, mods, hue, matched };
}

/** Elemental advantage multiplier for attacker → defender. */
export function elementMultiplier(att: Element | null, def: Element | null): number {
  if (!att || !def) return 1;
  const table: Partial<Record<Element, Partial<Record<Element, number>>>> = {
    water: { fire: 1.5 },
    fire: { plant: 1.5, ice: 1.5 },
    thunder: { water: 1.5 },
    earth: { thunder: 1.4 },
    plant: { earth: 1.3, water: 1.3 },
    ice: { plant: 1.3 },
    light: { dark: 1.3 },
    dark: { light: 1.3 },
  };
  return table[att]?.[def] ?? 1;
}
