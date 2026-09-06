import { TRAINING, TROOP_TIERS } from '../config/GameConfig';
import { troopTierCost, troopTierTrainTimeMs } from '../config/TroopConfig';
import type { Army, ArmyTiers, ResourceCost, TrainingOrder, TroopKind } from '../types';
import { ResourceStore } from './ResourceStore';

/** Outcome of attempting to enqueue a training batch. */
export interface EnqueueCheck {
  ok: boolean;
  reason?: 'no_war_camp' | 'queue_full' | 'bad_count' | 'batch_too_large' | 'cost';
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
 * checked against a {@link ResourceStore}. Requires a built War Camp (the caller
 * passes `hasWarCamp` from BuildingSystem). Serializable to/from TrainingOrder[].
 */
export class TrainingQueue {
  private _queue: TrainingOrder[];
  private readonly _army: Army;
  /**
   * The standing army broken down by tier: kind -> (tier -> count). The flat
   * {@link _army} stays the per-kind TOTAL across tiers so battle rendering and
   * neutral power calls are unchanged; this parallel map lets the combat
   * resolver field each unit at the tier it was trained.
   */
  private readonly _tiers: Map<TroopKind, Map<number, number>> = new Map();

  constructor(queue?: TrainingOrder[], army?: Partial<Army>, tiers?: ArmyTiers) {
    this._queue = queue ? queue.map((o) => ({ ...o })) : [];
    this._army = { trapper: 0, marksman: 0, vanguard: 0 };
    if (army) {
      for (const kind of Object.keys(this._army) as TroopKind[]) {
        this._army[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
      }
    }
    // Restore the per-tier breakdown, then reconcile it against the flat totals
    // so an older-shaped save (no tiers) or a mismatched one lands every unit at
    // a sensible tier (tier 1 for any total not accounted for by a tier map).
    if (tiers) {
      for (const kind of Object.keys(this._army) as TroopKind[]) {
        const perTier = tiers[kind];
        if (!perTier) continue;
        for (const [tierStr, count] of Object.entries(perTier)) {
          const tier = clampTier(Number(tierStr));
          const n = Math.max(0, Math.floor(count ?? 0));
          if (n > 0) this.addTier(kind, tier, n);
        }
      }
    }
    this.reconcileTiers();
  }

  /** The standing (idle, trained) army available for battle (per-kind totals). */
  get army(): Army {
    return { ...this._army };
  }

  /**
   * The standing army broken down by tier: kind -> (tier -> count). A defensive
   * plain-object copy; missing kinds/tiers are absent (treated as 0). The combat
   * resolver reads this so a higher-tier unit fields its stronger stats.
   */
  get armyTiers(): ArmyTiers {
    const out: ArmyTiers = {};
    for (const [kind, perTier] of this._tiers.entries()) {
      const map: Record<number, number> = {};
      for (const [tier, count] of perTier.entries()) if (count > 0) map[tier] = count;
      if (Object.keys(map).length > 0) out[kind] = map;
    }
    return out;
  }

  /** Add `count` units of `kind` at `tier` to the per-tier breakdown. */
  private addTier(kind: TroopKind, tier: number, count: number): void {
    if (count <= 0) return;
    let perTier = this._tiers.get(kind);
    if (!perTier) {
      perTier = new Map();
      this._tiers.set(kind, perTier);
    }
    perTier.set(tier, (perTier.get(tier) ?? 0) + count);
  }

  /** The tiered total for a kind (sum across tiers in the breakdown). */
  private tierTotal(kind: TroopKind): number {
    let sum = 0;
    const perTier = this._tiers.get(kind);
    if (perTier) for (const n of perTier.values()) sum += n;
    return sum;
  }

  /**
   * Reconcile the per-tier breakdown against the flat per-kind totals: any total
   * not covered by the tier map is treated as tier 1, and any surplus in the
   * tier map (over the flat total) is trimmed from the highest tiers first. This
   * keeps the two views consistent after a setArmy (casualties) or an
   * older-shaped load, so combat never over- or under-counts.
   */
  private reconcileTiers(): void {
    for (const kind of Object.keys(this._army) as TroopKind[]) {
      const total = this._army[kind];
      let tiered = this.tierTotal(kind);
      if (tiered < total) {
        // Untracked units default to tier 1 (older save / plain grant).
        this.addTier(kind, 1, total - tiered);
      } else if (tiered > total) {
        // Trim surplus from the highest tiers down.
        const perTier = this._tiers.get(kind)!;
        let overflow = tiered - total;
        const tiersDesc = [...perTier.keys()].sort((a, b) => b - a);
        for (const tier of tiersDesc) {
          if (overflow <= 0) break;
          const have = perTier.get(tier) ?? 0;
          const take = Math.min(have, overflow);
          const left = have - take;
          overflow -= take;
          if (left <= 0) perTier.delete(tier);
          else perTier.set(tier, left);
        }
      }
      if (total <= 0) this._tiers.delete(kind);
    }
  }

  /**
   * Overwrite the standing army with new per-kind counts (clamped to
   * non-negative integers). Used after a battle to apply casualties: the caller
   * passes CombatSystem's `survivors`, so the town reflects the losses. Does
   * NOT touch the pending training queue (troops still in training are
   * unaffected). Missing kinds are treated as zero.
   *
   * Casualties are taken proportionally from the highest tiers down in the tier
   * breakdown (via {@link reconcileTiers}); an optional `survivorTiers` lets the
   * caller pass an exact post-battle breakdown instead.
   */
  setArmy(army: Partial<Army>, survivorTiers?: ArmyTiers): void {
    for (const kind of Object.keys(this._army) as TroopKind[]) {
      this._army[kind] = Math.max(0, Math.floor(army[kind] ?? 0));
    }
    if (survivorTiers) {
      this._tiers.clear();
      for (const kind of Object.keys(this._army) as TroopKind[]) {
        const perTier = survivorTiers[kind];
        if (!perTier) continue;
        for (const [tierStr, count] of Object.entries(perTier)) {
          this.addTier(kind, clampTier(Number(tierStr)), Math.max(0, Math.floor(count ?? 0)));
        }
      }
    }
    this.reconcileTiers();
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
   * `hasWarCamp` must be true (War Camp prerequisite). Fails without charging
   * if any check fails.
   */
  enqueue(
    troop: TroopKind,
    count: number,
    store: ResourceStore,
    now: number,
    hasWarCamp: boolean,
    tier: number = 1,
  ): EnqueueCheck {
    if (!hasWarCamp) return { ok: false, reason: 'no_war_camp' };
    if (!Number.isFinite(count) || count <= 0) return { ok: false, reason: 'bad_count' };
    count = Math.floor(count);
    if (count > TRAINING.MAX_BATCH) return { ok: false, reason: 'batch_too_large' };
    if (this._queue.length >= TRAINING.MAX_QUEUE) return { ok: false, reason: 'queue_full' };

    const t = clampTier(tier);
    // Tier-scaled per-unit cost + train time (T1 is the TroopConfig baseline).
    const totalCost = TrainingQueue.scaleCost(troopTierCost(troop, t), count);
    if (!store.canAfford(totalCost)) return { ok: false, reason: 'cost' };
    store.spend(totalCost);

    // Chain after the last queued batch's completion (or `now` if idle).
    const startAt = this._queue.length > 0 ? this._queue[this._queue.length - 1].completesAt : now;
    const completesAt = startAt + count * troopTierTrainTimeMs(troop, t);
    this._queue.push({ troop, count, tier: t, completesAt });
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
        // Land the finished batch at its own tier in the breakdown.
        this.addTier(order.troop, clampTier(order.tier ?? 1), order.count);
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
    const span = front.count * troopTierTrainTimeMs(front.troop, clampTier(front.tier ?? 1));
    const startAt = front.completesAt - span;
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

  /** Serialize the pending queue. Army + tiers are persisted separately in GameState. */
  toJSON(): TrainingOrder[] {
    return this.orders;
  }

  /**
   * Restore from a plain queue array plus an army tally and (optionally) its
   * per-tier breakdown. A missing `tiers` (older-shaped save) lands every
   * standing unit at tier 1 (see the constructor's reconcile pass).
   */
  static fromJSON(
    queue: TrainingOrder[] | undefined,
    army?: Partial<Army>,
    tiers?: ArmyTiers,
  ): TrainingQueue {
    return new TrainingQueue(queue, army, tiers);
  }
}

/** Clamp a requested tier into the valid [1, MAX_TIER] range (module-local). */
function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return 1;
  return Math.min(TROOP_TIERS.MAX_TIER, Math.max(1, Math.floor(tier)));
}
