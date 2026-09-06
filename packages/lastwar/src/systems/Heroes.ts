/**
 * Heroes.ts - pure hero-instance state + progression math (FEAT-003).
 *
 * A hero has immutable catalog design data ({@link HeroDef} in
 * src/config/Heroes.ts) and mutable progression ({@link HeroInstance}: level,
 * stars, skill level, duplicate count). This module owns the pure math that
 * folds those together into final combat stats and the cost curves for raising
 * each progression track. Everything is Phaser-free and deterministic; all
 * tuning comes from {@link HEROES} in GameConfig.
 *
 * FINAL STAT FORMULA (deriveHeroStats):
 *   base   = catalog.base[stat] * grade.statMult
 *   scale  = 1 + LEVEL_STAT_GROWTH * (level - 1)          // level growth
 *          + STAR_STAT_BONUS * (stars - 1)                // star growth
 *          + SKILL_STAT_BONUS_PER_LEVEL * (skillLevel-1)  // skill growth
 *   final  = round(base * scale)
 * so a higher grade, level, star, or skill always yields >= stats.
 */

import { HEROES } from '../config/GameConfig';
import { heroDef } from '../config/Heroes';
import type { HeroGrade, HeroInstance, HeroStats } from '../types';

/** The stat keys, for iteration. */
const STAT_KEYS = ['hp', 'atk', 'def', 'speed'] as const;

/** Create a fresh level-1 / start-star / start-skill instance of a catalog hero. */
export function makeHeroInstance(id: string): HeroInstance {
  return {
    id,
    level: 1,
    stars: HEROES.START_STARS,
    skillLevel: HEROES.START_SKILL_LEVEL,
    dupes: 0,
  };
}

/** The grade tuning for a grade id. */
export function gradeTuning(grade: HeroGrade): (typeof HEROES.GRADES)[HeroGrade] {
  return HEROES.GRADES[grade];
}

/** The absolute max level a hero of the given grade can reach. */
export function maxLevel(grade: HeroGrade): number {
  return HEROES.GRADES[grade].maxLevel;
}

/** The absolute max stars a hero of the given grade can reach. */
export function maxStars(grade: HeroGrade): number {
  return HEROES.GRADES[grade].maxStars;
}

/**
 * The combined scaling factor from level + stars + skill for an instance. This
 * is the multiplier applied on top of the grade-scaled base stats. Monotonic in
 * every track (raising any track raises the factor).
 */
export function progressionScale(instance: HeroInstance): number {
  const level = Math.max(1, Math.floor(instance.level));
  const stars = Math.max(1, Math.floor(instance.stars));
  const skill = Math.max(1, Math.floor(instance.skillLevel));
  return (
    1 +
    HEROES.LEVEL_STAT_GROWTH * (level - 1) +
    HEROES.STAR_STAT_BONUS * (stars - 1) +
    HEROES.SKILL_STAT_BONUS_PER_LEVEL * (skill - 1)
  );
}

/**
 * Fold a hero's grade base stats + level + stars + skill into final HP/ATK/DEF/
 * speed. Returns zeroed stats for an unknown hero id so callers never crash.
 */
export function deriveHeroStats(instance: HeroInstance): HeroStats {
  const def = heroDef(instance.id);
  if (!def) return { hp: 0, atk: 0, def: 0, speed: 0 };
  const gradeMult = HEROES.GRADES[def.grade].statMult;
  const scale = progressionScale(instance);
  const out = {} as HeroStats;
  for (const stat of STAT_KEYS) {
    out[stat] = Math.round(def.base[stat] * gradeMult * scale);
  }
  return out;
}

/**
 * Shard cost to level a hero FROM its current level to the next:
 * `round(LEVEL_COST_BASE * LEVEL_COST_GROWTH^(level-1))`. Returns Infinity at
 * the grade's max level. Monotonically increasing in level.
 */
export function levelUpCost(instance: HeroInstance): number {
  const def = heroDef(instance.id);
  if (!def) return Infinity;
  const level = Math.max(1, Math.floor(instance.level));
  if (level >= maxLevel(def.grade)) return Infinity;
  return Math.round(HEROES.LEVEL_COST_BASE * Math.pow(HEROES.LEVEL_COST_GROWTH, level - 1));
}

/**
 * Shard cost to raise a hero FROM its current star-tier to the next:
 * `round(STAR_COST_BASE * STAR_COST_GROWTH^(stars-1))`. Returns Infinity at the
 * grade's max stars. Monotonically increasing in stars.
 */
export function starUpCost(instance: HeroInstance): number {
  const def = heroDef(instance.id);
  if (!def) return Infinity;
  const stars = Math.max(1, Math.floor(instance.stars));
  if (stars >= maxStars(def.grade)) return Infinity;
  return Math.round(HEROES.STAR_COST_BASE * Math.pow(HEROES.STAR_COST_GROWTH, stars - 1));
}

/**
 * Shard cost to raise a hero's skill level FROM its current level to the next:
 * `round(SKILL_COST_BASE * SKILL_COST_GROWTH^(skillLevel-1))`. Returns Infinity
 * at {@link HEROES.MAX_SKILL_LEVEL}. Monotonically increasing.
 */
export function skillUpCost(instance: HeroInstance): number {
  const skill = Math.max(1, Math.floor(instance.skillLevel));
  if (skill >= HEROES.MAX_SKILL_LEVEL) return Infinity;
  return Math.round(HEROES.SKILL_COST_BASE * Math.pow(HEROES.SKILL_COST_GROWTH, skill - 1));
}

/**
 * The effective potency of a skill at the instance's current skill level:
 * `basePotency + SKILL_POTENCY_PER_LEVEL * (skillLevel - 1)`. Used by the combat
 * resolver to scale skill effects.
 */
export function skillPotency(basePotency: number, skillLevel: number): number {
  const level = Math.max(1, Math.floor(skillLevel));
  return basePotency + HEROES.SKILL_POTENCY_PER_LEVEL * (level - 1);
}

/** The result of a progression attempt. */
export interface ProgressResult {
  /** Whether the progression happened (affordable + not capped). */
  ok: boolean;
  /** New instance (unchanged on failure). */
  instance: HeroInstance;
  /** Shards remaining after the spend (unchanged on failure). */
  shards: number;
}

/** Generic "spend shards to bump one track" helper. */
function applyProgress(
  instance: HeroInstance,
  shards: number,
  cost: number,
  bump: (i: HeroInstance) => HeroInstance,
): ProgressResult {
  if (!Number.isFinite(cost) || shards < cost) {
    return { ok: false, instance, shards };
  }
  return { ok: true, instance: bump(instance), shards: shards - cost };
}

/** Spend shards to level up a hero by one (pure; returns a new instance). */
export function levelUp(instance: HeroInstance, shards: number): ProgressResult {
  return applyProgress(instance, shards, levelUpCost(instance), (i) => ({
    ...i,
    level: i.level + 1,
  }));
}

/** Spend shards to raise a hero's star-tier by one (pure). */
export function starUp(instance: HeroInstance, shards: number): ProgressResult {
  return applyProgress(instance, shards, starUpCost(instance), (i) => ({
    ...i,
    stars: i.stars + 1,
  }));
}

/** Spend shards to raise a hero's skill level by one (pure). */
export function skillUp(instance: HeroInstance, shards: number): ProgressResult {
  return applyProgress(instance, shards, skillUpCost(instance), (i) => ({
    ...i,
    skillLevel: i.skillLevel + 1,
  }));
}
