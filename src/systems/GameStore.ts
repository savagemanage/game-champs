/**
 * GameStore.ts - the single runtime owner of the full persisted v2 GameState.
 *
 * Where {@link MetaStore} exposes only the gate-runner mini-game meta, GameStore
 * owns the WHOLE expanded save (mini-game meta + resource economy, buildings,
 * hero roster, formation, season, missions). It wires the pure
 * {@link SaveManager} to real `localStorage` (via browserStorage) and gives
 * every later feature ONE place to read and mutate its own sub-state, then
 * persist. FEAT-001 provides only the accessor + persistence plumbing; each
 * later feature adds the typed getters/mutators for the sub-state it owns.
 *
 * Phaser-free by design so it can be constructed lazily from any scene or
 * pure system.
 */

import type { BuildingId, GameState, ResourceBag, ResourceKind } from '../types';
import { SaveManager, browserStorage, type KeyValueStorage } from './SaveManager';
import {
  accrueSince,
  addResources,
  productionRates,
  spend,
  storageCaps,
} from './Economy';
import {
  canUpgrade,
  levelOf as buildingLevelOf,
  resolveUpgrades,
  startUpgrade,
  type UpgradeBlockReason,
} from './Buildings';

/** Singleton wrapper around the full persisted v2 {@link GameState}. */
export class GameStore {
  private static instance: GameStore | null = null;

  private readonly saves: SaveManager;
  private stateInternal: GameState;

  private constructor(storage: KeyValueStorage) {
    this.saves = new SaveManager(storage);
    this.stateInternal = this.saves.load().state;
  }

  /** Fetch (or lazily create) the shared store backed by real localStorage. */
  static get(): GameStore {
    if (!GameStore.instance) GameStore.instance = new GameStore(browserStorage());
    return GameStore.instance;
  }

  /**
   * Replace the singleton with one backed by the given storage. Intended for
   * tests that need a deterministic, injected fake store; production code uses
   * {@link GameStore.get}.
   */
  static createWith(storage: KeyValueStorage): GameStore {
    GameStore.instance = new GameStore(storage);
    return GameStore.instance;
  }

  /** The live, mutable full game state. Mutate a sub-state then call persist(). */
  get state(): GameState {
    return this.stateInternal;
  }

  /** Persist the current state to storage; re-reads the normalized result. */
  persist(): void {
    this.stateInternal = this.saves.save(this.stateInternal);
  }

  /** Wipe all progress back to a fresh v2 game and persist. */
  reset(): void {
    this.stateInternal = SaveManager.freshGame();
    this.saves.save(this.stateInternal);
  }

  /* ------------------------------------------------------------------ */
  /* FEAT-002: economy + building runtime methods (scenes call these).   */
  /* ------------------------------------------------------------------ */

  /**
   * Advance the base by wall-clock `now` (epoch-ms): accrue passive/offline
   * resource production against the stored lastTickTimestamp, then resolve any
   * building upgrades that have finished (including while the tab was closed).
   * Persists when anything changed. Returns the building upgrades completed on
   * this tick so a scene can surface "construction complete" feedback.
   */
  tick(now: number): { completed: BuildingId[] } {
    const buildings = this.stateInternal.buildings;

    // 1) Resolve finished upgrades first so freshly-completed buildings feed
    //    into the production accrual below.
    const resolved = resolveUpgrades(buildings.levels, buildings.queue, now);
    buildings.levels = resolved.levels;
    buildings.queue = resolved.queue;

    // 2) Accrue production for the elapsed wall-clock gap, clamped to storage.
    const resources = this.stateInternal.resources;
    const accrued = accrueSince(
      resources.stockpiles,
      buildings.levels,
      resources.lastTickTimestamp,
      now,
    );
    resources.stockpiles = accrued.stockpiles;
    resources.lastTickTimestamp = accrued.lastTickTimestamp;

    this.persist();
    return { completed: resolved.completed.map((u) => u.building) };
  }

  /** Current stockpile of a single resource. */
  resource(kind: ResourceKind): number {
    return this.stateInternal.resources.stockpiles[kind] ?? 0;
  }

  /** A snapshot of every resource stockpile. */
  resources(): ResourceBag {
    const out = {} as ResourceBag;
    const stockpiles = this.stateInternal.resources.stockpiles;
    for (const kind of Object.keys(stockpiles) as ResourceKind[]) {
      out[kind] = stockpiles[kind] ?? 0;
    }
    return out;
  }

  /** Per-second production rates given the current building levels. */
  productionRates(): ResourceBag {
    return productionRates(this.stateInternal.buildings.levels);
  }

  /** Storage caps given the current building levels. */
  storageCaps(): ResourceBag {
    return storageCaps(this.stateInternal.buildings.levels);
  }

  /** Current level of a building. */
  buildingLevel(id: BuildingId): number {
    return buildingLevelOf(this.stateInternal.buildings.levels, id);
  }

  /** Whether a building can start its next upgrade right now. */
  canUpgrade(
    id: BuildingId,
  ): { ok: true } | { ok: false; reason: UpgradeBlockReason } {
    const { buildings, resources } = this.stateInternal;
    return canUpgrade(id, buildings.levels, resources.stockpiles, buildings.queue);
  }

  /**
   * Attempt to start a building upgrade at wall-clock `now` (epoch-ms). On
   * success it spends the resource cost, queues the timed upgrade, and persists;
   * on failure nothing changes. Returns `true` when the upgrade was queued.
   */
  tryStartUpgrade(id: BuildingId, now: number): boolean {
    const { buildings, resources } = this.stateInternal;
    const started = startUpgrade(
      id,
      buildings.levels,
      resources.stockpiles,
      buildings.queue,
      now,
    );
    if (!started.ok || !started.upgrade || !started.cost) return false;

    const spent = spend(resources.stockpiles, started.cost);
    if (!spent.ok) return false; // Belt-and-braces; canUpgrade already checked.

    resources.stockpiles = spent.stockpiles;
    buildings.queue = [...buildings.queue, started.upgrade];
    this.persist();
    return true;
  }

  /**
   * Grant resources (e.g. Falcon Rescue rewards) clamped to storage, then
   * persist. Returns the new stockpiles snapshot.
   */
  grantResources(gain: Partial<ResourceBag>): ResourceBag {
    const { buildings, resources } = this.stateInternal;
    resources.stockpiles = addResources(resources.stockpiles, gain, buildings.levels);
    this.persist();
    return this.resources();
  }
}
