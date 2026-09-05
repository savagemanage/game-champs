import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, type GameSnapshot } from './SaveManager';
import { ResourceStore } from './ResourceStore';
import { BuildingSystem } from './BuildingSystem';
import { TrainingQueue } from './TrainingQueue';
import { ECONOMY } from '../config/GameConfig';
import { outputPerSec } from '../config/BuildingConfig';
import { troopDef } from '../config/TroopConfig';

/**
 * Unit tests for the versioned save layer with an INJECTED fake storage (no
 * window dependency): round-trip fidelity and offline idle-gain reconciliation.
 */
describe('SaveManager', () => {
  function snapshot(): GameSnapshot {
    const resources = new ResourceStore({ food: 100, wood: 200, stone: 300, gold: 40 });
    const buildings = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'farm', level: 2, upgradeEndsAt: null },
      { kind: 'barracks', level: 1, upgradeEndsAt: null },
    ]);
    const training = new TrainingQueue(undefined, { spearman: 4, archer: 1, knight: 0 });
    return { resources, buildings, training, waveCleared: 5 };
  }

  it('loads a fresh game when storage is empty', () => {
    const mgr = new SaveManager(memoryStorage());
    const result = mgr.load(0);
    expect(result.loaded).toBe(false);
    expect(result.snapshot.buildings.townCenterLevel).toBe(1);
    expect(result.snapshot.resources.get('food')).toBe(ECONOMY.START.food);
  });

  it('produces a versioned plain JSON object on serialize', () => {
    const state = SaveManager.serialize(snapshot(), 123456);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.lastSeenAt).toBe(123456);
    expect(state.army).toEqual({ spearman: 4, archer: 1, knight: 0 });
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
    expect(loaded.snapshot.resources.balances).toEqual({ food: 100, wood: 200, stone: 300, gold: 40 });
    expect(loaded.snapshot.buildings.townCenterLevel).toBe(3);
    expect(loaded.snapshot.buildings.level('farm')).toBe(2);
    expect(loaded.snapshot.training.army).toEqual({ spearman: 4, archer: 1, knight: 0 });
    expect(loaded.snapshot.waveCleared).toBe(5);
  });

  it('applies offline idle gains capped and scaled by efficiency', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const saveTime = 0;
    mgr.save(snapshot(), saveTime);

    const elapsedSec = 3600; // 1 hour, under the 8h cap
    const loaded = mgr.load(saveTime + elapsedSec * 1000);
    expect(loaded.offlineSeconds).toBe(elapsedSec);

    // Only the level-2 farm produces (food). Expected = rate * seconds * efficiency.
    const expectedFood = outputPerSec('farm', 2) * elapsedSec * ECONOMY.OFFLINE_EFFICIENCY;
    expect(loaded.offlineGains.food).toBeCloseTo(expectedFood, 4);
    expect(loaded.snapshot.resources.get('food')).toBeCloseTo(100 + expectedFood, 4);
    // Non-produced resources are unchanged.
    expect(loaded.snapshot.resources.get('stone')).toBe(300);
  });

  it('splits the offline window at an upgrade boundary rather than over-crediting', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);

    // A farm at L2 with an in-progress upgrade to L3 that finishes 600s into a
    // 1000s offline window. Production must be credited at L2 for the first
    // 600s and L3 only for the final 400s - NOT L3 for the whole window.
    const t0 = 1_000_000;
    const windowSec = 1000;
    const boundaryOffset = 600; // seconds into the window the upgrade completes
    const resources = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const buildings = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'farm', level: 2, upgradeEndsAt: t0 + boundaryOffset * 1000 },
    ]);
    const training = new TrainingQueue(undefined, { spearman: 0, archer: 0, knight: 0 });
    mgr.save({ resources, buildings, training, waveCleared: 0 }, t0);

    const loaded = mgr.load(t0 + windowSec * 1000);
    expect(loaded.offlineSeconds).toBe(windowSec);
    // Farm ended at L3.
    expect(loaded.snapshot.buildings.level('farm')).toBe(3);

    const eff = ECONOMY.OFFLINE_EFFICIENCY;
    const expectedSplit =
      outputPerSec('farm', 2) * boundaryOffset * eff +
      outputPerSec('farm', 3) * (windowSec - boundaryOffset) * eff;
    const naiveWhole = outputPerSec('farm', 3) * windowSec * eff;

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
    const t = troopDef('spearman').trainTimeMs;

    const snap = snapshot();
    // Queue 2 spearmen at t=0 (Barracks present); they complete at 2*t.
    const rich = new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });
    snap.training.enqueue('spearman', 2, rich, 0, true);
    mgr.save(snap, 0);

    const loaded = mgr.load(2 * t + 1);
    // Army had 4 spearmen; +2 completed offline = 6.
    expect(loaded.snapshot.training.army.spearman).toBe(6);
    expect(loaded.snapshot.training.length).toBe(0);
  });

  it('starts fresh on a version mismatch instead of crashing', () => {
    const storage = memoryStorage();
    storage.setItem('kingdom-rise:save', JSON.stringify({ version: 999, resources: {} }));
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.townCenterLevel).toBe(1);
  });

  it('starts fresh on corrupt / unparseable JSON instead of crashing', () => {
    const storage = memoryStorage();
    storage.setItem('kingdom-rise:save', '{not valid json at all');
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.townCenterLevel).toBe(1);
    expect(loaded.snapshot.resources.get('food')).toBe(ECONOMY.START.food);
    expect(loaded.offlineSeconds).toBe(0);
  });

  it('starts fresh when the stored JSON is not an object (e.g. a bare value)', () => {
    const storage = memoryStorage();
    storage.setItem('kingdom-rise:save', '42');
    const mgr = new SaveManager(storage);
    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(false);
    expect(loaded.snapshot.buildings.townCenterLevel).toBe(1);
  });

  it('clear() removes the save slot', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    mgr.save(snapshot(), 0);
    mgr.clear();
    expect(mgr.load(0).loaded).toBe(false);
  });
});
