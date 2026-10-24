/**
 * Arena-style fighting on the pitch. There is no referee, so now and then a glyph forgets the
 * ball and simply attacks an opponent with its ARENA move (same name as in the boxing ring):
 * 升龙拳 launches, flying kicks send people across the grass, throws toss them behind,
 * stomps shake everyone nearby, roars blow them back.
 *  - Revenge: whoever tackled or flattened you may get it back for a few seconds.
 *  - Scuffles: two opponents bumping into each other away from the ball.
 *  - 乱斗时刻: at most once a match, a big knock-down can turn into a 4 s brawl around that spot.
 * Every attack has a wind-up, can be dodged (the attacker then stumbles), and a carrier who gets
 * hit loses the ball — it all goes through the normal simulation, nothing is scripted.
 */
import type { MoveKind } from '@shared/core/SignatureMoves';
import { type Player, type V2 } from './types';
import type { Match } from './Match';

export type FightStyle = 'combo' | 'uppercut' | 'flyingKick' | 'throw' | 'slam' | 'spin' | 'roar' | 'freeze';

/** Which arena move kinds fight how (the visual + mechanical identity of the character). */
export function fightStyleOf(kind: MoveKind): FightStyle {
  switch (kind) {
    case 'uppercut':
    case 'giant':
    case 'mountain':
    case 'beam':
      return 'uppercut';
    case 'kick':
    case 'charge':
    case 'fireCharge':
    case 'rage':
    case 'feint':
    case 'sweep':
      return 'flyingKick';
    case 'throw':
    case 'magnet':
    case 'blame':
    case 'swallow':
      return 'throw';
    case 'quake':
    case 'giantFall':
    case 'topple':
    case 'laughQuake':
    case 'meteor':
    case 'drop':
      return 'slam';
    case 'whirlwind':
    case 'clones':
      return 'spin';
    case 'roar':
    case 'joke':
    case 'lecture':
    case 'confuse':
    case 'poison':
      return 'roar';
    case 'freeze':
    case 'glare':
      return 'freeze';
    default:
      return 'combo';
  }
}

const REACH: Record<FightStyle, number> = { combo: 1.7, uppercut: 1.7, flyingKick: 6, throw: 1.6, slam: 2.6, spin: 2.2, roar: 4.5, freeze: 3 };
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Start an attack on `t`. Returns false when it can't happen now. */
export function fight(m: Match, p: Player, t: Player, reason: 'revenge' | 'scuffle' | 'brawl'): boolean {
  if (m.phase !== 'play' || p.fightCd > 0 || p.state !== 'play' || m.isDisabled(t) || t.team === p.team) return false;
  const ts = m.teams[p.team];
  // 风平浪静 / 世界和平 style calm teams don't start fights.
  if (ts.peaceT > 0 && reason !== 'brawl') return false;
  const style = fightStyleOf(p.spec.signature.kind);
  if (dist(p.p, t.p) > REACH[style] + p.attr.radius + t.attr.radius) return false;
  const windup = style === 'slam' ? 0.35 : style === 'flyingKick' ? 0.2 : 0.28;
  p.fightCd = reason === 'brawl' ? 1.8 : 16 + m.rng.range(0, 8);
  // Getting even is satisfying: the grudge is settled either way.
  if (reason === 'revenge') p.grudgeT = 0;
  p.state = 'skill';
  p.stateT = windup + 0.25;
  p.pending = null;
  // Face the victim.
  const dx = t.p.x - p.p.x, dz = t.p.z - p.p.z, d = Math.hypot(dx, dz) || 1;
  p.face = { x: dx / d, z: dz / d };
  p.v = { x: 0, z: 0 };
  m.emit('fight', p.team, p.id, { b: t.id, kind: style, label: p.spec.signature.kind });
  m.later(windup, () => impact(m, p, t, style));
  return true;
}

