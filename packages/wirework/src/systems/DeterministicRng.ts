/** Seeded 32-bit RNG used by every gameplay system. */
export interface RandomSource {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  chance(probability: number): boolean;
}

/** Mulberry32: compact, deterministic, and stable across supported browsers. */
export class SeededRng implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < Math.max(0, Math.min(1, probability));
  }
}

/** New run identity. Seeds are not persisted as replay data. */
export function createRunSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] >>> 0;
  }
  const wallClock = Date.now() >>> 0;
  const monotonic = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) >>> 0 : 0;
  return (wallClock ^ monotonic ^ 0xa5a5_5a5a) >>> 0;
}
