/**
 * Item shop catalog for the Summoner's Rift game.
 *
 * Every item is pure data: an id, i18n keys for its name/description, a gold
 * cost, and a flat stat-modifier block that other systems (see
 * `src/game/rift/loadout.ts`) add into a champion's effective stats. Display
 * text lives under the `items.<id>` namespace in `src/i18n/locales/{ko,en}.json`
 * and the `items.test.ts` suite guards that every key resolves in BOTH locales.
 *
 * This module contains NO Phaser (or any DOM) imports so it can be exhaustively
 * unit tested in a plain jsdom/node environment.
 */

/**
 * Flat additive stat bonuses granted by an item. Values are ADDED together
 * across all owned items (see {@link totalModifiers}) and then folded into a
 * champion's effective stats. A zero component means "no effect".
 */
export interface ItemModifiers {
  /** Flat bonus attack damage. */
  attackDamage: number;
  /** Flat bonus ability power. */
  abilityPower: number;
  /** Flat bonus max health. */
  hp: number;
  /** Flat bonus armor. */
  armor: number;
  /** Flat bonus move speed (game units). */
  moveSpeed: number;
  /** Flat bonus attack speed (attacks per second). */
  attackSpeed: number;
  /** Flat bonus resource (mana/energy) pool. */
  resource: number;
  /** Cooldown reduction as a fraction, e.g. 0.1 = 10% CDR. */
  cooldownReduction: number;
}

/** Coarse archetype an item is built for, used by the AI buy-order helper. */
export type ItemArchetype =
  | 'starter'
  | 'boots'
  | 'attackDamage'
  | 'abilityPower'
  | 'tank'
  | 'lifesteal'
  | 'mana';

/** A purchasable shop item. */
export interface Item {
  id: string;
  /** i18n key resolving to the item's display name. */
  nameKey: string;
  /** i18n key resolving to the item's tooltip description. */
  descKey: string;
  /** Gold cost. Always strictly positive. */
  cost: number;
  /** The archetype this item serves (drives AI recommendations). */
  archetype: ItemArchetype;
  /** True for a build-defining legendary (top-end purchase for its archetype). */
  legendary: boolean;
  /** The flat stat bonuses this item grants. */
  modifiers: ItemModifiers;
}

/** A zeroed modifier record (no effect). */
export function zeroItemModifiers(): ItemModifiers {
  return {
    attackDamage: 0,
    abilityPower: 0,
    hp: 0,
    armor: 0,
    moveSpeed: 0,
    attackSpeed: 0,
    resource: 0,
    cooldownReduction: 0,
  };
}

/** Build a full modifier record from a partial one, defaulting the rest to 0. */
function mods(partial: Partial<ItemModifiers>): ItemModifiers {
  return { ...zeroItemModifiers(), ...partial };
}

/**
 * The shop catalog: a starter item, boots, and a basic + legendary option for
 * each of the AD / AP / tank / lifesteal / mana archetypes. Costs rise from
 * basic components to legendaries, echoing LoL's shop tiers.
 */