function impact(m: Match, p: Player, t: Player, style: FightStyle): void {
  if (m.phase !== 'play' || m.isDisabled(p)) return;
  const victims = (r: number, cone = false): Player[] =>
    m.opponents(p).filter((o) => {
      const d = dist(o.p, p.p);
      if (d > r + o.attr.radius || m.isDisabled(o)) return false;
      if (!cone) return true;
      return ((o.p.x - p.p.x) * p.face.x + (o.p.z - p.p.z) * p.face.z) / (d || 1) > 0.4;
    });
  // Flying kick: the attacker launches itself at the target first.
  if (style === 'flyingKick') {
    const dx = t.p.x - p.p.x, dz = t.p.z - p.p.z, d = Math.hypot(dx, dz) || 1;
    const reach = Math.max(0, d - (p.attr.radius + t.attr.radius) * 0.9);
    p.p.x += (dx / d) * reach;
    p.p.z += (dz / d) * reach;
    p.v = { x: (dx / d) * 4, z: (dz / d) * 4 };
    p.vy = 3;
  }
  if (style === 'slam') {
    p.vy = 5;
    m.later(0.4, () => {
      let n = 0;
      for (const o of victims(REACH.slam)) if (m.knockDown(o, p, 0.9, 6)) n++;
      landed(m, p, null, n);
    });
    return;
  }
  if (style === 'spin' || style === 'roar') {
    let n = 0;
    for (const o of victims(REACH[style], style === 'roar')) if (m.knockDown(o, p, style === 'roar' ? 0.8 : 0.9, style === 'roar' ? 8 : 5)) n++;
    landed(m, p, null, n);
    return;
  }
  // Single-target styles: the victim may dodge.
  const reach = (style === 'flyingKick' ? 1.4 : REACH[style]) + p.attr.radius + t.attr.radius;
  if (dist(p.p, t.p) > reach || m.isDisabled(t)) {
    whiff(m, p, t);
    return;
  }
  const dodge = 0.12 + t.attr.control * 0.25 + (t.attr.tags.includes('ghost') ? 0.2 : 0);
  if (m.rng.chance(dodge)) {
    whiff(m, p, t);
    return;
  }
  let ok = false;
  switch (style) {
    case 'combo':
      ok = m.knockDown(t, p, 0.9, 5);
      break;
    case 'uppercut':
      ok = m.knockDown(t, p, 1.3, 2);
      if (ok) t.vy = 9;
      break;
    case 'flyingKick':
      ok = m.knockDown(t, p, 1.1, 10);
      break;
    case 'throw': {
      ok = m.knockDown(t, p, 1.0, 1);
      if (ok) {
        // Over the shoulder: the victim lands behind the thrower.
        t.p = { x: p.p.x - p.face.x * 2.2, z: p.p.z - p.face.z * 2.2 };
        t.vy = 6;
      }
      break;
    }
    case 'freeze':
      ok = m.disable(t, 'freeze', 1.4, p);
      break;
  }
  landed(m, p, ok ? t : null, ok ? 1 : 0);
}

function landed(m: Match, p: Player, t: Player | null, n: number): void {
  if (n <= 0) {
    m.emit('fightMiss', p.team, p.id, { b: t?.id });
    return;
  }
  p.stats.fights += n;
  m.emit('fightHit', p.team, p.id, { b: t?.id, v: n });
}

/** Whiffed: the attacker overbalances (a short stumble — the arena's comedy rule). */
function whiff(m: Match, p: Player, t: Player): void {
  m.emit('fightMiss', p.team, p.id, { b: t.id });
  if (m.rng.chance(0.5)) m.setState(p, 'down', 0.5);
}

/** A knock-down may spark the match's one brawl. */
export function maybeStartBrawl(m: Match, victim: Player): void {
  if (m.brawlsLeft <= 0 || m.brawl || m.phase !== 'play' || m.clock < 20) return;
  const near = m.players.filter((o) => dist(o.p, victim.p) < 6).length;
  if (near < 3 || !m.rng.chance(0.035)) return;
  m.brawlsLeft--;
  m.brawl = { x: victim.p.x, z: victim.p.z, t: 4 };
  m.emit('brawl', victim.team, victim.id);
}

/** Called every step while the ball is in play. */
export function brawlStep(m: Match, dt: number): void {
  const b = m.brawl;
  if (b) {
    b.t -= dt;
    if (b.t <= 0) {
      m.brawl = null;
      m.emit('brawlEnd', 0, -1);
    }
  }
  // Decisions are made at the team-AI rate.
  if (m.steps % 6 !== 3) return;
  for (const p of m.players) {
    if (p.state !== 'play' || p.fightCd > 0) continue;
    const opps = m.opponents(p).filter((o) => !m.isDisabled(o));
    if (b && dist(p.p, b) < 7 && p.role !== 'keeper') {
      const t = opps.sort((x, y) => dist(x.p, p.p) - dist(y.p, p.p))[0];
      if (t) {
        p.target = { x: t.p.x, z: t.p.z };
        fight(m, p, t, 'brawl');
      }
      continue;
    }
    const aggr = p.spec.personality.aggression + (p.attr.tags.includes('angry') ? 0.4 : 0);
    if (p.grudgeT > 0 && p.grudge >= 0) {
      const t = m.players[p.grudge];
      // The grudge was only kept by glyphs that decided to settle it (see holdGrudge).
      fight(m, p, t, 'revenge');
      continue;
    }
    // Off-ball scuffle.
    const ball = { x: m.ball.p.x, z: m.ball.p.z };
    if (dist(p.p, ball) < 4 || !m.rng.chance(0.002 + aggr * 0.004)) continue;
    const t = opps.find((o) => dist(o.p, p.p) < 1.6 + p.attr.radius + o.attr.radius && dist(o.p, ball) > 3);
    if (t) fight(m, p, t, 'scuffle');
  }
}

/** Called when `p` gets flattened / robbed by `by`: hot-headed glyphs remember it for a few seconds. */
export function holdGrudge(m: Match, p: Player, by: Player): void {
  if (by.team === p.team) return;
  const aggr = p.spec.personality.aggression + (p.attr.tags.includes('angry') ? 0.4 : 0);
  if (!m.rng.chance(0.12 + aggr * 0.25)) return;
  p.grudge = by.id;
  p.grudgeT = 6;
}
