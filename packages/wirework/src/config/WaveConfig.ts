/**
 * WaveConfig - the data-driven wave table for the wall-defense loop.
 *
 * Each wave is pure DATA: a list of (role, count) spawn groups plus pacing.
 * Difficulty escalates ACROSS waves purely through COMPOSITION - later waves
 * add more machines, introduce tougher roles, and mix disruptive roles together.
 * We NEVER scale a machine's base stats to raise difficulty; the numbers in
 * EnemyConfig.ts are fixed. This keeps balance readable and honest: a Rammer
 * in wave 8 is the exact same Rammer as in wave 3, there are just more/nastier
 * things around it.
 *
 * WaveSystem reads this table; when all listed waves are cleared the run is a
 * victory. Adding a wave is a one-line data edit here.
 */

import { EnemyRole } from './GameConfig';
import type { Difficulty } from '../systems/Persistence';

/** A group of identical machines spawned within a wave. */
export interface SpawnGroup {
  readonly role: EnemyRole;
  readonly count: number;
}

/** One wave: its spawn composition and pacing. */
export interface WaveDef {
  /** 1-based wave number for the HUD. */
  readonly wave: number;
  /** Composition: which roles and how many. Difficulty = this list only. */
  readonly groups: readonly SpawnGroup[];
  /** Milliseconds between individual spawns within the wave (pacing). */
  readonly spawnIntervalMs: number;
  /** Delay before this wave begins after the previous is cleared, ms. */
  readonly startDelayMs: number;
}

/** Global spawner tuning shared by every wave. */
export const WAVE_TUNING = {
  /** Delay before the very first wave begins, ms. */
  FIRST_WAVE_DELAY_MS: 2500,
  /**
   * Fraction of the spawn interval used to randomly jitter spawn timing so a
   * wave does not arrive in a metronomic line. [0..1] of spawnIntervalMs.
   */
  SPAWN_JITTER: 0.35,
  /** Retry cadence when no legal non-overlapping spawn point is available. */
  SPAWN_RETRY_MS: 200,
  SPAWN_RANDOM_ATTEMPTS: 32,
  SPAWN_FALLBACK_ANGLES: 64,
} as const;

/**
 * Per-difficulty PACING/COMPOSITION scaling. The difficulty selector NEVER
 * touches a machine's base stats (those are fixed in EnemyConfig.ts) - it only
 * changes how fast a wave arrives and, at the top setting, how many extra
 * baseline machines pad each wave. This keeps every individual machine identical
 * across difficulties; only the pressure of the encounter changes.
 *
 *  - spawnIntervalScale: multiplies each wave's spawnIntervalMs (< 1 = faster,
 *    tighter pressure; > 1 = slower, more breathing room).
 *  - startDelayScale: multiplies the inter-wave delay the same way.
 *  - extraFillerPerWave: how many additional Surveyor (baseline role) spawns to
 *    append to each wave's composition - MORE machines, not tougher ones.
 */
export interface DifficultyTuning {
  readonly spawnIntervalScale: number;
  readonly startDelayScale: number;
  readonly extraFillerPerWave: number;
  /** Baseline role used for the extra filler spawns (kept low-tier on purpose). */
  readonly fillerRole: EnemyRole;
}

export const DIFFICULTY_TUNING: Record<Difficulty, DifficultyTuning> = {
  // Relaxed: machines trickle in and waves give a longer breather.
  relaxed: { spawnIntervalScale: 1.4, startDelayScale: 1.35, extraFillerPerWave: 0, fillerRole: EnemyRole.Surveyor },
  // Standard: the table as authored.
  standard: { spawnIntervalScale: 1, startDelayScale: 1, extraFillerPerWave: 0, fillerRole: EnemyRole.Surveyor },
  // Brutal: relentless pacing plus a couple of extra baseline machines per wave.
  brutal: { spawnIntervalScale: 0.68, startDelayScale: 0.7, extraFillerPerWave: 2, fillerRole: EnemyRole.Surveyor },
} as const;

/**
 * The wave table. Composition ramps: single easy machine -> small groups ->
 * mixed roles -> tanky/ranged/disruptive combos -> a Rammer-led finale.
 * Every escalation is more/tougher-role spawns, not bigger stats.
 */
