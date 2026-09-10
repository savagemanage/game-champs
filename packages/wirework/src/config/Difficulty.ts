import type { Difficulty } from '../systems/AudioManager';

/**
 * Difficulty ordering + stepping helpers.
 *
 * Difficulty is a coarse selector read once at run start by WaveSystem to scale
 * wave pacing/composition (never per-machine stats). The Settings scene lets the
 * player move through the ordered list in BOTH directions; the stepping logic
 * is factored out here as a pure function so it can be unit-tested without a
 * Phaser runtime.
 */

/** The ordered difficulty list, easiest -> hardest. */
export const DIFFICULTY_ORDER: Difficulty[] = ['relaxed', 'standard', 'brutal'];

/**
 * Step the difficulty one place in `dir` (+1 = harder/next, -1 = easier/prev),
 * WRAPPING at both ends. Wrapping keeps parity with the old forward-only cycle
 * (which wrapped brutal -> relaxed) and makes both directions symmetric, so
 * pressing prev then next always returns to the starting value.
 */
export function stepDifficulty(current: Difficulty, dir: -1 | 1): Difficulty {
  const len = DIFFICULTY_ORDER.length;
  const idx = DIFFICULTY_ORDER.indexOf(current);
  // -1 % len can be negative in JS, so add len before taking the modulus.
  const next = (((idx + dir) % len) + len) % len;
  return DIFFICULTY_ORDER[next];
}
