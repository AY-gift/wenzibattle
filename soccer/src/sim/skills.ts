/**
 * Special moves on the pitch. Every character uses its arena move (same name, same props and
 * element), translated by shared/src/sports/skills.ts into a football action:
 *   shots (power / curl / beam / sky), dash, blink, decoy, shockwave, disable, steal, rain,
 *   gas cloud, wall, rally. Each has a context, a cooldown and a per-match limit, and every
 *   effect goes through the normal physics (a power shot can still be saved; a steal can
 *   still be intercepted).
 */
import { rerollRandom, type SkillUse, type SportSkill } from '@shared/sports/skills';
import { FIELD, type Player, type ShotKind, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';

const MAX_USES = 3;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Ball flavour from the character: element / props first, then the move. */
export function skillFx(p: Player, s: SportSkill): string {
  if (p.attr.element) return p.attr.element;
  if (s.move === 'fireCharge' || p.attr.tags.includes('fire')) return 'fire';
  if (s.move === 'beam') return 'light';
  if (s.move === 'meteor') return 'fire';
  if (s.move === 'freeze' || s.move === 'glare') return 'ice';
  return 'star';
}

function begin(m: Match, p: Player, s: SportSkill): void {
  p.skillCd = 13 + m.rng.range(0, 5);
  p.skillUses++;
  p.stats.skills++;
  m.emit('skill', p.team, p.id, { kind: s.kind, label: s.move });
}

function hit(m: Match, p: Player, target: Player | null): void {
  p.stats.skillHits++;
  m.emit('skillHit', p.team, p.id, { b: target?.id, kind: p.skill.kind });
}

/** Try the player's special move in this situation. Returns true if it fired. */
export function trySkill(m: Match, p: Player, use: SkillUse): boolean {
  if (m.phase !== 'play' || p.skillCd > 0 || p.skillUses >= MAX_USES || !m.canAct(p) || p.state !== 'play') return false;
  const base = p.skill;
  if (base.use !== use && !(base.use === 'any' && use !== 'shoot')) return false;
  // Not on every chance — keeps moves special and matches varied.
  if (!m.rng.chance(use === 'shoot' ? 0.55 : 0.3)) return false;
  // 随便 / ガチャ: a different move each time (each case below still checks its own conditions).
  const s = rerollRandom(base, (a) => m.rng.pick(a));
  const ball = m.ball;
  const carrier = m.carrier();
  const opps = m.opponents(p).filter((o) => !m.isDisabled(o));
  const dir = dirOf(p.team);
  const goal = m.attackGoal(p.team);
  switch (s.kind) {
    // ---------------------------------------------------------------- shots
    case 'powerShot':
    case 'curveShot':
    case 'beamShot':
    case 'skyShot': {
      if (ball.owner !== p.id) return false;
      const d = dist(p.p, goal);
      const maxD = s.kind === 'skyShot' ? 24 : s.kind === 'beamShot' ? 21 : 18;
      if (d > maxD || d < 3) return false;
      begin(m, p, s);
      const keeper = opps.find((o) => o.role === 'keeper');
      const side = -sideOf(keeper ? keeper.p.z : 0, p.team);
      const base = m.shotSpeed(p);
      const fx = skillFx(p, s);
      if (s.kind === 'curveShot') {
        // Aim outside the post and let it curl back in: keepers read the straight line.
        const tz = side * (FIELD.goalHalfW + 1.8);
        const spin = -Math.sign(tz) * dir * 15;
        m.kick(p, { kind: 'shot', target: { x: goal.x, z: tz }, speed: base + 4, loft: 0.05, spin, shot: 'curveShot', to: -1, fx, power: false }, 0.25);
      } else if (s.kind === 'beamShot') {
        m.kick(p, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.8) }, speed: 36, loft: 0, spin: 0, shot: 'beamShot', to: -1, fx }, 0.35);
      } else if (s.kind === 'skyShot') {
        m.kick(p, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 1.2) }, speed: 24, loft: 0.75, spin: 0, shot: 'skyShot', to: -1, fx }, 0.3);
      } else {
        m.kick(p, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.7) }, speed: base + 11, loft: 0, spin: 0, shot: 'powerShot', to: -1, fx }, 0.3);
      }
      return true;
    }
    // ---------------------------------------------------------------- on the ball
    case 'dash':
      if (ball.owner !== p.id) return false;
      begin(m, p, s);
      p.boostT = 1.8;
      return true;
    case 'blink': {
      if (ball.owner !== p.id) return false;
      begin(m, p, s);
      const near = opps.slice().sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      const sideways = near ? sideOf(p.p.z - near.p.z, p.team) : dir;
      p.p.x = clamp(p.p.x + dir * 4.5, -FIELD.halfL + 1.5, FIELD.halfL - 1.5);
      p.p.z = clamp(p.p.z + sideways * 1.5, -FIELD.halfW + 1, FIELD.halfW - 1);
      p.ghostT = 0.7;
      if (near && dist(near.p, p.p) > 2) hit(m, p, near);
      return true;
    }
    case 'decoy': {
      if (ball.owner !== p.id) return false;
      const near = opps.filter((o) => dist(o.p, p.p) < 7);
      if (!near.length) return false;
      begin(m, p, s);
      for (const o of near) if (m.disable(o, 'confuse', 1.4, p)) hit(m, p, o);
      return true;
    }
    // ---------------------------------------------------------------- against the carrier
    case 'disable': {
      let t: Player | undefined;
      if (carrier && carrier.team !== p.team && dist(carrier.p, p.p) < 9) t = carrier;
      else if (use !== 'defend') t = opps.filter((o) => dist(o.p, p.p) < 6).sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      if (!t) return false;
      begin(m, p, s);
      if (m.disable(t, s.disable ?? 'freeze', s.disable === 'money' ? 2.0 : 1.8, p)) hit(m, p, t);
      return true;
    }
    case 'steal': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 8) return false;
      begin(m, p, s);
      ball.owner = -1;
      const dx = p.p.x - ball.p.x, dz = p.p.z - ball.p.z, d = Math.hypot(dx, dz) || 1;
      ball.v.x = (dx / d) * 14;
      ball.v.z = (dz / d) * 14;
      ball.v.y = 3;
      ball.homingTo = p.id;
      ball.noPickBy = carrier.id;
      ball.noPickT = 0.6;
      ball.shot = null;
      hit(m, p, carrier);
      return true;
    }
    case 'rain': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 14) return false;
      begin(m, p, s);
      const at = { x: carrier.p.x + carrier.v.x * 0.5, z: carrier.p.z + carrier.v.z * 0.5 };
      m.zones.push({ team: p.team, x: at.x, z: at.z, r: 2.4, t: 0.9, kind: 'rain' });
      m.later(0.7, () => {
        for (const o of m.opponents(p)) if (dist(o.p, at) < 2.4 && m.knockDown(o, null, 1.0, 3)) hit(m, p, o);
      });
      return true;
    }
    case 'cloud': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 10) return false;
      begin(m, p, s);
      m.zones.push({ team: p.team, x: carrier.p.x, z: carrier.p.z, r: 3.2, t: 4.5, kind: 'cloud' });
      hit(m, p, carrier);
      return true;
    }
    // ---------------------------------------------------------------- team / defence
    case 'wall': {
      const own = m.ownGoal(p.team);
      if (!(p.role === 'keeper' || dist(p.p, own) < 9) || !carrier || carrier.team === p.team || dist(carrier.p, own) > 15) return false;
      begin(m, p, s);
      p.wallT = 3.5;
      return true;
    }
    case 'rally': {
      const behind = m.score[p.team] < m.score[p.team === 0 ? 1 : 0];
      if (!behind && m.clock < 25) return false;
      begin(m, p, s);
      for (const t of m.teamOf(p.team)) t.rallyT = 5;
      return true;
    }
    case 'shockwave': {
      const range = s.cone ? 5 : 3.6;
      const near = opps.filter((o) => {
        const d = dist(o.p, p.p);
        if (d > range) return false;
        if (!s.cone) return true;
        return ((o.p.x - p.p.x) * p.face.x + (o.p.z - p.p.z) * p.face.z) / (d || 1) > 0.45;
      });
      const hasCarrier = near.some((o) => o.id === ball.owner);
      if (!(hasCarrier || near.length >= 2 || (ball.owner === p.id && near.length >= 1))) return false;
      begin(m, p, s);
      for (const o of near) if (m.knockDown(o, p, 0.9, s.cone ? 7 : 5)) hit(m, p, o);
      return true;
    }
  }
  return false;
}

/** For the report: does this shot kind come from a special move? */
export const isSkillShot = (k: ShotKind) => k === 'powerShot' || k === 'curveShot' || k === 'beamShot' || k === 'skyShot';
