/**
 * FighterController — the automatic "brain" of one glyph. A small state machine whose
 * transition weights come from stats, personality and behaviour tags. All randomness
 * goes through the battle RNG so a battle seed fully reproduces a match.
 */
import type { BehaviorTag } from '@shared/core/BehaviorResolver';
import type { FighterSpec } from '@shared/core/StatGenerator';
import type { BattleSimulator } from './BattleSimulator';
import { moveRange, RANDOM_KINDS, type MoveKind } from '@shared/core/SignatureMoves';
import type { AttackKind, Combat, Counters, FState } from './types';

const SIG_DURATION: Record<MoveKind, number> = {
  barrage: 1.1, uppercut: 0.9, quake: 1.4, beam: 1.0, whirlwind: 1.3, charge: 0.95, giant: 0.7, freeze: 0.7, heal: 1.1,
  meteor: 1.4, kick: 1.2, throw: 0.9, shield: 1.6, roar: 0.9, magnet: 1.2, poison: 0.7, bribe: 0.8, lecture: 1.3, chomp: 0.8, joke: 1.3, confuse: 1.1,
  sweep: 1.3, giantFall: 1.6, swallow: 1.6, mountain: 1.5, fireCharge: 1.2, laughQuake: 1.6, lazy: 2.2, feint: 1.2, fishSlap: 1.5,
  blame: 0.6, drop: 1.4, vanish: 1.3, topple: 1.4, random: 1.0, glare: 1.0, rage: 1.65,
  clones: 1.6,
};

/** Moves that may still be airborne when their timer runs out (they end on landing). */
const ENDS_ON_LANDING = new Set<MoveKind>(['kick', 'mountain']);
/** States in which a fighter can be baited into a dash (逃跑大师 / 放鸽子). */
const BAITABLE: FState[] = ['idle', 'approach', 'circle', 'retreat', 'recover', 'brake', 'windup'];

export interface V2 {
  x: number;
  z: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function deriveCombat(spec: FighterSpec): Combat {
  const s = spec.stats.speed / 100;
  const atk = spec.stats.attack / 100;
  const def = spec.stats.defense / 100;
  const stab = spec.stats.stability / 100;
  const luck = spec.stats.luck / 100;
  const has = (t: BehaviorTag) => spec.tags.includes(t);
  const maxSpeed = (2.7 + 3.3 * s) * (has('heavy') ? 0.9 : 1);
  const slippery = has('slippery');
  return {
    maxSpeed,
    accel: (9 + 13 * s) * (slippery ? 0.6 : 1),
    dashSpeed: (maxSpeed * 1.85 + 1.6) * (has('hasty') ? 1.15 : 1),
    dashTime: has('hasty') ? 0.72 : 0.5,
    lungeSpeed: maxSpeed * 1.5 + 1.4,
    dmgMult: 0.7 + 0.8 * atk + (has('royal') ? 0.08 : 0),
    takenMult: 1.25 - 0.55 * def,
    // Very light glyphs dig in a little so they aren't simply swatted out of the ring.
    kbResist: (0.75 + 0.6 * stab) * (has('heavy') ? 1.25 : 1) * (has('royal') ? 1.1 : 1) * (1 + Math.max(0, 0.95 - spec.mass) * 1.2),
    fallThreshold: 0.62 + 0.55 * stab,
    recoverTime: 1.3 - 0.55 * stab,
    critChance: 0.04 + 0.1 * luck + (has('star') ? 0.08 : 0),
    // Small targets are harder to hit.
    dodgeSkill: clamp(0.08 + 0.32 * s * (0.5 + spec.personality.caution) + 0.12 * luck + Math.max(0, 0.75 - spec.radius) * 0.4, 0, 0.6),
    friction: slippery ? 3.8 : 6.0,
    restitution: has('bouncy') ? 0.85 : 0.35,
    tiltK: 40 + 45 * stab,
  };
}

export class FighterState {
  readonly c: Combat;
  readonly has: (t: BehaviorTag) => boolean;
  p: V2;
  v: V2 = { x: 0, z: 0 };
  y = 4.5;
  vy = 0;
  grounded = false;
  /** World-space lean vector; direction = where the top points, length = angle (rad). */
  tilt: V2 = { x: 0, z: 0 };
  tiltV: V2 = { x: 0, z: 0 };
  tiltTarget: V2 = { x: 0, z: 0 };
  /** Free tumbling (no spring) while airborne or knocked out. */
  tumbling = false;
  spin = 0;
  spinV = 0;
  hp = 100;
  readonly maxHp = 100;
  state: FState = 'intro';
  stateT = 0;
  stateDur = 0;
  /** Unit vector the fighter is attacking / facing in. */
  face: V2;
  desired: V2 = { x: 0, z: 0 };
  accelScale = 1;
  attackKind: AttackKind | null = null;
  lungeKind: AttackKind | null = null;
  hitDone = false;
  /** Increments every time a new attack starts (lets the opponent react once). */
  attackSerial = 0;
  seenOppSerial = 0;
  reactAt = -1;
  invuln = 0;
  hitCooldown = 0;
  angryBuff = 0;
  charmedBy = -1;
  phasing = false;
  out = false;
  ko = false;
  supported = true;
  onRope = false;
  /** Signature-move state. */
  sigUses = 0;
  sigStep = 0;
  sizeMul = 1;
  giantT = 0;
  shieldT = 0;
  poisonT = 0;
  /** Where a confused fighter is stumbling to. */
  wander: V2 = { x: 0, z: 0 };
  /** Signature kind actually being executed ('random' resolves to a concrete one). */
  sigKind: MoveKind | null = null;
  sigMark = 0;
  sigDir: V2 = { x: 1, z: 0 };
  /** Visual stretch along the glyph's width (一刀两断). */
  stretch = 1;
  /** Invisible (404 / 小人偷袭). */
  hiddenT = 0;
  /** Index of the fighter that swallowed this one (一口吞掉), or -1. */
  swallowedBy = -1;
  /** Temporary size boost (泰山压顶 / 大到离谱). */
  boostT = 0;
  boostSize = 1;
  /** On fire (引火烧身) and then sooty afterwards. */
  burning = false;
  sootT = 0;
  /** Next hit is partly bounced back to the attacker (甩锅). */
  blameT = 0;
  /** Lets a move lean the glyph past the voluntary-lean cap (lying down, toppling). */
  leanFree = false;
  overRope = false;
  ropeInSpeed = 0;
  strafeSign: 1 | -1 = 1;
  downTarget = Math.PI / 2;
  usedOnce = new Set<string>();
  cooldowns: Record<string, number> = {};
  lastHitBy = { t: -99, kind: '' as string };
  lastDownT = -99;
  slipClock = 0;
  counters: Counters = { hits: 0, damageDealt: 0, maxHit: 0, wallCrashes: 0, downs: 0, dodges: 0, minHp: 100 };

  constructor(
    readonly idx: 0 | 1,
    readonly spec: FighterSpec,
    start: V2,
  ) {
    this.c = deriveCombat(spec);
    this.has = (t) => spec.tags.includes(t);
    this.p = { ...start };
    this.face = { x: start.x < 0 ? 1 : -1, z: 0 };
    this.strafeSign = idx === 0 ? 1 : -1;
  }

  get radius(): number {
    return this.spec.radius * this.sizeMul;
  }
  get mass(): number {
    return this.spec.mass * this.sizeMul * this.sizeMul;
  }
  get tiltAngle(): number {
    return Math.hypot(this.tilt.x, this.tilt.z);
  }
  get controllable(): boolean {
    return this.grounded && !this.out && !this.ko;
  }
  get isAttacking(): boolean {
    return this.attackKind !== null && !this.hitDone;
  }
  get lying(): boolean {
    return this.state === 'down' || this.state === 'ko' || this.state === 'playDead' || this.state === 'sleep';
  }
}

const OPPORTUNITY: FState[] = ['down', 'sleep', 'charmed', 'stunned', 'getup', 'taunt', 'laugh', 'recover', 'brake', 'frozen', 'distracted', 'confused'];

export class FighterController {
  constructor(
    readonly f: FighterState,
    readonly sim: BattleSimulator,
  ) {}

