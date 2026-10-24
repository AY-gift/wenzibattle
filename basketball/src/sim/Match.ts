/**
 * Glyph Basketball 2v2 — the game simulation: ball physics (floor, walls, backboard, rim, net),
 * shots / dunks / passes that really fly, steals, blocks, rebounds, the shot clock, tip-off,
 * overtime. Decisions live in ai.ts, special moves in skills.ts, culture / idiom pairs in
 * culture.ts, arena-style fights in brawl.ts. Fixed 1/60 s steps with a seeded RNG: the same
 * lineup + seed always plays the same game. Points only ever come from the ball dropping
 * through a rim.
 */
import { Rng } from '@shared/core/rng';
import type { FighterSpec } from '@shared/core/StatGenerator';
import { sportAttributes, sportSkillFor, type DisableKind } from '@shared/sports/skills';
import type { TeamInput } from '@shared/sports/team';
import { steer, think } from './ai';
import { brawlStep, holdGrudge, maybeStartBrawl } from './brawl';
import { cultureStep, initCulture } from './culture';
import {
  COURT, DT, EPILOGUE_TIME, GAME_TIME, INTRO_TIME, OVERTIME, SCORE_PAUSE, SHOT_CLOCK, TEAM_SIZE,
  type Action, type Ball, type EventType, type MatchEvent, type MatchResult, type Player, type PlayerState, type Rivalry, type ScoreRecord, type TeamState, type V2,
} from './types';

export type Phase = 'intro' | 'play' | 'score' | 'over' | 'done';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
let FLIP = 1;
/** Test hook: rotate the whole court (team 0 attacks −x). */
export const setFlip = (v: 1 | -1) => (FLIP = v);
export const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1) * FLIP;
/** Which side (±1) z is on; exactly 0 breaks the tie towards the team's own left (mirror-symmetric). */
export const sideOf = (z: number, team: 0 | 1) => (z > 0 ? 1 : z < 0 ? -1 : dirOf(team));
const DISABLED: PlayerState[] = ['down', 'freeze', 'sleep', 'confuse', 'laugh', 'money', 'charm', 'celebrate'];
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

export class Match {
  readonly rng: Rng;
  readonly players: Player[] = [];
  readonly teams: [TeamState, TeamState];
  readonly ball: Ball;
  readonly events: MatchEvent[] = [];
  fresh: MatchEvent[] = [];
  readonly score: [number, number] = [0, 0];
  readonly scores: ScoreRecord[] = [];
  phase: Phase = 'intro';
  /** Game clock (stops while the ball is dead after a basket). */
  clock = 0;
  t = -INTRO_TIME;
  steps = 0;
  overtime = false;
  /** Team with the ball (shot clock owner), −1 while it's loose off the rim. */
  possTeam: 0 | 1 | -1 = -1;
  /** Team that inbounds after the pause. */
  nextBall: 0 | 1 = 0;
  private pauseT = 0;
  /** The ball goes up (tip-off) when t reaches this. */
  private introUntil = 0;
  private epilogueT = 0;
  private prevBallY = 0;
  result: MatchResult | null = null;
  /** Slippery / sticky floor patches and props on court. team 2 = affects both. */
  zones: { team: 0 | 1 | 2; x: number; z: number; r: number; t: number; kind: 'slip' | 'cloud' | 'box' | 'rain' }[] = [];
  rivalry: Rivalry | null = null;
  brawl: { x: number; z: number; t: number } | null = null;
  brawlsLeft = 1;
  /** Ghost ball shown by decoy moves (visual only, the real ball is `ball`). */
  ghost: { x: number; z: number; t: number } | null = null;
  private timers: { at: number; run: () => void }[] = [];

  constructor(specs: [FighterSpec[], FighterSpec[]], inputs: [TeamInput, TeamInput], readonly seed: number) {
    this.rng = new Rng(seed);
    for (const team of [0, 1] as const) {
      specs[team].slice(0, TEAM_SIZE).forEach((spec, idx) => {
        this.players.push({
          id: team * TEAM_SIZE + idx, team, idx, spec,
          attr: sportAttributes(spec),
          skill: sportSkillFor(spec.signature),
          p: { x: 0, z: 0 }, v: { x: 0, z: 0 }, y: 0, vy: 0, face: { x: dirOf(team), z: 0 },
          state: 'play', stateT: 0, role: 'free', target: { x: 0, z: 0 }, mark: (1 - team) * TEAM_SIZE + idx,
          actCd: 0, stealCd: 0, jumpCd: 0, skillCd: 6 + this.rng.range(0, 6), skillUses: 0,
          boostT: 0, wallT: 0, ghostT: 0, rallyT: 0, slowT: 0, pending: null, dunkDrive: 0,
          fightCd: 8 + this.rng.range(0, 8), grudge: -1, grudgeT: 0,
          stats: { points: 0, twos: 0, threes: 0, dunks: 0, shots: 0, made: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, skills: 0, skillHits: 0, fights: 0 },
        });
      });
    }
    const ts = (i: 0 | 1): TeamState => ({
      input: inputs[i], culture: null, cultureCd: 0, cultureUses: 0, fx: {}, cQueue: [], cRun: null, cWaitBall: false, cFollowT: 0, cFollowLife: 0,
      luckCharges: 0, wildNext: 0, passWild: 0, tiredAfter: false, peaceT: 0, shotClock: SHOT_CLOCK,
      lastShotT: -99, lastMissT: -99, lastScoreT: -99, lastConcedeT: -99, lastStealT: -99, tipoffT: -99,
    });
    this.teams = [ts(0), ts(1)];
    this.ball = { p: { x: 0, y: 3, z: 0 }, v: { x: 0, y: 0, z: 0 }, owner: -1, curl: 0, shot: null, lastTouch: -1, passer: -1, passT: -99, passTo: -1, noPickBy: -1, noPickT: 0, homingTo: -1, rebound: false, fx: null, dribble: 0 };
    this.setupTipoff();
    initCulture(this);
  }

  // ---------------------------------------------------------------- helpers

  later(delay: number, fn: () => void): void {
    this.timers.push({ at: this.t + delay, run: fn });
  }

