/**
 * Sports versions of the arena signature moves. A character keeps its identity (same text,
 * same move NAME, same props / element / flavour); only the mechanic is translated into a ball
 * game. Every arena MoveKind maps to one shared sport action; each game (soccer, basketball)
 * decides how that action plays out on its court, with its own cooldowns and conditions.
 *
 *   火 「引火烧身」 arena: charges in on fire → soccer: fire power shot → basketball: fire dunk
 *   404 「404 Not Found」 arena: vanishes     → soccer: blink past a marker (never a free goal)
 */
import type { BehaviorTag, Element } from '../core/BehaviorResolver';
import { RANDOM_KINDS, type MoveKind, type MoveName, type MoveOpts, type Signature } from '../core/SignatureMoves';
import type { FighterSpec } from '../core/StatGenerator';

export type SportSkillKind =
  /** Shots */
  | 'powerShot' | 'curveShot' | 'beamShot' | 'skyShot'
  /** On the ball */
  | 'dash' | 'blink' | 'decoy'
  /** Against the ball carrier / area */
  | 'shockwave' | 'disable' | 'steal' | 'rain' | 'cloud'
  /** Team / defence */
  | 'wall' | 'rally';

/** When the AI may fire it. */
export type SkillUse = 'shoot' | 'carry' | 'defend' | 'any';

export type DisableKind = 'freeze' | 'sleep' | 'confuse' | 'laugh' | 'money' | 'charm';

export interface SportSkill {
  kind: SportSkillKind;
  use: SkillUse;
  /** Same localised name as the arena move. */
  name: MoveName;
  /** The arena mechanic it came from ('random' re-rolls each use). */
  move: MoveKind;
  /** The text that granted it (empty for shape-based moves). */
  key: string;
  opts?: MoveOpts;
  disable?: DisableKind;
  /** Roar-style cone instead of a ring (shockwave). */
  cone?: boolean;
}

const MAP: Record<MoveKind, { kind: SportSkillKind; disable?: DisableKind; cone?: boolean }> = {
  barrage: { kind: 'dash' },
  uppercut: { kind: 'skyShot' },
  quake: { kind: 'shockwave' },
  beam: { kind: 'beamShot' },
  whirlwind: { kind: 'curveShot' },
  charge: { kind: 'dash' },
  giant: { kind: 'wall' },
  freeze: { kind: 'disable', disable: 'freeze' },
  heal: { kind: 'rally' },
  meteor: { kind: 'skyShot' },
  kick: { kind: 'powerShot' },
  throw: { kind: 'steal' },
  shield: { kind: 'wall' },
  roar: { kind: 'shockwave', cone: true },
  magnet: { kind: 'steal' },
  poison: { kind: 'cloud' },
  bribe: { kind: 'disable', disable: 'money' },
  lecture: { kind: 'disable', disable: 'sleep' },
  chomp: { kind: 'steal' },
  joke: { kind: 'disable', disable: 'laugh' },
  confuse: { kind: 'disable', disable: 'confuse' },
  sweep: { kind: 'shockwave' },
  giantFall: { kind: 'shockwave' },
  swallow: { kind: 'steal' },
  mountain: { kind: 'wall' },
  fireCharge: { kind: 'powerShot' },
  laughQuake: { kind: 'shockwave' },
  lazy: { kind: 'wall' },
  feint: { kind: 'blink' },
  fishSlap: { kind: 'curveShot' },
  blame: { kind: 'wall' },
  drop: { kind: 'rain' },
  vanish: { kind: 'blink' },
  topple: { kind: 'shockwave' },
  random: { kind: 'dash' },
  glare: { kind: 'disable', disable: 'freeze' },
  rage: { kind: 'dash' },
  clones: { kind: 'decoy' },
};

export const SKILL_USE: Record<SportSkillKind, SkillUse> = {
  powerShot: 'shoot', curveShot: 'shoot', beamShot: 'shoot', skyShot: 'shoot',
  dash: 'carry', blink: 'carry', decoy: 'carry',
  shockwave: 'any', disable: 'defend', steal: 'defend', rain: 'defend', cloud: 'defend',
  wall: 'defend', rally: 'any',
};

export const SPORT_SKILL_KINDS = Object.keys(SKILL_USE) as SportSkillKind[];

export function sportSkillFor(sig: Signature): SportSkill {
  const m = MAP[sig.kind];
  return { kind: m.kind, use: SKILL_USE[m.kind], name: sig.name, move: sig.kind, key: sig.key, opts: sig.opts, disable: m.disable, cone: m.cone };
}

