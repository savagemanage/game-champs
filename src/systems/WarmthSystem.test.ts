import { describe, it, expect } from 'vitest';
import { WarmthSystem } from './WarmthSystem';
import { ResourceStore } from './ResourceStore';
import { WARMTH, warmthProductionMultiplier } from '../config/GameConfig';

/**
 * Unit tests for the WarmthSystem - the keep's Hearth / Warmth survival layer
 * (ported from Frosthold and re-themed to a WOOD-ONLY medieval hearth tied to
 * the Town Center level). These exercise the REAL fuel-burn / decay / clamp /
 * production-curve code paths (they would fail if the logic were reverted to a
 * stub), not just static config constants.
 */
describe('WarmthSystem', () => {
  /** A store with effectively unlimited firewood (and other resources). */
  function richStore(): ResourceStore {
    return new ResourceStore({ food: 1e9, wood: 1e9, stone: 1e9, gold: 1e9 });
  }

  /** A store with no firewood at all (hearth cannot burn). */
  function emptyStore(): ResourceStore {
    return new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
  }

  it('defaults to full warmth for a fresh keep', () => {
    const w = new WarmthSystem();
    expect(w.warmth).toBe(WARMTH.MAX_WARMTH);
  });

  it('maxWarmth scales up with Town Center level', () => {
    const w = new WarmthSystem();
    expect(w.maxWarmth(1)).toBe(WARMTH.MAX_WARMTH);
    expect(w.maxWarmth(2)).toBe(WARMTH.MAX_WARMTH + WARMTH.MAX_WARMTH_PER_LEVEL);
    expect(w.maxWarmth(5)).toBe(WARMTH.MAX_WARMTH + WARMTH.MAX_WARMTH_PER_LEVEL * 4);
    // Level 0 / below 1 never goes under the baseline.
    expect(w.maxWarmth(0)).toBe(WARMTH.MAX_WARMTH);
  });

  it('burns the expected firewood and raises warmth when fuel is ample', () => {
    const store = richStore();
    const woodBefore = store.get('wood');
    // Start below max so a fueled tick can actually rise.
    const w = new WarmthSystem(50);

    const res = w.tick(1000, 1, store); // 1 second at Town Center level 1
    expect(res.fueled).toBe(true);
    expect(res.fuelSpent.wood).toBeCloseTo(WARMTH.FUEL_PER_SECOND.wood, 6);
    // Store was actually debited by the burned firewood.
    expect(store.get('wood')).toBeCloseTo(woodBefore - WARMTH.FUEL_PER_SECOND.wood, 6);
    // Only wood is consumed - the other resources are untouched.
    expect(store.get('food')).toBe(1e9);
    expect(store.get('stone')).toBe(1e9);
    expect(store.get('gold')).toBe(1e9);
    // Warmth rose by the per-second gain.
    expect(w.warmth).toBeCloseTo(50 + WARMTH.WARMTH_GAIN_PER_SEC, 6);
  });

  it('higher Town Center level burns less firewood (efficiency)', () => {
    const l1 = new WarmthSystem(50).fuelPerSecond(1);
    const l5 = new WarmthSystem(50).fuelPerSecond(5);
    expect(l5.wood).toBeLessThan(l1.wood);
    // Never below the configured floor factor of the base.
    const floorWood = WARMTH.FUEL_PER_SECOND.wood * WARMTH.FUEL_MIN_FACTOR;
    expect(new WarmthSystem().fuelPerSecond(999).wood).toBeCloseTo(floorWood, 6);
  });

  it('decays toward 0 and does not spend firewood when the woodpile is empty', () => {
    const empty = emptyStore();
    const w = new WarmthSystem(WARMTH.MAX_WARMTH);

    const res = w.tick(1000, 1, empty);
    expect(res.fueled).toBe(false);
    expect(res.fuelSpent).toEqual({ wood: 0 });
    expect(w.warmth).toBeCloseTo(WARMTH.MAX_WARMTH - WARMTH.WARMTH_DECAY_PER_SEC, 6);
    // Store untouched.
    expect(empty.get('wood')).toBe(0);
  });

  it('production multiplier drops toward the floor as warmth falls', () => {
    const empty = emptyStore();
    const w = new WarmthSystem(WARMTH.MAX_WARMTH);
    expect(w.productionMultiplier(1)).toBeCloseTo(1, 6);

    // Drain warmth to zero over a long unfueled span.
    w.tick(1_000_000, 1, empty);
    expect(w.warmth).toBe(0);
    expect(w.productionMultiplier(1)).toBeCloseTo(WARMTH.WARMTH_PRODUCTION_FLOOR, 6);
  });

  it('production multiplier matches the shared curve at partial warmth', () => {
    const w = new WarmthSystem(WARMTH.MAX_WARMTH / 2); // ratio 0.5 at level 1
    expect(w.warmthRatio(1)).toBeCloseTo(0.5, 6);
    expect(w.productionMultiplier(1)).toBeCloseTo(warmthProductionMultiplier(0.5), 6);
  });

  it('clamps warmth at the max even with many fueled ticks', () => {
    const store = richStore();
    const w = new WarmthSystem(WARMTH.MAX_WARMTH - 1);
    // Far more gain than the headroom.
    w.tick(10_000, 1, store);
    expect(w.warmth).toBe(WARMTH.MAX_WARMTH);
    expect(w.warmthRatio(1)).toBeCloseTo(1, 6);
  });

  it('clamps warmth at 0 (never negative) when starved', () => {
    const empty = emptyStore();
    const w = new WarmthSystem(3);
    w.tick(100_000, 1, empty);
    expect(w.warmth).toBe(0);
  });

  it('a no-op (non-positive) tick re-clamps but spends nothing', () => {
    const store = richStore();
    const w = new WarmthSystem(WARMTH.MAX_WARMTH);
    const res = w.tick(0, 1, store);
    expect(res.fuelSpent).toEqual({ wood: 0 });
    expect(store.get('wood')).toBe(1e9);
  });

  it('round-trips warmth through toJSON / fromJSON', () => {
    const w = new WarmthSystem(42.5);
    const json = w.toJSON();
    expect(json).toBe(42.5);
    const restored = WarmthSystem.fromJSON(json);
    expect(restored.warmth).toBe(42.5);
  });

  it('fromJSON with a missing / invalid value defaults to full warmth', () => {
    expect(WarmthSystem.fromJSON(undefined).warmth).toBe(WARMTH.MAX_WARMTH);
    expect(WarmthSystem.fromJSON(null).warmth).toBe(WARMTH.MAX_WARMTH);
    expect(WarmthSystem.fromJSON(Number.NaN).warmth).toBe(WARMTH.MAX_WARMTH);
  });
});
