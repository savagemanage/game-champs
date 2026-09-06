import {
  TECH_DEFS,
  TECH_ORDER,
  techDef,
  type EffectKind,
  type TechId,
} from '../config/ResearchConfig';
import type { ResourceStore } from './ResourceStore';

/** Why a research cannot be started right now. */
export type ResearchDenyReason =
  | 'already' // the tech is already unlocked
  | 'prereq' // a prerequisite tech is not yet unlocked
  | 'building' // the Scholars' Hall level is too low
  | 'cost' // not enough resources
  | 'busy'; // a research is already in progress (single slot)

/** Result of {@link ResearchSystem.canResearch}. */
export interface ResearchCheck {
  ok: boolean;
  reason?: ResearchDenyReason;
}

/** A research in progress in the single research slot. */
export interface ActiveResearch {
  techId: TechId;
  /** Epoch ms when it completes. */
  endsAt: number;
}

/** Serialized shape persisted by the save layer. */
export interface ResearchStateJSON {
  unlocked: TechId[];
  active: ActiveResearch | null;
}

/**
 * ResearchSystem - the pure (no Phaser) Scholars' Hall tech tree runtime.
 *
 * Owns which techs are unlocked and the single in-progress research slot. It
 * gates starts through {@link canResearch} (returning a distinct reason code),
 * charges the cost and schedules completion in {@link startResearch}, completes
 * elapsed research in {@link update}, and exposes aggregate multiplier getters
 * that compose (multiplicatively) every unlocked tech of a given effect kind.
 * Those getters are what the economy / training / combat / build / offline
 * seams read to apply bonuses. Fully serializable via toJSON/fromJSON.
 *
 * A single research slot keeps the model simple and testable: one tech at a
 * time, gated by `busy` while it runs.
 */
export class ResearchSystem {
  private readonly _unlocked: Set<TechId>;
  private _active: ActiveResearch | null;

  constructor(unlocked?: Iterable<TechId>, active?: ActiveResearch | null) {
    this._unlocked = new Set();
    if (unlocked) {
      for (const id of unlocked) {
        if (TECH_DEFS[id]) this._unlocked.add(id);
      }
    }
    this._active = active && TECH_DEFS[active.techId] ? { ...active } : null;
  }

  /** True when the given tech has been fully researched. */
  isUnlocked(id: TechId): boolean {
    return this._unlocked.has(id);
  }

  /** The set of unlocked tech ids (defensive copy in TECH_ORDER order). */
  get unlocked(): TechId[] {
    return TECH_ORDER.filter((id) => this._unlocked.has(id));
  }

  /** The in-progress research, or null when idle. */
  get active(): ActiveResearch | null {
    return this._active ? { ...this._active } : null;
  }

  /** True while a research occupies the single slot. */
  get isBusy(): boolean {
    return this._active !== null;
  }

  /** The tech currently being researched, or null. */
  get activeTech(): TechId | null {
    return this._active ? this._active.techId : null;
  }

