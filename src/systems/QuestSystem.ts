import { QUESTS } from '../config/GameConfig';
import {
  DAILY_QUESTS,
  DAILY_QUEST_IDS,
  EVENTS,
  GROWTH_QUESTS,
  GROWTH_QUEST_IDS,
  dailyQuest,
  eventDef,
  growthQuest,
  type EventDef,
  type QuestDef,
  type QuestMetric,
  type QuestReward,
} from '../config/QuestConfig';
import type { QuestProgressState, QuestState } from '../types';

/** A quest's live view for UI / callers. */
export interface QuestView {
  id: string;
  metric: QuestMetric;
  target: number;
  progress: number;
  /** True once progress has met the target. */
  complete: boolean;
  /** True once the reward has been granted. */
  claimed: boolean;
}

/** The result of claiming a quest. */
export interface QuestClaimResult {
  ok: boolean;
  reason?: 'unknown' | 'incomplete' | 'already_claimed';
  reward?: QuestReward;
}

/** A fresh, un-started progress record. */
function freshProgress(): QuestProgressState {
  return { progress: 0, claimed: false };
}

/** The day index (floor(now / DAY_MS)) a timestamp belongs to. */
function dayIndex(now: number): number {
  return Math.floor(now / QUESTS.DAY_MS);
}

/**
 * QuestSystem - daily quests, growth/beginner milestones, and a time-boxed
 * events framework as PURE logic (no Phaser).
 *
 * It takes an injected `now` clock everywhere it matters (mirroring SaveManager
 * / BuildingSystem) so the daily-reset boundary is deterministic and testable:
 *   - DAILY quests reset whenever `now` crosses into a new day (their progress
 *     + claimed flags clear); {@link sync} performs the roll-over.
 *   - GROWTH milestones are ONE-TIME (never reset); their reward is claimable
 *     exactly once.
 *   - EVENTS are time-boxed windows: {@link startEvent} arms one until
 *     `now + duration`; {@link eventActive} / {@link productionBonus} report it.
 *
 * Progress is driven by {@link record}(metric, amount, now): GameState fires it
 * from the matching action (a building upgraded, a wave cleared, a summon, a
 * research completed, ...). The system does NOT own the reward stores; the
 * caller applies the {@link QuestReward} returned by {@link claim}. Serializable
 * via toJSON / fromJSON.
 */
export class QuestSystem {
  private _dailyDayIndex: number;
  private readonly _daily: Map<string, QuestProgressState> = new Map();
  private readonly _milestones: Map<string, QuestProgressState> = new Map();
  private _activeEventId: string | null;
  private _eventEndsAt: number;
  /**
   * The last day index for which {@link dailySync} armed an event. Starts at -1
   * (never armed) so a fresh board arms day 0's event on the first dailySync.
   * Persisted so a returning player is not re-armed on every load within a day.
   */
  private _eventArmedDayIndex: number;

  constructor(state?: QuestState) {
    this._dailyDayIndex = state ? Math.floor(state.dailyDayIndex ?? 0) : 0;
    this._eventArmedDayIndex =
      state && typeof state.eventArmedDayIndex === 'number'
        ? Math.floor(state.eventArmedDayIndex)
        : -1;
    if (state?.daily) {
      for (const id of DAILY_QUEST_IDS) {
        const p = state.daily[id];
        if (p) this._daily.set(id, normalizeProgress(p));
      }
    }
    if (state?.milestones) {
      for (const id of GROWTH_QUEST_IDS) {
        const p = state.milestones[id];
        if (p) this._milestones.set(id, normalizeProgress(p));
      }
    }
    this._activeEventId =
      state && state.activeEventId && eventDef(state.activeEventId) ? state.activeEventId : null;
    this._eventEndsAt = state ? Math.max(0, state.eventEndsAt ?? 0) : 0;
  }

  private ensureDaily(id: string): QuestProgressState {
    let p = this._daily.get(id);
    if (!p) {
      p = freshProgress();
      this._daily.set(id, p);
    }
    return p;
  }

  private ensureMilestone(id: string): QuestProgressState {
    let p = this._milestones.get(id);
    if (!p) {
      p = freshProgress();
      this._milestones.set(id, p);
    }
    return p;
  }

