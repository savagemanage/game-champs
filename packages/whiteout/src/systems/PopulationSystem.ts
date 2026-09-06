import { POPULATION, populationOutputMultiplier } from '../config/GameConfig';
import type { BuildingKind, PopulationState } from '../types';

/**
 * PopulationSystem - the survivor workforce as PURE logic.
 *
 * No Phaser import; mirrors the style of WarmthSystem / ResourceStore so it is
 * fully unit-testable in node. It owns:
 *
 *  - the TOTAL number of survivors (grows over time toward the housing cap, and
 *    can be recruited in bursts by a UI action),
 *  - the per-producer ASSIGNMENT of survivors to work buildings (the rest are
 *    idle), and
 *  - the derived SATISFACTION (a blend of warmth ratio and housing headroom)
 *    and the resulting producer output MULTIPLIER (satisfaction x staffing),
 *    computed through the shared GameConfig curve so the whole game agrees on
 *    one definition.
 *
 * The housing capacity is supplied by the caller (BuildingSystem.totalHousing()
 * plus POPULATION.BASE_HOUSING) rather than owned here, keeping this system
 * free of any building-config coupling. Serializable via toJSON / fromJSON.
 */
export class PopulationSystem {
  private _total: number;
  private readonly _assignments: Map<BuildingKind, number> = new Map();
  /** Fractional survivor accrual carried between ticks (survivors are integers). */
  private _growthCarry = 0;

  constructor(state?: PopulationState) {
    if (state) {
      this._total = Math.max(0, Math.floor(state.total));
      if (state.assignments) {
        for (const [kind, count] of Object.entries(state.assignments) as [BuildingKind, number][]) {
          const n = Math.max(0, Math.floor(count ?? 0));
          if (n > 0) this._assignments.set(kind, n);
        }
      }
    } else {
      this._total = POPULATION.START_SURVIVORS;
    }
    this.clampAssignments();
  }

  /** Total living survivors. */
  get total(): number {
    return this._total;
  }

  /** Survivors currently assigned to a work building. */
  get assigned(): number {
    let sum = 0;
    for (const n of this._assignments.values()) sum += n;
    return sum;
  }

  /** Survivors not assigned to any building (available to assign). */
  get idle(): number {
    return Math.max(0, this._total - this.assigned);
  }

  /** Survivors assigned to a specific building. */
  assignedTo(kind: BuildingKind): number {
    return this._assignments.get(kind) ?? 0;
  }

  /** The housing cap: the base shelter plus any Shelter Row capacity. */
  housingCap(extraHousing: number): number {
    return POPULATION.BASE_HOUSING + Math.max(0, extraHousing);
  }

  /**
   * Housing headroom in [0,1]: 1 when survivors fit comfortably under the cap,
   * falling toward 0 as the hold fills and overcrowds. At/over the cap it is 0.
   */
  housingHeadroom(extraHousing: number): number {
    const cap = this.housingCap(extraHousing);
    if (cap <= 0) return 0;
    return Math.min(1, Math.max(0, (cap - this._total) / cap));
  }

  /**
   * Satisfaction in [0,1]: a weighted blend of the Furnace warmth ratio and the
   * housing headroom, using POPULATION weights. A warm, roomy hold is content;
   * a freezing or overcrowded one is not.
   */
  satisfaction(warmthRatio: number, extraHousing: number): number {
    const warm = Math.min(1, Math.max(0, warmthRatio));
    const headroom = this.housingHeadroom(extraHousing);
    const value =
      POPULATION.SATISFACTION_WARMTH_WEIGHT * warm +
      POPULATION.SATISFACTION_HOUSING_WEIGHT * headroom;
    return Math.min(1, Math.max(0, value));
  }

  /**
   * Staffing ratio in [0,1]: assigned survivors divided by the survivors the
   * producers want to be fully staffed (`desiredStaff`). With no desired
   * staffing (no producers built) staffing is considered full (1).
   */
  staffingRatio(desiredStaff: number): number {
    if (desiredStaff <= 0) return 1;
    return Math.min(1, this.assigned / desiredStaff);
  }

