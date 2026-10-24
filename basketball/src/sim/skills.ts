/**
 * Special moves on the court. Every character keeps its arena move (same name, props, element);
 * shared/src/sports/skills.ts maps it to a sport action and this file decides what that action
 * is in basketball:
 *   powerShot → power dunk (drives at the rim, dunks through people)
 *   curveShot → spin move past the defender, then a layup
 *   beamShot  → laser jumper (fast, flat, hard to block)
 *   skyShot   → sky hook (rainbow arc, unblockable)
 *   dash / blink / decoy, shockwave / disable / steal / rain / cloud, wall / rally — as in football.
 * Each has a context, a cooldown and a per-game limit; every effect goes through the normal
 * physics (a dunk can be stuffed, a sky hook can miss).
 */
import { rerollRandom, type SkillUse, type SportSkill } from '@shared/sports/skills';
import { COURT, type Player, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';
import { shotAction } from './ai';

const MAX_USES = 3;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

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

export function trySkill(m: Match, p: Player, use: SkillUse): boolean {
  if (m.phase !== 'play' || p.skillCd > 0 || p.skillUses >= MAX_USES || !m.canAct(p) || p.state !== 'play' || p.pending) return false;
  const base = p.skill;
  if (base.use !== use && !(base.use === 'any' && use !== 'shoot')) return false;
  if (!m.rng.chance(use === 'shoot' ? 0.45 : 0.25)) return false;
  const s = rerollRandom(base, (a) => m.rng.pick(a));
  const ball = m.ball;
  const carrier = m.carrier();
  const opps = m.opponents(p).filter((o) => !m.isDisabled(o));
  const goal = m.attackHoop(p.team);
  const dHoop = dist(p.p, goal);
  const fx = skillFx(p, s);
  switch (s.kind) {
    // ---------------------------------------------------------------- scoring moves
    case 'powerShot': {
      if (ball.owner !== p.id || dHoop > 7 || dHoop < 1.2) return false;
      begin(m, p, s);
      // Charge at the rim (flattening whoever is in the way), then a power dunk (ai.ts).
      p.boostT = 1.4;
      p.dunkDrive = 1;
      return true;
    }
    case 'curveShot': {
      if (ball.owner !== p.id || dHoop > 6.5) return false;
      const near = opps.slice().sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      if (!near || dist(near.p, p.p) > 2.5) return false;
      begin(m, p, s);
      // Spin past the defender (who stumbles) towards the rim, then lay it in.
      const side = sideOf(p.p.z - near.p.z, p.team);
      const dir = dirOf(p.team);
      p.p.x = clamp(p.p.x + dir * 1.6, -COURT.halfL + 1, COURT.halfL - 1);
      p.p.z = clamp(p.p.z + side * 1.2, -COURT.halfW + 1, COURT.halfW - 1);
      p.ghostT = 0.5;
      if (m.disable(near, 'confuse', 0.8, p)) hit(m, p, near);
      m.later(0.35, () => {
        if (ball.owner === p.id && p.state === 'play') m.act(p, shotAction('layup', { loft: 0.2, care: 0.55, fx, label: s.key }), 0.15);
      });
      return true;
    }
    case 'beamShot': {
      if (ball.owner !== p.id || dHoop > 8.5 || dHoop < 2.5) return false;
      begin(m, p, s);
      m.act(p, shotAction('beam', { loft: -0.25, care: 0.6, fx, label: s.key, power: true }), 0.3);
      return true;
    }
    case 'skyShot': {
      if (ball.owner !== p.id || dHoop > 7.5 || dHoop < 1.5) return false;
      begin(m, p, s);
      m.act(p, shotAction('highArc', { loft: 0.9, care: 1.5, fx, label: s.key }), 0.35);
      return true;
    }
    // ---------------------------------------------------------------- on the ball
    case 'dash':
      if (ball.owner !== p.id) return false;
      begin(m, p, s);
      p.boostT = 1.6;
      p.target = { x: goal.x - dirOf(p.team) * 1.5, z: goal.z };
      return true;
    case 'blink': {
      if (ball.owner !== p.id) return false;
      begin(m, p, s);
      const near = opps.slice().sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      const sideways = near ? sideOf(p.p.z - near.p.z, p.team) : dirOf(p.team);
      const dx = goal.x - p.p.x, dz = goal.z - p.p.z, d = Math.hypot(dx, dz) || 1;
      const step = Math.min(3, Math.max(0, d - 1.8));
      p.p.x = clamp(p.p.x + (dx / d) * step, -COURT.halfL + 1, COURT.halfL - 1);
      p.p.z = clamp(p.p.z + (dz / d) * step + sideways * 0.8, -COURT.halfW + 1, COURT.halfW - 1);
      p.ghostT = 0.7;
      if (near && dist(near.p, p.p) > 2) hit(m, p, near);
      return true;
    }
    case 'decoy': {
      if (ball.owner !== p.id) return false;
      const near = opps.filter((o) => dist(o.p, p.p) < 6);
      if (!near.length) return false;
      begin(m, p, s);
      m.ghost = { x: p.p.x - dirOf(p.team) * 2, z: -p.p.z, t: 1.4 };
      for (const o of near) if (m.disable(o, 'confuse', 1.2, p)) hit(m, p, o);
      return true;
    }
    // ---------------------------------------------------------------- against the carrier
    case 'disable': {
      let t: Player | undefined;
      if (carrier && carrier.team !== p.team && dist(carrier.p, p.p) < 8) t = carrier;
      else if (use !== 'defend') t = opps.filter((o) => dist(o.p, p.p) < 5).sort((a, b) => dist(a.p, p.p) - dist(b.p, p.p))[0];
      if (!t) return false;
      begin(m, p, s);
      if (m.disable(t, s.disable ?? 'freeze', s.disable === 'money' ? 1.8 : 1.5, p)) hit(m, p, t);
      return true;
    }
    case 'steal': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 7) return false;
      begin(m, p, s);
      ball.owner = -1;
      carrier.pending = null;
      if (carrier.state === 'shoot' || carrier.state === 'pass') carrier.state = 'play';
      const dx = p.p.x - ball.p.x, dz = p.p.z - ball.p.z, d = Math.hypot(dx, dz) || 1;
      ball.v.x = (dx / d) * 11;
      ball.v.z = (dz / d) * 11;
      ball.v.y = 3;
      ball.homingTo = p.id;
      ball.noPickBy = carrier.id;
      ball.noPickT = 0.6;
      ball.shot = null;
      hit(m, p, carrier);
      return true;
    }
    case 'rain': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 12) return false;
      begin(m, p, s);
      const at = { x: carrier.p.x + carrier.v.x * 0.5, z: carrier.p.z + carrier.v.z * 0.5 };
      m.zones.push({ team: p.team, x: at.x, z: at.z, r: 2, t: 0.9, kind: 'rain' });
      m.later(0.7, () => {
        for (const o of m.opponents(p)) if (dist(o.p, at) < 2 && m.knockDown(o, null, 0.9, 3)) hit(m, p, o);
      });
      return true;
    }
    case 'cloud': {
      if (!carrier || carrier.team === p.team || dist(carrier.p, p.p) > 9) return false;
      begin(m, p, s);
      m.zones.push({ team: p.team, x: carrier.p.x, z: carrier.p.z, r: 2.6, t: 4, kind: 'cloud' });
      hit(m, p, carrier);
      return true;
    }
    // ---------------------------------------------------------------- team / defence
    case 'wall': {
      const own = m.ownHoop(p.team);
      if (dist(p.p, own) > 5 || !carrier || carrier.team === p.team || dist(carrier.p, own) > 8) return false;
      begin(m, p, s);
      p.wallT = 3.5;
      return true;
    }
    case 'rally': {
      const behind = m.score[p.team] < m.score[p.team === 0 ? 1 : 0];
      if (!behind && m.clock < 20) return false;
      begin(m, p, s);
      for (const t of m.teamOf(p.team)) t.rallyT = 5;
      return true;
    }
    case 'shockwave': {
      const range = s.cone ? 4.5 : 3.2;
      const near = opps.filter((o) => {
        const d = dist(o.p, p.p);
        if (d > range) return false;
        if (!s.cone) return true;
        return ((o.p.x - p.p.x) * p.face.x + (o.p.z - p.p.z) * p.face.z) / (d || 1) > 0.4;
      });
      const hasCarrier = near.some((o) => o.id === ball.owner);
      const reboundFight = ball.owner < 0 && near.length >= 1 && dist({ x: ball.p.x, z: ball.p.z }, p.p) < 3;
      if (!(hasCarrier || reboundFight || near.length >= 2 || (ball.owner === p.id && near.length >= 1))) return false;
      begin(m, p, s);
      for (const o of near) if (m.knockDown(o, p, 0.85, s.cone ? 6 : 4.5)) hit(m, p, o);
      return true;
    }
  }
  return false;
}
