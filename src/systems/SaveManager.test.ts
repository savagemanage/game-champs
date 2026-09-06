import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, SAVE_KEY } from './SaveManager';
import { GAME_STATE } from '../config/GameConfig';
import type { GameState, GameStateV1 } from '../types';

/** The fresh resources sub-state (seeded stockpiles, no tick yet). */
const freshResources = () => SaveManager.freshGame().resources;
/** The fresh buildings sub-state (HQ 1, others 0, empty queue). */
const freshBuildings = () => SaveManager.freshGame().buildings;

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
      resources: freshResources(),
      buildings: freshBuildings(),
      heroes: { roster: {}, shards: 0, pity: { sinceHighGrade: 0, totalPulls: 0 } },
      formation: {
        front: new Array<string | null>(GAME_STATE.FORMATION.FRONT_SLOTS).fill(null),
        back: new Array<string | null>(GAME_STATE.FORMATION.BACK_SLOTS).fill(null),
      },
      season: SaveManager.freshGame().season,
      missions: SaveManager.freshGame().missions,
      campaign: SaveManager.freshGame().campaign,
      league: SaveManager.freshGame().league,
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
    // Four resources seeded from config; no production tick recorded yet.
    expect(Object.keys(fresh.resources.stockpiles).sort()).toEqual(
      ['circuitry', 'fuel', 'rations', 'steel'],
    );
    expect(fresh.resources.lastTickTimestamp).toBe(0);
    // HQ starts at level 1 so the base is playable; others at 0; empty queue.
    expect(fresh.buildings.levels.hq).toBe(1);
    expect(fresh.buildings.levels.barracks).toBe(0);
    expect(fresh.buildings.queue).toEqual([]);
    expect(fresh.heroes).toEqual({
      roster: {},
      shards: 0,
      pity: { sinceHighGrade: 0, totalPulls: 0 },
    });
    expect(fresh.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
    expect(fresh.formation.back).toHaveLength(GAME_STATE.FORMATION.BACK_SLOTS);
    expect(fresh.formation.front.every((s) => s === null)).toBe(true);
    expect(fresh.formation.back.every((s) => s === null)).toBe(true);
    expect(fresh.season).toEqual({
      current: 1,
      progress: 0,
      xp: 0,
      tier: 0,
      claimedFree: 0,
      claimedPremium: 0,
      premiumUnlocked: false,
      resistance: 0,
    });
    expect(fresh.missions).toEqual({
      dayKey: -1,
      weekKey: -1,
      daily: {},
      claimedTasks: [],
      armsScore: 0,
      claimedMilestones: [],
      weekActivity: 0,
      weekly: {},
    });
    expect(fresh.campaign).toEqual({ clearedStages: [], highestWave: -1 });
    expect(fresh.league).toEqual({
      alliance: 'league.alliance.player',
      period: 0,
      wins: 0,
      losses: 0,
      bestRank: 0,
    });
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
    expect(state.resources).toEqual(freshResources());
    expect(state.buildings).toEqual(freshBuildings());
    expect(state.heroes).toEqual({
      roster: {},
      shards: 0,
      pity: { sinceHighGrade: 0, totalPulls: 0 },
    });
    expect(state.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
    expect(state.formation.back).toHaveLength(GAME_STATE.FORMATION.BACK_SLOTS);
    expect(state.season).toEqual(SaveManager.freshGame().season);
    expect(state.missions).toEqual(SaveManager.freshGame().missions);
    expect(state.campaign).toEqual(SaveManager.freshGame().campaign);
    expect(state.league).toEqual(SaveManager.freshGame().league);
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
    expect(state.resources).toEqual(freshResources());
    expect(state.buildings).toEqual(freshBuildings());
    expect(state.formation.front).toHaveLength(GAME_STATE.FORMATION.FRONT_SLOTS);
  });

  it('normalizes malformed sub-states and clamps record values', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        miniGame: { coins: 5 },
        resources: { stockpiles: { rations: 10.9, steel: -4, bogus: 99 }, lastTickTimestamp: -1 },
        buildings: { levels: { hq: 2.7, barracks: -1 }, queue: 'nope' },
        formation: { front: ['ironward', 'stormvolley', 'skytalon'], back: 'nope' },
        season: { current: 2.9, progress: 40 },
        missions: { daily: { arms: 3.6 }, weekly: 'bad' },
      }),
    );
    const { state } = new SaveManager(storage).load();
    // Known keys clamped to non-negative ints; unknown keys dropped; missing
    // keys (fuel/circuitry) filled from config start amounts.
    expect(state.resources.stockpiles.rations).toBe(10); // floored
    expect(state.resources.stockpiles.steel).toBe(0); // negative -> 0
    expect(state.resources.stockpiles).not.toHaveProperty('bogus');
    expect(Object.keys(state.resources.stockpiles).sort()).toEqual(
      ['circuitry', 'fuel', 'rations', 'steel'],
    );
    expect(state.resources.lastTickTimestamp).toBe(0); // negative -> 0
    // Building levels floored; HQ floored at 1; malformed queue -> empty.
    expect(state.buildings.levels.hq).toBe(2); // floored
    expect(state.buildings.levels.barracks).toBe(0); // negative -> 0
    expect(state.buildings.queue).toEqual([]);
    // Extra front slot dropped to config size (real catalog heroes kept);
    // back reset to nulls.
    expect(state.formation.front).toEqual(['ironward', 'stormvolley']);
    expect(state.formation.back).toEqual([null, null, null]);
    expect(state.season).toEqual({
      current: 2,
      progress: 40,
      xp: 40,
      tier: 0,
      claimedFree: 0,
      claimedPremium: 0,
      premiumUnlocked: false,
      resistance: 0,
    });
    expect(state.missions.daily).toEqual({ arms: 3 });
    expect(state.missions.weekly).toEqual({});
    expect(state.missions.dayKey).toBe(-1);
    expect(state.missions.armsScore).toBe(0);
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

  /* FEAT-003: hero roster / pity / formation persistence. */

  it('round-trips a populated hero roster, shards, pity, and formation', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const populated: GameState = {
      ...state(),
      heroes: {
        roster: {
          ironward: { id: 'ironward', level: 12, stars: 3, skillLevel: 4, dupes: 2 },
          stormvolley: { id: 'stormvolley', level: 5, stars: 1, skillLevel: 1, dupes: 0 },
        },
        shards: 640,
        pity: { sinceHighGrade: 7, totalPulls: 33 },
      },
      formation: { front: ['ironward', null], back: ['stormvolley', null, null] },
    };
    mgr.save(populated);
    const { state: loaded } = mgr.load();
    expect(loaded.heroes.roster.ironward).toEqual({
      id: 'ironward',
      level: 12,
      stars: 3,
      skillLevel: 4,
      dupes: 2,
    });
    expect(loaded.heroes.shards).toBe(640);
    expect(loaded.heroes.pity).toEqual({ sinceHighGrade: 7, totalPulls: 33 });
    expect(loaded.formation.front).toEqual(['ironward', null]);
    expect(loaded.formation.back).toEqual(['stormvolley', null, null]);
  });

  it('drops unknown heroes and clamps hero progression to grade caps on load', () => {
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        miniGame: { coins: 1 },
        heroes: {
          roster: {
            ironward: { id: 'ironward', level: 99999, stars: 99, skillLevel: 99, dupes: -1 },
            'ghost-hero': { id: 'ghost-hero', level: 5 },
          },
          shards: -50,
          pity: { sinceHighGrade: -2, totalPulls: 3.9 },
        },
        formation: { front: ['ironward', 'ironward'], back: ['ghost-hero', null, null] },
      }),
    );
    const { state } = new SaveManager(storage).load();
    // Unknown hero id dropped from the roster.
    expect(state.heroes.roster['ghost-hero']).toBeUndefined();
    // Real hero clamped to its UR grade caps (level 80 / 6 stars / skill 10).
    const ironward = state.heroes.roster.ironward;
    expect(ironward.level).toBe(80);
    expect(ironward.stars).toBe(6);
    expect(ironward.skillLevel).toBe(10);
    expect(ironward.dupes).toBe(0);
    expect(state.heroes.shards).toBe(0);
    expect(state.heroes.pity).toEqual({ sinceHighGrade: 0, totalPulls: 3 });
    // Duplicate placement de-duped, unknown hero cleared to null.
    expect(state.formation.front).toEqual(['ironward', null]);
    expect(state.formation.back).toEqual([null, null, null]);
  });
});
