import {
  BUILDING_DEFS,
  BUILDING_ORDER,
  buildingDef,
  isProducer,
  outputPerSec,
  upgradeCost,
  upgradeTimeMs,
} from '../config/BuildingConfig';
import type { BuildingKind, BuildingState, ResourceCost, Resources } from '../types';
import { ResourceStore, type ProductionRates } from './ResourceStore';

/** Outcome of attempting to start an upgrade. */
export interface UpgradeCheck {
  ok: boolean;
  /** Reason code when `ok` is false. */
  reason?: 'busy' | 'max_level' | 'prereq' | 'cost';
}

/**
 * BuildingSystem - owned buildings, their levels, and the upgrade lifecycle.
 *
 * Pure logic (no Phaser). It owns a set of {@link BuildingState}s keyed by kind,
 * enforces the Town-Center level gate and per-building prerequisites, checks
 * affordability against a {@link ResourceStore}, runs time-based upgrades, and
 * exposes the aggregate per-second production rates the ResourceStore consumes.
 * Serializable to/from `BuildingState[]`.
 *
 * Level semantics: level 0 means "not built". Starting an upgrade from level 0
 * is the initial build; from level N it advances to N+1 after the configured
 * time. Cost/time/output all come from BuildingConfig so nothing is hardcoded.
 */
export class BuildingSystem {
  private readonly _buildings: Map<BuildingKind, BuildingState> = new Map();

  constructor(states?: BuildingState[]) {
    if (states && states.length > 0) {
      for (const s of states) {
        if (BUILDING_DEFS[s.kind]) {
          this._buildings.set(s.kind, { kind: s.kind, level: s.level, upgradeEndsAt: s.upgradeEndsAt });
        }
      }
    } else {
      // Fresh game: a level-1 Town Center is standing, everything else unbuilt.
      this._buildings.set('town_center', { kind: 'town_center', level: 1, upgradeEndsAt: null });
    }
  }

  /** Current level of a building (0 = not built). */
  level(kind: BuildingKind): number {
    return this._buildings.get(kind)?.level ?? 0;
  }

  /** The current Town Center level (0 if somehow absent). */
  get townCenterLevel(): number {
    return this.level('town_center');
  }

  /** True while a building has an upgrade in progress. */
  isUpgrading(kind: BuildingKind): boolean {
    return (this._buildings.get(kind)?.upgradeEndsAt ?? null) !== null;
  }

  /** Epoch ms an in-progress upgrade finishes, or null. */
  upgradeEndsAt(kind: BuildingKind): number | null {
    return this._buildings.get(kind)?.upgradeEndsAt ?? null;
  }

  /** Cost to take `kind` from its current level to the next. */
  nextUpgradeCost(kind: BuildingKind): ResourceCost {
    return upgradeCost(kind, this.level(kind));
  }

  /** Time in ms the next upgrade of `kind` will take. */
  nextUpgradeTimeMs(kind: BuildingKind): number {
    return upgradeTimeMs(kind, this.level(kind));
  }

  /**
   * Whether an upgrade of `kind` may be STARTED right now against `store`.
   * Checks (in order): not already upgrading, below max level, Town-Center gate
   * (both the hard `requiresTownCenterLevel` and the "may not exceed TC level"
   * rule for non-Town-Center buildings), and affordability.
   */
  canUpgrade(kind: BuildingKind, store: ResourceStore): UpgradeCheck {
    const def = buildingDef(kind);
    const level = this.level(kind);

    if (this.isUpgrading(kind)) return { ok: false, reason: 'busy' };
    if (level >= def.maxLevel) return { ok: false, reason: 'max_level' };

    if (kind === 'town_center') {
      // Town Center is only gated by its own max level (checked above).
    } else {
      const tc = this.townCenterLevel;
      // Hard prerequisite: enough Town Center level to own this at all.
      if (tc < def.requiresTownCenterLevel) return { ok: false, reason: 'prereq' };
      // Soft gate: a building's level may never exceed the Town Center's.
      if (level >= tc) return { ok: false, reason: 'prereq' };
    }

    if (!store.canAfford(this.nextUpgradeCost(kind))) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Start an upgrade: spends the cost from `store` and schedules completion at
   * `now + upgradeTime`. Returns the check result; on failure nothing changes.
   */
  startUpgrade(kind: BuildingKind, store: ResourceStore, now: number): UpgradeCheck {
    const check = this.canUpgrade(kind, store);
    if (!check.ok) return check;

    const cost = this.nextUpgradeCost(kind);
    if (!store.spend(cost)) return { ok: false, reason: 'cost' };

    const existing = this._buildings.get(kind) ?? { kind, level: 0, upgradeEndsAt: null };
    existing.kind = kind;
    existing.upgradeEndsAt = now + this.nextUpgradeTimeMs(kind);
    this._buildings.set(kind, existing);
    return { ok: true };
  }

  /**
   * Complete any upgrades whose timer has elapsed at `now`. Increments each
   * finished building's level and clears its timer. Returns the kinds that
   * completed (useful for SFX / notifications).
   */
  update(now: number): BuildingKind[] {
    const completed: BuildingKind[] = [];
    for (const state of this._buildings.values()) {
      if (state.upgradeEndsAt !== null && now >= state.upgradeEndsAt) {
        state.level += 1;
        state.upgradeEndsAt = null;
        completed.push(state.kind);
      }
    }
    return completed;
  }

  /** Whether the Barracks is built (level >= 1), gating troop training. */
  get hasBarracks(): boolean {
    return this.level('barracks') >= 1;
  }

  /**
   * Aggregate per-second production rates across all producer buildings at
   * their current levels. Fed to ResourceStore.applyProduction.
   */
  productionRates(): ProductionRates {
    const rates = ResourceStore.emptyBundle();
    for (const kind of BUILDING_ORDER) {
      if (!isProducer(kind)) continue;
      const def = buildingDef(kind);
      const level = this.level(kind);
      if (level <= 0 || !def.produces) continue;
      rates[def.produces] += outputPerSec(kind, level);
    }
    return rates;
  }

  /** Serialize the owned buildings to a plain array. */
  toJSON(): BuildingState[] {
    return [...this._buildings.values()].map((s) => ({ ...s }));
  }

  /** Restore from a plain array produced by {@link toJSON}. */
  static fromJSON(states: BuildingState[] | undefined): BuildingSystem {
    return new BuildingSystem(states);
  }

  /** The current owned-building snapshot (defensive copies). */
  get states(): BuildingState[] {
    return this.toJSON();
  }

  /** Read-only helper: total production of a single resource, for HUD. */
  outputOf(res: keyof Resources): number {
    return this.productionRates()[res];
  }
}
