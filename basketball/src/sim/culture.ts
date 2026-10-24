/**
 * Culture pairs (文化搭档) for basketball: a team whose two players spell one of the 91 registered
 * pairs (shared/src/sports/cultureData.ts — including the 13 idiom pairs of BASKETBALL_COMBOS)
 * gets one team move: a trigger, 1–3 primitives and a backfire. Every primitive is real: passes,
 * lobs, shots and dunks are real balls that can be stolen, blocked or missed; team effects change
 * speed, jumping, stealing and positions for a few seconds; opponent effects confuse, slow, stun or
 * shove. Nothing writes the score; there is one ball. All randomness comes from the match RNG.
 * Matchups (CULTURE_MATCHUPS, mode basketball) add a duel rule.
 */
import { basketCultureFor, matchupFor, type BasketPrim, type BasketTrigger } from '@shared/sports/culture';
import { COURT, GAME_TIME, type CultureFx, type Player, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';
import { dunkAction, makeChance, passAction, shotAction } from './ai';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const MAX_USES = 5;

/** Internal follow-up steps a move queues behind its primitives. */
export type Step = BasketPrim | '_toCutter' | '_finish';

const DURATION: Partial<Record<BasketPrim, number>> = {
  sprint: 5, doubleTeam: 4, paintWall: 5, blockBoost: 6, stealBoost: 6, reboundBoost: 6, lowGravity: 5, calm: 6, accuracy: 6, spotlight: 6, screen: 3,
};
const BALL: BasketPrim[] = ['alleyOop', 'giveAndGo', 'pickAndRoll', 'backdoorCut', 'crossover', 'pumpFake', 'highArc', 'bankShot', 'deepThree', 'powerDunk', 'curvePass', 'fastBreak', 'swapPass'];
const SHOTS: BasketPrim[] = ['highArc', 'bankShot', 'deepThree', 'powerDunk'];
const DEFENSIVE: BasketTrigger[] = ['defend', 'danger', 'rebound', 'afterMiss'];

export function initCulture(m: Match): void {
  for (const team of [0, 1] as const) {
    const ts = m.teams[team];
    ts.culture = basketCultureFor(ts.input);
    if (ts.culture) ts.cultureCd = 7 + m.rng.range(0, 5);
  }
  const mu = matchupFor(m.teams[0].input, m.teams[1].input, 'basketball');
  if (mu && m.teams[0].culture && m.teams[1].culture) {
    m.rivalry = mu;
    if (mu.effect === 'chaos') for (const ts of m.teams) ts.cultureCd = Math.min(ts.cultureCd, 3);
    if (mu.effect === 'spotlight') for (const ts of m.teams) ts.fx.spotlight = 12;
    if (mu.effect === 'weather') {
      const s = dirOf(0);
      m.zones.push({ team: 2, x: -6 * s, z: m.rng.range(-3, 3) * s, r: 2.6, t: 40, kind: 'slip' }, { team: 2, x: 6 * s, z: m.rng.range(-3, 3) * s, r: 2.6, t: 40, kind: 'slip' });
    }
  }
}

/** Per step: effect timers and queued ball actions. */
export function cultureStep(m: Match, team: 0 | 1, dt: number): void {
  const ts = m.teams[team];
  ts.cultureCd = Math.max(0, ts.cultureCd - dt);
  for (const k of Object.keys(ts.fx) as CultureFx[]) {
    const v = (ts.fx[k] ?? 0) - dt;
    if (v <= 0) {
      delete ts.fx[k];
      if (k === 'sprint' && ts.tiredAfter) {
        ts.fx.tired = 5;
        ts.tiredAfter = false;
      }
    } else ts.fx[k] = v;
  }
  ts.peaceT = Math.max(ts.peaceT - dt, ts.fx.calm ?? 0);
  if (!ts.cQueue.length) return;
  ts.cFollowLife -= dt;
  const carrier = m.carrier();
  if (carrier && carrier.team === team) ts.cWaitBall = false;
  if (ts.cFollowLife <= 0 || (carrier && carrier.team !== team && !ts.cWaitBall) || m.phase !== 'play') {
    ts.cQueue = [];
    ts.cRun = null;
    ts.cWaitBall = false;
    return;
  }
  const next = ts.cQueue[0] as Step;
  if (next === 'tipIn') {
    if (tipIn(m, team)) ts.cQueue.shift();
    return;
  }
  // An alley-oop can be finished in mid-air.
  const airOop = next === '_finish' && carrier?.state === 'jump' && dist(carrier.p, m.attackHoop(team)) < 2.6;
  if (!carrier || carrier.team !== team || (carrier.state !== 'play' && !airOop) || carrier.pending) return;
  ts.cFollowT -= dt;
  if (ts.cFollowT > 0) return;
  const ok = step(m, carrier, next);
  if (ok === 'wait') return;
  ts.cQueue.shift();
  ts.cFollowT = 0.2;
}

function triggerOk(m: Match, team: 0 | 1, trig: BasketTrigger): boolean {
  const ts = m.teams[team];
  const carrier = m.carrier();
  const ours = carrier && carrier.team === team ? carrier : null;
  const theirs = carrier && carrier.team !== team ? carrier : null;
  const goal = m.attackHoop(team), own = m.ownHoop(team);
  const diff = m.score[team] - m.score[team === 0 ? 1 : 0];
  const late = m.clock > GAME_TIME - 20 || m.overtime;
  const free = !!ours && ours.state === 'play' && !ours.pending;
  const bp = { x: m.ball.p.x, z: m.ball.p.z };
  switch (trig) {
    case 'attack':
      return free && ours!.p.x * dirOf(team) < 0;
    case 'frontcourt':
      return free && ours!.p.x * dirOf(team) > 0 && dist(ours!.p, goal) > 2.5;
    case 'paint':
      return free && dist(ours!.p, goal) < 3.2;
    case 'perimeter':
      return free && dist(ours!.p, goal) > COURT.threeR - 0.8 && dist(ours!.p, goal) < COURT.threeR + 2.5;
    case 'pressed': {
      if (!free) return false;
      let o = 9;
      for (const q of m.opponents(ours!)) if (!m.isDisabled(q)) o = Math.min(o, dist(q.p, ours!.p));
      return o < 1.3;
    }
    case 'defend':
      return !!theirs && theirs.p.x * dirOf(team) < 2;
    case 'danger':
      return !!theirs && dist(theirs.p, own) < 4;
    case 'rebound':
      return m.ball.owner < 0 && !m.ball.shot && m.ball.rebound && m.teamOf(team).some((p) => dist(p.p, bp) < 3);
    case 'afterMiss':
      return m.t - ts.lastMissT < 1.4 && m.ball.owner < 0;
    case 'afterScore':
      return m.t - ts.lastScoreT < 6 && free;
    case 'afterConcede':
      return m.t - ts.lastConcedeT < 7 && free;
    case 'afterSteal':
      return m.t - ts.lastStealT < 2.5 && free;
    case 'tipoff':
      return m.t - ts.tipoffT < 5 && free;
    case 'behind':
      return diff < 0 && free;
    case 'lateBehind':
      return diff < 0 && late && free;
    case 'lateAhead':
      return diff > 0 && late;
    case 'late':
      return late;
    case 'any':
      return true;
  }
}

/** From the team AI (every 0.1 s). `force` (tests) skips trigger and cooldown. */
export function tryCulture(m: Match, team: 0 | 1, force = false): boolean {
  const ts = m.teams[team];
  const c = ts.culture;
  if (!c) return false;
  if (!force) {
    if (ts.cultureCd > 0 || ts.cultureUses >= MAX_USES || ts.cQueue.length) return false;
    if (!triggerOk(m, team, c.trigger)) return false;
    if (!m.rng.chance(c.trigger === 'any' ? 0.04 : 0.3)) return false;
  }
  const carrier = m.carrier();
  const ours = carrier && carrier.team === team && carrier.state === 'play' && !carrier.pending ? carrier : null;
  const needsBall = c.prims.some((p) => BALL.includes(p));
  // A defensive trigger with an attacking move: defend now, the attack waits until we win the ball.
  const waitBall = needsBall && !ours && DEFENSIVE.includes(c.trigger);
  if (needsBall && !ours && !waitBall) return false;
  const chaos = m.rivalry?.effect === 'chaos' && m.clock < 40;
  ts.cultureCd = (chaos ? 9 : 16) + m.rng.range(0, 5);
  ts.cultureUses++;
  m.emit('combo', team, ours?.id ?? -1, { kind: 'culture', label: c.key });
  if (m.rivalry?.effect === 'counter') {
    const o = m.teams[team === 0 ? 1 : 0];
    o.cultureCd = Math.min(o.cultureCd, 3);
  }
  const backfire = c.risk !== 'none' && m.rng.chance(0.4);
  if (backfire && c.risk === 'wild') ts.wildNext = 1;
  if (backfire && c.risk === 'miscomm') ts.passWild = 1;
  // Ball actions run in order (passes before shots); team / opponent effects happen at once.
  const kicks = c.prims.filter((p) => BALL.includes(p)).sort((a, b) => Number(SHOTS.includes(a)) - Number(SHOTS.includes(b)));
  ts.cQueue = [];
  ts.cFollowT = 0;
  ts.cFollowLife = waitBall ? 9 : 7;
  ts.cWaitBall = waitBall;
  ts.cRun = null;
  for (const prim of c.prims) if (!kicks.includes(prim)) teamPrim(m, team, prim, kicks.length > 0);
  if (waitBall) ts.cQueue = kicks.slice();
  if (kicks.length && ours) {
    const tip = ts.cQueue.includes('tipIn');
    ts.cQueue = kicks.slice();
    if (tip) ts.cQueue.push('tipIn');
    const r = step(m, ours, ts.cQueue[0] as Step);
    if (r !== 'wait') ts.cQueue.shift();
    ts.cFollowT = 0.2;
  }
  if (backfire) applyRisk(m, team, c.risk);
  return true;
}

function prim_(m: Match, team: 0 | 1, a: number, kind: string, b?: number): void {
  m.emit('prim', team, a, { kind, b });
}

/** Defender guarding p (closest able opponent if none marks him). */
function defenderOf(m: Match, p: Player): Player | null {
  const opps = m.opponents(p).filter((o) => !m.isDisabled(o));
  return opps.find((o) => o.mark === p.id) ?? opps.sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0] ?? null;
}

