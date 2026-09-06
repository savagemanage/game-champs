import { describe, it, expect } from 'vitest';
import { TrainingQueue } from './TrainingQueue';
import { ResourceStore } from './ResourceStore';
import { TRAINING } from '../config/GameConfig';
import { troopDef } from '../config/TroopConfig';

/**
 * Unit tests for the time-based training queue: Barracks gating, affordability
 * charging, sequential (chained) completion timing, partial completion, army
 * accumulation, and progress queries.
 */
describe('TrainingQueue', () => {
  const richStore = () => new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });

  it('refuses to enqueue without a Barracks', () => {
    const q = new TrainingQueue();
    const check = q.enqueue('spearman', 3, richStore(), 0, false);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('no_barracks');
    expect(q.length).toBe(0);
  });

  it('charges the full batch cost up front and refuses when unaffordable', () => {
    const q = new TrainingQueue();
    const spear = troopDef('spearman');
    const store = new ResourceStore({ food: spear.cost.food ?? 0, wood: spear.cost.wood ?? 0, stone: 0, gold: 0 });
    // Enough for exactly one spearman, but asking for two -> refused, no charge.
    const check = q.enqueue('spearman', 2, store, 0, true);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
    expect(store.get('food')).toBe(spear.cost.food ?? 0);

    // Exactly one is affordable and drains the store.
    expect(q.enqueue('spearman', 1, store, 0, true).ok).toBe(true);
    expect(store.get('food')).toBe(0);
  });

  it('completes a batch after count * trainTime and accumulates the army', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const t = troopDef('spearman').trainTimeMs;
    q.enqueue('spearman', 3, store, 0, true);

    // Before completion: no units yet.
    q.advance(3 * t - 1);
    expect(q.army.spearman).toBe(0);
    expect(q.isBusy).toBe(true);

    // At completion: all 3 arrive.
    q.advance(3 * t);
    expect(q.army.spearman).toBe(3);
    expect(q.isBusy).toBe(false);
  });

  it('chains batches sequentially and completes them in order (partial completion)', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const spearT = troopDef('spearman').trainTimeMs;
    const archerT = troopDef('archer').trainTimeMs;

    q.enqueue('spearman', 2, store, 0, true); // done at 2*spearT
    q.enqueue('archer', 1, store, 0, true); // starts after spearmen, done at 2*spearT + archerT

    // Advance to just after the first batch only.
    q.advance(2 * spearT);
    expect(q.army.spearman).toBe(2);
    expect(q.army.archer).toBe(0);
    expect(q.length).toBe(1); // archer batch still pending

    // Advance past the archer batch.
    q.advance(2 * spearT + archerT);
    expect(q.army.archer).toBe(1);
    expect(q.length).toBe(0);
  });

  it('reports front-batch progress correctly mid-training', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const t = troopDef('spearman').trainTimeMs;
    q.enqueue('spearman', 2, store, 0, true); // span = 2t

    expect(q.frontProgress(0)).toBe(0);
    expect(q.frontProgress(t)).toBeCloseTo(0.5, 5);
    expect(q.frontProgress(2 * t)).toBe(1);
    expect(q.remainingMs(t)).toBeCloseTo(t, 5);
  });

  it('enforces MAX_QUEUE and MAX_BATCH limits', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const tooBig = q.enqueue('spearman', TRAINING.MAX_BATCH + 1, store, 0, true);
    expect(tooBig.ok).toBe(false);
    expect(tooBig.reason).toBe('batch_too_large');

    for (let i = 0; i < TRAINING.MAX_QUEUE; i++) {
      expect(q.enqueue('spearman', 1, store, 0, true).ok).toBe(true);
    }
    const overflow = q.enqueue('spearman', 1, store, 0, true);
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe('queue_full');
  });

  it('round-trips queue + army through toJSON / fromJSON', () => {
    const q = new TrainingQueue();
    const store = richStore();
    q.enqueue('archer', 2, store, 100, true);
    const restored = TrainingQueue.fromJSON(q.toJSON(), { spearman: 5, archer: 0, knight: 1, cavalry: 3, siege: 2 });
    expect(restored.length).toBe(1);
    expect(restored.army).toEqual({ spearman: 5, archer: 0, knight: 1, cavalry: 3, siege: 2 });
  });

  it('trains and accumulates the new cavalry and siege troop kinds', () => {
    const q = new TrainingQueue();
    const store = richStore();
    const cavT = troopDef('cavalry').trainTimeMs;
    const siegeT = troopDef('siege').trainTimeMs;

    expect(q.enqueue('cavalry', 2, store, 0, true).ok).toBe(true);
    q.advance(2 * cavT);
    expect(q.army.cavalry).toBe(2);

    expect(q.enqueue('siege', 1, store, 2 * cavT, true).ok).toBe(true);
    q.advance(2 * cavT + siegeT);
    expect(q.army.siege).toBe(1);
  });

  it('a fresh army includes every troop kind defaulted to zero', () => {
    const q = new TrainingQueue();
    expect(q.army).toEqual({ spearman: 0, archer: 0, knight: 0, cavalry: 0, siege: 0 });
  });

  it('backfills missing new kinds when restoring an OLD army (pre-cavalry/siege)', () => {
    // An old save's army object lacks the new kinds entirely.
    const oldArmy = { spearman: 4, archer: 2, knight: 1 } as never;
    const restored = TrainingQueue.fromJSON(undefined, oldArmy);
    expect(restored.army).toEqual({ spearman: 4, archer: 2, knight: 1, cavalry: 0, siege: 0 });
  });
});
