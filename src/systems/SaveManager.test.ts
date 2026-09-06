import { describe, it, expect } from 'vitest';
import { SaveManager, memoryStorage, SAVE_VERSION, type GameSnapshot } from './SaveManager';
import { ResourceStore } from './ResourceStore';
import { BuildingSystem } from './BuildingSystem';
import { TrainingQueue } from './TrainingQueue';
import { ResearchSystem } from './ResearchSystem';
import { HeroSystem } from './HeroSystem';
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
    const research = new ResearchSystem();
    const heroes = new HeroSystem();
    return { resources, buildings, training, research, heroes, waveCleared: 5 };
  }

  /** A full army bundle over every troop kind (new kinds default to zero). */
  function fullArmy(a: Partial<Record<string, number>>): Record<string, number> {
    return { spearman: 0, archer: 0, knight: 0, cavalry: 0, siege: 0, ...a };
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
    expect(state.army).toEqual(fullArmy({ spearman: 4, archer: 1 }));
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
    expect(loaded.snapshot.training.army).toEqual(fullArmy({ spearman: 4, archer: 1 }));
    expect(loaded.snapshot.waveCleared).toBe(5);
  });

  it('loads an OLD save whose army lacks the new troop kinds without crashing', () => {
    // Simulate a save written before cavalry/siege existed: the army object has
    // only the three original kinds. deserialize/normalizeArmy must backfill
    // the new kinds to 0 rather than crash or leave them undefined.
    const storage = memoryStorage();
    const oldState = {
      version: 1, // a genuine v1 save (predates research)
      resources: { food: 10, wood: 10, stone: 10, gold: 10 },
      buildings: [{ kind: 'town_center', level: 1, upgradeEndsAt: null }],
      army: { spearman: 3, archer: 2, knight: 1 }, // no cavalry / siege
      trainingQueue: [],
      waveCleared: 2,
      lastSeenAt: 0,
    };
    storage.setItem('kingdom-rise:save', JSON.stringify(oldState));
    const mgr = new SaveManager(storage);

    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(true);
    expect(loaded.snapshot.training.army).toEqual(
      fullArmy({ spearman: 3, archer: 2, knight: 1 }),
    );
  });

  it('migrates a v1 save (no research field) into a fresh valid research state', () => {
    // A version-1 save predates the Scholars' Hall and has no `research` field.
    // It must load without crashing and yield an empty-but-valid ResearchSystem
    // (nothing unlocked, no active research, all multipliers neutral).
    const storage = memoryStorage();
    const v1 = {
      version: 1,
      resources: { food: 50, wood: 50, stone: 50, gold: 50 },
      buildings: [{ kind: 'town_center', level: 2, upgradeEndsAt: null }],
      army: { spearman: 1, archer: 0, knight: 0 },
      trainingQueue: [],
      waveCleared: 1,
      lastSeenAt: 0,
      // no `research` key
    };
    storage.setItem('kingdom-rise:save', JSON.stringify(v1));
    const mgr = new SaveManager(storage);

    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(true);
    const research = loaded.snapshot.research;
    expect(research.unlocked).toEqual([]);
    expect(research.isBusy).toBe(false);
    // Every aggregate multiplier is neutral on a fresh state.
    expect(research.productionMultiplier()).toBe(1);
    expect(research.trainSpeedMultiplier()).toBe(1);
    expect(research.combatAttackMultiplier()).toBe(1);
    expect(research.storageMultiplier()).toBe(1);
    expect(research.offlineEfficiencyMultiplier()).toBe(1);
  });

  it('round-trips research state (unlocked techs + active slot) through save -> load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const now = 2_000_000;

    const snap = snapshot();
    // Unlock one tech and start another (single slot busy).
    const rich = new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });
    snap.research.startResearch('crop_rotation', rich, 0, 1);
    snap.research.update(snap.research.remainingMs(0)); // complete it at its own end
    snap.research.startResearch('sharpened_blades', rich, now, 1);
    expect(snap.research.isUnlocked('crop_rotation')).toBe(true);
    expect(snap.research.activeTech).toBe('sharpened_blades');

    mgr.save(snap, now);
    // Load at the same instant so the active research is NOT yet complete.
    const loaded = mgr.load(now);
    expect(loaded.snapshot.research.isUnlocked('crop_rotation')).toBe(true);
    expect(loaded.snapshot.research.activeTech).toBe('sharpened_blades');
    expect(loaded.snapshot.research.productionMultiplier()).toBeCloseTo(1.1, 6);
  });

  it('migrates a v2 save (no heroes field) into a fresh valid empty roster', () => {
    // A version-2 save predates the heroes feature and has no `heroes` field.
    // It must load without crashing and yield an empty-but-valid HeroSystem
    // (no heroes recruited, none active, both multipliers neutral).
    const storage = memoryStorage();
    const v2 = {
      version: 2,
      resources: { food: 50, wood: 50, stone: 50, gold: 50 },
      buildings: [{ kind: 'town_center', level: 2, upgradeEndsAt: null }],
      army: { spearman: 1, archer: 0, knight: 0 },
      trainingQueue: [],
      waveCleared: 1,
      research: { unlocked: [], active: null },
      lastSeenAt: 0,
      // no `heroes` key
    };
    storage.setItem('kingdom-rise:save', JSON.stringify(v2));
    const mgr = new SaveManager(storage);

    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(true);
    const heroes = loaded.snapshot.heroes;
    expect(heroes.recruited).toEqual([]);
    expect(heroes.activeHero).toBeNull();
    expect(heroes.combatMultiplier()).toBe(1);
    expect(heroes.economyMultiplier()).toBe(1);
  });

  it('round-trips hero state (recruited progress + active hero) through save -> load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const now = 3_000_000;

    const snap = snapshot();
    const rich = new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });
    snap.heroes.recruit('ser_alden', rich); // war hero, auto-active
    snap.heroes.levelUp('ser_alden', rich);
    snap.heroes.addShards('ser_alden', 25);
    snap.heroes.starUp('ser_alden');
    expect(snap.heroes.activeHero).toBe('ser_alden');

    mgr.save(snap, now);
    const loaded = mgr.load(now);
    const heroes = loaded.snapshot.heroes;
    expect(heroes.recruited).toEqual(['ser_alden']);
    expect(heroes.activeHero).toBe('ser_alden');
    const p = heroes.progress('ser_alden')!;
    expect(p.level).toBe(2);
    expect(p.stars).toBe(1);
    expect(p.shards).toBe(15); // 25 accrued - 10 spent on the star
    // A war hero's bonus round-trips into the combat multiplier (economy stays 1).
    expect(heroes.combatMultiplier()).toBeGreaterThan(1);
    expect(heroes.economyMultiplier()).toBe(1);
  });

  it('loads an old save without defensive buildings as zero town defense', () => {
    // Saves written before the defenses feature simply have no wall/watchtower
    // building states. They must load with those buildings at level 0, so the
    // town's aggregate defense is 0 (no crash, no undefined).
    const storage = memoryStorage();
    const old = {
      version: 3,
      resources: { food: 50, wood: 50, stone: 50, gold: 50 },
      buildings: [
        { kind: 'town_center', level: 3, upgradeEndsAt: null },
        { kind: 'farm', level: 2, upgradeEndsAt: null },
      ],
      army: { spearman: 1, archer: 0, knight: 0, cavalry: 0, siege: 0 },
      trainingQueue: [],
      waveCleared: 1,
      research: { unlocked: [], active: null },
      heroes: { recruited: {}, active: null },
      lastSeenAt: 0,
      // no wall / watchtower building states
    };
    storage.setItem('kingdom-rise:save', JSON.stringify(old));
    const mgr = new SaveManager(storage);

    const loaded = mgr.load(0);
    expect(loaded.loaded).toBe(true);
    expect(loaded.snapshot.buildings.level('wall')).toBe(0);
    expect(loaded.snapshot.buildings.level('watchtower')).toBe(0);
    expect(loaded.snapshot.buildings.townDefense()).toBe(0);
  });

  it('round-trips defensive building levels (town defense) through save -> load', () => {
    const storage = memoryStorage();
    const mgr = new SaveManager(storage);
    const now = 4_000_000;

    const snap = snapshot();
    // Add a wall and a watchtower to the snapshot's buildings via a fresh set.
    const buildings = new BuildingSystem([
      { kind: 'town_center', level: 4, upgradeEndsAt: null },
      { kind: 'wall', level: 3, upgradeEndsAt: null },
      { kind: 'watchtower', level: 2, upgradeEndsAt: null },
    ]);
    const expected = buildings.townDefense();
    expect(expected).toBeGreaterThan(0);
    mgr.save({ ...snap, buildings }, now);

    const loaded = mgr.load(now);
    expect(loaded.snapshot.buildings.level('wall')).toBe(3);
    expect(loaded.snapshot.buildings.level('watchtower')).toBe(2);
    expect(loaded.snapshot.buildings.townDefense()).toBe(expected);
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
    mgr.save({ resources, buildings, training, research: new ResearchSystem(), heroes: new HeroSystem(), waveCleared: 0 }, t0);

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