/** Finish near the rim: dunk if close, layup otherwise; a jumper from range. */
function finish(m: Match, p: Player, label?: string): boolean {
  const d = dist(p.p, m.attackHoop(p.team));
  if (d < 2.6) m.act(p, dunkAction({ label, fx: 'culture' }), 0.38);
  else if (d < 3.5) m.act(p, shotAction('layup', { loft: 0.2, care: 0.55, label, fx: 'culture' }), 0.15);
  else m.act(p, shotAction('combo', { loft: 0.15, care: 0.7, label, fx: 'culture' }), 0.28);
  return true;
}

/** A pass-and-run move: the runner goes to the rim, or to the arc if a jumper follows in the recipe. */
function setRun(m: Match, team: 0 | 1, runner: Player): void {
  const ts = m.teams[team];
  const goal = m.attackHoop(team), dir = dirOf(team);
  const pullUp = ts.cQueue.includes('deepThree') || ts.cQueue.includes('highArc');
  let at = { x: goal.x - dir * 1.1, z: goal.z };
  if (pullUp) {
    // The most open spot just outside the arc (wings, corners, top), away from both defenders.
    let best = -Infinity;
    for (const ang of [-1.25, -0.7, 0, 0.7, 1.25]) {
      const spot = { x: goal.x - dir * Math.cos(ang) * (COURT.threeR + 0.5), z: clamp(Math.sin(ang) * (COURT.threeR + 0.5), -COURT.halfW + 0.8, COURT.halfW - 0.8) };
      let open = 9;
      for (const o of m.teamOf(team === 0 ? 1 : 0)) if (!m.isDisabled(o)) open = Math.min(open, dist(o.p, spot));
      const score = open - dist(spot, runner.p) * 0.15;
      if (score > best) {
        best = score;
        at = spot;
      }
    }
  }
  ts.cRun = { id: runner.id, x: at.x, z: at.z };
  runner.target = at;
  // A following shot / dunk / alley-oop is the finish; otherwise lay it in at the rim.
  const finisher = ts.cQueue.slice(1).some((x) => SHOTS.includes(x as BasketPrim) || x === 'alleyOop');
  if (ts.cQueue.includes('alleyOop')) return;
  ts.cQueue.splice(1, 0, ...(finisher ? (['_toCutter'] as const) : (['_toCutter', '_finish'] as const)));
}