/** 随便 / ? / ガチャ: a different concrete skill every time (deterministic per rng draw). */
export function rerollRandom(skill: SportSkill, pick: <T>(a: readonly T[]) => T): SportSkill {
  if (skill.move !== 'random') return skill;
  const m = MAP[pick(RANDOM_KINDS)];
  return { ...skill, kind: m.kind, use: SKILL_USE[m.kind], disable: m.disable, cone: m.cone };
}

/** Ball-game attributes, balanced separately from the arena (all derived from the same stats). */
export interface SportAttributes {
  /** Top running speed (m/s). */
  pace: number;
  accel: number;
  /** Shot speed bonus 0‥1. */
  power: number;
  /** Dribbling, first touch, keeping the ball under a tackle: 0‥1. */
  control: number;
  /** Tackling / blocking: 0‥1. */
  defense: number;
  /** Shot / pass accuracy: 0‥1. */
  accuracy: number;
  /** Body mass for collisions (clamped so huge words can't bulldoze everyone). */
  mass: number;
  /** Collision proxy radius (clamped: complex glyphs don't become walls). */
  radius: number;
  /** Jump / header reach 0‥1. */
  jump: number;
  luck: number;
  tags: BehaviorTag[];
  element: Element | null;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function sportAttributes(spec: FighterSpec): SportAttributes {
  const s = spec.stats;
  const has = (t: BehaviorTag) => spec.tags.includes(t);
  const mass = clamp(spec.mass, 0.6, 2.2);
  // Ranges are kept narrow on purpose: in a team game a big pace gap decides everything.
  let pace = 5.6 + (s.speed / 100) * 1.4 - (mass - 1.2) * 0.3;
  if (has('hasty')) pace += 0.2;
  if (has('heavy')) pace -= 0.15;
  if (has('tiny')) pace += 0.1;
  return {
    pace: clamp(pace, 5.2, 7.0),
    accel: clamp(15 + s.speed * 0.06 - mass * 2, 11, 20),
    power: clamp(0.25 + s.attack / 200 + (mass - 1.2) * 0.08 + (has('star') ? 0.06 : 0), 0.15, 0.9),
    // Squeezed toward the middle: shape still gives each glyph a profile, but tackling and
    // dribbling can't make one lineup unbeatable.
    control: clamp(0.5 + ((s.stability * 0.55 + s.defense * 0.2 + s.speed * 0.25) / 100 - 0.5) * 0.55, 0.3, 0.75),
    defense: clamp(0.5 + ((s.defense * 0.6 + s.stability * 0.25 + s.weight * 0.15) / 100 - 0.5) * 0.55 + (has('angry') ? 0.04 : 0), 0.3, 0.75),
    accuracy: clamp((s.stability * 0.35 + s.attack * 0.25 + s.luck * 0.15 + 25) / 100 - (has('chaos') ? 0.08 : 0), 0.15, 0.95),
    mass,
    radius: clamp(spec.radius * 0.62, 0.36, 0.62),
    jump: clamp(spec.personality.jumpiness * 0.7 + (has('flyer') || has('bouncy') ? 0.35 : 0) + 0.1, 0.05, 1),
    luck: s.luck / 100,
    tags: spec.tags,
    element: spec.element,
  };
}

export type RatingKey = 'pace' | 'power' | 'control' | 'defense' | 'accuracy' | 'jump';
export const RATING_KEYS: RatingKey[] = ['pace', 'power', 'control', 'defense', 'accuracy', 'jump'];
/** The clamp range of each attribute above, so a rating spans the whole range a glyph can reach. */
const RATING_RANGE: Record<RatingKey, [number, number]> = {
  pace: [5.2, 7.0], power: [0.15, 0.9], control: [0.3, 0.75], defense: [0.3, 0.75], accuracy: [0.15, 0.95], jump: [0.05, 1],
};

/** Ball-game attributes as 20‥99 ratings for the team sheet (display only; the sim uses the raw values). */
export function sportRatings(spec: FighterSpec): Record<RatingKey, number> {
  const a = sportAttributes(spec);
  const out = {} as Record<RatingKey, number>;
  for (const k of RATING_KEYS) {
    const [lo, hi] = RATING_RANGE[k];
    out[k] = Math.round(20 + 79 * clamp((a[k] - lo) / (hi - lo), 0, 1));
  }
  return out;
}