  /**
   * Roll the daily quests over if `now` has crossed into a new day, and expire
   * an event whose window has closed. Called by {@link record} / {@link claim}
   * (and directly by GameState.tick) so the daily boundary is always honored
   * before any progress is read or written.
   */
  sync(now: number): void {
    const today = dayIndex(now);
    if (today !== this._dailyDayIndex) {
      this._dailyDayIndex = today;
      this._daily.clear(); // reset the whole daily set on the day boundary.
    }
    if (this._activeEventId && now >= this._eventEndsAt) {
      this._activeEventId = null;
      this._eventEndsAt = 0;
    }
  }

  /**
   * Record `amount` progress on `metric` at `now`, advancing every daily and
   * growth quest that watches it. Syncs the day boundary first so progress
   * always lands in the correct daily set.
   */
  record(metric: QuestMetric, amount: number, now: number): void {
    if (amount <= 0) return;
    this.sync(now);
    const inc = Math.floor(amount);
    for (const q of DAILY_QUESTS) {
      if (q.metric === metric) this.ensureDaily(q.id).progress += inc;
    }
    for (const q of GROWTH_QUESTS) {
      if (q.metric === metric) {
        const p = this.ensureMilestone(q.id);
        if (!p.claimed) p.progress += inc; // freeze one-time milestones once claimed
      }
    }
  }

  /** A daily quest's current progress (0 if untouched). */
  dailyProgress(id: string): number {
    return this._daily.get(id)?.progress ?? 0;
  }

  /** A growth milestone's current progress (0 if untouched). */
  milestoneProgress(id: string): number {
    return this._milestones.get(id)?.progress ?? 0;
  }

  /** Whether a daily quest is complete (progress met target). */
  isDailyComplete(id: string): boolean {
    const q = dailyQuest(id);
    return q ? this.dailyProgress(id) >= q.target : false;
  }

  /** Whether a growth milestone is complete. */
  isMilestoneComplete(id: string): boolean {
    const q = growthQuest(id);
    return q ? this.milestoneProgress(id) >= q.target : false;
  }

  /** Whether a daily quest's reward has been claimed this day. */
  isDailyClaimed(id: string): boolean {
    return this._daily.get(id)?.claimed ?? false;
  }

  /** Whether a growth milestone's (one-time) reward has been claimed. */
  isMilestoneClaimed(id: string): boolean {
    return this._milestones.get(id)?.claimed ?? false;
  }

  /**
   * Claim a DAILY quest's reward at `now` (once per day). Syncs the boundary
   * first. Returns the reward to grant; the caller applies it. Fails when the
   * quest is unknown, incomplete, or already claimed today.
   */
  claimDaily(id: string, now: number): QuestClaimResult {
    this.sync(now);
    return this.claimFrom(dailyQuest(id), this._daily, id, () => this.dailyProgress(id));
  }

  /**
   * Claim a GROWTH milestone's reward (once ever). Returns the reward; the
   * caller applies it. Fails when unknown, incomplete, or already claimed.
   */
  claimMilestone(id: string, now: number): QuestClaimResult {
    this.sync(now);
    return this.claimFrom(growthQuest(id), this._milestones, id, () =>
      this.milestoneProgress(id),
    );
  }

  private claimFrom(
    def: QuestDef | undefined,
    store: Map<string, QuestProgressState>,
    id: string,
    progressOf: () => number,
  ): QuestClaimResult {
    if (!def) return { ok: false, reason: 'unknown' };
    const p = store.get(id) ?? freshProgress();
    if (progressOf() < def.target) return { ok: false, reason: 'incomplete' };
    if (p.claimed) return { ok: false, reason: 'already_claimed' };
    p.claimed = true;
    store.set(id, p);
    return { ok: true, reward: def.reward };
  }

  // --- events ---------------------------------------------------------------

  /**
   * Arm a time-boxed event, running from `now` for `durationMs` (defaults to
   * QUESTS.EVENT_DURATION_MS). Replaces any running event. Returns false for an
   * unknown event id.
   */
  startEvent(id: string, now: number, durationMs: number = QUESTS.EVENT_DURATION_MS): boolean {
    if (!eventDef(id)) return false;
    this._activeEventId = id;
    this._eventEndsAt = now + Math.max(0, durationMs);
    return true;
  }