  private get o(): FighterState {
    return this.sim.fighters[this.f.idx === 0 ? 1 : 0];
  }

  setState(s: FState, dur = 0): void {
    const f = this.f;
    if (f.state === 'signature' && s !== 'signature') this.leaveSignature();
    f.state = s;
    f.stateT = 0;
    f.stateDur = dur;
    f.accelScale = 1;
    if (s !== 'lunge' && s !== 'dash' && s !== 'spin' && s !== 'pounce' && s !== 'panic' && s !== 'hop') f.attackKind = null;
    if (s !== 'phase') f.phasing = false;
  }

  private startAttack(kind: AttackKind): void {
    const f = this.f;
    f.attackKind = kind;
    f.hitDone = false;
    f.attackSerial++;
  }

  private cd(name: string): boolean {
    return (this.f.cooldowns[name] ?? 0) <= 0;
  }
  private setCd(name: string, s: number): void {
    this.f.cooldowns[name] = s;
  }

  /** Vector & gap (surface distance) to the opponent. */
  private rel(): { dx: number; dz: number; d: number; gap: number; ux: number; uz: number } {
    const f = this.f, o = this.o;
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    return { dx, dz, d, gap: d - f.radius - o.radius, ux: dx / d, uz: dz / d };
  }

  private lookAtOpp(): void {
    const r = this.rel();
    this.f.face = { x: r.ux, z: r.uz };
  }

  update(dt: number): void {
    const f = this.f;
    const sim = this.sim;
    f.stateT += dt;
    for (const k in f.cooldowns) f.cooldowns[k] -= dt;
    f.invuln = Math.max(0, f.invuln - dt);
    f.hitCooldown = Math.max(0, f.hitCooldown - dt);
    f.angryBuff = Math.max(0, f.angryBuff - dt);
    f.desired.x = f.desired.z = 0;
    f.tiltTarget.x = f.tiltTarget.z = 0;
    f.leanFree = false;

    if (f.state === 'intro' || f.ko || f.out) return;
    if (f.state === 'victory') {
      if (f.grounded && f.stateT > 0.45) {
        f.vy = 4.2;
        f.grounded = false;
        f.spinV += 9 * (sim.rng.chance(0.5) ? 1 : -1);
        f.stateT = 0;
      }
      return;
    }
    if (sim.phase !== 'fight') return;

    if (f.state === 'signature') return this.runSignature(dt);
    // Airborne states keep their own logic; everything else needs footing.
    if (!f.grounded) {
      if (f.state === 'hop') this.updateHop(dt);
      else if (f.state === 'pounce') {
        /* ballistic */
      }
      return;
    }

    this.maybeReact();

    const r = this.rel();
    const o = this.o;
    switch (f.state) {
      case 'idle':
        this.lookAtOpp();
        this.wobbleIdle();
        if (f.stateT >= f.stateDur) this.think();
        break;
      case 'approach': {
        this.lookAtOpp();
        const side = 0.35 * f.strafeSign;
        this.steer(r.ux - r.uz * side, r.uz + r.ux * side, f.c.maxSpeed * (f.has('loyal') ? 1.1 : 1));
        if (r.gap < 0.5 || f.stateT >= f.stateDur) this.think();
        break;
      }
      case 'circle': {
        this.lookAtOpp();
        const keep = (r.gap - 2.2) * 0.6;
        this.steer(-r.uz * f.strafeSign + r.ux * keep, r.ux * f.strafeSign + r.uz * keep, f.c.maxSpeed * 0.75);
        if (f.stateT >= f.stateDur) this.think();
        break;
      }
      case 'retreat': {
        this.lookAtOpp();
        this.steer(-r.ux + r.uz * 0.4 * f.strafeSign, -r.uz - r.ux * 0.4 * f.strafeSign, f.c.maxSpeed * 0.85);
        if (Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) > sim.arena.half - 1.3) {
          if (f.has('coward') && this.cd('panic')) return this.startPanic();
          this.think();
        } else if (f.stateT >= f.stateDur) this.think();
        break;
      }
      case 'windup':
        this.lean(-0.3);
        if (f.stateT >= f.stateDur) {
          this.lookAtOpp();
          this.setState('lunge', 0.24);
          this.startAttack(f.lungeKind ?? 'lunge');
          f.lungeKind = null;
          f.v.x = f.face.x * f.c.lungeSpeed;
          f.v.z = f.face.z * f.c.lungeSpeed;
        }
        break;
      case 'lunge':
        this.drive(f.face, f.c.lungeSpeed, 3);
        this.lean(0.38);
        if (f.stateT >= f.stateDur) this.setState('recover', sim.rng.range(0.25, 0.45));
        break;
      case 'dashWind':
        this.lean(-0.35);
        if (f.stateT >= f.stateDur) {
          // Aim slightly ahead of a moving opponent.
          const lead = 0.25;
          const tx = o.p.x + o.v.x * lead - f.p.x, tz = o.p.z + o.v.z * lead - f.p.z;
          const l = Math.hypot(tx, tz) || 1;
          f.face = { x: tx / l, z: tz / l };
          this.setState('dash', f.c.dashTime);
          this.startAttack('dash');
          sim.emit({ type: 'dash', a: f.idx });
        }
        break;
      case 'dash':
      case 'panic':
        this.drive(f.face, f.state === 'panic' ? f.c.dashSpeed * 1.1 : f.c.dashSpeed, 2.2);
        this.lean(0.45);
        if (f.stateT >= f.stateDur) this.setState('brake', f.has('hasty') ? 0.55 : 0.35);
        break;
      case 'brake':
        f.accelScale = f.has('hasty') ? 0.18 : 0.45;
        this.lean(-0.25);
        if (f.stateT >= f.stateDur) this.setState('idle', 0.2);
        break;
      case 'recover':
        f.accelScale = 0.6;
        if (f.stateT >= f.stateDur) this.setState('idle', 0.12);
        break;
      case 'dodge':
        this.drive(f.face, f.c.maxSpeed * 1.9, 4);
        this.lean(0.3);
        if (f.stateT >= f.stateDur) {
          this.lookAtOpp();
          this.setState('idle', 0.15);
        }
        break;
      case 'hit':
        f.accelScale = 0;
        if (f.stateT >= f.stateDur) this.setState('idle', 0.1);
        break;
      case 'down':
        f.accelScale = 0;
        f.tiltTarget = this.downTilt();
        if (f.stateT >= f.stateDur) {
          this.setState('getup', 0.5);
          f.vy = 2.6;
          f.grounded = false;
          sim.emit({ type: 'getup', a: f.idx });
        }
        break;
      case 'getup':
        f.accelScale = 0.3;
        if (f.stateT >= f.stateDur && f.tiltAngle < 0.35) this.setState('idle', 0.15);
        break;
      case 'stunned':
        f.accelScale = 0.1;
        f.tiltTarget = { x: Math.sin(sim.t * 9) * 0.25, z: Math.cos(sim.t * 7) * 0.25 };
        if (f.stateT >= f.stateDur) this.setState('idle', 0.1);
        break;
      case 'sleep':
        f.accelScale = 0.2;
        f.tiltTarget = { x: f.strafeSign * 0.12, z: 0 };
        if (f.stateT >= f.stateDur) {
          sim.emit({ type: 'wake', a: f.idx });
          this.setState('idle', 0.3);
        }
        break;
      case 'charmed': {
        const ch = sim.fighters[f.charmedBy] ?? o;
        const dx = ch.p.x - f.p.x, dz = ch.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
        this.steer(dx / d, dz / d, f.c.maxSpeed * 0.35);
        f.tiltTarget = { x: Math.sin(sim.t * 6) * 0.3, z: 0 };
        if (f.stateT >= f.stateDur) {
          f.charmedBy = -1;
          this.setState('idle', 0.2);
        }
        break;
      }
      case 'flame':
        this.lookAtOpp();
        this.lean(0.15);
        f.accelScale = 0.3;
        if (f.stateT > 0.15 && f.stateT < 0.65 && (f.cooldowns.flameTick ?? 0) <= 0) {
          f.cooldowns.flameTick = 0.14;
          sim.flameTick(f);
        }
        if (f.stateT >= f.stateDur) this.setState('idle', 0.2);
        break;
      case 'gas':
        f.tiltTarget = { x: -f.face.x * 0.2, z: -f.face.z * 0.2 };
        if (f.stateT >= 0.25 && !f.usedOnce.has('gasNow')) {
          f.usedOnce.add('gasNow');
          sim.gasBlast(f);
        }
        if (f.stateT >= f.stateDur) {
          f.usedOnce.delete('gasNow');
          this.setState('idle', 0.2);
        }
        break;
      case 'charmCast':
        f.tiltTarget = { x: Math.sin(f.stateT * 20) * 0.15, z: 0 };
        if (f.stateT >= 0.3 && !f.usedOnce.has('charmNow')) {
          f.usedOnce.add('charmNow');
          sim.charmTry(f);
        }
        if (f.stateT >= f.stateDur) {
          f.usedOnce.delete('charmNow');
          this.setState('idle', 0.1);
        }
        break;
      case 'spin': {
        f.spinV = 26 * f.strafeSign;
        this.lookAtOpp();
        this.steer(r.ux, r.uz, f.c.maxSpeed * 0.7);
        if (f.hitDone && f.hitCooldown <= 0) f.hitDone = false; // multi-hit
        if (f.stateT >= f.stateDur) {
          if (sim.rng.chance(0.3 + (1 - f.spec.stats.stability / 100) * 0.3)) {
            this.setState('stunned', 0.8);
            sim.emit({ type: 'dizzy', a: f.idx });
          } else this.setState('idle', 0.2);
        }
        break;
      }
      case 'pounceWind':
        this.lookAtOpp();
        this.lean(-0.2);
        if (f.stateT >= f.stateDur) this.launchPounce();
        break;
      case 'taunt':
        f.tiltTarget = { x: Math.sin(f.stateT * 14) * 0.25, z: 0 };
        if (f.stateT > 0.15 && f.stateT % 0.35 < dt) {
          f.vy = 3.2;
          f.grounded = false;
        }
        if (f.stateT >= f.stateDur) this.setState('idle', 0.1);
        break;
      case 'laugh':
        f.tiltTarget = { x: Math.sin(f.stateT * 30) * 0.18, z: Math.cos(f.stateT * 26) * 0.12 };
        if (f.stateT >= f.stateDur) {
          if (f.usedOnce.delete('jokeHit') || sim.rng.chance(0.4)) {
            sim.emit({ type: 'laughFall', a: f.idx });
            this.fallDown({ x: f.strafeSign, z: 0.2 }, 0.9);
          } else this.setState('idle', 0.1);
        }
        break;
      case 'playDead':
        f.accelScale = 0;
        f.tiltTarget = this.downTilt();
        if (f.stateT >= f.stateDur) {
          f.hp = Math.min(f.maxHp, f.hp + 10);
          sim.emit({ type: 'revive', a: f.idx });
          f.vy = 5;
          f.grounded = false;
          f.tilt = { x: 0, z: 0 };
          f.tiltV = { x: 0, z: 0 };
          this.lookAtOpp();
          this.setState('dash', f.c.dashTime);
          this.startAttack('surprise');
        }
        break;
      case 'fuse':
        f.accelScale = 0.2;
        f.tiltTarget = { x: Math.sin(f.stateT * 40) * 0.1, z: Math.cos(f.stateT * 37) * 0.1 };
        if (f.stateT >= f.stateDur) {
          sim.explode(f);
          if (!f.ko && f.state === 'fuse') this.setState('idle', 0.2);
        }
        break;
      case 'phase': {
        // Slip around behind the opponent, then strike.
        const bx = o.p.x + o.face.x * -1.6 - f.p.x, bz = o.p.z + o.face.z * -1.6 - f.p.z;
        const bl = Math.hypot(bx, bz) || 1;
        this.steer(bx / bl, bz / bl, f.c.maxSpeed * 1.3);
        if (f.stateT >= f.stateDur || bl < 0.4) {
          f.phasing = false;
          this.lookAtOpp();
          sim.emit({ type: 'surprise', a: f.idx, b: o.idx });
          this.setState('lunge', 0.26);
          this.startAttack('surprise');
          f.v.x = f.face.x * f.c.lungeSpeed;
          f.v.z = f.face.z * f.c.lungeSpeed;
        }
        break;
      }
      case 'frozen':
        f.accelScale = 0;
        if (f.stateT >= f.stateDur) this.setState('idle', 0.1);
        break;
      case 'confused': {
        // 降智: stumble toward random spots, swinging at thin air.
        const dx = f.wander.x - f.p.x, dz = f.wander.z - f.p.z, d = Math.hypot(dx, dz);
        if (d < 0.5 || (f.cooldowns.wander ?? 0) <= 0) {
          f.cooldowns.wander = sim.rng.range(0.5, 0.9);
          const lim = sim.arena.half - 1.2;
          f.wander = { x: sim.rng.range(-lim, lim), z: sim.rng.range(-lim, lim) };
        }
        this.steer(dx / (d || 1), dz / (d || 1), f.c.maxSpeed * 0.55);
        f.tiltTarget = { x: Math.sin(sim.t * 7) * 0.3, z: Math.cos(sim.t * 5) * 0.25 };
        f.spinV = Math.sin(sim.t * 3) * 6;
        if (f.stateT >= f.stateDur) this.setState('idle', 0.15);
        break;
      }
      case 'distracted': {
        // Picking up the money: look down and shuffle around.
        f.accelScale = 0.3;
        f.tiltTarget = { x: f.face.x * 0.35, z: f.face.z * 0.35 };
        if (f.stateT >= f.stateDur) this.setState('idle', 0.1);
        break;
      }
      default:
        if (f.stateT >= f.stateDur) this.setState('idle', 0.2);
    }

