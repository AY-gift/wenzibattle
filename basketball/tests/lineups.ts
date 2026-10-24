/** Test lineups built from synthetic glyph shapes (Node has no canvas). */
import { hashString } from '@shared/core/rng';
import type { FighterSpec } from '@shared/core/StatGenerator';
import { buildTeam, type TeamHow, type TeamInput } from '@shared/sports/team';
import { SHAPES, specFor } from '@shared-tests/helpers';
import { Match } from '../src/sim/Match';
import { TEAM_SIZE } from '../src/sim/types';

const SHAPE_NAMES = Object.keys(SHAPES) as (keyof typeof SHAPES)[];

export function team(how: TeamHow, value: string | string[]): { input: TeamInput; specs: FighterSpec[] } {
  const t = buildTeam(how, value, TEAM_SIZE);
  if (!t.ok) throw new Error(`bad team ${JSON.stringify(value)}: ${t.reason}`);
  const specs = t.members.map((m) => specFor(m, SHAPE_NAMES[hashString(m) % SHAPE_NAMES.length]));
  return { input: t, specs };
}

export function match(a: ReturnType<typeof team>, b: ReturnType<typeof team>, seed: number): Match {
  return new Match([a.specs, b.specs], [a.input, b.input], seed);
}
