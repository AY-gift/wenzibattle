/**
 * BattleSimulator — fixed-timestep, headless, deterministic match simulation.
 * Physics is deliberately simplified: fighters are vertical cylinders in XZ with a
 * spring-loaded "lean" (tilt) that can tip over, plus ballistic flight when launched.
 * Rendering reads the state; the simulation never depends on the renderer or the camera.
 */
import { elementMultiplier } from '@shared/core/BehaviorResolver';
import { Rng } from '@shared/core/rng';
import type { FighterSpec } from '@shared/core/StatGenerator';
import { FighterController, FighterState, type V2 } from './FighterController';
import type { AttackKind, BattleEvent, BattleResult, EndReason } from './types';

export const DT = 1 / 60;
export const BATTLE_TIME = 15;
export const INTRO_TIME = 1.4;
export const EPILOGUE_TIME = 2.4;
export const SUDDEN_DEATH_AT = 10;

/** Square boxing ring with three elastic ropes on every side. */
export const ARENA = {
  /** Half the side length of the ring, measured to the rope line. */
  half: 5.0,
  /** Rope heights above the canvas. */
  ropes: [0.45, 0.85, 1.25],
  /** How far a rope stretches before a fighter goes over it. */
  ropeGive: 0.95,
  ropeStiffness: 95,
  /** Canvas height above the arena floor (where ring-outs land). */
  ringHeight: 1.2,
};
export type ArenaConfig = typeof ARENA;