    if (f.has('slip') && (f.state === 'approach' || f.state === 'circle' || f.state === 'retreat' || f.state === 'dash')) {
      f.slipClock += dt;
      if (f.slipClock > 1 && sim.t > 1.5) {
        f.slipClock = 0;
        if (sim.rng.chance(0.14)) {
          sim.emit({ type: 'slip', a: f.idx });
          this.fallDown({ x: -f.face.x, z: -f.face.z }, 0.7);
        }
      }
    }

  }

  /** Called by the simulator when this fighter is knocked over. */
  fallDown(dir: V2, dur?: number): void {
    const f = this.f;
    const l = Math.hypot(dir.x, dir.z) || 1;
    f.tiltV.x += (dir.x / l) * 6;
    f.tiltV.z += (dir.z / l) * 6;
    f.downTarget = Math.PI / 2;
    this.setState('down', dur ?? f.c.recoverTime * this.sim.rng.range(0.8, 1.2));
    f.counters.downs++;
    f.lastDownT = this.sim.t;
    this.sim.onDown(f);
  }

  private downTilt(): V2 {
    const f = this.f;
    const a = f.tiltAngle;
    if (a < 1e-3) return { x: f.downTarget, z: 0 };
    return { x: (f.tilt.x / a) * f.downTarget, z: (f.tilt.z / a) * f.downTarget };
  }

  private steer(dx: number, dz: number, speed: number): void {
    const f = this.f;
    let l = Math.hypot(dx, dz) || 1;
    let x = dx / l, z = dz / l;
    // Stay off the ropes while walking (dashes are committed and may still hit them).
    const margin = this.sim.arena.half - 1.1 - f.radius * 0.5;
    if (Math.abs(f.p.x) > margin) x -= Math.sign(f.p.x) * (Math.abs(f.p.x) - margin) * 1.8;
    if (Math.abs(f.p.z) > margin) z -= Math.sign(f.p.z) * (Math.abs(f.p.z) - margin) * 1.8;
    l = Math.hypot(x, z) || 1;
    x /= l;
    z /= l;
    f.desired.x = x * speed;
    f.desired.z = z * speed;
    // Lean into motion.
    f.tiltTarget.x += x * 0.12;
    f.tiltTarget.z += z * 0.12;
  }

