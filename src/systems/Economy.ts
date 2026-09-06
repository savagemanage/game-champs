/**
 * Economy.ts - pure resource economy for LAST SQUAD's base layer (FEAT-002).
 *
 * The base produces four original survival resources (rations / steel / fuel /
 * circuitry) over wall-clock time, each capped by a storage limit derived from
 * building levels. All math is Phaser-free and deterministic: the elapsed time
 * (`now` timestamps or explicit second deltas) is passed IN by the caller so
 * these functions never read the clock and are trivially testable. Tuning comes
 * entirely from {@link ECONOMY} and {@link BUILDINGS} in GameConfig.
 *
 * The runtime {@link GameStore} reads the real clock in its `tick(now)` wrapper
 * and delegates the accrual to {@link accrueProduction} here.
 */

import { BUILDINGS, ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingId, ResourceBag, ResourceKind } from '../types';

/** A per-building level lookup used to derive production and storage. */
export type BuildingLevels = Record<string, number>;

/** Read a building level defensively (missing / bad -> 0). */
function levelOf(levels: BuildingLevels, id: BuildingId): number {
  const n = Math.floor(Number(levels[id]));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A zero-filled {@link ResourceBag} with every resource key present. */
export function emptyBag(): ResourceBag {
  const bag = {} as ResourceBag;
  for (const kind of RESOURCE_ORDER) bag[kind] = 0;
  return bag;
}

/**
 * The global HQ production multiplier: 1 + productionBonus * HQ level. HQ level
 * 1 (the fresh baseline) already grants one step of bonus.
 */
export function hqProductionMultiplier(levels: BuildingLevels): number {
  return 1 + BUILDINGS.DEFS.hq.effectPerLevel.productionBonus * levelOf(levels, 'hq');
}

/**
 * The global HQ storage multiplier: 1 + storageBonus * HQ level. Applied on top
 * of each resource's base storage cap.
 */
export function hqStorageMultiplier(levels: BuildingLevels): number {
  return 1 + BUILDINGS.DEFS.hq.effectPerLevel.storageBonus * levelOf(levels, 'hq');
}

/**
 * Per-second production of every resource given the current building levels.
 * Base rates come from {@link ECONOMY}; individual buildings add flat
 * production (parade ground -> rations/fuel, barracks -> steel, tech center ->
 * circuitry, drone center -> fuel); the HQ multiplier scales the total.
 */
export function productionRates(levels: BuildingLevels): ResourceBag {
  const rates = emptyBag();
  for (const kind of RESOURCE_ORDER) {
    rates[kind] = ECONOMY.RESOURCES[kind].baseProduction;
  }

  const parade = levelOf(levels, 'parade_ground');
  rates.rations += BUILDINGS.DEFS.parade_ground.effectPerLevel.rationsProduction * parade;
  rates.fuel += BUILDINGS.DEFS.parade_ground.effectPerLevel.fuelProduction * parade;

  const barracks = levelOf(levels, 'barracks');
  rates.steel += BUILDINGS.DEFS.barracks.effectPerLevel.steelProduction * barracks;

  const tech = levelOf(levels, 'tech_center');
  rates.circuitry += BUILDINGS.DEFS.tech_center.effectPerLevel.circuitryProduction * tech;

  const drone = levelOf(levels, 'drone_center');
  rates.fuel += BUILDINGS.DEFS.drone_center.effectPerLevel.fuelProduction * drone;

  const mult = hqProductionMultiplier(levels);
  for (const kind of RESOURCE_ORDER) rates[kind] *= mult;
  return rates;
}

/**
 * Storage cap of every resource given the current building levels: the resource
 * base storage scaled by the HQ storage multiplier, floored to an integer.
 */
export function storageCaps(levels: BuildingLevels): ResourceBag {
  const caps = emptyBag();
  const mult = hqStorageMultiplier(levels);
  for (const kind of RESOURCE_ORDER) {
    caps[kind] = Math.floor(ECONOMY.RESOURCES[kind].baseStorage * mult);
  }
  return caps;
}

/** Clamp a single resource amount to [0, cap]. */
export function clampToStorage(amount: number, cap: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(amount, cap);
}

/**
 * Accrue passive production over an elapsed number of seconds, clamping each
 * resource to its storage cap. Pure: returns a NEW stockpile bag and leaves the
 * input untouched. Negative or non-finite deltas accrue nothing. The delta is
 * capped at {@link ECONOMY.MAX_ACCRUAL_SECONDS} so a very long offline gap does
 * not produce an absurd (pre-clamp) intermediate.
 */
export function accrueProduction(
  stockpiles: Record<string, number>,
  levels: BuildingLevels,
  elapsedSeconds: number,
): ResourceBag {
  const seconds = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
    ? Math.min(elapsedSeconds, ECONOMY.MAX_ACCRUAL_SECONDS)
    : 0;
  const rates = productionRates(levels);
  const caps = storageCaps(levels);
  const out = emptyBag();
  for (const kind of RESOURCE_ORDER) {
    const current = Math.max(0, Number(stockpiles[kind]) || 0);
    out[kind] = clampToStorage(current + rates[kind] * seconds, caps[kind]);
  }
  return out;
}

/**
 * Offline-progress helper: accrue production for the wall-clock gap between
 * `lastTickTimestamp` and `now` (both epoch-ms). When `lastTickTimestamp` is 0
 * (fresh save, never ticked) nothing accrues - the tick only establishes the
 * baseline. Returns the new stockpiles AND the new tick timestamp to store.
 */
export function accrueSince(
  stockpiles: Record<string, number>,
  levels: BuildingLevels,
  lastTickTimestamp: number,
  now: number,
): { stockpiles: ResourceBag; lastTickTimestamp: number } {
  const last = Number.isFinite(lastTickTimestamp) ? lastTickTimestamp : 0;
  if (last <= 0 || now <= last) {
    // First tick or clock went backwards: rebase without back-crediting time.
    return { stockpiles: accrueProduction(stockpiles, levels, 0), lastTickTimestamp: now };
  }
  const elapsedSeconds = (now - last) / 1000;
  return {
    stockpiles: accrueProduction(stockpiles, levels, elapsedSeconds),
    lastTickTimestamp: now,
  };
}

/** Whether the stockpiles can cover a resource cost (all resources present). */
export function canAfford(stockpiles: Record<string, number>, cost: ResourceBag): boolean {
  for (const kind of RESOURCE_ORDER) {
    const have = Math.max(0, Number(stockpiles[kind]) || 0);
    if (have < (cost[kind] ?? 0)) return false;
  }
  return true;
}

/**
 * Spend a resource cost. Pure: returns a NEW stockpile bag on success. When the
 * cost is unaffordable, returns `ok: false` and the inputs unchanged so callers
 * can branch without a try/catch.
 */
export function spend(
  stockpiles: Record<string, number>,
  cost: ResourceBag,
): { ok: boolean; stockpiles: ResourceBag } {
  const result = emptyBag();
  for (const kind of RESOURCE_ORDER) {
    result[kind] = Math.max(0, Number(stockpiles[kind]) || 0);
  }
  if (!canAfford(result, cost)) return { ok: false, stockpiles: result };
  for (const kind of RESOURCE_ORDER) {
    result[kind] -= cost[kind] ?? 0;
  }
  return { ok: true, stockpiles: result };
}

/**
 * Add resources (e.g. Falcon Rescue rewards) clamped to storage caps. Pure:
 * returns a NEW stockpile bag.
 */
export function addResources(
  stockpiles: Record<string, number>,
  gain: Partial<ResourceBag>,
  levels: BuildingLevels,
): ResourceBag {
  const caps = storageCaps(levels);
  const out = emptyBag();
  for (const kind of RESOURCE_ORDER) {
    const current = Math.max(0, Number(stockpiles[kind]) || 0);
    out[kind] = clampToStorage(current + (gain[kind] ?? 0), caps[kind]);
  }
  return out;
}

/** Convenience: the ordered resource kinds, re-exported for iteration in UI. */
export const RESOURCE_KINDS: readonly ResourceKind[] = RESOURCE_ORDER;
