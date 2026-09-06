/**
 * Buildings.ts - pure base-building logic for LAST SQUAD (FEAT-002).
 *
 * Models the base tree: HQ (본부) plus tech center, parade ground, hospital,
 * barracks, and drone center. Each building shares a geometric cost + build-time
 * curve driven by {@link BUILDINGS} in GameConfig. Upgrades are time-gated
 * against wall-clock timestamps so they complete offline on a static site: the
 * caller passes `now` (epoch-ms) into the pure functions; the runtime store
 * supplies the real clock.
 *
 * The HQ cap is central: a non-HQ building may never exceed the current HQ
 * level. A single global build queue is used (one active upgrade at a time),
 * matching the spec's single-queue feel.
 *
 * Everything here is Phaser-free and deterministic. Nothing reads Date.now().
 */

import { BUILDING_ORDER, BUILDINGS, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingId, BuildingUpgrade, ResourceBag } from '../types';
import { canAfford, emptyBag } from './Economy';

/** A per-building level lookup. */
export type BuildingLevels = Record<string, number>;

/** Whether a value is a valid building id. */
export function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === 'string' && (BUILDING_ORDER as readonly string[]).includes(value);
}

/** Read a building level defensively (missing / bad -> HQ 1, others 0). */
export function levelOf(levels: BuildingLevels, id: BuildingId): number {
  const raw = Math.floor(Number(levels[id]));
  const fallback = id === 'hq' ? 1 : 0;
  return Number.isFinite(raw) && raw >= fallback ? raw : fallback;
}

/** The absolute max level for a building (before the HQ cap is applied). */
export function maxLevel(id: BuildingId): number {
  return BUILDINGS.DEFS[id].maxLevel;
}

/**
 * Resource cost to upgrade FROM `currentLevel` to the next level, using the
 * geometric curve `round(baseCost[res] * COST_GROWTH^currentLevel)`. Returns an
 * all-Infinity bag when already at the absolute max so affordability naturally
 * fails. `currentLevel` 0 costs exactly the base (growth^0 = 1).
 */
export function upgradeCost(id: BuildingId, currentLevel: number): ResourceBag {
  const def = BUILDINGS.DEFS[id];
  const out = emptyBag();
  if (currentLevel >= def.maxLevel) {
    for (const kind of RESOURCE_ORDER) out[kind] = Infinity;
    return out;
  }
  const factor = Math.pow(BUILDINGS.COST_GROWTH, currentLevel);
  for (const kind of RESOURCE_ORDER) {
    out[kind] = Math.round(def.baseCost[kind] * factor);
  }
  return out;
}

/**
 * Build time in SECONDS to upgrade FROM `currentLevel` to the next level, using
 * `round(baseTimeSeconds * TIME_GROWTH^currentLevel)`. Returns Infinity when
 * already at the absolute max.
 */
export function upgradeTimeSeconds(id: BuildingId, currentLevel: number): number {
  const def = BUILDINGS.DEFS[id];
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.round(def.baseTimeSeconds * Math.pow(BUILDINGS.TIME_GROWTH, currentLevel));
}

/** Whether any upgrade is currently in progress (single global queue). */
export function isBuilding(queue: readonly BuildingUpgrade[]): boolean {
  return queue.length >= BUILDINGS.MAX_CONCURRENT_UPGRADES;
}

/** Whether a specific building already has a queued/active upgrade. */
export function isUpgrading(queue: readonly BuildingUpgrade[], id: BuildingId): boolean {
  return queue.some((u) => u.building === id);
}

/** A precise reason an upgrade cannot start (or `null` when it can). */
export type UpgradeBlockReason = 'max_level' | 'hq_cap' | 'queue_full' | 'insufficient_resources';

/**
 * Check whether a building can start its next upgrade right now. Enforces, in
 * order: absolute max level, the HQ cap (a non-HQ building cannot exceed the
 * current HQ level), the single-queue limit, then resource affordability.
 * Returns `{ ok: true }` or `{ ok: false, reason }`.
 */