const POWER: Record<AttackKind, number> = { lunge: 1, dash: 1.25, stomp: 1.25, spin: 0.7, pounce: 1.15, panic: 1.45, surprise: 1.3, charge: 1.8, kick: 1.6 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

export type Phase = 'intro' | 'fight' | 'epilogue' | 'done';

export class BattleSimulator {
  readonly fighters: [FighterState, FighterState];
  readonly ctrl: [FighterController, FighterController];
  readonly rng: Rng;
  readonly arena = ARENA;
  readonly gravity = 20;
  t = -INTRO_TIME;
  phase: Phase = 'intro';
  /** 1 = ropes tight, ~0.6 = slack and low (sudden death). */
  ropeLevel = 1;
  suddenDeath = false;
  readonly events: BattleEvent[] = [];
  result: BattleResult | null = null;
  steps = 0;
  private fresh: BattleEvent[] = [];
  private epilogueT = 0;
  private stuckT = 0;
  private lastDoubleDown = -99;
  private drops: { owner: FighterState; target: FighterState; x: number; z: number; t: number; dmg: number; kb: number; up: number; radius: number; knockDown: boolean; prop: string; onHit?: 'freeze' | 'confuse' | 'sleep' }[] = [];

  constructor(
    readonly specs: [FighterSpec, FighterSpec],
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    this.fighters = [new FighterState(0, specs[0], { x: -3.2, z: 0.4 }), new FighterState(1, specs[1], { x: 3.2, z: -0.4 })];
    this.fighters[1].y = 5.2; // land slightly later for a staggered entrance
    this.ctrl = [new FighterController(this.fighters[0], this), new FighterController(this.fighters[1], this)];
    this.emit({ type: 'ready', a: 0 });
  }

  get pressure(): number {
    return clamp((this.t - 5) / 8, 0, 1);
  }

  /** Events emitted since the last call (for the renderer / subtitles). */
  drainEvents(): BattleEvent[] {
    const e = this.fresh;
    this.fresh = [];
    return e;
  }

  emit(e: Omit<BattleEvent, 't'>): void {
    const f = this.fighters?.[e.a];
    const ev: BattleEvent = { t: this.t, x: f?.p.x, y: f?.y, z: f?.p.z, ...e };
    this.events.push(ev);
    this.fresh.push(ev);
  }

  runToEnd(maxSteps = 6000): BattleResult {
    while (this.phase !== 'done' && this.steps < maxSteps) this.step();
    if (!this.result) this.finish(this.fighters[0].hp >= this.fighters[1].hp ? 0 : 1, 'timeup');
    return this.result!;
  }

  step(): void {
    if (this.phase === 'done') return;
    const dt = DT;
    this.steps++;
    if (this.phase === 'intro' && this.t >= 0) {
      this.phase = 'fight';
      for (const c of this.ctrl) c.setState('idle', this.rng.range(0.1, 0.35));
      this.emit({ type: 'fight', a: 0 });
    }
    if (this.phase === 'fight' && !this.suddenDeath && this.t >= SUDDEN_DEATH_AT) {
      this.suddenDeath = true;
      this.emit({ type: 'suddenDeath', a: 0 });
    }
    const ropeTarget = this.suddenDeath ? 0.6 : 1;
    this.ropeLevel += clamp(ropeTarget - this.ropeLevel, -dt / 0.8, dt / 0.8);

    for (const c of this.ctrl) c.update(dt);
    this.updateTimedEffects(dt);
    for (const f of this.fighters) this.integrate(f, dt);
    this.collidePair(dt);
    for (const f of this.fighters) this.ropes(f, dt);
    for (const f of this.fighters) this.keepOutsideUnderEdge(f);
    for (const f of this.fighters) f.counters.minHp = Math.min(f.counters.minHp, Math.max(0, f.hp));
    this.checkOutcome(dt);
    this.t += dt;
  }

  // ---------------------------------------------------------------- physics

  private integrate(f: FighterState, dt: number): void {
    const g = this.gravity;
    if (f.swallowedBy >= 0) {
      // Inside someone's mouth: ride along, invisible and untouchable.
      const owner = this.fighters[f.swallowedBy];
      f.p.x = owner.p.x;
      f.p.z = owner.p.z;
      f.y = 0.4;
      f.v.x = f.v.z = f.vy = 0;
      f.grounded = true;
      return;
    }
    if (f.out) {
      // Thrown out of the ring: fall to the arena floor and lie there.
      const floor = -this.arena.ringHeight;
      f.p.x += f.v.x * dt;
      f.p.z += f.v.z * dt;
      const apron = this.arena.half + 0.6;
      if (f.y < -0.05 && Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) < apron) {
        if (Math.abs(f.p.x) > Math.abs(f.p.z)) f.p.x = Math.sign(f.p.x) * apron;
        else f.p.z = Math.sign(f.p.z) * apron;
      }
      if (f.y > floor) {
        f.vy -= g * dt;
        f.y += f.vy * dt;
        f.tilt.x += f.tiltV.x * dt;
        f.tilt.z += f.tiltV.z * dt;
        f.spin += f.spinV * dt;
      }
      if (f.y <= floor) {
        if (f.vy < -4) this.emit({ type: 'land', a: f.idx, v: -f.vy });
        f.y = floor;
        f.vy = 0;
        f.v.x *= Math.exp(-6 * dt);
        f.v.z *= Math.exp(-6 * dt);
        const a = f.tiltAngle || 1;
        const k = Math.min(1, dt * 8);
        f.tilt.x += ((f.tilt.x / a) * (Math.PI / 2) - f.tilt.x) * k;
        f.tilt.z += ((f.tilt.z / a) * (Math.PI / 2) - f.tilt.z) * k;
        f.tiltV.x = f.tiltV.z = 0;
      }
      return;
    }
    if (f.grounded) {
      const accel = f.c.accel * f.accelScale;
      let dvx = f.desired.x - f.v.x, dvz = f.desired.z - f.v.z;
      const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
      if (dl > maxDv && dl > 0) {
        dvx *= maxDv / dl;
        dvz *= maxDv / dl;
      }
      f.v.x += dvx;
      f.v.z += dvz;
      const fr = Math.exp(-f.c.friction * (1 - Math.min(1, f.accelScale)) * dt);
      f.v.x *= fr;
      f.v.z *= fr;
    }
    f.p.x += f.v.x * dt;
    f.p.z += f.v.z * dt;
    if (!f.grounded) {
      f.vy -= g * dt;
      f.y += f.vy * dt;
    }
    this.keepOutsideUnderEdge(f);
    f.supported = Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) <= this.arena.half + 0.05;
    // Land when crossing the canvas this step (also for very fast falls).
    if (!f.grounded && f.supported && f.y <= 0 && (f.y > -0.5 || f.y - f.vy * dt >= -0.05) && f.vy <= 0) {
      f.y = Math.max(f.y, -0.05);
      this.land(f);
    }
    if (f.grounded && !f.supported) {
      f.grounded = false;
      f.tumbling = true;
      f.vy = Math.min(f.vy, 0);
      const alongX = Math.abs(f.p.x) > Math.abs(f.p.z);
      if (alongX) f.tiltV.x += Math.sign(f.p.x) * 4.5;
      else f.tiltV.z += Math.sign(f.p.z) * 4.5;
      this.emit({ type: 'fallOff', a: f.idx });
    }
    if (!f.supported && f.y < -0.8 && !f.out) {
      f.out = true;
      this.emit({ type: 'ringout', a: f.idx, b: (1 - f.idx) as 0 | 1 });
    }

    // Lean / topple dynamics.
    if (f.grounded && !f.tumbling) {
      let tx = f.tiltTarget.x, tz = f.tiltTarget.z;
      // Voluntary lean never exceeds ~60% of the topple angle; only impacts knock fighters over.
      const tl = Math.hypot(tx, tz), cap = f.c.fallThreshold * 0.6;
      if (tl > cap && f.state !== 'down' && f.state !== 'playDead' && !f.leanFree) {
        tx *= cap / tl;
        tz *= cap / tl;
      }
      if (f.ko) {
        const a = f.tiltAngle || 1;
        tx = (f.tilt.x / a) * f.downTarget;
        tz = (f.tilt.z / a) * f.downTarget;
      }
      const lyingState = f.state === 'down' || f.ko || f.state === 'playDead';
      const k = f.c.tiltK * (lyingState ? 0.7 : 1);
      const c = 2 * Math.sqrt(k) * 0.55;
      f.tiltV.x += (-(f.tilt.x - tx) * k - f.tiltV.x * c) * dt;
      f.tiltV.z += (-(f.tilt.z - tz) * k - f.tiltV.z * c) * dt;
      f.tilt.x += f.tiltV.x * dt;
      f.tilt.z += f.tiltV.z * dt;
      const canFall = !lyingState && f.state !== 'getup' && f.state !== 'sleep' && f.state !== 'intro' && f.state !== 'victory' && f.state !== 'signature';
      if (canFall && f.tiltAngle > f.c.fallThreshold) this.ctrl[f.idx].fallDown({ x: f.tilt.x, z: f.tilt.z });
    } else {
      f.tilt.x += f.tiltV.x * dt;
      f.tilt.z += f.tiltV.z * dt;
      f.tiltV.x *= 1 - 0.3 * dt;
      f.tiltV.z *= 1 - 0.3 * dt;
    }
    // Spin returns to "facing the audience" unless deliberately spinning.
    f.spin += f.spinV * dt;
    if (f.state !== 'spin' && f.grounded) {
      const wrapped = f.spin - TAU * Math.round(f.spin / TAU);
      f.spinV += (-wrapped * 30 - f.spinV * 6) * dt;
    }
  }

  private land(f: FighterState): void {
    const impact = -f.vy;
    f.y = 0;
    if (impact > 6) this.emit({ type: 'land', a: f.idx, v: impact });
    if (f.has('bouncy') && impact > 4.5 && !f.ko) {
      f.vy = impact * 0.5;
      return;
    }
    f.vy = 0;
    f.grounded = true;
    if (f.tumbling) {
      let a = f.tiltAngle;
      let dx = a > 1e-4 ? f.tilt.x / a : 1, dz = a > 1e-4 ? f.tilt.z / a : 0;
      a = ((a % TAU) + TAU) % TAU;
      if (a > Math.PI) {
        a = TAU - a;
        dx = -dx;
        dz = -dz;
      }
      f.tilt = { x: dx * a, z: dz * a };
      f.tiltV.x *= 0.3;
      f.tiltV.z *= 0.3;
      f.tumbling = false;
      if (a >= 0.6) {
        f.downTarget = a > Math.PI - 0.6 ? Math.PI : Math.PI / 2;
        if (!f.ko && f.state !== 'intro') {
          this.ctrl[f.idx].setState('down', f.c.recoverTime * this.rng.range(0.8, 1.2));
          f.counters.downs++;
          f.lastDownT = this.t;
          this.onDown(f);
        }
      }
    }
    f.tumbling = false;
    this.ctrl[f.idx].onLand();
  }

  private collidePair(dt: number): void {
    const [a, b] = this.fighters;
    if (a.out || b.out || a.phasing || b.phasing || a.swallowedBy >= 0 || b.swallowedBy >= 0) {
      this.stuckT = 0;
      return;
    }
    const dx = b.p.x - a.p.x, dz = b.p.z - a.p.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    const ra = a.radius * (a.lying ? 0.85 : 1), rb = b.radius * (b.lying ? 0.85 : 1);
    const minD = ra + rb;
    const ha = a.lying ? a.spec.depth + 0.25 : a.spec.height, hb = b.lying ? b.spec.depth + 0.25 : b.spec.height;
    const n: V2 = { x: dx / d, z: dz / d };

    // Vertical separation: one is above the other.
    if (a.y - b.y > hb * 0.7 || b.y - a.y > ha * 0.7) {
      const upper = a.y > b.y ? a : b, lower = upper === a ? b : a;
      const hl = lower === a ? ha : hb;
      if (d < minD * 0.95 && upper.vy < -1 && upper.y - lower.y < hl + 0.35 && !lower.out) {
        const nn = upper === a ? n : { x: -n.x, z: -n.z };
        if (upper.attackKind !== 'stomp' && upper.attackKind !== 'pounce') upper.attackKind = 'stomp';
        upper.hitDone = false;
        this.emit({ type: 'stomp', a: upper.idx, b: lower.idx });
        this.applyHit(upper, lower, nn, Math.abs(upper.vy) * 0.8 + 2);
        upper.vy = 6.5;
        upper.y = Math.max(upper.y, lower.y + hl * 0.8);
      }
      return;
    }
    if (d >= minD) {
      this.stuckT = 0;
      return;
    }
    const overlap = minD - d;
    const ima = 1 / a.mass, imb = 1 / b.mass;
    a.p.x -= n.x * overlap * (ima / (ima + imb));
    a.p.z -= n.z * overlap * (ima / (ima + imb));
    b.p.x += n.x * overlap * (imb / (ima + imb));
    b.p.z += n.z * overlap * (imb / (ima + imb));
    const vApproach = (a.v.x - b.v.x) * n.x + (a.v.z - b.v.z) * n.z;
    if (vApproach > 0) {
      const e = Math.max(a.c.restitution, b.c.restitution);
      const J = ((1 + e) * vApproach) / (ima + imb);
      a.v.x -= n.x * J * ima;
      a.v.z -= n.z * J * ima;
      b.v.x += n.x * J * imb;
      b.v.z += n.z * J * imb;
    }
    const aHits = a.isAttacking && a.hitCooldown <= 0 && (a.attackKind === 'spin' || a.face.x * n.x + a.face.z * n.z > 0.25);
    const bHits = b.isAttacking && b.hitCooldown <= 0 && (b.attackKind === 'spin' || -(b.face.x * n.x + b.face.z * n.z) > 0.25);
    const closing = Math.max(0, vApproach);
    if (aHits && bHits) {
      this.emit({ type: 'clash', a: 0, b: 1, x: (a.p.x + b.p.x) / 2, z: (a.p.z + b.p.z) / 2 });
      const ka = a.attackKind ?? 'lunge', kb = b.attackKind ?? 'lunge';
      this.applyHit(a, b, n, closing * 0.6, ka);
      this.applyHit(b, a, { x: -n.x, z: -n.z }, closing * 0.6, kb);
    } else if (aHits) this.applyHit(a, b, n, closing);
    else if (bHits) this.applyHit(b, a, { x: -n.x, z: -n.z }, closing);
    else {
      const pushing = (f: FighterState) => f.state === 'approach' || f.state === 'idle' || f.state === 'circle' || f.state === 'charmed';
      if (pushing(a) && pushing(b)) {
        this.stuckT += dt;
        if (this.stuckT > 0.75) {
          this.stuckT = 0;
          const pop = 7.5;
          for (const [f, s] of [[a, -1], [b, 1]] as const) {
            f.v.x = n.x * s * pop / Math.sqrt(f.mass);
            f.v.z = n.z * s * pop / Math.sqrt(f.mass);
            f.vy = 3.5;
            f.grounded = false;
            f.tiltV.x += n.x * s * 5;
            f.tiltV.z += n.z * s * 5;
            this.ctrl[f.idx].setState('hit', 0.4);
          }
          this.emit({ type: 'pop', a: 0, b: 1, x: (a.p.x + b.p.x) / 2, z: (a.p.z + b.p.z) / 2 });
        }
      } else this.stuckT = 0;
    }
  }

  applyHit(att: FighterState, def: FighterState, n: V2, closing: number, kind: AttackKind = att.attackKind ?? 'lunge'): void {
    att.hitDone = true;
    att.hitCooldown = 0.3;
    if (def.invuln > 0 || def.ko) return;
    if (def.shieldT > 0) return this.reflect(def, att);
    if (def.swallowedBy >= 0) return;
    const rng = this.rng;
    const luckD = def.spec.stats.luck / 100;
    const cx = (att.p.x + def.p.x) / 2, cz = (att.p.z + def.p.z) / 2;

    // Sleeping fighters sometimes roll out of the way; lying ones trip the attacker.
    if (def.state === 'sleep' && rng.chance(0.3 + 0.45 * luckD)) {
      this.emit({ type: 'luckyDodge', a: def.idx, b: att.idx, v: 1 });
      this.emit({ type: 'trip', a: att.idx, b: def.idx });
      this.ctrl[att.idx].fallDown(n, 0.8);
      att.v.x += n.x * 2;
      att.v.z += n.z * 2;
      def.invuln = 0.5;
      return;
    }
    if ((def.state === 'down' || def.state === 'playDead') && kind !== 'stomp' && kind !== 'pounce' && rng.chance(0.35)) {
      this.emit({ type: 'trip', a: att.idx, b: def.idx });
      this.ctrl[att.idx].fallDown(n, 0.8);
      def.invuln = 0.4;
      return;
    }
    if (def.controllable && rng.chance(0.015 + 0.05 * luckD)) {
      this.emit({ type: 'luckyDodge', a: def.idx, b: att.idx, v: 0 });
      def.invuln = 0.4;
      return;
    }

    const power = POWER[kind];
    const crit = rng.chance(att.c.critChance);
    const massF = clamp(Math.pow(att.mass / def.mass, 0.25), 0.75, 1.3);
    const elem = elementMultiplier(att.spec.element, def.spec.element);
    if (elem > 1) this.emit({ type: 'elementBonus', a: att.idx, b: def.idx, v: elem });
    const taunting = def.state === 'taunt' ? 1.3 : 1;
    const dmg = Math.min(40, att.sizeMul * (4 + closing * 1.25) * power * att.c.dmgMult * def.c.takenMult * massF * elem * (crit ? 1.7 : 1) * taunting);
    def.hp -= this.blameSplit(att, def, dmg);
    if (att.burning) {
      // 引火烧身: being rammed by a fireball hurts extra.
      def.hp -= 6 * def.c.takenMult;
      this.emit({ type: 'burn', a: att.idx, b: def.idx, v: 6, x: def.p.x, z: def.p.z });
    }
    att.counters.hits++;
    att.counters.damageDealt += dmg;
    att.counters.maxHit = Math.max(att.counters.maxHit, dmg);

    const kb = ((1.6 + closing * 0.56) * power * Math.pow(att.mass, 0.4)) / (Math.pow(def.mass, 0.45) * def.c.kbResist) * (crit ? 1.4 : 1) * (def.lying ? 0.6 : 1);
    def.v.x += n.x * kb;
    def.v.z += n.z * kb;
    const launch = Math.max(0, kb - 7.5) * 0.55 + (crit ? 1.5 : 0);
    if (launch > 0.6) {
      def.vy = Math.max(def.vy, launch);
      def.grounded = false;
      def.tumbling = true;
      def.tiltV.x += n.x * kb * 0.9;
      def.tiltV.z += n.z * kb * 0.9;
    } else {
      def.tiltV.x += (n.x * kb * 0.75) / def.c.kbResist;
      def.tiltV.z += (n.z * kb * 0.75) / def.c.kbResist;
    }
    const recoil = Math.min(4, kb * 0.25 * (def.mass / att.mass));
    att.v.x -= n.x * recoil;
    att.v.z -= n.z * recoil;
    def.invuln = 0.2;
    def.lastHitBy = { t: this.t, kind };
    this.emit({ type: crit ? 'crit' : 'hit', a: att.idx, b: def.idx, v: dmg, x: cx, z: cz, y: Math.min(att.spec.height, def.spec.height) * 0.5 });
    if (att.mass < def.mass * 0.7 && kb > 6.5) this.emit({ type: 'upset', a: att.idx, b: def.idx });

    if (def.hp <= 0) return;
    // Reactions.
    if (def.state === 'sleep') {
      def.angryBuff = 3;
      this.emit({ type: 'rudeAwakening', a: def.idx, b: att.idx });
    }
    if (def.has('skull') && def.hp < def.maxHp * 0.45 && !def.usedOnce.has('playDead') && def.grounded) {
      def.usedOnce.add('playDead');
      this.ctrl[def.idx].setState('playDead', 1.7);
      def.downTarget = Math.PI / 2;
      def.tiltV.x += n.x * 5;
      def.tiltV.z += n.z * 5;
      this.emit({ type: 'playDead', a: def.idx, b: att.idx });
      return;
    }
    if (att.has('electric') && def.grounded) {
      this.ctrl[def.idx].setState('stunned', 0.55);
      this.emit({ type: 'zap', a: att.idx, b: def.idx });
      return;
    }
    if (def.state !== 'down' && def.state !== 'playDead') this.ctrl[def.idx].setState('hit', 0.22 + kb * 0.03);
    if (def.charmedBy >= 0) def.charmedBy = -1;
  }

  /**
   * A fighter that has dropped below the canvas is beside the ring, never under it: pushes from
   * collisions or moves can't slide it back beneath the platform, where it would fall forever.
   */
  private keepOutsideUnderEdge(f: FighterState): void {
    if (f.out || f.grounded || f.swallowedBy >= 0 || f.y >= -0.15) return;
    const lim = this.arena.half + 0.08;
    const ax = Math.abs(f.p.x), az = Math.abs(f.p.z);
    if (Math.max(ax, az) >= lim) return;
    if (ax >= az) {
      const s = Math.sign(f.p.x) || 1;
      f.p.x = s * lim;
      if (f.v.x * s < 0) f.v.x = 0;
    } else {
      const s = Math.sign(f.p.z) || 1;
      f.p.z = s * lim;
      if (f.v.z * s < 0) f.v.z = 0;
    }
  }

  /** Elastic ropes: stretch, slingshot back, or let a fast / airborne fighter go over. */
  private ropes(f: FighterState, dt: number): void {
    if (f.out || f.swallowedBy >= 0) return;
    const A = this.arena;
    const lvl = this.ropeLevel;
    const edge = A.half - f.radius * 0.55;
    const penX = Math.abs(f.p.x) - edge, penZ = Math.abs(f.p.z) - edge;
    if (penX <= 0 && penZ <= 0) {
      if (f.onRope) this.releaseRope(f);
      f.overRope = false;
      return;
    }
    // Below the canvas the ropes can't reach (they'd push a falling fighter back under the ring).
    if (f.overRope || f.y > A.ropes[2] * lvl * 0.8 || f.y < -0.05) return;

    // Corner post: rigid and painful.
    if (penX > 0.05 && penZ > 0.05) {
      const sx = Math.sign(f.p.x), sz = Math.sign(f.p.z);
      f.p.x = sx * edge;
      f.p.z = sz * edge;
      const vx = f.v.x * sx, vz = f.v.z * sz;
      if (vx > 0) f.v.x -= sx * vx * 1.5;
      if (vz > 0) f.v.z -= sz * vz * 1.5;
      const impact = Math.hypot(Math.max(0, vx), Math.max(0, vz));
      const violent = ['dash', 'brake', 'panic', 'hit', 'lunge', 'pounce', 'spin'].includes(f.state) || f.tumbling || !f.grounded;
      if (impact > 4.5 && violent) {
        const dmg = Math.min(18, (impact - 4) * 2.2 * f.c.takenMult);
        f.hp -= dmg;
        f.counters.wallCrashes++;
        const slammed = this.t - f.lastHitBy.t < 0.8;
        this.emit({ type: slammed ? 'slam' : 'wallCrash', a: f.idx, b: (1 - f.idx) as 0 | 1, v: dmg, x: sx * A.half, z: sz * A.half });
        f.tiltV.x += sx * impact * 0.4;
        f.tiltV.z += sz * impact * 0.4;
        if (f.hp > 0 && f.grounded) this.ctrl[f.idx].setState('stunned', 0.7);
      }
      return;
    }

    const alongX = penX > penZ;
    const pen = alongX ? penX : penZ;
    const s = Math.sign(alongX ? f.p.x : f.p.z);
    const vOut = (alongX ? f.v.x : f.v.z) * s;
    if (pen > A.ropeGive * (0.75 + 0.25 * lvl)) {
      // Over the top rope and out of the ring.
      f.overRope = true;
      f.onRope = false;
      f.grounded = false;
      f.tumbling = true;
      f.vy = Math.max(f.vy, 3.5 + Math.max(0, vOut) * 0.15);
      if (alongX) f.tiltV.x += s * 5;
      else f.tiltV.z += s * 5;
      this.emit({ type: 'overRope', a: f.idx, b: (1 - f.idx) as 0 | 1, v: vOut });
      return;
    }
    const k = A.ropeStiffness * (0.55 + 0.45 * lvl);
    const dv = -s * (k * pen + Math.max(0, vOut) * 2) * dt;
    if (alongX) f.v.x += dv;
    else f.v.z += dv;
    if (!f.onRope) {
      f.onRope = true;
      f.ropeInSpeed = vOut;
      if (vOut > 4.5) this.emit({ type: 'ropeBounce', a: f.idx, b: (1 - f.idx) as 0 | 1, v: vOut });
    }
  }

  /** Leaving the ropes after hitting them hard turns into a slingshot charge. */
  private releaseRope(f: FighterState): void {
    f.onRope = false;
    const speed = Math.hypot(f.v.x, f.v.z);
    const wild = ['dash', 'brake', 'panic', 'hit', 'stunned', 'recover', 'lunge'].includes(f.state);
    if (f.ropeInSpeed > 5.5 && speed > 4 && wild && f.grounded && !f.ko && this.phase === 'fight') {
      this.ctrl[f.idx].slingshot(f.v.x / speed, f.v.z / speed);
      this.emit({ type: 'slingshot', a: f.idx, b: (1 - f.idx) as 0 | 1, v: speed });
    }
    f.ropeInSpeed = 0;
  }

  // ---------------------------------------------------------------- signature moves

  private updateTimedEffects(dt: number): void {
    for (const f of this.fighters) {
      f.giantT = Math.max(0, f.giantT - dt);
      f.shieldT = Math.max(0, f.shieldT - dt);
      f.boostT = Math.max(0, f.boostT - dt);
      f.sootT = Math.max(0, f.sootT - dt);
      f.blameT = Math.max(0, f.blameT - dt);
      f.hiddenT = Math.max(0, f.hiddenT - dt);
      const target = Math.max(f.giantT > 0 ? 1.45 : 1, f.boostT > 0 ? f.boostSize : 1);
      f.sizeMul += (target - f.sizeMul) * Math.min(1, dt * 5);
      if (f.poisonT > 0 && !f.ko && this.phase === 'fight') {
        f.poisonT -= dt;
        f.hp -= 2.6 * f.c.takenMult * dt;
      }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const m = this.drops[i];
      m.t -= dt;
      if (m.t > 0) continue;
      this.drops.splice(i, 1);
      this.emit({ type: 'meteorImpact', a: m.owner.idx, x: m.x, z: m.z, y: 0, move: m.prop });
      const o = m.target;
      const d = Math.hypot(o.p.x - m.x, o.p.z - m.z);
      if (d < m.radius + o.radius * 0.5 && o.y < 1.5 && !o.out && this.phase === 'fight') {
        const ux = (o.p.x - m.x) / (d || 1), uz = (o.p.z - m.z) / (d || 1);
        this.strike(m.owner, o, m.dmg, m.kb, m.up, { x: ux, z: uz });
        if (m.knockDown && o.hp > 0 && !o.ko && o.grounded) this.ctrl[o.idx].fallDown({ x: ux, z: uz }, 0.9);
        if (m.onHit && o.hp > 0 && !o.ko && o.grounded && o.shieldT <= 0) {
          // Wrapped in a coat / glued by dumplings / sent to bed / pressing the wrong button.
          if (m.onHit === 'freeze') {
            this.ctrl[o.idx].setState('frozen', 0.9);
            this.emit({ type: 'freeze', a: m.owner.idx, b: o.idx, x: o.p.x, z: o.p.z });
          } else if (m.onHit === 'sleep') {
            this.ctrl[o.idx].setState('sleep', 1.3);
            this.emit({ type: 'sleep', a: o.idx });
          } else {
            o.wander = { x: o.p.x, z: o.p.z };
            this.ctrl[o.idx].setState('confused', 1.5);
            this.emit({ type: 'confuse', a: m.owner.idx, b: o.idx, v: 1 });
          }
        }
      }
    }
  }

  /** Damage + knockback that doesn't depend on collision speed (used by signature moves). */
  strike(att: FighterState, def: FighterState, base: number, kb: number, up: number, dir?: V2): void {
    if (def.ko || def.out || def.invuln > 0 || def.swallowedBy >= 0) return;
    if (def.shieldT > 0) return this.reflect(def, att);
    const dx = def.p.x - att.p.x, dz = def.p.z - att.p.z, d = Math.hypot(dx, dz) || 1;
    const n = dir ?? { x: dx / d, z: dz / d };
    const crit = this.rng.chance(att.c.critChance);
    const elem = elementMultiplier(att.spec.element, def.spec.element);
    const dmg = Math.min(30, base * att.c.dmgMult * def.c.takenMult * att.sizeMul * elem * (crit ? 1.5 : 1));
    def.hp -= this.blameSplit(att, def, dmg);
    att.counters.hits++;
    att.counters.damageDealt += dmg;
    att.counters.maxHit = Math.max(att.counters.maxHit, dmg);
    const k = kb / (Math.pow(def.mass, 0.45) * def.c.kbResist);
    def.v.x += n.x * k;
    def.v.z += n.z * k;
    if (up > 0.5) {
      def.vy = Math.max(def.vy, up);
      def.grounded = false;
      def.tumbling = true;
      def.tiltV.x += n.x * (k + up) * 0.8;
      def.tiltV.z += n.z * (k + up) * 0.8;
    } else {
      def.tiltV.x += n.x * k * 0.6;
      def.tiltV.z += n.z * k * 0.6;
    }
    def.invuln = 0.1;
    def.lastHitBy = { t: this.t, kind: 'signature' };
    this.emit({ type: crit ? 'crit' : 'hit', a: att.idx, b: def.idx, v: dmg, x: (att.p.x + def.p.x) / 2, z: (att.p.z + def.p.z) / 2, y: Math.min(att.spec.height, def.spec.height) * 0.5 });
    if (def.hp > 0 && def.state !== 'down' && def.state !== 'frozen' && def.grounded) this.ctrl[def.idx].setState('hit', 0.25 + k * 0.03);
    if (def.state === 'sleep') def.angryBuff = 3;
  }

  /** A shielded fighter bounces the attacker back. */
  private reflect(def: FighterState, att: FighterState): void {
    const dx = att.p.x - def.p.x, dz = att.p.z - def.p.z, d = Math.hypot(dx, dz) || 1;
    att.hitDone = true;
    att.hitCooldown = 0.4;
    att.v.x = (dx / d) * 8;
    att.v.z = (dz / d) * 8;
    att.hp -= 5 * att.c.takenMult;
    att.tiltV.x += (dx / d) * 4;
    att.tiltV.z += (dz / d) * 4;
    if (att.grounded && att.hp > 0) this.ctrl[att.idx].setState('stunned', 0.6);
    this.emit({ type: 'reflect', a: def.idx, b: att.idx, x: (att.p.x + def.p.x) / 2, z: (att.p.z + def.p.z) / 2 });
  }

  quake(f: FighterState): void {
    const o = this.opponent(f);
    const d = Math.hypot(o.p.x - f.p.x, o.p.z - f.p.z) - f.radius - o.radius;
    const hit = d < 3.6 && o.grounded && !o.out;
    this.emit({ type: 'quake', a: f.idx, b: o.idx, v: hit ? 1 : 0 });
    if (!hit) return;
    this.strike(f, o, 10, 3, 3.5);
    if (o.hp > 0 && !o.ko) this.ctrl[o.idx].fallDown({ x: o.p.x - f.p.x, z: o.p.z - f.p.z }, 1.0);
  }

  beam(f: FighterState): void {
    const o = this.opponent(f);
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z;
    const along = dx * f.face.x + dz * f.face.z;
    const perp = Math.abs(dx * f.face.z - dz * f.face.x);
    const hit = along > 0 && along < 9 && perp < o.radius + 0.45 && !o.out && o.y < 2;
    this.emit({ type: 'beam', a: f.idx, b: o.idx, v: hit ? 1 : 0 });
    if (hit) this.strike(f, o, 14, 7, 0, { ...f.face });
  }

  spawnMeteor(f: FighterState, x: number, z: number, delay: number): void {
    this.spawnDrop(f, x, z, delay, { prop: '', arc: false, dmg: 6, kb: 3, up: 3, radius: 1.1 });
  }

  /** Something lands on (x, z) after `delay`: a meteor, a keyboard, a hammer, a flipped table… */
  spawnDrop(f: FighterState, x: number, z: number, delay: number, o: { prop: string; arc: boolean; dmg: number; kb: number; up: number; radius: number; knockDown?: boolean; onHit?: 'freeze' | 'confuse' | 'sleep'; target?: FighterState }): void {
    const lim = this.arena.half - 0.3;
    x = clamp(x, -lim, lim);
    z = clamp(z, -lim, lim);
    this.drops.push({ owner: f, target: o.target ?? this.opponent(f), x, z, t: delay, dmg: o.dmg, kb: o.kb, up: o.up, radius: o.radius, knockDown: !!o.knockDown, prop: o.prop, onHit: o.onHit });
    this.emit({ type: o.arc ? 'propArc' : 'meteor', a: f.idx, x, z, v: delay, move: o.prop });
  }

  /** 甩锅: most of the damage goes back to whoever dealt it. Returns what the defender takes. */
  private blameSplit(att: FighterState, def: FighterState, dmg: number): number {
    if (def.blameT <= 0 || att === def) return dmg;
    def.blameT = 0;
    att.hp -= dmg * 0.6;
    this.emit({ type: 'blameReflect', a: def.idx, b: att.idx, v: dmg * 0.6, x: def.p.x, z: def.p.z });
    return dmg * 0.4;
  }

  swallow(f: FighterState, o: FighterState): void {
    o.swallowedBy = f.idx;
    this.ctrl[o.idx].setState('hit', 1.3);
    o.attackKind = null;
    o.tilt = { x: 0, z: 0 };
    o.tiltV = { x: 0, z: 0 };
    f.boostT = 1.0;
    f.boostSize = 1.35;
    this.emit({ type: 'swallow', a: f.idx, b: o.idx });
  }

  /** Spit a swallowed opponent out like a cannonball (or just let go when interrupted). */
  spit(f: FighterState, o: FighterState, launch = true): void {
    if (o.swallowedBy !== f.idx) return;
    o.swallowedBy = -1;
    const lim = this.arena.half - 0.6;
    const reach = f.radius + o.radius + 0.2;
    o.p.x = clamp(f.p.x + f.face.x * reach, -lim, lim);
    o.p.z = clamp(f.p.z + f.face.z * reach, -lim, lim);
    o.y = 0;
    o.invuln = 0;
    if (!launch) return;
    this.emit({ type: 'spit', a: f.idx, b: o.idx });
    this.strike(f, o, 14, 13, 5, { ...f.face });
  }

  /** 笑到地震: a laughing tremor that rattles everyone standing nearby (including the laugher). */
  tremor(f: FighterState, big: boolean): void {
    this.emit({ type: 'tremor', a: f.idx, v: big ? 1 : 0 });
    for (const x of this.fighters) {
      if (!x.grounded || x.out || x.ko || Math.hypot(x.p.x - f.p.x, x.p.z - f.p.z) > 6) continue;
      const ang = this.rng.range(0, Math.PI * 2);
      const mag = ((x === f ? 2.2 : 3.6) * (big ? 1.4 : 1)) / x.c.kbResist;
      x.tiltV.x += Math.cos(ang) * mag;
      x.tiltV.z += Math.sin(ang) * mag;
      if (x !== f && x.state !== 'down') {
        const dmg = (big ? 5 : 2) * x.c.takenMult;
        x.hp -= dmg;
        f.counters.damageDealt += dmg;
      }
    }
  }

  /** 死亡凝视: eye beam that freezes the opponent. */
  glare(f: FighterState): void {
    const o = this.opponent(f);
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z;
    const along = dx * f.face.x + dz * f.face.z;
    const perp = Math.abs(dx * f.face.z - dz * f.face.x);
    const hit = along > 0 && along < 9 && perp < o.radius + 0.5 && !o.out && o.y < 2;
    this.emit({ type: 'beam', a: f.idx, b: o.idx, v: hit ? 1 : 0, move: 'glare' });
    if (!hit) return;
    this.strike(f, o, 5, 1, 0, { ...f.face });
    if (o.hp > 0 && o.grounded && o.shieldT <= 0) {
      this.ctrl[o.idx].setState('frozen', 1.3);
      o.v.x = o.v.z = 0;
      this.emit({ type: 'freeze', a: f.idx, b: o.idx, x: o.p.x, z: o.p.z });
    }
  }

  throwOver(f: FighterState, o: FighterState): void {
    // Over the shoulder: the opponent lands behind the thrower.
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    this.emit({ type: 'throw', a: f.idx, b: o.idx, v: 1 });
    this.strike(f, o, 12, 0, 0);
    o.v.x = (-dx / d) * 8;
    o.v.z = (-dz / d) * 8;
    o.vy = 8;
    o.grounded = false;
    o.tumbling = true;
    o.tiltV.x += (-dx / d) * 10;
    o.tiltV.z += (-dz / d) * 10;
    f.spinV += 14;
  }

  /** Frontal shout / wave. `power` scales it (countdowns hit harder, cry pulses start soft). */
  roar(f: FighterState, power = 1, stun = true): void {
    const o = this.opponent(f);
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    const gap = d - f.radius - o.radius;
    const hit = gap < 4.5 * Math.min(1.2, power) && (dx * f.face.x + dz * f.face.z) / d > 0.3 && !o.out && o.grounded;
    this.emit({ type: 'roar', a: f.idx, b: o.idx, v: hit ? power : 0 });
    if (!hit) return;
    this.strike(f, o, 4 * power, 7 * power, 0);
    if (stun && o.hp > 0) this.ctrl[o.idx].setState('stunned', 0.9);
  }

  // ---------------------------------------------------------------- specials

  private opponent(f: FighterState): FighterState {
    return this.fighters[f.idx === 0 ? 1 : 0];
  }

  flameTick(f: FighterState): void {
    const o = this.opponent(f);
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    const gap = d - f.radius - o.radius;
    if (gap > 2.4 || (dx * f.face.x + dz * f.face.z) / d < 0.3 || o.out || o.invuln > 0 || o.shieldT > 0 || Math.abs(o.y - f.y) > 1.5) return;
    const water = o.spec.element === 'water' || o.spec.element === 'ice';
    const dmg = 3.5 * f.c.dmgMult * o.c.takenMult * (water ? 0.4 : elementMultiplier(f.spec.element, o.spec.element));
    o.hp -= dmg;
    f.counters.damageDealt += dmg;
    o.v.x += (dx / d) * 2.6;
    o.v.z += (dz / d) * 2.6;
    o.tiltV.x += (dx / d) * 1.5;
    o.tiltV.z += (dz / d) * 1.5;
    if ((f.cooldowns.burnEmit ?? 0) <= 0) {
      f.cooldowns.burnEmit = 1;
      f.counters.hits++;
      this.emit({ type: water ? 'steam' : 'burn', a: f.idx, b: o.idx, v: dmg, x: o.p.x, z: o.p.z });
    }
  }

  gasBlast(f: FighterState): void {
    const o = this.opponent(f);
    const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d = Math.hypot(dx, dz) || 1;
    const gap = d - f.radius - o.radius;
    if (gap > 3.0 || o.out) {
      this.emit({ type: 'gas', a: f.idx, b: o.idx, v: 0 });
      return;
    }
    const strength = (12 - gap * 2) / (Math.sqrt(o.mass) * Math.sqrt(o.c.kbResist));
    o.v.x += (dx / d) * strength;
    o.v.z += (dz / d) * strength;
    o.vy = Math.max(o.vy, 3);
    o.grounded = false;
    o.tiltV.x += (dx / d) * 4;
    o.tiltV.z += (dz / d) * 4;
    o.hp -= 3 * o.c.takenMult;
    o.lastHitBy = { t: this.t, kind: 'gas' };
    f.counters.hits++;
    f.v.x -= (dx / d) * 2;
    f.v.z -= (dz / d) * 2;
    if (o.state !== 'down') this.ctrl[o.idx].setState('hit', 0.45);
    this.emit({ type: 'gas', a: f.idx, b: o.idx, v: strength });
  }

  charmTry(f: FighterState): void {
    const o = this.opponent(f);
    const d = Math.hypot(o.p.x - f.p.x, o.p.z - f.p.z) - f.radius - o.radius;
    if (d > 5 || !o.grounded || o.lying || o.out) return;
    const p = 0.75 - 0.3 * (o.spec.stats.stability / 100) + 0.2 * (f.spec.stats.luck / 100);
    if (!this.rng.chance(p)) return;
    o.charmedBy = f.idx;
    this.ctrl[o.idx].setState('charmed', 1.3);
    this.emit({ type: 'charm', a: f.idx, b: o.idx });
  }

  explode(f: FighterState): void {
    this.emit({ type: 'explode', a: f.idx, b: this.opponent(f).idx });
    for (const x of this.fighters) {
      if (x.out) continue;
      const dx = x.p.x - f.p.x, dz = x.p.z - f.p.z;
      const d = Math.hypot(dx, dz);
      if (x === f) {
        x.hp -= 12;
        const ang = this.rng.range(0, TAU);
        x.v.x += Math.cos(ang) * 3;
        x.v.z += Math.sin(ang) * 3;
        x.vy = 7;
      } else if (d < 3.6 + x.radius) {
        const fall = 1 - clamp(d / (3.6 + x.radius), 0, 1);
        const dmg = (10 + 22 * fall) * x.c.takenMult;
        x.hp -= dmg;
        f.counters.damageDealt += dmg;
        f.counters.hits++;
        const kb = (5 + 12 * fall) / Math.sqrt(x.mass);
        x.v.x += (dx / (d || 1)) * kb;
        x.v.z += (dz / (d || 1)) * kb;
        x.vy = 4 + 5 * fall;
        x.lastHitBy = { t: this.t, kind: 'explode' };
      } else continue;
      x.grounded = false;
      x.tumbling = true;
      x.tiltV.x += this.rng.range(-8, 8);
      x.tiltV.z += this.rng.range(-8, 8);
      if (x.hp > 0) this.ctrl[x.idx].setState('hit', 0.6);
    }
  }

  onDown(f: FighterState): void {
    this.emit({ type: 'down', a: f.idx });
    const o = this.opponent(f);
    if (Math.abs(o.lastDownT - this.t) < 0.45 && o.lying && this.t - this.lastDoubleDown > 2) {
      this.lastDoubleDown = this.t;
      this.emit({ type: 'doubleDown', a: 0, b: 1 });
    }
  }

  // ---------------------------------------------------------------- outcome

  private checkOutcome(dt: number): void {
    const [a, b] = this.fighters;
    // Safety net: whatever happened, anyone well below the canvas is out of the ring.
    for (const f of this.fighters) {
      if (!f.out && f.swallowedBy < 0 && f.y < -0.9) {
        f.out = true; // the out-of-ring physics moves it beside the apron and onto the floor
        if (this.phase === 'fight') this.emit({ type: 'ringout', a: f.idx, b: (1 - f.idx) as 0 | 1 });
      }
    }
    if (this.phase === 'fight') {
      const downA = a.hp <= 0 || a.out, downB = b.hp <= 0 || b.out;
      if (downA && downB) {
        const bothKO = a.hp <= 0 && b.hp <= 0;
        this.finish(null, 'draw', bothKO ? 'doubleKO' : 'doubleRingout');
      } else if (downA) this.finish(1, a.out ? 'ringout' : 'ko');
      else if (downB) this.finish(0, b.out ? 'ringout' : 'ko');
      else if (this.t >= BATTLE_TIME) this.judge();
    } else if (this.phase === 'epilogue') {
      this.epilogueT += dt;
      const res = this.result!;
      if (res.winner !== null && res.reason === 'ringout' && this.epilogueT < 0.3) {
        const w = this.fighters[res.winner];
        if (w.out) {
          res.winner = null;
          res.reason = 'draw';
          res.drawKind = 'doubleRingout';
          this.emit({ type: 'finish', a: 0, v: -1 });
        }
      }
      if (this.epilogueT >= EPILOGUE_TIME) this.phase = 'done';
    }
  }

  private judge(): void {
    const score = (f: FighterState) => (f.hp / f.maxHp) * 100 - (f.lying ? 12 : 0) - (Math.max(Math.abs(f.p.x), Math.abs(f.p.z)) > this.arena.half - 0.6 ? 4 : 0);
    const diff = score(this.fighters[0]) - score(this.fighters[1]);
    this.emit({ type: 'timeUp', a: 0 });
    if (Math.abs(diff) < 2) {
      const pA = 0.5 + (this.fighters[0].spec.stats.luck - this.fighters[1].spec.stats.luck) / 200;
      this.finish(this.rng.chance(pA) ? 0 : 1, 'timeup', undefined, true);
    } else this.finish(diff > 0 ? 0 : 1, 'timeup');
  }

  private finish(winner: 0 | 1 | null, reason: EndReason, drawKind?: 'doubleKO' | 'doubleRingout', luck = false): void {
    // Nobody stays swallowed through the victory lap.
    for (const f of this.fighters) if (f.swallowedBy >= 0) this.spit(this.fighters[f.swallowedBy], f, false);
    for (const f of this.fighters) {
      if (f.hp <= 0 && !f.ko) {
        f.ko = true;
        f.hp = 0;
        f.state = 'ko';
        f.downTarget = Math.PI / 2;
        if (f.tiltAngle < 0.2) {
          // Topple away from the opponent.
          const o = this.opponent(f);
          const dx = f.p.x - o.p.x, dz = f.p.z - o.p.z, d = Math.hypot(dx, dz) || 1;
          f.tiltV.x += (dx / d) * 5;
          f.tiltV.z += (dz / d) * 5;
        }
        this.emit({ type: 'ko', a: f.idx });
      }
    }
    if (winner !== null) {
      const w = this.fighters[winner];
      if (!w.out && !w.ko) this.ctrl[winner].setState('victory', 99);
    }
    const decisive = [...this.events].reverse().find((e) => e.type === 'ringout' || e.type === 'ko' || e.type === 'timeUp') ?? null;
    this.result = {
      winner,
      reason,
      drawKind,
      time: Math.max(0, this.t),
      seed: this.seed,
      hp: [Math.max(0, this.fighters[0].hp), Math.max(0, this.fighters[1].hp)],
      counters: [this.fighters[0].counters, this.fighters[1].counters],
      events: this.events,
      decisive,
      luckDecided: luck,
      names: [this.specs[0].name, this.specs[1].name],
      signatures: [this.specs[0].signature, this.specs[1].signature],
    };
    this.phase = 'epilogue';
    this.epilogueT = 0;
    this.emit({ type: 'finish', a: winner ?? 0, v: winner === null ? -1 : winner });
  }
}
