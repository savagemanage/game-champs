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

import type { GameState } from '../types';
import { SaveManager, browserStorage, type KeyValueStorage } from './SaveManager';

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
}
