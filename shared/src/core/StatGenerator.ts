/**
 * StatGenerator — converts glyph shape features (+ a few meaning-based modifiers) into
 * fighter stats. Deterministic: same text + font + generator version → same stats.
 *
 * Balance rule: speed/attack/defense/stability share a fixed budget (their mean is ~50),
 * so longer or bigger inputs change the *profile* of a fighter but never make it stronger
 * overall. Weight is a physical property (double-edged), luck is capped and mostly cosmetic.
 */
import type { GlyphFeatures } from './glyph/GlyphAnalyzer';
import { resolveBehavior, type BehaviorTag, type Element } from './BehaviorResolver';
import type { InputKind } from './InputProcessor';
import { hashString, Rng } from './rng';
import { resolveSignature, type Signature } from './SignatureMoves';

export const GENERATOR_VERSION = 'v1';

/**
 * Mean and spread of each raw signal over a 40-glyph reference set (kanji, kana, latin,
 * symbols, emoji, kaomoji). Signals are standardised with these so that a typical glyph
 * lands near 50 in every stat and no stat dominates just because its formula runs high.
 */
export const STAT_BASELINE = { speed: 0.506, attack: 0.377, defense: 0.46, stability: 0.651 };
export const STAT_SPREAD = { speed: 0.203, attack: 0.14, defense: 0.19, stability: 0.111 };
const z = (v: number, k: keyof typeof STAT_BASELINE) => ((v - STAT_BASELINE[k]) / STAT_SPREAD[k]) * 0.15;

export interface Stats {
  weight: number;
  speed: number;
  attack: number;
  defense: number;
  stability: number;
  luck: number;
}

export interface Personality {
  /** Likes to attack/dash. */
  aggression: number;
  /** Likes to wait, dodge and retreat. */
  caution: number;
  /** Randomness of decisions. */
  chaos: number;
  /** Likes to hop / leave the ground. */
  jumpiness: number;
}

export type TraitKey =
  | 'heavy' | 'light' | 'fast' | 'slow' | 'strong' | 'gentle' | 'tough' | 'fragile'
  | 'stable' | 'wobbly' | 'lucky' | 'unlucky' | 'fortress' | 'scattered' | 'spiky' | 'round'
  | 'symmetric' | 'lopsided' | 'tall' | 'wide';

export interface FighterSpec {
  key: string;
  name: string;
  kind: InputKind;
  seed: number;
  stats: Stats;
  /** Physical mass (≈0.5‥2.6). */
  mass: number;
  /** Collision radius in world units. */
  radius: number;
  height: number;
  depth: number;
  tags: BehaviorTag[];
  element: Element | null;
  personality: Personality;
  hue: number;
  traits: TraitKey[];
  /** Special move (必殺技). */
  signature: Signature;
  /** Raw derivation, kept for the stats breakdown & tests. */
  debug: Record<string, number>;
}

export interface SpecInput {
  text: string;
  graphemes: string[];
  kind: InputKind;
}

