/**
 * Glyph Basketball 2v2 — simulation types. Deterministic like the other games: fixed 1/60 s
 * step, seeded RNG, never reads from the renderer.
 */
import type { FighterSpec } from '@shared/core/StatGenerator';
import type { BasketPrim, CultureBasketPair, CultureMatchup } from '@shared/sports/culture';
import type { DisableKind, SportAttributes, SportSkill } from '@shared/sports/skills';
import type { TeamInput } from '@shared/sports/team';

export const DT = 1 / 60;
export const TEAM_SIZE = 2;

/**
 * Court: x is the long axis. Team 0 attacks the hoop at +x, team 1 the one at −x. Arcade rules:
 * walls all round (the ball bounces back in, no out-of-bounds), no fouls, a 12 s shot clock.
 */
export const COURT = {
  halfL: 12,
  halfW: 7.5,
  /** Rim centre distance from the centre line, rim height and radius (arcade-sized). */
  hoopX: 10.4,
  rimH: 2.45,
  rimR: 0.46,
  rimTube: 0.04,
  /** Backboard plane (x), half width, bottom and top. */
  boardX: 11.05,
  boardHalfW: 1.0,
  boardBottom: 2.25,
  boardTop: 3.3,
  /** Three-point distance from the rim centre (corner threes are a little shorter). */
  threeR: 5.6,
  cornerZ: 5.4,
  ballR: 0.22,
  gravity: 13,
  /** Players fall slower than the ball: arcade hang time (热血-style flying). */
  playerGravity: 8.5,
} as const;

export const GAME_TIME = 90;
export const OVERTIME = 15;
export const INTRO_TIME = 2;
export const SCORE_PAUSE = 1.6;
export const EPILOGUE_TIME = 3;
export const SHOT_CLOCK = 12;

export interface V2 {
  x: number;
  z: number;
}

export type PlayerState =
  | 'play' | 'shoot' | 'pass' | 'dunk' | 'jump' | 'reach' | 'down' | 'skill' | 'celebrate'
  | DisableKind;

export type Role = 'carrier' | 'partner' | 'guardBall' | 'guardMan' | 'chaser' | 'rebounder' | 'free';

export interface PlayerStats {
  points: number;
  twos: number;
  threes: number;
  dunks: number;
  shots: number;
  made: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  skills: number;
  skillHits: number;
  fights: number;
}

export type ShotKind = 'jump' | 'layup' | 'dunk' | 'three' | 'highArc' | 'bank' | 'beam' | 'tip' | 'combo';

/** An action being wound up (released when the wind-up ends, cancelled if the ball is lost). */
export interface Action {
  kind: 'pass' | 'shot' | 'dunk';
  /** Pass target point / receiver. */
  target: V2;
  to: number;
  shot: ShotKind;
  /** Pass: loft 0 (chest) … 1 (lob). Shot: extra arc 0‥1. */
  loft: number;
  /** Lateral curl of a curving pass. */
  curl: number;
  /** Aim at the backboard instead of the rim. */
  bank: boolean;
  /** Accuracy multiplier on the error (0.4 = much more accurate). */
  care: number;
  /** Shown name for skill / combo shots. */
  label?: string;
  fx?: string;
  /** Dunk / shot that is hard to block. */
  power?: boolean;
  /** A dunk that takes off far from the rim and flies there. */
  flying?: boolean;
}

export interface Player {
  id: number;
  team: 0 | 1;
  idx: number;
  spec: FighterSpec;
  attr: SportAttributes;
  skill: SportSkill;
  p: V2;
  v: V2;
  y: number;
  vy: number;
  face: V2;
  state: PlayerState;
  stateT: number;
  role: Role;
  target: V2;
  /** The opponent this player guards. */
  mark: number;
  actCd: number;
  stealCd: number;
  jumpCd: number;
  skillCd: number;
  skillUses: number;
  boostT: number;
  wallT: number;
  ghostT: number;
  rallyT: number;
  slowT: number;
  pending: Action | null;
  /** Drive to the rim, then dunk (power dunk skill / combos). */
  dunkDrive: number;
  fightCd: number;
  grudge: number;
  grudgeT: number;
  stats: PlayerStats;
}