  emit(type: EventType, team: 0 | 1, a: number, extra: Partial<MatchEvent> = {}): MatchEvent {
    const p = a >= 0 ? this.players[a] : null;
    const e: MatchEvent = { t: this.t, type, team, a, x: p?.p.x ?? this.ball.p.x, z: p?.p.z ?? this.ball.p.z, ...extra };
    this.events.push(e);
    this.fresh.push(e);
    // Moments the culture triggers listen for.
    const other = team === 0 ? 1 : 0;
    if (type === 'score') {
      this.teams[team].lastScoreT = this.t;
      this.teams[other].lastConcedeT = this.t;
    } else if (type === 'miss') this.teams[team].lastMissT = this.t;
    else if (type === 'steal') this.teams[team].lastStealT = this.t;
    else if (type === 'tipoff') for (const ts of this.teams) ts.tipoffT = this.t;
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

  partnerOf(p: Player): Player {
    return this.players[p.team * TEAM_SIZE + (1 - p.idx)];
  }

  canAct(p: Player): boolean {
    return !DISABLED.includes(p.state) && p.state !== 'skill' && p.state !== 'dunk';
  }

  isDisabled(p: Player): boolean {
    return DISABLED.includes(p.state);
  }

  /** Rim centre this team shoots at (on the floor plane). */
  attackHoop(team: 0 | 1): V2 {
    return { x: dirOf(team) * COURT.hoopX, z: 0 };
  }

  ownHoop(team: 0 | 1): V2 {
    return { x: -dirOf(team) * COURT.hoopX, z: 0 };
  }

  carrier(): Player | null {
    return this.ball.owner >= 0 ? this.players[this.ball.owner] : null;
  }

  /** Points a shot from here would be worth. */
  pointsFrom(p: V2, team: 0 | 1): 2 | 3 {
    return dist(p, this.attackHoop(team)) > COURT.threeR ? 3 : 2;
  }

  setState(p: Player, s: PlayerState, dur: number): void {
    if (s !== 'play' && s !== 'shoot' && s !== 'pass' && s !== 'dunk' && s !== 'jump' && s !== 'reach' && s !== 'skill' && s !== 'celebrate') {
      if ((this.teams[p.team].fx.calm ?? 0) > 0) return;
      if (p.boostT > 0 && s === 'down') return;
    }
    p.state = s;
    p.stateT = dur;
    if (s !== 'shoot' && s !== 'pass' && s !== 'dunk') p.pending = null;
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
      holdGrudge(this, p, by);
    }
    p.vy = Math.max(p.vy, 3);
    this.emit('knockdown', p.team, p.id, { b: by?.id });
    maybeStartBrawl(this, p);
    return true;
  }

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

  looseBall(p: Player, speed: number): void {
    if (this.ball.owner !== p.id) return;
    const b = this.ball;
    b.owner = -1;
    const a = this.rng.range(0, Math.PI * 2), s = dirOf(p.team);
    b.v.x = Math.cos(a) * speed * s + p.v.x * 0.3;
    b.v.z = Math.sin(a) * speed * s + p.v.z * 0.3;
    b.v.y = 2;
    b.noPickBy = p.id;
    b.noPickT = 0.3;
    b.passTo = -1;
  }

  give(p: Player): void {
    const b = this.ball;
    const prevTeam = b.lastTouch >= 0 ? this.players[b.lastTouch].team : -1;
    b.owner = p.id;
    b.shot = null;
    b.curl = 0;
    b.homingTo = -1;
    b.fx = null;
    b.passTo = -1;
    b.v.x = b.v.y = b.v.z = 0;
    b.lastTouch = p.id;
    if (this.possTeam !== p.team) {
      this.teams[p.team].shotClock = SHOT_CLOCK;
      this.possTeam = p.team;
    }
    if (b.rebound) {
      b.rebound = false;
      p.stats.rebounds++;
      this.emit('rebound', p.team, p.id, { kind: prevTeam === p.team ? 'off' : 'def' });
    }
  }

  // ---------------------------------------------------------------- actions

  /** Wind up a pass / shot / dunk (a steal can still knock the ball away). */
  act(p: Player, a: Action, windup: number): void {
    if (this.ball.owner !== p.id || !this.canAct(p) || p.pending) return;
    p.pending = a;
    p.state = a.kind === 'pass' ? 'pass' : a.kind === 'dunk' ? 'dunk' : 'shoot';
    p.stateT = windup;
    p.actCd = 0.25;
    if (a.kind === 'dunk') {
      // Leap at the rim and arrive there, hands over the hoop, as the wind-up ends (long hang time
      // for flying dunks); the ball goes down through the rim on release.
      const hoop = this.attackHoop(p.team);
      const dx = hoop.x - dirOf(p.team) * 0.5 - p.p.x, dz = hoop.z - p.p.z;
      p.v.x = dx / windup;
      p.v.z = dz / windup;
      const g = this.gravityOf(p), arrive = COURT.rimH - 0.75 + (a.flying ? 0.4 : 0);
      p.vy = (arrive + 0.5 * g * windup * windup) / windup;
    } else if (a.kind === 'shot') p.vy = 4 + p.attr.jump * 1.8;
  }

