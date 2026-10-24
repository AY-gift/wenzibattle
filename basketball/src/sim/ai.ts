/**
 * Team AI (every 0.1 s). Offence: the carrier weighs dunk / layup / jump shot / three / pass /
 * drive from geometry, the shot clock and the character's stats; the partner gets open on the
 * wing or cuts to the rim. Defence: man-to-man — the ball's defender stays between carrier and
 * rim, reaches in, contests and jumps to block; the other one sags and helps. Loose balls and
 * rebounds: chase, box out, jump.
 */
import { COURT, TEAM_SIZE, type Action, type Player, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';
import { trySkill } from './skills';
import { cultureTargets, spotlightStar, tryCulture } from './culture';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const inCourt = (v: V2): V2 => ({ x: clamp(v.x, -COURT.halfL + 0.8, COURT.halfL - 0.8), z: clamp(v.z, -COURT.halfW + 0.8, COURT.halfW - 0.8) });

function segDist(p: V2, a: V2, b: V2): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz || 1;
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/** Distance to the closest able opponent. */
export function openness(m: Match, p: Player): number {
  let best = 9;
  for (const o of m.opponents(p)) if (!m.isDisabled(o)) best = Math.min(best, dist(o.p, p.p));
  return best;
}

/** Rough chance a jump shot from here goes in (used for decisions only). */
export function makeChance(m: Match, p: Player, at: V2 = p.p): number {
  const d = dist(at, m.attackHoop(p.team));
  let o = 9;
  for (const q of m.opponents(p)) if (!m.isDisabled(q)) o = Math.min(o, dist(q.p, at));
  return clamp(0.66 - d * 0.05 + (p.attr.accuracy - 0.5) * 0.35 - (o < 1.8 ? (1.8 - o) * 0.22 : 0) + ((m.teams[p.team].fx.accuracy ?? 0) > 0 ? 0.1 : 0), 0.05, 0.9);
}

export function think(m: Match, team: 0 | 1): void {
  if (m.phase !== 'play') return;
  const mates = m.teamOf(team);
  const ball = m.ball;
  const bp = { x: ball.p.x, z: ball.p.z };
  const carrier = m.carrier();
  const own = m.ownHoop(team), goal = m.attackHoop(team);
  for (const p of mates) p.role = 'free';
  assignMarks(m, team);
  tryCulture(m, team);

  if (carrier && carrier.team === team) {
    carrier.role = 'carrier';
    decideCarrier(m, carrier);
    const partner = m.partnerOf(carrier);
    if (!m.isDisabled(partner)) {
      partner.role = 'partner';
      getOpen(m, partner, carrier);
      trySkill(m, partner, 'any');
    }
  } else if (carrier) {
    // Defence: the man on the ball, and the helper.
    const star = spotlightStar(m, carrier.team);
    for (const p of mates) {
      if (m.isDisabled(p)) continue;
      const man = m.players[p.mark];
      if (man.id === carrier.id || (star && star.id === man.id && (m.teams[team === 0 ? 1 : 0].fx.spotlight ?? 0) > 0)) {
        p.role = 'guardBall';
        guardBall(m, p, carrier);
      } else {
        p.role = 'guardMan';
        guardMan(m, p, man, carrier);
      }
    }
    // Double team: both on the ball.
    if (m.teams[team].fx.doubleTeam) for (const p of mates) if (!m.isDisabled(p) && p.role === 'guardMan') guardBall(m, p, carrier, true);
    // Contest a shot / dunk being wound up.
    for (const p of mates) {
      if (m.isDisabled(p) || p.y > 0.05) continue;
      const winding = carrier.state === 'shoot' || carrier.state === 'dunk';
      // Meet a flying dunk at the rim, or go up with the shooter.
      const atRim = carrier.state === 'dunk' && dist(p.p, m.ownHoop(team)) < 2.4 && carrier.stateT < 0.45;
      if (winding && (dist(p.p, carrier.p) < 2.1 || atRim) && m.rng.chance(0.35 + p.attr.defense * 0.4)) m.jump(p);
    }
  } else {
    // Loose ball / shot in the air / rebound.
    const shotTeam = ball.shot ? m.players[ball.shot.by].team : -1;
    const hoop = ball.shot ? m.attackHoop(shotTeam as 0 | 1) : null;
    const recv = ball.passTo >= 0 ? m.players[ball.passTo] : null;
    const receiving = recv && recv.team === team && !m.isDisabled(recv) ? recv : null;
    const able = mates.filter((p) => !m.isDisabled(p));
    const chaser = receiving ?? able.slice().sort((a, b) => dist(a.p, bp) / a.attr.pace - dist(b.p, bp) / b.attr.pace)[0];
    for (const p of able) {
      if (p === chaser && !ball.shot) {
        p.role = 'chaser';
        const lead = clamp(dist(p.p, bp) / Math.max(1, p.attr.pace), 0.25, 0.9);
        p.target = inCourt({ x: bp.x + ball.v.x * lead, z: bp.z + ball.v.z * lead });
      } else {
        p.role = 'rebounder';
        // Crash the boards: a step in front of the rim, defenders inside their man.
        const h = hoop ?? (ball.p.x * dirOf(team) > 0 ? goal : own);
        const toward = { x: h.x - Math.sign(h.x) * 1.8, z: (p.idx ? 1 : -1) * 1.3 * dirOf(team) };
        p.target = inCourt(ball.shot ? toward : { x: (bp.x + h.x) / 2, z: bp.z * 0.5 });
      }
      // Jump for a high ball coming down close by.
      const db = dist(p.p, bp);
      const reboundJump = (m.teams[team].fx.reboundBoost ?? 0) > 0 ? 0.25 : 0;
      if (db < 1.6 + reboundJump && ball.p.y > 1.7 && ball.p.y < 6.5 && ball.v.y < 1 && !(ball.shot && !ball.shot.touchedRim)) m.jump(p);
    }
  }
  if (!carrier || carrier.team !== team) for (const p of mates) if (p.role !== 'guardBall') trySkill(m, p, carrier ? 'defend' : 'any');
  cultureTargets(m, team);
}

/** Each defender takes one attacker; swap when that is clearly shorter (deterministic). */
function assignMarks(m: Match, team: 0 | 1): void {
  const [a, b] = m.teamOf(team);
  const [x, y] = m.teamOf(team === 0 ? 1 : 0);
  const keep = dist(m.players[a.mark].p, a.p) + dist(m.players[b.mark].p, b.p);
  const alt = a.mark === x.id ? dist(y.p, a.p) + dist(x.p, b.p) : dist(x.p, a.p) + dist(y.p, b.p);
  if (alt < keep - 3) {
    const t = a.mark;
    a.mark = b.mark;
    b.mark = t;
  }
  if (a.mark === b.mark) b.mark = a.mark === x.id ? y.id : x.id;
}

function guardBall(m: Match, p: Player, c: Player, aggressive = false): void {
  const own = m.ownHoop(p.team);
  const d = dist(c.p, own) || 1;
  const gap = aggressive ? 0.6 : 1.05 + (1 - p.attr.defense) * 0.4;
  p.target = inCourt({ x: c.p.x + ((own.x - c.p.x) / d) * gap + c.v.x * 0.15, z: c.p.z + ((own.z - c.p.z) / d) * gap + c.v.z * 0.15 });
  const close = dist(p.p, c.p) < p.attr.radius + c.attr.radius + 0.5;
  const ts = m.teams[p.team];
  const want = 0.1 + p.spec.personality.aggression * 0.12 + (ts.fx.stealBoost ? 0.15 : 0) + (aggressive ? 0.1 : 0) + (c.pending ? 0.2 : 0);
  if (close && p.stealCd <= 0 && m.rng.chance(want)) m.steal(p, c);
  if (!close && dist(p.p, c.p) < 6) trySkill(m, p, 'defend');
}

function guardMan(m: Match, p: Player, man: Player, c: Player): void {
  const own = m.ownHoop(p.team);
  const ts = m.teams[p.team];
  // Paint wall: stay home under the rim.
  if (ts.fx.paintWall) {
    p.target = { x: own.x + dirOf(p.team) * 1.3, z: (p.idx ? 0.9 : -0.9) * dirOf(p.team) };
    return;
  }
  // Help: the carrier is in the paint and its defender is beaten.
  const cd = dist(c.p, own);
  const mate = m.partnerOf(p);
  if (cd < 3.2 && (m.isDisabled(mate) || dist(mate.p, own) > cd + 0.5)) {
    p.target = { x: c.p.x + (own.x - c.p.x) * 0.3, z: c.p.z + (own.z - c.p.z) * 0.3 };
    return;
  }
  // Sag between the man and the rim, towards the ball side.
  const k = 0.35 + (cd < 6 ? 0.15 : 0);
  p.target = inCourt({ x: man.p.x + (own.x - man.p.x) * k, z: man.p.z + (own.z - man.p.z) * k + (c.p.z - man.p.z) * 0.15 });
  // Jump a lob meant for the man.
  const b = m.ball;
  if (b.owner < 0 && b.passTo === man.id && dist(p.p, { x: b.p.x, z: b.p.z }) < 1.5 && b.p.y > 1.6) m.jump(p);
}

/** Off the ball: spot up on the far wing, or cut to the rim when the defender ball-watches. */
function getOpen(m: Match, p: Player, c: Player): void {
  const goal = m.attackHoop(p.team);
  const dir = dirOf(p.team);
  const defender = m.opponents(p).find((o) => o.mark === p.id) ?? null;
  const cd = dist(c.p, goal);
  const lax = !defender || m.isDisabled(defender) || dist(defender.p, p.p) > 2.6;
  if (lax && cd > 3 && dist(p.p, goal) > 2.5) {
    // Backdoor: straight to the rim.
    p.target = { x: goal.x - dir * 1.4, z: -sideOf(c.p.z, p.team) * 0.8 };
    return;
  }
  // Far wing / corner at three-point range, away from the carrier.
  const side = -sideOf(c.p.z, p.team);
  const spots: V2[] = [
    { x: goal.x - dir * 4.2, z: side * 4.0 },
    { x: goal.x - dir * 1.2, z: side * 5.6 },
    { x: goal.x - dir * 6.0, z: side * 1.5 },
  ];
  let best = spots[0], bestScore = -Infinity;
  for (const s of spots) {
    let o = 9;
    for (const q of m.opponents(p)) if (!m.isDisabled(q)) o = Math.min(o, dist(q.p, s));
    const score = Math.min(o, 4) - dist(s, p.p) * 0.12 - (dist(s, c.p) < 3 ? 3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  p.target = inCourt(best);
}

export function shotAction(kind: Action['shot'], extra: Partial<Action> = {}): Action {
  return { kind: 'shot', target: { x: 0, z: 0 }, to: -1, shot: kind, loft: 0, curl: 0, bank: false, care: 1, ...extra };
}

export function passAction(m: Match, p: Player, to: Player, extra: Partial<Action> = {}): Action {
  const lead = clamp(dist(p.p, to.p) / 14, 0.1, 0.5);
  const target = inCourt({ x: to.p.x + to.v.x * lead, z: to.p.z + to.v.z * lead });
  void m;
  return { kind: 'pass', target, to: to.id, shot: 'jump', loft: 0, curl: 0, bank: false, care: 1, ...extra };
}

/** A dunk from close in (power: harder to stop, flattens people). */
export function dunkAction(extra: Partial<Action> = {}): Action {
  return { kind: 'dunk', target: { x: 0, z: 0 }, to: -1, shot: 'dunk', loft: 0, curl: 0, bank: false, care: 1, ...extra };
}

function decideCarrier(m: Match, p: Player): void {
  const ts = m.teams[p.team];
  const goal = m.attackHoop(p.team);
  const dHoop = dist(p.p, goal);
  if (p.state !== 'play' || p.pending) return;
  // Culture moves decide this touch (culture.ts).
  if (ts.cQueue.length) {
    p.target = inCourt({ x: goal.x - dirOf(p.team) * 2.5, z: p.p.z * 0.6 });
    return;
  }
  if (p.dunkDrive > 0) {
    p.target = { x: goal.x - dirOf(p.team) * 0.8, z: goal.z };
    if (dHoop < 4.5) {
      p.dunkDrive = 0;
      m.act(p, dunkAction({ power: true, fx: 'fire', flying: dHoop > 2.6 }), 0.42 + Math.max(0, dHoop - 2.6) * 0.1);
    }
    return;
  }
  if (p.actCd > 0) return;
  if (dHoop < 8 && trySkill(m, p, 'shoot')) return;
  const o = openness(m, p);
  if (o < 1.4 && trySkill(m, p, 'carry')) return;
  const clockLeft = ts.shotClock;
  const partner = m.partnerOf(p);
  const opps = m.opponents(p).filter((q) => !m.isDisabled(q));
  const pers = p.spec.personality;
  const chaos = p.attr.tags.includes('chaos') ? 0.3 : pers.chaos * 0.15;
  const noise = () => m.rng.range(-chaos, chaos);
  // Lane to the rim.
  let laneBlock = 9;
  for (const q of opps) laneBlock = Math.min(laneBlock, segDist(q.p, p.p, goal));
  // --- finishes ---
  const dunkScore = dHoop < 2.6 ? 1.0 + p.attr.power * 0.3 + (laneBlock > 0.9 ? 0.2 : -0.3) : -1;
  // 热血 style: take off from far out and fly to the rim.
  const flyScore = dHoop >= 2.6 && dHoop < 6 && laneBlock > 1.1 ? 0.7 + p.attr.jump * 0.35 + p.attr.power * 0.15 + pers.aggression * 0.1 - dHoop * 0.03 + noise() : -1;
  const layupScore = dHoop < 3.2 ? 0.85 - (o < 0.9 ? 0.25 : 0) : -1;
  const pts = m.pointsFrom(p.p, p.team);
  const mc = makeChance(m, p);
  let shotScore = mc * pts * 0.55 + pers.aggression * 0.1 + noise();
  if (pts === 3) shotScore += (p.attr.accuracy - 0.5) * 0.3;
  if (dHoop > COURT.threeR + 2.2) shotScore -= 0.6;
  if (clockLeft < 2.2) shotScore += 0.8;
  // --- pass ---
  let passScore = -1;
  if (!m.isDisabled(partner) && dist(partner.p, p.p) > 2) {
    let lane = 9;
    for (const q of opps) lane = Math.min(lane, segDist(q.p, p.p, partner.p));
    const pmc = makeChance(m, partner) * m.pointsFrom(partner.p, partner.team) * 0.55;
    const pd = dist(partner.p, goal);
    passScore = pmc + (pd < 2.5 ? 0.35 : 0) + (lane < 0.9 ? -0.9 : 0) + 0.05 + noise() - (clockLeft < 1.2 ? 1 : 0);
  }
  // --- drive ---
  const driveScore = dHoop > 2.4 ? 0.42 + p.attr.control * 0.25 + (laneBlock > 1.3 ? 0.3 : -0.15) - (o < 1 ? 0.25 : 0) + noise() : -1;
  const best = Math.max(dunkScore, flyScore, layupScore, shotScore, passScore, driveScore);
  if (best === dunkScore && dunkScore > 0.6) {
    m.act(p, dunkAction(), 0.42);
    return;
  }
  if (best === flyScore && flyScore > 0.62) {
    m.act(p, dunkAction({ flying: true }), 0.42 + dHoop * 0.1);
    return;
  }
  if (best === layupScore && layupScore > 0.5) {
    m.act(p, shotAction('layup', { loft: 0.15, bank: Math.abs(p.p.z) > 0.8, care: 0.7 }), 0.18);
    return;
  }
  if (best === shotScore && shotScore > 0.42) {
    m.act(p, shotAction('jump', { loft: 0.1 }), 0.32);
    return;
  }
  if (best === passScore && passScore > 0.38) {
    const lob = dist(partner.p, goal) < 2.2 && partner.attr.jump > 0.35;
    m.act(p, passAction(m, p, partner, { loft: lob ? 1 : 0 }), 0.14);
    return;
  }
  // Drive at the rim, swerving around defenders; or reset to the top if the lane is shut.
  let vx = goal.x - p.p.x, vz = goal.z - p.p.z;
  const l = Math.hypot(vx, vz) || 1;
  vx /= l;
  vz /= l;
  for (const q of opps) {
    const dx = p.p.x - q.p.x, dz = p.p.z - q.p.z, d = Math.hypot(dx, dz);
    if (d < 3 && d > 0.01) {
      vx += (dx / d) * (3 - d) * 0.3;
      vz += (dz / d) * (3 - d) * 0.55;
    }
  }
  const vl = Math.hypot(vx, vz) || 1;
  p.target = inCourt({ x: p.p.x + (vx / vl) * 3, z: p.p.z + (vz / vl) * 3 });
  if (driveScore < 0.2 && dHoop < 4) p.target = inCourt({ x: goal.x - dirOf(p.team) * 6, z: p.p.z * 0.5 });
}

/** Desired velocity toward the target, with spacing between the two teammates. */
export function steer(m: Match, p: Player, maxSpeed: number): V2 {
  let dx = p.target.x - p.p.x, dz = p.target.z - p.p.z;
  const d = Math.hypot(dx, dz);
  const speed = maxSpeed * clamp(d / 1.2, 0, 1);
  if (d > 1e-3) {
    dx /= d;
    dz /= d;
  }
  if (m.ball.owner !== p.id) {
    for (let i = 0; i < TEAM_SIZE; i++) {
      const o = m.players[p.team * TEAM_SIZE + i];
      if (o.id === p.id) continue;
      const ox = p.p.x - o.p.x, oz = p.p.z - o.p.z, od = Math.hypot(ox, oz);
      if (od < 2.5 && od > 1e-3) {
        dx += (ox / od) * (2.5 - od) * 0.35;
        dz += (oz / od) * (2.5 - od) * 0.35;
      }
    }
  }
  const l = Math.hypot(dx, dz) || 1;
  return { x: (dx / l) * speed, z: (dz / l) * speed };
}
