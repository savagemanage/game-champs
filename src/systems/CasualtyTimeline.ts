import { TROOP_ORDER } from '../config/TroopConfig';
import { waveComposition } from '../config/WaveConfig';
import type { Army, TroopKind } from '../types';
import type { CombatResult } from './CombatSystem';

/**
 * CasualtyTimeline - a PURE bridge between the deterministic {@link CombatSystem}
 * resolution and the animated BattleScene.
 *
 * The scene must never invent its own combat math: the truth is the single
 * {@link CombatResult} from CombatSystem.resolve(). This module turns that
 * result into a small, ordered sequence of discrete "ticks", where on every
 * tick some friendly troops and some Frozen Horde beasts fall. Crucially the timeline
 * ENDS exactly on the resolution:
 *   - friendly troop counts drain from the starting army down to
 *     result.survivors (all-zero on a loss),
 *   - enemy counts drain from the wave composition down to zero on a win, or
 *     down to a non-zero remainder on a loss (the wave survives).
 *
 * Because it is Phaser-free and a pure function of `(army, result)` it is
 * unit-testable, and the co-located test asserts the final frame matches
 * CombatSystem, keeping the visualization honest.
 */

/** Per-kind friendly + enemy counts alive at a point in the battle. */
export interface BattleCounts {
  /** Living friendly troops by kind. */
  friendly: Army;
  /** Living Frozen Horde enemies by kind. */
  enemy: Record<string, number>;
}

/** A single animation tick: the counts alive AFTER this tick's casualties. */
export interface TimelineStep {
  /** 1-based tick index. */
  index: number;
  /** Friendly troops still alive after this tick. */
  friendly: Army;
  /** Frozen Horde enemies still alive after this tick. */
  enemy: Record<string, number>;
}

/** The complete timeline: the opening counts plus each resolved tick. */
export interface BattleTimeline {
  /** Counts at the start (full army vs full wave). */
  start: BattleCounts;
  /** Ordered casualty ticks; the LAST one equals the CombatSystem outcome. */
  steps: TimelineStep[];
  /** Convenience mirror of the source result's win flag. */
  win: boolean;
}

function cloneArmy(a: Army): Army {
  return { trapper: a.trapper ?? 0, marksman: a.marksman ?? 0, vanguard: a.vanguard ?? 0 };
}

function totalArmy(a: Army): number {
  return TROOP_ORDER.reduce((s, k) => s + Math.max(0, Math.floor(a[k] ?? 0)), 0);
}

function totalEnemy(e: Record<string, number>): number {
  return Object.keys(e).reduce((s, k) => s + Math.max(0, Math.floor(e[k] ?? 0)), 0);
}

/**
 * Interpolate a per-kind count map from `from` down to `to` over `steps` ticks
 * (linearly), returning the value at tick `i` (1-based). Tick `steps` returns
 * exactly `to`. Values are floored and clamped to [to, from] so the sequence is
 * monotonically non-increasing and lands precisely on `to`.
 */
function drainAt(from: number, to: number, i: number, steps: number): number {
  if (steps <= 0 || i >= steps) return to;
  const frac = i / steps;
  const value = Math.round(from - (from - to) * frac);
  return Math.min(from, Math.max(to, value));
}

/**
 * Build a casualty timeline that animates `army` fighting `result.wave` toward
 * the deterministic `result`. `steps` controls granularity (how many discrete
 * casualty ticks); it is clamped to at least 1. The final step is guaranteed to
 * equal the resolution: friendly === survivors, and enemy === 0 on a win / the
 * surviving-wave remainder on a loss.
 */
export function buildTimeline(army: Army, result: CombatResult, steps = 8): BattleTimeline {
  const stepCount = Math.max(1, Math.floor(steps));

  // Starting counts.
  const startFriendly = cloneArmy(army);
  const startEnemy: Record<string, number> = {};
  for (const entry of waveComposition(result.wave)) {
    startEnemy[entry.kind] = (startEnemy[entry.kind] ?? 0) + entry.count;
  }

  // Final counts, straight from the authoritative resolution.
  const endFriendly = cloneArmy(result.survivors);

  // On a win the whole wave is destroyed. On a loss the wave survives; we keep
  // a proportional remainder so the animation shows enemies still standing,
  // scaled by how badly the player lost (never below 1 total when any enemy
  // was present).
  const endEnemy: Record<string, number> = {};
  const startEnemyTotal = totalEnemy(startEnemy);
  if (result.win) {
    for (const k of Object.keys(startEnemy)) endEnemy[k] = 0;
  } else {
    const survivalRatio =
      result.wavePower > 0 ? Math.min(1, Math.max(0, 1 - result.armyPower / result.wavePower)) : 1;
    let remaining = 0;
    for (const k of Object.keys(startEnemy)) {
      const kept = Math.floor(startEnemy[k] * survivalRatio);
      endEnemy[k] = Math.min(startEnemy[k], Math.max(0, kept));
      remaining += endEnemy[k];
    }
    // A defeat must leave at least one enemy standing when the wave was non-empty.
    if (remaining === 0 && startEnemyTotal > 0) {
      const firstKind = Object.keys(startEnemy).find((k) => startEnemy[k] > 0);
      if (firstKind) endEnemy[firstKind] = 1;
    }
  }

  const timelineSteps: TimelineStep[] = [];
  for (let i = 1; i <= stepCount; i++) {
    const friendly: Army = { trapper: 0, marksman: 0, vanguard: 0 };
    for (const k of TROOP_ORDER) {
      friendly[k] = drainAt(startFriendly[k] ?? 0, endFriendly[k] ?? 0, i, stepCount);
    }
    const enemy: Record<string, number> = {};
    for (const k of Object.keys(startEnemy)) {
      enemy[k] = drainAt(startEnemy[k] ?? 0, endEnemy[k] ?? 0, i, stepCount);
    }
    // Force the final tick to land exactly on the resolution.
    if (i === stepCount) {
      for (const k of TROOP_ORDER) friendly[k] = endFriendly[k] ?? 0;
      for (const k of Object.keys(startEnemy)) enemy[k] = endEnemy[k] ?? 0;
    }
    timelineSteps.push({ index: i, friendly, enemy });
  }

  return {
    start: { friendly: startFriendly, enemy: startEnemy },
    steps: timelineSteps,
    win: result.win,
  };
}

/** Total friendly troops alive in a set of counts. */
export function friendlyTotal(counts: { friendly: Army }): number {
  return totalArmy(counts.friendly);
}

/** Total Frozen Horde enemies alive in a set of counts. */
export function enemyTotal(counts: { enemy: Record<string, number> }): number {
  return totalEnemy(counts.enemy);
}

/** The friendly kinds present in an army, in canonical order, count > 0. */
export function activeTroopKinds(army: Army): TroopKind[] {
  return TROOP_ORDER.filter((k) => (army[k] ?? 0) > 0);
}
