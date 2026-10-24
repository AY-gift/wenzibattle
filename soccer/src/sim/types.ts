/**
 * Glyph Soccer 4v4 — simulation types. The simulation is deterministic (fixed 1/60 s step,
 * seeded RNG) and never reads from the renderer, exactly like the arena.
 */
import type { FighterSpec } from '@shared/core/StatGenerator';
import type { ComboEntry, SoccerComboKind } from '@shared/sports/combos';
import type { DisableKind, SportAttributes, SportSkill } from '@shared/sports/skills';
import type { TeamInput } from '@shared/sports/team';
import type { CultureCombo, CultureMatchup, CulturePrim } from '@shared/sports/culture';

export const DT = 1 / 60;
export const TEAM_SIZE = 4;

/** Pitch: x is the long axis. Team 0 attacks +x, team 1 attacks −x. Boards all around (arcade rules). */
export const FIELD = {
  halfL: 20,
  halfW: 12.5,
  goalHalfW: 3.2,
  goalH: 2.2,
  goalDepth: 1.6,
  postR: 0.12,
  ballR: 0.32,
  gravity: 18,
} as const;

export const MATCH_TIME = 120;
export const GOLDEN_GOAL_TIME = 20;
export const INTRO_TIME = 2;
export const GOAL_PAUSE = 3;
export const EPILOGUE_TIME = 3;

export interface V2 {
  x: number;
  z: number;
}

export type PlayerState =
  | 'play' | 'kick' | 'tackle' | 'down' | 'dive' | 'celebrate' | 'skill'
  | DisableKind;

export type Role = 'carrier' | 'support' | 'runner' | 'anchor' | 'keeper' | 'chaser' | 'presser' | 'marker' | 'free';

export interface PlayerStats {
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  steals: number;
  tackles: number;
  passes: number;
  skills: number;
  /** Skill uses that changed something (knocked someone down, scored, stole…). */
  skillHits: number;
  ownGoals: number;
  /** Arena-style attacks that connected. */
  fights: number;
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
  /** Seconds left: kick wind-up, tackle cooldown, skill cooldown… */
  kickCd: number;
  tackleCd: number;
  skillCd: number;
  skillUses: number;
  /** Timed buffs. */
  boostT: number;
  wallT: number;
  ghostT: number;
  rallyT: number;
  slowT: number;
  /** Pending kick (wound up during state 'kick'). */
  pending: Kick | null;
  /** 一鸣惊人: charge built up while not touching the ball. */
  charge: number;
  /** Arena-style attack cooldown, and the opponent this player wants revenge on. */
  fightCd: number;
  grudge: number;
  grudgeT: number;
  stats: PlayerStats;
}

export type ShotKind = 'normal' | 'powerShot' | 'curveShot' | 'beamShot' | 'skyShot' | 'combo' | 'bonus';

export interface Kick {
  kind: 'pass' | 'shot' | 'clear';
  target: V2;
  speed: number;
  /** Launch angle helper: 0 ground pass … 1 high lob. */
  loft: number;
  spin: number;
  shot: ShotKind;
  /** Receiver for passes. */
  to: number;
  /** Shown name for skill / combo shots. */
  label?: string;
  /** Visual flavour of the flying ball. */
  fx?: string;
  /** Override: bursts through keepers. */
  power?: boolean;
  /** Pass the receiver should wait for instead of chasing (off the boards). */
  hold?: boolean;
}

export interface Ball {
  p: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  /** Lateral curl acceleration (curve shots). */
  spin: number;
  owner: number;
  lastKicker: number;
  /** Kicker before the last one (assists). */
  prevKicker: number;
  prevKickT: number;
  /** Active shot (cleared when the ball is controlled). */
  shot: { by: number; kind: ShotKind; t: number; power: boolean; label?: string } | null;
  /** Beam shots fly flat for a moment. */
  flatT: number;
  /** Visual flavour while flying (fire, ice, star…). */
  fx: string | null;
  /** Nobody may pick it up for a moment after a kick by this player. */
  noPickBy: number;
  noPickT: number;
  /** Magnet / steal: this player gets the ball. */
  homingTo: number;
  /** Intended receiver of the pass in flight (runs onto it), -1 if none. */
  passTo: number;
  passHold: boolean;
}

