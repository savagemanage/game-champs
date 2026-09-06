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
    expect(store.state.resources).toEqual(SaveManager.freshGame().resources);
    expect(store.state.buildings).toEqual(SaveManager.freshGame().buildings);
  });

  it('persists sub-state mutations through save/load', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    store.state.resources.stockpiles.rations = 42;
    store.state.season.current = 1;
    store.persist();

    // A fresh store reading the same storage sees the persisted values.
    const reloaded = GameStore.createWith(storage);
    expect(reloaded.state.resources.stockpiles.rations).toBe(42);
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

  it('tick() accrues production against the stored timestamp and persists', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    // First tick establishes the baseline (no back-crediting).
    store.tick(1_000);
    const baseline = store.resource('rations');
    // Second tick 100s later accrues production.
    store.tick(101_000);
    expect(store.resource('rations')).toBeGreaterThan(baseline);

    // Persisted: a fresh store sees the accrued amount and timestamp.
    const reloaded = GameStore.createWith(storage);
    expect(reloaded.resource('rations')).toBe(store.resource('rations'));
    expect(reloaded.state.resources.lastTickTimestamp).toBe(101_000);
  });

  it('tryStartUpgrade spends resources, queues the timed upgrade, and persists', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    const before = store.resource('steel');

    const ok = store.tryStartUpgrade('hq', 1_000);
    expect(ok).toBe(true);
    expect(store.resource('steel')).toBeLessThan(before); // cost spent
    expect(store.state.buildings.queue).toHaveLength(1);
    expect(store.state.buildings.queue[0].building).toBe('hq');

    // A second concurrent upgrade is blocked (single global queue).
    expect(store.tryStartUpgrade('barracks', 1_000)).toBe(false);
  });

  it('tick() completes a building upgrade offline (while the tab was closed)', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    store.tick(0);
    expect(store.tryStartUpgrade('hq', 0)).toBe(true);
    const completesAt = store.state.buildings.queue[0].completesAt;
    const beforeLevel = store.buildingLevel('hq');

    // Far past completion: the upgrade resolves on tick.
    const result = store.tick(completesAt + 10_000);
    expect(store.buildingLevel('hq')).toBe(beforeLevel + 1);
    expect(store.state.buildings.queue).toHaveLength(0);
    expect(result.completed).toContain('hq');
  });

  it('canUpgrade enforces the HQ cap through the store', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    // Fresh: HQ 1, barracks 0 -> barracks may reach level 1.
    expect(store.canUpgrade('barracks').ok).toBe(true);
    // Bump barracks to HQ level so the next level would exceed the cap.
    store.state.buildings.levels.barracks = 1;
    store.persist();
    expect(store.canUpgrade('barracks')).toEqual({ ok: false, reason: 'hq_cap' });
  });

  it('grantResources adds and clamps to storage', () => {
    const storage = memoryStorage();
    const store = GameStore.createWith(storage);
    const cap = store.storageCaps().circuitry;
    store.grantResources({ circuitry: 1e9 });
    expect(store.resource('circuitry')).toBe(cap);
  });
});
