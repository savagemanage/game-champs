/**
 * Minion wave simulation for the original three-lane arena: wave composition and cadence,
 * super minions after an inhibitor falls, per-type base stats, and pure lane
 * navigation.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so it can be
 * exhaustively unit tested in a plain jsdom/node environment. It builds on the
 * pure geometry in {@link ./map} and the reward tables in {@link ./economy}.
 */

import type { GameMode } from '../battleStore';
import { rulesForMode } from '../../config/matchRules';
import {
  type Lane,
  type MapSide,
  type Vec2,
  laneWaypoints,
  pathLength,
  pointAlongPath,
  distance,
  nextWaypoint,
} from './map';
import {
  type Bounty,
  type MinionType,
  minionBounty,
} from './economy';

export type { MinionType } from './economy';

// ---------------------------------------------------------------------------
// Wave scheduling
// ---------------------------------------------------------------------------

/** Seconds before the first three-lane wave; sourced from the match rules. */
export const FIRST_WAVE_DELAY = rulesForMode('conquest').waves.firstWaveSeconds;

/** Seconds between three-lane waves; sourced from the match rules. */
export const WAVE_INTERVAL_SECONDS = rulesForMode('conquest').waves.intervalSeconds;

/** Milliseconds between units in a three-lane wave. */
export const WAVE_UNIT_STAGGER_MS = rulesForMode('conquest').waves.unitStaggerMilliseconds;

/**
 * How many waves in a super-cycle before a siege (cannon) minion joins. Early
 * game a siege minion arrives every third wave for a readable opening cadence.
 */
export const SIEGE_EVERY_N_WAVES = 3;

/** Number of melee minions in a standard wave. */
export const MELEE_PER_WAVE = 3;

/** Number of caster minions in a standard wave. */
export const CASTER_PER_WAVE = 3;

/**
 * The wave number (1-based) that has spawned by `elapsedSeconds`, or 0 before
 * the first wave. Wave 1 spawns at {@link FIRST_WAVE_DELAY}; each later wave is
 * {@link WAVE_INTERVAL_SECONDS} apart.
 */
export function nextWaveNumberAt(
  elapsedSeconds: number,
  mode: GameMode = 'conquest',
): number {
  const timing = rulesForMode(mode).waves;
  if (elapsedSeconds < timing.firstWaveSeconds) return 0;
  return 1 + Math.floor(
    (elapsedSeconds - timing.firstWaveSeconds) / timing.intervalSeconds,
  );
}

/** The exact spawn time (seconds) for a given 1-based wave number. */
export function waveSpawnTime(
  waveNumber: number,
  mode: GameMode = 'conquest',
): number {
  const n = Math.max(1, Math.floor(waveNumber));
  const timing = rulesForMode(mode).waves;
  return timing.firstWaveSeconds + (n - 1) * timing.intervalSeconds;
}

/**
 * The ordered list of minion types in wave `waveNumber` (1-based). Every wave
 * has {@link MELEE_PER_WAVE} melee then {@link CASTER_PER_WAVE} caster minions;
 * every {@link SIEGE_EVERY_N_WAVES}th wave appends a siege (cannon) minion.
 *
 * Super minions are NOT part of the base composition; they are added per lane
 * via {@link superMinionsFor} when the enemy inhibitor for that lane is down.
 */
export function waveComposition(waveNumber: number): MinionType[] {
  const n = Math.max(1, Math.floor(waveNumber));
  const wave: MinionType[] = [];
  for (let i = 0; i < MELEE_PER_WAVE; i++) wave.push('melee');
  for (let i = 0; i < CASTER_PER_WAVE; i++) wave.push('caster');
  if (n % SIEGE_EVERY_N_WAVES === 0) wave.push('siege');
  return wave;
}

/**
 * The extra super minions added to a wave for a lane. Destroying an enemy
 * inhibitor causes a super minion to spawn in that lane; if this lane's inhibitor and others are down the effect compounds, but the canonical
 * rule modeled here is one super minion per destroyed inhibitor in the lane.
 *
 * @param inhibitorsDown number of destroyed enemy inhibitors affecting the lane
 * @returns an array of 'super' minion types (empty when no inhibitor is down)
 */
export function superMinionsFor(inhibitorsDown: number): MinionType[] {
  const count = Math.max(0, Math.floor(inhibitorsDown));
  return Array.from({ length: count }, () => 'super' as MinionType);
}

