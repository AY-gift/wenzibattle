/**
 * Culture combo engine (文化连携). A team whose four players spell one of the ~245 registered
 * culture / idiom teams (shared/src/sports/cultureData.ts) gets one team move: a trigger, 1–3
 * primitives and a backfire risk. Every primitive changes the simulation for real — passes and
 * shots are real kicks (they can be intercepted or saved), team effects change speed / tackling /
 * positions / accuracy for a few seconds, opponent effects stun, slow, confuse or shove. Nothing
 * here writes the score or creates a second ball. All randomness comes from the match RNG.
 * Matchups (CULTURE_MATCHUPS) add a duel rule when both teams are registered.
 */
import { cultureFor, matchupFor, type CulturePrim, type CultureTrigger } from '@shared/sports/culture';
import { FIELD, MATCH_TIME, type Player, type ShotKind, type TeamState, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const MAX_USES = 5;

/** Timed team effects (seconds left). */
export type CultureFx = 'sprint' | 'allOut' | 'retreat' | 'wallLine' | 'press' | 'calm' | 'grip' | 'tackleBoost' | 'accuracy' | 'chaosRun' | 'tired' | 'gap' | 'peace' | 'spotlight';

const DURATION: Partial<Record<CulturePrim, number>> = {
  sprint: 5, allOut: 6, retreat: 6, wallLine: 5, press: 4, calm: 7, grip: 6, tackleBoost: 6, accuracy: 7, chaosRun: 4, peace: 8, spotlight: 6,
};

const BALL_KICKS: CulturePrim[] = ['passChain', 'throughBall', 'lobPass', 'longShot', 'curveShot', 'skyShot', 'fakeShot', 'boardPass', 'switchPlay'];

export function initCulture(m: Match): void {
  for (const team of [0, 1] as const) {
    const ts = m.teams[team];
    // The 12 original idiom combos keep priority; everything else may be a culture team.
    ts.culture = ts.combo ? null : cultureFor(ts.input);
    if (ts.culture) ts.cultureCd = 9 + m.rng.range(0, 5);
  }
  const mu = matchupFor(m.teams[0].input, m.teams[1].input);
  if (mu && (m.teams[0].culture || m.teams[0].combo) && (m.teams[1].culture || m.teams[1].combo)) {
    m.rivalry = mu;
    if (mu.effect === 'chaos') for (const ts of m.teams) ts.cultureCd = Math.min(ts.cultureCd, 4);
    if (mu.effect === 'spotlight') for (const ts of m.teams) ts.fx.spotlight = 15;
    if (mu.effect === 'weather') {
      // Slippery patches in both halves that slow everybody.
      const s = dirOf(0);
      m.zones.push({ team: 2, x: -9 * s, z: m.rng.range(-5, 5) * s, r: 4, t: 45, kind: 'cloud' }, { team: 2, x: 9 * s, z: m.rng.range(-5, 5) * s, r: 4, t: 45, kind: 'cloud' });
    }
  }
}

/** Per step: effect timers, delayed chain passes. */
export function cultureStep(m: Match, team: 0 | 1, dt: number): void {
  const ts = m.teams[team];
  ts.cultureCd = Math.max(0, ts.cultureCd - dt);
  for (const k of Object.keys(ts.fx) as CultureFx[]) {
    const v = (ts.fx[k] ?? 0) - dt;
    if (v <= 0) {
      delete ts.fx[k];
      // Some backfires only bite once the effect is over.
      if (k === 'sprint' && ts.tiredAfter) {
        ts.fx.tired = 6;
        ts.tiredAfter = false;
      }
    } else ts.fx[k] = v;
  }
  ts.peaceT = Math.max(ts.peaceT - dt, ts.fx.peace ?? 0, ts.fx.calm ?? 0);
  const carrier = m.carrier();
  // Chained passes: when the intended receiver has it, pass on or finish.
  // Whoever of us collects the pass carries on the move (not only the intended receiver).
  if (ts.cChain > 0 && carrier && carrier.team === team && carrier.id !== ts.cChainTo && !carrier.pending && carrier.id !== m.ball.lastKicker) ts.cChainTo = carrier.id;
  if (ts.cChain > 0 && carrier && carrier.id === ts.cChainTo && carrier.state === 'play' && !carrier.pending) chainNext(m, team, carrier);
  else if (ts.cChain > 0 && carrier && (carrier.team !== team || (carrier.id !== ts.cChainTo && !carrier.pending))) ts.cChain = 0;
  // Queued ball actions: whoever of us has the ball next does the next one.
  if (!ts.cQueue.length) return;
  ts.cFollowLife -= dt;
  if (ts.cFollowLife <= 0 || (carrier && carrier.team !== team)) {
    ts.cQueue = [];
    return;
  }
  if (ts.cChain > 0) return;
  const next = ts.cQueue[0];
  if (next === 'extraKick') {
    if (extraKick(m, team)) ts.cQueue.shift();
    return;
  }
  if (!carrier || carrier.team !== team || carrier.state !== 'play' || carrier.pending) return;
  ts.cFollowT -= dt;
  if (ts.cFollowT > 0 && dist(carrier.p, m.attackGoal(team)) > 16) return;
  if (kickPrim(m, carrier, next)) {
    ts.cQueue.shift();
    ts.cFollowT = 0.25;
  } else if (next !== 'longShot' && next !== 'curveShot' && next !== 'skyShot') {
    // A pass nobody can receive is dropped (shots wait while the carrier dribbles closer).
    ts.cQueue.shift();
  }
}

function triggerOk(m: Match, team: 0 | 1, trig: CultureTrigger): boolean {
  const ts = m.teams[team];
  const carrier = m.carrier();
  const ours = carrier && carrier.team === team ? carrier : null;
  const theirs = carrier && carrier.team !== team ? carrier : null;
  const own = m.ownGoal(team), goal = m.attackGoal(team);
  const diff = m.score[team] - m.score[team === 0 ? 1 : 0];
  const late = m.clock > MATCH_TIME - 30 || m.goldenGoal;
  const freeToAct = ours && ours.state === 'play' && !ours.pending;
  switch (trig) {
    case 'attack':
      return !!freeToAct && ours!.p.x * dirOf(team) < 8;
    case 'midfield': {
      const d = ours ? dist(ours.p, goal) : 99;
      return !!freeToAct && d > 14 && d < 31;
    }
    case 'final3':
      return !!freeToAct && dist(ours!.p, goal) < 18;
    case 'flank':
      return !!freeToAct && Math.abs(ours!.p.z) > FIELD.halfW - 4.5;
    case 'pressed':
      return !!freeToAct && m.pressure(ours!) > 0.5;
    case 'defend':
      return !!theirs && theirs.p.x * dirOf(team) < 2;
    case 'danger':
      return !!theirs && dist(theirs.p, own) < 13;
    case 'loose':
      return m.ball.owner < 0 && !m.ball.shot && m.teamOf(team).some((p) => dist(p.p, { x: m.ball.p.x, z: m.ball.p.z }) < 5);
    case 'lostBall':
      return m.t - ts.lostBallT < 1.5;
    case 'kickoff':
      return m.t - ts.kickoffT < 4;
    case 'behind':
      return diff < 0;
    case 'lateBehind':
      return diff < 0 && late;
    case 'lateAhead':
      return diff > 0 && late;
    case 'late':
      return late;
    case 'afterConcede':
      return m.t - ts.lastConcedeT < 9;
    case 'afterShot':
      return m.t - ts.lastShotT < 1.6 && m.ball.owner < 0 && !m.ball.shot && dist({ x: m.ball.p.x, z: m.ball.p.z }, goal) < 12;
    case 'afterSave':
      return m.t - ts.lastSaveT < 2 && !!ours;
    case 'afterTackle':
      return m.t - ts.lastTackleT < 1.5 && !!ours;
    case 'any':
      return true;
  }
}

/** From the team AI (every 0.1 s): fire the culture combo when its trigger holds. `force` (tests, catalog demo) skips trigger and cooldown. */
export function tryCulture(m: Match, team: 0 | 1, force = false): boolean {
  const ts = m.teams[team];
  const c = ts.culture;
  if (!c) return false;
  if (!force) {
    if (ts.cultureCd > 0 || ts.cultureUses >= MAX_USES || ts.cChain > 0 || ts.cQueue.length) return false;
    if (!triggerOk(m, team, c.trigger)) return false;
    if (!m.rng.chance(c.trigger === 'any' ? 0.05 : 0.3)) return false;
  }
  // Ball actions need someone on the ball who can kick right now.
  const carrier = m.carrier();
  const ours = carrier && carrier.team === team && carrier.state === 'play' && !carrier.pending ? carrier : null;
  const needsBall = c.prims.some((p) => BALL_KICKS.includes(p) || p === 'dribbleBurst');
  if (needsBall && !ours && c.trigger !== 'afterShot') return false;
  const chaos = m.rivalry?.effect === 'chaos' && m.clock < 60;
  ts.cultureCd = (chaos ? 11 : 20) + m.rng.range(0, 6);
  ts.cultureUses++;
  m.emit('combo', team, ours?.id ?? -1, { kind: 'culture', label: c.key });
  // Matchup duel: the other side answers quickly.
  if (m.rivalry?.effect === 'counter') {
    const o = m.teams[team === 0 ? 1 : 0];
    o.cultureCd = Math.min(o.cultureCd, 3);
    o.comboCd = Math.min(o.comboCd, 3);
  }
  // Backfire, decided up front by the match RNG (shown when it happens).
  const backfire = c.risk !== 'none' && m.rng.chance(0.4);
  if (backfire && (c.risk === 'wild' || c.risk === 'ownRisk')) ts.wildNext = c.risk === 'ownRisk' ? 2 : 1;
  // Ball actions run one after another: the first now (or after a dribble burst), the rest
  // queued for whoever of us has the ball next. Everything else happens at once.
  // Passes first, shots last (a shot ends the move).
  const SHOTS: CulturePrim[] = ['longShot', 'curveShot', 'skyShot', 'extraKick'];
  const kicks = c.prims
    .filter((p) => BALL_KICKS.includes(p) || (p === 'extraKick' && c.prims.some((q) => BALL_KICKS.includes(q))))
    .sort((a, b) => Number(SHOTS.includes(a)) - Number(SHOTS.includes(b)));
  ts.cQueue = [];
  ts.cFollowT = 0;
  ts.cFollowLife = 8;
  for (const prim of c.prims) {
    if (kicks.includes(prim)) continue;
    if (prim === 'dribbleBurst' && ours) {
      ours.boostT = 2.2;
      ts.cFollowT = 1.6;
      prim_(m, team, ours.id, prim);
      continue;
    }
    teamPrim(m, team, prim);
  }
  if (kicks.length && ours) {
    ts.cQueue = kicks.slice();
    if (ts.cFollowT <= 0 && kickPrim(m, ours, kicks[0])) ts.cQueue.shift();
    ts.cFollowT = Math.max(ts.cFollowT, 0.25);
  }
  if (backfire) applyRisk(m, team, c.risk);
  return true;
}

function prim_(m: Match, team: 0 | 1, a: number, kind: CulturePrim, b?: number): void {
  m.emit('prim', team, a, { kind, b });
}

function forwardMost(m: Match, p: Player): Player | null {
  const dir = dirOf(p.team);
  return m.teamOf(p.team).filter((t) => t.id !== p.id && !m.isDisabled(t)).sort((a, b) => b.p.x * dir - a.p.x * dir)[0] ?? null;
}

/** Distance from point q to segment ab. */
function segDist(q: V2, a: V2, b: V2): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz || 1;
  const t = clamp(((q.x - a.x) * abx + (q.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(q.x - (a.x + abx * t), q.z - (a.z + abz * t));
}

/** Next man in a passing move: open, ahead if possible, with a clear lane (lofted balls ignore lanes), never straight back to `not`. */
function chainTarget(m: Match, p: Player, not: number, lofted = false): Player | null {
  const dir = dirOf(p.team);
  let best: Player | null = null, bestScore = -Infinity;
  for (const t of m.teamOf(p.team)) {
    if (t.id === p.id || t.id === not || m.isDisabled(t) || dist(t.p, p.p) < 3) continue;
    let lane = 9;
    if (!lofted) for (const o of m.opponents(p)) if (!m.isDisabled(o)) lane = Math.min(lane, segDist(o.p, p.p, t.p));
    const score = openness(m, t) + (t.p.x - p.p.x) * dir * 0.12 - (lane < 1.2 ? 4 : 0) - (t.role === 'keeper' ? 2 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best ?? forwardMost(m, p);
}

function shot(m: Match, p: Player, kind: ShotKind, speed: number, loft: number, spin: number, aimOutside = 0, power?: boolean): void {
  const goal = m.attackGoal(p.team);
  const keeper = m.opponents(p).find((o) => o.role === 'keeper');
  const side = -sideOf(keeper ? keeper.p.z : 0, p.team);
  m.kick(p, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.7 + aimOutside) }, speed, loft, spin: spin ? -side * dirOf(p.team) * spin : 0, shot: kind, to: -1, fx: 'culture', label: m.teams[p.team].culture?.key, power }, 0.22);
}

/** One ball action. Returns true if a kick was started. */
function kickPrim(m: Match, p: Player, prim: CulturePrim): boolean {
  const ts = m.teams[p.team];
  const goal = m.attackGoal(p.team);
  const dir = dirOf(p.team);
  const d = dist(p.p, goal);
  const mates = m.teamOf(p.team).filter((t) => t.id !== p.id && !m.isDisabled(t));
  switch (prim) {
    case 'passChain':
    case 'lobPass': {
      const next = chainTarget(m, p, -1, prim === 'lobPass');
      if (!next) return false;
      ts.cChain = prim === 'passChain' ? 3 : 1;
      // A chain ends with the recipe's next ball action (a lob ends in a first-time shot).
      ts.cFinish = prim === 'lobPass' ? 'longShot' : (ts.cQueue.length > 1 ? ts.cQueue.splice(1, 1)[0] : null);
      ts.cChainTo = next.id;
      const lead = { x: clamp(next.p.x + dir * 2.5, -FIELD.halfL + 3, FIELD.halfL - 3), z: next.p.z };
      m.kick(p, { kind: 'pass', target: lead, speed: prim === 'lobPass' ? 17 : 15, loft: prim === 'lobPass' ? 1 : 0.35, spin: 0, shot: 'normal', to: next.id }, 0.1);
      break;
    }
    case 'throughBall': {
      const next = forwardMost(m, p);
      if (!next) return false;
      // Into space ahead of the forward, but not into the boards.
      const lead = { x: clamp(next.p.x + dir * 4.5, -FIELD.halfL + 4, FIELD.halfL - 4), z: clamp(next.p.z * 0.8, -FIELD.halfW + 2, FIELD.halfW - 2) };
      m.kick(p, { kind: 'pass', target: lead, speed: clamp(10 + dist(p.p, lead) * 0.55, 12, 19), loft: 0, spin: 0, shot: 'normal', to: next.id }, 0.1);
      next.boostT = 1.8;
      next.target = lead;
      break;
    }
    case 'longShot':
      if (d > 33) return false;
      shot(m, p, 'combo', 31, 0, 0, 0, true);
      break;
    case 'curveShot':
      if (d > 22) return false;
      shot(m, p, 'combo', m.shotSpeed(p) + 4, 0.05, 15, 2.4, false);
      break;
    case 'skyShot':
      if (d > 28) return false;
      shot(m, p, 'skyShot', 24, 0.75, 0, -0.5, true);
      break;
    case 'fakeShot': {
      // The keeper and nearby defenders buy the dummy…
      const keeper = m.opponents(p).find((o) => o.role === 'keeper' && m.canAct(o));
      if (keeper) {
        keeper.state = 'dive';
        keeper.stateT = 0.55;
        keeper.v = { x: 0, z: sideOf(keeper.p.z, p.team) * 6 };
      }
      for (const o of m.opponents(p)) if (o !== keeper && dist(o.p, p.p) < 4.5) m.disable(o, 'confuse', 0.7, p);
      // …then the real ball goes to the most open teammate (or curls in).
      const open = mates.sort((a, b) => openness(m, b) - openness(m, a))[0];
      if (open) m.kick(p, { kind: 'pass', target: { x: open.p.x + dir * 1.5, z: open.p.z }, speed: 16, loft: 0, spin: 0, shot: 'normal', to: open.id }, 0.35);
      else shot(m, p, 'combo', m.shotSpeed(p) + 3, 0.05, 12, 2);
      break;
    }
    case 'boardPass': {
      const t = mates.sort((a, b) => b.p.x * dir - a.p.x * dir)[0];
      if (!t) return false;
      // Aim at the receiver's image behind the nearer side board, stretched for the board's 0.75
      // bounce: the real rebound delivers the ball. The receiver waits for it.
      const s = sideOf(p.p.z + t.p.z, p.team);
      const wall = s * (FIELD.halfW - FIELD.ballR);
      const target = { x: t.p.x, z: wall + (wall - t.p.z) / 0.75 };
      m.kick(p, { kind: 'pass', target, speed: 20, loft: 0, spin: 0, shot: 'normal', to: t.id, hold: true }, 0.12);
      break;
    }
    case 'switchPlay': {
      // Across the pitch to whoever is furthest away sideways (preferably not behind us).
      const wide = (xs: Player[]) => xs.sort((a, b) => Math.abs(b.p.z - p.p.z) - Math.abs(a.p.z - p.p.z))[0];
      const t = wide(mates.filter((x) => (x.p.x - p.p.x) * dir > -4)) ?? wide(mates.filter((x) => x.role !== 'keeper')) ?? wide(mates);
      if (!t) return false;
      m.kick(p, { kind: 'pass', target: { x: t.p.x + dir * 2, z: t.p.z }, speed: 19, loft: 0.45, spin: 0, shot: 'normal', to: t.id }, 0.12);
      break;
    }
    default:
      return false;
  }
  prim_(m, p.team, p.id, prim);
  return true;
}

function openness(m: Match, t: Player): number {
  let best = 9;
  for (const o of m.opponents(t)) best = Math.min(best, dist(o.p, t.p));
  return best + (t.p.x * dirOf(t.team)) * 0.15;
}

function chainNext(m: Match, team: 0 | 1, p: Player): void {
  const ts = m.teams[team];
  const goal = m.attackGoal(team);
  ts.cChain--;
  if (ts.cChain <= 0 || dist(p.p, goal) < 11) {
    ts.cChain = 0;
    ts.cChainTo = -1;
    const fin = ts.cFinish;
    ts.cFinish = null;
    // A pass-type finish (switch, through ball, lob…) is played by this receiver; shots go at goal.
    if (fin && fin !== 'longShot' && fin !== 'curveShot' && fin !== 'skyShot' && kickPrim(m, p, fin)) return;
    if (fin === 'curveShot') shot(m, p, 'combo', m.shotSpeed(p) + 4, 0.05, 15, 2.4, false);
    else if (fin === 'skyShot') shot(m, p, 'skyShot', 24, 0.75, 0, -0.5, true);
    else shot(m, p, 'combo', m.shotSpeed(p) + (fin === 'longShot' ? 8 : 4), 0, 0, 0, fin === 'longShot');
    prim_(m, team, p.id, fin ?? 'passChain');
    return;
  }
  const next = chainTarget(m, p, m.ball.lastKicker);
  if (!next) {
    ts.cChain = 0;
    return;
  }
  ts.cChainTo = next.id;
  const dir = dirOf(team);
  m.kick(p, { kind: 'pass', target: { x: clamp(next.p.x + dir * 2.5, -FIELD.halfL + 3, FIELD.halfL - 3), z: next.p.z }, speed: 15, loft: 0.35, spin: 0, shot: 'normal', to: next.id }, 0.06);
}

/** Team / opponent primitives (no kick). */
function teamPrim(m: Match, team: 0 | 1, prim: CulturePrim): void {
  const ts = m.teams[team];
  const mates = m.teamOf(team);
  const opps = m.teamOf(team === 0 ? 1 : 0);
  const carrier = m.carrier();
  const ballPos = { x: m.ball.p.x, z: m.ball.p.z };
  const nearestMate = mates.filter((p) => !m.isDisabled(p)).sort((a, b) => dist(a.p, ballPos) - dist(b.p, ballPos))[0];
  const by = nearestMate ?? mates[0];
  const dur = DURATION[prim];
  if (dur) ts.fx[prim as CultureFx] = Math.max(ts.fx[prim as CultureFx] ?? 0, dur);
  switch (prim) {
    case 'keeperBoost': {
      const own = m.ownGoal(team);
      const k = mates.filter((p) => !m.isDisabled(p)).sort((a, b) => dist(a.p, own) - dist(b.p, own))[0];
      if (k) {
        k.wallT = 4;
        prim_(m, team, k.id, prim);
      }
      return;
    }
    case 'recover': {
      let n = 0;
      for (const p of mates) {
        if (p.state === 'down' || m.isDisabled(p)) {
          p.stateT = Math.min(p.stateT, 0.05);
          n++;
        }
        p.rallyT = Math.max(p.rallyT, 3);
      }
      prim_(m, team, by.id, prim, n);
      return;
    }
    case 'heavyScreen': {
      const heavy = mates.filter((p) => !m.isDisabled(p) && p.id !== carrier?.id).sort((a, b) => b.attr.mass - a.attr.mass)[0];
      const ref = carrier ?? by;
      const victim = opps.filter((o) => !m.isDisabled(o)).sort((a, b) => dist(a.p, ref.p) - dist(b.p, ref.p))[0];
      if (heavy && victim) {
        victim.slowT = Math.max(victim.slowT, 2.5);
        heavy.target = { ...victim.p };
        heavy.boostT = Math.max(heavy.boostT, 1);
        prim_(m, team, heavy.id, prim, victim.id);
      }
      return;
    }
    case 'swapPositions': {
      const pool = mates.filter((p) => !m.isDisabled(p) && p.id !== carrier?.id);
      if (pool.length >= 2) {
        const [a, b] = [pool[m.rng.int(0, pool.length - 1)], pool[0]];
        const other = a === b ? pool[1] : b;
        const tmp = { ...a.p };
        a.p = { ...other.p };
        other.p = tmp;
        a.ghostT = other.ghostT = 0.5;
        // Whoever was marking them is now looking at the wrong glyph.
        for (const o of opps) if (dist(o.p, a.p) < 3 || dist(o.p, other.p) < 3) m.disable(o, 'confuse', 0.6, a);
        prim_(m, team, a.id, prim, other.id);
      }
      return;
    }
    case 'markWrong':
    case 'spotlight': {
      const ref = carrier && carrier.team === team ? carrier.p : ballPos;
      const victims = opps.filter((o) => !m.isDisabled(o) && o.role !== 'keeper').sort((a, b) => dist(a.p, ref) - dist(b.p, ref)).slice(0, prim === 'markWrong' ? 2 : 1);
      let hit = 0;
      for (const o of victims) if (m.disable(o, 'confuse', prim === 'markWrong' ? 1.1 : 0.8, by)) hit++;
      // The spotlight itself (opponents crowd our star) is a timed effect and always on.
      if (hit || prim === 'spotlight') prim_(m, team, by.id, prim, victims[0]?.id);
      return;
    }
    case 'slowZone': {
      const at = carrier && carrier.team !== team ? carrier.p : ballPos;
      m.zones.push({ team, x: at.x, z: at.z, r: 3.2, t: 4.5, kind: 'cloud' });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'pushWave': {
      // A shove that rolls outward: everyone close, or at least the nearest one within 7 m.
      let n = 0;
      for (const o of opps) if (dist(o.p, by.p) < 4.2 && m.knockDown(o, by, 0.8, 6)) n++;
      if (!n) {
        const o = opps.filter((x) => !m.isDisabled(x)).sort((a, b) => dist(a.p, by.p) - dist(b.p, by.p))[0];
        if (o && dist(o.p, by.p) < 7 && m.knockDown(o, by, 0.8, 6)) n++;
      }
      if (n) prim_(m, team, by.id, prim, n);
      return;
    }
    case 'stunCarrier': {
      // Their carrier, or whoever of them is closest to the ball (the culture move works at range).
      const t = carrier && carrier.team !== team ? carrier : opps.filter((o) => !m.isDisabled(o)).sort((a, b) => dist(a.p, ballPos) - dist(b.p, ballPos))[0];
      if (t && m.disable(t, 'freeze', 1.2, by)) prim_(m, team, by.id, prim, t.id);
      return;
    }
    case 'scrambleOpp': {
      const spots = opps.map((o) => ({ ...o.p }));
      for (let i = spots.length - 1; i > 0; i--) {
        const j = m.rng.int(0, i);
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      opps.forEach((o, i) => {
        o.p = { ...spots[i] };
        o.v = { x: 0, z: 0 };
        o.ghostT = 0.4;
      });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'obstacle': {
      // A box slides onto the pitch just ahead of the ball and stays a few seconds.
      const v = m.ball.v;
      const sp = Math.hypot(v.x, v.z);
      const ahead = sp > 1 ? { x: ballPos.x + (v.x / sp) * 3, z: ballPos.z + (v.z / sp) * 3 } : { x: ballPos.x + dirOf(team) * -3, z: ballPos.z };
      m.zones.push({ team, x: clamp(ahead.x, -FIELD.halfL + 2, FIELD.halfL - 2), z: clamp(ahead.z, -FIELD.halfW + 1, FIELD.halfW - 1), r: 0.75, t: 6, kind: 'box' });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'lucky':
      ts.luckCharges = Math.min(2, ts.luckCharges + 1);
      prim_(m, team, by.id, prim);
      return;
    case 'extraKick': {
      // A second kick at goal: the loose ball is hit first time, or our carrier volleys it. Right
      // after one of our own kicks (pass still in the air) it waits for the ball once.
      if (!extraKick(m, team)) m.later(0.9, () => extraKick(m, team));
      return;
    }
    case 'celebrateBait': {
      // Everyone stops for a snack / selfie / cake… then comes back fired up.
      for (const p of mates) if (p.id !== carrier?.id && !m.isDisabled(p)) m.setState(p, 'celebrate', 1.2);
      m.later(1.3, () => {
        ts.fx.sprint = Math.max(ts.fx.sprint ?? 0, 5);
        for (const p of mates) if (p.state === 'celebrate') p.state = 'play';
      });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'playDead': {
      for (const p of mates) if (p.id !== carrier?.id && !m.isDisabled(p)) m.setState(p, 'down', 1.0);
      for (const o of opps) if (mates.some((p) => dist(p.p, o.p) < 3.5)) m.disable(o, 'confuse', 1.2, by);
      m.later(1.0, () => (ts.fx.tackleBoost = Math.max(ts.fx.tackleBoost ?? 0, 4)));
      prim_(m, team, by.id, prim);
      return;
    }
    case 'peace': {
      for (const t of m.teams) {
        t.fx.peace = Math.max(t.fx.peace ?? 0, 8);
        t.peaceT = Math.max(t.peaceT, 8);
      }
      prim_(m, team, by.id, prim);
      return;
    }
    default:
      // Timed team effects (sprint, allOut, retreat, wallLine, press, calm, grip, tackleBoost, accuracy, chaosRun).
      prim_(m, team, by.id, prim);
  }
}

function extraKick(m: Match, team: 0 | 1): boolean {
  const ts = m.teams[team];
  const b = m.ball;
  const ballPos = { x: b.p.x, z: b.p.z };
  const goal = m.attackGoal(team);
  const carrier = m.carrier();
  if (carrier && carrier.team === team) {
    if (carrier.state !== 'play' || carrier.pending || dist(carrier.p, goal) > 30) return false;
    shot(m, carrier, 'bonus', m.shotSpeed(carrier) + 3, 0.1, 0);
    m.emit('bonusKick', team, carrier.id);
    prim_(m, team, carrier.id, 'extraKick');
    return true;
  }
  if (b.owner >= 0) return false;
  const kicker = m.teamOf(team).filter((p) => !m.isDisabled(p) && dist(p.p, ballPos) < 5).sort((a, c) => dist(a.p, ballPos) - dist(c.p, ballPos))[0];
  if (!kicker) return false;
  const tz = m.rng.range(-FIELD.goalHalfW + 0.6, FIELD.goalHalfW - 0.6) * (ts.wildNext ? 3 : 1) * dirOf(team);
  const dx = goal.x - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1;
  b.v.x = (dx / d) * 21;
  b.v.z = (dz / d) * 21;
  b.v.y = 2.5;
  b.prevKicker = b.lastKicker;
  b.prevKickT = m.t;
  b.lastKicker = kicker.id;
  b.noPickBy = kicker.id;
  b.noPickT = 0.3;
  b.shot = { by: kicker.id, kind: 'bonus', t: m.t, power: false, label: ts.culture?.key };
  kicker.stats.shots++;
  ts.wildNext = 0;
  m.emit('bonusKick', team, kicker.id);
  prim_(m, team, kicker.id, 'extraKick');
  return true;
}

/** Backfires. Each one is announced (event 'prim' kind 'risk:…') only when it really happens. */
function applyRisk(m: Match, team: 0 | 1, risk: string): void {
  const ts = m.teams[team];
  const shown = (a = -1) => m.emit('prim', team, a, { kind: `risk:${risk}` });
  // Who can still be hit when the timer runs out (not the carrier, not someone immune right now).
  const able = () => m.teamOf(team).filter((p) => !m.isDisabled(p) && m.ball.owner !== p.id && p.boostT <= 0 && p.state !== 'skill');
  switch (risk) {
    case 'trip':
      m.later(0.6, () => {
        const pool = able();
        const p = pool.length ? pool[m.rng.int(0, pool.length - 1)] : null;
        if (p && m.knockDown(p, null, 0.8, 0)) shown(p.id);
      });
      break;
    case 'crash':
      m.later(0.8, () => {
        // The two of us closest together bump heads.
        const pool = able();
        let best: [typeof pool[0], typeof pool[0]] | null = null, bd = Infinity;
        for (const a of pool) for (const b of pool) if (a.id < b.id && dist(a.p, b.p) < bd) { bd = dist(a.p, b.p); best = [a, b]; }
        if (best && m.knockDown(best[0], best[1], 0.7, 2) && m.knockDown(best[1], best[0], 0.7, 2)) shown(best[0].id);
      });
      break;
    case 'boardCrash': {
      const dir = dirOf(team);
      const p = able().sort((x, y) => y.p.x * dir - x.p.x * dir)[0];
      if (p) {
        p.target = { x: p.p.x + dir * 6, z: sideOf(p.p.z, p.team) * FIELD.halfW };
        m.later(0.9, () => {
          if (m.knockDown(p, null, 1.0, 0)) shown(p.id);
        });
      }
      break;
    }
    case 'tired':
      ts.tiredAfter = true;
      if (!ts.fx.sprint) ts.fx.tired = 6;
      shown();
      break;
    case 'gap':
      ts.fx.gap = 6;
      shown();
      break;
    case 'celebrate': {
      let n = 0;
      for (const p of able().slice(0, 2)) {
        m.setState(p, 'celebrate', 1.5);
        if (p.state === 'celebrate') n++;
      }
      if (n) shown();
      break;
    }
    // 'wild' / 'ownRisk' bend the team's next kick (Match.release announces it).
  }
}

/** End of the team AI: timed culture effects take over where the team stands. */
export function cultureTargets(m: Match, team: 0 | 1): void {
  const ts = m.teams[team];
  const fx = ts.fx;
  if (!Object.keys(fx).length) return;
  const dir = dirOf(team);
  const carrier = m.carrier();
  const own = m.ownGoal(team);
  const ballPos = { x: m.ball.p.x, z: m.ball.p.z };
  const mates = m.teamOf(team).filter((p) => !m.isDisabled(p) && p.id !== m.ball.owner);
  mates.forEach((p, i) => {
    if (fx.allOut) {
      p.target = { x: dir * clamp(11 + (i % 2) * 3, -FIELD.halfL + 2, FIELD.halfL - 2), z: (i - 1.5) * 4.5 * dir };
      if (p.role === 'keeper') p.role = 'runner';
    } else if (fx.retreat) {
      p.target = { x: own.x + dir * (2 + i * 2.2), z: clamp(ballPos.z * 0.5 + (i - 1.5) * 2.2 * dir, -FIELD.halfW + 1, FIELD.halfW - 1) };
    } else if (fx.wallLine && i < 3) {
      // A line between ball and our goal.
      const k = 0.45;
      p.target = { x: own.x + (ballPos.x - own.x) * k, z: clamp(own.z + (ballPos.z - own.z) * k + (i - 1) * 1.6 * dir, -FIELD.halfW + 1, FIELD.halfW - 1) };
    } else if (fx.press && carrier && carrier.team !== team) {
      const a = (i / Math.max(1, mates.length)) * Math.PI * 2;
      p.target = { x: carrier.p.x + Math.cos(a) * 1.3 * dir, z: carrier.p.z + Math.sin(a) * 1.3 * dir };
      if (dist(p.p, carrier.p) < p.attr.radius + carrier.attr.radius + 0.6 && p.tackleCd <= 0 && m.rng.chance(0.4)) m.tackle(p, carrier);
    } else if (fx.chaosRun) {
      const a = Math.sin(m.t * 1.7 + p.id * 2.1) * Math.PI;
      p.target = { x: clamp(p.p.x + Math.cos(a) * 4 * dir, -FIELD.halfL + 1, FIELD.halfL - 1), z: clamp(p.p.z + Math.sin(a) * 4 * dir, -FIELD.halfW + 1, FIELD.halfW - 1) };
    }
    if (fx.gap && p.role === 'keeper') {
      p.role = 'runner';
      p.target = { x: clamp(ballPos.x + dir * 3, -FIELD.halfL + 2, FIELD.halfL - 2), z: p.target.z };
    }
  });
}

/** Opponents of a spotlight team crowd its best attacker (used by the other team's AI). */
export function spotlightStar(m: Match, team: 0 | 1): Player | null {
  if (!m.teams[team].fx.spotlight) return null;
  return m.teamOf(team).filter((p) => !m.isDisabled(p)).sort((a, b) => b.attr.power - a.attr.power)[0] ?? null;
}

export function teamFx(ts: TeamState, k: CultureFx): boolean {
  return (ts.fx[k] ?? 0) > 0;
}