  private drive(dir: V2, speed: number, accelScale: number): void {
    this.f.desired.x = dir.x * speed;
    this.f.desired.z = dir.z * speed;
    this.f.accelScale = accelScale;
  }

  private lean(amount: number): void {
    this.f.tiltTarget.x += this.f.face.x * amount;
    this.f.tiltTarget.z += this.f.face.z * amount;
  }

  private wobbleIdle(): void {
    const f = this.f;
    const shake = f.has('angry') || f.angryBuff > 0 ? 0.08 : 0.025;
    f.tiltTarget.x += Math.sin(this.sim.t * (f.has('angry') ? 31 : 4) + f.idx) * shake;
  }

  /** One dodge roll per incoming attack. */
  private maybeReact(): void {
    const f = this.f, o = this.o, sim = this.sim;
    if (o.attackSerial !== f.seenOppSerial && o.attackKind) {
      f.seenOppSerial = o.attackSerial;
      const free = f.state === 'idle' || f.state === 'approach' || f.state === 'circle' || f.state === 'retreat' || f.state === 'recover';
      if (free && sim.rng.chance(f.c.dodgeSkill)) f.reactAt = sim.t + sim.rng.range(0.03, 0.1);
    }
    if (f.reactAt > 0 && sim.t >= f.reactAt) {
      f.reactAt = -1;
      const free = f.state === 'idle' || f.state === 'approach' || f.state === 'circle' || f.state === 'retreat' || f.state === 'recover';
      if (!free) return;
      const r = this.rel();
      // Sidestep perpendicular to the incoming line, preferring the side toward the centre.
      let sx = -r.uz, sz = r.ux;
      if (sx * -f.p.x + sz * -f.p.z < 0) {
        sx = -sx;
        sz = -sz;
      }
      f.face = { x: sx, z: sz };
      f.v.x = sx * f.c.maxSpeed * 1.9;
      f.v.z = sz * f.c.maxSpeed * 1.9;
      this.setState('dodge', 0.28);
      f.counters.dodges++;
      sim.emit({ type: 'dodge', a: f.idx, b: o.idx });
    }
  }

  private think(): void {
    const f = this.f, o = this.o, sim = this.sim, rng = sim.rng;
    const r = this.rel();
    const p = f.spec.personality;
    const pressure = sim.pressure;
    let agg = p.aggression + pressure * 0.45 + (f.angryBuff > 0 ? 0.4 : 0);
    const cau = p.caution * (1 - pressure * 0.7);
    const w: Partial<Record<string, number>> = {};
    if (r.gap > 3.0) {
      w.approach = 1.0;
      w.dash = agg * 0.9 * (r.gap < 6 ? 1 : 0.4);
      w.circle = 0.35 * (1 - agg) + 0.05;
      w.idle = 0.12 * cau;
    } else if (r.gap > 0.9) {
      w.approach = 0.6;
      w.windup = 0.5 * agg;
      w.dash = 0.6 * agg;
      w.circle = 0.35 * cau + 0.1;
      w.retreat = 0.25 * cau;
      w.idle = 0.12;
    } else {
      w.windup = 0.9 * agg + 0.35;
      w.retreat = 0.45 * cau;
      w.circle = 0.15;
      w.idle = 0.08;
    }
    // Opportunism: punish a helpless opponent … unless it is playing dead.
    if (o.state === 'playDead') {
      w.windup = 0;
      w.dash = 0;
      w.idle = 0.6;
      w.taunt = 0.5;
      if (!f.usedOnce.has('fooled')) {
        f.usedOnce.add('fooled');
        sim.emit({ type: 'fooled', a: f.idx, b: o.idx });
      }
    } else if (OPPORTUNITY.includes(o.state)) {
      w.windup = (w.windup ?? 0) + agg * 1.1 * (r.gap < 2.5 ? 1 : 0.3);
      w.dash = (w.dash ?? 0) + agg * 0.8;
      w.approach = (w.approach ?? 0) + 0.3;
      agg += 0.2;
    }
    // Personality tags.
    if (f.has('hasty')) w.dash = (w.dash ?? 0) * 2.2 + 0.2;
    if (f.has('loyal')) {
      w.approach = (w.approach ?? 0) * 1.5;
      w.dash = (w.dash ?? 0) * 1.4;
      w.retreat = 0;
    }
    if (f.has('coward') && pressure < 0.6) {
      w.retreat = (w.retreat ?? 0) * 3 + (r.gap < 2 ? 0.6 : 0);
      w.windup = (w.windup ?? 0) * 0.5;
    }
    // Specials.
    this.addSpecials(w, r.gap);
    // Chaos flattens the distribution.
    if (p.chaos > 0.05) {
      const keys = Object.keys(w);
      const avg = keys.reduce((s, k) => s + (w[k] ?? 0), 0) / Math.max(1, keys.length);
      for (const k of keys) w[k] = (w[k] ?? 0) * (1 - p.chaos) + avg * p.chaos;
    }
    // Anti-stall: late in the match nobody runs away.
    if (sim.t > 11) {
      w.retreat = 0;
      w.circle = (w.circle ?? 0) * 0.3;
      w.idle = (w.idle ?? 0) * 0.3;
      w.taunt = (w.taunt ?? 0) * 0.3;
    }
    const choice = rng.weighted(w as Record<string, number>) ?? 'approach';
    f.strafeSign = rng.chance(0.25) ? (f.strafeSign === 1 ? -1 : 1) : f.strafeSign;
    this.begin(choice, cau);
  }

  private addSpecials(w: Partial<Record<string, number>>, gap: number): void {
    const f = this.f, o = this.o;
    const hpr = f.hp / f.maxHp;
    const j = 0.6 + f.spec.personality.jumpiness * 0.6;
    if (f.has('fire') && gap < 2.8 && this.cd('flame')) w.flame = 0.9;
    if (f.has('gas') && gap < 2.4 && this.cd('gas')) w.gas = 0.85;
    if (f.has('charm') && gap < 4.5 && o.state !== 'charmed' && this.cd('charm')) w.charmCast = 0.7;
    if (f.has('spinner') && gap < 3.5 && this.cd('spin')) w.spin = 0.9;
    if (f.has('flyer') && gap < 6 && this.cd('hop')) w.hop = 0.7 * j;
    if (f.has('pounce') && gap > 0.8 && gap < 4.5 && this.cd('pounce')) w.pounceWind = 0.9 * j;
    if (f.has('royal') && gap > 2 && this.cd('taunt')) w.taunt = 0.45;
    if (f.has('laugh') && this.cd('laugh')) w.laugh = o.lying ? 1.2 : 0.25;
    if (f.has('sleepy') && this.cd('sleep') && this.sim.t > 1) w.sleep = 0.5;
    if (f.has('ghost') && gap < 5 && this.cd('phase')) w.phase = 0.6;
    // Signature move: up to twice a match, when in range.
    const sig = f.spec.signature;
    const [r0, r1] = moveRange(sig.kind);
    const defensive = sig.kind === 'shield' || sig.kind === 'lazy';
    const sigOk = this.cd('sig') && this.sim.t > 1.5 && f.sigUses < 2 && gap >= r0 && gap <= r1 &&
      (sig.kind !== 'heal' || hpr < 0.75) && (sig.kind !== 'giant' || f.giantT <= 0) && (!defensive || o.attackKind !== null || hpr < 0.6) &&
      (sig.kind !== 'blame' || f.blameT <= 0);
    if (sigOk) w.signature = 1.3 + this.sim.pressure * 0.6;
    if (f.has('explode') && hpr < 0.38 && !f.usedOnce.has('fuse') && gap < 3) w.fuse = 3;
    if (f.has('chaos') && this.cd('chaos')) {
      w.spin = (w.spin ?? 0) + 0.3;
      w.hop = (w.hop ?? 0) + 0.3;
      w.taunt = (w.taunt ?? 0) + 0.15;
    }
    // Generic: very jumpy shapes sometimes hop in.
    if (!f.has('flyer') && f.spec.personality.jumpiness > 0.35 && gap < 4 && this.cd('hop')) w.hop = (w.hop ?? 0) + 0.2;
  }

