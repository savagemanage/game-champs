/**
 * StatModifiers - the ONE shared stat-modifier bundle + its pure combiner.
 *
 * Every progression source in Frosthold: Last Ember expresses its permanent
 * bonuses as a {@link StatModifiers} bundle (all values ADDITIVE FRACTIONS,
 * 0.10 = +10%, unless the field name says `Flat`). The research tech tree
 * (ResearchSystem), chief gear + charms (GearSystem) and the lead heroes
 * (HeroRoster, adapted here) all contribute a bundle; {@link combineModifiers}
 * sums them key-wise into a single bundle that GameState consumes so economy
 * mods scale idle output and battle mods scale combat power.
 *
 * This module is PURE data + formulas (no Phaser, no systems import) so config,
 * systems and tests can share the exact same combiner and derived helpers.
 */

import type { StatModifiers, TroopClass } from '../types';

/** Every key of the {@link StatModifiers} bundle, so the combiner is exhaustive. */
export const STAT_MODIFIER_KEYS = [
  'economyOutput',
  'foodOutput',
  'woodOutput',
  'coalOutput',
  'ironOutput',
  'steelOutput',
  'buildSpeed',
  'troopAttack',
  'troopHp',
  'troopDefense',
  'infantryBonus',
  'lancerBonus',
  'marksmanBonus',
] as const;

/** A fresh, all-zero {@link StatModifiers} bundle (the additive identity). */
export function emptyModifiers(): StatModifiers {
  return {
    economyOutput: 0,
    foodOutput: 0,
    woodOutput: 0,
    coalOutput: 0,
    ironOutput: 0,
    steelOutput: 0,
    buildSpeed: 0,
    troopAttack: 0,
    troopHp: 0,
    troopDefense: 0,
    infantryBonus: 0,
    lancerBonus: 0,
    marksmanBonus: 0,
  };
}

/**
 * Sum any number of partial modifier bundles key-wise into one full bundle.
 * Bonuses are ADDITIVE (a +10% research bonus and a +5% gear bonus stack to
 * +15%), matching the genre's additive stat sheet. Missing keys count as 0, so
 * every source only needs to fill the fields it actually affects. Pure.
 */
export function combineModifiers(
  ...sources: (Partial<StatModifiers> | undefined | null)[]
): StatModifiers {
  const out = emptyModifiers();
  for (const src of sources) {
    if (!src) continue;
    for (const key of STAT_MODIFIER_KEYS) {
      const v = src[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] += v;
    }
  }
  return out;
}

/**
 * The overall production multiplier a resource of kind `res` enjoys from the
 * combined economy modifiers: 1 + economyOutput (all producers) + the
 * resource-specific bonus. Never below 0. Pure; GameState multiplies its idle
 * output by this per resource.
 */
export function economyMultiplierFor(
  mods: StatModifiers,
  res: 'food' | 'wood' | 'coal' | 'iron' | 'steel',
): number {
  const specific =
    res === 'food'
      ? mods.foodOutput
      : res === 'wood'
        ? mods.woodOutput
        : res === 'coal'
          ? mods.coalOutput
          : res === 'iron'
            ? mods.ironOutput
            : mods.steelOutput;
  return Math.max(0, 1 + mods.economyOutput + specific);
}

/**
 * The BUILD-SPEED multiplier from `buildSpeed` (a reduction fraction): a
 * buildSpeed of 0.20 means builds take 1 / 1.20 of the base time. Clamped so
 * builds never become instant or negative. Pure.
 */
export function buildTimeMultiplier(mods: StatModifiers): number {
  const speed = Math.max(0, mods.buildSpeed);
  return 1 / (1 + speed);
}

/**
 * The combat-power multiplier the whole army enjoys from the army-wide battle
 * modifiers: 1 + a blend of attack / hp / defense bonuses. attack is weighted
 * most (it is the dominant power lever), hp / defense contribute half each.
 * Never below 0. Pure; the combat/campaign checks multiply raw army power by
 * this (alongside the per-class multiplier).
 */
export function armyBattleMultiplier(mods: StatModifiers): number {
  const power = mods.troopAttack + 0.5 * mods.troopHp + 0.5 * mods.troopDefense;
  return Math.max(0, 1 + power);
}

/**
 * The per-class combat multiplier: 1 + the class-specific bonus. Lets a source
 * buff one leg of the Infantry/Lancer/Marksman triangle. Never below 0. Pure.
 */
export function classBattleMultiplier(mods: StatModifiers, cls: TroopClass): number {
  const bonus =
    cls === 'infantry'
      ? mods.infantryBonus
      : cls === 'lancer'
        ? mods.lancerBonus
        : mods.marksmanBonus;
  return Math.max(0, 1 + bonus);
}
