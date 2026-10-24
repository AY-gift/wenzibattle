/**
 * Team AI: every 0.1 s each team hands out roles (carrier, support, runner, keeper, presser,
 * marker…) and the ball carrier scores its options (shoot / pass / lob / dribble / special
 * move). Utility scoring, no lookups of the future and no LLM — just geometry and the
 * characters' stats and personality.
 */
import { FIELD, TEAM_SIZE, type Kick, type Player, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';
import { trySkill } from './skills';
import { comboTargets, tryCombo } from './combos';
import { cultureTargets, spotlightStar, tryCulture } from './culture';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from point p to segment ab. */
function segDist(p: V2, a: V2, b: V2): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz || 1;
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

const inField = (v: V2): V2 => ({ x: clamp(v.x, -FIELD.halfL + 1, FIELD.halfL - 1), z: clamp(v.z, -FIELD.halfW + 1, FIELD.halfW - 1) });

export function think(m: Match, team: 0 | 1): void {
  const mates = m.teamOf(team);
  const opps = m.teamOf(team === 0 ? 1 : 0);
  const dir = dirOf(team);
  const ball = m.ball;
  const bp = { x: ball.p.x, z: ball.p.z };
  const carrier = m.carrier();
  const own = m.ownGoal(team);
  const ballU = bp.x * dir;
  const active = mates.filter((p) => !m.isDisabled(p));
  for (const p of mates) p.role = 'free';

  // Keeper: whoever is deepest, whenever the ball is in our half (or a shot is coming).
  const threat = ballU < 4 || (ball.shot && m.players[ball.shot.by].team !== team);
  const deepest = active.filter((p) => p.id !== ball.owner).sort((a, b) => dist(a.p, own) - dist(b.p, own))[0];
  // 无法无天: nobody wants to stay back.
  const lawless = m.teams[team].combo?.kind === 'lawless' && m.teams[team].comboT > 0;
  if (deepest) deepest.role = threat && !lawless ? 'keeper' : 'anchor';

  if (carrier && carrier.team === team) {
    carrier.role = 'carrier';
    const rest = active.filter((p) => p.role === 'free').sort((a, b) => dist(a.p, carrier.p) - dist(b.p, carrier.p));
    if (rest[0]) rest[0].role = 'support';
    if (rest[1]) rest[1].role = 'runner';
  } else if (carrier) {
    // Defending: the closest presses, the next marks the most dangerous attacker.
    const rest = active.filter((p) => p.role === 'free' || (p.role === 'keeper' && dist(carrier.p, own) < 5)).sort((a, b) => dist(a.p, carrier.p) - dist(b.p, carrier.p));
    if (rest[0]) rest[0].role = 'presser';
    for (const p of rest.slice(1)) if (p.role === 'free') p.role = 'marker';
  } else {
    // Loose ball: the intended receiver of our pass runs onto it; otherwise whoever gets there first.
    const recv = ball.passTo >= 0 ? m.players[ball.passTo] : null;
    const receiving = recv && recv.team === team && active.includes(recv) ? recv : null;
    if (receiving) receiving.role = 'chaser';
    const rest = active.filter((p) => p !== receiving && (p.role !== 'keeper' || dist(bp, own) < 6)).sort((a, b) => dist(a.p, bp) / a.attr.pace - dist(b.p, bp) / b.attr.pace);
    if (rest[0] && !receiving) rest[0].role = 'chaser';
    for (const p of rest.slice(1)) if (p.role === 'free') p.role = 'support';
  }

  // Combos and skills first (they may take over the next few seconds).
  tryCombo(m, team);
  tryCulture(m, team);
  // 聚光灯: the other side's star draws every marker.
  const star = spotlightStar(m, team === 0 ? 1 : 0);

  const markedAttackers = new Set<number>();
  for (const p of mates) {
    if (m.isDisabled(p)) continue;
    switch (p.role) {
      case 'keeper': {
        const g = own;
        const d = dist(bp, g);
        const k = clamp(d * 0.22, 0.7, 2.4);
        const t = { x: g.x + ((bp.x - g.x) / (d || 1)) * k, z: clamp(g.z + ((bp.z - g.z) / (d || 1)) * k, -FIELD.goalHalfW, FIELD.goalHalfW) };
        p.target = t;
        keeperReact(m, p);
        if (!carrier || carrier.team !== team) trySkill(m, p, 'defend');
        break;
      }
      case 'anchor':
        p.target = inField({ x: dir * clamp(ballU - 10, -15, -2), z: bp.z * 0.3 });
        break;
      case 'carrier':
        decideCarrier(m, p);
        break;
      case 'support': {
        const c = carrier && carrier.team === team ? carrier : null;
        if (c) {
          const side = -sideOf(c.p.z, team);
          p.target = inField({ x: c.p.x + dir * 4.5, z: c.p.z + side * 5 });
        } else p.target = inField({ x: bp.x - dir * 3, z: bp.z * 0.6 + (p.idx % 2 ? 3 : -3) * dir });
        break;
      }
      case 'runner': {
        const c = carrier!;
        const side = sideOf(c.p.z, team);
        p.target = inField({ x: dir * clamp(c.p.x * dir + 9, -4, 15.5), z: side * 5.5 * (p.idx % 2 ? 1 : -1) });
        break;
      }
      case 'presser': {
        const c = carrier!;
        p.target = { x: c.p.x + c.v.x * 0.25, z: c.p.z + c.v.z * 0.25 };
        const d = dist(p.p, c.p);
        if (!trySkill(m, p, 'defend') && d < p.attr.radius + c.attr.radius + 0.55 && p.tackleCd <= 0 && m.rng.chance(0.4 + p.spec.personality.aggression * 0.4)) m.tackle(p, c);
        break;
      }
      case 'marker': {
        // Stand between the most dangerous free attacker and our goal.
        const threats = opps.filter((o) => o.id !== ball.owner && !markedAttackers.has(o.id)).sort((a, b) => dist(a.p, own) - dist(b.p, own));
        const t = star && star.id !== ball.owner ? star : threats[0];
        if (t) {
          markedAttackers.add(t.id);
          const d = dist(t.p, own) || 1;
          p.target = { x: t.p.x + ((own.x - t.p.x) / d) * 1.6, z: t.p.z + ((own.z - t.p.z) / d) * 1.6 };
        } else p.target = { x: (bp.x + own.x) / 2, z: bp.z * 0.5 };
        if (carrier && dist(p.p, carrier.p) < 5) trySkill(m, p, 'defend');
        break;
      }
      case 'chaser': {
        // Meet the ball where it will be, not where it is (or wait for a pass played off the boards).
        const lead = clamp(dist(p.p, bp) / Math.max(1, p.attr.pace), 0.3, 1);
        if (ball.passHold && ball.passTo === p.id) p.target = { ...p.p };
        else p.target = inField({ x: bp.x + ball.v.x * lead, z: bp.z + ball.v.z * lead });
        break;
      }
      default:
        p.target = inField({ x: dir * clamp(ballU - 4 - p.idx * 2, -14, 12), z: (p.idx - 1.5) * 4 * dir });
    }
    if (p.role !== 'carrier' && p.role !== 'keeper' && p.role !== 'presser' && p.role !== 'marker') trySkill(m, p, 'any');
  }
  comboTargets(m, team);
  cultureTargets(m, team);
}

/** The keeper reads the shot (straight-line prediction: curling shots fool it) and dives. */
function keeperReact(m: Match, p: Player): void {
  const b = m.ball;
  if (!b.shot || m.players[b.shot.by].team === p.team || p.state !== 'play') return;
  const gx = m.ownGoal(p.team).x;
  if (Math.sign(b.v.x) !== Math.sign(gx - b.p.x) || Math.abs(b.v.x) < 1) return;
  const t = (gx - b.p.x) / b.v.x;
  if (t < 0 || t > 1.1) return;
  const zc = b.p.z + b.v.z * t;
  const target = { x: gx - Math.sign(gx) * 0.5, z: clamp(zc, -FIELD.goalHalfW - 0.3, FIELD.goalHalfW + 0.3) };
  const d = dist(p.p, target);
  if (d < 0.5) return;
  // Reaction: better defenders read it sooner; beam shots are almost too fast to see.
  const react = 0.18 - p.attr.defense * 0.12 + (b.shot.kind === 'beamShot' ? 0.15 : 0);
  if (m.t - b.shot.t < react) return;
  p.state = 'dive';
  p.stateT = 0.55;
  const sp = p.attr.pace * 1.5 + 2;
  p.v.x = ((target.x - p.p.x) / d) * sp;
  p.v.z = ((target.z - p.p.z) / d) * sp;
  const yc = b.p.y + b.v.y * t - 9 * t * t;
  p.vy = clamp(yc * 3, 0, 4 + p.attr.jump * 3);
}

function decideCarrier(m: Match, p: Player): void {
  const ts = m.teams[p.team];
  if (ts.chain > 0 && ts.chainTo === p.id) return; // a combo chain decides this touch
  if (ts.cChain > 0 && ts.cChainTo === p.id) return; // so does a culture pass chain
  if (ts.cQueue.length) {
    // Culture dribble burst: straight at goal, the kick follows (culture.ts).
    const g = m.attackGoal(p.team);
    p.target = { x: g.x, z: p.p.z * 0.6 };
    return;
  }
  if (p.state !== 'play' || p.pending || p.kickCd > 0) {
    p.target = { x: p.p.x + p.face.x * 2, z: p.p.z + p.face.z * 2 };
    return;
  }
  const dir = dirOf(p.team);
  const goal = m.attackGoal(p.team);
  const opps = m.opponents(p).filter((o) => !m.isDisabled(o));
  const press = m.pressure(p);
  const dGoal = dist(p.p, goal);
  const chaos = p.attr.tags.includes('chaos') ? 0.35 : p.spec.personality.chaos * 0.2;
  const noise = () => m.rng.range(-chaos, chaos);

  // --- special moves on the ball ---
  if (dGoal < 18 && trySkill(m, p, 'shoot')) return;
  if (press > 0.45 && trySkill(m, p, 'carry')) return;
  if (press > 0.6 && trySkill(m, p, 'any')) return;

  // --- shot ---
  const keeper = opps.find((o) => o.role === 'keeper');
  const kz = keeper ? keeper.p.z : 0;
  const aimZ = -sideOf(kz, p.team) * (FIELD.goalHalfW - 0.55 - m.rng.range(0, 0.9));
  const shotTarget = { x: goal.x + dir * 0.4, z: aimZ };
  let blockers = 0;
  for (const o of opps) if (o.role !== 'keeper' && segDist(o.p, p.p, shotTarget) < 0.9) blockers++;
  const angle = Math.abs(p.p.z) / Math.max(1, Math.abs(goal.x - p.p.x));
  let shootScore = dGoal < 7 ? 0.95 : dGoal < 12 ? 0.6 : dGoal < 16 ? 0.25 : 0;
  shootScore *= 1 - blockers * 0.3 - clamp(angle - 0.8, 0, 1) * 0.6;
  shootScore += p.spec.personality.aggression * 0.15 + noise();

  // --- passes ---
  let bestPass: { score: number; k: Kick } | null = null;
  for (const t of m.teamOf(p.team)) {
    if (t.id === p.id || m.isDisabled(t)) continue;
    const lead = { x: t.p.x + t.v.x * 0.45, z: t.p.z + t.v.z * 0.45 };
    const d = dist(p.p, lead);
    if (d < 2.5 || d > 24) continue;
    let clear = 9;
    for (const o of opps) clear = Math.min(clear, segDist(o.p, p.p, lead));
    let open = 9;
    for (const o of opps) open = Math.min(open, dist(o.p, lead));
    const gain = ((lead.x - p.p.x) * dir) / 10;
    const lob = clear < 1.1 && d > 6;
    let score = 0.25 + gain + clamp(open / 6, 0, 0.6) - (clear < 1.1 && !lob ? 0.8 : 0) - (lob ? 0.15 : 0) + noise();
    if (t.role === 'keeper' || t.role === 'anchor') score -= 0.25;
    if (t.role === 'runner' && (lead.x * dir) > 8) score += 0.2;
    const speed = clamp(8 + d * 0.55, 9, 19);
    if (!bestPass || score > bestPass.score) bestPass = { score, k: { kind: 'pass', target: lead, speed, loft: lob ? 0.65 : 0, spin: 0, shot: 'normal', to: t.id } };
  }

  // --- dribble ---
  const dribbleScore = 0.4 + p.attr.control * 0.3 - press * 0.55 + noise() + (dGoal > 14 ? 0.1 : 0);

  if (shootScore > 0.4 && shootScore >= (bestPass?.score ?? -1) && shootScore >= dribbleScore) {
    m.kick(p, { kind: 'shot', target: shotTarget, speed: m.shotSpeed(p), loft: 0, spin: 0, shot: 'normal', to: -1 });
    return;
  }
  if (bestPass && bestPass.score > dribbleScore) {
    m.kick(p, bestPass.k);
    return;
  }
  // Dribble toward goal, steering away from nearby defenders.
  let vx = goal.x - p.p.x, vz = goal.z - p.p.z;
  const l = Math.hypot(vx, vz) || 1;
  vx /= l;
  vz /= l;
  for (const o of opps) {
    const dx = p.p.x - o.p.x, dz = p.p.z - o.p.z, d = Math.hypot(dx, dz);
    if (d < 4 && d > 0.01) {
      vx += (dx / d) * (4 - d) * 0.35;
      vz += (dz / d) * (4 - d) * 0.5;
    }
  }
  const vl = Math.hypot(vx, vz) || 1;
  p.target = inField({ x: p.p.x + (vx / vl) * 4, z: p.p.z + (vz / vl) * 4 });
  // Cornered against the boards near goal: just hit it.
  if (dGoal < 9 && press > 0.7) m.kick(p, { kind: 'shot', target: shotTarget, speed: m.shotSpeed(p), loft: 0.1, spin: 0, shot: 'normal', to: -1 });
}

/** Desired velocity toward the player's target, with team spacing. */
export function steer(m: Match, p: Player, maxSpeed: number): V2 {
  let dx = p.target.x - p.p.x, dz = p.target.z - p.p.z;
  const d = Math.hypot(dx, dz);
  let speed = maxSpeed * clamp(d / 1.6, 0, 1);
  if (p.role === 'keeper' || p.role === 'anchor') speed *= 0.9;
  if (d > 1e-3) {
    dx /= d;
    dz /= d;
  }
  // Spread out: teammates push each other apart so the team doesn't become one blob.
  if (m.ball.owner !== p.id) {
    for (let i = 0; i < TEAM_SIZE; i++) {
      const o = m.players[p.team * TEAM_SIZE + i];
      if (o.id === p.id) continue;
      const ox = p.p.x - o.p.x, oz = p.p.z - o.p.z, od = Math.hypot(ox, oz);
      if (od < 3 && od > 1e-3) {
        dx += (ox / od) * (3 - od) * 0.35;
        dz += (oz / od) * (3 - od) * 0.35;
      }
    }
  }
  const l = Math.hypot(dx, dz) || 1;
  return { x: (dx / l) * speed, z: (dz / l) * speed };
}