  private begin(choice: string, cau: number): void {
    const f = this.f, sim = this.sim, rng = sim.rng;
    const p = f.spec.personality;
    switch (choice) {
      case 'approach':
        return this.setState('approach', rng.range(0.5, 1.2));
      case 'circle':
        return this.setState('circle', rng.range(0.5, 1.0));
      case 'retreat':
        return this.setState('retreat', f.has('coward') ? rng.range(0.6, 1.2) : rng.range(0.35, 0.7));
      case 'idle':
        return this.setState('idle', rng.range(0.15, 0.3 + cau * 0.4));
      case 'windup':
        sim.emit({ type: 'windup', a: f.idx });
        return this.setState('windup', Math.max(0.16, 0.34 - 0.14 * p.aggression - (f.has('angry') ? 0.06 : 0)));
      case 'dash':
        this.lookAtOpp();
        return this.setState('dashWind', f.has('hasty') ? 0.14 : 0.22);
      case 'flame':
        this.setCd('flame', 3.0);
        sim.emit({ type: 'flame', a: f.idx });
        return this.setState('flame', 0.75);
      case 'gas':
        this.setCd('gas', 4.0);
        return this.setState('gas', 0.6);
      case 'charmCast':
        this.setCd('charm', 4.5);
        return this.setState('charmCast', 0.55);
      case 'spin':
        this.setCd('spin', 3.5);
        this.setCd('chaos', 2);
        sim.emit({ type: 'spin', a: f.idx });
        this.setState('spin', 1.0);
        this.startAttack('spin');
        return;
      case 'hop': {
        this.setCd('hop', 2.6);
        this.setCd('chaos', 2);
        this.setState('hop', 1.3);
        f.vy = 7.2;
        f.grounded = false;
        sim.emit({ type: 'hop', a: f.idx });
        this.startAttack('stomp');
        return;
      }
      case 'pounceWind':
        this.setCd('pounce', 2.4);
        return this.setState('pounceWind', 0.28);
      case 'taunt':
        this.setCd('taunt', 5);
        sim.emit({ type: 'taunt', a: f.idx });
        return this.setState('taunt', 0.8);
      case 'laugh':
        this.setCd('laugh', 5);
        sim.emit({ type: 'laugh', a: f.idx });
        return this.setState('laugh', 0.9);
      case 'sleep':
        this.setCd('sleep', 5);
        sim.emit({ type: 'sleep', a: f.idx });
        return this.setState('sleep', rng.range(1.5, 2.5));
      case 'phase':
        this.setCd('phase', 4.5);
        sim.emit({ type: 'phase', a: f.idx });
        this.setState('phase', 1.1);
        f.phasing = true;
        return;
      case 'signature': {
        this.setCd('sig', 5.5);
        f.sigUses++;
        f.sigStep = 0;
        f.sigMark = 0;
        const base = f.spec.signature.kind;
        // 未知攻击 / 随便 / それな: turn into a random concrete move.
        const kind = base === 'random' ? rng.pick(RANDOM_KINDS) : base;
        this.lookAtOpp();
        const o2 = f.spec.signature.opts ?? {};
        const dur = o2.duration ?? (kind === 'roar' && o2.countdown ? 1.8 : kind === 'roar' && o2.pulses ? 0.6 + o2.pulses * 0.3 : SIG_DURATION[kind]);
        this.setState('signature', dur);
        f.sigKind = kind;
        if (o2.grow) {
          // 肉弹战车: puff up for the whole move.
          f.boostT = dur;
          f.boostSize = o2.grow;
        }
        sim.emit({ type: 'signature', a: f.idx, b: this.o.idx, move: kind });
        // 全场黑屏: any move can dim the arena (lazy handles its own darkness + confusion).
        if (o2.darkness && kind !== 'lazy') sim.emit({ type: 'lightsOut', a: f.idx, v: Math.min(2, dur + 0.4) });
        return;
      }
      case 'fuse':
        f.usedOnce.add('fuse');
        sim.emit({ type: 'fuse', a: f.idx });
        return this.setState('fuse', 1.0);
      default:
        return this.setState('approach', 0.6);
    }
  }

  private updateHop(dt: number): void {
    const f = this.f, o = this.o;
    // Hover: reduced gravity on the way down, drift above the opponent, then dive.
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(f.c.maxSpeed * 1.1, d * 2.5);
    f.v.x += ((dx / d) * sp - f.v.x) * Math.min(1, dt * 3);
    f.v.z += ((dz / d) * sp - f.v.z) * Math.min(1, dt * 3);
    if (f.vy < 0 && f.stateT < 0.9) f.vy += this.sim.gravity * 0.6 * dt;
    if (f.stateT > 0.9 && f.vy > -9) f.vy -= 14 * dt;
    f.face = { x: dx / d, z: dz / d };
    f.tiltTarget = { x: f.face.x * 0.3, z: f.face.z * 0.3 };
  }

  private launchPounce(): void {
    const f = this.f, o = this.o, sim = this.sim;
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    const vy = 5.5;
    const T = (2 * vy) / sim.gravity;
    const vh = Math.min(9.5, d / T);
    f.face = { x: dx / d, z: dz / d };
    f.v.x = f.face.x * vh;
    f.v.z = f.face.z * vh;
    f.vy = vy;
    f.grounded = false;
    this.setState('pounce', T + 0.1);
    this.startAttack('pounce');
    sim.emit({ type: 'pounce', a: f.idx, b: o.idx });
  }

  private startPanic(): void {
    const f = this.f, sim = this.sim;
    this.lookAtOpp();
    this.setState('panic', 0.6);
    this.startAttack('panic');
    this.setCd('panic', 4);
    sim.emit({ type: 'panic', a: f.idx });
  }

  // ---------------------------------------------------------------- signature moves

