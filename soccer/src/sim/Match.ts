/**
 * Glyph Soccer 4v4 — the match simulation: ball physics, rules, contacts, kicks, tackles,
 * goals, clock. Decisions live in ai.ts, special moves in skills.ts, team combos in combos.ts.
 * Fixed 1/60 s steps with a seeded RNG: the same lineup + seed always plays the same match.
 */
import { Rng } from '@shared/core/rng';
import type { FighterSpec } from '@shared/core/StatGenerator';
import { comboFor, SOCCER_COMBOS } from '@shared/sports/combos';
import { sportAttributes, sportSkillFor, type DisableKind } from '@shared/sports/skills';
import type { TeamInput } from '@shared/sports/team';
import { think, steer } from './ai';
import { brawlStep, holdGrudge, maybeStartBrawl } from './brawl';
import { comboStep } from './combos';
import { cultureStep, initCulture } from './culture';
import {
  DT, EPILOGUE_TIME, FIELD, GOAL_PAUSE, GOLDEN_GOAL_TIME, INTRO_TIME, MATCH_TIME, TEAM_SIZE,
  type Ball, type EventType, type GoalRecord, type Kick, type MatchEvent, type MatchResult, type Player, type PlayerState, type Rivalry, type TeamState, type V2,
} from './types';

export type Phase = 'intro' | 'play' | 'goal' | 'over' | 'done';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
let FLIP = 1;
/** Test hook: rotate the whole pitch (team 0 attacks −x). */
export const setFlip = (v: 1 | -1) => (FLIP = v);
export const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1) * FLIP;
/** Which side (±1) z is on; exactly 0 (kick-off spot) breaks the tie towards the team's own left so both halves mirror each other. */
export const sideOf = (z: number, team: 0 | 1) => (z > 0 ? 1 : z < 0 ? -1 : dirOf(team));
/** Plain shots that turn into a leaping 必殺 shot: base chance + this × kick power. */
const SUPER_SHOT_BASE = 0.06, SUPER_SHOT_POWER = 0.22;
/** Take-off speed and wind-up of that leap (struck near the top of the jump). */
const SUPER_LEAP = 7.5, SUPER_WINDUP = 0.5;
const DISABLED: PlayerState[] = ['down', 'freeze', 'sleep', 'confuse', 'laugh', 'money', 'charm', 'celebrate'];

/** Kick-off formation in "attack coordinates" (u forward, w across), own half. */
const FORMATION: V2[] = [
  { x: -2.2, z: 0 },
  { x: -7, z: 5 },
  { x: -7, z: -5 },
  { x: -14, z: 0 },
];

export class Match {
  readonly rng: Rng;
  readonly players: Player[] = [];
  readonly teams: [TeamState, TeamState];
  readonly ball: Ball;
  readonly events: MatchEvent[] = [];
  /** Events since the last drain (renderer / UI read these). */
  fresh: MatchEvent[] = [];
  readonly score: [number, number] = [0, 0];
  readonly goals: GoalRecord[] = [];
  phase: Phase = 'intro';
  /** Game clock (seconds of play, pauses during goal celebrations). */
  clock = 0;
  /** Wall time since start (drives everything else). */
  t = -INTRO_TIME;
  steps = 0;
  goldenGoal = false;
  /** Team that kicks off next. */
  kickoffTeam: 0 | 1 = 0;
  private pauseT = 0;
  private epilogueT = 0;
  result: MatchResult | null = null;
  /** Gas clouds / chaos fields etc. set by skills & combos. */
  /** team 2 = affects both sides (rivalry weather); 'box' = a crate the ball bounces off. */
  zones: { team: 0 | 1 | 2; x: number; z: number; r: number; t: number; kind: 'cloud' | 'rain' | 'box' }[] = [];
  /** Registered culture matchup between the two teams (宿敌对决), if any. */
  rivalry: Rivalry | null = null;
  /** 鸡飞狗跳: everyone runs wild for this long. */
  chaosT = 0;
  /** 乱斗时刻: a short brawl around a spot (at most once a match). */
  brawl: { x: number; z: number; t: number } | null = null;
  brawlsLeft = 1;
  /** Delayed effects (props landing, combo steps). Run in order of time. */
  private timers: { at: number; run: () => void }[] = [];

  constructor(
    specs: [FighterSpec[], FighterSpec[]],
    inputs: [TeamInput, TeamInput],
    readonly seed: number,
  ) {
    this.rng = new Rng(seed);
    for (const team of [0, 1] as const) {
      specs[team].slice(0, TEAM_SIZE).forEach((spec, idx) => {
        this.players.push({
          id: team * TEAM_SIZE + idx,
          team,
          idx,
          spec,
          attr: sportAttributes(spec),
          skill: sportSkillFor(spec.signature),
          p: { x: 0, z: 0 },
          v: { x: 0, z: 0 },
          y: 0,
          vy: 0,
          face: { x: dirOf(team), z: 0 },
          state: 'play',
          stateT: 0,
          role: 'free',
          target: { x: 0, z: 0 },
          kickCd: 0,
          tackleCd: 0,
          skillCd: 5 + this.rng.range(0, 6),
          skillUses: 0,
          boostT: 0,
          wallT: 0,
          ghostT: 0,
          rallyT: 0,
          slowT: 0,
          pending: null,
          charge: 0,
          fightCd: 6 + this.rng.range(0, 6),
          grudge: -1,
          grudgeT: 0,
          volleyT: 0,
          volley: null,
          stats: { goals: 0, assists: 0, shots: 0, saves: 0, steals: 0, tackles: 0, passes: 0, skills: 0, skillHits: 0, ownGoals: 0, fights: 0 },
        });
      });
    }
    const ts = (i: 0 | 1): TeamState => ({ input: inputs[i], combo: comboFor(SOCCER_COMBOS, inputs[i]), comboCd: 10 + this.rng.range(0, 5), comboT: 0, comboUses: 0, heat: 0, luckUsed: false, peaceT: 0, chain: 0, chainTo: -1, lastShotT: -99, phaseMarks: 0,
      culture: null, cultureCd: 0, cultureUses: 0, fx: {}, cChain: 0, cChainTo: -1, cFinish: null, cQueue: [], cFollowT: 0, cFollowLife: 0,
      luckCharges: 0, wildNext: 0, tiredAfter: false, lastConcedeT: -99, lastSaveT: -99, lastTackleT: -99, lostBallT: -99, kickoffT: -99 });
    this.teams = [ts(0), ts(1)];
    this.ball = { p: { x: 0, y: FIELD.ballR, z: 0 }, v: { x: 0, y: 0, z: 0 }, spin: 0, owner: -1, lastKicker: -1, prevKicker: -1, prevKickT: -99, shot: null, flatT: 0, fx: null, noPickBy: -1, noPickT: 0, homingTo: -1, passTo: -1, passHold: false };
    this.kickoffTeam = this.rng.chance(0.5) ? 0 : 1;
    this.resetKickoff();
    initCulture(this);
  }