  private release(p: Player, a: Action): void {
    const b = this.ball;
    if (b.owner !== p.id) return;
    const ts = this.teams[p.team];
    const dir = dirOf(p.team);
    b.owner = -1;
    b.passer = p.id;
    b.passT = this.t;
    b.lastTouch = p.id;
    b.noPickBy = p.id;
    b.noPickT = 0.3;
    b.fx = a.fx ?? null;
    b.curl = a.curl;
    if (a.kind === 'pass') {
      b.p.x = p.p.x + p.face.x * 0.45;
      b.p.z = p.p.z + p.face.z * 0.45;
      b.p.y = p.y + 1.1;
      const dx = a.target.x - b.p.x, dz = a.target.z - b.p.z, d = Math.hypot(dx, dz) || 1;
      let err = (1 - p.attr.accuracy) * 0.06 * a.care;
      if (ts.passWild) {
        err += 0.9;
        this.emit('prim', p.team, p.id, { kind: 'risk:miscomm' });
        ts.passWild = 0;
      }
      const ang = Math.atan2(dz, dx) + this.rng.range(-err, err);
      const hs = a.loft > 0.5 ? clamp(6 + d * 0.45, 7, 11) : clamp(9 + d * 0.35, 9, 15);
      b.v.x = Math.cos(ang) * hs;
      b.v.z = Math.sin(ang) * hs;
      const tFly = d / hs;
      // Lobs arrive high (alley-oop height), chest passes at chest height.
      const arriveY = a.loft > 0.5 ? COURT.rimH + 0.2 : 1.1;
      b.v.y = (arriveY - b.p.y) / tFly + 0.5 * COURT.gravity * tFly;
      b.passTo = a.to;
      this.emit('pass', p.team, p.id, { b: a.to, v: a.loft });
      return;
    }
    if (a.kind === 'dunk') {
      const hoop = this.attackHoop(p.team);
      // A dunk can still rattle out: off-centre slams hit the rim.
      const miss = this.rng.chance(clamp(0.16 - p.attr.power * 0.12 - (a.power ? 0.06 : 0), 0.02, 0.2));
      const off = miss ? COURT.rimR * 0.95 * (this.rng.chance(0.5) ? 1 : -1) : this.rng.range(-0.06, 0.06);
      b.p.x = hoop.x - dir * 0.08;
      b.p.z = hoop.z + off;
      b.p.y = COURT.rimH + 0.32;
      b.v.x = dir * 0.4;
      b.v.z = 0;
      b.v.y = -5.5;
      b.shot = { by: p.id, kind: 'dunk', t: this.t, points: 2, label: a.label, power: true, touchedRim: false };
      p.stats.shots++;
      ts.lastShotT = this.t;
      this.emit('dunk', p.team, p.id, { label: a.label, kind: a.flying ? 'super' : a.power ? 'power' : 'normal' });
      // Posterized: whoever jumped into an unblocked dunk goes down; big dunks shake everyone near the rim.
      const slam = a.flying || a.power ? 2.4 : 0;
      for (const o of this.opponents(p)) {
        const d = dist(o.p, p.p);
        if ((o.state === 'jump' && d < 1.8) || d < slam) if (this.knockDown(o, p, 0.9, 5)) p.stats.skillHits++;
      }
      return;
    }
    // Jump shot / layup / three: aim at the rim (or just above it on the glass), then add error.
    const hoop = this.attackHoop(p.team);
    b.p.x = p.p.x + p.face.x * 0.3;
    b.p.z = p.p.z + p.face.z * 0.3;
    b.p.y = p.y + 1.55;
    const tx = hoop.x, tz = hoop.z, ty = COURT.rimH + 0.05;
    const dx = tx - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1;
    const T = (0.55 + d * 0.075) * (1 + a.loft * 0.45);
    let err = ((1 - p.attr.accuracy) * 0.045 + 0.008 + d * 0.0044) * a.care * (1 + Math.max(0, a.loft) * 0.6);
    // Contest: the closest defender between shooter and rim, more if they are in the air.
    let contest = 0;
    for (const o of this.opponents(p)) {
      if (this.isDisabled(o)) continue;
      const od = dist(o.p, p.p);
      if (od > 2.2) continue;
      const front = ((o.p.x - p.p.x) * dx + (o.p.z - p.p.z) * dz) / (od * d || 1);
      contest = Math.max(contest, (1 - od / 2.2) * (front > 0 ? 1 : 0.4) * (o.y > 0.2 ? 1.4 : 1));
    }
    err *= 1 + contest * 1.3;
    if ((ts.fx.accuracy ?? 0) > 0) err *= 0.55;
    if (p.rallyT > 0) err *= 0.85;
    if (ts.wildNext) {
      err += 0.35;
      this.emit('prim', p.team, p.id, { kind: 'risk:wild' });
      ts.wildNext = 0;
    }
    // Ideal velocity: straight at the rim, or off the glass (solved for the board's 0.55 bounce).
    let vx = dx / T, vz = dz / T;
    if (a.bank) {
      const e = 0.55, back = COURT.boardX - COURT.ballR - COURT.hoopX;
      const lb = (COURT.boardX - COURT.ballR) - b.p.x * dir;
      const vxa = (lb + back / e) / T;
      const t1 = lb / vxa, t2 = back / (e * vxa);
      const yAtBoard = b.p.y + ((ty - b.p.y) / T + 0.5 * COURT.gravity * T) * t1 - 0.5 * COURT.gravity * t1 * t1;
      if (lb > 0.3 && yAtBoard > COURT.boardBottom + 0.1 && yAtBoard < COURT.boardTop - 0.1) {
        vx = vxa * dir;
        vz = (tz - b.p.z) / (t1 + 0.85 * t2);
      }
    }
    const ang = Math.atan2(vz, vx) + this.rng.range(-err, err) * 0.9;
    const scale = 1 + this.rng.range(-err, err) * 0.75;
    const hs = Math.hypot(vx, vz) * scale;
    b.v.x = Math.cos(ang) * hs;
    b.v.z = Math.sin(ang) * hs;
    b.v.y = ((ty - b.p.y) / T + 0.5 * COURT.gravity * T) * (1 + this.rng.range(-err, err) * 0.2);
    const points = this.pointsFrom(p.p, p.team);
    b.shot = { by: p.id, kind: a.shot === 'jump' && points === 3 ? 'three' : a.shot, t: this.t, points, label: a.label, power: !!a.power, touchedRim: false };
    p.stats.shots++;
    ts.lastShotT = this.t;
    this.emit('shot', p.team, p.id, { kind: b.shot.kind, label: a.label, v: points });
  }

  /** Reach in for the ball. */
  steal(p: Player, carrier: Player): void {
    if (p.stealCd > 0 || !this.canAct(p) || p.state !== 'play') return;
    p.stealCd = 1.3;
    p.state = 'reach';
    p.stateT = 0.28;
    const dx = carrier.p.x - p.p.x, dz = carrier.p.z - p.p.z, d = Math.hypot(dx, dz) || 1;
    p.v.x = (dx / d) * (p.attr.pace + 1.5);
    p.v.z = (dz / d) * (p.attr.pace + 1.5);
  }