  /** Run the current signature move. `sigStep` gates one-shot moments on the timeline. */
  private runSignature(dt: number): void {
    const f = this.f, o = this.o, sim = this.sim;
    const r = this.rel();
    const T = f.stateT;
    const once = (step: number, at: number) => {
      if (f.sigStep < step && T >= at) {
        f.sigStep = step;
        return true;
      }
      return false;
    };
    const inFront = (r.ux * f.face.x + r.uz * f.face.z) > 0.2;
    const kind = f.sigKind ?? f.spec.signature.kind;
    const opts = f.spec.signature.opts ?? {};
    switch (kind) {
      case 'barrage':
        this.lookAtOpp();
        if (f.grounded) this.steer(r.ux, r.uz, f.c.maxSpeed * 0.7);
        f.tiltTarget = { x: f.face.x * 0.25 + Math.sin(T * 40) * 0.08, z: f.face.z * 0.25 };
        if (T > 0.15 && T < 0.95 && (f.cooldowns.sigTick ?? 0) <= 0 && r.gap < 0.8) {
          f.cooldowns.sigTick = 0.12;
          sim.strike(f, o, 3, 1.4, 0);
        }
        if (once(1, 0.95) && r.gap < 1.0) sim.strike(f, o, 8, 8, 2);
        // 打工人的怒火: finish by flinging paperwork.
        if (opts.prop && once(9, 1.0)) {
          for (let k = 0; k < (opts.count ?? 1); k++) sim.spawnDrop(f, o.p.x + sim.rng.range(-0.8, 0.8), o.p.z + sim.rng.range(-0.8, 0.8), 0.35 + k * 0.12, { prop: opts.prop, arc: true, dmg: 3, kb: 2, up: 0, radius: 1 });
        }
        break;
      case 'uppercut':
        if (T < 0.25) this.lean(-0.3);
        else if (T < 0.55) {
          this.drive(f.face, f.c.lungeSpeed * 1.1, 3);
          this.lean(0.2);
          if (f.sigStep < 1 && r.gap < 0.6) {
            f.sigStep = 1;
            sim.strike(f, o, 15, 3, 9.5);
            f.vy = 6;
            f.grounded = false;
          }
        }
        break;
      case 'quake':
        if (once(1, 0.05)) {
          f.vy = 8.5;
          f.grounded = false;
        }
        if (!f.grounded && f.vy < 0) f.vy -= 30 * dt; // slam down hard
        if (f.sigStep === 1 && f.grounded && T > 0.2) {
          f.sigStep = 2;
          sim.quake(f);
        }
        break;
      case 'beam':
        f.accelScale = 0;
        if (T < 0.45) this.lookAtOpp();
        f.tiltTarget = { x: -f.face.x * 0.15, z: -f.face.z * 0.15 };
        if (once(1, 0.45)) sim.beam(f);
        break;
      case 'whirlwind':
        if (once(1, 0)) this.startAttack('spin');
        f.spinV = 30;
        this.lookAtOpp();
        if (f.grounded) this.steer(r.ux, r.uz, f.c.maxSpeed * 0.5);
        if (f.hitDone && f.hitCooldown <= 0) f.hitDone = false;
        if (r.gap < 4 && !o.out) {
          o.v.x -= r.ux * 12 * dt;
          o.v.z -= r.uz * 12 * dt;
        }
        break;
      case 'charge':
        if (T < 0.3) {
          this.lookAtOpp();
          this.lean(-0.35);
        } else {
          if (once(1, 0.3)) this.startAttack('charge');
          this.drive(f.face, f.c.dashSpeed * 1.35, 2.5);
          this.lean(0.45);
        }
        break;
      case 'giant':
        f.accelScale = 0;
        f.tiltTarget = { x: Math.sin(T * 30) * 0.06, z: 0 };
        if (once(1, 0.3)) {
          f.giantT = 4.5;
          sim.emit({ type: 'giant', a: f.idx });
        }
        break;
      case 'freeze':
        f.accelScale = 0;
        if (once(1, 0.3) && r.gap < 3.6 && inFront && !o.out && o.grounded) {
          sim.ctrl[o.idx].setState('frozen', 1.7);
          o.v.x = o.v.z = 0;
          sim.emit({ type: 'freeze', a: f.idx, b: o.idx, x: o.p.x, z: o.p.z });
        }
        break;
      case 'heal':
        f.accelScale = 0;
        if (once(1, 0.8)) {
          const amount = Math.min(18, f.maxHp - f.hp);
          f.hp += amount;
          sim.emit({ type: 'heal', a: f.idx, v: amount });
        }
        break;
      case 'meteor':
        f.accelScale = 0;
        f.tiltTarget = { x: -f.face.x * 0.2, z: -f.face.z * 0.2 };
        for (let k = 0; k < 4; k++) {
          if (once(k + 1, 0.2 + k * 0.25)) {
            const tx = o.p.x + o.v.x * 0.4 + sim.rng.range(-0.7, 0.7), tz = o.p.z + o.v.z * 0.4 + sim.rng.range(-0.7, 0.7);
            sim.spawnMeteor(f, tx, tz, 0.5);
          }
        }
        break;
      case 'kick':
        if (once(1, 0.12)) {
          const vy = 4.2, Tf = (2 * vy) / sim.gravity;
          const vh = Math.min(13, (r.d / Tf) * 1.25);
          this.lookAtOpp();
          f.v.x = f.face.x * vh;
          f.v.z = f.face.z * vh;
          f.vy = vy;
          f.grounded = false;
          this.startAttack('kick');
        } else if (T < 0.12) this.lean(-0.3);
        else this.lean(0.5);
        break;
      case 'throw':
        f.accelScale = 0;
        if (T < 0.35 && r.gap < 1.0 && f.sigStep === 0 && !o.out) {
          // Grab: hold the opponent in place.
          o.v.x = o.v.z = 0;
          if (o.state !== 'hit') sim.ctrl[o.idx].setState('hit', 0.5);
        }
        if (once(1, 0.35)) {
          if (r.gap < 1.1 && !o.out && o.grounded) sim.throwOver(f, o);
          else sim.emit({ type: 'throw', a: f.idx, b: o.idx, v: 0 });
        }
        break;
      case 'shield':
        f.accelScale = 0;
        if (once(1, 0)) f.shieldT = 1.6;
        break;
      case 'roar':
        f.accelScale = 0;
        f.tiltTarget = { x: -f.face.x * 0.25 + Math.sin(T * 50) * 0.05, z: -f.face.z * 0.25 };
        if (opts.countdown) {
          // 我数到三！: 1… 2… 3… then the shout.
          for (let k = 0; k < 3; k++) if (once(k + 1, 0.2 + k * 0.4)) sim.emit({ type: 'countdown', a: f.idx, v: k + 1 });
          if (once(4, 1.4)) sim.roar(f, 1.3);
        } else if (opts.pulses) {
          // 哇——！: louder and louder.
          for (let k = 0; k < opts.pulses; k++) if (once(k + 1, 0.25 + k * 0.3)) sim.roar(f, 0.6 + 0.25 * k, k === opts.pulses - 1);
        } else if (once(1, 0.3)) sim.roar(f);
        break;
      case 'magnet':
        f.accelScale = 0;
        this.lookAtOpp();
        if (T < 0.85 && f.sigStep === 0 && !o.out) {
          o.v.x += (-r.ux * 5 - o.v.x) * Math.min(1, dt * 6);
          o.v.z += (-r.uz * 5 - o.v.z) * Math.min(1, dt * 6);
          if (r.gap < 0.6) {
            f.sigStep = 1;
            sim.strike(f, o, 13, 8, 1.5);
            sim.emit({ type: 'magnet', a: f.idx, b: o.idx });
          }
        }
        break;
      case 'poison':
        f.accelScale = 0;
        if (once(1, 0.3)) {
          const hit = r.gap < 3.6 && !o.out;
          if (hit) o.poisonT = 4;
          sim.emit({ type: 'poison', a: f.idx, b: o.idx, v: hit ? 1 : 0, x: f.p.x + r.ux * 1.2, z: f.p.z + r.uz * 1.2 });
        }
        break;
      case 'bribe':
        f.accelScale = 0;
        if (once(1, 0.3)) {
          const ok = r.gap < 6 && !o.out && o.grounded && sim.rng.chance(0.8);
          if (ok) sim.ctrl[o.idx].setState('distracted', 1.8);
          sim.emit({ type: 'bribe', a: f.idx, b: o.idx, v: ok ? 1 : 0, x: o.p.x, z: o.p.z });
        }
        break;
      case 'lecture':
      case 'joke': {
        f.accelScale = 0;
        f.tiltTarget = { x: Math.sin(T * 18) * 0.12, z: Math.cos(T * 15) * 0.08 };
        const joke = kind === 'joke';
        if (once(1, 0.9)) {
          const ok = r.gap < 6 && !o.out && o.grounded && sim.rng.chance(0.75);
          if (ok && joke) {
            o.usedOnce.add('jokeHit');
            sim.ctrl[o.idx].setState('laugh', 0.9);
          } else if (ok) sim.ctrl[o.idx].setState('sleep', 1.8);
          sim.emit({ type: joke ? 'joke' : 'lecture', a: f.idx, b: o.idx, v: ok ? 1 : 0 });
        }
        break;
      }
      case 'confuse':
        f.accelScale = 0;
        f.tiltTarget = { x: Math.sin(T * 22) * 0.15, z: 0 };
        if (once(1, 0.5)) {
          const ok = r.gap < 6 && !o.out && o.grounded && sim.rng.chance(0.8);
          if (ok) {
            o.wander = { x: o.p.x, z: o.p.z };
            sim.ctrl[o.idx].setState('confused', 2.2);
          }
          sim.emit({ type: 'confuse', a: f.idx, b: o.idx, v: ok ? 1 : 0 });
        }
        break;
      case 'chomp':
        if (T < 0.25) this.lean(-0.25);
        else if (T < 0.45) {
          this.drive(f.face, f.c.lungeSpeed, 3);
          if (f.sigStep === 0 && r.gap < 0.7) {
            f.sigStep = 1;
            sim.strike(f, o, 17, 4, 0);
            f.hp = Math.min(f.maxHp, f.hp + 5);
            sim.emit({ type: 'chomp', a: f.idx, b: o.idx });
          }
        }
        break;

      // ------------------------------------------------------------ batch 2
      case 'sweep':
        // 一刀两断: stretch into a long bar and sweep the whole ring.
        f.accelScale = 0.2;
        if (T < 0.25) this.lean(-0.25);
        else if (T < 0.95) {
          if (!opts.noStretch) f.stretch += (2.8 - f.stretch) * Math.min(1, dt * 12);
          else f.stretch = 2.8; // a held broom does the reach; the glyph keeps its width (visual stretch is ignored below)
          f.spinV = 24;
          if (f.sigStep === 0 && r.gap < 2.6 * (f.stretch / 2.8) + 0.4 && !o.out && Math.abs(o.y - f.y) < 1.5) {
            f.sigStep = 1;
            sim.strike(f, o, 9, 9, 2.5, { x: -r.uz, z: r.ux });
          }
        } else f.stretch += (1 - f.stretch) * Math.min(1, dt * 10);
        break;
      case 'giantFall':
        // 大到离谱: grow huge, wobble, then topple onto the opponent.
        f.accelScale = 0.3;
        if (once(1, 0.05)) {
          f.boostT = 1.6;
          f.boostSize = 1.75;
          sim.emit({ type: 'giant', a: f.idx });
        }
        this.lookAtOpp();
        if (T > 0.3) f.tiltTarget = { x: Math.sin(T * 18) * 0.18, z: Math.cos(T * 15) * 0.12 };
        if (once(2, 0.95)) {
          const hit = r.gap < 2.8 && !o.out;
          sim.emit({ type: 'quake', a: f.idx, b: o.idx, v: hit ? 1 : 0 });
          if (hit) sim.strike(f, o, 14, 6, 2.5);
          this.fallDown(f.face, 1.1);
        }
        break;
      case 'swallow':
        // 一口吞掉: lunge, gulp the opponent, chew, spit it out like a cannonball.
        if (f.sigStep === 0) {
          if (T < 0.5) {
            this.lookAtOpp();
            this.drive(f.face, f.c.lungeSpeed, 3);
          }
          if (T < 0.5 && r.gap < 0.7 && !o.out && !o.ko && o.grounded && o.swallowedBy < 0) {
            f.sigStep = 1;
            f.sigMark = T;
            sim.swallow(f, o);
          } else if (T >= 0.55) this.setState('recover', 0.35);
        } else if (f.sigStep === 1) {
          f.accelScale = 0;
          f.tiltTarget = { x: Math.sin(T * 25) * 0.12, z: 0 };
          if (T - f.sigMark >= 0.8) {
            f.sigStep = 2;
            sim.spit(f, o);
          }
        }
        break;
      case 'mountain':
        // 泰山压顶: leap at the opponent, grow into a mountain, slam.
        if (T < 0.15) {
          this.lean(-0.3);
          f.accelScale = 0;
        }
        if (once(1, 0.15)) {
          const vy = 9, Tf = (2 * vy) / sim.gravity;
          this.lookAtOpp();
          const vh = Math.min(9, r.d / Tf);
          f.v.x = f.face.x * vh;
          f.v.z = f.face.z * vh;
          f.vy = vy;
          f.grounded = false;
          f.boostT = 1.3;
          f.boostSize = 1.8;
        }
        if (f.sigStep === 1 && !f.grounded && f.vy < 0) f.vy -= 25 * dt;
        if (f.sigStep === 1 && f.grounded && T > 0.3) {
          f.sigStep = 2;
          sim.quake(f);
        }
        break;
      case 'fireCharge':
        // 引火烧身: burst into flames and charge (ends up covered in soot).
        f.burning = true;
        if (T < 0.3) {
          this.lookAtOpp();
          this.lean(-0.35);
          f.accelScale = 0;
        } else {
          if (once(1, 0.3)) this.startAttack('charge');
          this.drive(f.face, f.c.dashSpeed * 1.3, 2.5);
          this.lean(0.45);
        }
        break;
      case 'laughQuake':
        // 笑到地震: laughing so hard the ring shakes; both sides may topple.
        f.accelScale = 0;
        f.tiltTarget = { x: Math.sin(T * 30) * 0.2, z: Math.cos(T * 26) * 0.15 };
        for (let k = 0; k < 4; k++) if (once(k + 1, 0.25 + k * 0.35)) sim.tremor(f, k === 3);
        break;
      case 'lazy':
        // 懒得打了: lie down; attacks bounce off.
        f.accelScale = 0;
        f.leanFree = true;
        if (once(1, 0)) {
          f.shieldT = f.stateDur - 0.2;
          f.sigDir = { x: -f.face.z, z: f.face.x };
          sim.emit({ type: 'lazy', a: f.idx });
          if (opts.darkness) {
            // 一键关灯: lights out; the opponent stumbles around in the dark.
            sim.emit({ type: 'lightsOut', a: f.idx, v: 2 });
            if (!o.out && o.grounded && o.state !== 'down') {
              o.wander = { x: o.p.x, z: o.p.z };
              sim.ctrl[o.idx].setState('confused', 1.6);
            }
          }
        }
        f.tiltTarget = { x: f.sigDir.x * 1.5, z: f.sigDir.z * 1.5 };
        break;
      case 'feint':
        // 逃跑大师: bait a charge, then sidestep so the opponent flies past.
        f.accelScale = 0.2;
        f.tiltTarget = { x: Math.sin(T * 14) * 0.25, z: 0 };
        if (once(1, 0.15)) {
          if (!o.out && o.grounded && BAITABLE.includes(o.state)) sim.ctrl[o.idx].forceDash(f);
          sim.emit({ type: 'feint', a: f.idx, b: o.idx });
        }
        if (once(2, 0.32)) {
          let sx = -r.uz, sz = r.ux;
          if (sx * -f.p.x + sz * -f.p.z < 0) {
            sx = -sx;
            sz = -sz;
          }
          f.face = { x: sx, z: sz };
          f.v.x = sx * f.c.maxSpeed * 2.6;
          f.v.z = sz * f.c.maxSpeed * 2.6;
        }
        break;
      case 'fishSlap':
        // 摸鱼大师: a huge fish, left-right-left-SMACK.
        f.accelScale = 0.4;
        this.lookAtOpp();
        if (r.gap > 1) this.steer(r.ux, r.uz, f.c.maxSpeed * 0.6);
        for (let k = 0; k < 4; k++) {
          if (!once(k + 1, 0.25 + k * 0.28)) continue;
          const side = k % 2 === 0 ? 1 : -1;
          sim.emit({ type: 'slap', a: f.idx, b: o.idx, v: side });
          if (r.gap < 2.3 && !o.out) {
            const last = k === 3;
            sim.strike(f, o, last ? 10 : 4, last ? 10 : 4, last ? 3 : 0, last ? { x: r.ux, z: r.uz } : { x: -r.uz * side, z: r.ux * side });
          }
        }
        break;
      case 'blame':
        // 这不是我的锅: the next hit is mostly bounced back.
        f.accelScale = 0;
        if (once(1, 0.2)) {
          f.blameT = 4;
          sim.emit({ type: 'blame', a: f.idx });
        }
        break;
      case 'drop': {
        // Props from the sky (keyboards, hammers, GG…) or thrown in an arc (table flip).
        f.accelScale = 0;
        f.tiltTarget = { x: -f.face.x * 0.2, z: -f.face.z * 0.2 };
        const count = opts.count ?? 1;
        for (let k = 0; k < count; k++) {
          if (!once(k + 1, 0.25 + k * 0.25)) continue;
          const spread = count > 1 ? 0.8 : 0;
          // 熊孩子拆家: the last thing knocked over lands on the kid itself.
          const onSelf = !!opts.chaos && k === count - 1;
          const tx = onSelf ? f.p.x : o.p.x + o.v.x * 0.4 + sim.rng.range(-spread, spread);
          const tz = onSelf ? f.p.z : o.p.z + o.v.z * 0.4 + sim.rng.range(-spread, spread);
          sim.spawnDrop(f, tx, tz, opts.arc ? 0.7 : 0.55, {
            prop: opts.props ? opts.props[k % opts.props.length] : (opts.prop ?? ''),
            arc: !!opts.arc,
            dmg: (count > 1 ? 6 : 15) * (opts.dmgScale ?? 1),
            kb: (count > 1 ? 3 : 7) * (opts.kbScale ?? 1),
            up: (count > 1 ? 2 : 3.5) * (opts.upScale ?? 1),
            radius: count > 1 ? 1.1 : 1.4,
            knockDown: count === 1 && !opts.onHit,
            onHit: opts.onHit,
            target: onSelf ? f : o,
          });
        }
        break;
      }
      case 'clones': {
        // 全家出动！: little copies surround the opponent, jostle it, then shove it away.
        f.accelScale = 0;
        f.tiltTarget = { x: Math.sin(T * 16) * 0.12, z: 0 };
        if (once(1, 0.15)) sim.emit({ type: 'clones', a: f.idx, b: o.idx, x: o.p.x, z: o.p.z });
        for (let k = 0; k < 3; k++) {
          if (!once(k + 2, 0.8 + k * 0.12) || o.out) continue;
          const ang = (k / 3) * Math.PI * 2;
          sim.strike(f, o, 3, 3, 0, { x: Math.cos(ang), z: Math.sin(ang) });
        }
        if (once(5, 1.25) && !o.out) sim.strike(f, o, 8, 10, 2.5, { x: r.ux, z: r.uz });
        break;
      }
      case 'vanish':
        // 404: disappear, reappear right behind the opponent and strike.
        if (once(1, 0)) {
          f.hiddenT = 0.85;
          sim.emit({ type: 'vanish', a: f.idx });
        }
        if (T < 0.85) {
          f.phasing = true;
          const bx = o.p.x - o.face.x * 1.4 - f.p.x, bz = o.p.z - o.face.z * 1.4 - f.p.z, bl = Math.hypot(bx, bz) || 1;
          this.steer(bx / bl, bz / bl, f.c.maxSpeed * 1.4);
        } else if (once(2, 0.85)) {
          const lim = sim.arena.half - 0.8;
          const back = o.radius + f.radius + 0.3;
          f.p.x = clamp(o.p.x - o.face.x * back, -lim, lim);
          f.p.z = clamp(o.p.z - o.face.z * back, -lim, lim);
          f.hiddenT = 0;
          this.lookAtOpp();
          sim.emit({ type: 'surprise', a: f.idx, b: o.idx });
          this.setState('lunge', 0.26);
          this.startAttack('surprise');
          f.v.x = f.face.x * f.c.lungeSpeed;
          f.v.z = f.face.z * f.c.lungeSpeed;
        }
        break;
      case 'topple':
        // MOAI CRASH / 倒树攻击: tremble, then fall flat onto the opponent.
        f.accelScale = 0;
        f.leanFree = true;
        if (T < 0.6) {
          this.lookAtOpp();
          f.tiltTarget = { x: Math.sin(T * 40) * 0.06, z: Math.cos(T * 37) * 0.06 };
        } else f.tiltTarget = { x: f.face.x * 1.5, z: f.face.z * 1.5 };
        if (once(1, 0.9)) {
          const hit = r.gap < 2.6 && inFront && !o.out;
          sim.emit({ type: 'quake', a: f.idx, b: o.idx, v: hit ? 1 : 0 });
          if (hit) sim.strike(f, o, 17, 7, 2);
          this.fallDown(f.face, 1.0);
        }
        break;
      case 'glare':
        // 死亡凝视: eye beams that freeze the opponent in place.
        f.accelScale = 0;
        if (T < 0.45) this.lookAtOpp();
        if (once(1, 0.45)) sim.glare(f);
        break;
      case 'rage': {
        // 怒气冲天 / 急急急: three charges in a row, each a bit faster.
        f.angryBuff = Math.max(f.angryBuff, 0.5);
        const step = Math.min(2, Math.floor(T / 0.55));
        if (T - step * 0.55 < 0.12) {
          this.lookAtOpp();
          this.lean(-0.3);
          f.accelScale = 0.3;
        } else {
          if (once(step + 1, step * 0.55 + 0.12)) {
            this.lookAtOpp();
            this.startAttack('dash');
          }
          this.drive(f.face, f.c.dashSpeed * (1 + step * 0.12), 2.2);
          this.lean(0.45);
        }
        break;
      }
    }
    if (f.state === 'signature' && T >= f.stateDur && (f.grounded || !ENDS_ON_LANDING.has(kind))) this.endSignature(kind);
  }