export type EventType =
  | 'kickoff' | 'pass' | 'shot' | 'save' | 'block' | 'post' | 'goal' | 'ownGoal'
  | 'tackleWin' | 'tackleFail' | 'knockdown' | 'skill' | 'skillHit' | 'combo' | 'comboEnd'
  | 'intercept' | 'timeUp' | 'goldenGoal' | 'finish' | 'bounce' | 'luckyBounce' | 'bonusKick' | 'collide'
  /** Arena-style fighting on the pitch. */
  | 'fight' | 'fightHit' | 'fightMiss' | 'brawl' | 'brawlEnd'
  /** Culture combos: the primitive that just took real effect, and a matchup intro. */
  | 'prim' | 'rivalry';

export interface MatchEvent {
  t: number;
  type: EventType;
  team: 0 | 1;
  /** Main player id (‑1 if none). */
  a: number;
  /** Other player id. */
  b?: number;
  v?: number;
  x?: number;
  z?: number;
  /** Skill kind / combo kind / shot kind. */
  kind?: string;
  label?: string;
}

export interface TeamState {
  input: TeamInput;
  combo: ComboEntry<SoccerComboKind> | null;
  comboCd: number;
  /** Active combo effect seconds left. */
  comboT: number;
  comboUses: number;
  /** 火上浇油 stacks. */
  heat: number;
  /** 大吉大利 used. */
  luckUsed: boolean;
  /** Calm / peace effects: no fights started while > 0. */
  peaceT: number;
  /** 龙飞凤舞 / 天马行空 scripted passes left, and who should receive the next one. */
  chain: number;
  chainTo: number;
  /** Last time this team shot (画蛇添足). */
  lastShotT: number;
  /** 虎头蛇尾 announcements made. */
  phaseMarks: number;
  /** Culture combo (文化连携) of this team, if its four glyphs spell a registered one. */
  culture: CultureCombo | null;
  cultureCd: number;
  cultureUses: number;
  /** Timed culture effects (seconds left), see sim/culture.ts. */
  fx: Partial<Record<'sprint' | 'allOut' | 'retreat' | 'wallLine' | 'press' | 'calm' | 'grip' | 'tackleBoost' | 'accuracy' | 'chaosRun' | 'tired' | 'gap' | 'peace' | 'spotlight', number>>;
  /** Culture pass chain: passes left, receiver, and how it finishes. */
  cChain: number;
  cChainTo: number;
  cFinish: CulturePrim | null;
  /** Ball actions still to come (after a dribble burst / once the pass arrives), the hold time
   *  before the next one, and how long the queue may wait at all. */
  cQueue: CulturePrim[];
  cFollowT: number;
  cFollowLife: number;
  /** Lucky bounces in store, and a wild next kick (1) or one that may go the wrong way (2). */
  luckCharges: number;
  wildNext: number;
  tiredAfter: boolean;
  /** Trigger bookkeeping (match time of the last such moment). */
  lastConcedeT: number;
  lastSaveT: number;
  lastTackleT: number;
  lostBallT: number;
  kickoffT: number;
}

export type Rivalry = CultureMatchup & { swapped: boolean };

export interface GoalRecord {
  t: number;
  team: 0 | 1;
  scorer: number;
  assist: number;
  shot: ShotKind;
  label?: string;
  own: boolean;
}

export interface MatchResult {
  seed: number;
  score: [number, number];
  winner: 0 | 1 | null;
  goldenGoal: boolean;
  time: number;
  goals: GoalRecord[];
  events: MatchEvent[];
  mvp: number;
  teams: [TeamInput, TeamInput];
}
