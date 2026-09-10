import { TRAINING } from '../config/GameConfig';
import { TROOP_ORDER, troopDef } from '../config/TroopConfig';
import type { Army, ResourceCost, TrainingOrder, TroopKind } from '../types';
import { ResourceStore } from './ResourceStore';

/** Outcome of attempting to enqueue a training batch. */
export interface EnqueueCheck {
  ok: boolean;
  reason?: 'no_barracks' | 'queue_full' | 'bad_count' | 'batch_too_large' | 'cost';
}

/**
 * TrainingQueue - a time-based troop training queue.
 *
 * Pure logic (no Phaser). Batches are trained sequentially: a batch's units
 * each take the troop's configured `trainTimeMs`, and a batch's completion time
 * is chained after the batch ahead of it. `advance(now)` moves finished units
 * into the standing {@link Army} tally and drops fully-completed batches.
 *
 * Costs are charged UP FRONT at enqueue time (so the resources are committed),
 * checked against a {@link ResourceStore}. Requires a built Barracks (the caller
 * passes `hasBarracks` from BuildingSystem). Serializable to/from TrainingOrder[].
 */
export class TrainingQueue {
  private _queue: TrainingOrder[];
  private readonly _army: Army;

  constructor(queue?: TrainingOrder[], army?: Partial<Army>) {
    this._queue = queue ? queue.map((o) => ({ ...o })) : [];
    // Build the army tally from TROOP_ORDER so every troop kind is present and
    // new kinds never drift out of sync with this literal.
    this._army = {} as Army;
    for (const kind of TROOP_ORDER) this._army[kind] = 0;
    if (army) {
      for (const kind of Object.keys(this._army) as TroopKind[]) {
        this._army[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
      }
    }
  }

  /** The standing (idle, trained) army available for battle. */
  get army(): Army {
    return { ...this._army };
  }

  /**
   * Overwrite the standing army with new per-kind counts (clamped to
   * non-negative integers). Used after a battle to apply casualties: the caller
   * passes CombatSystem's `survivors`, so the town reflects the losses. Does
   * NOT touch the pending training queue (troops still in training are
   * unaffected). Missing kinds are treated as zero.
   */
  setArmy(army: Partial<Army>): void {
    for (const kind of Object.keys(this._army) as TroopKind[]) {
      this._army[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
    }
  }

  /** Number of batches currently queued. */
  get length(): number {
    return this._queue.length;
  }

  /** A defensive copy of the pending queue. */
  get orders(): TrainingOrder[] {
    return this._queue.map((o) => ({ ...o }));
  }

  /** True while at least one batch is training. */
  get isBusy(): boolean {
    return this._queue.length > 0;
  }

  /**
   * Enqueue `count` of `troop`, charging the full cost against `store`. The
   * batch completes at `now + (timeAlreadyQueued) + count * trainTimeMs`; i.e.
   * it starts only after everything ahead of it finishes.
   *
   * `hasBarracks` must be true (Barracks prerequisite). Fails without charging
   * if any check fails.
   */
  enqueue(
    troop: TroopKind,
    count: number,
    store: ResourceStore,
    now: number,
    hasBarracks: boolean,
    trainSpeedMult = 1,
  ): EnqueueCheck {
    if (!hasBarracks) return { ok: false, reason: 'no_barracks' };
    if (!Number.isFinite(count) || count <= 0) return { ok: false, reason: 'bad_count' };
    count = Math.floor(count);
    if (count > TRAINING.MAX_BATCH) return { ok: false, reason: 'batch_too_large' };
    if (this._queue.length >= TRAINING.MAX_QUEUE) return { ok: false, reason: 'queue_full' };

    const def = troopDef(troop);
    const totalCost = TrainingQueue.scaleCost(def.cost, count);
    if (!store.canAfford(totalCost)) return { ok: false, reason: 'cost' };
    store.spend(totalCost);

    // Chain after the last queued batch's completion (or `now` if idle).
    //
    // `trainSpeedMult` scales each unit's train time (a value < 1 finishes
    // faster). It defaults to 1 (neutral) so existing callers/tests are
    // unaffected; the research feature threads its
    // {@link ResearchSystem.trainSpeedMultiplier} through here so "training
    // speed" techs shorten real batch completion times.
    const perUnitMs = def.trainTimeMs * Math.max(0, trainSpeedMult);
    const startsAt = this._queue.length > 0 ? this._queue[this._queue.length - 1].completesAt : now;
    const durationMs = count * perUnitMs;
    const completesAt = startsAt + durationMs;
    this._queue.push({ troop, count, startsAt, durationMs, completesAt });
    return { ok: true };
  }

  /**
   * Advance the queue to `now`: every batch whose `completesAt <= now` is
   * finished and its units are added to the army. Returns the per-troop counts
   * that completed on this call. Because batch completion times are chained,
   * finishing in timestamp order is safe.
   */
  advance(now: number): Partial<Record<TroopKind, number>> {
    const completedNow: Partial<Record<TroopKind, number>> = {};
    const remaining: TrainingOrder[] = [];
    for (const order of this._queue) {
      if (order.completesAt <= now) {
        this._army[order.troop] += order.count;
        completedNow[order.troop] = (completedNow[order.troop] ?? 0) + order.count;
      } else {
        remaining.push(order);
      }
    }
    this._queue = remaining;
    return completedNow;
  }

  /**
   * Progress [0..1] of the batch currently at the front of the queue at `now`,
   * based on its own training span. Returns 1 when idle.
   */
  frontProgress(now: number): number {
    if (this._queue.length === 0) return 1;
    const front = this._queue[0];
    const span = Math.max(1, front.durationMs ?? front.count * troopDef(front.troop).trainTimeMs);
    const startAt = front.startsAt ?? front.completesAt - span;
    if (now <= startAt) return 0;
    if (now >= front.completesAt) return 1;
    return (now - startAt) / span;
  }

  /** Milliseconds until the ENTIRE queue is drained (0 when idle). */
  remainingMs(now: number): number {
    if (this._queue.length === 0) return 0;
    const last = this._queue[this._queue.length - 1];
    return Math.max(0, last.completesAt - now);
  }

  /** Scale a per-unit cost bundle by `count`. */
  private static scaleCost(cost: ResourceCost, count: number): ResourceCost {
    const out: ResourceCost = {};
    for (const [res, amount] of Object.entries(cost) as [keyof ResourceCost, number][]) {
      if (typeof amount === 'number') out[res] = amount * count;
    }
    return out;
  }

  /** Serialize the pending queue. Army is persisted separately in GameState. */
  toJSON(): TrainingOrder[] {
    return this.orders;
  }

  /** Restore from a plain queue array plus an army tally. */
  static fromJSON(queue: TrainingOrder[] | undefined, army?: Partial<Army>): TrainingQueue {
    return new TrainingQueue(queue, army);
  }
}