  private endSignature(kind: MoveKind): void {
    const f = this.f, sim = this.sim, o = this.o;
    const opts = f.spec.signature.opts ?? {};
    if (opts.finaleDrop && opts.prop && !o.out) {
      // 脱水模式 / 外卖 / 熄灯: a parting gift lands on the opponent.
      for (let k = 0; k < (opts.count ?? 1); k++) {
        const many = (opts.count ?? 1) > 1;
        sim.spawnDrop(f, o.p.x + (many ? sim.rng.range(-0.8, 0.8) : 0), o.p.z + (many ? sim.rng.range(-0.8, 0.8) : 0), 0.4 + k * 0.15, { prop: opts.prop, arc: true, dmg: many ? 4 : 8, kb: many ? 3 : 6, up: 2, radius: 1.1 });
      }
    }
    if (opts.selfStun) {
      sim.emit({ type: 'dizzy', a: f.idx });
      return this.setState('stunned', 0.8);
    }
    if (opts.selfSleep) {
      sim.emit({ type: 'sleep', a: f.idx });
      return this.setState('sleep', 0.9);
    }
    if (opts.selfFall) {
      sim.emit({ type: kind === 'laughQuake' ? 'laughFall' : 'slip', a: f.idx });
      return this.fallDown({ x: f.face.x + 0.3, z: f.face.z }, 0.9);
    }
    switch (kind) {
      case 'sweep':
        sim.emit({ type: 'dizzy', a: f.idx });
        return this.setState('stunned', 0.8);
      case 'lazy':
        if (opts.counter) {
          // NOT DEAD YET: spring up straight into a surprise attack.
          this.lookAtOpp();
          sim.emit({ type: 'revive', a: f.idx });
          this.setState('lunge', 0.28);
          this.startAttack('surprise');
          f.v.x = f.face.x * f.c.lungeSpeed;
          f.v.z = f.face.z * f.c.lungeSpeed;
          return;
        }
        this.setState('getup', 0.5);
        f.vy = 2.6;
        f.grounded = false;
        return;
      case 'rage':
        return this.setState('brake', 0.45);
      default:
        return this.setState('recover', 0.3);
    }
  }

