import { WARMTH, warmthProductionMultiplier } from '../config/GameConfig';
import { ResourceStore } from './ResourceStore';

/** Info returned from a warmth {@link WarmthSystem.tick} for the UI / callers. */
export interface WarmthTickResult {
  /** The warmth level after this tick, clamped to [0, maxWarmth]. */
  warmth: number;
  /** Whether the hearth was fully fueled this tick (warmth rose) or ran cold. */
  fueled: boolean;
  /** Firewood actually spent from the store this tick. */
  fuelSpent: { wood: number };
}

/**
 * WarmthSystem - the keep's Hearth / Warmth survival layer as PURE logic.
 *
 * Ported from the "Frosthold: Last Ember" prototype and re-themed for Kingdom
 * Rise. No Phaser import; it mirrors the style of ResourceStore /
 * BuildingSystem so it is fully unit-testable in node. It owns the current
 * warmth value and the math that ties firewood to warmth to production
 * efficiency:
 *
 *  - Each {@link tick} the hearth tries to burn its per-second firewood demand
 *    (scaled DOWN by Town-Center-level efficiency). If the store can pay the
 *    full demand, warmth rises by WARMTH.WARMTH_GAIN_PER_SEC; otherwise no wood
 *    is spent, the hearth runs cold, and warmth decays by
 *    WARMTH.WARMTH_DECAY_PER_SEC. Warmth is always clamped to [0, maxWarmth].
 *  - {@link maxWarmth} rises with Town Center level (the central building plays
 *    the role Frosthold's Furnace did).
 *  - {@link productionMultiplier} maps the current warmth RATIO through the
 *    shared GameConfig curve (floor..1.0); GameState composes it into the
 *    efficiency it feeds ResourceStore.applyProduction, so a cold keep works
 *    slower.
 *
 * RE-THEME: the original burned wood + coal; Kingdom Rise has no coal, so the
 * hearth burns WOOD ONLY (firewood), using only the existing resource set.
 *
 * Serializable via {@link toJSON} / {@link fromJSON} (just the scalar warmth).
 */
export class WarmthSystem {
  private _warmth: number;

  /**
   * @param initialWarmth Starting warmth. Defaults to WARMTH.MAX_WARMTH (a
   * fresh, fully-warm keep). Clamped to be non-negative; the effective ceiling
   * depends on Town Center level and is applied on the next tick / clamp.
   */
  constructor(initialWarmth: number = WARMTH.MAX_WARMTH) {
    this._warmth = Number.isFinite(initialWarmth) ? Math.max(0, initialWarmth) : WARMTH.MAX_WARMTH;
  }

  /** Current warmth level. */
  get warmth(): number {
    return this._warmth;
  }

  /** Maximum warmth achievable at the given Town Center level. */
  maxWarmth(townCenterLevel: number): number {
    const levelsAbove = Math.max(0, townCenterLevel - 1);
    return WARMTH.MAX_WARMTH + WARMTH.MAX_WARMTH_PER_LEVEL * levelsAbove;
  }

  /**
   * Firewood burn per second at the given Town Center level. Base demand is
   * reduced by FUEL_EFFICIENCY_PER_LEVEL per level above 1, floored at
   * FUEL_MIN_FACTOR of the base so fuel never becomes irrelevant.
   */
  fuelPerSecond(townCenterLevel: number): { wood: number } {
    const levelsAbove = Math.max(0, townCenterLevel - 1);
    const factor = Math.max(
      WARMTH.FUEL_MIN_FACTOR,
      1 - WARMTH.FUEL_EFFICIENCY_PER_LEVEL * levelsAbove,
    );
    return { wood: WARMTH.FUEL_PER_SECOND.wood * factor };
  }

  /**
   * Advance warmth by `deltaMs`, burning firewood from `store` at the current
   * Town Center level. If the store can pay the whole fuel demand for the
   * elapsed time, it is spent and warmth rises; otherwise nothing is spent and
   * warmth decays. Warmth is clamped to [0, maxWarmth(townCenterLevel)].
   * Returns UI info.
   */
  tick(deltaMs: number, townCenterLevel: number, store: ResourceStore): WarmthTickResult {
    const max = this.maxWarmth(townCenterLevel);
    // A no-op tick still reports the (re-clamped) state.
    if (deltaMs <= 0) {
      this._warmth = Math.min(max, Math.max(0, this._warmth));
      return { warmth: this._warmth, fueled: true, fuelSpent: { wood: 0 } };
    }

    const seconds = deltaMs / 1000;
    const perSec = this.fuelPerSecond(townCenterLevel);
    const demand = { wood: perSec.wood * seconds };

    // Atomic: only burn if the whole demand is affordable, so partial fueling
    // never leaves warmth in an ambiguous state.
    const fueled = store.spend(demand);
    const fuelSpent = fueled ? { ...demand } : { wood: 0 };

    const change = fueled
      ? WARMTH.WARMTH_GAIN_PER_SEC * seconds
      : -WARMTH.WARMTH_DECAY_PER_SEC * seconds;
    this._warmth = Math.min(max, Math.max(0, this._warmth + change));

    return { warmth: this._warmth, fueled, fuelSpent };
  }

  /** Current warmth as a ratio of the max at the given Town Center level, in [0,1]. */
  warmthRatio(townCenterLevel: number): number {
    const max = this.maxWarmth(townCenterLevel);
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, this._warmth / max));
  }

  /**
   * The idle-production multiplier derived from the current warmth ratio via
   * the shared GameConfig curve (WARMTH.WARMTH_PRODUCTION_FLOOR..1.0). GameState
   * composes this into the efficiency it passes to
   * ResourceStore.applyProduction (multiplicatively with the research + hero
   * economy factors), so low warmth throttles the whole economy.
   */
  productionMultiplier(townCenterLevel: number): number {
    return warmthProductionMultiplier(this.warmthRatio(townCenterLevel));
  }

  /** Serialize to a scalar warmth value for the save layer. */
  toJSON(): number {
    return this._warmth;
  }

  /**
   * Restore from a persisted value. A missing / non-finite value (a legacy or
   * warmth-less save) yields a fully-warm keep rather than a frozen one, so old
   * saves migrate forward without penalty or crash.
   */
  static fromJSON(data: number | undefined | null): WarmthSystem {
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      return new WarmthSystem();
    }
    return new WarmthSystem(data);
  }
}
