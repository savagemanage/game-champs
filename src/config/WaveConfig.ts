/**
 * WaveConfig - the data-driven wave table for the wall-defense loop.
 *
 * Each wave is pure DATA: a list of (role, count) spawn groups plus pacing.
 * Difficulty escalates ACROSS waves purely through COMPOSITION - later waves
 * add more giants, introduce tougher roles, and mix disruptive roles together.
 * We NEVER scale a giant's base stats to raise difficulty; the numbers in
 * EnemyConfig.ts are fixed. This keeps balance readable and honest: a Breaker
 * in wave 8 is the exact same Breaker as in wave 3, there are just more/nastier
 * things around it.
 *
 * WaveSystem reads this table; when all listed waves are cleared the run is a
 * victory. Adding a wave is a one-line data edit here.
 */

import { EnemyRole } from './GameConfig';

/** A group of identical giants spawned within a wave. */
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
} as const;

/**
 * The wave table. Composition ramps: single easy giant -> small groups ->
 * mixed roles -> tanky/ranged/disruptive combos -> a Breaker-led finale.
 * Every escalation is more/tougher-role spawns, not bigger stats.
 */
export const WAVES: readonly WaveDef[] = [
  {
    wave: 1,
    groups: [{ role: EnemyRole.Wanderer, count: 3 }],
    spawnIntervalMs: 2000,
    startDelayMs: WAVE_TUNING.FIRST_WAVE_DELAY_MS,
  },
  {
    wave: 2,
    groups: [
      { role: EnemyRole.Wanderer, count: 3 },
      { role: EnemyRole.Sprinter, count: 2 },
    ],
    spawnIntervalMs: 1700,
    startDelayMs: 3000,
  },
  {
    wave: 3,
    groups: [
      { role: EnemyRole.Wanderer, count: 3 },
      { role: EnemyRole.Sprinter, count: 3 },
      { role: EnemyRole.Thrower, count: 1 },
    ],
    spawnIntervalMs: 1500,
    startDelayMs: 3000,
  },
  {
    wave: 4,
    groups: [
      { role: EnemyRole.Wanderer, count: 4 },
      { role: EnemyRole.Aberrant, count: 2 },
      { role: EnemyRole.Armored, count: 1 },
    ],
    spawnIntervalMs: 1400,
    startDelayMs: 3200,
  },
  {
    wave: 5,
    groups: [
      { role: EnemyRole.Sprinter, count: 4 },
      { role: EnemyRole.Thrower, count: 2 },
      { role: EnemyRole.Breaker, count: 1 },
    ],
    spawnIntervalMs: 1300,
    startDelayMs: 3200,
  },
  {
    wave: 6,
    groups: [
      { role: EnemyRole.Wanderer, count: 4 },
      { role: EnemyRole.Armored, count: 2 },
      { role: EnemyRole.Aberrant, count: 3 },
      { role: EnemyRole.Thrower, count: 1 },
    ],
    spawnIntervalMs: 1200,
    startDelayMs: 3400,
  },
  {
    wave: 7,
    groups: [
      { role: EnemyRole.Sprinter, count: 5 },
      { role: EnemyRole.Armored, count: 2 },
      { role: EnemyRole.Thrower, count: 2 },
      { role: EnemyRole.Breaker, count: 1 },
    ],
    spawnIntervalMs: 1100,
    startDelayMs: 3400,
  },
  {
    wave: 8,
    groups: [
      { role: EnemyRole.Wanderer, count: 4 },
      { role: EnemyRole.Sprinter, count: 4 },
      { role: EnemyRole.Aberrant, count: 4 },
      { role: EnemyRole.Armored, count: 3 },
      { role: EnemyRole.Thrower, count: 3 },
      { role: EnemyRole.Breaker, count: 2 },
    ],
    spawnIntervalMs: 950,
    startDelayMs: 4000,
  },
];

/** Total number of giants a wave will spawn (sum of its group counts). */
export function waveSize(def: WaveDef): number {
  return def.groups.reduce((sum, g) => sum + g.count, 0);
}

/**
 * Expand a wave into a flat, shuffle-friendly spawn order (one role per spawn).
 * Interleaves groups round-robin so the composition arrives mixed rather than
 * role-by-role, which makes the encounter read as designed variety.
 */
export function expandWave(def: WaveDef): EnemyRole[] {
  const queues = def.groups.map((g) => Array<EnemyRole>(g.count).fill(g.role));
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