  /** Clean up per-move state whenever a signature ends (normally or interrupted). */
  private leaveSignature(): void {
    const f = this.f, o = this.o, sim = this.sim;
    f.stretch = 1;
    f.hiddenT = 0;
    if (o.swallowedBy === f.idx) sim.spit(f, o, false);
    if (f.burning) {
      f.burning = false;
      f.sootT = 2.5;
      f.hp -= 4;
      sim.emit({ type: 'soot', a: f.idx });
    }
    f.sigKind = null;
  }

  /** Baited by 逃跑大师 / 放鸽子: charge straight at where the baiter is now. */
  forceDash(target: FighterState): void {
    const f = this.f;
    const dx = target.p.x - f.p.x, dz = target.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    f.face = { x: dx / d, z: dz / d };
    this.setState('dash', f.c.dashTime * 1.3);
    this.startAttack('dash');
    this.sim.emit({ type: 'dash', a: f.idx });
  }

  /** Bounced off the ropes at speed: fly back across the ring as an attack. */
  slingshot(dx: number, dz: number): void {
    this.f.face = { x: dx, z: dz };
    this.setState('dash', 0.4);
    this.startAttack('dash');
  }

  /** Landing from an airborne state: hand control back. */
  onLand(): void {
    if (this.f.state === 'hop' || this.f.state === 'pounce') this.setState('recover', 0.3);
    if (this.f.state === 'signature' && this.f.sigKind === 'kick') this.setState('recover', 0.35);
  }
}