export interface Ball {
  p: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  owner: number;
  /** Lateral curl (curving passes). */
  curl: number;
  /** Active shot: who, kind, points if it goes in, when; cleared on a touch. */
  shot: { by: number; kind: ShotKind; t: number; points: 2 | 3; label?: string; power: boolean; touchedRim: boolean } | null;
  /** Last player to touch it, and the passer before the current owner (assists). */
  lastTouch: number;
  passer: number;
  passT: number;
  /** Receiver of the pass in flight. */
  passTo: number;
  noPickBy: number;
  noPickT: number;
  homingTo: number;
  /** Ball came off a missed shot (the next pick-up is a rebound). */
  rebound: boolean;
  fx: string | null;
  /** Visual dribble phase (renderer only reads it). */
  dribble: number;
}

export type EventType =
  | 'tipoff' | 'pass' | 'shot' | 'score' | 'miss' | 'rim' | 'board' | 'block' | 'steal' | 'stealFail' | 'rebound'
  | 'dunk' | 'airCrash' | 'shotClock' | 'knockdown' | 'skill' | 'skillHit' | 'combo' | 'prim' | 'rivalry' | 'intercept'
  | 'buzzer' | 'overtime' | 'finish' | 'bounce' | 'luckyRoll'
  | 'fight' | 'fightHit' | 'fightMiss' | 'brawl' | 'brawlEnd';

export interface MatchEvent {
  t: number;
  type: EventType;
  team: 0 | 1;
  a: number;
  b?: number;
  v?: number;
  x?: number;
  z?: number;
  kind?: string;
  label?: string;
}

export type CultureFx =
  | 'sprint' | 'doubleTeam' | 'paintWall' | 'blockBoost' | 'stealBoost' | 'reboundBoost' | 'lowGravity' | 'calm' | 'accuracy'
  | 'tired' | 'gap' | 'spotlight' | 'screen';

export interface TeamState {
  input: TeamInput;
  /** Culture / idiom pair of this team (the 13 idiom pairs keep their registered names). */
  culture: CultureBasketPair | null;
  cultureCd: number;
  cultureUses: number;
  fx: Partial<Record<CultureFx, number>>;
  /** Ball actions still to come, hold before the next one, and how long the queue may wait. */
  cQueue: (BasketPrim | '_toCutter' | '_finish')[];
  /** A run the normal AI must not override (cutter to the rim / to the arc). */
  cRun: { id: number; x: number; z: number } | null;
  /** Fired on defence: the queued attack waits until we win the ball. */
  cWaitBall: boolean;
  cFollowT: number;
  cFollowLife: number;
  luckCharges: number;
  /** Backfires: the next shot flies wild / the next pass goes astray. */
  wildNext: number;
  passWild: number;
  tiredAfter: boolean;
  /** Calm / peace: no fights started while > 0. */
  peaceT: number;
  shotClock: number;
  lastShotT: number;
  lastMissT: number;
  lastScoreT: number;
  lastConcedeT: number;
  lastStealT: number;
  tipoffT: number;
}

export type Rivalry = CultureMatchup & { swapped: boolean };

export interface ScoreRecord {
  t: number;
  team: 0 | 1;
  scorer: number;
  assist: number;
  points: 2 | 3;
  kind: ShotKind;
  label?: string;
}

export interface MatchResult {
  seed: number;
  score: [number, number];
  winner: 0 | 1 | null;
  overtime: boolean;
  time: number;
  scores: ScoreRecord[];
  events: MatchEvent[];
  mvp: number;
  teams: [TeamInput, TeamInput];
}