export const ITEMS: readonly Item[] = [
  {
    id: 'huntersRelic',
    nameKey: 'items.huntersRelic.name',
    descKey: 'items.huntersRelic.desc',
    cost: 400,
    archetype: 'starter',
    legendary: false,
    modifiers: mods({ hp: 45, attackDamage: 5 }),
  },
  {
    id: 'swiftBoots',
    nameKey: 'items.swiftBoots.name',
    descKey: 'items.swiftBoots.desc',
    cost: 900,
    archetype: 'boots',
    legendary: false,
    modifiers: mods({ moveSpeed: 45 }),
  },
  {
    id: 'shortsword',
    nameKey: 'items.shortsword.name',
    descKey: 'items.shortsword.desc',
    cost: 350,
    archetype: 'attackDamage',
    legendary: false,
    modifiers: mods({ attackDamage: 15 }),
  },
  {
    id: 'sunfireGreatblade',
    nameKey: 'items.sunfireGreatblade.name',
    descKey: 'items.sunfireGreatblade.desc',
    cost: 3100,
    archetype: 'attackDamage',
    legendary: true,
    modifiers: mods({ attackDamage: 65, attackSpeed: 0.25, cooldownReduction: 0.1 }),
  },
  {
    id: 'emberRod',
    nameKey: 'items.emberRod.name',
    descKey: 'items.emberRod.desc',
    cost: 850,
    archetype: 'abilityPower',
    legendary: false,
    modifiers: mods({ abilityPower: 40 }),
  },
  {
    id: 'archmageCrown',
    nameKey: 'items.archmageCrown.name',
    descKey: 'items.archmageCrown.desc',
    cost: 3200,
    archetype: 'abilityPower',
    legendary: true,
    modifiers: mods({ abilityPower: 110, resource: 300, cooldownReduction: 0.15 }),
  },
  {
    id: 'ironVest',
    nameKey: 'items.ironVest.name',
    descKey: 'items.ironVest.desc',
    cost: 800,
    archetype: 'tank',
    legendary: false,
    modifiers: mods({ hp: 200, armor: 30 }),
  },
  {
    id: 'aegisColossus',
    nameKey: 'items.aegisColossus.name',
    descKey: 'items.aegisColossus.desc',
    cost: 2900,
    archetype: 'tank',
    legendary: true,
    modifiers: mods({ hp: 450, armor: 60, cooldownReduction: 0.1 }),
  },
  {
    id: 'vampiricEdge',
    nameKey: 'items.vampiricEdge.name',
    descKey: 'items.vampiricEdge.desc',
    cost: 900,
    archetype: 'lifesteal',
    legendary: false,
    modifiers: mods({ attackDamage: 15, attackSpeed: 0.15 }),
  },
  {
    id: 'bloodreaver',
    nameKey: 'items.bloodreaver.name',
    descKey: 'items.bloodreaver.desc',
    cost: 3400,
    archetype: 'lifesteal',
    legendary: true,
    modifiers: mods({ attackDamage: 55, attackSpeed: 0.35, hp: 150 }),
  },
  {
    id: 'manaCrystal',
    nameKey: 'items.manaCrystal.name',
    descKey: 'items.manaCrystal.desc',
    cost: 650,
    archetype: 'mana',
    legendary: false,
    modifiers: mods({ resource: 250, cooldownReduction: 0.1 }),
  },
  {
    id: 'chronoCore',
    nameKey: 'items.chronoCore.name',
    descKey: 'items.chronoCore.desc',
    cost: 2600,
    archetype: 'mana',
    legendary: true,
    modifiers: mods({ resource: 600, abilityPower: 60, cooldownReduction: 0.2 }),
  },
];

/** Look up an item by id. Returns undefined when the id is unknown. */
export function getItemById(id: string): Item | undefined {
  return ITEMS.find((item) => item.id === id);
}

/** Add two modifier records component-wise, returning a new record. */
export function addItemModifiers(a: ItemModifiers, b: ItemModifiers): ItemModifiers {
  return {
    attackDamage: a.attackDamage + b.attackDamage,
    abilityPower: a.abilityPower + b.abilityPower,
    hp: a.hp + b.hp,
    armor: a.armor + b.armor,
    moveSpeed: a.moveSpeed + b.moveSpeed,
    attackSpeed: a.attackSpeed + b.attackSpeed,
    resource: a.resource + b.resource,
    cooldownReduction: a.cooldownReduction + b.cooldownReduction,
  };
}

/**
 * Sum the stat modifiers of every owned item id, ignoring unknown ids. Returns
 * a fresh record; owning no items yields {@link zeroItemModifiers}.
 */
export function totalModifiers(itemIds: readonly string[]): ItemModifiers {
  return itemIds.reduce<ItemModifiers>((acc, id) => {
    const item = getItemById(id);
    return item ? addItemModifiers(acc, item.modifiers) : acc;
  }, zeroItemModifiers());
}
