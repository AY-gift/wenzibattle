import type { Signature } from '@shared/core/SignatureMoves';
import type { FighterSpec } from '@shared/core/StatGenerator';

export type FState =
  | 'intro' | 'idle' | 'approach' | 'circle' | 'retreat' | 'windup' | 'lunge' | 'dashWind' | 'dash'
  | 'brake' | 'recover' | 'dodge' | 'hit' | 'down' | 'getup' | 'stunned' | 'sleep' | 'charmed'
  | 'flame' | 'gas' | 'charmCast' | 'spin' | 'hop' | 'pounceWind' | 'pounce' | 'taunt'
  | 'laugh' | 'playDead' | 'fuse' | 'phase' | 'panic' | 'ko' | 'victory' | 'signature' | 'frozen' | 'distracted' | 'confused';

export type AttackKind = 'lunge' | 'dash' | 'stomp' | 'spin' | 'pounce' | 'panic' | 'surprise' | 'charge' | 'kick';

export type EventType =
  | 'ready' | 'fight' | 'land' | 'windup' | 'dash' | 'hit' | 'crit' | 'clash' | 'wallCrash' | 'slam'
  | 'fallOff' | 'ringout' | 'ko' | 'down' | 'getup' | 'dodge' | 'luckyDodge' | 'trip' | 'pop'
  | 'doubleDown' | 'upset' | 'flame' | 'burn' | 'steam' | 'gas' | 'charm' | 'spin' | 'dizzy' | 'hop'
  | 'stomp' | 'pounce' | 'taunt' | 'laugh' | 'laughFall' | 'sleep' | 'wake' | 'rudeAwakening'
  | 'playDead' | 'fooled' | 'revive' | 'fuse' | 'explode' | 'phase' | 'surprise' | 'slip' | 'zap' | 'panic'
  | 'ropeBounce' | 'slingshot' | 'overRope' | 'suddenDeath' | 'timeUp' | 'finish' | 'elementBonus'
  // signature moves
  | 'signature' | 'quake' | 'beam' | 'freeze' | 'heal' | 'meteor' | 'meteorImpact' | 'throw' | 'reflect'
  | 'roar' | 'magnet' | 'poison' | 'bribe' | 'lecture' | 'chomp' | 'joke' | 'giant' | 'confuse'
  // signature moves, batch 2
  | 'swallow' | 'spit' | 'soot' | 'lazy' | 'feint' | 'slap' | 'blame' | 'blameReflect' | 'vanish' | 'propArc' | 'tremor'
  // batch 3
  | 'countdown' | 'clones' | 'lightsOut';

export interface BattleEvent {
  t: number;
  type: EventType;
  /** Actor index. */
  a: 0 | 1;
  /** Other party, if any. */
  b?: 0 | 1;
  /** Magnitude (damage, speed …). */
  v?: number;
  x?: number;
  y?: number;
  z?: number;
  /** Signature move kind (for 'signature' events). */
  move?: string;
}

export interface Counters {
  hits: number;
  damageDealt: number;
  maxHit: number;
  wallCrashes: number;
  downs: number;
  dodges: number;
  minHp: number;
}

export type EndReason = 'ko' | 'ringout' | 'timeup' | 'draw';

export interface BattleResult {
  winner: 0 | 1 | null;
  reason: EndReason;
  drawKind?: 'doubleKO' | 'doubleRingout';
  /** Battle clock when the match was decided. */
  time: number;
  seed: number;
  hp: [number, number];
  counters: [Counters, Counters];
  events: BattleEvent[];
  /** The event that decided the match. */
  decisive: BattleEvent | null;
  luckDecided: boolean;
  names: [string, string];
  signatures: [Signature, Signature];
}

export interface Combat {
  maxSpeed: number;
  accel: number;
  dashSpeed: number;
  dashTime: number;
  lungeSpeed: number;
  dmgMult: number;
  takenMult: number;
  kbResist: number;
  fallThreshold: number;
  recoverTime: number;
  critChance: number;
  dodgeSkill: number;
  friction: number;
  restitution: number;
  tiltK: number;
}

export type { FighterSpec };
