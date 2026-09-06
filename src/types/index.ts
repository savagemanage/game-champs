/**
 * Shared cross-cutting types for LAST SQUAD (라스트 스쿼드).
 *
 * These are the vocabulary the pure-logic systems (gate math, run simulator,
 * meta-progression, save/load) all import so their contracts line up. Nothing
 * here depends on Phaser, so the systems and their unit tests can import these
 * freely. Types that map to canonical tuples are derived from the config so the
 * config stays the single source of truth.
 */

import { GATE_OPS, UPGRADE_ORDER } from '../config/GameConfig';

/** A math gate operation. Derived from the canonical GATE_OPS tuple. */
export type GateOp = (typeof GATE_OPS)[number];

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
 * Resource economy sub-state (OWNED BY A LATER FEAT: buildings/economy).
 *
 * Placeholder for the four survival resources plus their storage caps that the
 * base-building economy will drive. Kept empty-but-valid (all zero) now so the
 * save round-trips and later features can populate concrete fields.
 */
export interface ResourceState {
  /** Per-resource stockpiles, keyed by resource id (empty until FEAT adds them). */
  stockpiles: Record<string, number>;
}

/**
 * Base-building sub-state (OWNED BY A LATER FEAT: buildings/economy).
 *
 * Placeholder for HQ + tech center / parade ground / hospital / barracks /
 * drone center levels and their in-progress timed upgrades. Empty-but-valid
 * now (no buildings constructed).
 */
export interface BuildingState {
  /** Building level keyed by building id (empty until a FEAT populates it). */
  levels: Record<string, number>;
}

/**
 * Hero roster sub-state (OWNED BY A LATER FEAT: heroes).
 *
 * Placeholder for the owned hero collection (grade / star-tier / level / skill
 * progression). Empty-but-valid now (no heroes recruited).
 */
export interface HeroState {
  /** Owned heroes keyed by hero id (empty until a FEAT populates it). */
  roster: Record<string, unknown>;
}

/**
 * Squad-formation sub-state (OWNED BY A LATER FEAT: formation/combat).
 *
 * Placeholder for the 5-slot squad layout (2 front row + 3 back row) that
 * references heroes by id. Empty-but-valid now (no slots assigned).
 */
export interface FormationState {
  /** Front-row hero-id slots (later: length 2). */
  front: (string | null)[];
  /** Back-row hero-id slots (later: length 3). */
  back: (string | null)[];
}

/**
 * Season / battle-pass sub-state (OWNED BY A LATER FEAT: season/league).
 *
 * Placeholder for the current season id and pass progress. Empty-but-valid now
 * (season 0, no progress).
 */
export interface SeasonState {
  /** Current season identifier (0 = no season started). */
  current: number;
  /** Accumulated season/pass progress points. */
  progress: number;
}

/**
 * Daily / weekly mission sub-state (OWNED BY A LATER FEAT: missions).
 *
 * Placeholder for arms-race (daily) and alliance-duel (weekly) task progress.
 * Empty-but-valid now (no tasks tracked).
 */
export interface MissionState {
  /** Daily "arms race" task progress keyed by task id. */
  daily: Record<string, number>;
  /** Weekly "alliance duel" task progress keyed by task id. */
  weekly: Record<string, number>;
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
  /** Season / battle-pass progression (later FEAT). */
  season: SeasonState;
  /** Daily / weekly missions (later FEAT). */
  missions: MissionState;
}