/** One ball action by the carrier. 'wait' = not possible yet, keep it queued. */
function step(m: Match, p: Player, s: Step): boolean | 'wait' {
  const team = p.team;
  const ts = m.teams[team];
  const goal = m.attackHoop(team);
  const dir = dirOf(team);
  const mate = m.partnerOf(p);
  const label = ts.culture?.key;
  const mateOk = !m.isDisabled(mate);
  const rim = { x: goal.x - dir * 1.1, z: goal.z };
  switch (s) {
    case '_finish':
      if (dist(p.p, goal) > 4.5) {
        p.target = rim;
        return 'wait';
      }
      return finish(m, p, label);
    case '_toCutter': {
      if (!mateOk) return true;
      // Wait for the run to get there (or until it's now or never).
      const spot = ts.cRun && ts.cRun.id === mate.id ? ts.cRun : rim;
      if (dist(mate.p, spot) > 1.6 && ts.cFollowLife > 4.5) return 'wait';
      ts.cRun = null;
      m.act(p, passAction(m, p, mate, { loft: dist(mate.p, goal) < 2.2 ? 1 : 0, care: 0.6 }), 0.1);
      return true;
    }
    case 'alleyOop': {
      if (!mateOk) return false;
      mate.target = rim;
      mate.boostT = Math.max(mate.boostT, 0.8);
      m.act(p, { ...passAction(m, p, mate, { loft: 1, care: 0.6 }), target: { x: goal.x - dir * 1.0, z: goal.z + sideOf(mate.p.z, team) * 0.4 } }, 0.15);
      // 朱雀: the catch ends in the queued power dunk; otherwise a normal finish.
      if (ts.cQueue[1] !== 'powerDunk') ts.cQueue.splice(1, 0, '_finish');
      prim_(m, team, p.id, s, mate.id);
      return true;
    }
    case 'giveAndGo': {
      if (!mateOk) return false;
      m.act(p, passAction(m, p, mate, { care: 0.7 }), 0.1);
      // Then cut: the cutter is now "the partner" of the new carrier (兄弟: the return pass is the alley-oop).
      p.boostT = Math.max(p.boostT, 0.9);
      setRun(m, team, p);
      prim_(m, team, p.id, s, mate.id);
      return true;
    }
    case 'pickAndRoll': {
      const d = defenderOf(m, p);
      if (mateOk && d) {
        // The partner plants a screen on the ball's defender.
        mate.p = { x: d.p.x + (p.p.x - d.p.x) * 0.35, z: d.p.z + (p.p.z - d.p.z) * 0.35 };
        mate.v = { x: 0, z: 0 };
        mate.target = { ...mate.p };
        ts.fx.screen = 2.5;
        d.slowT = Math.max(d.slowT, 1.6);
      }
      p.boostT = Math.max(p.boostT, 1.1);
      p.target = rim;
      ts.cQueue.splice(1, 0, '_finish');
      prim_(m, team, p.id, s, d?.id);
      return true;
    }
    case 'backdoorCut': {
      if (!mateOk) return false;
      mate.target = rim;
      mate.boostT = Math.max(mate.boostT, 0.9);
      const dm = defenderOf(m, mate);
      if (dm) m.disable(dm, 'confuse', 0.7, mate);
      setRun(m, team, mate);
      prim_(m, team, mate.id, s, dm?.id);
      return true;
    }
    case 'crossover': {
      const d = defenderOf(m, p);
      if (d && dist(d.p, p.p) < 3) {
        // Ankle-breaker: the defender is wrong-footed (sometimes sits down).
        if (m.rng.chance(0.35)) m.knockDown(d, null, 0.6, 0);
        else m.disable(d, 'confuse', 0.8, p);
      }
      const side = d ? sideOf(p.p.z - d.p.z, team) : dir;
      p.p.z = clamp(p.p.z + side * 0.9, -COURT.halfW + 1, COURT.halfW - 1);
      p.boostT = Math.max(p.boostT, 0.9);
      p.target = rim;
      prim_(m, team, p.id, s, d?.id);
      return true;
    }
    case 'pumpFake': {
      const d = defenderOf(m, p);
      if (d && dist(d.p, p.p) < 3.5 && d.y < 0.05) {
        // The defender bites: up in the air, out of the play for a moment.
        d.state = 'jump';
        d.stateT = 0.8;
        d.vy = 5.5;
        d.jumpCd = 1.2;
      }
      prim_(m, team, p.id, s, d?.id);
      // The real move follows (queued), or a jumper.
      if (!ts.cQueue.slice(1).some((x) => BALL.includes(x as BasketPrim))) {
        m.later(0.4, () => {
          if (m.ball.owner === p.id && p.state === 'play' && !p.pending) m.act(p, shotAction('combo', { loft: 0.1, care: 0.7, label, fx: 'culture' }), 0.25);
        });
      }
      return true;
    }
    case 'highArc':
    case 'bankShot':
    case 'deepThree': {
      // Consecutive shot primitives make ONE shot with both features (抛投: a rainbow off the glass).
      const parts: BasketPrim[] = [s];
      const nxt = ts.cQueue[1];
      if ((nxt === 'highArc' || nxt === 'bankShot' || nxt === 'deepThree') && nxt !== s) {
        parts.push(nxt);
        ts.cQueue.splice(1, 1);
      }
      const far = parts.includes('deepThree') ? COURT.threeR + 3 : parts.includes('bankShot') ? 6 : 8;
      if (dist(p.p, goal) > far) {
        p.target = { x: goal.x - dir * (far - 1.5), z: p.p.z };
        if (parts.length > 1) ts.cQueue.splice(1, 0, parts[1]);
        return 'wait';
      }
      const arc = parts.includes('highArc'), bank = parts.includes('bankShot') && dist(p.p, goal) < 6;
      const kind = arc ? 'highArc' : bank ? 'bank' : 'jump';
      m.act(p, shotAction(kind, { loft: arc ? 0.9 : bank ? 0.25 : 0.15, bank, care: arc ? 0.75 : 0.62, label, fx: 'culture', power: parts.includes('deepThree') }), 0.3);
      for (const x of parts) prim_(m, team, p.id, x);
      return true;
    }
    case 'powerDunk':
      if (dist(p.p, goal) > 7.5) {
        p.target = rim;
        return 'wait';
      }
      p.boostT = Math.max(p.boostT, 1.3);
      p.dunkDrive = 1;
      prim_(m, team, p.id, s);
      return true;
    case 'curvePass': {
      if (!mateOk) return false;
      // Bend the ball away from the defender sitting in the lane.
      let worst: Player | null = null, wd = 9;
      for (const o of m.opponents(p)) {
        const d = segDistTo(o.p, p.p, mate.p);
        if (d < wd) {
          wd = d;
          worst = o;
        }
      }
      const dx = mate.p.x - p.p.x, dz = mate.p.z - p.p.z;
      const cross = worst ? dx * (worst.p.z - p.p.z) - dz * (worst.p.x - p.p.x) : 1;
      const curl = (cross > 0 ? -1 : 1) * 9;
      m.act(p, passAction(m, p, mate, { curl, care: 0.4 }), 0.12);
      prim_(m, team, p.id, s, mate.id);
      return true;
    }
    case 'fastBreak': {
      if (!mateOk) return false;
      p.boostT = Math.max(p.boostT, 0.8);
      ts.fx.sprint = Math.max(ts.fx.sprint ?? 0, 3.5);
      mate.boostT = Math.max(mate.boostT, 1.2);
      // 风火: the long outlet pass is the alley-oop itself; 追分: the runner pulls up for a three.
      setRun(m, team, mate);
      prim_(m, team, p.id, s, mate.id);
      return true;
    }
    case 'swapPass': {
      if (!mateOk) return false;
      const a = { ...p.p };
      p.p = { ...mate.p };
      mate.p = a;
      p.ghostT = mate.ghostT = 0.5;
      for (const o of m.opponents(p)) if (dist(o.p, p.p) < 3 || dist(o.p, mate.p) < 3) m.disable(o, 'confuse', 0.6, p);
      m.act(p, passAction(m, p, mate, { care: 0.7 }), 0.15);
      prim_(m, team, p.id, s, mate.id);
      return true;
    }
    default:
      return true;
  }
}

