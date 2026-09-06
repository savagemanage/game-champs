/**
 * WaveConfig - deterministic Frozen Horde wave composition and rewards.
 *
 * Given a 1-based wave number, `waveComposition(n)` returns the exact enemy
 * roster for that wave and `waveReward(n)` returns the resource payout for
 * clearing it. Both are pure functions of `n` (no randomness), so combat and
 * progression are fully reproducible and unit-testable.
 *
 * The Frozen Horde swells out of the blizzard as the long night deepens.
 * Difficulty scales by COMPOSITION only (more and heavier enemies at higher
 * waves), never by mutating per-unit stats - those live in TroopConfig.ENEMY_DEFS.
 */

import type { EnemyKind, ResourceCost } from '../types';

/**
 * The number of configured waves in a full campaign run. Surviving this many
 * waves is a full victory (the battle result scene celebrates it). Waves past
 * this still resolve with valid compositions/rewards, but progression treats
 * TOTAL_WAVES as the finish line so the loop has a defined "you endured" state.
 */
export const TOTAL_WAVES = 20;

/** How many of an enemy kind appear in a wave. */
export interface WaveEntry {
  kind: EnemyKind;
  count: number;
}

/**
 * Enemy roster for wave `n` (1-based). Composition grows with the wave index:
 * frost wolves scale steadily, ravagers join from wave 3, frost titans from
 * wave 5, and every count ramps up as the blizzard worsens.
 */
export function waveComposition(n: number): WaveEntry[] {
  const wave = Math.max(1, Math.floor(n));
  const entries: WaveEntry[] = [];

  // Frost wolves: the backbone of every wave, scaling roughly linearly.
  const wolves = 3 + Math.floor(wave * 1.5);
  entries.push({ kind: 'frost_wolf', count: wolves });

  // Ravagers: appear from wave 3, one more roughly every two waves.
  if (wave >= 3) {
    const ravagers = 1 + Math.floor((wave - 3) / 2);
    entries.push({ kind: 'ravager', count: ravagers });
  }

  // Frost titans: heavy siege from wave 5, one more roughly every three waves.
  if (wave >= 5) {
    const titans = 1 + Math.floor((wave - 5) / 3);
    entries.push({ kind: 'frost_titan', count: titans });
  }

  // Frostbeast champions crash into the LATE waves as mini-boss escorts (the
  // full-strength versions are fought in RallySystem world-boss rallies). A
  // lone rime alpha leads from wave 10, a glacier behemoth anchors from wave
  // 15, so the endgame waves feel like the horde's apex predators arriving.
  if (wave >= 10) {
    entries.push({ kind: 'rime_alpha', count: 1 + Math.floor((wave - 10) / 5) });
  }
  if (wave >= 15) {
    entries.push({ kind: 'glacier_behemoth', count: 1 + Math.floor((wave - 15) / 5) });
  }

  return entries;
}

/**
 * Resource reward for clearing wave `n` (1-based). Grows geometrically so later
 * waves are worth pushing for. Iron only starts dropping from wave 2.
 */
export function waveReward(n: number): ResourceCost {
  const wave = Math.max(1, Math.floor(n));
  const scale = Math.pow(1.25, wave - 1);
  return {
    food: Math.round(60 * scale),
    wood: Math.round(50 * scale),
    coal: Math.round(30 * scale),
    iron: wave >= 2 ? Math.round(15 * scale) : 0,
  };
}
