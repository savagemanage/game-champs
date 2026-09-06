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
  });
});
