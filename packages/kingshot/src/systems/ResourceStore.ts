import { ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import type { Resources, ResourceCost, ResourceKind } from '../types';

/**
 * Per-resource soft storage cap given a storage multiplier (from research). The
 * base cap comes from ECONOMY.STORAGE_CAP; a multiplier > 1 raises it. Only
 * passive production is capped by this, so rewards/spending are unaffected.
 */
export function storageCap(capMult = 1): number {
  return ECONOMY.STORAGE_CAP * Math.max(1, capMult);
}

/** Read-only rate bundle: how much of each resource is produced per second. */
export type ProductionRates = Resources;

/**
 * ResourceStore - the four resource stockpiles plus the idle-production math.
 *
 * Pure logic (no Phaser): it holds `food/wood/stone/gold` balances, supports
 * affordability-checked spending, and can credit passive production for an
 * elapsed `dt` given the current per-second production rates (which
 * BuildingSystem derives from BuildingConfig). Serializable to/from a plain
 * `Resources` object for the save layer.
 */
export class ResourceStore {
  private readonly _balances: Resources;

  constructor(initial?: Partial<Resources>) {
    this._balances = ResourceStore.emptyBundle();
    const start = initial ?? ECONOMY.START;
    for (const res of RESOURCE_ORDER) {
      this._balances[res] = Math.max(0, start[res] ?? 0);
    }
  }

  /** A zeroed resource bundle. */
  static emptyBundle(): Resources {
    return { food: 0, wood: 0, stone: 0, gold: 0 };
  }

  /** Current amount of a single resource. */
  get(res: ResourceKind): number {
    return this._balances[res];
  }

  /** A defensive copy of all balances. */
  get balances(): Resources {
    return { ...this._balances };
  }

  /** Whether the store can pay the whole cost bundle. */
  canAfford(cost: ResourceCost): boolean {
    for (const res of RESOURCE_ORDER) {
      const need = cost[res] ?? 0;
      if (need > 0 && this._balances[res] < need) return false;
    }
    return true;
  }

  /**
   * Attempt to spend a cost bundle atomically. Deducts and returns true only if
   * the whole bundle is affordable; otherwise changes nothing and returns false.
   */
  spend(cost: ResourceCost): boolean {
    if (!this.canAfford(cost)) return false;
    for (const res of RESOURCE_ORDER) {
      const need = cost[res] ?? 0;
      if (need > 0) this._balances[res] -= need;
    }
    return true;
  }

  /** Add a bundle of resources (rewards, production). Negative parts are clamped at 0. */
  add(bundle: ResourceCost): void {
    for (const res of RESOURCE_ORDER) {
      const amount = bundle[res] ?? 0;
      if (amount !== 0) this._balances[res] = Math.max(0, this._balances[res] + amount);
    }
  }

  /**
   * Deduct a bundle NON-atomically, clamping each balance at 0 (unlike
   * {@link spend}, which is all-or-nothing and fails when unaffordable). Used
   * for penalties the player cannot refuse - e.g. the raiders sacking a poorly-
   * defended town on a lost battle. Returns what was actually taken.
   */
  subtract(bundle: ResourceCost): Resources {
    const taken = ResourceStore.emptyBundle();
    for (const res of RESOURCE_ORDER) {
      const amount = bundle[res] ?? 0;
      if (amount > 0) {
        const removed = Math.min(this._balances[res], amount);
        this._balances[res] -= removed;
        taken[res] = removed;
      }
    }
    return taken;
  }

  /**
   * Credit passive production for an elapsed time. `rates` is production per
   * SECOND for each resource; `dtMs` is elapsed milliseconds; `efficiency`
   * scales the whole gain (1 for live play, ECONOMY.OFFLINE_EFFICIENCY when
   * reconciling offline time). Returns the bundle that was actually credited.
   *
   * Passive production is clamped to the soft storage cap ({@link storageCap}
   * scaled by `capMult`). A balance already at/over the cap gains nothing more
   * from production; a partial fill is credited only up to the cap. `capMult`
   * defaults to 1 (base cap) so existing callers are unaffected; the research
   * "storage" techs pass a multiplier > 1 to raise the ceiling. Rewards and
   * spending (see {@link add}/{@link spend}) are NOT capped.
   */
  applyProduction(rates: ProductionRates, dtMs: number, efficiency = 1, capMult = 1): Resources {
    const gained = ResourceStore.emptyBundle();
    if (dtMs <= 0 || efficiency <= 0) return gained;
    const seconds = dtMs / 1000;
    const cap = storageCap(capMult);
    for (const res of RESOURCE_ORDER) {
      const amount = (rates[res] ?? 0) * seconds * efficiency;
      if (amount <= 0) continue;
      const current = this._balances[res];
      // Only production is capped; a balance already over the cap (e.g. from a
      // battle reward) is left untouched rather than clawed back.
      const room = Math.max(0, cap - current);
      const credited = Math.min(amount, room);
      if (credited > 0) {
        gained[res] = credited;
        this._balances[res] += credited;
      }
    }
    return gained;
  }

  /** Serialize to a plain object (a copy, safe to mutate). */
  toJSON(): Resources {
    return { ...this._balances };
  }

  /** Restore from a plain object produced by {@link toJSON}. */
  static fromJSON(data: Partial<Resources> | undefined): ResourceStore {
    return new ResourceStore(data ?? ResourceStore.emptyBundle());
  }
}
