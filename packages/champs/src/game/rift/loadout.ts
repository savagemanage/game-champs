/**
 * Champion loadout math: combine a champion's base stats, per-level growth,
 * purchased item modifiers, and team-wide objective modifiers into a single
 * effective stat block the battle scene applies to a player/AI Unit.
 *
 * This module contains NO Phaser (or any DOM) imports so it can be exhaustively
 * unit tested in a plain jsdom/node environment. It draws leveling from
 * `./economy`, team boosts from `./objectives`, and item data from
 * `../../data/items`.
 */

import { type Champion, type ChampionRole } from '../../data/champions';
import { statsForLevel } from './economy';
import { type TeamModifiers, zeroModifiers } from './objectives';
import {
  type Item,
  type ItemArchetype,
  ITEMS,
  getItemById,
  missingRecipeComponents,
  remainingBuildCost,
  totalModifiers,
} from '../../data/items';

/**
 * The fully resolved combat stats for a champion at a point in a match, after
 * folding in level, items, and team objectives. Units match
 * {@link Champion.stats}, plus derived fields items/objectives contribute.
 */
export interface EffectiveStats {
  hp: number;
  hpRegen: number;
  moveSpeed: number;
  attackDamage: number;
  attackRange: number;
  attackSpeed: number;
  /** Armor: grows with level and is boosted by items and team modifiers. */
  armor: number;
  /** Ability power from items and team-wide ability modifiers. */
  abilityPower: number;
  /** Bonus resource (mana/energy) pool granted purely by items. */
  resource: number;
  /** Cooldown reduction fraction from items (0..~0.5). */
  cooldownReduction: number;
}

/** A champion's base armor at level 1 before growth/items (kept modest). */
export const BASE_ARMOR = 28;

/**
 * Compute a champion's effective stats from base + per-level growth + owned
 * item modifiers + team objective modifiers.
 *
 * Leveling uses the linear {@link statsForLevel} curve (value equals base at
 * level 1). Team modifiers add flat attack damage / armor / ability, plus a
 * fractional `healthPercent` bonus applied to the post-item max health.
 */
export function computeEffectiveStats(
  champion: Champion,
  level: number,
  ownedItemIds: readonly string[] = [],
  teamModifiers: TeamModifiers = zeroModifiers(),
): EffectiveStats {
  const { stats, growth } = champion;
  const items = totalModifiers(ownedItemIds);

  // Base + per-level growth.
  const leveledHp = statsForLevel(stats.hp, growth.hpPerLevel, level);
  const leveledHpRegen = statsForLevel(stats.hpRegen, growth.hpRegenPerLevel, level);
  const leveledAd = statsForLevel(stats.attackDamage, growth.adPerLevel, level);
  const leveledArmor = statsForLevel(BASE_ARMOR, growth.armorPerLevel, level);
  const leveledAttackSpeed = statsForLevel(
    stats.attackSpeed,
    growth.attackSpeedPerLevel,
    level,
  );

  // Fold in item modifiers.
  const hpWithItems = leveledHp + items.hp;

  return {
    // Team healthPercent scales the post-item max HP.
    hp: hpWithItems * (1 + teamModifiers.healthPercent),
    hpRegen: leveledHpRegen,
    moveSpeed: stats.moveSpeed + items.moveSpeed,
    attackDamage: leveledAd + items.attackDamage + teamModifiers.attackDamage,
    attackRange: stats.attackRange,
    attackSpeed: leveledAttackSpeed + items.attackSpeed,
    armor: leveledArmor + items.armor + teamModifiers.armor,
    abilityPower: items.abilityPower + teamModifiers.ability,
    resource: items.resource,
    cooldownReduction: items.cooldownReduction,
  };
}

/** Whether `gold` is enough to buy `item`. */
export function affordable(gold: number, item: Item): boolean {
  return gold >= item.cost;
}

/**
 * The preferred item archetypes, in buy-order priority, for each champion role.
 * Each role opens with the shared starter, then buys toward its identity, and
 * finishes on boots for mobility.
 */
export const ROLE_BUY_ORDER: Record<ChampionRole, readonly ItemArchetype[]> = {
  marksman: ['starter', 'attackDamage', 'lifesteal', 'boots'],
  assassin: ['starter', 'attackDamage', 'lifesteal', 'boots'],
  bruiser: ['starter', 'tank', 'attackDamage', 'boots'],
  mage: ['starter', 'abilityPower', 'mana', 'boots'],
  enchanter: ['starter', 'mana', 'abilityPower', 'boots'],
};

/** Build-defining targets in strategic priority order for each role. */
export const ROLE_BUILD_TARGETS: Record<ChampionRole, readonly string[]> = {
  marksman: ['sunfireGreatblade', 'bloodreaver'],
  assassin: ['bloodreaver', 'sunfireGreatblade'],
  bruiser: ['aegisColossus', 'sunfireGreatblade'],
  mage: ['archmageCrown', 'chronoCore'],
  enchanter: ['chronoCore', 'archmageCrown'],
};

export interface BuildRecommendation {
  /** The current complete item the role should build toward. */
  targetItem: Item;
  /** Cheapest missing direct component that can be bought now. */
  nextPurchasableComponent?: Item;
  /** Total additional gold needed after crediting owned components. */
  remainingCost: number;
  /** Other unowned complete items suitable for the same role. */
  alternatives: readonly Item[];
}

/**
 * Plan a role-aware complete item build. Unlike recommendPurchase, this reports
 * a strategic target even when no component is currently affordable.
 */
export function recommendBuild(
  role: ChampionRole,
  ownedItemIds: readonly string[],
  gold: number,
): BuildRecommendation | undefined {
  const owned = new Set(ownedItemIds);
  const candidates = ROLE_BUILD_TARGETS[role]
    .map(getItemById)
    .filter((item): item is Item => item !== undefined && !owned.has(item.id));
  const targetItem = candidates[0];
  if (!targetItem) return undefined;

  const nextPurchasableComponent = missingRecipeComponents(
    targetItem,
    ownedItemIds,
  )
    .filter((component) => affordable(gold, component))
    .sort((a, b) => a.cost - b.cost)[0];

  return {
    targetItem,
    ...(nextPurchasableComponent ? { nextPurchasableComponent } : {}),
    remainingCost: remainingBuildCost(targetItem, ownedItemIds),
    alternatives: candidates.slice(1),
  };
}

/**
 * Pick the next sensible item for `role` to buy given current `gold` and the
 * items already owned. Walks the role's archetype priority and, within the
 * first archetype that still has an unowned option, prefers the cheapest
 * affordable, not-yet-owned item (so basics are bought before legendaries).
 *
 * Returns undefined when nothing is both affordable and not already owned. The
 * result is guaranteed to be affordable and not present in `ownedItemIds`.
 */
export function recommendPurchase(
  role: ChampionRole,
  gold: number,
  ownedItemIds: readonly string[] = [],
): Item | undefined {
  const owned = new Set(ownedItemIds);
  const order = ROLE_BUY_ORDER[role];

  for (const archetype of order) {
    const candidates = ITEMS.filter(
      (item) =>
        item.archetype === archetype &&
        !owned.has(item.id) &&
        affordable(gold, item),
    ).sort((a, b) => a.cost - b.cost);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  // Fallback: any affordable, unowned item, cheapest first.
  const fallback = ITEMS.filter(
    (item) => !owned.has(item.id) && affordable(gold, item),
  ).sort((a, b) => a.cost - b.cost);
  return fallback[0];
}

/** Re-export for convenience so scene code has one import site for loadouts. */
export { getItemById };
