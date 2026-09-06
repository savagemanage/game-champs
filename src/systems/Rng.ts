/**
 * Rng.ts - a tiny seedable pseudo-random generator (mulberry32).
 *
 * Deterministic and Phaser-free: given the same seed it always produces the
 * same sequence, so runs are reproducible in unit tests. mulberry32 is a fast,
 * well-distributed 32-bit generator adequate for gameplay randomness.
 */

/** A seedable random source producing floats in [0, 1). */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Pick one element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

/** Create a mulberry32 generator from an unsigned-int seed. */
export function makeRng(seed: number): Rng {
  // Coerce to a 32-bit unsigned integer state.
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min];
    return Math.floor(range(min, max + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[int(0, items.length - 1)];
  };

  return { next, int, range, pick };
}
