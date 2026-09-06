import { SUMMON } from '../config/GameConfig';
import { HERO_RARITY_DEFS, heroesOfRarity } from '../config/HeroConfig';
import type { HeroId, HeroRarity, SummonState } from '../types';
import { HERO_RARITY_ORDER } from '../types';

/**
 * A deterministic random source: returns a float in [0, 1). The pure core NEVER
 * calls Math.random; callers inject either a seeded generator ({@link mulberry32})
 * or, at runtime, a wrapper around Math.random. This keeps every pull
 * reproducible under a fixed seed so the unit tests are stable (mirroring how
 * SaveManager takes `now` as a parameter).
 */
export type Rng = () => number;

/**
 * mulberry32 - a tiny, fast, well-distributed seedable PRNG. Given the same
 * 32-bit seed it always yields the same stream, so tests can assert exact
 * summon sequences. Pure; no global state beyond the returned closure.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The outcome of a single summon. */
export interface SummonResult {
  /** The hero that was rolled. */
  hero: HeroId;
  /** The rarity that was rolled. */
  rarity: HeroRarity;
  /** True when this pull was forced to epic+ by the pity guarantee. */
  pity: boolean;
  /**
   * How the pull resolved for the roster: `hero` when it granted a first copy
   * (the hero was not yet owned), or `shards` for a duplicate. The caller
   * (HeroRoster / GameState) applies this.
   */
  outcome: 'hero' | 'shards';
  /** Shards granted when `outcome === 'shards'` (0 otherwise). */
  shards: number;
}

/** Whether a rarity counts as "high" for the pity guarantee (epic or better). */
function isHighRarity(rarity: HeroRarity): boolean {
  return rarity === 'epic' || rarity === 'legendary';
}

/**
 * SummonSystem - the deterministic gacha as PURE logic.
 *
 * A pull rolls a rarity by SUMMON.RARITY_WEIGHTS, then a uniformly-random hero
 * of that rarity. The caller supplies:
 *   - an injected {@link Rng} so the sequence is reproducible under a seed, and
 *   - an `isOwned` predicate + `duplicateShards` policy so the system can decide
 *     whether the pull grants a first copy or converts to shards WITHOUT owning
 *     the roster (kept decoupled; HeroRoster applies the result).
 *
 * A PITY counter tracks consecutive non-(epic+) pulls; once it reaches
 * SUMMON.PITY_THRESHOLD the NEXT pull is forced to at least epic and the counter
 * resets. Any epic+ pull (lucky or pitied) also resets the counter. Serializable
 * via toJSON / fromJSON.
 */
export class SummonSystem {
  private _totalPulls: number;
  private _pityCounter: number;

  constructor(state?: SummonState) {
    this._totalPulls = state ? Math.max(0, Math.floor(state.totalPulls ?? 0)) : 0;
    this._pityCounter = state ? Math.max(0, Math.floor(state.pityCounter ?? 0)) : 0;
  }

  /** Total summons ever performed. */
  get totalPulls(): number {
    return this._totalPulls;
  }

  /** Consecutive non-(epic+) pulls since the last high-rarity result. */
  get pityCounter(): number {
    return this._pityCounter;
  }

  /** Whether the NEXT pull will be forced to epic+ by the pity guarantee. */
  get pityReady(): boolean {
    return this._pityCounter >= SUMMON.PITY_THRESHOLD;
  }

  /** The Ember Sparks cost of one summon. */
  get sparkCost(): number {
    return SUMMON.SPARK_COST;
  }

  /**
   * Roll a rarity from the configured weights using `rng`. When `forceHigh` is
   * set (pity), the weights are restricted to epic+ so the guarantee holds while
   * still respecting the relative epic:legendary odds.
   */
  private rollRarity(rng: Rng, forceHigh: boolean): HeroRarity {
    const rarities: HeroRarity[] = forceHigh
      ? HERO_RARITY_ORDER.filter(isHighRarity)
      : [...HERO_RARITY_ORDER];
    let total = 0;
    for (const r of rarities) total += SUMMON.RARITY_WEIGHTS[r];
    // Defensive: if weights are degenerate, fall back to the lowest rarity.
    if (total <= 0) return rarities[0];
    let roll = rng() * total;
    for (const r of rarities) {
      roll -= SUMMON.RARITY_WEIGHTS[r];
      if (roll < 0) return r;
    }
    return rarities[rarities.length - 1];
  }

  /** Pick a uniformly-random hero of the given rarity using `rng`. */
  private rollHero(rng: Rng, rarity: HeroRarity): HeroId {
    const pool = heroesOfRarity(rarity);
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    return pool[idx];
  }

  /**
   * Perform ONE summon. Deterministic given `rng`. Rolls rarity (honoring the
   * pity guarantee), then a hero, and resolves to a first copy or shards via the
   * `isOwned` predicate. Updates the pity counter + total-pull count. Does NOT
   * mutate any roster or wallet - the caller applies {@link SummonResult}.
   *
   * @param rng        injected deterministic random source
   * @param isOwned    predicate: is this hero already owned by the roster?
   */
  pull(rng: Rng, isOwned: (id: HeroId) => boolean): SummonResult {
    const forceHigh = this.pityReady;
    const rarity = this.rollRarity(rng, forceHigh);
    const hero = this.rollHero(rng, rarity);

    // Pity bookkeeping: any epic+ resets the counter; otherwise it grows.
    const high = isHighRarity(rarity);
    const pity = forceHigh; // this pull was granted BY the pity guarantee
    if (high) this._pityCounter = 0;
    else this._pityCounter += 1;
    this._totalPulls += 1;

    if (isOwned(hero)) {
      return {
        hero,
        rarity,
        pity,
        outcome: 'shards',
        shards: SUMMON.DUPLICATE_SHARDS[rarity],
      };
    }
    return { hero, rarity, pity, outcome: 'hero', shards: 0 };
  }

  /**
   * Convenience: whether a duplicate of `rarity` grants shards (always true;
   * exposed so UI can show the amount). Kept alongside the config for one home.
   */
  static duplicateShards(rarity: HeroRarity): number {
    return SUMMON.DUPLICATE_SHARDS[rarity];
  }

  /** The rarity draw weight table (exposed read-only for UI / tests). */
  static rarityWeights(): Readonly<Record<HeroRarity, number>> {
    return SUMMON.RARITY_WEIGHTS;
  }

  /** The star ceiling of a hero of the given rarity (via HeroConfig). */
  static maxStarsForRarity(rarity: HeroRarity): number {
    return HERO_RARITY_DEFS[rarity].maxStars;
  }

  /** Serialize to a plain {@link SummonState}. */
  toJSON(): SummonState {
    return { totalPulls: this._totalPulls, pityCounter: this._pityCounter };
  }

  /**
   * Restore from a persisted {@link SummonState}. A missing / malformed value
   * yields a fresh summon state (no pulls, no pity) so old saves load without
   * crashing.
   */
  static fromJSON(data: SummonState | undefined | null): SummonSystem {
    if (!data || typeof data !== 'object') return new SummonSystem();
    return new SummonSystem(data);
  }
}
