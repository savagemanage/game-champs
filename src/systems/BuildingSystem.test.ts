import { describe, it, expect } from 'vitest';
import { BuildingSystem } from './BuildingSystem';
import { ResourceStore } from './ResourceStore';
import { outputPerSec, upgradeTimeMs } from '../config/BuildingConfig';

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
});
