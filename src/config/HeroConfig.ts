/**
 * HeroConfig - the ORIGINAL collectible-hero roster + pure hero formulas.
 *
 * Frosthold: Last Ember's hero layer is INSPIRED BY the frozen-survival genre
 * but every name, class flavour and skill here is ORIGINAL work (no protected
 * IP). Twelve heroes span the four rarity tiers and all three classes
 * (infantry / lancer / marksman). Each hero carries a base power, an aggregate
 * ARMY or ECONOMY bonus (applied while it is a lead hero), and 1-3 skills that
 * unlock with stars.
 *
 * This module is PURE data + formula functions (no Phaser). The HeroRoster /
 * SummonSystem read these; user-facing names/descriptions/skills live in the
 * i18n table keyed as `hero.<id>.name` / `.desc` and `hero.skill.<skillId>`.
 */

import { HEROES } from './GameConfig';
import type { HeroClass, HeroId, HeroRarity } from '../types';
import { HERO_RARITY_ORDER } from '../types';

/**
 * The kind of aggregate bonus a hero grants while leading. `army` scales combat
 * power (a fraction added to the effective army power); `economy` scales idle
 * producer output (a fraction added to the production multiplier). Every hero
 * grants exactly one so the roster reads clearly.
 */
export type HeroBonusKind = 'army' | 'economy';

/** A hero's lead bonus: a base fraction (at level 1 / 1 star) of a given kind. */
export interface HeroBonus {
  kind: HeroBonusKind;
  /** Base bonus fraction at the hero's minimum development (e.g. 0.05 = +5%). */
  base: number;
}

/** A hero skill definition. The id keys the i18n `hero.skill.<id>` strings. */
export interface HeroSkillDef {
  id: string;
  /**
   * Per-level magnitude of the skill (semantics are class/skill specific; the
   * roster's power/bonus math multiplies the lead bonus by (1 + sum of unlocked
   * skill magnitudes * skillLevel)). Kept small so skills tune, not dominate.
   */
  magnitudePerLevel: number;
}

/** A static hero definition. */
export interface HeroDef {
  id: HeroId;
  rarity: HeroRarity;
  heroClass: HeroClass;
  /** Base power at level 1 / 1 star (before level/star scaling). */
  basePower: number;
  /** The aggregate lead bonus this hero grants. */
  bonus: HeroBonus;
  /** 1-3 skills; skill i unlocks at star (i+1). */
  skills: HeroSkillDef[];
}

/** Per-rarity ceilings/scales shared by every hero of that rarity. */
export interface RarityDef {
  /** Maximum star rank a hero of this rarity can reach. */
  maxStars: number;
  /** Multiplier on shard costs (rarer heroes cost more shards to star up). */
  shardScale: number;
}

/** Rarity ceilings/scales (low -> high). */
export const HERO_RARITY_DEFS: Record<HeroRarity, RarityDef> = {
  common: { maxStars: 3, shardScale: 1 },
  rare: { maxStars: 4, shardScale: 1.5 },
  epic: { maxStars: 5, shardScale: 2 },
  legendary: { maxStars: 6, shardScale: 3 },
};

/**
 * The original hero roster. Base powers rise with rarity; bonuses and classes
 * are spread so every rarity/class combination is represented across the tiers.
 */
