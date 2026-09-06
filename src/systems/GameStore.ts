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

import type {
  BuildingId,
  FormationState,
  GameState,
  HeroInstance,
  ResourceBag,
  ResourceKind,
} from '../types';
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
import { duplicateShards, recruit, type RecruitResult } from './Recruit';
import { levelUp, makeHeroInstance, skillUp, starUp } from './Heroes';
import { placeHero, validateFormation, type Row } from './Formation';
import { makeRng } from './Rng';

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

  /* ------------------------------------------------------------------ */
  /* FEAT-003: hero roster, recruit, progression, formation.            */
  /* ------------------------------------------------------------------ */

  /** Spendable hero progression shards. */
  shards(): number {
    return this.stateInternal.heroes.shards;
  }

  /** The owned hero instance for an id (undefined if not owned). */
  hero(id: string): HeroInstance | undefined {
    return this.stateInternal.heroes.roster[id];
  }

  /** Whether a hero id is owned. */
  ownsHero(id: string): boolean {
    return this.stateInternal.heroes.roster[id] !== undefined;
  }

  /**
   * Perform one seeded recruit pull, applying the roster / shard / pity
   * mutation and persisting. A brand-new hero is added at level 1; a duplicate
   * instead converts to shards (grade shardValue + bonus) and bumps the owned
   * instance's `dupes`. Pass a `seed` so the pull is deterministic and testable.
   * Returns the recruit outcome plus whether it was a duplicate + shards gained.
   */
  recruitOne(seed: number): RecruitResult & { duplicate: boolean; shardsGained: number } {
    const heroes = this.stateInternal.heroes;
    const rng = makeRng(seed);
    const result = recruit(rng, heroes.pity);
    heroes.pity = result.newPityState;

    const existing = heroes.roster[result.heroId];
    let duplicate = false;
    let shardsGained = 0;
    if (existing) {
      duplicate = true;
      shardsGained = duplicateShards(result.grade);
      heroes.shards += shardsGained;
      existing.dupes += 1;
    } else {
      heroes.roster[result.heroId] = makeHeroInstance(result.heroId);
    }
    this.persist();
    return { ...result, duplicate, shardsGained };
  }

  /**
   * Spend shards to level up an owned hero by one. Returns true on success
   * (affordable + not capped) and persists; false otherwise.
   */
  levelUpHero(id: string): boolean {
    return this.progressHero(id, levelUp);
  }

  /** Spend shards to raise an owned hero's star-tier by one. */
  starUpHero(id: string): boolean {
    return this.progressHero(id, starUp);
  }

  /** Spend shards to raise an owned hero's skill level by one. */
  skillUpHero(id: string): boolean {
    return this.progressHero(id, skillUp);
  }

  /** Shared spend-shards-to-progress helper for the three hero tracks. */
  private progressHero(
    id: string,
    op: (
      instance: HeroInstance,
      shards: number,
    ) => { ok: boolean; instance: HeroInstance; shards: number },
  ): boolean {
    const heroes = this.stateInternal.heroes;
    const instance = heroes.roster[id];
    if (!instance) return false;
    const res = op(instance, heroes.shards);
    if (!res.ok) return false;
    heroes.roster[id] = res.instance;
    heroes.shards = res.shards;
    this.persist();
    return true;
  }

  /** The current squad formation. */
  formation(): FormationState {
    return this.stateInternal.formation;
  }

  /**
   * Place (or clear with null) a hero in a formation row slot, then persist.
   * Only owned heroes may be placed; a hero occupies at most one slot. Returns
   * true when the resulting formation is valid and was stored.
   */
  setFormationSlot(row: Row, index: number, heroId: string | null): boolean {
    if (heroId !== null && !this.ownsHero(heroId)) return false;
    const next = placeHero(this.stateInternal.formation, row, index, heroId);
    if (!validateFormation(next).ok) return false;
    this.stateInternal.formation = next;
    this.persist();
    return true;
  }
}
