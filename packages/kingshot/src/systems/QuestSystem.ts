import {
  QUEST_DEFS,
  QUEST_ORDER,
  isComplete,
  isQuestId,
  questDef,
  type QuestId,
  type QuestProgress,
  type QuestReward,
} from '../config/QuestConfig';

/**
 * Per-quest lifecycle status:
 *   - 'locked':      an earlier quest in the chain has not been claimed yet.
 *   - 'active':      offered, but its condition is not yet satisfied.
 *   - 'completable': its condition is satisfied and the reward can be claimed.
 *   - 'claimed':     the reward has been collected (terminal).
 */
export type QuestStatus = 'locked' | 'active' | 'completable' | 'claimed';

/** Serialized shape persisted by the save layer. */
export interface QuestStateJSON {
  /** Quest ids whose reward has already been claimed. */
  claimed: QuestId[];
}

/**
 * QuestSystem - the pure (no Phaser) progression-quest runtime.
 *
 * It owns only which quests have been CLAIMED; every other status is derived on
 * demand from a {@link QuestProgress} snapshot (assembled by GameState) plus the
 * claimed set. {@link refresh} recomputes the derived statuses and is what the
 * UI reads. A quest is:
 *   - locked      until its `requires` predecessor is claimed,
 *   - active      once unlocked but its condition is unmet,
 *   - completable once unlocked and its condition is met,
 *   - claimed     after {@link claim}.
 *
 * {@link claim} returns the reward bundle to APPLY (resources -> ResourceStore,
 * shards -> HeroSystem) and marks the quest claimed so it can never pay twice.
 * Fully serializable via toJSON/fromJSON; only the claimed set is persisted
 * because the rest is a pure function of the live progress snapshot.
 */
export class QuestSystem {
  private readonly _claimed: Set<QuestId>;
  /** Cached derived statuses from the last {@link refresh}. */
  private _statuses: Map<QuestId, QuestStatus>;
  /** The progress snapshot from the last {@link refresh} (for canClaim). */
  private _lastProgress: QuestProgress | null = null;

  constructor(claimed?: Iterable<QuestId>) {
    this._claimed = new Set();
    if (claimed) {
      for (const id of claimed) {
        if (QUEST_DEFS[id]) this._claimed.add(id);
      }
    }
    this._statuses = new Map();
    for (const id of QUEST_ORDER) {
      this._statuses.set(id, this._claimed.has(id) ? 'claimed' : 'locked');
    }
  }

  /** True when a quest's predecessor (if any) has been claimed. */
  private isUnlocked(id: QuestId): boolean {
    const def = questDef(id);
    if (!def.requires) return true;
    return this._claimed.has(def.requires);
  }

  /**
   * Recompute every quest's derived status against a fresh progress snapshot.
   * Call this whenever the underlying stats change (each GameState.tick). A
   * quest becomes 'completable' only once it is unlocked AND its condition is
   * met; an already-claimed quest stays 'claimed'.
   */
  refresh(progress: QuestProgress): void {
    this._lastProgress = progress;
    const next = new Map<QuestId, QuestStatus>();
    for (const id of QUEST_ORDER) {
      if (this._claimed.has(id)) {
        next.set(id, 'claimed');
        continue;
      }
      if (!this.isUnlocked(id)) {
        next.set(id, 'locked');
        continue;
      }
      next.set(id, isComplete(questDef(id), progress) ? 'completable' : 'active');
    }
    this._statuses = next;
  }

  /** The derived status of a quest from the last {@link refresh}. */
  status(id: QuestId): QuestStatus {
    return this._statuses.get(id) ?? (this._claimed.has(id) ? 'claimed' : 'locked');
  }

  /** True when the quest's reward has been claimed. */
  isClaimed(id: QuestId): boolean {
    return this._claimed.has(id);
  }

  /**
   * Whether `id` can be claimed right now: unlocked, unclaimed, and its
   * condition satisfied by the most recent progress snapshot. Falls back to the
   * cached status when no explicit snapshot is provided.
   */
  canClaim(id: QuestId): boolean {
    if (this._claimed.has(id)) return false;
    if (!this.isUnlocked(id)) return false;
    if (this._lastProgress === null) return this._statuses.get(id) === 'completable';
    return isComplete(questDef(id), this._lastProgress);
  }

  /**
   * Claim a quest's reward. Returns the reward bundle to APPLY (resources to
   * ResourceStore.add, shards to HeroSystem.addShards) and marks the quest
   * claimed so it can never be claimed again. Returns null (and changes
   * nothing) when the quest is not currently claimable.
   *
   * The caller is responsible for applying the returned reward to the live
   * systems; keeping the application OUT of this pure system avoids a
   * ResourceStore/HeroSystem dependency and keeps it trivially testable.
   */
  claim(id: QuestId): QuestReward | null {
    if (!this.canClaim(id)) return null;
    this._claimed.add(id);
    this._statuses.set(id, 'claimed');
    // Newly unlocking the next quest is reflected on the next refresh().
    return questDef(id).reward;
  }

  /** All claimed quest ids in chain order (defensive copy). */
  get claimed(): QuestId[] {
    return QUEST_ORDER.filter((id) => this._claimed.has(id));
  }

  /** Serialize to a plain, JSON-safe object. */
  toJSON(): QuestStateJSON {
    return { claimed: this.claimed };
  }

  /**
   * Restore from a plain object produced by {@link toJSON}. Tolerates a missing
   * / malformed value (old saves with no quest field) by returning a fresh
   * QuestSystem with nothing claimed, so migrations never crash. Unknown quest
   * ids are filtered so a hand-edited / stale save cannot inject bad quests.
   */
  static fromJSON(data: { claimed?: readonly string[] } | undefined | null): QuestSystem {
    if (!data || typeof data !== 'object') return new QuestSystem();
    const claimed = (Array.isArray(data.claimed) ? data.claimed : []).filter(
      (id): id is QuestId => typeof id === 'string' && isQuestId(id),
    );
    return new QuestSystem(claimed);
  }
}