export const WAVES: readonly WaveDef[] = [
  {
    wave: 1,
    groups: [{ role: EnemyRole.Surveyor, count: 3 }],
    spawnIntervalMs: 2000,
    startDelayMs: WAVE_TUNING.FIRST_WAVE_DELAY_MS,
  },
  {
    wave: 2,
    groups: [
      { role: EnemyRole.Surveyor, count: 3 },
      { role: EnemyRole.Skitter, count: 2 },
    ],
    spawnIntervalMs: 1700,
    startDelayMs: 3000,
  },
  {
    wave: 3,
    groups: [
      { role: EnemyRole.Surveyor, count: 3 },
      { role: EnemyRole.Skitter, count: 3 },
      { role: EnemyRole.Bombard, count: 1 },
    ],
    spawnIntervalMs: 1500,
    startDelayMs: 3000,
  },
  {
    wave: 4,
    groups: [
      { role: EnemyRole.Surveyor, count: 4 },
      { role: EnemyRole.Fluxborn, count: 2 },
      { role: EnemyRole.Bastion, count: 1 },
    ],
    spawnIntervalMs: 1400,
    startDelayMs: 3200,
  },
  {
    wave: 5,
    groups: [
      { role: EnemyRole.Skitter, count: 4 },
      { role: EnemyRole.Bombard, count: 2 },
      { role: EnemyRole.Rammer, count: 1 },
    ],
    spawnIntervalMs: 1300,
    startDelayMs: 3200,
  },
  {
    wave: 6,
    groups: [
      { role: EnemyRole.Surveyor, count: 4 },
      { role: EnemyRole.Bastion, count: 2 },
      { role: EnemyRole.Fluxborn, count: 3 },
      { role: EnemyRole.Bombard, count: 1 },
    ],
    spawnIntervalMs: 1200,
    startDelayMs: 3400,
  },
  {
    wave: 7,
    groups: [
      { role: EnemyRole.Skitter, count: 5 },
      { role: EnemyRole.Bastion, count: 2 },
      { role: EnemyRole.Bombard, count: 2 },
      { role: EnemyRole.Rammer, count: 1 },
    ],
    spawnIntervalMs: 1100,
    startDelayMs: 3400,
  },
  {
    wave: 8,
    groups: [
      { role: EnemyRole.Surveyor, count: 4 },
      { role: EnemyRole.Skitter, count: 4 },
      { role: EnemyRole.Fluxborn, count: 4 },
      { role: EnemyRole.Bastion, count: 3 },
      { role: EnemyRole.Bombard, count: 3 },
      { role: EnemyRole.Rammer, count: 2 },
    ],
    spawnIntervalMs: 950,
    startDelayMs: 4000,
  },
];

/** Total number of machines a wave will spawn (sum of its group counts). */
export function waveSize(def: WaveDef): number {
  return def.groups.reduce((sum, g) => sum + g.count, 0);
}

/**
 * Expand a wave into a flat, shuffle-friendly spawn order (one role per spawn).
 * Interleaves groups round-robin so the composition arrives mixed rather than
 * role-by-role, which makes the encounter read as designed variety.
 *
 * When a {@link DifficultyTuning} is supplied, its `extraFillerPerWave` baseline
 * machines are appended to the wave (MORE machines of a fixed low-tier role, never
 * tougher stats), so a harder difficulty means a bigger crowd, not buffed foes.
 */
export function expandWave(def: WaveDef, tuning?: DifficultyTuning): EnemyRole[] {
  const groups: SpawnGroup[] = [...def.groups];
  if (tuning && tuning.extraFillerPerWave > 0) {
    groups.push({ role: tuning.fillerRole, count: tuning.extraFillerPerWave });
  }
  const queues = groups.map((g) => Array<EnemyRole>(g.count).fill(g.role));
  const order: EnemyRole[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const q of queues) {
      const role = q.shift();
      if (role !== undefined) {
        order.push(role);
        if (q.length > 0) remaining = true;
      }
    }
  }
  return order;
}

/** Difficulty-scaled spawn interval for a wave (rounded ms, floored at 200). */
export function scaledSpawnIntervalMs(def: WaveDef, tuning: DifficultyTuning): number {
  return Math.max(200, Math.round(def.spawnIntervalMs * tuning.spawnIntervalScale));
}

/** Difficulty-scaled inter-wave start delay for a wave (rounded ms, floored at 500). */
export function scaledStartDelayMs(def: WaveDef, tuning: DifficultyTuning): number {
  return Math.max(500, Math.round(def.startDelayMs * tuning.startDelayScale));
}
