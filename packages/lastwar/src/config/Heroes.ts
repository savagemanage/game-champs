/**
 * Heroes.ts - the ORIGINAL hero catalog for LAST SQUAD (라스트 스쿼드), FEAT-003.
 *
 * Every hero here is an original creation: original callsign-style names,
 * original one-line lore, and original skill names. Nothing is drawn from any
 * existing game, IP, or trademark - only the genre ROLES are shared. All names
 * and lore are routed through i18n keys ({@link STRINGS}) so both the KO-first
 * UI and tests read the same source of truth.
 *
 * The catalog spans the full design space so several distinct 5-hero squads can
 * be built:
 *  - 3 combat TYPES (tank / missile / aircraft) in a rock-paper-scissors triangle,
 *  - 3 ROLES (dealer / tank / support),
 *  - 3 GRADES (UR / SSR / SR).
 *
 * Fifteen heroes cover all 3 types x 3 roles (one per cell) plus six extras, so
 * a full same-type squad of 5 is possible for each type. This module is
 * Phaser-free `as const` design data; the pure {@link Heroes} progression math
 * folds a hero's grade + level + stars + skill into final stats.
 */

import type { HeroDef } from '../types';

/**
 * The immutable hero catalog. Base stats are the level-1 / 1-star / skill-1
 * values BEFORE the grade multiplier ({@link HEROES}.GRADES.statMult) is applied
 * by {@link deriveHeroStats}. Speed drives turn order in {@link Combat}.
 *
 * Naming convention: original callsigns (no real-person or existing-hero names).
 */
