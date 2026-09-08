/**
 * A tiny, pure, deterministic RNG for the rift modules.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports and uses
 * NO `Math.random`/`Date.now`, so anything built on top of it stays fully
 * unit testable and reproducible. It pairs the well-known `xmur3` string hash
 * (to turn an arbitrary string/number seed into a 32-bit state) with the
 * `mulberry32` generator (a fast, well-distributed 32-bit PRNG). Given the
 * same seed the produced sequence is byte-identical on every platform.
 */

/**
 * Hash an arbitrary string into a 32-bit unsigned integer seed (xmur3). The
 * result feeds {@link mulberry32}. Numeric seeds should be stringified first
 * (see {@link makeRng}).
 */
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A mulberry32 generator seeded with a 32-bit unsigned integer. Returns a
 * function producing successive floats in the half-open range `[0, 1)`.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a deterministic `[0, 1)` generator from a string or number seed. The
 * seed is hashed with {@link xmur3} so any input value maps onto a good 32-bit
 * state before {@link mulberry32} produces the stream.
 */
export function makeRng(seed: string | number): () => number {
  return mulberry32(xmur3(String(seed)));
}
