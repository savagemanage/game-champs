/**
 * RunSimulator.ts - the pure, deterministic model of a single LAST SQUAD run.
 *
 * Given a seed and the player's derived stats, the simulator builds a fixed
 * TRACK of gate rows and enemy clusters (plus the end boss). Because the track
 * is generated from a seeded RNG, the same seed always yields the same layout,
 * so a run is fully reproducible for tests.
 *
 * A run is resolved by feeding it a sequence of per-row lane choices. At each
 * gate row the chosen lane's gate is applied to the squad; between rows any
 * enemy clusters engaged are burned down by squad firepower and leftover HP
 * costs squad members; finally the boss is fought. The result is a
 * {@link RunResult}. The intermediate {@link RunEvent} timeline is exposed so
 * the scene can drive/animate the run step by step without re-implementing the
 * math. Phaser-free and fully unit-testable.
 */

import { ENEMIES, GATES, META, RUN, SQUAD } from '../config/GameConfig';
import type { DerivedStats, EnemyCluster, Gate, GateRow, Lane, RunResult } from '../types';
import { applyGate, generateGateRow } from './GateMath';
import { coinsEarned } from './MetaProgress';
import { makeRng, type Rng } from './Rng';

/** A generated run track: the ordered rows and clusters plus the boss. */
export interface RunTrack {
  rows: GateRow[];
  clusters: EnemyCluster[];
  boss: EnemyCluster;
  /** Total run distance (rows/clusters/boss all fall within this). */
  distance: number;
}

/** Difficulty at a given distance, ramping linearly across the run. */
export function difficultyAt(distance: number): number {
  const [d0, d1] = RUN.DIFFICULTY_RANGE;
  const t = Math.max(0, Math.min(1, distance / RUN.DIFFICULTY_RAMP_DISTANCE));
  return d0 + (d1 - d0) * t;
}

/** Cluster HP at a given distance, scaling with difficulty. */
export function clusterHpAt(distance: number): number {
  const diff = difficultyAt(distance);
  return Math.round(ENEMIES.CLUSTER_BASE_HP + (diff - 1) * ENEMIES.CLUSTER_HP_PER_DIFFICULTY);
}

/**
 * Build the fixed track for a seed. Gate rows are placed every
 * GATES.ROW_SPACING and enemy clusters every ENEMIES.CLUSTER_SPACING; the boss
 * sits at RUN.RUN_DISTANCE. Gate operands come from the seeded RNG so the
 * layout is deterministic. Because gate generation depends on the "current"
 * squad size (to guarantee a safe lane), we generate rows against a running
 * nominal size that assumes the player always takes the better lane; this only
 * affects which safe gate is offered, not determinism.
 */
export function buildTrack(seed: number, startSize: number): RunTrack {
  const rng: Rng = makeRng(seed);

  const rows: GateRow[] = [];
  let nominalSize = startSize;
  for (let d = GATES.FIRST_ROW_AT; d < RUN.RUN_DISTANCE; d += GATES.ROW_SPACING) {
    const gates: Gate[] = generateGateRow(rng, nominalSize, difficultyAt(d));
    rows.push({ distance: d, gates });
    // Advance the nominal size along the better lane so later rows are keyed to
    // a plausible squad size.
    const best = Math.max(
      applyGate(nominalSize, gates[0].op, gates[0].value),
      applyGate(nominalSize, gates[1].op, gates[1].value),
    );
    nominalSize = best;
  }

  const clusters: EnemyCluster[] = [];
  for (let d = ENEMIES.FIRST_CLUSTER_AT; d < RUN.RUN_DISTANCE; d += ENEMIES.CLUSTER_SPACING) {
    clusters.push({ distance: d, hp: clusterHpAt(d), boss: false });
  }

  const boss: EnemyCluster = { distance: RUN.RUN_DISTANCE, hp: ENEMIES.BOSS_HP, boss: true };

  return { rows, clusters, boss, distance: RUN.RUN_DISTANCE };
}

/** Effective firepower (damage per second) for a squad of `size` soldiers. */
export function squadFirepower(size: number, stats: DerivedStats): number {
  const shooters = Math.min(size, SQUAD.MAX_RENDERED);
  return shooters * stats.fireRate * stats.damage;
}

/** A single ordered event along the resolved run, for animation/inspection. */
export type RunEvent =
  | {
      kind: 'gate';
      distance: number;
      lane: Lane;
      gate: Gate;
      sizeBefore: number;
      sizeAfter: number;
    }
  | {
      kind: 'cluster';
      distance: number;
      clusterHp: number;
      damageDealt: number;
      leftoverHp: number;
      sizeBefore: number;
      sizeAfter: number;
      boss: boolean;
    };

