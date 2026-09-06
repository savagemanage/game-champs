/**
 * MetaStore.ts - the runtime owner of persisted meta-progression for scenes.
 *
 * The pure {@link SaveManager} works with an injected storage and plain state;
 * this thin singleton wires it to real `localStorage` (via browserStorage) and
 * gives the Phaser scenes one shared, mutable meta-progression object to read
 * and update. A run itself is transient and never stored here; only coins,
 * upgrade levels, and personal bests persist.
 *
 * Phaser-free by design so it can be constructed lazily from any scene.
 */

import type { DerivedStats, GameState, MetaUpgradeKind, MetaUpgradeState, RunResult } from '../types';
import { SaveManager, browserStorage } from './SaveManager';
import { deriveStats, purchaseUpgrade } from './MetaProgress';

/** Singleton wrapper around the persisted meta {@link GameState}. */
export class MetaStore {
  private static instance: MetaStore | null = null;

  private readonly saves: SaveManager;
  private state: GameState;

  private constructor() {
    this.saves = new SaveManager(browserStorage());
    this.state = this.saves.load().state;
  }

  /** Fetch (or lazily create) the shared store. */
  static get(): MetaStore {
    if (!MetaStore.instance) MetaStore.instance = new MetaStore();
    return MetaStore.instance;
  }

  /** Current spendable coins. */
  get coins(): number {
    return this.state.meta.coins;
  }

  /** Best distance reached across all runs. */
  get bestDistance(): number {
    return this.state.meta.bestDistance;
  }

  /** Best score across all runs. */
  get bestScore(): number {
    return this.state.meta.bestScore;
  }

  /** Total runs played. */
  get runsPlayed(): number {
    return this.state.meta.runsPlayed;
  }

  /** Purchased level of a given upgrade. */
  levelOf(kind: MetaUpgradeKind): number {
    return this.state.meta.upgrades[kind] ?? 0;
  }

  /** Derived run stats from the current upgrade levels. */
  derivedStats(): DerivedStats {
    return deriveStats(this.state.meta.upgrades);
  }

  /** A copy of the raw purchased-level state (for affordability checks). */
  upgradeState(): MetaUpgradeState {
    return { ...this.state.meta.upgrades };
  }

  /**
   * Attempt to buy the next level of an upgrade. Returns true on success and
   * persists the new state. No-op (returns false) when maxed or unaffordable.
   */
  buyUpgrade(kind: MetaUpgradeKind): boolean {
    const res = purchaseUpgrade(kind, this.state.meta.upgrades, this.state.meta.coins);
    if (!res.ok) return false;
    this.state.meta.coins = res.coins;
    this.state.meta.upgrades = res.upgrades;
    this.persist();
    return true;
  }

  /**
   * Record a finished run: add earned coins, bump bests, increment runsPlayed,
   * and persist. Returns whether this run set a new distance or score best.
   */
  recordRun(result: RunResult): { newBestDistance: boolean; newBestScore: boolean } {
    const newBestDistance = result.distance > this.state.meta.bestDistance;
    const newBestScore = result.score > this.state.meta.bestScore;
    this.state.meta.coins += Math.max(0, Math.floor(result.coinsEarned));
    if (newBestDistance) this.state.meta.bestDistance = result.distance;
    if (newBestScore) this.state.meta.bestScore = result.score;
    this.state.meta.runsPlayed += 1;
    this.persist();
    return { newBestDistance, newBestScore };
  }

  /** Wipe all progress back to a fresh game and persist. */
  reset(): void {
    this.state = SaveManager.freshGame();
    this.saves.save(this.state);
  }

  private persist(): void {
    this.state = this.saves.save(this.state);
  }
}
