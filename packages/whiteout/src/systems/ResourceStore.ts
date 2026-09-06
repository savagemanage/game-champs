import { ECONOMY, RESOURCE_ORDER } from '../config/GameConfig';
import type { Resources, ResourceCost, ResourceKind } from '../types';

/** Read-only rate bundle: how much of each resource is produced per second. */
export type ProductionRates = Resources;

/**
 * ResourceStore - the four resource stockpiles plus the idle-production math.
 *
 * Pure logic (no Phaser): it holds `food/wood/coal/iron` balances, supports
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

  /** A zeroed resource bundle (one entry per canonical RESOURCE_ORDER kind). */
  static emptyBundle(): Resources {
    const bundle = {} as Resources;
    for (const res of RESOURCE_ORDER) bundle[res] = 0;
    return bundle;
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
   * Credit passive production for an elapsed time. `rates` is production per
   * SECOND for each resource; `dtMs` is elapsed milliseconds; `efficiency`
   * scales the whole gain (1 for live play, ECONOMY.OFFLINE_EFFICIENCY when
   * reconciling offline time). Returns the bundle that was actually credited.
   */
  applyProduction(rates: ProductionRates, dtMs: number, efficiency = 1): Resources {
    const gained = ResourceStore.emptyBundle();
    if (dtMs <= 0 || efficiency <= 0) return gained;
    const seconds = dtMs / 1000;
    for (const res of RESOURCE_ORDER) {
      const amount = (rates[res] ?? 0) * seconds * efficiency;
      if (amount > 0) {
        gained[res] = amount;
        this._balances[res] += amount;
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
