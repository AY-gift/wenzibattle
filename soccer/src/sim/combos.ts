/**
 * Team combos (成语连携). A team whose players spell a registered idiom gets one team move
 * (shared/src/sports/combos.ts). Each has a trigger condition, a cooldown and a real effect in
 * the simulation — scripted passing chains still use real kicks that can be intercepted.
 */
import { FIELD, MATCH_TIME, type Player, type TeamState, type V2 } from './types';
import { dirOf, sideOf, type Match } from './Match';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
const MAX_USES = 5;

function fire(m: Match, team: 0 | 1, ts: TeamState, by: number, active: number, cooldown: number): void {
  ts.comboT = active;
  ts.comboCd = cooldown;
  ts.comboUses++;
  m.emit('combo', team, by, { kind: ts.combo!.kind });
}

/** Per step: timers, passive bookkeeping, chained passes. */
export function comboStep(m: Match, team: 0 | 1, dt: number): void {
  const ts = m.teams[team];
  if (!ts.combo) return;
  ts.comboCd = Math.max(0, ts.comboCd - dt);
  if (ts.comboT > 0) {
    ts.comboT -= dt;
    if (ts.comboT <= 0) m.emit('comboEnd', team, -1, { kind: ts.combo.kind });
  }
  const carrier = m.carrier();
  switch (ts.combo.kind) {
    case 'sleeperShot':
      for (const p of m.teamOf(team)) if (m.ball.owner !== p.id) p.charge += dt;
      break;
    case 'tigerTail':
      if (ts.phaseMarks === 0 && m.clock > 0.5) {
        ts.phaseMarks = 1;
        m.emit('combo', team, -1, { kind: 'tigerTail', v: 1 });
      } else if (ts.phaseMarks === 1 && m.clock > MATCH_TIME - 40) {
        ts.phaseMarks = 2;
        m.emit('combo', team, -1, { kind: 'tigerTail', v: 2 });
      }
      break;
    case 'dragonDance':
    case 'skyHorse':
      // The chained pass reached its man: pass on, or finish.
      if (ts.chain > 0 && carrier && carrier.id === ts.chainTo && carrier.state === 'play' && !carrier.pending) chainNext(m, team, ts, carrier);
      else if (ts.chain > 0 && carrier && carrier.team !== team) ts.chain = 0;
      break;
  }
}

function chainNext(m: Match, team: 0 | 1, ts: TeamState, p: Player): void {
  const goal = m.attackGoal(team);
  const dir = dirOf(team);
  ts.chain--;
  if (ts.chain <= 0 || dist(p.p, goal) < 11) {
    ts.chain = 0;
    ts.chainTo = -1;
    const side = -sideOf(p.p.z, p.team);
    if (ts.combo!.kind === 'dragonDance') {
      const tz = side * (FIELD.goalHalfW + 1.6);
      m.kick(p, { kind: 'shot', target: { x: goal.x, z: tz }, speed: m.shotSpeed(p) + 3, loft: 0.15, spin: -Math.sign(tz) * dir * 15, shot: 'combo', to: -1, fx: 'dragon', label: 'dragonDance', power: false }, 0.08);
    } else {
      m.kick(p, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.9) }, speed: m.shotSpeed(p) + 8, loft: 0, spin: 0, shot: 'combo', to: -1, fx: 'sky', label: 'skyHorse' }, 0.05);
    }
    return;
  }
  const next = forwardMate(m, p);
  if (!next) {
    ts.chain = 0;
    return;
  }
  ts.chainTo = next.id;
  const lead = { x: clamp(next.p.x + dir * 2.5, -FIELD.halfL + 3, FIELD.halfL - 3), z: next.p.z };
  m.kick(p, { kind: 'pass', target: lead, speed: 15, loft: ts.combo!.kind === 'skyHorse' ? 1 : 0.8, spin: 0, shot: 'normal', to: next.id }, 0.06);
}

function forwardMate(m: Match, p: Player): Player | null {
  const dir = dirOf(p.team);
  return (
    m
      .teamOf(p.team)
      .filter((t) => t.id !== p.id && !m.isDisabled(t))
      .sort((a, b) => b.p.x * dir - a.p.x * dir)[0] ?? null
  );
}