export const HERO_DEFS: Record<HeroId, HeroDef> = {
  // --- Common (starter) ---
  ember_warden: {
    id: 'ember_warden',
    rarity: 'common',
    heroClass: 'infantry',
    basePower: 100,
    bonus: { kind: 'army', base: 0.03 },
    skills: [{ id: 'ember_warden_guard', magnitudePerLevel: 0.02 }],
  },
  snow_picket: {
    id: 'snow_picket',
    rarity: 'common',
    heroClass: 'marksman',
    basePower: 100,
    bonus: { kind: 'economy', base: 0.03 },
    skills: [{ id: 'snow_picket_scout', magnitudePerLevel: 0.02 }],
  },
  drift_runner: {
    id: 'drift_runner',
    rarity: 'common',
    heroClass: 'lancer',
    basePower: 100,
    bonus: { kind: 'army', base: 0.03 },
    skills: [{ id: 'drift_runner_charge', magnitudePerLevel: 0.02 }],
  },

  // --- Rare ---
  iron_bulwark: {
    id: 'iron_bulwark',
    rarity: 'rare',
    heroClass: 'infantry',
    basePower: 160,
    bonus: { kind: 'army', base: 0.05 },
    skills: [
      { id: 'iron_bulwark_wall', magnitudePerLevel: 0.03 },
      { id: 'iron_bulwark_rally', magnitudePerLevel: 0.02 },
    ],
  },
  glacier_lance: {
    id: 'glacier_lance',
    rarity: 'rare',
    heroClass: 'lancer',
    basePower: 160,
    bonus: { kind: 'army', base: 0.05 },
    skills: [
      { id: 'glacier_lance_pierce', magnitudePerLevel: 0.03 },
      { id: 'glacier_lance_momentum', magnitudePerLevel: 0.02 },
    ],
  },
  frost_archer: {
    id: 'frost_archer',
    rarity: 'rare',
    heroClass: 'marksman',
    basePower: 160,
    bonus: { kind: 'economy', base: 0.05 },
    skills: [
      { id: 'frost_archer_volley', magnitudePerLevel: 0.03 },
      { id: 'frost_archer_forage', magnitudePerLevel: 0.02 },
    ],
  },

  // --- Epic ---
  aurora_sentinel: {
    id: 'aurora_sentinel',
    rarity: 'epic',
    heroClass: 'infantry',
    basePower: 240,
    bonus: { kind: 'army', base: 0.08 },
    skills: [
      { id: 'aurora_sentinel_aegis', magnitudePerLevel: 0.04 },
      { id: 'aurora_sentinel_beacon', magnitudePerLevel: 0.03 },
      { id: 'aurora_sentinel_resolve', magnitudePerLevel: 0.02 },
    ],
  },
  stormpike_rider: {
    id: 'stormpike_rider',
    rarity: 'epic',
    heroClass: 'lancer',
    basePower: 240,
    bonus: { kind: 'army', base: 0.08 },
    skills: [
      { id: 'stormpike_rider_lightning', magnitudePerLevel: 0.04 },
      { id: 'stormpike_rider_gallop', magnitudePerLevel: 0.03 },
      { id: 'stormpike_rider_thunder', magnitudePerLevel: 0.02 },
    ],
  },
  winters_eye: {
    id: 'winters_eye',
    rarity: 'epic',
    heroClass: 'marksman',
    basePower: 240,
    bonus: { kind: 'economy', base: 0.08 },
    skills: [
      { id: 'winters_eye_mark', magnitudePerLevel: 0.04 },
      { id: 'winters_eye_harvest', magnitudePerLevel: 0.03 },
      { id: 'winters_eye_stockpile', magnitudePerLevel: 0.02 },
    ],
  },

  // --- Legendary ---
  the_kindled_queen: {
    id: 'the_kindled_queen',
    rarity: 'legendary',
    heroClass: 'infantry',
    basePower: 360,
    bonus: { kind: 'army', base: 0.12 },
    skills: [
      { id: 'the_kindled_queen_crown', magnitudePerLevel: 0.05 },
      { id: 'the_kindled_queen_edict', magnitudePerLevel: 0.04 },
      { id: 'the_kindled_queen_ember', magnitudePerLevel: 0.03 },
    ],
  },
  wyrmspear_valdis: {
    id: 'wyrmspear_valdis',
    rarity: 'legendary',
    heroClass: 'lancer',
    basePower: 360,
    bonus: { kind: 'army', base: 0.12 },
    skills: [
      { id: 'wyrmspear_valdis_impale', magnitudePerLevel: 0.05 },
      { id: 'wyrmspear_valdis_dragoon', magnitudePerLevel: 0.04 },
      { id: 'wyrmspear_valdis_onslaught', magnitudePerLevel: 0.03 },
    ],
  },
  the_pale_marksman: {
    id: 'the_pale_marksman',
    rarity: 'legendary',
    heroClass: 'marksman',
    basePower: 360,
    bonus: { kind: 'economy', base: 0.12 },
    skills: [
      { id: 'the_pale_marksman_deadeye', magnitudePerLevel: 0.05 },
      { id: 'the_pale_marksman_bounty', magnitudePerLevel: 0.04 },
      { id: 'the_pale_marksman_reserve', magnitudePerLevel: 0.03 },
    ],
  },
};