  /**
   * Whether `id` may be STARTED right now, given the resources in `store` and
   * the current Scholars' Hall level `researchLevel`. Checks, in order:
   * already unlocked, another research in progress (busy), prerequisite tech,
   * Hall level gate, then affordability. Returns the first failing reason.
   */
  canResearch(id: TechId, store: ResourceStore, researchLevel: number): ResearchCheck {
    const def = techDef(id);
    if (this._unlocked.has(id)) return { ok: false, reason: 'already' };
    if (this._active !== null) return { ok: false, reason: 'busy' };
    if (def.requires && !this._unlocked.has(def.requires)) return { ok: false, reason: 'prereq' };
    if (researchLevel < def.requiresResearchLevel) return { ok: false, reason: 'building' };
    if (!store.canAfford(def.cost)) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Start researching `id`: spends its cost from `store` and schedules
   * completion at `now + timeMs`. Returns the check result; on failure nothing
   * changes and no resources are spent.
   */
  startResearch(
    id: TechId,
    store: ResourceStore,
    now: number,
    researchLevel: number,
  ): ResearchCheck {
    const check = this.canResearch(id, store, researchLevel);
    if (!check.ok) return check;
    const def = techDef(id);
    if (!store.spend(def.cost)) return { ok: false, reason: 'cost' };
    this._active = { techId: id, endsAt: now + def.timeMs };
    return { ok: true };
  }

  /**
   * Advance to `now`: if the active research has elapsed, unlock its tech and
   * clear the slot. Returns the tech ids that completed on this call (0 or 1,
   * given the single slot) so callers can play a completion SFX.
   */
  update(now: number): TechId[] {
    const completed: TechId[] = [];
    if (this._active !== null && now >= this._active.endsAt) {
      this._unlocked.add(this._active.techId);
      completed.push(this._active.techId);
      this._active = null;
    }
    return completed;
  }

  /** Progress [0..1] of the active research at `now` (1 when idle). */
  progress(now: number): number {
    if (this._active === null) return 1;
    const def = techDef(this._active.techId);
    const startAt = this._active.endsAt - def.timeMs;
    if (now <= startAt) return 0;
    if (now >= this._active.endsAt) return 1;
    return (now - startAt) / def.timeMs;
  }

  /** Milliseconds until the active research completes (0 when idle). */
  remainingMs(now: number): number {
    if (this._active === null) return 0;
    return Math.max(0, this._active.endsAt - now);
  }

  /**
   * Product of the `mult` of every unlocked tech whose effect matches `kind`.
   * Neutral (1) when no such tech is unlocked, so an unwired-yet-fresh system
   * changes nothing.
   */
  private multiplierFor(kind: EffectKind): number {
    let mult = 1;
    for (const id of this._unlocked) {
      const e = TECH_DEFS[id].effect;
      if (e.kind === kind) mult *= e.mult;
    }
    return mult;
  }

  /** Composed training-time scale (<1 = faster). Wired into TrainingQueue.enqueue. */
  trainSpeedMultiplier(): number {
    return this.multiplierFor('trainSpeed');
  }

  /** Composed build-time scale (<1 = faster). Wired into building upgrade timing. */
  buildSpeedMultiplier(): number {
    return this.multiplierFor('buildSpeed');
  }

  /** Composed production boost (>1 = more). Wired at the production seams. */
  productionMultiplier(): number {
    return this.multiplierFor('production');
  }

  /** Composed storage-cap boost (>1 = higher cap). Wired into ResourceStore cap. */
  storageMultiplier(): number {
    return this.multiplierFor('storage');
  }

  /** Composed offline-efficiency boost (>1 = more). Wired into offline reconciliation. */
  offlineEfficiencyMultiplier(): number {
    return this.multiplierFor('offlineEfficiency');
  }

  /** Composed combat-attack boost (>1 = stronger). Wired into CombatSystem. */
  combatAttackMultiplier(): number {
    return this.multiplierFor('combatAttack');
  }

  /** Composed combat-defense boost (>1 = fewer casualties). Wired into CombatSystem. */
  combatDefenseMultiplier(): number {
    return this.multiplierFor('combatDefense');
  }

  /** Serialize to a plain, JSON-safe object. */
  toJSON(): ResearchStateJSON {
    return {
      unlocked: this.unlocked,
      active: this._active ? { ...this._active } : null,
    };
  }

  /**
   * Restore from a plain object produced by {@link toJSON}. Tolerates a missing
   * / malformed value (old saves with no research field) by returning a fresh,
   * empty ResearchSystem, so migrations never crash.
   */
  static fromJSON(
    data:
      | { unlocked?: readonly string[]; active?: { techId?: string; endsAt?: number } | null }
      | undefined
      | null,
  ): ResearchSystem {
    if (!data || typeof data !== 'object') return new ResearchSystem();
    // Filter unknown ids so a hand-edited / stale save cannot inject bad techs.
    const unlocked = (Array.isArray(data.unlocked) ? data.unlocked : []).filter(
      (id): id is TechId => typeof id === 'string' && !!TECH_DEFS[id as TechId],
    );
    const a = data.active;
    const active =
      a && typeof a === 'object' && typeof a.techId === 'string' && TECH_DEFS[a.techId as TechId]
        ? { techId: a.techId as TechId, endsAt: Number(a.endsAt) || 0 }
        : null;
    return new ResearchSystem(unlocked, active);
  }
}