export interface Dims {
  width: number;
  height: number;
  depth: number;
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export function generateSpec(input: SpecInput, f: GlyphFeatures, dims: Dims, fontKey: string): FighterSpec {
  const seed = hashString(`${input.text}|${fontKey}|${GENERATOR_VERSION}`);
  const rng = new Rng(seed);
  const beh = resolveBehavior(input.text, input.graphemes);
  const mods = beh.mods;

  // --- Normalised shape measurements (each 0‥1; ranges calibrated on real glyphs) ---
  const massRaw = clamp(f.areaWorld / 2.4, 0.05, 1.1);
  const m1 = Math.min(1, massRaw);
  const aspectN = clamp((Math.log2(Math.max(0.05, f.aspect)) + 1.5) / 3);
  const thin = 1 - clamp((f.strokeWorld - 0.12) / 0.6);
  const spikeN = clamp((f.spikiness - 1) / 2.5);
  const fillN = clamp((f.fillRatio - 0.2) / 0.7);
  const offCenter = clamp(Math.abs(f.cx - 0.5) * 4);
  const holesN = Math.min(f.holes, 4) / 4;
  const bottomHeavy = clamp((0.5 - f.cy) * 3 + 0.5);
  const compN = clamp((f.components - 1) / 4);

  // --- Raw stat signals, standardised against a typical glyph ---
  const raw = {
    speed: z(0.55 * (1 - m1) + 0.3 * thin + 0.15 * (1 - aspectN) + 0.08 * compN, 'speed') + mods.speed,
    attack: z(0.45 * spikeN + 0.2 * offCenter + 0.2 * m1 + 0.15 * f.topHeavy, 'attack') + mods.attack,
    defense: z(0.45 * fillN + 0.25 * holesN + 0.3 * (1 - thin), 'defense') + mods.defense,
    stability: z(0.35 * aspectN + 0.25 * f.baseRatio + 0.2 * bottomHeavy + 0.2 * f.symmetry, 'stability') + mods.stability,
  };
  const luckRaw = 0.45 * (1 - f.symmetry) + 0.35 * rng.next() + 0.2 * compN + mods.luck;

  // --- Budget normalisation: mean of the four combat stats is pinned near 50 ---
  const keys = ['speed', 'attack', 'defense', 'stability'] as const;
  const mean = keys.reduce((s, k) => s + raw[k], 0) / keys.length;
  const budget: Record<(typeof keys)[number], number> = { speed: 0, attack: 0, defense: 0, stability: 0 };
  for (const k of keys) budget[k] = Math.round(clamp(50 + (raw[k] - mean) * 125 + (rng.next() - 0.5) * 8, 10, 95));
  // Re-centre after clamping so no profile exceeds the shared budget.
  const drift = Math.round(keys.reduce((s, k) => s + budget[k], 0) / keys.length - 50);
  if (drift !== 0) for (const k of keys) budget[k] = Math.round(clamp(budget[k] - drift, 10, 95));

  const mass = (0.7 + 1.1 * massRaw) * mods.mass;
  const stats: Stats = {
    weight: Math.round(clamp(6 + 90 * clamp((mass - 0.62) / 1.3), 3, 99)),
    ...budget,
    luck: Math.round(clamp(15 + 65 * luckRaw, 5, 95)),
  };

  // The signature table can add an everyday fighting style (平时怎么打) as passive traits.
  const signature = resolveSignature(input.text, input.graphemes, stats);
  const tags = [...beh.tags];
  for (const t of signature.normal ?? []) if (!tags.includes(t) && tags.length < 3) tags.push(t);
  const has = (t: BehaviorTag) => tags.includes(t);
  const p: Personality = {
    aggression: clamp(0.25 + 0.45 * (stats.attack / 100) + 0.2 * rng.next() + (has('angry') ? 0.3 : 0) - (has('coward') ? 0.3 : 0) + (has('loyal') ? 0.15 : 0) - (has('sleepy') ? 0.1 : 0)),
    caution: 0,
    chaos: clamp(0.08 + 0.35 * (stats.luck / 100) * (1 - f.symmetry * 0.6) + (has('chaos') ? 0.6 : 0) + compN * 0.1),
    jumpiness: clamp(0.08 + 0.25 * (stats.speed / 100) + (has('flyer') || has('pounce') ? 0.4 : 0) + (has('bouncy') ? 0.2 : 0)),
  };
  p.caution = clamp(0.15 + 0.4 * (stats.defense / 100) + 0.2 * rng.next() - p.aggression * 0.25 + (has('coward') ? 0.4 : 0));

  const radius = clamp(0.42 * dims.width + 0.08, 0.38, 1.25);
  const hue = beh.hue ?? Math.floor(rng.next() * 360);

  return {
    key: input.text,
    name: input.text,
    kind: input.kind,
    seed,
    stats,
    mass,
    radius,
    height: dims.height,
    depth: dims.depth,
    tags,
    element: beh.element,
    personality: p,
    hue,
    traits: pickTraits(stats, f),
    signature,
    debug: { massRaw, aspectN, thin, spikeN, fillN, offCenter, holesN, bottomHeavy, compN, luckRaw, rawSpeed: raw.speed, rawAttack: raw.attack, rawDefense: raw.defense, rawStability: raw.stability },
  };
}

function pickTraits(s: Stats, f: GlyphFeatures): TraitKey[] {
  const cands: { k: TraitKey; score: number }[] = [];
  const add = (dev: number, hi: TraitKey, lo: TraitKey, w = 1) => cands.push({ k: dev > 0 ? hi : lo, score: Math.abs(dev) * w });
  add(s.weight - 50, 'heavy', 'light', 0.9);
  add(s.speed - 50, 'fast', 'slow');
  add(s.attack - 50, 'strong', 'gentle');
  add(s.defense - 50, 'tough', 'fragile');
  add(s.stability - 50, 'stable', 'wobbly');
  add(s.luck - 50, 'lucky', 'unlucky', 0.6);
  if (f.holes >= 3) cands.push({ k: 'fortress', score: 22 });
  if (f.components >= 3) cands.push({ k: 'scattered', score: 18 });
  if (f.spikiness > 5.5) cands.push({ k: 'spiky', score: 14 });
  else if (f.spikiness < 1.6) cands.push({ k: 'round', score: 16 });
  if (f.symmetry > 0.92) cands.push({ k: 'symmetric', score: 10 });
  else if (f.symmetry < 0.45) cands.push({ k: 'lopsided', score: 12 });
  if (f.aspect < 0.55) cands.push({ k: 'tall', score: 12 });
  else if (f.aspect > 1.8) cands.push({ k: 'wide', score: 12 });
  cands.sort((a, b) => b.score - a.score);
  const out: TraitKey[] = [];
  for (const c of cands) {
    if (c.score < 8 || out.includes(c.k)) continue;
    out.push(c.k);
    if (out.length === 3) break;
  }
  return out;
}