export const HERO_CATALOG = [
  // ---- Tank type -----------------------------------------------------------
  {
    id: 'ironward',
    nameKey: 'hero.ironward.name',
    loreKey: 'hero.ironward.lore',
    type: 'tank',
    role: 'tank',
    grade: 'UR',
    base: { hp: 1400, atk: 90, def: 120, speed: 42 },
    skills: [
      { id: 'bulwark', nameKey: 'skill.bulwark.name', descKey: 'skill.bulwark.desc', potency: 0.3 },
      { id: 'anchor', nameKey: 'skill.anchor.name', descKey: 'skill.anchor.desc', potency: 0.2 },
    ],
  },
  {
    id: 'granitehold',
    nameKey: 'hero.granitehold.name',
    loreKey: 'hero.granitehold.lore',
    type: 'tank',
    role: 'tank',
    grade: 'SR',
    base: { hp: 1200, atk: 70, def: 100, speed: 40 },
    skills: [
      { id: 'plating', nameKey: 'skill.plating.name', descKey: 'skill.plating.desc', potency: 0.25 },
    ],
  },
  {
    id: 'breachram',
    nameKey: 'hero.breachram.name',
    loreKey: 'hero.breachram.lore',
    type: 'tank',
    role: 'dealer',
    grade: 'SSR',
    base: { hp: 1050, atk: 150, def: 80, speed: 48 },
    skills: [
      { id: 'overrun', nameKey: 'skill.overrun.name', descKey: 'skill.overrun.desc', potency: 0.35 },
    ],
  },
  {
    id: 'aegismend',
    nameKey: 'hero.aegismend.name',
    loreKey: 'hero.aegismend.lore',
    type: 'tank',
    role: 'support',
    grade: 'SSR',
    base: { hp: 1000, atk: 95, def: 90, speed: 52 },
    skills: [
      { id: 'reinforce', nameKey: 'skill.reinforce.name', descKey: 'skill.reinforce.desc', potency: 0.3 },
    ],
  },
  {
    id: 'boulwark',
    nameKey: 'hero.boulwark.name',
    loreKey: 'hero.boulwark.lore',
    type: 'tank',
    role: 'dealer',
    grade: 'SR',
    base: { hp: 950, atk: 130, def: 70, speed: 46 },
    skills: [
      { id: 'smash', nameKey: 'skill.smash.name', descKey: 'skill.smash.desc', potency: 0.3 },
    ],
  },

  // ---- Missile type --------------------------------------------------------
  {
    id: 'stormvolley',
    nameKey: 'hero.stormvolley.name',
    loreKey: 'hero.stormvolley.lore',
    type: 'missile',
    role: 'dealer',
    grade: 'UR',
    base: { hp: 900, atk: 185, def: 55, speed: 70 },
    skills: [
      { id: 'saturation', nameKey: 'skill.saturation.name', descKey: 'skill.saturation.desc', potency: 0.4 },
      { id: 'lockon', nameKey: 'skill.lockon.name', descKey: 'skill.lockon.desc', potency: 0.25 },
    ],
  },
  {
    id: 'arcsalvo',
    nameKey: 'hero.arcsalvo.name',
    loreKey: 'hero.arcsalvo.lore',
    type: 'missile',
    role: 'dealer',
    grade: 'SSR',
    base: { hp: 820, atk: 165, def: 50, speed: 66 },
    skills: [
      { id: 'barrage', nameKey: 'skill.barrage.name', descKey: 'skill.barrage.desc', potency: 0.35 },
    ],
  },
  {
    id: 'flakscreen',
    nameKey: 'hero.flakscreen.name',
    loreKey: 'hero.flakscreen.lore',
    type: 'missile',
    role: 'tank',
    grade: 'SR',
    base: { hp: 1150, atk: 85, def: 95, speed: 44 },
    skills: [
      { id: 'flakwall', nameKey: 'skill.flakwall.name', descKey: 'skill.flakwall.desc', potency: 0.25 },
    ],
  },
  {
    id: 'relayping',
    nameKey: 'hero.relayping.name',
    loreKey: 'hero.relayping.lore',
    type: 'missile',
    role: 'support',
    grade: 'SSR',
    base: { hp: 880, atk: 100, def: 60, speed: 74 },
    skills: [
      { id: 'triage', nameKey: 'skill.triage.name', descKey: 'skill.triage.desc', potency: 0.32 },
    ],
  },
  {
    id: 'sparkrocket',
    nameKey: 'hero.sparkrocket.name',
    loreKey: 'hero.sparkrocket.lore',
    type: 'missile',
    role: 'support',
    grade: 'SR',
    base: { hp: 800, atk: 90, def: 55, speed: 68 },
    skills: [
      { id: 'resupply', nameKey: 'skill.resupply.name', descKey: 'skill.resupply.desc', potency: 0.28 },
    ],
  },

  // ---- Aircraft type -------------------------------------------------------
  {
    id: 'skytalon',
    nameKey: 'hero.skytalon.name',
    loreKey: 'hero.skytalon.lore',
    type: 'aircraft',
    role: 'dealer',
    grade: 'UR',
    base: { hp: 950, atk: 175, def: 60, speed: 82 },
    skills: [
      { id: 'divebomb', nameKey: 'skill.divebomb.name', descKey: 'skill.divebomb.desc', potency: 0.4 },
      { id: 'afterburn', nameKey: 'skill.afterburn.name', descKey: 'skill.afterburn.desc', potency: 0.25 },
    ],
  },
  {
    id: 'gustrunner',
    nameKey: 'hero.gustrunner.name',
    loreKey: 'hero.gustrunner.lore',
    type: 'aircraft',
    role: 'dealer',
    grade: 'SR',
    base: { hp: 820, atk: 150, def: 45, speed: 78 },
    skills: [
      { id: 'strafe', nameKey: 'skill.strafe.name', descKey: 'skill.strafe.desc', potency: 0.3 },
    ],
  },
  {
    id: 'bastionwing',
    nameKey: 'hero.bastionwing.name',
    loreKey: 'hero.bastionwing.lore',
    type: 'aircraft',
    role: 'tank',
    grade: 'SSR',
    base: { hp: 1250, atk: 90, def: 105, speed: 56 },
    skills: [
      { id: 'hover', nameKey: 'skill.hover.name', descKey: 'skill.hover.desc', potency: 0.28 },
    ],
  },
  {
    id: 'medevac',
    nameKey: 'hero.medevac.name',
    loreKey: 'hero.medevac.lore',
    type: 'aircraft',
    role: 'support',
    grade: 'UR',
    base: { hp: 1000, atk: 110, def: 70, speed: 76 },
    skills: [
      { id: 'airlift', nameKey: 'skill.airlift.name', descKey: 'skill.airlift.desc', potency: 0.42 },
      { id: 'beacon', nameKey: 'skill.beacon.name', descKey: 'skill.beacon.desc', potency: 0.24 },
    ],
  },
  {
    id: 'zephyrguard',
    nameKey: 'hero.zephyrguard.name',
    loreKey: 'hero.zephyrguard.lore',
    type: 'aircraft',
    role: 'support',
    grade: 'SR',
    base: { hp: 860, atk: 95, def: 60, speed: 72 },
    skills: [
      { id: 'tailwind', nameKey: 'skill.tailwind.name', descKey: 'skill.tailwind.desc', potency: 0.26 },
    ],
  },
] as const satisfies readonly HeroDef[];

/** Ordered tuple of catalog hero ids (canonical iteration order). */
export const HERO_ORDER = HERO_CATALOG.map((h) => h.id);

/** Every catalog hero id as a string-literal union. */
export type CatalogHeroId = (typeof HERO_CATALOG)[number]['id'];

/** Fast id -> definition lookup built once from the catalog. */
const CATALOG_BY_ID: Record<string, HeroDef> = Object.fromEntries(
  HERO_CATALOG.map((h) => [h.id, h as HeroDef]),
);

/** Look up a catalog hero definition by id (undefined if unknown). */
export function heroDef(id: string): HeroDef | undefined {
  return CATALOG_BY_ID[id];
}

/** All catalog hero ids of a given grade (used by the recruit grade buckets). */
export function heroesOfGrade(grade: HeroDef['grade']): string[] {
  return HERO_CATALOG.filter((h) => h.grade === grade).map((h) => h.id);
}
