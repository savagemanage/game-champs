/**
 * Shared cross-cutting types for LAST SQUAD (라스트 스쿼드).
 *
 * These are the vocabulary the pure-logic systems (gate math, run simulator,
 * meta-progression, save/load) all import so their contracts line up. Nothing
 * here depends on Phaser, so the systems and their unit tests can import these
 * freely. Types that map to canonical tuples are derived from the config so the
 * config stays the single source of truth.
 */

import {
  BUILDING_ORDER,
  GATE_OPS,
  HERO_GRADES,
  HERO_ROLES,
  HERO_TYPES,
  RESOURCE_ORDER,
  UPGRADE_ORDER,
} from '../config/GameConfig';
import { DAILY_TASK_CATEGORIES } from '../config/Progression';

/** A daily "arms race" task category. Derived from DAILY_TASK_CATEGORIES. */
export type DailyTaskCategory = (typeof DAILY_TASK_CATEGORIES)[number];

/** A math gate operation. Derived from the canonical GATE_OPS tuple. */
export type GateOp = (typeof GATE_OPS)[number];

/** A hero combat type (rock-paper-scissors). Derived from HERO_TYPES. */
export type HeroType = (typeof HERO_TYPES)[number];

/** A hero battlefield role. Derived from HERO_ROLES. */
export type HeroRole = (typeof HERO_ROLES)[number];

/** A hero rarity grade (best first). Derived from HERO_GRADES. */
export type HeroGrade = (typeof HERO_GRADES)[number];

/** The four base stats every hero carries. */
export interface HeroStats {
  /** Hit points (survivability). */
  hp: number;
  /** Attack power (raw outgoing damage before defenses). */
  atk: number;
  /** Defense (reduces incoming damage). */
  def: number;
  /** Turn-order speed (higher acts earlier). */
  speed: number;
}

/**
 * A single hero skill definition (catalog data). `nameKey` / `descKey` are
 * i18n keys; `potency` is the base effect magnitude the combat/skill math reads
 * (scaled by skill level via {@link HEROES.SKILL_POTENCY_PER_LEVEL}).
 */
export interface HeroSkill {
  /** Stable skill id (unique within a hero). */
  id: string;
  /** i18n key for the skill's display name. */
  nameKey: string;
  /** i18n key for the skill's one-line description. */
  descKey: string;
  /** Base effect magnitude (fraction or multiplier depending on the skill). */
  potency: number;
}

/**
 * A catalog hero definition (immutable design data in src/config/Heroes.ts).
 * Original names/lore only; nothing is drawn from any existing IP.
 */
export interface HeroDef {
  /** Stable hero id (used as the roster key and formation slot reference). */
  id: string;
  /** i18n key for the hero's display name. */
  nameKey: string;
  /** i18n key for the hero's one-line lore. */
  loreKey: string;
  /** Combat type (type triangle). */
  type: HeroType;
  /** Battlefield role. */
  role: HeroRole;
  /** Rarity grade. */
  grade: HeroGrade;
  /** Base stats at level 1 / 1 star / skill level 1 (before grade multiplier). */
  base: HeroStats;
  /** 1-2 skills. */
  skills: HeroSkill[];
}

/**
 * A single owned hero's mutable progression state (persisted in the roster).
 * `id` references a {@link HeroDef}; the rest is progression the player raises.
 */
export interface HeroInstance {
  /** Catalog hero id this instance progresses. */
  id: string;
  /** Current level (>= 1). */
  level: number;
  /** Current star-tier (>= 1). */
  stars: number;
  /** Current skill level (>= 1), applied to all of the hero's skills. */
  skillLevel: number;
  /** How many duplicate pulls have been folded in (for display / accounting). */
  dupes: number;
}

/** A survival resource id. Derived from the canonical RESOURCE_ORDER tuple. */
export type ResourceKind = (typeof RESOURCE_ORDER)[number];

/** A base building id. Derived from the canonical BUILDING_ORDER tuple. */
export type BuildingId = (typeof BUILDING_ORDER)[number];

/** A per-resource numeric bag (stockpiles, costs, production rates). */
export type ResourceBag = Record<ResourceKind, number>;

/** A lane index. With RUN.LANE_COUNT === 2 this is 0 or 1. */
export type Lane = number;

/** A single gate presented in a lane of a gate row. */
export interface Gate {
  op: GateOp;
  /** Operand for the operation (addend, subtrahend, factor, or divisor). */
  value: number;
  /** Which lane this gate occupies. */
  lane: Lane;
}

/** A full gate row: one gate per lane, positioned at a run distance. */
export interface GateRow {
  /** Distance along the run at which this row is crossed. */
  distance: number;
  /** One gate per lane, indexed by lane. */
  gates: Gate[];
}