function segDistTo(q: V2, a: V2, b: V2): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz || 1;
  const t = clamp(((q.x - a.x) * abx + (q.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(q.x - (a.x + abx * t), q.z - (a.z + abz * t));
}

/** Put-back: a teammate next to the loose ball near the rim taps it at the hoop. */
function tipIn(m: Match, team: 0 | 1): boolean {
  const b = m.ball;
  const goal = m.attackHoop(team);
  const carrier = m.carrier();
  if (carrier && carrier.team === team) {
    if (carrier.state !== 'play' || carrier.pending || dist(carrier.p, goal) > 3.5) return false;
    finish(m, carrier, m.teams[team].culture?.key);
    prim_(m, team, carrier.id, 'tipIn');
    return true;
  }
  if (b.owner >= 0 || b.shot) return false;
  const bp = { x: b.p.x, z: b.p.z };
  if (dist(bp, goal) > 3.5) return false;
  const p = m.teamOf(team).filter((q) => !m.isDisabled(q) && dist(q.p, bp) < 1.8 && b.p.y < q.y + m.reachOf(q) + 0.6).sort((a, c) => dist(a.p, bp) - dist(c.p, bp))[0];
  if (!p) return false;
  // Tap it towards the rim with a soft arc (it still has to drop through).
  const tx = goal.x, tz = goal.z, ty = COURT.rimH + 0.05;
  const dx = tx - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1;
  const T = 0.45 + d * 0.06;
  const err = (1 - p.attr.accuracy) * 0.08;
  const ang = Math.atan2(dz, dx) + m.rng.range(-err, err);
  b.v.x = Math.cos(ang) * (d / T);
  b.v.z = Math.sin(ang) * (d / T);
  b.v.y = (ty - b.p.y) / T + 0.5 * COURT.gravity * T;
  b.lastTouch = p.id;
  b.noPickBy = p.id;
  b.noPickT = 0.3;
  b.rebound = false;
  b.shot = { by: p.id, kind: 'tip', t: m.t, points: 2, label: m.teams[team].culture?.key, power: false, touchedRim: false };
  p.stats.shots++;
  p.vy = Math.max(p.vy, 4);
  m.emit('shot', team, p.id, { kind: 'tip', v: 2 });
  prim_(m, team, p.id, 'tipIn');
  return true;
}

/** Team / opponent primitives (no ball action). */
function teamPrim(m: Match, team: 0 | 1, prim: BasketPrim, hasBallMoves: boolean): void {
  const ts = m.teams[team];
  const mates = m.teamOf(team);
  const opps = m.teamOf(team === 0 ? 1 : 0);
  const carrier = m.carrier();
  const bp = { x: m.ball.p.x, z: m.ball.p.z };
  const by = mates.filter((p) => !m.isDisabled(p)).sort((a, b) => dist(a.p, bp) - dist(b.p, bp))[0] ?? mates[0];
  const dur = DURATION[prim];
  if (dur) ts.fx[prim as CultureFx] = Math.max(ts.fx[prim as CultureFx] ?? 0, dur);
  switch (prim) {
    case 'tipIn':
      // Wait for the loose ball (queued).
      ts.cQueue.push('tipIn');
      ts.cFollowLife = Math.max(ts.cFollowLife, 3);
      return;
    case 'screen': {
      const heavy = mates.filter((p) => !m.isDisabled(p) && p.id !== carrier?.id).sort((a, b) => b.attr.mass - a.attr.mass)[0];
      const ref = carrier ?? by;
      const victim = opps.filter((o) => !m.isDisabled(o)).sort((a, b) => dist(a.p, ref.p) - dist(b.p, ref.p))[0];
      if (heavy && victim) {
        victim.slowT = Math.max(victim.slowT, 2);
        heavy.target = { ...victim.p };
        heavy.boostT = Math.max(heavy.boostT, 0.8);
        prim_(m, team, heavy.id, prim, victim.id);
      }
      return;
    }
    case 'swap': {
      const [a, b] = mates;
      if (m.isDisabled(a) || m.isDisabled(b)) return;
      const tmp = { ...a.p };
      a.p = { ...b.p };
      b.p = tmp;
      a.ghostT = b.ghostT = 0.5;
      // Their markers now face the wrong player.
      for (const o of opps) if (!m.isDisabled(o) && (dist(o.p, a.p) < 3 || dist(o.p, b.p) < 3)) m.disable(o, 'confuse', 0.6, a);
      prim_(m, team, a.id, prim, b.id);
      return;
    }
    case 'recover': {
      let n = 0;
      for (const p of mates) {
        if (m.isDisabled(p)) {
          p.stateT = Math.min(p.stateT, 0.05);
          n++;
        }
        p.rallyT = Math.max(p.rallyT, 3);
      }
      prim_(m, team, by.id, prim, n);
      return;
    }
    case 'markWrong':
    case 'decoyBall': {
      const ref = carrier && carrier.team === team ? carrier.p : bp;
      // 2v2: one defender is fooled, the other is a step slow (confusing both would end the game).
      const able = opps.filter((o) => !m.isDisabled(o)).sort((a, b) => dist(a.p, ref) - dist(b.p, ref));
      const victims = able.slice(0, 1);
      let hit = 0;
      for (const o of victims) if (m.disable(o, 'confuse', prim === 'markWrong' ? 1 : 1.3, by)) hit++;
      if (prim === 'markWrong' && able[1]) able[1].slowT = Math.max(able[1].slowT, 0.8);
      if (prim === 'decoyBall') {
        // A ghost ball floats the other way (visual only — the real one is untouched).
        const s = sideOf(ref.z, team);
        m.ghost = { x: ref.x - dirOf(team) * 1.5, z: clamp(-s * 3, -COURT.halfW + 1, COURT.halfW - 1), t: 1.5 };
      }
      if (hit || prim === 'decoyBall') prim_(m, team, by.id, prim, victims[0]?.id);
      return;
    }
    case 'slowZone': {
      const at = carrier && carrier.team !== team ? carrier.p : (opps.filter((o) => !m.isDisabled(o)).sort((a, b) => dist(a.p, bp) - dist(b.p, bp))[0]?.p ?? bp);
      m.zones.push({ team, x: at.x, z: at.z, r: 2.6, t: 4.5, kind: 'slip' });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'pushWave': {
      let n = 0;
      for (const o of opps) if (dist(o.p, by.p) < 3.6 && m.knockDown(o, by, 0.75, 5)) n++;
      if (!n) {
        const o = opps.filter((x) => !m.isDisabled(x)).sort((a, b) => dist(a.p, by.p) - dist(b.p, by.p))[0];
        if (o && dist(o.p, by.p) < 6 && m.knockDown(o, by, 0.75, 5)) n++;
      }
      if (n) prim_(m, team, by.id, prim, n);
      return;
    }
    case 'stunCarrier': {
      const t = carrier && carrier.team !== team ? carrier : opps.filter((o) => o.state !== 'down' && o.state !== 'freeze').sort((a, b) => dist(a.p, bp) - dist(b.p, bp))[0];
      if (t && m.disable(t, 'freeze', 1.1, by)) prim_(m, team, by.id, prim, t.id);
      return;
    }
    case 'obstacle': {
      // A prop slides onto court in the opponents' path (or in front of their hoop when we attack).
      const theirs = carrier && carrier.team !== team ? carrier : null;
      const at = theirs ? { x: theirs.p.x + dirOf(theirs.team) * 2, z: theirs.p.z } : { x: bp.x + dirOf(team) * 2.5, z: bp.z + sideOf(bp.z, team) * 1.5 };
      m.zones.push({ team, x: clamp(at.x, -COURT.halfL + 1.5, COURT.halfL - 1.5), z: clamp(at.z, -COURT.halfW + 1, COURT.halfW - 1), r: 0.6, t: 5, kind: 'box' });
      prim_(m, team, by.id, prim);
      return;
    }
    case 'lucky':
      ts.luckCharges = Math.min(1, ts.luckCharges + 1);
      prim_(m, team, by.id, prim);
      return;
    default:
      // Timed team effects (sprint, doubleTeam, paintWall, blockBoost, stealBoost, reboundBoost, lowGravity, calm, accuracy, spotlight).
      prim_(m, team, by.id, prim);
      void hasBallMoves;
  }
}

/** Backfires — announced only when they really happen ('wild' / 'miscomm' bend the next shot / pass). */
function applyRisk(m: Match, team: 0 | 1, risk: string): void {
  const ts = m.teams[team];
  const shown = (a = -1) => m.emit('prim', team, a, { kind: `risk:${risk}` });
  const able = () => m.teamOf(team).filter((p) => !m.isDisabled(p) && m.ball.owner !== p.id && p.boostT <= 0 && p.state === 'play');
  switch (risk) {
    case 'trip':
      m.later(0.7, () => {
        const pool = able();
        const p = pool.length ? pool[m.rng.int(0, pool.length - 1)] : null;
        if (p && m.knockDown(p, null, 0.7, 0)) shown(p.id);
      });
      break;
    case 'crash': {
      // Both go for the same spot and collide.
      const [a, b] = m.teamOf(team);
      if (m.isDisabled(a) || m.isDisabled(b)) break;
      const mid = { x: (a.p.x + b.p.x) / 2, z: (a.p.z + b.p.z) / 2 };
      for (const p of [a, b]) if (m.ball.owner !== p.id) p.target = mid;
      m.later(0.8, () => {
        if (m.isDisabled(a) || m.isDisabled(b)) return;
        a.boostT = b.boostT = 0;
        const hitA = m.knockDown(a, b, 0.6, 2), hitB = m.knockDown(b, a, 0.6, 2);
        if (hitA || hitB) shown(a.id);
      });
      break;
    }
    case 'tired':
      ts.tiredAfter = true;
      if (!ts.fx.sprint) ts.fx.tired = 5;
      shown();
      break;
    case 'gap':
      ts.fx.gap = 5;
      shown();
      break;
    case 'celebrate': {
      let n = 0;
      for (const p of able()) {
        m.setState(p, 'celebrate', 1.2);
        if (p.state === 'celebrate') n++;
      }
      if (n) shown();
      break;
    }
  }
}

/** End of the team AI: timed effects take over where the team stands. */
export function cultureTargets(m: Match, team: 0 | 1): void {
  const ts = m.teams[team];
  const carrier = m.carrier();
  if (ts.cRun && ts.cQueue.length) {
    const r = m.players[ts.cRun.id];
    if (!m.isDisabled(r) && m.ball.owner !== r.id) r.target = { x: ts.cRun.x, z: ts.cRun.z };
  } else ts.cRun = null;
  const own = m.ownHoop(team);
  if (ts.fx.gap && (!carrier || carrier.team !== team)) {
    // Everyone collapses into the paint: the perimeter is wide open.
    for (const p of m.teamOf(team)) if (!m.isDisabled(p)) p.target = { x: own.x + dirOf(team) * (1 + p.idx * 0.8), z: (p.idx ? 0.8 : -0.8) * dirOf(team) };
  }
  if (ts.fx.screen && carrier && carrier.team === team) {
    const mate = m.partnerOf(carrier);
    if (!m.isDisabled(mate)) mate.target = { ...mate.p };
  }
}

/** Opponents of a spotlight team crowd its best scorer. */
export function spotlightStar(m: Match, team: 0 | 1): Player | null {
  if (!m.teams[team].fx.spotlight) return null;
  return m.teamOf(team).filter((p) => !m.isDisabled(p)).sort((a, b) => makeChance(m, b) - makeChance(m, a) || b.attr.power - a.attr.power)[0] ?? null;
}