  // ---------------------------------------------------------------- helpers

  /** Run `fn` after `delay` seconds of match time (only while the ball is in play). */
  later(delay: number, fn: () => void): void {
    this.timers.push({ at: this.t + delay, run: fn });
  }

  emit(type: EventType, team: 0 | 1, a: number, extra: Partial<MatchEvent> = {}): MatchEvent {
    const p = a >= 0 ? this.players[a] : null;
    const e: MatchEvent = { t: this.t, type, team, a, x: p?.p.x ?? this.ball.p.x, z: p?.p.z ?? this.ball.p.z, ...extra };
    this.events.push(e);
    this.fresh.push(e);
    // Moments culture triggers listen for.
    const other = team === 0 ? 1 : 0;
    if (type === 'save') this.teams[team].lastSaveT = this.t;
    else if (type === 'tackleWin') {
      this.teams[team].lastTackleT = this.t;
      this.teams[other].lostBallT = this.t;
    } else if (type === 'goal' || type === 'ownGoal') this.teams[other].lastConcedeT = this.t;
    else if (type === 'kickoff') for (const ts of this.teams) ts.kickoffT = this.t;
    return e;
  }

  drain(): MatchEvent[] {
    const out = this.fresh;
    this.fresh = [];
    return out;
  }

  teamOf(team: 0 | 1): Player[] {
    return this.players.filter((p) => p.team === team);
  }

  opponents(p: Player): Player[] {
    return this.players.filter((o) => o.team !== p.team);
  }

  canAct(p: Player): boolean {
    return !DISABLED.includes(p.state) && p.state !== 'dive' && p.state !== 'skill';
  }

  isDisabled(p: Player): boolean {
    return DISABLED.includes(p.state);
  }

  /** Centre of the goal this team attacks. */
  attackGoal(team: 0 | 1): V2 {
    return { x: dirOf(team) * FIELD.halfL, z: 0 };
  }

  ownGoal(team: 0 | 1): V2 {
    return { x: -dirOf(team) * FIELD.halfL, z: 0 };
  }

  carrier(): Player | null {
    return this.ball.owner >= 0 ? this.players[this.ball.owner] : null;
  }

  setState(p: Player, s: PlayerState, dur: number): void {
    // 风平浪静: nobody on the calm team gets knocked over or stunned while it lasts.
    if (s !== 'play' && s !== 'kick' && s !== 'tackle' && s !== 'skill' && s !== 'celebrate' && s !== 'dive') {
      const ts = this.teams[p.team];
      if (ts.combo?.kind === 'calmSea' && ts.comboT > 0) return;
      if ((ts.fx.calm ?? 0) > 0 && s !== 'down') return;
      if (p.boostT > 0 && s === 'down') return;
    }
    p.state = s;
    p.stateT = dur;
    if (s !== 'play' && s !== 'kick') p.pending = null;
    if (DISABLED.includes(s) && this.ball.owner === p.id) this.looseBall(p, 2.5);
  }

  knockDown(p: Player, by: Player | null, dur = 0.9, push = 4): boolean {
    if (p.state === 'down' || p.state === 'celebrate') return false;
    const before = p.state;
    this.setState(p, 'down', dur);
    if (p.state === before) return false;
    if (by) {
      const dx = p.p.x - by.p.x, dz = p.p.z - by.p.z, d = Math.hypot(dx, dz) || 1;
      p.v.x += (dx / d) * push;
      p.v.z += (dz / d) * push;
      // Hot-headed glyphs remember who did it (arena-style revenge, see brawl.ts).
      holdGrudge(this, p, by);
    }
    // Arcade knock-downs: off their feet and through the air, harder pushes fly higher.
    p.vy = Math.max(p.vy, 2.6 + push * 0.55);
    p.stateT = Math.max(p.stateT, (2 * p.vy) / FIELD.playerGravity + 0.25);
    this.emit('knockdown', p.team, p.id, { b: by?.id });
    maybeStartBrawl(this, p);
    return true;
  }

  /** Freeze / sleep / confuse / laugh / money / charm. A charmed carrier hands the ball over. Returns false if resisted. */
  disable(p: Player, kind: DisableKind, dur: number, by: Player): boolean {
    const hadBall = this.ball.owner === p.id;
    const before = p.state;
    this.setState(p, kind, dur);
    if (p.state === before) return false;
    if (hadBall && kind === 'charm') {
      this.ball.homingTo = by.id;
      this.ball.noPickBy = p.id;
      this.ball.noPickT = 0.6;
    }
    return true;
  }

  /** Drop the ball at the carrier's feet with a little bounce. */
  looseBall(p: Player, speed: number): void {
    if (this.ball.owner !== p.id) return;
    this.ball.owner = -1;
    const a = this.rng.range(0, Math.PI * 2), s = dirOf(p.team);
    this.ball.v.x = Math.cos(a) * speed * s + p.v.x * 0.3;
    this.ball.v.z = Math.sin(a) * speed * s + p.v.z * 0.3;
    this.ball.v.y = 2;
    this.ball.noPickBy = p.id;
    this.ball.noPickT = 0.3;
  }

  /** Give the ball to a player (pick-up, catch, steal). */
  give(p: Player): void {
    const b = this.ball;
    if (b.owner >= 0 && b.owner !== p.id) {
      const prev = this.players[b.owner];
      if (prev.team !== p.team) {
        p.stats.steals++;
        this.teams[prev.team].lostBallT = this.t;
      }
    }
    b.owner = p.id;
    b.shot = null;
    b.spin = 0;
    b.flatT = 0;
    b.fx = null;
    b.homingTo = -1;
    b.passTo = -1;
    b.v.x = b.v.y = b.v.z = 0;
  }

