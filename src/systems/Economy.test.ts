import { describe, it, expect } from 'vitest';
import {
  accrueProduction,
  accrueSince,
  addResources,
  canAfford,
  emptyBag,
  hqProductionMultiplier,
  hqStorageMultiplier,
  productionRates,
  spend,
  storageCaps,
} from './Economy';
import { BUILDINGS, ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import type { BuildingLevels } from './Economy';

/**
 * Pure resource-economy tests. Time is always passed IN (never read from the
 * clock) so accrual is deterministic. Production/storage are config-driven, so
 * these tests fail if the ECONOMY/BUILDINGS curves are reverted.
 */
describe('Economy', () => {
  /** A fresh-base level map: HQ 1, everything else 0. */
  function freshLevels(): BuildingLevels {
    return { hq: 1, tech_center: 0, parade_ground: 0, hospital: 0, barracks: 0, drone_center: 0 };
  }

  it('emptyBag has every resource key at zero', () => {
    const bag = emptyBag();
    expect(Object.keys(bag).sort()).toEqual([...RESOURCE_ORDER].sort());
    expect(Object.values(bag).every((v) => v === 0)).toBe(true);
  });

  it('HQ multipliers scale with HQ level per config', () => {
    const p = BUILDINGS.DEFS.hq.effectPerLevel.productionBonus;
    const s = BUILDINGS.DEFS.hq.effectPerLevel.storageBonus;
    expect(hqProductionMultiplier({ hq: 1 })).toBeCloseTo(1 + p);
    expect(hqProductionMultiplier({ hq: 3 })).toBeCloseTo(1 + p * 3);
    expect(hqStorageMultiplier({ hq: 2 })).toBeCloseTo(1 + s * 2);
  });

  it('base production matches config scaled by the HQ multiplier', () => {
    const rates = productionRates(freshLevels());
    const mult = hqProductionMultiplier(freshLevels());
    expect(rates.rations).toBeCloseTo(ECONOMY.RESOURCES.rations.baseProduction * mult);
    expect(rates.circuitry).toBeCloseTo(ECONOMY.RESOURCES.circuitry.baseProduction * mult);
  });

  it('buildings add flat production (parade -> rations/fuel, barracks -> steel, tech -> circuitry)', () => {
    const base = productionRates(freshLevels());
    const withParade = productionRates({ ...freshLevels(), parade_ground: 2 });
    expect(withParade.rations).toBeGreaterThan(base.rations);
    expect(withParade.fuel).toBeGreaterThan(base.fuel);

    const withBarracks = productionRates({ ...freshLevels(), barracks: 3 });
    expect(withBarracks.steel).toBeGreaterThan(base.steel);

    const withTech = productionRates({ ...freshLevels(), tech_center: 4 });
    expect(withTech.circuitry).toBeGreaterThan(base.circuitry);
  });

  it('storage caps scale with HQ level', () => {
    const low = storageCaps({ hq: 1 });
    const high = storageCaps({ hq: 5 });
    for (const kind of RESOURCE_ORDER) {
      expect(high[kind]).toBeGreaterThan(low[kind]);
    }
    expect(low.rations).toBe(
      Math.floor(ECONOMY.RESOURCES.rations.baseStorage * hqStorageMultiplier({ hq: 1 })),
    );
  });

  it('production accrues over an elapsed-seconds delta', () => {
    const levels = freshLevels();
    const start = { rations: 0, steel: 0, fuel: 0, circuitry: 0 };
    const rates = productionRates(levels);
    const after = accrueProduction(start, levels, 100);
    expect(after.rations).toBeCloseTo(rates.rations * 100);
    expect(after.steel).toBeCloseTo(rates.steel * 100);
  });

  it('production clamps at the storage cap', () => {
    const levels = freshLevels();
    const caps = storageCaps(levels);
    // A huge delta must clamp exactly at the cap, never exceed it.
    const after = accrueProduction({ rations: 0, steel: 0, fuel: 0, circuitry: 0 }, levels, 1e9);
    for (const kind of RESOURCE_ORDER) {
      expect(after[kind]).toBe(caps[kind]);
    }
  });

  it('negative / zero / non-finite deltas accrue nothing', () => {
    const levels = freshLevels();
    const start = { rations: 10, steel: 20, fuel: 5, circuitry: 1 };
    expect(accrueProduction(start, levels, 0)).toEqual({ rations: 10, steel: 20, fuel: 5, circuitry: 1 });
    expect(accrueProduction(start, levels, -50)).toEqual({ rations: 10, steel: 20, fuel: 5, circuitry: 1 });
    expect(accrueProduction(start, levels, NaN)).toEqual({ rations: 10, steel: 20, fuel: 5, circuitry: 1 });
  });

  it('accrual is capped at MAX_ACCRUAL_SECONDS', () => {
    const levels = { hq: 1, parade_ground: 5 };
    const rates = productionRates(levels);
    // Use a value below any storage cap so the max-accrual cap (not storage) binds.
    const start = { rations: 0, steel: 0, fuel: 0, circuitry: 0 };
    const cappedByWindow = accrueProduction(start, levels, 1e12);
    const cappedByStorage = storageCaps(levels);
    // rations at max-window may still be under its cap; verify the window cap
    // was applied by comparing to an explicit MAX_ACCRUAL_SECONDS accrual.
    const expected = Math.min(
      rates.rations * ECONOMY.MAX_ACCRUAL_SECONDS,
      cappedByStorage.rations,
    );
    expect(cappedByWindow.rations).toBeCloseTo(expected);
  });

  it('accrueSince establishes a baseline on first tick (lastTick 0)', () => {
    const levels = freshLevels();
    const start = { rations: 100, steel: 100, fuel: 100, circuitry: 100 };
    const res = accrueSince(start, levels, 0, 5_000);
    // Nothing back-credited; timestamp rebased to now.
    expect(res.stockpiles.rations).toBe(100);
    expect(res.lastTickTimestamp).toBe(5_000);
  });

  it('accrueSince credits the wall-clock gap between ticks (offline progress)', () => {
    const levels = freshLevels();
    const rates = productionRates(levels);
    const start = { rations: 0, steel: 0, fuel: 0, circuitry: 0 };
    // 10 seconds elapsed (10_000 ms).
    const res = accrueSince(start, levels, 1_000, 11_000);
    expect(res.stockpiles.rations).toBeCloseTo(rates.rations * 10);
    expect(res.lastTickTimestamp).toBe(11_000);
  });

  it('accrueSince does not back-credit when the clock goes backwards', () => {
    const levels = freshLevels();
    const start = { rations: 50, steel: 50, fuel: 50, circuitry: 50 };
    const res = accrueSince(start, levels, 10_000, 5_000);
    expect(res.stockpiles.rations).toBe(50);
    expect(res.lastTickTimestamp).toBe(5_000);
  });

  it('canAfford / spend enforce affordability', () => {
    const stock = { rations: 100, steel: 50, fuel: 10, circuitry: 0 };
    const affordable = { rations: 100, steel: 50, fuel: 10, circuitry: 0 };
    const tooMuch = { rations: 101, steel: 0, fuel: 0, circuitry: 0 };
    expect(canAfford(stock, affordable)).toBe(true);
    expect(canAfford(stock, tooMuch)).toBe(false);

    const ok = spend(stock, { rations: 40, steel: 10, fuel: 0, circuitry: 0 });
    expect(ok.ok).toBe(true);
    expect(ok.stockpiles.rations).toBe(60);
    expect(ok.stockpiles.steel).toBe(40);

    const fail = spend(stock, tooMuch);
    expect(fail.ok).toBe(false);
    expect(fail.stockpiles.rations).toBe(100); // unchanged
  });

  it('spend does not mutate the input stockpiles', () => {
    const stock = { rations: 100, steel: 100, fuel: 100, circuitry: 100 };
    spend(stock, { rations: 10, steel: 0, fuel: 0, circuitry: 0 });
    expect(stock.rations).toBe(100);
  });

  it('addResources grants and clamps to storage', () => {
    const levels = freshLevels();
    const caps = storageCaps(levels);
    const stock = { rations: 0, steel: 0, fuel: 0, circuitry: 0 };
    const gained = addResources(stock, { rations: 250, steel: 1e9 }, levels);
    expect(gained.rations).toBe(250);
    expect(gained.steel).toBe(caps.steel); // clamped
  });
});
