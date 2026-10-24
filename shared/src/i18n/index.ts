/**
 * Language state shared by every Glyph game (one localStorage key, so the language follows the
 * player between Arena / Soccer / Basketball) plus the text that describes a CHARACTER:
 * shape traits, behaviour tags and elements. Game-specific UI strings live in each game.
 */
import type { BehaviorTag, Element } from '../core/BehaviorResolver';
import type { FighterSpec, TraitKey } from '../core/StatGenerator';

export type Lang = 'ja' | 'zh' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
];

const PUNCT: Record<Lang, { sep: string; end: string; open: string; close: string }> = {
  ja: { sep: '・', end: '。', open: '「', close: '」' },
  zh: { sep: '、', end: '。', open: '「', close: '」' },
  en: { sep: ', ', end: '.', open: '“', close: '”' },
};

export const TRAIT_TEXT: Record<Lang, Record<TraitKey, string>> = {
  ja: { heavy: 'ずっしり重い', light: 'とても軽い', fast: 'すばしっこい', slow: '足が遅い', strong: '攻撃的', gentle: '攻撃は控えめ', tough: '守りが固い', fragile: '打たれ弱い', stable: 'どっしり安定', wobbly: 'ふらつきやすい', lucky: '運がいい', unlucky: '運が悪い', fortress: '要塞のような形', scattered: 'バラバラの部品', spiky: 'トゲトゲ', round: 'まんまる', symmetric: '左右対称', lopsided: 'いびつ', tall: 'ひょろ長い', wide: '横に広い' },
  zh: { heavy: '很重', light: '很轻', fast: '敏捷', slow: '行动迟缓', strong: '攻击力强', gentle: '攻击偏弱', tough: '防御坚固', fragile: '不耐打', stable: '稳如泰山', wobbly: '容易摇晃', lucky: '运气好', unlucky: '运气差', fortress: '像堡垒', scattered: '零件分散', spiky: '棱角多', round: '圆滚滚', symmetric: '左右对称', lopsided: '歪歪扭扭', tall: '细长', wide: '宽大' },
  en: { heavy: 'heavy', light: 'featherweight', fast: 'quick', slow: 'slow', strong: 'hard-hitting', gentle: 'gentle hitter', tough: 'tough', fragile: 'fragile', stable: 'rock-steady', wobbly: 'wobbly', lucky: 'lucky', unlucky: 'unlucky', fortress: 'fortress-shaped', scattered: 'in pieces', spiky: 'spiky', round: 'round', symmetric: 'symmetric', lopsided: 'lopsided', tall: 'lanky', wide: 'wide' },
};

export const BEHAVIOR_TEXT: Record<Lang, Record<BehaviorTag, string>> = {
  ja: { fire: 'ときどき火を噴く', slippery: 'つるつる滑る', flyer: 'ふわっと宙に舞う', hasty: 'すぐ突進して止まれない', sleepy: 'ときどき寝る', coward: '逃げ腰。追い詰められると暴れる', angry: 'ブチ切れ突撃型', skull: '死んだふりをする', slip: '突然すべって転ぶ', charm: '相手をメロメロにする', chaos: '行動が読めない', gas: '謎の気流を放つ', heavy: '動かざること山の如し', spinner: '高速回転アタック', royal: '偉そうに挑発する', pounce: '飛びかかる', loyal: 'どこまでも追いかける', laugh: '笑い転げる', electric: '電撃でしびれさせる', star: '会心が出やすい', explode: 'ピンチで自爆する', ghost: 'すり抜けて背後へ回る', bouncy: 'よく弾む', tiny: 'ちっちゃい', giant: 'でっかい' },
  zh: { fire: '偶尔喷火', slippery: '移动很滑', flyer: '会短暂飞起', hasty: '频繁冲刺但容易失控', sleepy: '偶尔睡觉', coward: '倾向躲避，被逼急会反击', angry: '暴躁，攻击积极', skull: '会装死', slip: '可能突然滑倒', charm: '会魅惑对手', chaos: '行为难以预测', gas: '释放神秘气流', heavy: '不动如山', spinner: '高速旋转攻击', royal: '傲慢地挑衅', pounce: '会扑击', loyal: '穷追不舍', laugh: '会笑到打滚', electric: '电击使对手麻痹', star: '容易打出会心一击', explode: '危急时自爆', ghost: '穿透移动到背后', bouncy: '弹性十足', tiny: '小小的', giant: '巨大' },
  en: { fire: 'breathes fire now and then', slippery: 'slides around', flyer: 'takes to the air', hasty: 'dashes and can’t stop', sleepy: 'naps mid-fight', coward: 'runs away… until cornered', angry: 'furious attacker', skull: 'plays dead', slip: 'may suddenly slip', charm: 'charms the opponent', chaos: 'unpredictable', gas: 'releases mysterious gas', heavy: 'immovable', spinner: 'spin attacks', royal: 'taunts royally', pounce: 'pounces', loyal: 'relentless chaser', laugh: 'laughs itself silly', electric: 'zaps on hit', star: 'lands lucky crits', explode: 'self-destructs when desperate', ghost: 'phases behind you', bouncy: 'super bouncy', tiny: 'tiny', giant: 'huge' },
};

export const ELEMENT_TEXT: Record<Lang, Record<Element, string>> = {
  ja: { fire: '火', water: '水', thunder: '雷', plant: '草', ice: '氷', earth: '土', dark: '闇', light: '光' },
  zh: { fire: '火', water: '水', thunder: '雷', plant: '草', ice: '冰', earth: '土', dark: '暗', light: '光' },
  en: { fire: 'Fire', water: 'Water', thunder: 'Thunder', plant: 'Plant', ice: 'Ice', earth: 'Earth', dark: 'Dark', light: 'Light' },
};

let current: Lang = 'ja';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}
export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem('glyph-rumble-lang', l);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : l;
  listeners.forEach((f) => f());
}
export function initLang(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('glyph-rumble-lang');
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(location.search).get('lang');
  const pick = [q, saved].find((x) => x === 'ja' || x === 'zh' || x === 'en') as Lang | undefined;
  current = pick ?? 'ja';
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : current;
}
export function onLangChange(f: () => void): void {
  listeners.add(f);
}

export function elementName(e: Element): string {
  return ELEMENT_TEXT[current][e];
}

/** e.g. 「田」：ずっしり重い・どっしり安定・足が遅い。動かざること山の如し。 */
export function describeFighter(spec: FighterSpec): string {
  const d = PUNCT[current];
  const tr = spec.traits.map((k) => TRAIT_TEXT[current][k]);
  const bh = spec.tags.map((k) => BEHAVIOR_TEXT[current][k]);
  let s = `${d.open}${spec.name}${d.close}${current === 'en' ? ': ' : '：'}`;
  s += tr.length ? tr.join(d.sep) + d.end : '';
  if (bh.length) {
    const b = bh.join(d.sep);
    s += (current === 'en' ? ' ' + b.charAt(0).toUpperCase() + b.slice(1) : b) + d.end;
  }
  return s;
}