  // ---------------------------------------------------------------- kicks

  /** Start a kick (short wind-up so the renderer can show it; a tackle can still interrupt). */
  kick(p: Player, k: Kick, windup = 0.12): void {
    if (this.ball.owner !== p.id || !this.canAct(p)) return;
    // 必殺シュート: now and then a plain shot becomes a leap and a strike from the air.
    if (k.kind === 'shot' && k.shot === 'normal' && p.y === 0 && this.rng.chance(SUPER_SHOT_BASE + p.attr.power * SUPER_SHOT_POWER)) {
      k = { ...k, shot: 'super', speed: k.speed * 1.18, loft: 0, power: true, fx: k.fx ?? 'super' };
      windup = SUPER_WINDUP;
      p.vy = SUPER_LEAP;
      this.emit('leap', p.team, p.id, { kind: 'super' });
    }
    p.pending = k;
    p.state = 'kick';
    p.stateT = windup;
  }

  /** Release the ball with a physically computed trajectory. */
  release(p: Player, k: Kick): void {
    const b = this.ball;
    if (b.owner !== p.id) return;
    const ts = this.teams[p.team];
    let speed = k.speed;
    let err = (1 - p.attr.accuracy) * (k.kind === 'shot' ? 0.11 : 0.07);
    // Pressure makes it sloppier.
    const press = this.pressure(p);
    err *= 1 + press * 0.8;
    if (ts.combo?.kind === 'calmSea' && ts.comboT > 0) err *= 0.3;
    if (ts.combo?.kind === 'tigerTail' && this.clock > MATCH_TIME - 40) err *= 1.6;
    if (k.shot === 'beamShot' || k.shot === 'powerShot') err *= 0.5;
    if ((ts.fx.accuracy ?? 0) > 0) err *= 0.4;
    // Culture backfire: this kick flies wild (2 = may even turn back towards our own goal).
    if (ts.wildNext) {
      err += ts.wildNext === 2 ? 1.6 : 0.4;
      this.emit('prim', p.team, p.id, { kind: ts.wildNext === 2 ? 'risk:ownRisk' : 'risk:wild' });
      ts.wildNext = 0;
    }
    const dx = k.target.x - b.p.x, dz = k.target.z - b.p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx) + this.rng.range(-err, err);
    speed *= 1 + this.rng.range(-0.06, 0.06);
    b.owner = -1;
    b.prevKicker = b.lastKicker;
    b.prevKickT = this.t;
    b.lastKicker = p.id;
    b.noPickBy = p.id;
    b.noPickT = 0.28;
    b.spin = k.spin;
    b.fx = k.fx ?? null;
    b.passTo = k.kind === 'pass' ? k.to : -1;
    b.passHold = !!k.hold;
    const hs = speed * (1 - 0.45 * k.loft);
    b.v.x = Math.cos(ang) * hs;
    b.v.z = Math.sin(ang) * hs;
    const tFly = dist / hs;
    if (k.kind === 'shot') {
      // Aim for a height at the goal line; gravity included.
      const hTarget = k.shot === 'skyShot' ? FIELD.goalH - 0.4 : 0.35 + this.rng.range(0, 1.3) * (1 - k.loft * 0.5);
      b.v.y = (hTarget - b.p.y) / tFly + 0.5 * FIELD.gravity * tFly;
      if (k.shot === 'beamShot') {
        b.v.y = 0;
        b.flatT = 1.2;
      }
      if (k.shot === 'super') {
        // Struck from the top of the leap: it drives down at the goal like a missile.
        b.v.y = (Math.min(hTarget, 1.4) - b.p.y) / tFly;
        b.flatT = tFly + 0.1;
      }
      b.shot = { by: p.id, kind: k.shot, t: this.t, power: k.power ?? (k.shot === 'powerShot' || k.shot === 'beamShot' || k.shot === 'skyShot' || k.shot === 'combo' || k.shot === 'super'), label: k.label };
      p.stats.shots++;
      this.emit('shot', p.team, p.id, { kind: k.shot, label: k.label, v: speed });
      if (ts.combo?.kind === 'fuelFire') ts.heat = 0;
      ts.lastShotT = this.t;
    } else {
      b.v.y = k.loft > 0.15 ? 0.5 * FIELD.gravity * tFly * Math.min(1, k.loft * 1.6) : 0.6;
      b.shot = null;
      if (k.kind === 'pass') {
        p.stats.passes++;
        this.emit('pass', p.team, p.id, { b: k.to, v: k.loft });
      }
    }
    p.kickCd = 0.35;
    p.charge = 0;
  }

  /** Shot speed for a player (+ skill / combo bonuses). */
  shotSpeed(p: Player): number {
    const ts = this.teams[p.team];
    let s = 19 + p.attr.power * 7;
    if (ts.combo?.kind === 'fuelFire') s += ts.heat * 2.2;
    return s;
  }

  /** Opponents close to a player, 0‥1. */
  pressure(p: Player): number {
    let best = 9;
    for (const o of this.players) if (o.team !== p.team && !this.isDisabled(o)) best = Math.min(best, Math.hypot(o.p.x - p.p.x, o.p.z - p.p.z));
    return clamp((3 - best) / 2.4, 0, 1);
  }

  // ---------------------------------------------------------------- tackles

  tackle(p: Player, target: Player): void {
    if (p.tackleCd > 0 || !this.canAct(p)) return;
    // A kick that was being wound up is abandoned (the ball was lost in the meantime).
    p.pending = null;
    p.tackleCd = 1.1;
    p.state = 'tackle';
    p.stateT = 0.35;
    const dx = target.p.x - p.p.x, dz = target.p.z - p.p.z, d = Math.hypot(dx, dz) || 1;
    p.v.x = (dx / d) * (p.attr.pace + 2.5);
    p.v.z = (dz / d) * (p.attr.pace + 2.5);
    p.target = { x: target.p.x, z: target.p.z };
    p.stats.tackles++;
  }

  private resolveTackle(p: Player): void {
    const c = this.carrier();
    if (!c || c.team === p.team) return;
    const d = Math.hypot(c.p.x - p.p.x, c.p.z - p.p.z);
    if (d > p.attr.radius + c.attr.radius + 0.35) return;
    p.state = 'play';
    p.stateT = 0;
    const ts = this.teams[p.team], cs = this.teams[c.team];
    let chance = 0.42 + (p.attr.defense - c.attr.control) * 0.6 + (p.attr.mass - c.attr.mass) * 0.05;
    if (ts.combo?.kind === 'lawless' && ts.comboT > 0) chance += 0.15;
    if (ts.combo?.kind === 'surround' && ts.comboT > 0) chance += 0.2;
    if (cs.combo?.kind === 'calmSea' && cs.comboT > 0) chance -= 0.15;
    if (ts.fx.tackleBoost) chance += 0.15;
    if (ts.fx.press) chance += 0.1;
    if (cs.fx.grip) chance -= 0.15;
    if (ts.fx.peace) chance -= 0.1;
    if (c.boostT > 0) chance = 0.05;
    if (c.ghostT > 0 || p.attr.tags.includes('ghost')) chance *= 0.6;
    chance = clamp(chance, 0.08, 0.85);
    if (this.rng.chance(chance)) {
      this.ball.owner = -1;
      const toward = { x: p.p.x - c.p.x, z: p.p.z - c.p.z };
      const l = Math.hypot(toward.x, toward.z) || 1;
      const s = dirOf(p.team);
      this.ball.v.x = (toward.x / l) * 3 + this.rng.range(-2, 2) * s;
      this.ball.v.z = (toward.z / l) * 3 + this.rng.range(-2, 2) * s;
      this.ball.v.y = 1.5;
      this.ball.noPickBy = c.id;
      this.ball.noPickT = 0.4;
      p.stats.steals++;
      this.emit('tackleWin', p.team, p.id, { b: c.id });
      const harsh = p.attr.mass > c.attr.mass * 1.15 || p.attr.tags.includes('angry') || (ts.combo?.kind === 'lawless' && ts.comboT > 0);
      holdGrudge(this, c, p);
      if (harsh) this.knockDown(c, p, 0.8, 3);
      if (p.attr.tags.includes('electric')) this.setState(c, 'freeze', 0.7);
    } else {
      this.emit('tackleFail', p.team, p.id, { b: c.id });
      this.setState(p, 'down', 0.65);
    }
  }

  // ---------------------------------------------------------------- step

  step(): void {
    if (this.phase === 'done') return;
    this.steps++;
    const dt = DT;
    if (this.phase === 'intro' && this.t >= 0) {
      this.phase = 'play';
      this.emit('kickoff', this.kickoffTeam, this.ball.owner);
      if (this.rivalry) this.emit('rivalry', this.rivalry.swapped ? 1 : 0, -1, { kind: this.rivalry.effect, label: this.rivalry.name });
    }
    if (this.phase === 'goal') {
      this.pauseT -= dt;
      if (this.pauseT <= 0) {
        this.resetKickoff();
        this.phase = 'play';
        this.emit('kickoff', this.kickoffTeam, this.ball.owner);
      }
    }
    const playing = this.phase === 'play';
    if (playing) {
      this.clock += dt;
      if (this.steps % 6 === 0) for (const team of [0, 1] as const) think(this, team);
      for (const team of [0, 1] as const) comboStep(this, team, dt);
      for (const team of [0, 1] as const) cultureStep(this, team, dt);
      brawlStep(this, dt);
      if (this.timers.length) {
        const due = this.timers.filter((x) => x.at <= this.t);
        this.timers = this.timers.filter((x) => x.at > this.t);
        for (const x of due) x.run();
      }
    }
    for (const p of this.players) this.updatePlayer(p, dt, playing);
    this.collidePlayers();
    this.updateBall(dt, playing);
    for (const z of this.zones) z.t -= dt;
    this.zones = this.zones.filter((z) => z.t > 0);
    this.chaosT = Math.max(0, this.chaosT - dt);
    if (playing) this.checkClock();
    if (this.phase === 'over') {
      this.epilogueT += dt;
      if (this.epilogueT >= EPILOGUE_TIME) this.phase = 'done';
    }
    this.t += dt;
  }

  runToEnd(maxSteps = 60 * 400): MatchResult {
    while (this.phase !== 'done' && this.steps < maxSteps) this.step();
    if (!this.result) this.finish();
    return this.result!;
  }

  private checkClock(): void {
    if (!this.goldenGoal && this.clock >= MATCH_TIME) {
      this.emit('timeUp', 0, -1);
      if (this.score[0] === this.score[1]) {
        this.goldenGoal = true;
        this.emit('goldenGoal', 0, -1);
      } else this.finish();
    } else if (this.goldenGoal && this.clock >= MATCH_TIME + GOLDEN_GOAL_TIME) this.finish();
  }

  private finish(): void {
    if (this.result) return;
    this.phase = 'over';
    const [a, b] = this.score;
    const winner = a === b ? null : a > b ? 0 : 1;
    for (const p of this.players) {
      if (winner !== null && p.team === winner && this.canAct(p)) this.setState(p, 'celebrate', 99);
    }
    this.emit('finish', winner ?? 0, -1, { v: winner === null ? -1 : winner });
    this.result = {
      seed: this.seed,
      score: [a, b],
      winner,
      goldenGoal: this.goldenGoal,
      time: this.clock,
      goals: this.goals,
      events: this.events,
      mvp: this.mvp(winner),
      teams: [this.teams[0].input, this.teams[1].input],
    };
  }

  /** Goals ×4, assists ×2.5, saves ×1.5, steals, skill hits; the winning side breaks ties. */
  mvp(winner: 0 | 1 | null): number {
    let best = 0, bestScore = -1;
    for (const p of this.players) {
      const s = p.stats;
      let sc = s.goals * 4 + s.assists * 2.5 + s.saves * 1.5 + s.steals * 0.6 + s.skillHits * 0.8 + s.shots * 0.2 - s.ownGoals * 2;
      if (winner !== null && p.team === winner) sc += 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = p.id;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- players

  private updatePlayer(p: Player, dt: number, playing: boolean): void {
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt * (p.rallyT > 0 ? 1.5 : 1));
    p.boostT = Math.max(0, p.boostT - dt);
    p.wallT = Math.max(0, p.wallT - dt);
    p.ghostT = Math.max(0, p.ghostT - dt);
    p.rallyT = Math.max(0, p.rallyT - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.fightCd = Math.max(0, p.fightCd - dt);
    p.grudgeT = Math.max(0, p.grudgeT - dt);
    if (p.state !== 'play') {
      p.stateT -= dt;
      if (p.stateT <= 0) {
        if (p.state === 'kick' && p.pending) {
          const k = p.pending;
          p.pending = null;
          p.state = 'play';
          this.release(p, k);
        } else if (p.state !== 'celebrate') p.state = 'play';
      }
    }
    if (p.state === 'tackle') this.resolveTackle(p);
    // Safety: a wound-up kick only exists during the 'kick' state (a stale one froze carriers).
    if (p.pending && p.state !== 'kick') p.pending = null;
    // Vertical (jumps, knock-downs, dives).
    p.volleyT = Math.max(0, p.volleyT - dt);
    if (p.volleyT <= 0) p.volley = null;
    if (playing) this.tryLeap(p);
    if (p.y > 0 || p.vy > 0) {
      p.vy -= FIELD.playerGravity * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
    }
    // Horizontal movement.
    let maxSpeed = this.maxSpeedOf(p);
    if (!playing && this.phase !== 'goal') maxSpeed = 0;
    let want = { x: 0, z: 0 };
    if (p.state === 'play' && playing) want = steer(this, p, maxSpeed);
    else if (p.state === 'confuse' || (this.chaosT > 0 && p.state === 'play')) {
      const a = Math.sin(this.t * 2.3 + p.id * 1.7) * Math.PI, s = dirOf(p.team);
      want = { x: Math.cos(a) * maxSpeed * 0.7 * s, z: Math.sin(a) * maxSpeed * 0.7 * s };
    } else if (p.state === 'celebrate') {
      const a = this.t * 3 + p.id, s = dirOf(p.team);
      want = { x: Math.cos(a) * 2 * s, z: Math.sin(a) * 2 * s };
    } else if (this.phase === 'goal' && p.state === 'play') want = steer(this, p, maxSpeed * 0.6);
    if (p.state !== 'tackle' && p.state !== 'dive' && p.state !== 'skill') {
      const accel = p.attr.accel * (p.state === 'down' ? 0 : 1) * (p.attr.tags.includes('slippery') ? 0.6 : 1);
      let dvx = want.x - p.v.x, dvz = want.z - p.v.z;
      const dl = Math.hypot(dvx, dvz), maxDv = (accel + (p.state === 'down' ? 6 : 0)) * dt;
      if (dl > maxDv && dl > 0) {
        dvx *= maxDv / dl;
        dvz *= maxDv / dl;
      }
      p.v.x += dvx;
      p.v.z += dvz;
    } else {
      p.v.x *= Math.exp(-2.5 * dt);
      p.v.z *= Math.exp(-2.5 * dt);
    }
    p.p.x += p.v.x * dt;
    p.p.z += p.v.z * dt;
    const sp = Math.hypot(p.v.x, p.v.z);
    if (sp > 0.4 && p.state !== 'down') {
      p.face.x += (p.v.x / sp - p.face.x) * Math.min(1, dt * 10);
      p.face.z += (p.v.z / sp - p.face.z) * Math.min(1, dt * 10);
      const fl = Math.hypot(p.face.x, p.face.z) || 1;
      p.face.x /= fl;
      p.face.z /= fl;
    }
    // Stay on the pitch (boards all round).
    const r = p.attr.radius;
    p.p.x = clamp(p.p.x, -FIELD.halfL + r * 0.6, FIELD.halfL - r * 0.6);
    p.p.z = clamp(p.p.z, -FIELD.halfW + r, FIELD.halfW - r);
    // Crates on the pitch are solid.
    for (const z of this.zones) {
      if (z.kind !== 'box') continue;
      const dx = p.p.x - z.x, dz = p.p.z - z.z, d = Math.hypot(dx, dz), min = z.r + r;
      if (d < min && d > 1e-6) {
        p.p.x = z.x + (dx / d) * min;
        p.p.z = z.z + (dz / d) * min;
      }
    }
  }

  /** Running speed right now: pace × buffs, team effects, ball at feet, gas clouds. */
  maxSpeedOf(p: Player): number {
    let s = p.attr.pace * (p.boostT > 0 ? 1.55 : 1) * (p.rallyT > 0 ? 1.18 : 1) * (p.slowT > 0 ? 0.5 : 1);
    const ts = this.teams[p.team];
    if (ts.combo?.kind === 'tigerTail') s *= this.clock < 40 ? 1.15 : this.clock > MATCH_TIME - 40 ? 0.88 : 1;
    if (ts.fx.sprint) s *= 1.22;
    if (ts.fx.tired) s *= 0.85;
    if (this.ball.owner === p.id) s *= 0.88 + p.attr.control * 0.1;
    for (const z of this.zones) if (z.kind === 'cloud' && z.team !== p.team && Math.hypot(p.p.x - z.x, p.p.z - z.z) < z.r) s *= 0.5;
    return s;
  }

  private collidePlayers(): void {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (a.ghostT > 0 || b.ghostT > 0) continue;
        const dx = b.p.x - a.p.x, dz = b.p.z - a.p.z;
        const d = Math.hypot(dx, dz), min = a.attr.radius + b.attr.radius;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, pen = min - d;
        const wa = b.attr.mass / (a.attr.mass + b.attr.mass), wb = 1 - wa;
        a.p.x -= nx * pen * wa;
        a.p.z -= nz * pen * wa;
        b.p.x += nx * pen * wb;
        b.p.z += nz * pen * wb;
        // Dashing / charging players flatten opponents they run into.
        if (a.team !== b.team && this.phase === 'play') {
          if (a.boostT > 0 && !this.isDisabled(b) && this.knockDown(b, a, 0.9, 5)) a.stats.skillHits++;
          if (b.boostT > 0 && !this.isDisabled(a) && this.knockDown(a, b, 0.9, 5)) b.stats.skillHits++;
        }
      }
    }
  }

  // ---------------------------------------------------------------- ball

  private updateBall(dt: number, playing: boolean): void {
    const b = this.ball;
    b.noPickT = Math.max(0, b.noPickT - dt);
    if (b.owner >= 0) {
      const p = this.players[b.owner];
      const reach = p.attr.radius + FIELD.ballR + 0.12;
      const sp = Math.hypot(p.v.x, p.v.z);
      const bob = Math.sin(this.t * 14) * 0.08 * Math.min(1, sp / 3);
      b.p.x = p.p.x + p.face.x * (reach + bob);
      b.p.z = p.p.z + p.face.z * (reach + bob);
      b.p.y = FIELD.ballR + p.y * (p.pending?.shot === 'super' ? 0.95 : 0.5);
      b.v.x = p.v.x;
      b.v.z = p.v.z;
      b.v.y = 0;
      // Never dribble the ball into your own net; carrying it into theirs counts.
      const ownSide = -dirOf(p.team);
      if (Math.sign(b.p.x) === ownSide && Math.abs(b.p.x) > FIELD.halfL - FIELD.ballR - 0.05) b.p.x = ownSide * (FIELD.halfL - FIELD.ballR - 0.05);
      this.checkGoal();
      return;
    }
    const g = FIELD.gravity;
    // Homing (magnet / charm): the ball flies to one player.
    if (b.homingTo >= 0) {
      const h = this.players[b.homingTo];
      const dx = h.p.x - b.p.x, dz = h.p.z - b.p.z, d = Math.hypot(dx, dz);
      if (d < 0.6 || this.isDisabled(h)) b.homingTo = -1;
      else {
        b.v.x += ((dx / d) * 16 - b.v.x) * Math.min(1, dt * 6);
        b.v.z += ((dz / d) * 16 - b.v.z) * Math.min(1, dt * 6);
      }
    }
    if (b.flatT > 0) b.flatT -= dt;
    else b.v.y -= g * dt;
    // Curl: sideways acceleration perpendicular to travel.
    if (b.spin) {
      const sp = Math.hypot(b.v.x, b.v.z) || 1;
      b.v.x += (-b.v.z / sp) * b.spin * dt;
      b.v.z += (b.v.x / sp) * b.spin * dt;
      b.spin *= Math.exp(-0.9 * dt);
    }
    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;
    b.p.z += b.v.z * dt;
    const R = FIELD.ballR;
    // Ground.
    if (b.p.y < R) {
      b.p.y = R;
      if (b.v.y < -2) {
        b.v.y = -b.v.y * 0.55;
        b.v.x *= 0.88;
        b.v.z *= 0.88;
        if (this.chaosT > 0) {
          b.v.x += this.rng.range(-4, 4) * dirOf(0);
          b.v.z += this.rng.range(-4, 4) * dirOf(0);
        }
        if (Math.abs(b.v.y) > 3) this.emit('bounce', 0, -1, { v: b.v.y });
      } else b.v.y = 0;
    }
    if (b.p.y <= R + 0.01) {
      // Rolling friction.
      const sp = Math.hypot(b.v.x, b.v.z);
      if (sp > 0) {
        const ns = Math.max(0, sp - (1.6 + sp * 0.35) * dt);
        b.v.x *= ns / sp;
        b.v.z *= ns / sp;
      }
    }
    this.ballWalls();
    if (this.checkGoal()) return;
    if (playing) this.ballContacts();
  }

  private ballWalls(): void {
    const b = this.ball, R = FIELD.ballR;
    const { halfL, halfW, goalHalfW, goalH, postR } = FIELD;
    if (Math.abs(b.p.z) > halfW - R) {
      b.p.z = Math.sign(b.p.z) * (halfW - R);
      b.v.z = -b.v.z * 0.75;
      this.ballHitWall();
    }
    const inMouth = Math.abs(b.p.z) < goalHalfW - R && b.p.y < goalH - R;
    if (Math.abs(b.p.x) > halfL - R && !inMouth) {
      if (Math.abs(b.p.x) < halfL + 0.3 || Math.abs(b.p.z) > goalHalfW) {
        b.p.x = Math.sign(b.p.x) * (halfL - R);
        b.v.x = -b.v.x * 0.75;
        this.ballHitWall();
      }
    }
    // Crates (culture obstacle): the ball caroms off.
    for (const z of this.zones) {
      if (z.kind !== 'box' || b.p.y > 1.1) continue;
      const dx = b.p.x - z.x, dz = b.p.z - z.z, d = Math.hypot(dx, dz);
      if (d < z.r + R && d > 1e-6) {
        const nx = dx / d, nz = dz / d, vn = b.v.x * nx + b.v.z * nz;
        if (vn < 0) {
          b.v.x -= 1.75 * vn * nx;
          b.v.z -= 1.75 * vn * nz;
          this.emit('bounce', 0, -1, { v: -vn, kind: 'box' });
        }
        b.p.x = z.x + nx * (z.r + R);
        b.p.z = z.z + nz * (z.r + R);
      }
    }
    // Back of the net.
    if (Math.abs(b.p.x) > halfL + FIELD.goalDepth - R) {
      b.p.x = Math.sign(b.p.x) * (halfL + FIELD.goalDepth - R);
      b.v.x = -b.v.x * 0.2;
    }
    // Posts and crossbar.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * halfL, pz = sz * goalHalfW;
        const dx = b.p.x - px, dz = b.p.z - pz, d = Math.hypot(dx, dz);
        if (d < postR + R && b.p.y < goalH) {
          const nx = dx / (d || 1), nz = dz / (d || 1);
          const vn = b.v.x * nx + b.v.z * nz;
          if (vn < 0) {
            b.v.x -= 1.7 * vn * nx;
            b.v.z -= 1.7 * vn * nz;
            b.p.x = px + nx * (postR + R);
            b.p.z = pz + nz * (postR + R);
            this.emit('post', b.shot ? this.players[b.shot.by].team : 0, b.shot?.by ?? -1);
            this.luckyBounce();
          }
        }
      }
      if (Math.abs(b.p.z) < goalHalfW && Math.abs(b.p.x - sx * halfL) < R + 0.12 && Math.abs(b.p.y - goalH) < R + 0.08) {
        b.v.y = -Math.abs(b.v.y) * 0.6 - 1;
        b.v.x *= -0.5;
        this.emit('post', b.shot ? this.players[b.shot.by].team : 0, b.shot?.by ?? -1, { kind: 'bar' });
        this.luckyBounce();
      }
    }
  }

  /** A wall rebound ends a shot. */
  private ballHitWall(): void {
    if (this.ball.shot) this.ball.shot = null;
  }

  /** 大吉大利: once a match, a shot that hits the woodwork or the keeper goes in anyway. */
  luckyBounce(): boolean {
    const b = this.ball;
    if (!b.shot) return false;
    const shooter = this.players[b.shot.by];
    const ts = this.teams[shooter.team];
    const idiom = ts.combo?.kind === 'goodLuck' && !ts.luckUsed;
    if (!idiom && ts.luckCharges <= 0) return false;
    if (idiom) ts.luckUsed = true;
    else ts.luckCharges--;
    const g = this.attackGoal(shooter.team);
    const dx = g.x - b.p.x, dz = this.rng.range(-1.5, 1.5) * dirOf(shooter.team) - b.p.z, d = Math.hypot(dx, dz) || 1;
    b.v.x = (dx / d) * 14;
    b.v.z = (dz / d) * 14;
    b.v.y = 2;
    b.owner = -1;
    this.emit('luckyBounce', shooter.team, shooter.id);
    if (idiom) this.emit('combo', shooter.team, shooter.id, { kind: 'goodLuck' });
    else this.emit('prim', shooter.team, shooter.id, { kind: 'lucky', label: 'bounce' });
    return true;
  }

  /** Returns true when a goal was scored this step. */
  private checkGoal(): boolean {
    const b = this.ball;
    if (this.phase !== 'play') return false;
    const { halfL, goalHalfW, goalH } = FIELD;
    if (Math.abs(b.p.x) <= halfL + FIELD.ballR || Math.abs(b.p.z) >= goalHalfW || b.p.y >= goalH) {
      // Behind the line but outside the mouth: keep it in the net box.
      return false;
    }
    const intoGoalOf: 0 | 1 = b.p.x * FLIP > 0 ? 1 : 0; // the team defending that goal
    const scoringTeam: 0 | 1 = intoGoalOf === 0 ? 1 : 0;
    const kicker = b.owner >= 0 ? b.owner : b.lastKicker;
    const kp = kicker >= 0 ? this.players[kicker] : null;
    const own = !!kp && kp.team !== scoringTeam;
    const shot = b.shot;
    this.score[scoringTeam]++;
    let assist = -1;
    if (!own && kp && b.prevKicker >= 0 && b.prevKicker !== kp.id && this.players[b.prevKicker].team === scoringTeam && this.t - b.prevKickT < 8) assist = b.prevKicker;
    if (kp) {
      if (own) kp.stats.ownGoals++;
      else kp.stats.goals++;
    }
    if (assist >= 0) this.players[assist].stats.assists++;
    if (kp && shot && shot.kind !== 'normal' && !own) kp.stats.skillHits++;
    const rec: GoalRecord = { t: this.clock, team: scoringTeam, scorer: kicker, assist, shot: shot?.kind ?? 'normal', label: shot?.label, own };
    this.goals.push(rec);
    this.emit(own ? 'ownGoal' : 'goal', scoringTeam, kicker, { b: assist, kind: rec.shot, label: rec.label, v: this.score[scoringTeam] });
    // Freeze the ball in the net.
    b.owner = -1;
    b.v.x *= 0.15;
    b.v.z *= 0.15;
    b.p.x = Math.sign(b.p.x) * (halfL + 0.8);
    b.shot = null;
    this.kickoffTeam = intoGoalOf;
    for (const p of this.players) {
      p.pending = null;
      if (p.team === scoringTeam && !this.isDisabled(p)) this.setState(p, 'celebrate', GOAL_PAUSE - 0.3);
    }
    if (this.goldenGoal) this.finish();
    else {
      this.phase = 'goal';
      this.pauseT = GOAL_PAUSE;
    }
    return true;
  }

  private ballContacts(): void {
    const b = this.ball, R = FIELD.ballR;
    const speed = Math.hypot(b.v.x, b.v.z);
    let best: Player | null = null, bestD = Infinity;
    for (const p of this.players) {
      if (!this.canAct(p) && p.state !== 'dive') continue;
      if (b.noPickT > 0 && b.noPickBy === p.id) continue;
      const d = Math.hypot(p.p.x - b.p.x, p.p.z - b.p.z);
      const keeper = p.role === 'keeper' || p.state === 'dive';
      const reach = p.attr.radius + R + (keeper ? 0.45 + p.attr.jump * 0.3 : 0.12) + (p.wallT > 0 ? 0.5 : 0);
      const high = 0.95 + (keeper ? 0.6 + p.attr.jump * 0.8 : p.attr.jump * 0.3) + p.y + (p.wallT > 0 ? 0.6 : 0);
      if (d > reach || b.p.y > high) continue;
      if (b.homingTo >= 0 && b.homingTo !== p.id) continue;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const p = best;
    const shot = b.shot;
    if (shot && this.players[shot.by].team !== p.team) {
      this.stopShot(p, speed);
      return;
    }
    if (p.volley && p.y > 0.5 && b.p.y > 1.1) {
      this.volley(p);
      return;
    }
    // A teammate's or loose ball: control it (fast balls can bounce off a clumsy first touch).
    if (speed > 13 && this.rng.chance(clamp((speed - 11) / 18 * (1 - p.attr.control), 0, 0.6))) {
      b.v.x = -b.v.x * 0.35 + this.rng.range(-2, 2) * dirOf(p.team);
      b.v.z = -b.v.z * 0.35 + this.rng.range(-2, 2) * dirOf(p.team);
      b.noPickBy = p.id;
      b.noPickT = 0.3;
      return;
    }
    const wasPass = b.lastKicker >= 0 && this.players[b.lastKicker].team !== p.team && this.t - b.prevKickT < 3 && speed > 4;
    if (wasPass) this.emit('intercept', p.team, p.id, { b: b.lastKicker });
    // 火上浇油: each pass that reaches a teammate stokes the fire.
    if (b.lastKicker >= 0 && b.lastKicker !== p.id && this.players[b.lastKicker].team === p.team) {
      const ts = this.teams[p.team];
      if (ts.combo?.kind === 'fuelFire') {
        ts.heat = Math.min(5, ts.heat + 1);
        if (ts.heat === 3) this.emit('combo', p.team, p.id, { kind: 'fuelFire', v: ts.heat });
      }
    }
    this.give(p);
  }

  /** An opponent meets a shot: keeper save (catch or parry), block, or a power shot bursting through. */
  private stopShot(p: Player, speed: number): void {
    const b = this.ball;
    const shot = b.shot!;
    const keeper = p.role === 'keeper' || p.state === 'dive';
    if (p.wallT > 0 && this.rng.chance(shot.power ? 0.45 : 0.7)) {
      // 铁壁 / 甩锅: the shot rebounds hard.
      b.v.x = -b.v.x * 0.8;
      b.v.z = -b.v.z * 0.8 + this.rng.range(-3, 3) * dirOf(p.team);
      b.v.y = 3;
      b.shot = null;
      b.lastKicker = p.id;
      b.noPickBy = p.id;
      b.noPickT = 0.3;
      p.stats.saves++;
      p.stats.skillHits++;
      this.emit('save', p.team, p.id, { b: shot.by, kind: 'wall' });
      return;
    }
    const sup = shot.kind === 'super' || shot.kind === 'volley';
    if (shot.power && this.rng.chance((keeper ? 0.5 - p.attr.defense * 0.2 : 0.65) * (sup ? 0.75 : 1))) {
      // Bursts through: the defender is blasted off their feet, the ball keeps going.
      this.knockDown(p, this.players[shot.by], 1.0, sup ? 9 : 6);
      if (p.state === 'down') {
        const l = Math.hypot(b.v.x, b.v.z) || 1;
        p.v.x += (b.v.x / l) * (sup ? 6 : 3);
        p.v.z += (b.v.z / l) * (sup ? 6 : 3);
        this.emit('launch', p.team, p.id, { b: shot.by, kind: shot.kind });
      }
      b.v.x *= 0.78;
      b.v.z *= 0.78;
      b.noPickBy = p.id;
      b.noPickT = 0.5;
      if (this.luckyBounce()) return;
      return;
    }
    if (this.luckyBounce()) return;
    if (keeper && speed < 13 + p.attr.defense * 9) {
      this.give(p);
      p.stats.saves++;
      this.emit('save', p.team, p.id, { b: shot.by, kind: 'catch' });
      return;
    }
    // Parry / block.
    const side = (this.rng.chance(0.5) ? 1 : -1) * dirOf(p.team);
    b.v.x = -b.v.x * 0.35;
    b.v.z = b.v.z * 0.3 + side * this.rng.range(3, 7);
    b.v.y = this.rng.range(2, 6);
    b.shot = null;
    b.noPickBy = p.id;
    b.noPickT = 0.35;
    if (keeper) p.stats.saves++;
    this.emit(keeper ? 'save' : 'block', p.team, p.id, { b: shot.by, kind: 'parry' });
  }

  // ---------------------------------------------------------------- arcade aerials

  /** An attacker under a dropping high ball near goal springs up to meet it. */
  private tryLeap(p: Player): void {
    const b = this.ball;
    if (p.y > 0 || p.vy > 0 || p.volley || p.state !== 'play' || p.role === 'keeper' || b.owner >= 0 || b.homingTo >= 0) return;
    if (b.shot && this.players[b.shot.by].team !== p.team) return;
    if (b.p.y < 1.4 || b.p.y > 4.2 || b.v.y > 3) return;
    const goal = this.attackGoal(p.team);
    if (Math.hypot(goal.x - p.p.x, goal.z - p.p.z) > 15) return;
    // Meet the ball a beat from now, where it will be.
    const lead = 0.28;
    const bx = b.p.x + b.v.x * lead, bz = b.p.z + b.v.z * lead;
    if (Math.hypot(bx - p.p.x, bz - p.p.z) > 1.6 + p.attr.jump) return;
    if (!this.rng.chance(0.25 + p.attr.jump * 0.35)) return;
    const h = b.p.y + b.v.y * lead - 0.5 * FIELD.gravity * lead * lead - 0.9;
    p.vy = Math.sqrt(2 * FIELD.playerGravity * Math.max(0.6, Math.min(3.2, h)));
    // Facing the goal: a diving header; ball coming from in front of the goal line: an overhead kick.
    const toGoal = Math.sign(goal.x - p.p.x) || 1;
    p.volley = Math.sign(b.v.x) === toGoal && h > 1.2 ? 'bicycle' : 'header';
    p.volleyT = 0.9;
    this.emit('leap', p.team, p.id, { kind: p.volley });
  }

  /** Mid-air first-time strike at goal. */
  private volley(p: Player): void {
    const kind = p.volley!;
    p.volley = null;
    p.volleyT = 0;
    this.give(p);
    const goal = this.attackGoal(p.team);
    const z = sideOf(this.rng.range(-1, 1), p.team) * this.rng.range(0.6, FIELD.goalHalfW - 0.6);
    this.release(p, { kind: 'shot', target: { x: goal.x, z }, speed: this.shotSpeed(p) * (kind === 'bicycle' ? 1.12 : 1.02), loft: 0, spin: 0, shot: 'volley', to: -1, fx: kind, label: kind, power: kind === 'bicycle' });
    p.kickCd = 0.5;
  }

  // ---------------------------------------------------------------- restarts

  resetKickoff(): void {
    const b = this.ball;
    b.p = { x: 0, y: FIELD.ballR, z: 0 };
    b.v = { x: 0, y: 0, z: 0 };
    b.spin = 0;
    b.shot = null;
    b.flatT = 0;
    b.fx = null;
    b.homingTo = -1;
    b.passTo = -1;
    b.lastKicker = -1;
    b.prevKicker = -1;
    for (const p of this.players) {
      const d = dirOf(p.team);
      const f = FORMATION[p.idx];
      // The kick-off team's first player stands on the ball; the others stay out of the circle.
      const u = p.team === this.kickoffTeam && p.idx === 0 ? -0.6 : f.x - (p.team !== this.kickoffTeam && p.idx === 0 ? 2.5 : 0);
      p.p = { x: u * d, z: f.z * d };
      p.v = { x: 0, z: 0 };
      p.y = 0;
      p.vy = 0;
      p.face = { x: d, z: 0 };
      p.state = 'play';
      p.stateT = 0;
      p.pending = null;
      p.target = { ...p.p };
      p.boostT = p.wallT = p.ghostT = 0;
    }
    const taker = this.players[this.kickoffTeam * TEAM_SIZE];
    this.give(taker);
    b.lastKicker = taker.id;
    // Rivalry weather stays; everything else is cleared.
    this.zones = this.zones.filter((z) => z.team === 2);
    this.chaosT = 0;
    for (const ts of this.teams ?? []) {
      ts.cChain = 0;
      ts.cQueue = [];
      ts.wildNext = 0;
    }
    this.brawl = null;
    this.timers = [];
  }
}
