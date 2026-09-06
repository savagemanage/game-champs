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
import { GameStore } from './GameStore';
import { deriveStats, purchaseUpgrade } from './MetaProgress';

/**
 * Singleton view over the gate-runner mini-game meta. It reads and mutates the
 * `miniGame` sub-state of the full {@link GameState} owned by {@link GameStore},
 * so the gate-runner scenes see the same persisted data as the rest of the
 * expanded game. Its public API is unchanged from v1.
 */
export class MetaStore {
  private static instance: MetaStore | null = null;

  private readonly store: GameStore;

  private constructor() {
    this.store = GameStore.get();
  }

  /** Fetch (or lazily create) the shared store. */
  static get(): MetaStore {
    if (!MetaStore.instance) MetaStore.instance = new MetaStore();
    return MetaStore.instance;
  }

  /** The full persisted state owned by {@link GameStore}. */
  private get state(): GameState {
    return this.store.state;
  }

  /** Current spendable coins. */
  get coins(): number {
    return this.state.miniGame.coins;
  }

  /** Best distance reached across all runs. */
  get bestDistance(): number {
    return this.state.miniGame.bestDistance;
  }

  /** Best score across all runs. */
  get bestScore(): number {
    return this.state.miniGame.bestScore;
  }

  /** Total runs played. */
  get runsPlayed(): number {
    return this.state.miniGame.runsPlayed;
  }

  /** Purchased level of a given upgrade. */
  levelOf(kind: MetaUpgradeKind): number {
    return this.state.miniGame.upgrades[kind] ?? 0;
  }

  /** Derived run stats from the current upgrade levels. */
  derivedStats(): DerivedStats {
    return deriveStats(this.state.miniGame.upgrades);
  }

  /** A copy of the raw purchased-level state (for affordability checks). */
  upgradeState(): MetaUpgradeState {
    return { ...this.state.miniGame.upgrades };
  }

  /**
   * Attempt to buy the next level of an upgrade. Returns true on success and
   * persists the new state. No-op (returns false) when maxed or unaffordable.
   */
  buyUpgrade(kind: MetaUpgradeKind): boolean {
    const res = purchaseUpgrade(kind, this.state.miniGame.upgrades, this.state.miniGame.coins);
    if (!res.ok) return false;
    this.state.miniGame.coins = res.coins;
    this.state.miniGame.upgrades = res.upgrades;
    this.persist();
    return true;
  }

  /**
   * Record a finished run: add earned coins, bump bests, increment runsPlayed,
   * and persist. Returns whether this run set a new distance or score best.
   */
  recordRun(result: RunResult): { newBestDistance: boolean; newBestScore: boolean } {
    const mini = this.state.miniGame;
    const newBestDistance = result.distance > mini.bestDistance;
    const newBestScore = result.score > mini.bestScore;
    mini.coins += Math.max(0, Math.floor(result.coinsEarned));
    if (newBestDistance) mini.bestDistance = result.distance;
    if (newBestScore) mini.bestScore = result.score;
    mini.runsPlayed += 1;
    this.persist();
    return { newBestDistance, newBestScore };
  }

  /** Wipe all progress back to a fresh game and persist. */
  reset(): void {
    this.store.reset();
  }

  private persist(): void {
    this.store.persist();
  }
}