/** An enemy cluster (or the boss) placed along the run. */
export interface EnemyCluster {
  /** Distance along the run at which this cluster is engaged. */
  distance: number;
  /** Total HP the squad must burn down while passing. */
  hp: number;
  /** True for the single end-of-run boss encounter. */
  boss: boolean;
}

/** The live, per-step squad state exposed by the run simulator. */
export interface SquadState {
  /** Current soldier count (integer, clamped >= 0). */
  size: number;
  /** Current lane the squad occupies. */
  lane: Lane;
}

/** The meta-upgrade kinds. Derived from the canonical UPGRADE_ORDER tuple. */
export type MetaUpgradeKind = (typeof UPGRADE_ORDER)[number];

/** Purchased level for every meta-upgrade kind. */
export type MetaUpgradeState = Record<MetaUpgradeKind, number>;

/** Derived, run-time stats produced by applying meta-upgrade levels. */
export interface DerivedStats {
  /** Starting squad size for a run. */
  startSize: number;
  /** Damage per shot per soldier. */
  damage: number;
  /** Shots per second per soldier. */
  fireRate: number;
  /** Multiplier applied to coins earned. */
  coinMultiplier: number;
}

/** The outcome of a completed (or failed) run. */
export interface RunResult {
  /** Distance travelled before finishing/dying (0..RUN.RUN_DISTANCE). */
  distance: number;
  /** Arcade score for this run. */
  score: number;
  /** Largest squad size reached during the run. */
  squadPeak: number;
  /** Squad size at the end of the run. */
  squadFinal: number;
  /** True if the boss was defeated (run won). */
  win: boolean;
  /** Coins earned from this run (after the coin multiplier). */
  coinsEarned: number;
}

/**
 * The gate-runner (Falcon Rescue mini-game) meta-progression block: coins,
 * purchased upgrade levels, personal bests, and total runs played. In the v1
 * save this lived at the top level under `meta`; from v2 it is nested under
 * {@link GameState.miniGame} so the rest of the expanded game state can live
 * alongside it. Its shape is unchanged so the existing gate-runner scenes and
 * {@link MetaStore} keep working against it verbatim.
 */
export interface MiniGameMeta {
  /** Spendable meta-currency. */
  coins: number;
  /** Purchased level of every upgrade. */
  upgrades: MetaUpgradeState;
  /** Best distance reached across all runs. */
  bestDistance: number;
  /** Best score across all runs. */
  bestScore: number;
  /** Total number of runs played. */
  runsPlayed: number;
}

/**
 * The legacy v1 persisted state: purely the gate-runner meta-progression under
 * a top-level `meta` key. Retained only so the save layer can recognize and
 * migrate a real v1 save forward to {@link GameState}; new code should never
 * produce this shape.
 */
export interface GameStateV1 {
  /** Save-format version (always 1 for this shape). */
  version: number;
  /** The gate-runner meta block, in its original top-level position. */
  meta: MiniGameMeta;
}

/**
 * Resource economy sub-state (OWNED BY FEAT-002: buildings/economy).
 *
 * Tracks the current stockpile of each of the four survival resources plus the
 * wall-clock timestamp (ms since epoch) of the last production tick. Passive
 * production accrues against `lastTickTimestamp` so it works offline on a
 * static site. Stockpiles are stored keyed by id for save-format tolerance;
 * {@link ResourceKind} enumerates the valid keys.
 */
export interface ResourceState {
  /** Per-resource stockpiles, keyed by {@link ResourceKind}. */
  stockpiles: Record<string, number>;
  /** Epoch-ms timestamp of the last production tick (0 until first tick). */
  lastTickTimestamp: number;
}

/**
 * A queued, time-gated building upgrade. `completesAt` is an epoch-ms timestamp;
 * the upgrade resolves (bumps the building level) once wall-clock time reaches
 * it, including while the tab was closed (offline completion on load).
 */
export interface BuildingUpgrade {
  /** Building being upgraded. */
  building: BuildingId;
  /** The level the building reaches when this upgrade completes. */
  toLevel: number;
  /** Epoch-ms timestamp the upgrade started. */
  startedAt: number;
  /** Epoch-ms timestamp the upgrade completes. */
  completesAt: number;
}

/**
 * Base-building sub-state (OWNED BY FEAT-002: buildings/economy).
 *
 * Holds every building's current level (HQ + tech center / parade ground /
 * hospital / barracks / drone center) and the single global build queue. Only
 * one upgrade is in progress at a time (single-queue feel); `queue` holds the
 * active upgrade(s) with their completion timestamps.
 */
