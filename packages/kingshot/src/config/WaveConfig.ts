/**
 * WaveConfig - deterministic raider-wave composition and rewards.
 *
 * Given a 1-based wave number, `waveComposition(n)` returns the exact enemy
 * roster for that wave and `waveReward(n)` returns the resource payout for
 * clearing it. Both are pure functions of `n` (no randomness), so combat and
 * progression are fully reproducible and unit-testable.
 *
 * Difficulty scales by COMPOSITION only (more and heavier enemies at higher
 * waves), never by mutating per-unit stats - those live in TroopConfig.ENEMY_DEFS.
 */

import type { EnemyKind, ResourceCost } from '../types';

/**
 * The number of configured waves in a full campaign run. Clearing this many
 * The campaign is sealed at wave 20. Callers must treat an empty composition
 * as an invalid request; waves above the cap never receive enemies or rewards.
 */
export const TOTAL_WAVES = 20;

export function isCampaignWave(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_WAVES;
}

/** How many of an enemy kind appear in a wave. */
export interface WaveEntry {
  kind: EnemyKind;
  count: number;
}

/**
 * Enemy roster for wave `n` (1-based). Composition grows with the wave index:
 * raiders scale steadily, brutes join from wave 3, rams from wave 5, and every
 * count ramps up as waves progress.
 */
export function waveComposition(n: number): WaveEntry[] {
  if (!isCampaignWave(n)) return [];
  const wave = Math.floor(n);
  const entries: WaveEntry[] = [];

  // Raiders: the backbone of every wave, scaling roughly linearly.
  const raiders = 3 + Math.floor(wave * 1.5);
  entries.push({ kind: 'raider', count: raiders });

  // Brutes: appear from wave 3, one more roughly every two waves.
  if (wave >= 3) {
    const brutes = 1 + Math.floor((wave - 3) / 2);
    entries.push({ kind: 'brute', count: brutes });
  }

  // Rams: heavy siege from wave 5, one more roughly every three waves.
  if (wave >= 5) {
    const rams = 1 + Math.floor((wave - 5) / 3);
    entries.push({ kind: 'ram', count: rams });
  }

  // Riders: fast raider-cavalry from wave 7, one more roughly every two waves.
  // Their cavalry-role exercises the extended counter cycle (spearman/knight
  // counter them, off-counter defences bleed) in real late-game battles.
  if (wave >= 7) {
    const riders = 1 + Math.floor((wave - 7) / 2);
    entries.push({ kind: 'rider', count: riders });
  }

  return entries;
}

/**
 * Resource reward for clearing wave `n` (1-based). Grows geometrically so later
 * waves are worth pushing for. Gold only starts dropping from wave 2.
 */
export function waveReward(n: number): ResourceCost {
  if (!isCampaignWave(n)) return {};
  const wave = Math.floor(n);
  const scale = Math.pow(1.25, wave - 1);
  return {
    food: Math.round(60 * scale),
    wood: Math.round(50 * scale),
    stone: Math.round(30 * scale),
    gold: wave >= 2 ? Math.round(15 * scale) : 0,
  };
}