  /**
   * The producer-output multiplier from the workforce: satisfaction x staffing
   * through the shared GameConfig curve. Pass this alongside the warmth
   * multiplier to ResourceStore.applyProduction (GameState multiplies them).
   */
  outputMultiplier(warmthRatio: number, extraHousing: number, desiredStaff: number): number {
    return populationOutputMultiplier(
      this.satisfaction(warmthRatio, extraHousing),
      this.staffingRatio(desiredStaff),
    );
  }

  /**
   * Advance survivor growth by `deltaMs`: new survivors trickle in at
   * POPULATION.GROWTH_PER_SEC toward the housing cap. Fractional growth is
   * carried between ticks so slow growth still accrues. Never exceeds the cap.
   * Returns the number of whole survivors that arrived this tick.
   */
  tick(deltaMs: number, extraHousing: number): number {
    if (deltaMs <= 0) return 0;
    const cap = this.housingCap(extraHousing);
    if (this._total >= cap) {
      this._growthCarry = 0;
      return 0;
    }
    const seconds = deltaMs / 1000;
    this._growthCarry += POPULATION.GROWTH_PER_SEC * seconds;
    let arrived = Math.floor(this._growthCarry);
    if (arrived <= 0) return 0;
    this._growthCarry -= arrived;
    const room = cap - this._total;
    if (arrived > room) {
      arrived = room;
      this._growthCarry = 0; // at the cap: drop the surplus carry
    }
    this._total += arrived;
    return arrived;
  }

  /**
   * Recruit survivors instantly (a UI action), never exceeding the housing cap.
   * Returns the number actually added.
   */
  recruit(count: number, extraHousing: number): number {
    if (count <= 0) return 0;
    const cap = this.housingCap(extraHousing);
    const room = Math.max(0, cap - this._total);
    const added = Math.min(Math.floor(count), room);
    this._total += added;
    return added;
  }

  /**
   * Assign an absolute count of survivors to a producer building, clamped so it
   * never assigns more than are available (idle + already-here). Returns the
   * count actually assigned to that building afterwards.
   */
  assign(kind: BuildingKind, count: number): number {
    const target = Math.max(0, Math.floor(count));
    const current = this.assignedTo(kind);
    // Survivors free to move to this building = idle plus those already here.
    const available = this.idle + current;
    const next = Math.min(target, available);
    if (next <= 0) this._assignments.delete(kind);
    else this._assignments.set(kind, next);
    return this.assignedTo(kind);
  }

  /** Recall all survivors to idle (clears every assignment). */
  recallAll(): void {
    this._assignments.clear();
  }

  /**
   * Clamp all assignments so their sum never exceeds the total survivors
   * (proportionally trims if a smaller/older save over-committed). Called on
   * construction and after any total change that could invalidate assignments.
   */
  private clampAssignments(): void {
    let sum = this.assigned;
    if (sum <= this._total) return;
    // Trim from the largest assignments first until within budget.
    const entries = [...this._assignments.entries()].sort((a, b) => b[1] - a[1]);
    let overflow = sum - this._total;
    for (const [kind, count] of entries) {
      if (overflow <= 0) break;
      const take = Math.min(count, overflow);
      const remaining = count - take;
      overflow -= take;
      if (remaining <= 0) this._assignments.delete(kind);
      else this._assignments.set(kind, remaining);
    }
  }

  /** Serialize to a plain {@link PopulationState}. */
  toJSON(): PopulationState {
    const assignments: PopulationState['assignments'] = {};
    for (const [kind, count] of this._assignments.entries()) {
      if (count > 0) assignments[kind] = count;
    }
    return { total: this._total, assignments };
  }

  /**
   * Restore from a persisted {@link PopulationState}. A missing / malformed
   * value yields a fresh workforce (START_SURVIVORS, no assignments) so old or
   * corrupt saves load without crashing.
   */
  static fromJSON(data: PopulationState | undefined | null): PopulationSystem {
    if (!data || typeof data !== 'object' || typeof data.total !== 'number') {
      return new PopulationSystem();
    }
    return new PopulationSystem(data);
  }
}