/** Lookup a hero definition. */
export function heroDef(id: HeroId): HeroDef {
  return HERO_DEFS[id];
}

/** All hero ids of a given rarity (stable order from HERO_DEFS insertion). */
export function heroesOfRarity(rarity: HeroRarity): HeroId[] {
  return (Object.keys(HERO_DEFS) as HeroId[]).filter((id) => HERO_DEFS[id].rarity === rarity);
}

/** The maximum star rank a hero can reach (from its rarity). */
export function maxStars(id: HeroId): number {
  return HERO_RARITY_DEFS[HERO_DEFS[id].rarity].maxStars;
}

/**
 * The level ceiling for a hero at a given star rank: LEVEL_CAP_PER_STAR * stars,
 * clamped to MAX_LEVEL. A 1-star hero can only reach the first tier of levels;
 * starring up unlocks more.
 */
export function levelCapForStars(stars: number): number {
  const s = Math.max(1, Math.floor(stars));
  return Math.min(HEROES.MAX_LEVEL, HEROES.LEVEL_CAP_PER_STAR * s);
}

/**
 * XP required to go from `level` to `level + 1`: BASE_LEVEL_XP *
 * LEVEL_XP_GROWTH^(level-1), rounded. Pure and monotonic.
 */
export function xpToNextLevel(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return Math.round(HEROES.BASE_LEVEL_XP * Math.pow(HEROES.LEVEL_XP_GROWTH, lvl - 1));
}

/**
 * Shards required to raise a hero from star `stars` to `stars + 1`:
 * BASE_STAR_SHARDS * STAR_SHARD_GROWTH^(stars-1) * rarity.shardScale, rounded.
 * Also used (at stars = 0) as the cost to CRAFT the first copy from loose
 * shards. Pure and monotonic.
 */
export function shardsForStar(id: HeroId, stars: number): number {
  const s = Math.max(0, Math.floor(stars));
  const scale = HERO_RARITY_DEFS[HERO_DEFS[id].rarity].shardScale;
  return Math.round(
    HEROES.BASE_STAR_SHARDS * Math.pow(HEROES.STAR_SHARD_GROWTH, s) * scale,
  );
}

/** Shards to CRAFT a hero's first copy from loose shards (the star-0 cost). */
export function shardsToOwn(id: HeroId): number {
  const scale = HERO_RARITY_DEFS[HERO_DEFS[id].rarity].shardScale;
  return Math.round(HEROES.BASE_STAR_SHARDS * scale);
}

/**
 * A hero's power at a given level + stars, from its base power scaled by the
 * shared level/star growth: base * (1 + POWER_PER_LEVEL*(level-1)) *
 * (1 + POWER_PER_STAR*(stars-1)). Pure and monotonic in both.
 */
export function heroPower(id: HeroId, level: number, stars: number): number {
  const def = HERO_DEFS[id];
  const lvl = Math.max(1, Math.floor(level));
  const s = Math.max(1, Math.floor(stars));
  const levelFactor = 1 + HEROES.POWER_PER_LEVEL * (lvl - 1);
  const starFactor = 1 + HEROES.POWER_PER_STAR * (s - 1);
  return def.basePower * levelFactor * starFactor;
}

/**
 * How many of a hero's skills are unlocked at a given star rank: skill i
 * unlocks at star (i+1), so `stars` skills are unlocked (capped at the hero's
 * skill count). Pure.
 */
export function unlockedSkillCount(id: HeroId, stars: number): number {
  return Math.min(HERO_DEFS[id].skills.length, Math.max(0, Math.floor(stars)));
}

/** Guard the rarity order is what the systems expect (kept exported for tests). */
export const RARITY_ORDER = HERO_RARITY_ORDER;