  private resolveSteal(p: Player): void {
    const c = this.carrier();
    if (!c || c.team === p.team) return;
    if (dist(c.p, p.p) > p.attr.radius + c.attr.radius + 0.45) return;
    p.state = 'play';
    p.stateT = 0;
    const ts = this.teams[p.team], cs = this.teams[c.team];
    let chance = 0.24 + (p.attr.defense - c.attr.control) * 0.6;
    if (ts.fx.stealBoost) chance += 0.18;
    if (ts.fx.doubleTeam) chance += 0.08;
    if (c.pending) chance += 0.12; // ball exposed while shooting / passing
    if (cs.fx.calm) chance -= 0.12;
    if (c.boostT > 0) chance = 0.04;
    if (c.ghostT > 0) chance *= 0.5;
    chance = clamp(chance, 0.05, 0.75);
    if (this.rng.chance(chance)) {
      const b = this.ball;
      b.owner = -1;
      c.pending = null;
      if (c.state === 'shoot' || c.state === 'pass') c.state = 'play';
      b.v.x = (p.p.x - c.p.x) * 2 + this.rng.range(-1.5, 1.5) * dirOf(p.team);
      b.v.z = (p.p.z - c.p.z) * 2 + this.rng.range(-1.5, 1.5) * dirOf(p.team);
      b.v.y = 2.5;
      b.noPickBy = c.id;
      b.noPickT = 0.35;
      b.passTo = p.id;
      p.stats.steals++;
      this.emit('steal', p.team, p.id, { b: c.id });
      holdGrudge(this, c, p);
    } else {
      p.slowT = Math.max(p.slowT, 0.7);
      this.emit('stealFail', p.team, p.id, { b: c.id });
    }
  }

  /** Jump (block, rebound, tip-off). */
  jump(p: Player): void {
    if (p.jumpCd > 0 || !this.canAct(p) || p.y > 0.05) return;
    p.jumpCd = 1.1;
    p.state = 'jump';
    // Arcade: glyphs leap 2.5–5 m and hang in the air.
    p.vy = 6 + p.attr.jump * 3.2 + ((this.teams[p.team].fx.reboundBoost ?? 0) > 0 ? 1 : 0);
    p.stateT = (2 * p.vy) / this.gravityOf(p);
  }

  /** Gravity on a player (low-gravity team effect). */
  private gravityOf(p: Player): number {
    return COURT.playerGravity * ((this.teams[p.team].fx.lowGravity ?? 0) > 0 ? 0.55 : 1);
  }

  /** How high above its feet a player can touch the ball. */
  reachOf(p: Player): number {
    return 1.45 + p.attr.jump * 0.3 + (p.state === 'jump' ? 0.55 : 0) + (p.wallT > 0 ? 0.6 : 0) + ((this.teams[p.team].fx.paintWall ?? 0) > 0 ? 0.25 : 0);
  }

  maxSpeedOf(p: Player): number {
    let s = p.attr.pace * (p.boostT > 0 ? 1.5 : 1) * (p.rallyT > 0 ? 1.15 : 1) * (p.slowT > 0 ? 0.5 : 1);
    const ts = this.teams[p.team];
    if (ts.fx.sprint) s *= 1.22;
    if (ts.fx.tired) s *= 0.85;
    if (this.ball.owner === p.id) s *= 0.9 + p.attr.control * 0.1;
    for (const z of this.zones) if ((z.kind === 'cloud' || z.kind === 'slip') && z.team !== p.team && Math.hypot(p.p.x - z.x, p.p.z - z.z) < z.r) s *= z.kind === 'slip' ? 0.7 : 0.5;
    return s;
  }

  // ---------------------------------------------------------------- step