export interface BuildingState {
  /** Building level keyed by {@link BuildingId}. */
  levels: Record<string, number>;
  /** Active timed upgrade(s); at most one at a time (single global queue). */
  queue: BuildingUpgrade[];
}

/**
 * Recruit pity sub-state (OWNED BY FEAT-003: recruit/gacha).
 *
 * `sinceHighGrade` counts consecutive pulls that did NOT yield a UR; when it
 * reaches {@link RECRUIT.PITY_THRESHOLD} the next pull is forced to UR and the
 * counter resets. `totalPulls` is a lifetime counter for display.
 */
export interface PityState {
  /** Consecutive non-UR pulls accrued toward the pity guarantee. */
  sinceHighGrade: number;
  /** Lifetime number of pulls made. */
  totalPulls: number;
}

/**
 * Hero roster sub-state (OWNED BY FEAT-003: heroes).
 *
 * Holds every owned hero's progression keyed by hero id, the spendable
 * progression shard currency (earned from duplicates), and the recruit pity
 * counter. Empty-but-valid on a fresh save (no heroes recruited, 0 shards).
 */
export interface HeroState {
  /** Owned heroes keyed by hero id. */
  roster: Record<string, HeroInstance>;
  /** Spendable progression currency earned from duplicate pulls. */
  shards: number;
  /** Recruit pity counter state. */
  pity: PityState;
  /**
   * Persisted per-account recruit entropy seed (a 32-bit unsigned int). Set
   * once to a random value on a fresh game / v1 migration and stable across
   * save round-trips thereafter. The recruit scene mixes this into each pull's
   * derived seed so identical pull counts across fresh sessions do not always
   * yield the same heroes, while keeping the pure recruit roll deterministic
   * given its final seed.
   */
  recruitSeed: number;
}

/**
 * Squad-formation sub-state (OWNED BY FEAT-003: formation/combat).
 *
 * The 5-slot squad layout: 2 front-row + 3 back-row slots, each a hero id or
 * null when empty. A hero id must appear at most once across all five slots.
 */
export interface FormationState {
  /** Front-row hero-id slots (length {@link GAME_STATE}.FORMATION.FRONT_SLOTS = 2). */
  front: (string | null)[];
  /** Back-row hero-id slots (length {@link GAME_STATE}.FORMATION.BACK_SLOTS = 3). */
  back: (string | null)[];
}

/**
 * Season / battle-pass sub-state (OWNED BY FEAT-004: season/league).
 *
 * Tracks the current season id, accumulated season XP, the derived pass tier,
 * how many tier rewards have already been claimed (free/premium), whether the
 * premium track has been unlocked by the in-game achievement, and the seasonal
 * "virus resistance" stat that gates campaign stages and later tiers. Season
 * rollover resets these while permanent gains (heroes/buildings/resources)
 * remain. `progress` is retained for backward-compatibility with the FEAT-001
 * placeholder and mirrors the current season XP.
 */
export interface SeasonState {
  /** Current season identifier (1-based local 28-day window ordinal). */
  current: number;
  /** Legacy alias for available XP; kept so old saves round-trip safely. */
  progress: number;
  /** Legacy alias for available XP. New code uses availableXp. */
  xp: number;
  /** Cumulative XP earned this season; never decreases when resistance is bought. */
  earnedXp: number;
  /** Spendable XP bank used for resistance purchases. */
  availableXp: number;
  /** Derived pass tier reached this season (>= 0). */
  tier: number;
  /** Number of free-track tier rewards already claimed. */
  claimedFree: number;
  /** Number of premium-track tier rewards already claimed. */
  claimedPremium: number;
  /** Whether the premium reward track has been unlocked (in-game achievement). */
  premiumUnlocked: boolean;
  /** Seasonal virus-resistance level (gates campaign stages + later tiers). */
  resistance: number;
}

/**
 * Daily / weekly mission sub-state (OWNED BY FEAT-004: missions).
 *
 * `dayKey` / `weekKey` are the day- and week-index the current progress belongs
 * to (derived from a timestamp in the pure layer); when the runtime observes a
 * newer key it rolls the block over. `taskProgress` counts progress per active
 * daily task id, `armsScore` is the accumulated daily arms-race score,
 * `claimedTasks` / `claimedMilestones` guard one-time reward grants, and
 * `weekActivity` accumulates the player's weekly alliance-duel score.
 */