/** Called from the team AI every 0.1 s: start a combo when its condition is met. */
export function tryCombo(m: Match, team: 0 | 1): void {
  const ts = m.teams[team];
  if (!ts.combo || ts.comboCd > 0 || ts.comboUses >= MAX_USES || ts.comboT > 0 || ts.chain > 0) return;
  const carrier = m.carrier();
  const ours = carrier && carrier.team === team ? carrier : null;
  const theirs = carrier && carrier.team !== team ? carrier : null;
  const own = m.ownGoal(team);
  const goal = m.attackGoal(team);
  const dir = dirOf(team);
  const mates = m.teamOf(team).filter((p) => !m.isDisabled(p));
  if (!m.rng.chance(0.25)) return;
  switch (ts.combo.kind) {
    case 'dragonDance':
    case 'skyHorse': {
      if (!ours || ours.state !== 'play' || ours.pending || mates.length < 3 || ours.p.x * dir > 8) return;
      const next = forwardMate(m, ours);
      if (!next || (next.p.x - ours.p.x) * dir < 2) return;
      fire(m, team, ts, ours.id, 5, ts.combo.kind === 'dragonDance' ? 32 : 24);
      ts.chain = ts.combo.kind === 'dragonDance' ? 3 : 1;
      ts.chainTo = ours.id;
      chainNext(m, team, ts, ours);
      // Chain counted the first pass already.
      if (ts.combo.kind === 'skyHorse') ts.chain = 1;
      return;
    }
    case 'calmSea':
      if (theirs && dist(theirs.p, own) < 20) fire(m, team, ts, -1, 8, 22);
      return;
    case 'fuelFire':
      if (ours && ts.heat >= 3 && dist(ours.p, goal) < 13 && m.pressure(ours) < 0.7 && ours.state === 'play' && !ours.pending) {
        fire(m, team, ts, ours.id, 0.1, 16);
        const side = -sideOf(ours.p.z, ours.team);
        m.kick(ours, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.7) }, speed: m.shotSpeed(ours) + 6, loft: 0, spin: 0, shot: 'combo', to: -1, fx: 'fire', label: 'fuelFire', power: true }, 0.25);
      }
      return;
    case 'extraFoot': {
      // Right after one of our shots ends near their goal: someone takes a bonus whack at it.
      if (m.ball.owner >= 0 || m.ball.shot || m.t - ts.lastShotT > 1.6 || dist({ x: m.ball.p.x, z: m.ball.p.z }, goal) > 10) return;
      const kicker = mates.filter((p) => dist(p.p, { x: m.ball.p.x, z: m.ball.p.z }) < 4.5).sort((a, b) => dist(a.p, m.ball.p as V2) - dist(b.p, m.ball.p as V2))[0];
      if (!kicker) return;
      fire(m, team, ts, kicker.id, 0.1, 14);
      const b = m.ball;
      const wild = m.rng.chance(0.35);
      const tz = wild ? m.rng.range(-FIELD.halfW, FIELD.halfW) : m.rng.range(-FIELD.goalHalfW + 0.6, FIELD.goalHalfW - 0.6);
      const tx = wild ? goal.x * m.rng.range(0.35, 0.9) : goal.x;
      const dx = tx - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1;
      b.v.x = (dx / d) * 22;
      b.v.z = (dz / d) * 22;
      b.v.y = wild ? 9 : 2.5;
      b.prevKicker = b.lastKicker;
      b.prevKickT = m.t;
      b.lastKicker = kicker.id;
      b.noPickBy = kicker.id;
      b.noPickT = 0.3;
      b.shot = { by: kicker.id, kind: 'bonus', t: m.t, power: false, label: 'extraFoot' };
      kicker.stats.shots++;
      m.emit('bonusKick', team, kicker.id, { v: wild ? 1 : 0 });
      return;
    }
    case 'sleeperShot':
      if (ours && ours.charge >= 22 && dist(ours.p, goal) < 30 && dist(ours.p, goal) > 12 && ours.state === 'play' && !ours.pending) {
        fire(m, team, ts, ours.id, 0.1, 28);
        const side = -sideOf(ours.p.z, ours.team);
        m.kick(ours, { kind: 'shot', target: { x: goal.x, z: side * (FIELD.goalHalfW - 0.8) }, speed: 35, loft: 0, spin: 0, shot: 'combo', to: -1, fx: 'thunder', label: 'sleeperShot', power: true }, 0.4);
      }
      return;
    case 'surround':
      if (theirs && dist(theirs.p, own) < 20 && mates.length >= 3) fire(m, team, ts, -1, 4, 20);
      return;
    case 'henhouse':
      if (theirs && dist(theirs.p, own) < 16) {
        fire(m, team, ts, -1, 4, 25);
        m.chaosT = 4;
      }
      return;
    case 'scramble':
      if (theirs && dist(theirs.p, own) < 14) {
        fire(m, team, ts, -1, 0.5, 25);
        // Shuffle the opponents' positions (the ball goes wherever its carrier lands).
        const opp = m.teamOf(team === 0 ? 1 : 0);
        const spots = opp.map((o) => ({ ...o.p }));
        for (let i = spots.length - 1; i > 0; i--) {
          const j = m.rng.int(0, i);
          [spots[i], spots[j]] = [spots[j], spots[i]];
        }
        opp.forEach((o, i) => {
          o.p = { ...spots[i] };
          o.v = { x: 0, z: 0 };
          o.ghostT = 0.4;
        });
      }
      return;
    case 'lawless':
      if (theirs) fire(m, team, ts, -1, 8, 22);
      return;
    case 'goodLuck':
    case 'tigerTail':
      return; // passive
  }
}

/** While a combo runs, it can take over where the team stands (called at the end of the team AI). */
export function comboTargets(m: Match, team: 0 | 1): void {
  const ts = m.teams[team];
  if (!ts.combo || ts.comboT <= 0) return;
  const dir = dirOf(team);
  const carrier = m.carrier();
  if (ts.combo.kind === 'surround' && carrier && carrier.team !== team) {
    const offs: V2[] = [{ x: 1.2, z: 0 }, { x: -1.2, z: 0 }, { x: 0, z: 1.2 }, { x: 0, z: -1.2 }];
    m.teamOf(team).forEach((p, i) => {
      if (m.isDisabled(p)) return;
      p.target = { x: carrier.p.x + offs[i].x * dir, z: carrier.p.z + offs[i].z * dir };
      p.role = 'presser';
      if (dist(p.p, carrier.p) < p.attr.radius + carrier.attr.radius + 0.6 && p.tackleCd <= 0 && m.rng.chance(0.5)) m.tackle(p, carrier);
    });
  }
  if ((ts.combo.kind === 'dragonDance' || ts.combo.kind === 'skyHorse') && ts.chain > 0) {
    // Everyone not on the ball sprints into the attacking third, spread across the pitch.
    m.teamOf(team).forEach((p, i) => {
      if (p.id === m.ball.owner || m.isDisabled(p)) return;
      p.target = { x: dir * clamp(10 + (i % 2) * 3, -FIELD.halfL + 2, FIELD.halfL - 3), z: (i - 1.5) * 4 * dir };
    });
  }
}
