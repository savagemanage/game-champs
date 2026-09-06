import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, SAVE_KEY, type GameSnapshot } from './SaveManager';
import { ResourceStore } from './ResourceStore';
import { BuildingSystem } from './BuildingSystem';
import { TrainingQueue } from './TrainingQueue';
import { WarmthSystem } from './WarmthSystem';
import { ECONOMY, WARMTH } from '../config/GameConfig';
import { outputPerSec } from '../config/BuildingConfig';
import { troopDef } from '../config/TroopConfig';

/**
 * Unit tests for the versioned save layer with an INJECTED fake storage (no
 * window dependency): round-trip fidelity and offline idle-gain reconciliation.
 */
describe('SaveManager', () => {
  function snapshot(): GameSnapshot {
    const resources = new ResourceStore({ food: 100, wood: 200, coal: 300, iron: 40 });
    const buildings = new BuildingSystem([
      { kind: 'furnace', level: 3, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 2, upgradeEndsAt: null },
      { kind: 'war_camp', level: 1, upgradeEndsAt: null },
    ]);
    const training = new TrainingQueue(undefined, { trapper: 4, marksman: 1, vanguard: 0 });
    return { resources, buildings, training, warmth: new WarmthSystem(), waveCleared: 5 };
  }

  it('loads a fresh game when storage is empty', () => {
    const mgr = new SaveManager(memoryStorage());
    const result = mgr.load(0);
    expect(result.loaded).toBe(false);
    expect(result.snapshot.buildings.furnaceLevel).toBe(1);
    expect(result.snapshot.resources.get('food')).toBe(ECONOMY.START.food);
  });

  it('uses the Frosthold save namespace', () => {
    expect(SAVE_KEY).toBe('frosthold:save');
    expect(SAVE_VERSION).toBe(2);
  });

  it('produces a versioned plain JSON object on serialize', () => {
    const state = SaveManager.serialize(snapshot(), 123456);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.lastSeenAt).toBe(123456);
    expect(state.army).toEqual({ trapper: 4, marksman: 1, vanguard: 0 });
    expect(state.waveCleared).toBe(5);
    // Must be plain-JSON serializable.
    expect(() => JSON.stringify(state)).not.toThrow();
  });

  it('round-trips full state through save -> load with no elapsed time', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const now = 1_000_000;
    mgr.save(snapshot(), now);

    const loaded = mgr.load(now); // same instant -> no offline gains
    expect(loaded.loaded).toBe(true);
    expect(loaded.offlineSeconds).toBe(0);
    expect(loaded.snapshot.resources.balances).toEqual({ food: 100, wood: 200, coal: 300, iron: 40 });
    expect(loaded.snapshot.buildings.furnaceLevel).toBe(3);
    expect(loaded.snapshot.buildings.level('hunters_hut')).toBe(2);
    expect(loaded.snapshot.training.army).toEqual({ trapper: 4, marksman: 1, vanguard: 0 });
    expect(loaded.snapshot.waveCleared).toBe(5);
  });

  it('applies offline idle gains capped and scaled by efficiency', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const saveTime = 0;
    // Ample fuel so warmth stays at max over the window and this test isolates
    // the capping / OFFLINE_EFFICIENCY scaling from the warmth penalty. Warmth
    // reconciliation is covered separately below.
    const resources = new ResourceStore({ food: 100, wood: 1e9, coal: 1e9, iron: 40 });
    const buildings = new BuildingSystem([
      { kind: 'furnace', level: 3, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 2, upgradeEndsAt: null },
      { kind: 'war_camp', level: 1, upgradeEndsAt: null },
    ]);
    const training = new TrainingQueue(undefined, { trapper: 4, marksman: 1, vanguard: 0 });
    mgr.save({ resources, buildings, training, warmth: new WarmthSystem(), waveCleared: 5 }, saveTime);

    const elapsedSec = 3600; // 1 hour, under the 8h cap
    const loaded = mgr.load(saveTime + elapsedSec * 1000);
    expect(loaded.offlineSeconds).toBe(elapsedSec);

    // Only the level-2 hunters' hut produces (food). Warmth is pinned at max
    // (multiplier 1.0), so expected = rate * seconds * efficiency.
    const expectedFood = outputPerSec('hunters_hut', 2) * elapsedSec * ECONOMY.OFFLINE_EFFICIENCY;
    expect(loaded.offlineGains.food).toBeCloseTo(expectedFood, 4);
    expect(loaded.snapshot.resources.get('food')).toBeCloseTo(100 + expectedFood, 4);
    // Warmth held at its Furnace-L3 maximum throughout.
    expect(loaded.snapshot.warmth.warmth).toBe(loaded.snapshot.warmth.maxWarmth(3));
  });

  it('splits the offline window at an upgrade boundary rather than over-crediting', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);

    // A hunters' hut at L2 with an in-progress upgrade to L3 that finishes 600s
    // into a 1000s offline window. Production must be credited at L2 for the
    // first 600s and L3 only for the final 400s - NOT L3 for the whole window.
    const t0 = 1_000_000;
    const windowSec = 1000;
    const boundaryOffset = 600; // seconds into the window the upgrade completes
    // Food starts at 0 (measures pure production); ample wood/coal keeps the
    // Furnace fueled so warmth stays pinned at max and this test isolates the
    // upgrade-boundary split with no warmth penalty over the window.
    const resources = new ResourceStore({ food: 0, wood: 1e9, coal: 1e9, iron: 0 });
    const buildings = new BuildingSystem([
      { kind: 'furnace', level: 3, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 2, upgradeEndsAt: t0 + boundaryOffset * 1000 },
    ]);
    const training = new TrainingQueue(undefined, { trapper: 0, marksman: 0, vanguard: 0 });
    mgr.save({ resources, buildings, training, warmth: new WarmthSystem(), waveCleared: 0 }, t0);

    const loaded = mgr.load(t0 + windowSec * 1000);
    expect(loaded.offlineSeconds).toBe(windowSec);
    // Hunters' hut ended at L3.
    expect(loaded.snapshot.buildings.level('hunters_hut')).toBe(3);

    const eff = ECONOMY.OFFLINE_EFFICIENCY;
    const expectedSplit =
      outputPerSec('hunters_hut', 2) * boundaryOffset * eff +
      outputPerSec('hunters_hut', 3) * (windowSec - boundaryOffset) * eff;
    const naiveWhole = outputPerSec('hunters_hut', 3) * windowSec * eff;

    expect(loaded.offlineGains.food).toBeCloseTo(expectedSplit, 4);
    // The split credit is strictly less than the old over-credit (post-upgrade
    // rate applied to the whole window), proving the fix.
    expect(loaded.offlineGains.food).toBeLessThan(naiveWhole);
    expect(loaded.snapshot.resources.get('food')).toBeCloseTo(expectedSplit, 4);
  });

  it('caps offline time at ECONOMY.MAX_OFFLINE_SECONDS', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    mgr.save(snapshot(), 0);

    const wayTooLong = (ECONOMY.MAX_OFFLINE_SECONDS + 100_000) * 1000;
    const loaded = mgr.load(wayTooLong);
    expect(loaded.offlineSeconds).toBe(ECONOMY.MAX_OFFLINE_SECONDS);
  });

  it('completes training that finished while offline on load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const t = troopDef('trapper').trainTimeMs;

    const snap = snapshot();
    // Queue 2 trappers at t=0 (War Camp present); they complete at 2*t.
    const rich = new ResourceStore({ food: 99999, wood: 99999, coal: 99999, iron: 99999 });
    snap.training.enqueue('trapper', 2, rich, 0, true);
    mgr.save(snap, 0);

    const loaded = mgr.load(2 * t + 1);
    // Army had 4 trappers; +2 completed offline = 6.
    expect(loaded.snapshot.training.army.trapper).toBe(6);
    expect(loaded.snapshot.training.length).toBe(0);
  });

  it('starts fresh on a version mismatch instead of crashing', () => {
    const storage = memoryStorage();
    // A legacy version-1 (kingdom-rise) save at the Frosthold key must be
    // treated as a mismatch and fall back to a fresh frozen settlement.
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, resources: {} }));
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.furnaceLevel).toBe(1);
  });

  it('starts fresh on corrupt / unparseable JSON instead of crashing', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{not valid json at all');
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.furnaceLevel).toBe(1);
    expect(loaded.snapshot.resources.get('food')).toBe(ECONOMY.START.food);
    expect(loaded.offlineSeconds).toBe(0);
  });

  it('starts fresh when the stored JSON is not an object (e.g. a bare value)', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '42');
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.furnaceLevel).toBe(1);
  });

  it('clear() removes the save slot', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    mgr.save(snapshot(), 0);
    mgr.clear();
    expect(mgr.load(0).loaded).toBe(false);
  });

  it('persists the warmth value across save -> load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const snap = snapshot();
    // Re-open the snapshot with a partially-cold Furnace.
    const partial: GameSnapshot = { ...snap, warmth: new WarmthSystem(37) };
    const state = SaveManager.serialize(partial, 0);
    expect(state.warmth).toBe(37);

    mgr.save(partial, 0);
    const loaded = mgr.load(0); // no elapsed time -> warmth unchanged
    expect(loaded.snapshot.warmth.warmth).toBe(37);
  });

  it('reconciles warmth over an offline window: decays when fuel runs out', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    // A hold with a producing hut but NO fuel producers and an empty fuel
    // stockpile: while away, the Furnace runs cold and warmth decays to 0.
    const resources = new ResourceStore({ food: 0, wood: 0, coal: 0, iron: 0 });
    const buildings = new BuildingSystem([
      { kind: 'furnace', level: 1, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 1, upgradeEndsAt: null },
    ]);
    const training = new TrainingQueue(undefined, { trapper: 0, marksman: 0, vanguard: 0 });
    mgr.save({ resources, buildings, training, warmth: new WarmthSystem(WARMTH.MAX_WARMTH), waveCleared: 0 }, 0);

    const elapsedSec = WARMTH.MAX_WARMTH / WARMTH.WARMTH_DECAY_PER_SEC + 100; // long enough to fully freeze
    const loaded = mgr.load(elapsedSec * 1000);
    expect(loaded.snapshot.warmth.warmth).toBe(0);
    // Frozen production is throttled to the floor, so food gained is strictly
    // less than an unthrottled (full-warmth) credit would have been.
    const eff = ECONOMY.OFFLINE_EFFICIENCY;
    const unthrottled = outputPerSec('hunters_hut', 1) * elapsedSec * eff;
    expect(loaded.offlineGains.food).toBeGreaterThan(0);
    expect(loaded.offlineGains.food).toBeLessThan(unthrottled);
  });

  it('holds warmth at max over an offline window when fuel is ample', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const resources = new ResourceStore({ food: 0, wood: 1e9, coal: 1e9, iron: 0 });
    const buildings = new BuildingSystem([
      { kind: 'furnace', level: 2, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 1, upgradeEndsAt: null },
    ]);
    const training = new TrainingQueue(undefined, { trapper: 0, marksman: 0, vanguard: 0 });
    mgr.save({ resources, buildings, training, warmth: new WarmthSystem(WARMTH.MAX_WARMTH), waveCleared: 0 }, 0);

    const loaded = mgr.load(3600 * 1000);
    expect(loaded.snapshot.warmth.warmth).toBe(loaded.snapshot.warmth.maxWarmth(2));
    // Full warmth -> unthrottled offline food credit.
    const expectedFood = outputPerSec('hunters_hut', 1) * 3600 * ECONOMY.OFFLINE_EFFICIENCY;
    expect(loaded.offlineGains.food).toBeCloseTo(expectedFood, 3);
  });

  it('loads a warmth-less (legacy) save to FULL warmth without crashing', () => {
    const storage = memoryStorage();
    // A version-2 save that predates the warmth field (warmth undefined).
    const legacy = {
      version: SAVE_VERSION,
      resources: { food: 10, wood: 10, coal: 10, iron: 10 },
      buildings: [{ kind: 'furnace', level: 1, upgradeEndsAt: null }],
      army: { trapper: 0, marksman: 0, vanguard: 0 },
      trainingQueue: [],
      waveCleared: 0,
      lastSeenAt: 0,
    };
    storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(true);
    expect(loaded.snapshot.warmth.warmth).toBe(WARMTH.MAX_WARMTH);
  });

  it('freshGame starts fully warm', () => {
    const fresh = SaveManager.freshGame();
    expect(fresh.warmth.warmth).toBe(WARMTH.MAX_WARMTH);
  });
});
