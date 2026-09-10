import { combineModifiers, emptyModifiers } from '../config/StatModifiers';
import {
  RESEARCH_DEFS,
  RESEARCH_ORDER,
  isResearchNode,
  researchDef,
} from '../config/ResearchConfig';
import { TROOP_TIERS } from '../config/GameConfig';
import type { ResearchState, StatModifiers } from '../types';
import { ResourceStore } from './ResourceStore';

/** Outcome of attempting to START a research node. */
export interface ResearchCheck {
  ok: boolean;
  /** Reason code when `ok` is false. */
  reason?: 'busy' | 'unknown' | 'done' | 'prereq' | 'lab_level' | 'cost';
}

/**
 * ResearchSystem - the multi-branch tech tree as PURE logic (no Phaser).
 *
 * Mirrors BuildingSystem's timed, one-at-a-time progress: the Ember Archive can
 * research exactly ONE node at a time, scheduled to finish at `endsAt`, and
 * {@link ResearchSystem.advance} completes it once the clock passes that
 * instant. A node can only START when it is not already done/active, its
 * prerequisites are all complete, the Ember Archive (lab) is high enough, and
 * its cost is affordable against a {@link ResourceStore} (charged up front).
 *
 * Every COMPLETED node's typed bonus folds into an aggregate
 * {@link StatModifiers} bundle ({@link ResearchSystem.modifiers}), and the
 * highest `troopTierUnlock` across completed nodes is the max trainable troop
 * tier ({@link ResearchSystem.maxTroopTier}). Serializable via toJSON/fromJSON.
 */
export class ResearchSystem {
  private readonly _completed: Set<string> = new Set();
  private _active: { nodeId: string; endsAt: number } | null = null;

  constructor(state?: ResearchState) {
    if (state?.completed) {
      for (const id of state.completed) {
        if (isResearchNode(id)) this._completed.add(id);
      }
    }
    if (
      state?.active &&
      isResearchNode(state.active.nodeId) &&
      !this._completed.has(state.active.nodeId) &&
      typeof state.active.endsAt === 'number'
    ) {
      this._active = { nodeId: state.active.nodeId, endsAt: state.active.endsAt };
    }
  }

  /** Whether a node's research has fully completed. */
  isCompleted(id: string): boolean {
    return this._completed.has(id);
  }

  /** The node currently being researched, or null when idle. */
  get active(): { nodeId: string; endsAt: number } | null {
    return this._active ? { ...this._active } : null;
  }

  /** Whether the lab is busy researching a node. */
  get isBusy(): boolean {
    return this._active !== null;
  }

  /** All completed node ids (stable RESEARCH_ORDER order). */
  completedIds(): string[] {
    return RESEARCH_ORDER.filter((id) => this._completed.has(id));
  }

  /** Whether every prerequisite of `id` is complete. */
  prereqsMet(id: string): boolean {
    const def = researchDef(id);
    if (!def) return false;
    return def.prereqs.every((p) => this._completed.has(p));
  }

  /**
   * Whether node `id` can START right now against `store` at Ember Archive
   * level `labLevel`. Checks (in order): a real, not-already-done, not-active
   * node; the lab is not already busy; prerequisites complete; lab level high
   * enough; and the cost is affordable.
   */
  canResearch(id: string, store: ResourceStore, labLevel: number): ResearchCheck {
    const def = researchDef(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (this._completed.has(id)) return { ok: false, reason: 'done' };
    if (this._active) return { ok: false, reason: 'busy' };
    if (!this.prereqsMet(id)) return { ok: false, reason: 'prereq' };
    if (labLevel < def.requiresLabLevel) return { ok: false, reason: 'lab_level' };
    if (!store.canAfford(def.cost)) return { ok: false, reason: 'cost' };
    return { ok: true };
  }

  /**
   * Start researching `id`: spends the cost from `store` and schedules
   * completion at `now + duration`. Returns the check result; on failure
   * nothing changes.
   */
  start(id: string, store: ResourceStore, labLevel: number, now: number, buildSpeed = 0): ResearchCheck {
    const check = this.canResearch(id, store, labLevel);
    if (!check.ok) return check;
    const def = RESEARCH_DEFS[id];
    if (!store.spend(def.cost)) return { ok: false, reason: 'cost' };
    const effectiveDuration = Math.max(1_000, Math.ceil(def.durationMs / (1 + Math.max(0, buildSpeed))));
    this._active = { nodeId: id, endsAt: now + effectiveDuration };
    return { ok: true };
  }

  /**
   * Complete the in-progress node if its timer has elapsed at `now`. Returns
   * the completed node id (once), or null if nothing finished. Because only one
   * node runs at a time, a single call resolves at most one completion.
   */
  advance(now: number): string | null {
    if (this._active && now >= this._active.endsAt) {
      const id = this._active.nodeId;
      this._completed.add(id);
      this._active = null;
      return id;
    }
    return null;
  }

  /** Epoch-ms completion of the active node, or null when idle (save layer helper). */
  pendingCompletion(): number | null {
    return this._active ? this._active.endsAt : null;
  }

  /**
   * Bring the in-progress node's completion forward by `ms` (alliance help).
   * No-op when the lab is idle. Returns the ms actually shaved off (clamped to
   * what remains so the timer can complete via {@link advance} but not go
   * negative).
   */
  reduceTimer(ms: number, now: number): number {
    if (!this._active || ms <= 0) return 0;
    const remaining = Math.max(0, this._active.endsAt - now);
    const shaved = Math.min(ms, remaining);
    this._active.endsAt -= shaved;
    return shaved;
  }

  /**
   * The aggregate permanent bonus of all COMPLETED nodes, as the shared
   * {@link StatModifiers} bundle. GameState combines this with gear + hero
   * bundles and consumes the total. Recomputed on demand (cheap; node count is
   * small) so it always reflects the current completed set.
   */
  modifiers(): StatModifiers {
    const bundles: (Partial<StatModifiers> | undefined)[] = [];
    for (const id of this._completed) bundles.push(researchDef(id)?.bonus);
    return bundles.length > 0 ? combineModifiers(...bundles) : emptyModifiers();
  }

  /**
   * The highest troop tier unlocked by completed research (the max trainable
   * tier). Tier 1 is always available; each completed node with a
   * `troopTierUnlock` raises the ceiling, clamped to TROOP_TIERS.MAX_TIER.
   */
  maxTroopTier(): number {
    let tier = 1;
    for (const id of this._completed) {
      const unlock = researchDef(id)?.troopTierUnlock;
      if (typeof unlock === 'number' && unlock > tier) tier = unlock;
    }
    return Math.min(TROOP_TIERS.MAX_TIER, tier);
  }

  /** Serialize to a plain {@link ResearchState}. */
  toJSON(): ResearchState {
    return {
      completed: this.completedIds(),
      active: this._active ? { ...this._active } : null,
    };
  }

  /**
   * Restore from a persisted {@link ResearchState}. A missing / malformed value
   * yields an empty tree so old saves load without crashing.
   */
  static fromJSON(data: ResearchState | undefined | null): ResearchSystem {
    if (!data || typeof data !== 'object') return new ResearchSystem();
    return new ResearchSystem(data);
  }
}
