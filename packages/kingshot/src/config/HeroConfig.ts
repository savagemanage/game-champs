/**
 * HeroConfig - the original, IP-clean hero roster for Kingdom Rise.
 *
 * This is pure data + pure helper functions with NO Phaser dependency, so
 * HeroSystem and its unit tests can consume it directly.
 *
 * Heroes have a ROLE that decides which domain their bonus applies to:
 *   - 'war':     boosts the army's effective power in battle (a combat
 *                multiplier composed alongside the research combatAttack techs).
 *   - 'economy': boosts passive resource production (an economy multiplier
 *                composed alongside the research production techs).
 *
 * A hero's bonus scales with LEVEL and STARS. Every hero starts at level 1 with
 * 0 stars. The bonus is expressed as a MULTIPLIER derived from a flat base plus
 * a per-level and a per-star increment:
 *
 *   multiplier = 1 + baseBonus + perLevelBonus * (level - 1) + perStarBonus * stars
 *
 * so a fresh level-1, 0-star hero already grants `1 + baseBonus`, and each level
 * or star adds a further increment. The math lives entirely in {@link heroBonusAt}
 * / {@link heroMultiplierAt} so the runtime and the tests agree.
 *
 * All names and art are ORIGINAL to this project (see assets/CREDITS.md); no
 * Kingshot (or other) proprietary names/story/art are used.
 */

import type { ResourceCost } from '../types';

/** The domain a hero's bonus applies to. */
export type HeroRole = 'war' | 'economy';

/** The identifiers of every recruitable hero. */
export type HeroId =
  // War heroes.
  | 'ser_alden' // steadfast knight-commander
  | 'kara_stormblade' // ferocious cavalry captain
  // Economy heroes.
  | 'mira_goldhand' // shrewd guildmistress
  | 'old_bram'; // patient master farmer

/** Static definition of a single hero. */
export interface HeroDef {
  id: HeroId;
  role: HeroRole;
  /** Resource cost charged up front to recruit the hero. */
  recruitCost: ResourceCost;
  /**
   * Flat base bonus of a fresh level-1, 0-star hero (added to 1). e.g. 0.1 =>
   * a fresh hero grants a 1.10x multiplier in its domain.
   */
  baseBonus: number;
  /** Additional bonus added per level ABOVE level 1. */
  perLevelBonus: number;
  /** Additional bonus added per star. */
  perStarBonus: number;
  /** Maximum hero level (levels 1..maxLevel). */
  maxLevel: number;
  /** Maximum number of stars (0..starMax). */
  starMax: number;
  /**
   * Base resource cost to level up from level 1 to level 2. The cost of the
   * next level scales with the current level (see {@link heroLevelUpCost}).
   */
  levelUpBaseCost: ResourceCost;
  /** Hero shards required to gain each star (a star-up spends this many). */
  shardsPerStar: number;
}

/**
 * The hero roster. Two war heroes and two economy heroes, so the role-gated
 * bonus getters and the UI both exercise each domain. Kept compact but with
 * distinct tuning so recruiting/leveling/starring genuinely change outcomes.
 */
export const HERO_DEFS: Record<HeroId, HeroDef> = {
  // --- War ------------------------------------------------------------------
  ser_alden: {
    id: 'ser_alden',
    role: 'war',
    recruitCost: { gold: 200, food: 120 },
    baseBonus: 0.12,
    perLevelBonus: 0.04,
    perStarBonus: 0.06,
    maxLevel: 10,
    starMax: 5,
    levelUpBaseCost: { gold: 60, food: 40 },
    shardsPerStar: 10,
  },
  kara_stormblade: {
    id: 'kara_stormblade',
    role: 'war',
    recruitCost: { gold: 320, wood: 160 },
    baseBonus: 0.15,
    perLevelBonus: 0.05,
    perStarBonus: 0.07,
    maxLevel: 10,
    starMax: 5,
    levelUpBaseCost: { gold: 80, wood: 50 },
    shardsPerStar: 12,
  },

  // --- Economy --------------------------------------------------------------
  mira_goldhand: {
    id: 'mira_goldhand',
    role: 'economy',
    recruitCost: { gold: 240, stone: 120 },
    baseBonus: 0.12,
    perLevelBonus: 0.04,
    perStarBonus: 0.06,
    maxLevel: 10,
    starMax: 5,
    levelUpBaseCost: { gold: 50, stone: 40 },
    shardsPerStar: 10,
  },
  old_bram: {
    id: 'old_bram',
    role: 'economy',
    recruitCost: { food: 300, wood: 150 },
    baseBonus: 0.1,
    perLevelBonus: 0.035,
    perStarBonus: 0.05,
    maxLevel: 10,
    starMax: 5,
    levelUpBaseCost: { food: 60, wood: 40 },
    shardsPerStar: 8,
  },
};

/** All hero ids in a stable display/iteration order, war heroes first. */
export const HERO_ORDER: readonly HeroId[] = [
  'ser_alden',
  'kara_stormblade',
  'mira_goldhand',
  'old_bram',
] as const;

/** The roles in display order. */
export const HERO_ROLES: readonly HeroRole[] = ['war', 'economy'] as const;

/** Lookup a hero definition (never undefined for a valid id). */
export function heroDef(id: HeroId): HeroDef {
  return HERO_DEFS[id];
}

/** True when `id` is a known hero id. */
export function isHeroId(id: string): id is HeroId {
  return Object.prototype.hasOwnProperty.call(HERO_DEFS, id);
}

/** All hero ids belonging to a role, in HERO_ORDER order. */
export function heroesInRole(role: HeroRole): HeroId[] {
  return HERO_ORDER.filter((id) => HERO_DEFS[id].role === role);
}

/**
 * The additive bonus of a hero at a given level/stars, BEFORE the leading 1 is
 * applied. Pure and monotonic in both level and stars. Clamped to the hero's
 * level/star bounds so out-of-range inputs never over-credit.
 */
export function heroBonusAt(id: HeroId, level: number, stars: number): number {
  const def = HERO_DEFS[id];
  const lvl = clampInt(level, 1, def.maxLevel);
  const st = clampInt(stars, 0, def.starMax);
  return def.baseBonus + def.perLevelBonus * (lvl - 1) + def.perStarBonus * st;
}

/**
 * The full multiplier (>= 1) a hero grants at a given level/stars in its
 * domain: `1 + heroBonusAt(...)`. This is exactly what HeroSystem exposes as the
 * combat / economy multiplier when the hero is active.
 */
export function heroMultiplierAt(id: HeroId, level: number, stars: number): number {
  return 1 + heroBonusAt(id, level, stars);
}

/**
 * Resource cost to level a hero up FROM `currentLevel` to `currentLevel + 1`.
 * Scales the hero's base level-up cost linearly with the current level so later
 * levels cost more. Returns an empty bundle when already at the level cap.
 */
export function heroLevelUpCost(id: HeroId, currentLevel: number): ResourceCost {
  const def = HERO_DEFS[id];
  if (currentLevel >= def.maxLevel) return {};
  const scale = currentLevel; // level 1->2 costs 1x base, 2->3 costs 2x, ...
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(def.levelUpBaseCost) as [
    keyof ResourceCost,
    number,
  ][]) {
    out[res] = Math.round(amount * scale);
  }
  return out;
}

/** Clamp `n` to the inclusive integer range [lo, hi]. */
function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : lo);
  return Math.max(lo, Math.min(hi, v));
}
