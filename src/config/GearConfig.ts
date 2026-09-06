/**
 * GearConfig - the ORIGINAL chief-gear slots + charms + pure gear formulas.
 *
 * Frosthold: Last Ember's chief-gear layer is INSPIRED BY the genre's
 * chief-gear/charm system but every slot and charm name is ORIGINAL work (no
 * protected IP). Six equipment slots (Coat / Gloves / Boots / Belt / Helm /
 * Emblem) can be forged and upgraded with refined materials; each gear level
 * adds a typed bonus to the shared {@link StatModifiers} bundle. Each slot has
 * ONE charm socket; a socketed charm adds its own per-level bonus of one of the
 * three charm kinds (Warfare / Bulwark / Harvest).
 *
 * This module is PURE data + formula functions (no Phaser). GearSystem reads
 * these; user-facing names live in the i18n table keyed as `gear.slot.<slot>`
 * and `gear.charm.<kind>`.
 */

import { GEAR } from './GameConfig';
import type { CharmKind, GearSlot, ResourceCost, StatModifiers } from '../types';
import { CHARM_KIND_ORDER, GEAR_SLOT_ORDER } from '../types';

/** Static definition for one gear slot. */
export interface GearSlotDef {
  slot: GearSlot;
  /** Resource cost to forge the FIRST level (0 -> 1). Scales by GEAR_COST_GROWTH. */
  baseCost: ResourceCost;
  /** The per-LEVEL bonus this slot grants (multiplied by the current level). */
  bonusPerLevel: Partial<StatModifiers>;
}

/** Static definition for one charm kind. */
export interface CharmDef {
  kind: CharmKind;
  /** Resource cost to forge/level the FIRST charm level. Scales by CHARM_COST_GROWTH. */
  baseCost: ResourceCost;
  /** The per-LEVEL bonus this charm grants while socketed. */
  bonusPerLevel: Partial<StatModifiers>;
}

/**
 * The six chief-gear slots. Offensive pieces (coat/gloves/helm) lean into
 * troop attack + class bonuses; defensive pieces (boots/belt) into hp/defense;
 * the emblem is an economy/utility piece. Bonuses are small per level so a full
 * set is a meaningful but not dominant boost.
 */
export const GEAR_SLOT_DEFS: Record<GearSlot, GearSlotDef> = {
  coat: {
    slot: 'coat',
    baseCost: { iron: 120, steel: 20 },
    bonusPerLevel: { troopHp: 0.02, troopDefense: 0.02 },
  },
  gloves: {
    slot: 'gloves',
    baseCost: { iron: 120, steel: 20 },
    bonusPerLevel: { troopAttack: 0.03 },
  },
  boots: {
    slot: 'boots',
    baseCost: { iron: 100, steel: 15 },
    bonusPerLevel: { troopDefense: 0.02, lancerBonus: 0.02 },
  },
  belt: {
    slot: 'belt',
    baseCost: { iron: 100, steel: 15 },
    bonusPerLevel: { troopHp: 0.03, infantryBonus: 0.02 },
  },
  helm: {
    slot: 'helm',
    baseCost: { iron: 140, steel: 25 },
    bonusPerLevel: { troopAttack: 0.02, marksmanBonus: 0.02 },
  },
  emblem: {
    slot: 'emblem',
    baseCost: { steel: 40 },
    bonusPerLevel: { economyOutput: 0.02, buildSpeed: 0.02 },
  },
};

/**
 * The three charm kinds. Warfare boosts attack, Bulwark boosts survivability,
 * Harvest boosts economy. A charm socketed into any slot adds its bonus, so the
 * player specializes a set by choosing which charms to forge.
 */
export const CHARM_DEFS: Record<CharmKind, CharmDef> = {
  warfare: {
    kind: 'warfare',
    baseCost: { iron: 60, steel: 10 },
    bonusPerLevel: { troopAttack: 0.02 },
  },
  bulwark: {
    kind: 'bulwark',
    baseCost: { iron: 60, steel: 10 },
    bonusPerLevel: { troopHp: 0.02, troopDefense: 0.01 },
  },
  harvest: {
    kind: 'harvest',
    baseCost: { steel: 20 },
    bonusPerLevel: { economyOutput: 0.015 },
  },
};

/** All gear slots in canonical order (re-export for consumers). */
export const GEAR_SLOTS = GEAR_SLOT_ORDER;
/** All charm kinds in canonical order (re-export for consumers). */
export const CHARM_KINDS = CHARM_KIND_ORDER;

/** Lookup a gear slot definition. */
export function gearSlotDef(slot: GearSlot): GearSlotDef {
  return GEAR_SLOT_DEFS[slot];
}

/** Lookup a charm definition. */
export function charmDef(kind: CharmKind): CharmDef {
  return CHARM_DEFS[kind];
}

/**
 * Resource cost to take a gear slot from `level` to `level + 1`. Level 0 -> 1
 * (forging) costs the base; each further level multiplies the base components
 * by GEAR_COST_GROWTH^level and rounds up. Pure.
 */
export function gearUpgradeCost(slot: GearSlot, level: number): ResourceCost {
  const def = GEAR_SLOT_DEFS[slot];
  const factor = Math.pow(GEAR.GEAR_COST_GROWTH, Math.max(0, level));
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(def.baseCost) as [keyof ResourceCost, number][]) {
    out[res] = Math.ceil(amount * factor);
  }
  return out;
}

/**
 * Resource cost to take a charm from `level` to `level + 1` (level 0 = forge
 * the charm). Scales by CHARM_COST_GROWTH. Pure.
 */
export function charmUpgradeCost(kind: CharmKind, level: number): ResourceCost {
  const def = CHARM_DEFS[kind];
  const factor = Math.pow(GEAR.CHARM_COST_GROWTH, Math.max(0, level));
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(def.baseCost) as [keyof ResourceCost, number][]) {
    out[res] = Math.ceil(amount * factor);
  }
  return out;
}

/**
 * The bonus a gear slot at `level` contributes: its per-level bonus scaled by
 * the level (level 0 = nothing). Returns a partial {@link StatModifiers}. Pure.
 */
export function gearSlotBonus(slot: GearSlot, level: number): Partial<StatModifiers> {
  const lvl = Math.max(0, Math.floor(level));
  if (lvl <= 0) return {};
  return scaleBonus(GEAR_SLOT_DEFS[slot].bonusPerLevel, lvl);
}

/**
 * The bonus a charm of `kind` at `level` contributes: its per-level bonus
 * scaled by the level (level 0 = nothing). Pure.
 */
export function charmBonus(kind: CharmKind, level: number): Partial<StatModifiers> {
  const lvl = Math.max(0, Math.floor(level));
  if (lvl <= 0) return {};
  return scaleBonus(CHARM_DEFS[kind].bonusPerLevel, lvl);
}

/** Scale every field of a partial modifier bundle by `factor`. Pure. */
function scaleBonus(
  bonus: Partial<StatModifiers>,
  factor: number,
): Partial<StatModifiers> {
  const out: Partial<StatModifiers> = {};
  for (const [k, v] of Object.entries(bonus) as [keyof StatModifiers, number][]) {
    if (typeof v === 'number') out[k] = v * factor;
  }
  return out;
}