/** Full resolved run: the ordered timeline plus the final result. */
export interface ResolvedRun {
  events: RunEvent[];
  result: RunResult;
  track: RunTrack;
}

/**
 * Resolve a full run deterministically.
 *
 * @param seed        Track seed (same seed => same layout).
 * @param stats       Derived stats (start size, damage, fire rate, coin mult).
 * @param laneChoices Lane picked at each gate row, in row order. Missing / out
 *                    of range entries default to lane 0. This is the only
 *                    player input the model consumes.
 */
export function resolveRun(seed: number, stats: DerivedStats, laneChoices: Lane[]): ResolvedRun {
  const startSize = Math.max(1, Math.round(stats.startSize));
  const track = buildTrack(seed, startSize);

  // Merge rows and clusters into one distance-ordered obstacle list. The boss
  // is appended last (it shares the final distance but must resolve after any
  // cluster there).
  type Ob =
    | { type: 'row'; distance: number; row: GateRow; index: number }
    | { type: 'cluster'; distance: number; cluster: EnemyCluster };
  const obstacles: Ob[] = [];
  track.rows.forEach((row, index) => obstacles.push({ type: 'row', distance: row.distance, row, index }));
  track.clusters.forEach((cluster) => obstacles.push({ type: 'cluster', distance: cluster.distance, cluster }));
  obstacles.sort((a, b) => a.distance - b.distance);

  const events: RunEvent[] = [];
  let size = startSize;
  let peak = size;
  let distance = 0;
  let win = false;

  const die = (atDistance: number): void => {
    size = 0;
    distance = atDistance;
  };

  for (const ob of obstacles) {
    if (size <= 0) break;
    distance = ob.distance;

    if (ob.type === 'row') {
      const laneRaw = laneChoices[ob.index];
      const lane: Lane = laneRaw === 1 ? 1 : 0;
      const gate = ob.row.gates[lane] ?? ob.row.gates[0];
      const before = size;
      size = applyGate(size, gate.op, gate.value);
      events.push({ kind: 'gate', distance: ob.distance, lane, gate, sizeBefore: before, sizeAfter: size });
      peak = Math.max(peak, size);
      if (size <= 0) {
        die(ob.distance);
        break;
      }
    } else {
      const before = size;
      const firepower = squadFirepower(size, stats);
      // The squad shoots the cluster for a fixed engagement time as it passes.
      const engageSeconds = ENEMIES.CLUSTER_SPACING / RUN.SCROLL_SPEED;
      const damageDealt = Math.min(ob.cluster.hp, firepower * engageSeconds);
      const leftover = Math.max(0, ob.cluster.hp - damageDealt);
      const casualties = Math.floor(leftover * ENEMIES.DAMAGE_PER_LEFTOVER_HP);
      size = Math.max(0, size - casualties);
      events.push({
        kind: 'cluster',
        distance: ob.distance,
        clusterHp: ob.cluster.hp,
        damageDealt,
        leftoverHp: leftover,
        sizeBefore: before,
        sizeAfter: size,
        boss: false,
      });
      if (size <= 0) {
        die(ob.distance);
        break;
      }
    }
  }

  // Boss encounter, only if the squad survived the track.
  if (size > 0) {
    const before = size;
    const firepower = squadFirepower(size, stats);
    const damageDealt = Math.min(track.boss.hp, firepower * ENEMIES.BOSS_DURATION);
    const leftover = Math.max(0, track.boss.hp - damageDealt);
    const casualties = Math.floor(leftover * ENEMIES.BOSS_DAMAGE_PER_HP);
    size = Math.max(0, size - casualties);
    win = leftover <= 0 && size > 0;
    distance = track.distance;
    events.push({
      kind: 'cluster',
      distance: track.distance,
      clusterHp: track.boss.hp,
      damageDealt,
      leftoverHp: leftover,
      sizeBefore: before,
      sizeAfter: size,
      boss: true,
    });
  }

  const squadFinal = size;
  const score = Math.floor(distance + squadFinal * 10 + peak * 5 + (win ? META.COINS_WIN_BONUS : 0));
  const earned = coinsEarned({ squadFinal, distance, win }, stats.coinMultiplier);

  const result: RunResult = {
    distance: Math.round(distance),
    score,
    squadPeak: peak,
    squadFinal,
    win,
    coinsEarned: earned,
  };

  return { events, result, track };
}
