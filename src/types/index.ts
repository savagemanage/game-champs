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
 * The complete persisted game state (serialized to localStorage by the save
 * layer). Purely meta-progression; a run itself is transient and never saved.
 */
export interface GameState {
  /** Save-format version so future migrations can be detected. */
  version: number;
  meta: {
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
  };
}
