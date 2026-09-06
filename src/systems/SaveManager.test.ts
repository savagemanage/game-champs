import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, SAVE_KEY } from './SaveManager';
import { GAME_STATE } from '../config/GameConfig';
import type { GameState, GameStateV1 } from '../types';

/**
 * Unit tests for the versioned meta-save layer with an INJECTED fake storage
 * (no window dependency): v2 round-trip fidelity, v1 -> v2 migration,
 * normalization, and the fresh-game fallback on missing / corrupt /
 * wrong-version data.
 */
describe('SaveManager', () => {
  /** A fully-populated v2 state for round-trip assertions. */
  function state(): GameState {
    return {
      version: SAVE_VERSION,
      miniGame: {
        coins: 350,
        upgrades: { start_size: 4, damage: 2, fire_rate: 1, coin_bonus: 3 },
        bestDistance: 1800,
        bestScore: 4200,
        runsPlayed: 12,
      },
      resources: { stockpiles: {} },
      buildings: { levels: {} },
      heroes: { roster: {} },
      formation: {
        front: new Array<string | null>(GAME_STATE.FORMATION.FRONT_SLOTS).fill(null),
        back: new Array<string | null>(GAME_STATE.FORMATION.BACK_SLOTS).fill(null),
      },
      season: { current: 0, progress: 0 },
      missions: { daily: {}, weekly: {} },
    };
  }

  /** A serialized legacy v1 save (top-level `meta` block). */
  function v1(): GameStateV1 {
    return {
      version: 1,
      meta: {
        coins: 350,
        upgrades: { start_size: 4, damage: 2, fire_rate: 1, coin_bonus: 3 },
        bestDistance: 1800,
        bestScore: 4200,
        runsPlayed: 12,
      },
    };
  }

  it('save version is 2', () => {
    expect(SAVE_VERSION).toBe(2);
  });

  it('freshGame returns a valid v2 state with all sub-states defaulted', () => {
    const fresh = SaveManager.freshGame();
    expect(fresh.version).toBe(2);
    expect(fresh.miniGame).toEqual({
      coins: 0,
      upgrades: { start_size: 0, damage: 0, fire_rate: 0, coin_bonus: 0 },
      bestDistance: 0,
      bestScore: 0,
      runsPlayed: 0,
    });
    expect(fresh.resources).toEqual({ stockpiles: {} });
    expect(fresh.buildings).toEqual({ levels: {} });
    expect(fresh.heroes).toEqual({ roster: {} });
    expect(fresh.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
    expect(fresh.formation.back).toHaveLength(GAME_STATE.FORMATION.BACK_SLOTS);
    expect(fresh.formation.front.every((s) => s === null)).toBe(true);
    expect(fresh.formation.back.every((s) => s === null)).toBe(true);
    expect(fresh.season).toEqual({ current: 0, progress: 0 });
    expect(fresh.missions).toEqual({ daily: {}, weekly: {} });
  });

  it('loads a fresh game when storage is empty', () => {
    const mgr = new SaveManager(memoryStorage());
    const { state, loaded } = mgr.load();
    expect(loaded).toBe(false);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.miniGame.coins).toBe(0);
    expect(state.miniGame.upgrades).toEqual({
      start_size: 0,
      damage: 0,
      fire_rate: 0,
      coin_bonus: 0,
    });
    expect(state.miniGame.runsPlayed).toBe(0);
  });

  it('serialize produces a versioned, JSON-safe object', () => {
    const s = SaveManager.serialize(state());
    expect(s.version).toBe(SAVE_VERSION);
    expect(() => JSON.stringify(s)).not.toThrow();
    expect(s.miniGame.coins).toBe(350);
  });

  it('round-trips full v2 state through save -> load', () => {
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

  it('migrates a v1 save into v2 preserving coins, upgrades, and bests', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1()));
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(true);
    expect(state.version).toBe(2);
    // Old meta block preserved verbatim under miniGame.
    expect(state.miniGame.coins).toBe(350);
    expect(state.miniGame.upgrades).toEqual({
      start_size: 4,
      damage: 2,
      fire_rate: 1,
      coin_bonus: 3,
    });
    expect(state.miniGame.bestDistance).toBe(1800);
    expect(state.miniGame.bestScore).toBe(4200);
    expect(state.miniGame.runsPlayed).toBe(12);
    // New sub-states initialized to fresh defaults.
    expect(state.resources).toEqual({ stockpiles: {} });
    expect(state.buildings).toEqual({ levels: {} });
    expect(state.heroes).toEqual({ roster: {} });
    expect(state.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
    expect(state.formation.back).toHaveLength(GAME_STATE.FORMATION.BACK_SLOTS);
    expect(state.season).toEqual({ current: 0, progress: 0 });
    expect(state.missions).toEqual({ daily: {}, weekly: {} });
  });

  it('migrates then persists a normalized v2 save (v1 file replaced on next save)', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1()));
    const mgr = new SaveManager(storage);
    const migrated = mgr.load().state;
    mgr.save(migrated);
    const reread = JSON.parse(storage.getItem(SAVE_KEY) as string);
    expect(reread.version).toBe(2);
    expect(reread.meta).toBeUndefined();
    expect(reread.miniGame.coins).toBe(350);
  });

  it('falls back to fresh v2 when a v1 save has a missing meta block', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }));
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
    expect(state.version).toBe(2);
    expect(state.miniGame.coins).toBe(0);
  });

  it('normalizes partial / floating / negative values on load', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        miniGame: { coins: 12.9, upgrades: { start_size: -3, damage: 2.7 }, bestDistance: 10.5 },
      }),
    );
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(true);
    expect(state.miniGame.coins).toBe(12); // floored
    expect(state.miniGame.upgrades.start_size).toBe(0); // clamped non-negative
    expect(state.miniGame.upgrades.damage).toBe(2); // floored
    expect(state.miniGame.upgrades.fire_rate).toBe(0); // missing -> 0
    expect(state.miniGame.bestDistance).toBe(10);
    expect(state.miniGame.runsPlayed).toBe(0);
    // Missing sub-states are filled with fresh defaults.
    expect(state.resources).toEqual({ stockpiles: {} });
    expect(state.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
  });

  it('normalizes malformed sub-states and clamps record values', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        miniGame: { coins: 5 },
        resources: { stockpiles: { wood: 10.9, food: -4 } },
        formation: { front: ['h1', 'h2', 'h3'], back: 'nope' },
        season: { current: 2.9, progress: 40 },
        missions: { daily: { arms: 3.6 }, weekly: 'bad' },
      }),
    );
    const { state } = new SaveManager(storage).load();
    expect(state.resources.stockpiles).toEqual({ wood: 10, food: 0 });
    // Extra front slot dropped to config size; back reset to nulls.
    expect(state.formation.front).toEqual(['h1', 'h2']);
    expect(state.formation.back).toEqual([null, null, null]);
    expect(state.season).toEqual({ current: 2, progress: 40 });
    expect(state.missions.daily).toEqual({ arms: 3 });
    expect(state.missions.weekly).toEqual({});
  });

  it('starts fresh on a version mismatch', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, miniGame: { coins: 500 } }));
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
    expect(state.miniGame.coins).toBe(0);
  });

  it('starts fresh on corrupt / unparseable JSON', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{not valid json at all');
    const { state, loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
    expect(state.miniGame.coins).toBe(0);
  });

  it('starts fresh when the stored JSON is a bare value', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '42');
    const { loaded } = new SaveManager(storage).load();
    expect(loaded).toBe(false);
  });

  it('starts fresh when miniGame is missing', () => {
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
