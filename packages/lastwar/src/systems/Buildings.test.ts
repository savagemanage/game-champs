import { describe, it, expect } from 'vitest';
import {
  canUpgrade,
  isBuilding,
  isUpgrading,
  levelOf,
  maxLevel,
  remainingMs,
  resolveUpgrades,
  startUpgrade,
  upgradeCost,
  upgradeTimeSeconds,
} from './Buildings';
import { BUILDINGS, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingLevels } from './Buildings';
import type { BuildingUpgrade } from '../types';

/**
 * Pure base-building tests. Cost/time curves are config-driven and monotonic,
 * the HQ cap blocks over-leveling non-HQ buildings, and upgrades are time-gated
 * against explicit `now` timestamps (offline completion). These tests fail if
 * the geometric curves or the HQ cap were reverted.
 */
describe('Buildings', () => {
  /** Plenty of every resource so affordability never blocks a test. */
  const rich = { rations: 1e9, steel: 1e9, fuel: 1e9, circuitry: 1e9 };

  it('level-0 upgrade cost equals the config base (growth^0 = 1)', () => {
    const cost = upgradeCost('barracks', 0);
    for (const kind of RESOURCE_ORDER) {
      expect(cost[kind]).toBe(BUILDINGS.DEFS.barracks.baseCost[kind]);
    }
  });

  it('cost curve is geometric and strictly monotonic in level', () => {
    let prev = -1;
    for (let level = 0; level < 6; level += 1) {
      const cost = upgradeCost('hq', level);
      const expected = Math.round(
        BUILDINGS.DEFS.hq.baseCost.steel * Math.pow(BUILDINGS.COST_GROWTH, level),
      );
      expect(cost.steel).toBe(expected);
      expect(cost.steel).toBeGreaterThan(prev);
      prev = cost.steel;
    }
  });

  it('time curve is geometric and strictly monotonic in level', () => {
    let prev = -1;
    for (let level = 0; level < 6; level += 1) {
      const t = upgradeTimeSeconds('barracks', level);
      const expected = Math.round(
        BUILDINGS.DEFS.barracks.baseTimeSeconds * Math.pow(BUILDINGS.TIME_GROWTH, level),
      );
      expect(t).toBe(expected);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('cost and time are Infinity at the absolute max level', () => {
    const max = maxLevel('hospital');
    const cost = upgradeCost('hospital', max);
    expect(cost.steel).toBe(Infinity);
    expect(upgradeTimeSeconds('hospital', max)).toBe(Infinity);
  });

  it('levelOf falls back to HQ 1 and others 0', () => {
    expect(levelOf({}, 'hq')).toBe(1);
    expect(levelOf({}, 'barracks')).toBe(0);
    expect(levelOf({ barracks: 3 }, 'barracks')).toBe(3);
  });

  it('HQ cap blocks a non-HQ building from exceeding the HQ level', () => {
    // HQ at 1, barracks at 1 already -> next barracks level (2) exceeds HQ.
    const levels: BuildingLevels = { hq: 1, barracks: 1 };
    const blocked = canUpgrade('barracks', levels, rich, []);
    expect(blocked).toEqual({ ok: false, reason: 'hq_cap' });

    // Raise HQ to 2 -> barracks may now reach level 2.
    const allowed = canUpgrade('barracks', { hq: 2, barracks: 1 }, rich, []);
    expect(allowed).toEqual({ ok: true });
  });

  it('HQ itself is not subject to the HQ cap', () => {
    const check = canUpgrade('hq', { hq: 1 }, rich, []);
    expect(check).toEqual({ ok: true });
  });

  it('canUpgrade reports max_level, queue_full, and insufficient_resources', () => {
    const max = maxLevel('hq');
    expect(canUpgrade('hq', { hq: max }, rich, [])).toEqual({ ok: false, reason: 'max_level' });

    const busy: BuildingUpgrade[] = [
      { building: 'hq', toLevel: 2, startedAt: 0, completesAt: 999_999 },
    ];
    expect(canUpgrade('tech_center', { hq: 5, tech_center: 0 }, rich, busy)).toEqual({
      ok: false,
      reason: 'queue_full',
    });

    const broke = { rations: 0, steel: 0, fuel: 0, circuitry: 0 };
    expect(canUpgrade('hq', { hq: 1 }, broke, [])).toEqual({
      ok: false,
      reason: 'insufficient_resources',
    });
  });

  it('startUpgrade sets a correct completion timestamp from the time curve', () => {
    const now = 1_000_000;
    const res = startUpgrade('hq', { hq: 1 }, rich, [], now);
    expect(res.ok).toBe(true);
    const durationMs = upgradeTimeSeconds('hq', 1) * 1000;
    expect(res.upgrade).toEqual({
      building: 'hq',
      toLevel: 2,
      startedAt: now,
      completesAt: now + durationMs,
    });
    // Cost is returned for the caller to spend; startUpgrade does not spend.
    expect(res.cost).toEqual(upgradeCost('hq', 1));
  });

  it('startUpgrade fails (no upgrade) when the HQ cap blocks it', () => {
    const res = startUpgrade('barracks', { hq: 1, barracks: 1 }, rich, [], 0);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('hq_cap');
    expect(res.upgrade).toBeUndefined();
  });

  it('resolveUpgrades completes only finished upgrades and applies the level', () => {
    const levels: BuildingLevels = { hq: 3, barracks: 1, tech_center: 0 };
    const queue: BuildingUpgrade[] = [
      { building: 'barracks', toLevel: 2, startedAt: 0, completesAt: 5_000 },
      { building: 'tech_center', toLevel: 1, startedAt: 0, completesAt: 20_000 },
    ];
    // now = 10_000: barracks done, tech_center still building.
    const res = resolveUpgrades(levels, queue, 10_000);
    expect(res.levels.barracks).toBe(2); // applied
    expect(res.levels.tech_center).toBe(0); // unchanged
    expect(res.completed.map((u) => u.building)).toEqual(['barracks']);
    expect(res.queue.map((u) => u.building)).toEqual(['tech_center']);
    // Input not mutated.
    expect(levels.barracks).toBe(1);
  });

  it('resolveUpgrades completes upgrades that finished while the tab was closed (offline)', () => {
    const levels: BuildingLevels = { hq: 5, drone_center: 0 };
    const queue: BuildingUpgrade[] = [
      { building: 'drone_center', toLevel: 1, startedAt: 0, completesAt: 60_000 },
    ];
    // Simulate a long absence: now is far past completion.
    const res = resolveUpgrades(levels, queue, 10_000_000);
    expect(res.levels.drone_center).toBe(1);
    expect(res.queue).toEqual([]);
    expect(res.completed).toHaveLength(1);
  });

  it('resolveUpgrades never exceeds the absolute max level', () => {
    const max = maxLevel('hq');
    const levels: BuildingLevels = { hq: max };
    const queue: BuildingUpgrade[] = [
      { building: 'hq', toLevel: max + 5, startedAt: 0, completesAt: 1 },
    ];
    const res = resolveUpgrades(levels, queue, 100);
    expect(res.levels.hq).toBe(max);
  });

  it('isBuilding / isUpgrading reflect the single global queue', () => {
    const queue: BuildingUpgrade[] = [
      { building: 'hq', toLevel: 2, startedAt: 0, completesAt: 100 },
    ];
    expect(isBuilding([])).toBe(false);
    expect(isBuilding(queue)).toBe(true);
    expect(isUpgrading(queue, 'hq')).toBe(true);
    expect(isUpgrading(queue, 'barracks')).toBe(false);
  });

  it('remainingMs never goes negative', () => {
    const u: BuildingUpgrade = { building: 'hq', toLevel: 2, startedAt: 0, completesAt: 5_000 };
    expect(remainingMs(u, 1_000)).toBe(4_000);
    expect(remainingMs(u, 9_000)).toBe(0);
  });
});