export function canUpgrade(
  id: BuildingId,
  levels: BuildingLevels,
  stockpiles: Record<string, number>,
  queue: readonly BuildingUpgrade[],
): { ok: true } | { ok: false; reason: UpgradeBlockReason } {
  const current = levelOf(levels, id);
  if (current >= maxLevel(id)) return { ok: false, reason: 'max_level' };

  // HQ cap: a non-HQ building cannot be upgraded beyond the current HQ level.
  if (id !== 'hq') {
    const hqLevel = levelOf(levels, 'hq');
    if (current + 1 > hqLevel) return { ok: false, reason: 'hq_cap' };
  }

  if (isBuilding(queue)) return { ok: false, reason: 'queue_full' };

  if (!canAfford(stockpiles, upgradeCost(id, current))) {
    return { ok: false, reason: 'insufficient_resources' };
  }
  return { ok: true };
}

/** The result of attempting to start an upgrade. */
export interface StartUpgradeResult {
  /** Whether the upgrade was queued. */
  ok: boolean;
  /** Why it failed (only when `ok` is false). */
  reason?: UpgradeBlockReason;
  /** The queued upgrade (only when `ok` is true). */
  upgrade?: BuildingUpgrade;
  /** Resources to spend for the upgrade (only when `ok` is true). */
  cost?: ResourceBag;
}

/**
 * Attempt to start a building's next upgrade at wall-clock `now` (epoch-ms).
 * Pure: does NOT mutate inputs and does NOT spend resources - it returns the
 * queued {@link BuildingUpgrade} and its `cost` so the caller (the store) can
 * atomically spend, append to the queue, and persist. `completesAt` is
 * `now + upgradeTimeSeconds * 1000`.
 */
export function startUpgrade(
  id: BuildingId,
  levels: BuildingLevels,
  stockpiles: Record<string, number>,
  queue: readonly BuildingUpgrade[],
  now: number,
): StartUpgradeResult {
  const check = canUpgrade(id, levels, stockpiles, queue);
  if (!check.ok) return { ok: false, reason: check.reason };

  const current = levelOf(levels, id);
  const cost = upgradeCost(id, current);
  const durationMs = upgradeTimeSeconds(id, current) * 1000;
  const upgrade: BuildingUpgrade = {
    building: id,
    toLevel: current + 1,
    startedAt: now,
    completesAt: now + durationMs,
  };
  return { ok: true, upgrade, cost };
}

/** The result of resolving finished upgrades. */
export interface ResolveResult {
  /** New building levels after applying every completed upgrade. */
  levels: BuildingLevels;
  /** The remaining (still in-progress) queue. */
  queue: BuildingUpgrade[];
  /** The upgrades that completed during this resolution. */
  completed: BuildingUpgrade[];
}

/**
 * Resolve any upgrades whose `completesAt` has been reached by wall-clock `now`
 * (epoch-ms), applying the new level to each completed building. Upgrades that
 * finished while the tab was closed complete here on load (offline progress).
 * Pure: returns NEW levels + a NEW pending queue; inputs are untouched.
 */
export function resolveUpgrades(
  levels: BuildingLevels,
  queue: readonly BuildingUpgrade[],
  now: number,
): ResolveResult {
  const nextLevels: BuildingLevels = { ...levels };
  const pending: BuildingUpgrade[] = [];
  const completed: BuildingUpgrade[] = [];

  for (const upgrade of queue) {
    if (upgrade.completesAt <= now) {
      // Apply the finished upgrade. Guard against going backwards or past max.
      if (isBuildingId(upgrade.building)) {
        const current = levelOf(nextLevels, upgrade.building);
        const target = Math.min(Math.max(current, upgrade.toLevel), maxLevel(upgrade.building));
        nextLevels[upgrade.building] = target;
      }
      completed.push(upgrade);
    } else {
      pending.push(upgrade);
    }
  }
  return { levels: nextLevels, queue: pending, completed };
}

/** Milliseconds remaining until an in-progress upgrade completes (0 if done). */
export function remainingMs(upgrade: BuildingUpgrade, now: number): number {
  return Math.max(0, upgrade.completesAt - now);
}
