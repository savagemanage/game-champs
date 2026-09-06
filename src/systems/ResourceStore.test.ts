import { describe, it, expect } from 'vitest';
import { ResourceStore } from './ResourceStore';
import { ECONOMY } from '../config/GameConfig';

/**
 * Unit tests for the pure resource economy: balances, atomic affordability
 * checks, and idle production over an elapsed dt (live and offline). Each test
 * fails if the corresponding logic were reverted.
 */
describe('ResourceStore', () => {
  it('starts from ECONOMY.START by default', () => {
    const store = new ResourceStore();
    expect(store.get('food')).toBe(ECONOMY.START.food);
    expect(store.get('wood')).toBe(ECONOMY.START.wood);
    expect(store.get('stone')).toBe(ECONOMY.START.stone);
    expect(store.get('gold')).toBe(ECONOMY.START.gold);
  });

  it('canAfford / spend is atomic and refuses when any component is short', () => {
    const store = new ResourceStore({ food: 100, wood: 100, stone: 0, gold: 0 });
    // stone is short -> whole spend must fail, nothing deducted.
    expect(store.canAfford({ food: 50, stone: 10 })).toBe(false);
    expect(store.spend({ food: 50, stone: 10 })).toBe(false);
    expect(store.get('food')).toBe(100);

    // Affordable spend goes through.
    expect(store.spend({ food: 50, wood: 20 })).toBe(true);
    expect(store.get('food')).toBe(50);
    expect(store.get('wood')).toBe(80);
  });

  it('accumulates idle production proportional to dt and rates', () => {
    const store = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    // 2 food/sec for 10s = 20 food; 1 wood/sec for 10s = 10 wood.
    const gained = store.applyProduction({ food: 2, wood: 1, stone: 0, gold: 0 }, 10_000);
    expect(gained.food).toBeCloseTo(20, 5);
    expect(store.get('food')).toBeCloseTo(20, 5);
    expect(store.get('wood')).toBeCloseTo(10, 5);
    // Doubling dt doubles the gain.
    store.applyProduction({ food: 2, wood: 1, stone: 0, gold: 0 }, 20_000);
    expect(store.get('food')).toBeCloseTo(60, 5);
  });

  it('scales production by efficiency (offline) and credits nothing for zero dt', () => {
    const store = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    store.applyProduction({ food: 10, wood: 0, stone: 0, gold: 0 }, 1000, 0.5);
    expect(store.get('food')).toBeCloseTo(5, 5); // 10/sec * 1s * 0.5
    const before = store.get('food');
    store.applyProduction({ food: 10, wood: 0, stone: 0, gold: 0 }, 0);
    expect(store.get('food')).toBe(before);
  });

  it('subtract deducts non-atomically and clamps each balance at 0', () => {
    const store = new ResourceStore({ food: 100, wood: 5, stone: 0, gold: 0 });
    // wood is short of the requested 20; subtract takes only what exists (5),
    // still deducts the affordable food, and reports what was actually taken.
    const taken = store.subtract({ food: 30, wood: 20 });
    expect(taken.food).toBe(30);
    expect(taken.wood).toBe(5);
    expect(store.get('food')).toBe(70);
    expect(store.get('wood')).toBe(0); // clamped, not negative
    // An empty bundle is a no-op.
    store.subtract({});
    expect(store.get('food')).toBe(70);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const store = new ResourceStore({ food: 7, wood: 8, stone: 9, gold: 10 });
    const restored = ResourceStore.fromJSON(store.toJSON());
    expect(restored.balances).toEqual({ food: 7, wood: 8, stone: 9, gold: 10 });
  });
});
