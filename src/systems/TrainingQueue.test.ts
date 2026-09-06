import { describe, it, expect } from 'vitest';
import { TrainingQueue } from './TrainingQueue';
import { ResourceStore } from './ResourceStore';
import { TRAINING } from '../config/GameConfig';
import { troopDef } from '../config/TroopConfig';

/**
 * Unit tests for the time-based training queue: War Camp gating, affordability
 * charging, sequential (chained) completion timing, partial completion, army
 * accumulation, and progress queries.
 */
describe('TrainingQueue', () => {
  const richStore = () => new ResourceStore({ food: 99999, wood: 99999, coal: 99999, iron: 99999 });

  it('refuses to enqueue without a War Camp', () => {
    const q = new TrainingQueue();
    const check = q.enqueue('trapper', 3, richStore(), 0, false);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('no_war_camp');
    expect(q.length).toBe(0);
  });

  it('charges the full batch cost up front and refuses when unaffordable', () => {
    const q = new TrainingQueue();
    const trap = troopDef('trapper');
    const store = new ResourceStore({ food: trap.cost.food ?? 0, wood: trap.cost.wood ?? 0, coal: 0, iron: 0 });
    // Enough for exactly one trapper, but asking for two -> refused, no charge.
    const check = q.enqueue('trapper', 2, store, 0, true);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
    expect(store.get('food')).toBe(trap.cost.food ?? 0);

    // Exactly one is affordable and drains the store.
    expect(q.enqueue('trapper', 1, store, 0, true).ok).toBe(true);
    expect(store.get('food')).toBe(0);
  });

  it('completes a batch after count * trainTime and accumulates the army', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const t = troopDef('trapper').trainTimeMs;
    q.enqueue('trapper', 3, store, 0, true);

    // Before completion: no units yet.
    q.advance(3 * t - 1);
    expect(q.army.trapper).toBe(0);
    expect(q.isBusy).toBe(true);

    // At completion: all 3 arrive.
    q.advance(3 * t);
    expect(q.army.trapper).toBe(3);
    expect(q.isBusy).toBe(false);
  });

  it('chains batches sequentially and completes them in order (partial completion)', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const trapperT = troopDef('trapper').trainTimeMs;
    const marksmanT = troopDef('marksman').trainTimeMs;

    q.enqueue('trapper', 2, store, 0, true); // done at 2*trapperT
    q.enqueue('marksman', 1, store, 0, true); // starts after trappers, done at 2*trapperT + marksmanT

    // Advance to just after the first batch only.
    q.advance(2 * trapperT);
    expect(q.army.trapper).toBe(2);
    expect(q.army.marksman).toBe(0);
    expect(q.length).toBe(1); // marksman batch still pending

    // Advance past the marksman batch.
    q.advance(2 * trapperT + marksmanT);
    expect(q.army.marksman).toBe(1);
    expect(q.length).toBe(0);
  });

  it('reports front-batch progress correctly mid-training', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const t = troopDef('trapper').trainTimeMs;
    q.enqueue('trapper', 2, store, 0, true); // span = 2t

    expect(q.frontProgress(0)).toBe(0);
    expect(q.frontProgress(t)).toBeCloseTo(0.5, 5);
    expect(q.frontProgress(2 * t)).toBe(1);
    expect(q.remainingMs(t)).toBeCloseTo(t, 5);
  });

  it('enforces MAX_QUEUE and MAX_BATCH limits', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const tooBig = q.enqueue('trapper', TRAINING.MAX_BATCH + 1, store, 0, true);
    expect(tooBig.ok).toBe(false);
    expect(tooBig.reason).toBe('batch_too_large');

    for (let i = 0; i < TRAINING.MAX_QUEUE; i++) {
      expect(q.enqueue('trapper', 1, store, 0, true).ok).toBe(true);
    }
    const overflow = q.enqueue('trapper', 1, store, 0, true);
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe('queue_full');
  });

  it('round-trips queue + army through toJSON / fromJSON', () => {
    const q = new TrainingQueue();
    const store = richStore();
    q.enqueue('marksman', 2, store, 100, true);
    const restored = TrainingQueue.fromJSON(q.toJSON(), { trapper: 5, marksman: 0, vanguard: 1 });
    expect(restored.length).toBe(1);
    expect(restored.army).toEqual({ trapper: 5, marksman: 0, vanguard: 1 });
    // With no tier breakdown supplied, every standing unit lands at tier 1.
    expect(restored.armyTiers).toEqual({ trapper: { 1: 5 }, vanguard: { 1: 1 } });
  });

  // --- troop TIERS (review v1): tier scales cost + time and is tracked -------

  it('charges the tier-scaled cost (a higher tier costs strictly more)', () => {
    const t1Store = richStore();
    const t2Store = richStore();
    const q1 = new TrainingQueue();
    const q2 = new TrainingQueue();
    const before = 99999;

    q1.enqueue('vanguard', 1, t1Store, 0, true, 1);
    q2.enqueue('vanguard', 1, t2Store, 0, true, 2);

    const t1Spent = before - t1Store.get('food');
    const t2Spent = before - t2Store.get('food');
    // A tier-2 vanguard costs strictly more food than a tier-1 one.
    expect(t2Spent).toBeGreaterThan(t1Spent);
  });

  it('a higher tier trains slower and lands in the tiered army at its tier', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const t1 = troopDef('vanguard').trainTimeMs;

    q.enqueue('vanguard', 2, store, 0, true, 3);
    // Tier 3 train time exceeds the tier-1 baseline, so 2 units are not done at 2*t1.
    q.advance(2 * t1);
    expect(q.army.vanguard).toBe(0);

    // Well past completion: both arrive and are recorded as tier 3.
    q.advance(1e12);
    expect(q.army.vanguard).toBe(2);
    expect(q.armyTiers.vanguard).toEqual({ 3: 2 });
  });

  it('setArmy casualties are taken from the highest tiers first', () => {
    const q = new TrainingQueue();
    const store = richStore();
    q.enqueue('trapper', 2, store, 0, true, 1);
    q.enqueue('trapper', 2, store, 0, true, 3);
    q.advance(1e12);
    expect(q.army.trapper).toBe(4);
    expect(q.armyTiers.trapper).toEqual({ 1: 2, 3: 2 });

    // Lose 3 trappers (survivors = 1): the tier-3 units are trimmed first.
    q.setArmy({ trapper: 1, marksman: 0, vanguard: 0 });
    expect(q.army.trapper).toBe(1);
    expect(q.armyTiers.trapper).toEqual({ 1: 1 });
  });
});