  step(): void {
    if (this.phase === 'done') return;
    this.steps++;
    const dt = DT;
    if (this.phase === 'intro' && this.t >= this.introUntil) {
      this.phase = 'play';
      this.tossBall();
      if (this.rivalry) this.emit('rivalry', this.rivalry.swapped ? 1 : 0, -1, { kind: this.rivalry.effect, label: this.rivalry.name });
    }
    if (this.phase === 'score') {
      this.pauseT -= dt;
      if (this.pauseT <= 0) {
        this.inbound(this.nextBall);
        this.phase = 'play';
      }
    }
    const playing = this.phase === 'play';
    if (playing) {
      this.clock += dt;
      if (this.steps % 6 === 0) for (const team of [0, 1] as const) think(this, team);
      for (const team of [0, 1] as const) cultureStep(this, team, dt);
      brawlStep(this, dt);
      if (this.timers.length) {
        const due = this.timers.filter((x) => x.at <= this.t);
        this.timers = this.timers.filter((x) => x.at > this.t);
        for (const x of due) x.run();
      }
      this.shotClockStep(dt);
    }
    for (const p of this.players) this.updatePlayer(p, dt, playing);
    this.collidePlayers();
    this.updateBall(dt, playing);
    for (const z of this.zones) z.t -= dt;
    this.zones = this.zones.filter((z) => z.t > 0);
    if (this.ghost && (this.ghost.t -= dt) <= 0) this.ghost = null;
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

  private shotClockStep(dt: number): void {
    const team = this.possTeam;
    if (team === -1) return;
    const ts = this.teams[team];
    // The clock runs while the team has the ball or its pass is in the air (not during a shot).
    if (this.ball.shot) return;
    ts.shotClock -= dt;
    if (ts.shotClock > 0) return;
    this.emit('shotClock', team, this.ball.owner);
    // Turnover: the nearest opponent gets the ball where it is.
    const c = this.carrier();
    if (c) c.pending = null;
    const at = { x: this.ball.p.x, z: this.ball.p.z };
    const taker = this.teamOf(team === 0 ? 1 : 0).filter((o) => !this.isDisabled(o)).sort((a, b) => dist(a.p, at) - dist(b.p, at))[0];
    if (c && (c.state === 'shoot' || c.state === 'pass')) c.state = 'play';
    if (taker) {
      this.ball.owner = -1;
      this.give(taker);
    } else ts.shotClock = SHOT_CLOCK;
  }

  private checkClock(): void {
    const limit = GAME_TIME + (this.overtime ? OVERTIME : 0);
    if (this.clock < limit) return;
    // A shot already in the air still counts (buzzer beater): wait for it.
    if (this.ball.shot && this.clock < limit + 3) return;
    this.emit('buzzer', 0, -1);
    if (this.score[0] === this.score[1] && !this.overtime) {
      this.overtime = true;
      this.emit('overtime', 0, -1);
      this.setupTipoff();
      this.phase = 'intro';
      this.introUntil = this.t + 1.2;
    } else this.finish();
  }

  private finish(): void {
    if (this.result) return;
    this.phase = 'over';
    const [a, b] = this.score;
    const winner = a === b ? null : a > b ? 0 : 1;
    for (const p of this.players) if (winner !== null && p.team === winner && this.canAct(p)) this.setState(p, 'celebrate', 99);
    this.emit('finish', winner ?? 0, -1, { v: winner === null ? -1 : winner });
    this.result = { seed: this.seed, score: [a, b], winner, overtime: this.overtime, time: this.clock, scores: this.scores, events: this.events, mvp: this.mvp(winner), teams: [this.teams[0].input, this.teams[1].input] };
  }

  /** Points, assists ×1.5, rebounds, steals and blocks; the winning side breaks ties. */
  mvp(winner: 0 | 1 | null): number {
    let best = 0, bestScore = -1;
    for (const p of this.players) {
      const s = p.stats;
      let sc = s.points + s.assists * 1.5 + s.rebounds * 0.8 + s.steals * 1.2 + s.blocks * 1.2 + s.skillHits * 0.4;
      if (winner !== null && p.team === winner) sc += 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = p.id;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- restarts

  private place(p: Player, x: number, z: number): void {
    p.p = { x, z };
    p.v = { x: 0, z: 0 };
    p.y = 0;
    p.vy = 0;
    p.state = 'play';
    p.stateT = 0;
    p.pending = null;
    p.dunkDrive = 0;
    p.target = { x, z };
    p.boostT = p.wallT = p.ghostT = 0;
    p.face = { x: dirOf(p.team), z: 0 };
  }

  /** Centre circle line-up for the tip-off. */
  private setupTipoff(): void {
    for (const p of this.players) {
      const d = dirOf(p.team);
      if (p.idx === 0) this.place(p, -d * 0.7, 0);
      else this.place(p, -d * 3.5, 2.5 * d);
    }
    const b = this.ball;
    b.owner = -1;
    b.shot = null;
    b.p = { x: 0, y: 1.6, z: 0 };
    b.v = { x: 0, y: 0, z: 0 };
    b.lastTouch = -1;
    b.passer = -1;
    b.passTo = -1;
    b.rebound = false;
    this.possTeam = -1;
    this.zones = this.zones.filter((z) => z.team === 2);
    this.timers = [];
  }

  /** The referee throws the ball up; the two centres jump for it. */
  private tossBall(): void {
    const b = this.ball;
    b.p = { x: 0, y: 1.6, z: 0 };
    b.v = { x: 0, y: 7.2, z: 0 };
    b.noPickT = 0.45;
    b.noPickBy = -2;
    const [c0, c1] = [this.players[0], this.players[TEAM_SIZE]];
    // Both centres leap as the ball comes down; who gets there first decides the tap.
    // (A little seeded jitter: identical centres must not always tie in team 0's favour.)
    this.later(0.62 - c0.attr.jump * 0.05 + this.rng.range(0, 0.08), () => this.jump(c0));
    this.later(0.62 - c1.attr.jump * 0.05 + this.rng.range(0, 0.08), () => this.jump(c1));
    this.emit('tipoff', 0, -1);
  }

  /** After a basket: the other team takes it out under its own hoop; the scorers get back. */
  private inbound(team: 0 | 1): void {
    const other = team === 0 ? 1 : 0;
    const d = dirOf(team);
    for (const p of this.teamOf(team)) this.place(p, -d * (COURT.hoopX - 0.6 - p.idx * 3.5), (p.idx ? -2.5 : 1.5) * d);
    // The scorers get back on defence in the half the inbounding team attacks.
    for (const p of this.teamOf(other)) this.place(p, d * (1.5 + p.idx * 3.5), (p.idx ? 2 : -1.5) * d);
    const taker = this.players[team * TEAM_SIZE];
    this.ball.owner = -1;
    this.ball.shot = null;
    this.ball.rebound = false;
    this.give(taker);
    this.teams[team].shotClock = SHOT_CLOCK;
    this.possTeam = team;
    this.zones = this.zones.filter((z) => z.team === 2);
    this.timers = [];
    for (const ts of this.teams) {
      ts.cQueue = [];
      ts.wildNext = ts.passWild = 0;
    }
  }

  // ---------------------------------------------------------------- players

  private updatePlayer(p: Player, dt: number, playing: boolean): void {
    p.actCd = Math.max(0, p.actCd - dt);
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.jumpCd = Math.max(0, p.jumpCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt * (p.rallyT > 0 ? 1.5 : 1));
    p.boostT = Math.max(0, p.boostT - dt);
    p.wallT = Math.max(0, p.wallT - dt);
    p.ghostT = Math.max(0, p.ghostT - dt);
    p.rallyT = Math.max(0, p.rallyT - dt);
    p.slowT = Math.max(0, p.slowT - dt);
    p.fightCd = Math.max(0, p.fightCd - dt);
    p.grudgeT = Math.max(0, p.grudgeT - dt);
    if (p.state === 'dunk') this.dunkContest(p);
    if (p.state !== 'play') {
      p.stateT -= dt;
      if (p.stateT <= 0) {
        if ((p.state === 'shoot' || p.state === 'pass' || p.state === 'dunk') && p.pending) {
          const a = p.pending;
          p.pending = null;
          p.state = 'play';
          this.release(p, a);
        } else if (p.state !== 'celebrate') p.state = 'play';
      }
    }
    if (p.state === 'reach') this.resolveSteal(p);
    if (p.pending && p.state !== 'shoot' && p.state !== 'pass' && p.state !== 'dunk') p.pending = null;
    // Vertical.
    if (p.y > 0 || p.vy > 0) {
      p.vy -= this.gravityOf(p) * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
    }
    // Horizontal.
    let maxSpeed = this.maxSpeedOf(p);
    if (!playing && this.phase !== 'score') maxSpeed = 0;
    let want = { x: 0, z: 0 };
    if (p.state === 'play' && playing) want = steer(this, p, maxSpeed);
    else if (p.state === 'confuse') {
      const a = Math.sin(this.t * 2.3 + p.id * 1.7) * Math.PI, s = dirOf(p.team);
      want = { x: Math.cos(a) * maxSpeed * 0.7 * s, z: Math.sin(a) * maxSpeed * 0.7 * s };
    } else if (p.state === 'celebrate') {
      const a = this.t * 3 + p.id, s = dirOf(p.team);
      want = { x: Math.cos(a) * 2 * s, z: Math.sin(a) * 2 * s };
    } else if (this.phase === 'score' && p.state === 'play') want = steer(this, p, maxSpeed * 0.6);
    const airborne = p.y > 0.05;
    if (p.state !== 'reach' && p.state !== 'dunk' && p.state !== 'skill' && !airborne) {
      const accel = p.attr.accel * (p.state === 'down' ? 0 : 1) * (p.attr.tags.includes('slippery') ? 0.6 : 1);
      let dvx = want.x - p.v.x, dvz = want.z - p.v.z;
      const dl = Math.hypot(dvx, dvz), maxDv = (accel + (p.state === 'down' ? 6 : 0)) * dt;
      if (dl > maxDv && dl > 0) {
        dvx *= maxDv / dl;
        dvz *= maxDv / dl;
      }
      p.v.x += dvx;
      p.v.z += dvz;
    } else if (p.state !== 'dunk' && !airborne) {
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
    // Shooters face the rim.
    if (p.state === 'shoot' || p.state === 'dunk') {
      const h = this.attackHoop(p.team), dx = h.x - p.p.x, dz = h.z - p.p.z, d = Math.hypot(dx, dz) || 1;
      p.face = { x: dx / d, z: dz / d };
    }
    const r = p.attr.radius;
    p.p.x = clamp(p.p.x, -COURT.halfL + r, COURT.halfL - r);
    p.p.z = clamp(p.p.z, -COURT.halfW + r, COURT.halfW - r);
    // The hoop's pole stands behind the backboard: nobody walks through it.
    for (const s of [-1, 1]) {
      const px = s * (COURT.boardX + 0.35);
      if (Math.abs(p.p.x - px) < r + 0.15 && Math.abs(p.p.z) < r + 0.15) p.p.x = px - s * (r + 0.15);
    }
    for (const z of this.zones) {
      if (z.kind !== 'box') continue;
      const dx = p.p.x - z.x, dz = p.p.z - z.z, d = Math.hypot(dx, dz), min = z.r + r;
      if (d < min && d > 1e-6) {
        p.p.x = z.x + (dx / d) * min;
        p.p.z = z.z + (dz / d) * min;
      }
    }
  }

  /** A defender in the air near the rim can stuff a dunk. */
  private dunkContest(p: Player): void {
    if (!p.pending || p.stateT > 0.22 || this.ball.owner !== p.id) return;
    const hoop = this.attackHoop(p.team);
    for (const o of this.opponents(p)) {
      if (o.state !== 'jump' || o.y < 0.35 || dist(o.p, hoop) > 1.9 || dist(o.p, p.p) > 1.6) continue;
      const ts = this.teams[o.team];
      let chance = 0.18 + o.attr.defense * 0.25 + o.attr.jump * 0.15 - p.attr.power * 0.15 + (ts.fx.blockBoost ? 0.15 : 0) + (o.wallT > 0 ? 0.15 : 0);
      if (p.pending.power) chance *= 0.5;
      if (!this.rng.chance(clamp(chance, 0.05, 0.6))) continue;
      p.pending = null;
      p.state = 'play';
      const b = this.ball;
      b.owner = -1;
      b.v.x = -dirOf(p.team) * 6;
      b.v.z = this.rng.range(-3, 3) * dirOf(o.team);
      b.v.y = 3;
      b.noPickBy = p.id;
      b.noPickT = 0.3;
      b.lastTouch = o.id;
      o.stats.blocks++;
      this.emit('block', o.team, o.id, { b: p.id, kind: 'dunk' });
      return;
    }
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
        // A screen: the screening player doesn't budge.
        const sa = this.teams[a.team].fx.screen && a.id !== this.ball.owner ? 0.2 : 1, sb = this.teams[b.team].fx.screen && b.id !== this.ball.owner ? 0.2 : 1;
        const wa = (b.attr.mass / (a.attr.mass + b.attr.mass)) * sa, wb = (1 - b.attr.mass / (a.attr.mass + b.attr.mass)) * sb;
        a.p.x -= nx * pen * wa;
        a.p.z -= nz * pen * wa;
        b.p.x += nx * pen * wb;
        b.p.z += nz * pen * wb;
        for (const q of [a, b]) {
          q.p.x = clamp(q.p.x, -COURT.halfL + q.attr.radius, COURT.halfL - q.attr.radius);
          q.p.z = clamp(q.p.z, -COURT.halfW + q.attr.radius, COURT.halfW - q.attr.radius);
        }
        if (a.team !== b.team && this.phase === 'play') {
          if (a.boostT > 0 && !this.isDisabled(b) && this.knockDown(b, a, 0.8, 5)) a.stats.skillHits++;
          if (b.boostT > 0 && !this.isDisabled(a) && this.knockDown(a, b, 0.8, 5)) b.stats.skillHits++;
          // Mid-air crash: the one carrying less momentum (mass × upward speed) is knocked out of the sky.
          if (a.y > 0.8 && b.y > 0.8 && Math.abs(a.y - b.y) < 1.2 && !this.isDisabled(a) && !this.isDisabled(b) && this.rng.chance(0.03)) {
            const ma = a.attr.mass * (2 + a.vy), mb = b.attr.mass * (2 + b.vy);
            const [loser, winner] = ma < mb ? [a, b] : [b, a];
            if (this.knockDown(loser, winner, 0.9, 4)) this.emit('airCrash', winner.team, winner.id, { b: loser.id });
          }
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
      const holding = p.state === 'shoot' || p.state === 'dunk' || p.state === 'pass' || p.y > 0.1;
      b.dribble += dt * (3 + Math.hypot(p.v.x, p.v.z) * 0.6);
      const reach = p.attr.radius + COURT.ballR + 0.1;
      b.p.x = p.p.x + p.face.x * reach;
      b.p.z = p.p.z + p.face.z * reach;
      b.p.y = holding ? p.y + 1.25 : COURT.ballR + Math.abs(Math.sin(b.dribble * Math.PI)) * 0.75;
      b.v.x = p.v.x;
      b.v.z = p.v.z;
      b.v.y = 0;
      this.prevBallY = b.p.y;
      return;
    }
    const g = COURT.gravity;
    if (b.homingTo >= 0) {
      const h = this.players[b.homingTo];
      const dx = h.p.x - b.p.x, dz = h.p.z - b.p.z, d = Math.hypot(dx, dz);
      if (d < 0.6 || this.isDisabled(h)) b.homingTo = -1;
      else {
        b.v.x += ((dx / d) * 13 - b.v.x) * Math.min(1, dt * 6);
        b.v.z += ((dz / d) * 13 - b.v.z) * Math.min(1, dt * 6);
        if (b.p.y < 1) b.v.y = Math.max(b.v.y, 1);
      }
    }
    b.v.y -= g * dt;
    if (b.curl) {
      const sp = Math.hypot(b.v.x, b.v.z) || 1;
      b.v.x += (-b.v.z / sp) * b.curl * dt;
      b.v.z += (b.v.x / sp) * b.curl * dt;
      b.curl *= Math.exp(-1.5 * dt);
    }
    this.prevBallY = b.p.y;
    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;
    b.p.z += b.v.z * dt;
    const R = COURT.ballR;
    if (b.p.y < R) {
      b.p.y = R;
      if (b.v.y < -1.5) {
        b.v.y = -b.v.y * 0.72;
        b.v.x *= 0.9;
        b.v.z *= 0.9;
        if (Math.abs(b.v.y) > 2.5) this.emit('bounce', 0, -1, { v: b.v.y });
      } else b.v.y = 0;
      // A shot that comes down to the floor is a miss (the next touch is a rebound).
      if (b.shot) this.missed();
    }
    if (b.p.y <= R + 0.01) {
      const sp = Math.hypot(b.v.x, b.v.z);
      if (sp > 0) {
        const ns = Math.max(0, sp - (1.2 + sp * 0.3) * dt);
        b.v.x *= ns / sp;
        b.v.z *= ns / sp;
      }
    }
    this.ballWalls();
    this.hoopPhysics();
    if (this.checkScore()) return;
    // A shot that dropped off the rim / board below rim height without going in is a miss.
    if (b.shot && b.shot.touchedRim && b.p.y < COURT.rimH - 0.6 && b.v.y < 0) this.missed();
    if (playing) this.ballContacts();
  }

  private missed(): void {
    const b = this.ball;
    if (!b.shot) return;
    const shooter = this.players[b.shot.by];
    // 幸运: once, a missing shot that touched the rim gets a kind bounce back towards the hoop.
    if (b.shot.touchedRim && this.luckyRoll(shooter)) return;
    this.emit('miss', shooter.team, shooter.id, { kind: b.shot.kind });
    b.shot = null;
    b.rebound = true;
    this.possTeam = -1;
  }

  private luckyRoll(shooter: Player): boolean {
    const ts = this.teams[shooter.team];
    if (ts.luckCharges <= 0) return false;
    ts.luckCharges--;
    const b = this.ball;
    const h = this.attackHoop(shooter.team);
    // Pop it back up over the rim; it still has to drop through.
    b.p.x = h.x - dirOf(shooter.team) * 0.05;
    b.p.z = h.z + this.rng.range(-0.08, 0.08);
    b.p.y = COURT.rimH + 0.45;
    b.v.x = 0;
    b.v.z = 0;
    b.v.y = 0.8;
    b.shot!.touchedRim = false;
    this.emit('luckyRoll', shooter.team, shooter.id);
    this.emit('prim', shooter.team, shooter.id, { kind: 'lucky', label: 'roll' });
    return true;
  }

  private ballWalls(): void {
    const b = this.ball, R = COURT.ballR;
    if (Math.abs(b.p.z) > COURT.halfW - R) {
      b.p.z = Math.sign(b.p.z) * (COURT.halfW - R);
      b.v.z = -b.v.z * 0.6;
      if (b.shot && !b.shot.touchedRim) this.missed();
    }
    if (Math.abs(b.p.x) > COURT.halfL - R) {
      b.p.x = Math.sign(b.p.x) * (COURT.halfL - R);
      b.v.x = -b.v.x * 0.6;
      if (b.shot && !b.shot.touchedRim) this.missed();
    }
    if (b.p.y > 9) {
      b.p.y = 9;
      b.v.y = -Math.abs(b.v.y) * 0.5;
    }
    // Crates on court.
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
  }

  /** Backboard, rim (a ring of radius rimR) and the pole. */
  private hoopPhysics(): void {
    const b = this.ball, R = COURT.ballR;
    for (const s of [-1, 1]) {
      // Backboard: a plane facing the court.
      const bx = s * COURT.boardX;
      if (Math.abs(b.p.z) < COURT.boardHalfW && b.p.y > COURT.boardBottom - R && b.p.y < COURT.boardTop + R && Math.abs(b.p.x - bx) < R && b.v.x * s > 0) {
        b.p.x = bx - s * R;
        b.v.x = -b.v.x * 0.55;
        b.v.z *= 0.85;
        if (b.shot) b.shot.touchedRim = true;
        this.emit('board', 0, b.shot?.by ?? -1);
      }
      // Rim: nearest point on the ring to the ball centre.
      const hx = s * COURT.hoopX, hy = COURT.rimH;
      const rx = b.p.x - hx, rz = b.p.z;
      const rl = Math.hypot(rx, rz) || 1e-6;
      const qx = hx + (rx / rl) * COURT.rimR, qz = (rz / rl) * COURT.rimR;
      const dx = b.p.x - qx, dy = b.p.y - hy, dz = b.p.z - qz;
      const d = Math.hypot(dx, dy, dz);
      const min = R + COURT.rimTube;
      if (d < min && d > 1e-6) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
        if (vn < 0) {
          b.v.x -= 1.55 * vn * nx;
          b.v.y -= 1.55 * vn * ny;
          b.v.z -= 1.55 * vn * nz;
          b.v.x *= 0.88;
          b.v.z *= 0.88;
          if (b.shot) b.shot.touchedRim = true;
          if (-vn > 1) this.emit('rim', 0, b.shot?.by ?? -1, { v: -vn });
        }
        b.p.x = qx + nx * min;
        b.p.y = hy + ny * min;
        b.p.z = qz + nz * min;
      }
    }
  }

  /** Points: the ball's centre passes down through the rim plane inside the ring. */
  private checkScore(): boolean {
    const b = this.ball;
    if (this.phase !== 'play') return false;
    if (!(this.prevBallY >= COURT.rimH && b.p.y < COURT.rimH && b.v.y < 0)) return false;
    for (const s of [-1, 1]) {
      const hx = s * COURT.hoopX;
      if (Math.hypot(b.p.x - hx, b.p.z) > COURT.rimR - COURT.ballR * 0.45) continue;
      // The team that attacks this hoop scores.
      const team: 0 | 1 = dirOf(0) === s ? 0 : 1;
      const shot = b.shot;
      const shooterId = shot ? shot.by : b.lastTouch;
      const shooter = shooterId >= 0 ? this.players[shooterId] : null;
      const points: 2 | 3 = shot && shooter?.team === team ? shot.points : 2;
      this.score[team] += points;
      let assist = -1;
      if (shooter && shooter.team === team) {
        shooter.stats.points += points;
        shooter.stats.made++;
        if (points === 3) shooter.stats.threes++;
        else shooter.stats.twos++;
        if (shot?.kind === 'dunk') shooter.stats.dunks++;
        if (shot && shot.kind !== 'jump' && shot.kind !== 'three' && shot.kind !== 'layup' && shot.kind !== 'tip') shooter.stats.skillHits++;
        const passer = this.ballPasserBefore(shooter);
        if (passer >= 0) {
          assist = passer;
          this.players[passer].stats.assists++;
        }
      }
      const rec: ScoreRecord = { t: this.clock, team, scorer: shooterId, assist, points, kind: shot?.kind ?? 'tip', label: shot?.label };
      this.scores.push(rec);
      this.emit('score', team, shooterId, { b: assist, v: points, kind: rec.kind, label: rec.label });
      // The ball drops through the net.
      b.shot = null;
      b.owner = -1;
      b.v.x *= 0.1;
      b.v.z *= 0.1;
      b.v.y = Math.min(b.v.y, -2);
      b.rebound = false;
      this.possTeam = -1;
      for (const p of this.players) {
        p.pending = null;
        if (p.state === 'shoot' || p.state === 'pass') p.state = 'play';
        p.dunkDrive = 0;
      }
      if (this.overtime && this.clock >= GAME_TIME + OVERTIME) {
        this.finish();
        return true;
      }
      this.nextBall = team === 0 ? 1 : 0;
      this.phase = 'score';
      this.pauseT = SCORE_PAUSE;
      return true;
    }
    return false;
  }

  /** The teammate who passed to the scorer within the last 6 s. */
  private ballPasserBefore(scorer: Player): number {
    const ev = this.events;
    for (let i = ev.length - 1; i >= 0 && this.t - ev[i].t < 6; i--) {
      const e = ev[i];
      if (e.type === 'pass' && e.b === scorer.id && e.team === scorer.team && e.a !== scorer.id) return e.a;
      if ((e.type === 'steal' || e.type === 'rebound' || e.type === 'tipoff') && e.a !== scorer.id) return -1;
    }
    return -1;
  }

  private ballContacts(): void {
    const b = this.ball, R = COURT.ballR;
    const speed = Math.hypot(b.v.x, b.v.z);
    // Over the rim nobody may touch a falling shot (no goaltending); a rising one can be blocked.
    if (b.shot) {
      const rising = b.v.y > 0 && this.t - b.shot.t < 0.55;
      if (!rising && (!b.shot.touchedRim || b.p.y > COURT.rimH - 0.3)) return;
      if (rising) {
        if (b.shot.kind === 'dunk' || b.shot.kind === 'highArc') return;
        for (const o of this.players) {
          if (o.team === this.players[b.shot.by].team || o.state !== 'jump') continue;
          const d = Math.hypot(o.p.x - b.p.x, o.p.z - b.p.z);
          if (d > o.attr.radius + R + 0.3 || b.p.y > o.y + this.reachOf(o) + 0.2 || b.p.y < o.y + 0.6) continue;
          const ts = this.teams[o.team];
          let chance = 0.35 + o.attr.defense * 0.3 + (ts.fx.blockBoost ? 0.2 : 0) + (o.wallT > 0 ? 0.2 : 0) - (b.shot.power ? 0.25 : 0) - (b.shot.kind === 'beam' ? 0.2 : 0);
          if (!this.rng.chance(clamp(chance, 0.05, 0.85))) continue;
          const shooter = this.players[b.shot.by];
          b.v.x = -b.v.x * 0.6 + this.rng.range(-2, 2) * dirOf(o.team);
          b.v.z = b.v.z * 0.4 + this.rng.range(-3, 3) * dirOf(o.team);
          b.v.y = -1;
          b.shot = null;
          b.rebound = true;
          b.lastTouch = o.id;
          b.noPickBy = o.id;
          b.noPickT = 0.25;
          o.stats.blocks++;
          this.possTeam = -1;
          this.emit('block', o.team, o.id, { b: shooter.id });
          return;
        }
        return;
      }
    }
    let best: Player | null = null, bestD = Infinity;
    for (const p of this.players) {
      if (!this.canAct(p) && p.state !== 'jump') continue;
      if (b.noPickT > 0 && (b.noPickBy === p.id || b.noPickBy === -2)) continue;
      if (b.homingTo >= 0 && b.homingTo !== p.id) continue;
      const d = Math.hypot(p.p.x - b.p.x, p.p.z - b.p.z);
      const reach = p.attr.radius + R + 0.25 + (p.wallT > 0 ? 0.3 : 0);
      if (d > reach || b.p.y > p.y + this.reachOf(p) || b.p.y < p.y - 0.2) continue;
      // Exact ties (mirror lineups) are decided by the seed, not by team order.
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && this.rng.chance(0.5))) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const p = best;
    // Tip-off: the first centre to reach it taps it to the partner.
    if (this.possTeam < 0 && this.ball.lastTouch < 0 && this.events.some((e) => e.type === 'tipoff' && this.t - e.t < 3)) {
      const mate = this.partnerOf(p);
      const dx = mate.p.x - b.p.x, dz = mate.p.z - b.p.z, d = Math.hypot(dx, dz) || 1;
      b.v.x = (dx / d) * 7;
      b.v.z = (dz / d) * 7;
      b.v.y = 2;
      b.lastTouch = p.id;
      b.passTo = mate.id;
      b.noPickBy = p.id;
      b.noPickT = 0.3;
      this.emit('tipoff', p.team, p.id, { b: mate.id, kind: 'won' });
      return;
    }
    // Hard passes can be fumbled.
    if (speed > 12 && this.rng.chance(clamp(((speed - 10) / 16) * (1 - p.attr.control), 0, 0.5))) {
      b.v.x = -b.v.x * 0.3 + this.rng.range(-2, 2) * dirOf(p.team);
      b.v.z = -b.v.z * 0.3 + this.rng.range(-2, 2) * dirOf(p.team);
      b.noPickBy = p.id;
      b.noPickT = 0.3;
      return;
    }
    const last = b.lastTouch >= 0 ? this.players[b.lastTouch] : null;
    if (last && last.team !== p.team && b.passTo >= 0 && this.players[b.passTo].team !== p.team) {
      p.stats.steals++;
      this.emit('intercept', p.team, p.id, { b: last.id });
      this.teams[p.team].lastStealT = this.t;
    }
    this.give(p);
  }
}