export interface MissionState {
  /** Day index the daily block belongs to (-1 = uninitialized). */
  dayKey: number;
  /** Week index the weekly block belongs to (-1 = uninitialized). */
  weekKey: number;
  /** Progress per active daily task id. */
  daily: Record<string, number>;
  /** Ids of daily tasks whose completion reward was already granted. */
  claimedTasks: string[];
  /** Accumulated daily arms-race score. */
  armsScore: number;
  /** Point thresholds of daily milestones already claimed. */
  claimedMilestones: number[];
  /** Weekly alliance-duel activity score. */
  weekActivity: number;
  /** Weekly progress (retained for FEAT-001 compat / future weekly tasks). */
  weekly: Record<string, number>;
}

/**
 * PvE campaign + zombie-wave sub-state (OWNED BY FEAT-004: campaign).
 *
 * `clearedStages` is the set of campaign stage ids the player has cleared (a
 * stage is unlockable when the previous is cleared AND the seasonal resistance
 * gate is met). `highestWave` is the furthest zombie wave cleared this run of
 * the endless mode (permanent best).
 */
export interface CampaignState {
  /** Ids of campaign stages already cleared. */
  clearedStages: string[];
  /** Highest zombie wave index cleared. */
  highestWave: number;
}

/**
 * League / alliance sub-state (OWNED BY FEAT-004: league, offline simulation).
 *
 * `alliance` is the player's (single-player) alliance name key, `period` is the
 * current league period index (drives the deterministic AI power drift),
 * `wins` / `losses` track offline league PvP outcomes this period, and
 * `bestRank` is the best standings placement achieved (1 = top).
 */
export interface LeagueState {
  /** i18n key for the player's alliance display name. */
  alliance: string;
  /** Current league period index (AI power drifts per period). */
  period: number;
  /** League PvP wins this period. */
  wins: number;
  /** League PvP losses this period. */
  losses: number;
  /** Best standings rank achieved (1 = best; 0 = none yet). */
  bestRank: number;
}

/**
 * Onboarding tutorial sub-state (OWNED BY FEAT-003: onboarding).
 *
 * The smallest shape that supports "show the first-run tutorial once, but keep
 * it replayable": `seen` gates the automatic first-run launch (a brand-new game
 * is `false`, a returning/migrated player is `true`), and `completedSteps`
 * records the stable step ids the player has advanced past so the overlay can
 * highlight progress. Replaying the tutorial (see
 * {@link GameState.tutorial}) clears both back to the fresh state.
 */
export interface TutorialState {
  /** Whether the first-run tutorial has been seen (skipped or completed). */
  seen: boolean;
  /** Stable ids of tutorial steps the player has completed. */
  completedSteps: string[];
  /** Permanent account-once marker for the 200-shard onboarding grant. */
  grantClaimed: boolean;
}

/**
 * The complete persisted game state (serialized to localStorage by the save
 * layer, save format v2). It carries the whole expanded single-player game:
 * the gate-runner mini-game meta plus placeholder sub-states for the resource
 * economy, base buildings, hero roster, squad formation, season progression,
 * and daily/weekly missions. Each sub-state is defined minimally here and
 * populated by the later feature that owns it. A run itself is transient and
 * never saved.
 */
export interface GameState {
  /** Save-format version so future migrations can be detected. */
  version: number;
  /** Gate-runner (Falcon Rescue) meta-progression, moved here in v2. */
  miniGame: MiniGameMeta;
  /** Resource economy (later FEAT). */
  resources: ResourceState;
  /** Base buildings (later FEAT). */
  buildings: BuildingState;
  /** Hero roster (later FEAT). */
  heroes: HeroState;
  /** Squad formation (later FEAT). */
  formation: FormationState;
  /** Season / battle-pass progression (FEAT-004). */
  season: SeasonState;
  /** Daily / weekly missions (FEAT-004). */
  missions: MissionState;
  /** PvE campaign + zombie-wave progress (FEAT-004). */
  campaign: CampaignState;
  /** League / alliance standings (FEAT-004, offline simulation). */
  league: LeagueState;
  /** First-run onboarding tutorial progress (FEAT-003). */
  tutorial: TutorialState;
  /** Monotonic Falcon run id source. */
  runSequence: number;
  /** Highest generated Falcon run sequence already settled. Never decreases. */
  settledRunSequence: number;
  /** Settled run ids retained for save compatibility and diagnostics. */
  appliedRunIds: string[];
  /** Local-day Falcon conversion cap state. */
  dailyCompletedRuns: { dayKey: number; count: number };
  /** Highest trusted wall clock observed, used to freeze >5-minute rollback. */
  maxSeenWallTime: number;
  /** Highest local day/week/season ordinals ever activated. */
  maxDayOrdinal: number;
  maxWeekOrdinal: number;
  maxSeasonOrdinal: number;
  /** One-time result summary shown after a replay was interrupted/reloaded. */
  pendingBattleSummary: { win: boolean; rounds: number; survivors: number; timedOut: boolean } | null;
}
