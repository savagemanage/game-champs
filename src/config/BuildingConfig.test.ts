import { describe, it, expect } from 'vitest';
import { unlockRequirement, BUILDING_DEFS } from './BuildingConfig';
import { BuildingSystem } from '../systems/BuildingSystem';
import { ResourceStore } from '../systems/ResourceStore';

/**
 * Pure-logic tests for the unlock-requirement lookup (FEAT-003) that backs the
 * Town's "Furnace Lv.N required" locked label. Verifies it mirrors the Furnace
 * gate BuildingSystem.canUpgrade enforces (hard prerequisite + the "may not
 * exceed the current Furnace level" soft gate), so the label the player reads
 * always matches the real gate.
 */
describe('unlockRequirement', () => {
  it('never locks the Furnace itself (it is the gate)', () => {
    expect(unlockRequirement('furnace', 1, 1).locked).toBe(false);
    expect(unlockRequirement('furnace', 5, 5).locked).toBe(false);
  });

  it('reports the hard prerequisite when the Furnace is too low to build at all', () => {
    // Coal pit requires Furnace Lv.2; at Furnace Lv.1 it is locked.
    const req = unlockRequirement('coal_pit', 0, 1);
    expect(req.locked).toBe(true);
    expect(req.reason).toBe('prereq');
    expect(req.requiredFurnaceLevel).toBe(2);
  });

  it('unlocks a building once the Furnace meets its hard prerequisite', () => {
    const req = unlockRequirement('coal_pit', 0, 2);
    expect(req.locked).toBe(false);
    expect(req.requiredFurnaceLevel).toBe(2);
  });

  it('enforces the soft gate: a built building may not exceed the Furnace level', () => {
    // Hunters' Hut at Lv.2 with a Furnace at Lv.2 cannot upgrade to Lv.3 until
    // the Furnace reaches Lv.3.
    const req = unlockRequirement('hunters_hut', 2, 2);
    expect(req.locked).toBe(true);
    expect(req.reason).toBe('prereq');
    expect(req.requiredFurnaceLevel).toBe(3);
  });

  it('allows an upgrade when the Furnace is above the building level', () => {
    const req = unlockRequirement('hunters_hut', 1, 3);
    expect(req.locked).toBe(false);
  });

  it('takes the MAX of the hard prerequisite and the soft gate', () => {
    // Iron mine requires Furnace Lv.3; at level 3 already built, upgrading to
    // Lv.4 needs Furnace Lv.4 - the soft gate dominates the (lower) hard one.
    const req = unlockRequirement('iron_mine', 3, 3);
    expect(req.requiredFurnaceLevel).toBe(4);
    expect(req.locked).toBe(true);
  });

  it('agrees with BuildingSystem.canUpgrade prereq reason across the roster', () => {
    // For every non-Furnace building, at a range of Furnace levels, the lookup's
    // `locked` (Furnace-gate) must match whether canUpgrade returns 'prereq'.
    const store = new ResourceStore({ food: 1e9, wood: 1e9, coal: 1e9, iron: 1e9, steel: 1e9 });
    for (const kind of Object.keys(BUILDING_DEFS) as (keyof typeof BUILDING_DEFS)[]) {
      if (kind === 'furnace') continue;
      for (let furnace = 1; furnace <= 5; furnace++) {
        for (let level = 0; level <= 4; level++) {
          const buildings = new BuildingSystem([
            { kind: 'furnace', level: furnace, upgradeEndsAt: null },
            { kind, level, upgradeEndsAt: null },
          ]);
          const check = buildings.canUpgrade(kind, store);
          const req = unlockRequirement(kind, level, furnace);
          const gatedByFurnace = check.reason === 'prereq';
          expect(req.locked, `${kind} furnace=${furnace} level=${level}`).toBe(gatedByFurnace);
        }
      }
    }
  });
});
