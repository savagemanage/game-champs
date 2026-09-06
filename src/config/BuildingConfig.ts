/**
 * BuildingConfig - the per-building tuning table for Frosthold: Last Ember.
 *
 * GameConfig.ts holds the shared *curve* parameters (geometric cost/output
 * growth, base build seconds, max level, Furnace gating). This module holds the
 * per-building *base* numbers those curves are applied to: what a building
 * costs at level 1, how much a producer outputs at level 1, and how the Furnace
 * (the settlement's Ember) gates the rest of the roster.
 *
 * All formulas are pure functions of `(kind, level)` so the economy, building,
 * and save systems can compute costs / outputs / timings deterministically and
 * unit-test them without Phaser.
 */

import { BUILDINGS } from './GameConfig';
import type { BuildingKind, ProducerKind, ResourceCost, ResourceKind } from '../types';

/** Static definition for a single building kind. */
export interface BuildingDef {
  kind: BuildingKind;
  /** Resource cost to build the FIRST level (level 1). Scales by COST_GROWTH. */
  baseCost: ResourceCost;
  /** For producers: base output-per-second at level 1. 0 for non-producers. */
  baseOutputPerSec: number;
  /** For producers: which resource this building generates (undefined otherwise). */
  produces?: ResourceKind;
  /**
   * Minimum Furnace level required to build/own this building AT ALL. The
   * Furnace itself is always buildable (0). This is the hard prerequisite;
   * separately, a non-Furnace building may never exceed the current Furnace
   * level (enforced in BuildingSystem).
   */
  requiresFurnaceLevel: number;
  /** Highest level this building can reach (defaults to the global MAX_LEVEL). */
  maxLevel: number;
}

/**
 * The building roster. Producer outputs are balanced so early food/wood flow
 * faster than the scarcer coal/iron. The War Camp produces nothing but unlocks
 * troop training; the Furnace produces nothing but keeps the Ember burning and
 * raises the level cap of everything else.
 */
export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  furnace: {
    kind: 'furnace',
    baseCost: { wood: 100, coal: 60 },
    baseOutputPerSec: 0,
    requiresFurnaceLevel: 0,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
  hunters_hut: {
    kind: 'hunters_hut',
    baseCost: { wood: 40, food: 20 },
    baseOutputPerSec: 2.0,
    produces: 'food',
    requiresFurnaceLevel: 1,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
  sawmill: {
    kind: 'sawmill',
    baseCost: { food: 40, coal: 20 },
    baseOutputPerSec: 1.6,
    produces: 'wood',
    requiresFurnaceLevel: 1,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
  coal_pit: {
    kind: 'coal_pit',
    baseCost: { wood: 80, food: 40 },
    baseOutputPerSec: 1.0,
    produces: 'coal',
    requiresFurnaceLevel: 2,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
  iron_mine: {
    kind: 'iron_mine',
    baseCost: { wood: 120, coal: 80 },
    baseOutputPerSec: 0.5,
    produces: 'iron',
    requiresFurnaceLevel: 3,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
  war_camp: {
    kind: 'war_camp',
    baseCost: { wood: 150, coal: 100 },
    baseOutputPerSec: 0,
    requiresFurnaceLevel: 2,
    maxLevel: BUILDINGS.MAX_LEVEL,
  },
};

/** All building kinds, in a stable display/iteration order. */
export const BUILDING_ORDER: readonly BuildingKind[] = [
  'furnace',
  'hunters_hut',
  'sawmill',
  'coal_pit',
  'iron_mine',
  'war_camp',
] as const;

/** Lookup a building definition (never undefined for a valid kind). */
export function buildingDef(kind: BuildingKind): BuildingDef {
  return BUILDING_DEFS[kind];
}

/** True when the building is a resource producer (has a `produces` resource). */
export function isProducer(kind: BuildingKind): kind is ProducerKind {
  return BUILDING_DEFS[kind].produces !== undefined;
}

/**
 * Resource cost to take a building from `level` to `level + 1`.
 *
 * Level 0 -> 1 (initial build) costs the base cost; each further level
 * multiplies every base component by COST_GROWTH^level and rounds up. `level`
 * is the CURRENT level (0 = not yet built).
 */
export function upgradeCost(kind: BuildingKind, level: number): ResourceCost {
  const def = BUILDING_DEFS[kind];
  const factor = Math.pow(BUILDINGS.COST_GROWTH, Math.max(0, level));
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(def.baseCost) as [ResourceKind, number][]) {
    out[res] = Math.ceil(amount * factor);
  }
  return out;
}

/**
 * Time in milliseconds to build/upgrade a building from `level` to `level + 1`.
 * Grows linearly with the target level from BASE_BUILD_SECONDS so higher tiers
 * feel weightier without exploding.
 */
export function upgradeTimeMs(_kind: BuildingKind, level: number): number {
  const targetLevel = Math.max(1, level + 1);
  return BUILDINGS.BASE_BUILD_SECONDS * 1000 * targetLevel;
}

/**
 * Output-per-second of a producer building at a given level. Non-producers and
 * level 0 (not built) produce nothing. Output grows geometrically by
 * OUTPUT_GROWTH per level above 1.
 */
export function outputPerSec(kind: BuildingKind, level: number): number {
  const def = BUILDING_DEFS[kind];
  if (def.baseOutputPerSec <= 0 || level <= 0) return 0;
  return def.baseOutputPerSec * Math.pow(BUILDINGS.OUTPUT_GROWTH, level - 1);
}
