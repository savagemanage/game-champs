import { describe, it, expect } from 'vitest';
import { BuildingSystem } from './BuildingSystem';
import { ResourceStore } from './ResourceStore';
import { TrainingQueue } from './TrainingQueue';
import { defenseValue, outputPerSec, upgradeTimeMs } from '../config/BuildingConfig';
import { ECONOMY } from '../config/GameConfig';

/**
 * Unit tests for the building/upgrade tree: prerequisite + Town-Center gating,
 * affordability, timed completion, and aggregate production. Each test fails if
 * the corresponding rule were reverted.
 */
describe('BuildingSystem', () => {
  const richStore = () => new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });

  it('a fresh game has a level-1 Town Center and nothing else', () => {
    const bs = new BuildingSystem();
    expect(bs.townCenterLevel).toBe(1);
    expect(bs.level('farm')).toBe(0);
    expect(bs.hasBarracks).toBe(false);
  });

  it('canUpgrade refuses when the Town Center prerequisite is unmet', () => {
    const bs = new BuildingSystem();
    // Mine requires Town Center level 3; TC is level 1 -> blocked by prereq.
    const check = bs.canUpgrade('mine', richStore());
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('prereq');
  });

  it('canUpgrade refuses when resources are insufficient', () => {
    const bs = new BuildingSystem();
    const brokeStore = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    // Farm's prereq (TC level 1) is met, but there is no wood/food.
    const check = bs.canUpgrade('farm', brokeStore);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
  });

  it("a building's level may not exceed the Town Center level", () => {
    const bs = new BuildingSystem([
      { kind: 'town_center', level: 1, upgradeEndsAt: null },
      { kind: 'farm', level: 1, upgradeEndsAt: null },
    ]);
    // Farm is already at TC level (1) -> cannot upgrade further until TC grows.
    const check = bs.canUpgrade('farm', richStore());
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('prereq');
  });

  it('spends resources, then completes the upgrade after the configured time', () => {
    const bs = new BuildingSystem();
    const store = richStore();
    const before = store.get('wood');

    // Build the first Farm (level 0 -> 1). Prereq TC level 1 is met.
    const check = bs.startUpgrade('farm', store, 1000);
    expect(check.ok).toBe(true);
    expect(store.get('wood')).toBeLessThan(before); // cost was charged
    expect(bs.isUpgrading('farm')).toBe(true);
    expect(bs.level('farm')).toBe(0); // not done yet

    const dur = upgradeTimeMs('farm', 0);
    // Just before completion: still building.
    bs.update(1000 + dur - 1);
    expect(bs.level('farm')).toBe(0);
    // At/after completion: level increments and timer clears.
    const done = bs.update(1000 + dur);
    expect(done).toContain('farm');
    expect(bs.level('farm')).toBe(1);
    expect(bs.isUpgrading('farm')).toBe(false);
  });

  it('cannot start a second upgrade while one is in progress (busy)', () => {
    const bs = new BuildingSystem();
    const store = richStore();
    bs.startUpgrade('farm', store, 0);
    const check = bs.canUpgrade('farm', store);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('busy');
  });

  it('aggregates producer output at current levels', () => {
    const bs = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'farm', level: 2, upgradeEndsAt: null },
      { kind: 'lumber_mill', level: 1, upgradeEndsAt: null },
    ]);
    const rates = bs.productionRates();
    expect(rates.food).toBeCloseTo(outputPerSec('farm', 2), 5);
    expect(rates.wood).toBeCloseTo(outputPerSec('lumber_mill', 1), 5);
    expect(rates.stone).toBe(0);
    // Higher farm level produces strictly more food.
    expect(outputPerSec('farm', 2)).toBeGreaterThan(outputPerSec('farm', 1));
  });

  it('townDefense is 0 with no defensive buildings and grows with their levels', () => {
    // A fresh town (Town Center only) has no walls/watchtowers -> zero defense.
    const bare = new BuildingSystem();
    expect(bare.townDefense()).toBe(0);

    // A wall at level 1 contributes its per-level defense; a higher level more.
    const walled1 = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'wall', level: 1, upgradeEndsAt: null },
    ]);
    expect(walled1.townDefense()).toBe(defenseValue('wall', 1));
    expect(walled1.townDefense()).toBeGreaterThan(0);

    const walled3 = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'wall', level: 3, upgradeEndsAt: null },
    ]);
    // Defense grows monotonically with level (linear: 3x a level-1 wall).
    expect(walled3.townDefense()).toBeGreaterThan(walled1.townDefense());
    expect(walled3.townDefense()).toBe(defenseValue('wall', 3));

    // Walls and watchtowers stack additively into the aggregate.
    const both = new BuildingSystem([
      { kind: 'town_center', level: 3, upgradeEndsAt: null },
      { kind: 'wall', level: 2, upgradeEndsAt: null },
      { kind: 'watchtower', level: 1, upgradeEndsAt: null },
    ]);
    expect(both.townDefense()).toBe(defenseValue('wall', 2) + defenseValue('watchtower', 1));
  });

  it('non-defensive buildings never contribute to town defense', () => {
    const bs = new BuildingSystem([
      { kind: 'town_center', level: 5, upgradeEndsAt: null },
      { kind: 'farm', level: 5, upgradeEndsAt: null },
      { kind: 'barracks', level: 3, upgradeEndsAt: null },
      { kind: 'research', level: 3, upgradeEndsAt: null },
    ]);
    expect(bs.townDefense()).toBe(0);
  });

  it('the Ramparts (wall) are gated behind Town Center level 2', () => {
    const bs = new BuildingSystem(); // fresh: Town Center level 1.
    const blocked = bs.canUpgrade('wall', richStore());
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('prereq');

    const bs2 = new BuildingSystem([{ kind: 'town_center', level: 2, upgradeEndsAt: null }]);
    expect(bs2.canUpgrade('wall', richStore()).ok).toBe(true);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const bs = new BuildingSystem([
      { kind: 'town_center', level: 2, upgradeEndsAt: null },
      { kind: 'barracks', level: 1, upgradeEndsAt: 5000 },
    ]);
    const restored = BuildingSystem.fromJSON(bs.toJSON());
    expect(restored.townCenterLevel).toBe(2);
    expect(restored.hasBarracks).toBe(true);
    expect(restored.upgradeEndsAt('barracks')).toBe(5000);
  });

  it('the Barracks is gated behind Town Center level 2 on a fresh game', () => {
    const bs = new BuildingSystem(); // fresh: Town Center level 1 only.
    // At Town Center level 1 the Barracks prerequisite is unmet.
    const blocked = bs.canUpgrade('barracks', richStore());
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('prereq');

    // After raising the Town Center to level 2, the Barracks becomes buildable.
    const bs2 = new BuildingSystem([{ kind: 'town_center', level: 2, upgradeEndsAt: null }]);
    const ok = bs2.canUpgrade('barracks', richStore());
    expect(ok.ok).toBe(true);
  });

  it('a fresh game can afford the Town Center Lv.2 -> Barracks early loop from the starting stockpile', () => {
    const bs = new BuildingSystem();
    const store = new ResourceStore({ ...ECONOMY.START });

    // Step 1: upgrade the Town Center from level 1 to level 2.
    const tcStart = bs.startUpgrade('town_center', store, 0);
    expect(tcStart.ok).toBe(true);
    bs.update(bs.upgradeEndsAt('town_center') ?? 0);
    expect(bs.townCenterLevel).toBe(2);

    // Step 2: with Town Center level 2, the Barracks prereq is met AND the
    // remaining starting resources cover its cost (no silent wall).
    const barracksCheck = bs.canUpgrade('barracks', store);
    expect(barracksCheck.ok).toBe(true);
  });

  it('end-to-end: build the Barracks, then TrainingQueue.enqueue succeeds (was no_barracks before)', () => {
    const bs = new BuildingSystem();
    const store = new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });
    const queue = new TrainingQueue();

    // Before the Barracks exists, enqueue is refused with 'no_barracks'.
    const before = queue.enqueue('spearman', 1, store, 0, bs.hasBarracks);
    expect(before.ok).toBe(false);
    expect(before.reason).toBe('no_barracks');

    // Raise Town Center to level 2 (Barracks prerequisite).
    bs.startUpgrade('town_center', store, 0);
    bs.update(bs.upgradeEndsAt('town_center') ?? 0);
    expect(bs.townCenterLevel).toBe(2);

    // Build the Barracks (start + complete its upgrade).
    const barracksStart = bs.startUpgrade('barracks', store, 1000);
    expect(barracksStart.ok).toBe(true);
    bs.update(bs.upgradeEndsAt('barracks') ?? 0);
    expect(bs.hasBarracks).toBe(true);

    // Now the Train action enqueues successfully.
    const after = queue.enqueue('spearman', 1, store, 2000, bs.hasBarracks);
    expect(after.ok).toBe(true);
    expect(after.reason).toBeUndefined();
  });
});