/**
 * The full composition for a lane's wave, including any super minions granted
 * by a downed enemy inhibitor. Super minions lead the wave.
 */
export function laneWaveComposition(
  waveNumber: number,
  inhibitorsDown: number,
): MinionType[] {
  return [...superMinionsFor(inhibitorsDown), ...waveComposition(waveNumber)];
}

// ---------------------------------------------------------------------------
// Minion base stats
// ---------------------------------------------------------------------------

/** Static combat/movement profile for a minion archetype. */
export interface MinionStats {
  type: MinionType;
  hp: number;
  ad: number;
  armor: number;
  moveSpeed: number;
  attackRange: number;
  bounty: Bounty;
}

/**
 * Base stats per minion type. Values rise from melee -> caster (ranged, softer)
 * -> siege (beefy, high range) -> super (strongest). The
 * bounty is sourced from the shared economy table so rewards stay in one place.
 */
export const MINION_STATS: Record<MinionType, MinionStats> = {
  melee: {
    type: 'melee',
    hp: 477,
    ad: 12,
    armor: 0,
    moveSpeed: 325,
    attackRange: 111,
    bounty: minionBounty('melee'),
  },
  caster: {
    type: 'caster',
    hp: 296,
    ad: 23,
    armor: 0,
    moveSpeed: 325,
    attackRange: 550,
    bounty: minionBounty('caster'),
  },
  siege: {
    type: 'siege',
    hp: 912,
    ad: 40,
    armor: 0,
    moveSpeed: 325,
    attackRange: 300,
    bounty: minionBounty('siege'),
  },
  super: {
    type: 'super',
    hp: 1600,
    ad: 190,
    armor: 30,
    moveSpeed: 350,
    attackRange: 170,
    bounty: minionBounty('super'),
  },
};

/** Base stats for a minion of the given type. */
export function minionStats(type: MinionType): MinionStats {
  return MINION_STATS[type];
}

// ---------------------------------------------------------------------------
// Lane navigation
// ---------------------------------------------------------------------------

/** A minion walking a lane path: its type, team, position, and progress. */
export interface Minion {
  type: MinionType;
  team: MapSide;
  lane: Lane;
  pos: Vec2;
  /** Index of the waypoint this minion is currently walking toward. */
  waypointIndex: number;
  /** Total distance travelled along the lane path so far, in world units. */
  distanceTravelled: number;
}

/**
 * Spawn a fresh minion at the start of its team's lane path.
 */
export function spawnMinion(type: MinionType, team: MapSide, lane: Lane): Minion {
  const path = laneWaypoints(lane, team);
  const start = path[0] ?? { x: 0, y: 0 };
  return {
    type,
    team,
    lane,
    pos: { x: start.x, y: start.y },
    waypointIndex: 1,
    distanceTravelled: 0,
  };
}

/** Result of advancing a minion one tick along its lane. */
export interface AdvanceResult {
  pos: Vec2;
  waypointIndex: number;
  distanceTravelled: number;
  /** True once the minion has reached the end of its lane path. */
  atEnd: boolean;
}

/**
 * Walk a minion along `path` by `moveSpeed * dt` world units, returning its new
 * position, the index of the next waypoint it heads toward, its cumulative
 * distance, and whether it has reached the path end. Pure: does not mutate the
 * input minion (callers apply the returned fields).
 *
 * Reuses {@link pointAlongPath} and {@link nextWaypoint} from the map module.
 */
export function advanceMinion(minion: Minion, path: readonly Vec2[], dt: number): AdvanceResult {
  const speed = MINION_STATS[minion.type].moveSpeed;
  const total = pathLength(path);
  const travelled = Math.min(total, minion.distanceTravelled + Math.max(0, speed * dt));
  const pos = pointAlongPath(path, travelled);

  // Determine which waypoint the minion is now heading toward by measuring the
  // cumulative distance to each waypoint.
  let acc = 0;
  let idx = path.length - 1;
  for (let i = 1; i < path.length; i++) {
    acc += distance(path[i - 1], path[i]);
    if (travelled < acc - 1e-6) {
      idx = i;
      break;
    }
  }
  const atEnd = travelled >= total - 1e-6;
  const waypointIndex = atEnd ? path.length - 1 : nextWaypoint(path, idx - 1);

  return { pos, waypointIndex, distanceTravelled: travelled, atEnd };
}
