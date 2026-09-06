import { describe, it, expect } from 'vitest';
import { BuildingSystem } from './BuildingSystem';
import { ResourceStore } from './ResourceStore';
import { outputPerSec, upgradeTimeMs } from '../config/BuildingConfig';

/**
 * Unit tests for the building/upgrade tree: prerequisite + Furnace gating,
 * affordability, timed completion, and aggregate production. Each test fails if
 * the corresponding rule were reverted.
 */
describe('BuildingSystem', () => {
  const richStore = () => new ResourceStore({ food: 99999, wood: 99999, coal: 99999, iron: 99999 });

  it('a fresh game has a level-1 Furnace and nothing else', () => {
    const bs = new BuildingSystem();
    expect(bs.furnaceLevel).toBe(1);
    expect(bs.level('hunters_hut')).toBe(0);
    expect(bs.hasWarCamp).toBe(false);
  });

  it('canUpgrade refuses when the Furnace prerequisite is unmet', () => {
    const bs = new BuildingSystem();
    // Iron Mine requires Furnace level 3; Furnace is level 1 -> blocked by prereq.
    const check = bs.canUpgrade('iron_mine', richStore());
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('prereq');
  });

  it('canUpgrade refuses when resources are insufficient', () => {
    const bs = new BuildingSystem();
    const brokeStore = new ResourceStore({ food: 0, wood: 0, coal: 0, iron: 0 });
    // Hunters' Hut prereq (Furnace level 1) is met, but there is no wood/food.
    const check = bs.canUpgrade('hunters_hut', brokeStore);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
  });

  it("a building's level may not exceed the Furnace level", () => {
    const bs = new BuildingSystem([
      { kind: 'furnace', level: 1, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 1, upgradeEndsAt: null },
    ]);
    // Hunters' Hut is already at Furnace level (1) -> cannot upgrade further until Furnace grows.
    const check = bs.canUpgrade('hunters_hut', richStore());
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('prereq');
  });

  it('spends resources, then completes the upgrade after the configured time', () => {
    const bs = new BuildingSystem();
    const store = richStore();
    const before = store.get('wood');

    // Build the first Hunters' Hut (level 0 -> 1). Prereq Furnace level 1 is met.
    const check = bs.startUpgrade('hunters_hut', store, 1000);
    expect(check.ok).toBe(true);
    expect(store.get('wood')).toBeLessThan(before); // cost was charged
    expect(bs.isUpgrading('hunters_hut')).toBe(true);
    expect(bs.level('hunters_hut')).toBe(0); // not done yet

    const dur = upgradeTimeMs('hunters_hut', 0);
    // Just before completion: still building.
    bs.update(1000 + dur - 1);
    expect(bs.level('hunters_hut')).toBe(0);
    // At/after completion: level increments and timer clears.
    const done = bs.update(1000 + dur);
    expect(done).toContain('hunters_hut');
    expect(bs.level('hunters_hut')).toBe(1);
    expect(bs.isUpgrading('hunters_hut')).toBe(false);
  });

  it('cannot start a second upgrade while one is in progress (busy)', () => {
    const bs = new BuildingSystem();
    const store = richStore();
    bs.startUpgrade('hunters_hut', store, 0);
    const check = bs.canUpgrade('hunters_hut', store);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('busy');
  });

  it('aggregates producer output at current levels', () => {
    const bs = new BuildingSystem([
      { kind: 'furnace', level: 3, upgradeEndsAt: null },
      { kind: 'hunters_hut', level: 2, upgradeEndsAt: null },
      { kind: 'sawmill', level: 1, upgradeEndsAt: null },
    ]);
    const rates = bs.productionRates();
    expect(rates.food).toBeCloseTo(outputPerSec('hunters_hut', 2), 5);
    expect(rates.wood).toBeCloseTo(outputPerSec('sawmill', 1), 5);
    expect(rates.coal).toBe(0);
    // Higher hunters' hut level produces strictly more food.
    expect(outputPerSec('hunters_hut', 2)).toBeGreaterThan(outputPerSec('hunters_hut', 1));
  });

  it('round-trips through toJSON / fromJSON', () => {
    const bs = new BuildingSystem([
      { kind: 'furnace', level: 2, upgradeEndsAt: null },
      { kind: 'war_camp', level: 1, upgradeEndsAt: 5000 },
    ]);
    const restored = BuildingSystem.fromJSON(bs.toJSON());
    expect(restored.furnaceLevel).toBe(2);
    expect(restored.hasWarCamp).toBe(true);
    expect(restored.upgradeEndsAt('war_camp')).toBe(5000);
  });
});