  /**
   * The event the daily cycle arms for a given day, chosen deterministically by
   * rotating through the configured {@link EVENTS} by day index. Pure so the
   * auto-armed event is reproducible from the clock alone.
   */
  static eventForDay(dayIdx: number): EventDef {
    const list = EVENTS;
    const i = ((Math.floor(dayIdx) % list.length) + list.length) % list.length;
    return list[i];
  }

  /**
   * The live-ops daily driver: roll the daily board over (via {@link sync}) and,
   * whenever a NEW day has begun, AUTO-ARM that day's rotating event for the
   * default event window so the events framework is always live without a UI
   * action. Returns true when a new day (and thus a new event) started this call.
   *
   * This is what actually arms events during play: GameState calls it on tick /
   * load, so a returning player always finds the day's event running and the
   * production bonus applied. Deterministic given `now`.
   */
  dailySync(now: number): boolean {
    this.sync(now);
    const today = dayIndex(now);
    // Arm the day's event exactly once per day: the persisted
    // `_eventArmedDayIndex` guards against re-arming on every tick/load within
    // the same day (and, together with startEvent replacing any running event,
    // means a returning player finds today's event live).
    if (today !== this._eventArmedDayIndex) {
      this._eventArmedDayIndex = today;
      this.startEvent(QuestSystem.eventForDay(today).id, now);
      return true;
    }
    return false;
  }

  /** The active event id at `now` (null when none / expired). */
  activeEvent(now: number): string | null {
    this.sync(now);
    return this._activeEventId;
  }

  /** Whether an event is running at `now`. */
  eventActive(now: number): boolean {
    return this.activeEvent(now) !== null;
  }

  /**
   * The idle-production bonus multiplier the active event grants at `now`
   * (1 when no event is running). GameState can multiply idle output by this.
   */
  productionBonus(now: number): number {
    const id = this.activeEvent(now);
    if (!id) return 1;
    return eventDef(id)?.productionBonus ?? 1;
  }

  /** All daily quest views at `now` (syncs the boundary first). */
  dailyViews(now: number): QuestView[] {
    this.sync(now);
    return DAILY_QUESTS.map((q) => this.viewOf(q, this.dailyProgress(q.id), this.isDailyClaimed(q.id)));
  }

  /** All growth milestone views. */
  milestoneViews(): QuestView[] {
    return GROWTH_QUESTS.map((q) =>
      this.viewOf(q, this.milestoneProgress(q.id), this.isMilestoneClaimed(q.id)),
    );
  }

  private viewOf(q: QuestDef, progress: number, claimed: boolean): QuestView {
    return {
      id: q.id,
      metric: q.metric,
      target: q.target,
      progress,
      complete: progress >= q.target,
      claimed,
    };
  }

  /** All event defs (config passthrough). */
  static events(): EventDef[] {
    return [...EVENTS];
  }

  /** Serialize to a plain {@link QuestState}. */
  toJSON(): QuestState {
    const daily: QuestState['daily'] = {};
    for (const [id, p] of this._daily.entries()) daily[id] = { ...p };
    const milestones: QuestState['milestones'] = {};
    for (const [id, p] of this._milestones.entries()) milestones[id] = { ...p };
    return {
      dailyDayIndex: this._dailyDayIndex,
      daily,
      milestones,
      activeEventId: this._activeEventId,
      eventEndsAt: this._eventEndsAt,
      eventArmedDayIndex: this._eventArmedDayIndex,
    };
  }

  /**
   * Restore from a persisted {@link QuestState}. A missing / malformed value
   * yields a fresh quest board so old saves load without crashing.
   */
  static fromJSON(data: QuestState | undefined | null): QuestSystem {
    if (!data || typeof data !== 'object') return new QuestSystem();
    return new QuestSystem(data);
  }
}

/** Coerce a persisted progress record into a valid {@link QuestProgressState}. */
function normalizeProgress(p: QuestProgressState): QuestProgressState {
  return { progress: Math.max(0, Math.floor(p.progress ?? 0)), claimed: Boolean(p.claimed) };
}
