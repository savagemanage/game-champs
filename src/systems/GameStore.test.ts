import { describe, it, expect } from 'vitest';
import { GameStore } from './GameStore';
import { SaveManager, memoryStorage, SAVE_KEY, SAVE_VERSION } from './SaveManager';

/**
 * Tests for the full-state runtime accessor. GameStore owns the whole v2
 * GameState and is the single place later features read/write. It is exercised
 * here with an injected fake storage via {@link GameStore.createWith}.
 */
describe('GameStore', () => {
  it('loads a fresh v2 state when storage is empty', () => {
    const store = GameStore.createWith(memoryStorage());
    expect(store.state.version).toBe(SAVE_VERSION);
    expect(store.state.miniGame.coins).toBe(0);
    expect(store.state.resources).toEqual({ stockpiles: {} });
  });

  it('persists sub-state mutations through save/load', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    store.state.resources.stockpiles.wood = 42;
    store.state.season.current = 1;
    store.persist();

    // A fresh store reading the same storage sees the persisted values.
    const reloaded = GameStore.createWith(storage);
    expect(reloaded.state.resources.stockpiles.wood).toBe(42);
    expect(reloaded.state.season.current).toBe(1);
  });

  it('reads a migrated v1 save (miniGame preserved)', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        meta: {
          coins: 120,
          upgrades: { start_size: 2, damage: 1, fire_rate: 0, coin_bonus: 1 },
          bestDistance: 900,
          bestScore: 1500,
          runsPlayed: 4,
        },
      }),
    );
    const store = GameStore.createWith(storage);
    expect(store.state.version).toBe(2);
    expect(store.state.miniGame.coins).toBe(120);
    expect(store.state.miniGame.bestScore).toBe(1500);
  });

  it('reset() wipes back to a fresh v2 game and persists', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    store.state.miniGame.coins = 999;
    store.persist();
    store.reset();
    expect(store.state.miniGame.coins).toBe(0);

    const stored = JSON.parse(storage.getItem(SAVE_KEY) as string);
    expect(stored).toEqual(SaveManager.freshGame());
  });
});
