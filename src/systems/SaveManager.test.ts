import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, SAVE_KEY } from './SaveManager';
import type { GameState } from '../types';

/**
 * Unit tests for the versioned meta-save layer with an INJECTED fake storage
 * (no window dependency): round-trip fidelity, normalization, and the
 * fresh-game fallback on missing / corrupt / wrong-version data.
 */
describe('SaveManager', () => {
  function state(): GameState {
    return {
      version: SAVE_VERSION,
      meta: {
        coins: 350,
        upgrades: { start_size: 4, damage: 2, fire_rate: 1, coin_bonus: 3 },
        bestDistance: 1800,
        bestScore: 4200,
        runsPlayed: 12,
      },
    };
  }

  it('loads a fresh game when storage is empty', () => {
    const mgr = new SaveManager(memoryStorage());
    const { state, loaded } = mgr.load();
    expect(loaded).toBe(false);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.meta.coins).toBe(0);
    expect(state.meta.upgrades).toEqual({ start_size: 0, damage: 0, fire_rate: 0, coin_bonus: 0 });
    expect(state.meta.runsPlayed).toBe(0);
  });

  it('serialize produces a versioned, JSON-safe object', () => {
    const s = SaveManager.serialize(state());
    expect(s.version).toBe(SAVE_VERSION);
    expect(() => JSON.stringify(s)).not.toThrow();
    expect(s.meta.coins).toBe(350);
  });

  it('round-trips full meta state through save -> load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    mgr.save(state());
    const { state: loaded, loaded: found } = mgr.load();
    expect(found).toBe(true);
    expect(loaded).toEqual(state());
  });

  it('uses the last-squad namespace for the save key', () => {
    expect(SAVE_KEY).toBe('last-squad:save');
    const storage = memoryStorage();
    new SaveManager(storage).save(state());
    expect(storage.getItem('last-squad:save')).not.toBeNull();
  });

  it('normalizes partial / floating / negative values on load', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        meta: { coins: 12.9, upgrades: { start_size: -3, damage: 2.7 }, bestDistance: 10.5 },
      }),
    );
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(true);
    expect(state.meta.coins).toBe(12); // floored
    expect(state.meta.upgrades.start_size).toBe(0); // clamped non-negative
    expect(state.meta.upgrades.damage).toBe(2); // floored
    expect(state.meta.upgrades.fire_rate).toBe(0); // missing -> 0
    expect(state.meta.bestDistance).toBe(10);
    expect(state.meta.runsPlayed).toBe(0);
  });

  it('starts fresh on a version mismatch', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, meta: { coins: 500 } }));
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
    expect(state.meta.coins).toBe(0);
  });

  it('starts fresh on corrupt / unparseable JSON', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{not valid json at all');
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
    expect(state.meta.coins).toBe(0);
  });

  it('starts fresh when the stored JSON is a bare value', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '42');
    const { loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
  });

  it('starts fresh when meta is missing', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION }));
    const { loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
  });

  it('clear() removes the save slot', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    mgr.save(state());
    mgr.clear();
    expect(mgr.load().loaded).toBe(false);
  });
});
