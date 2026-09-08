/**
 * Champion data model for the arena game.
 *
 * All display text (names, titles, ability names/descriptions) is stored as
 * i18n keys, not literal strings, so the roster is fully localizable. The
 * matching translations live in `src/i18n/locales/{ko,en}.json` under the
 * `champions.<id>` namespace. The `champions.test.ts` suite guards that every
 * key referenced here resolves in BOTH locales.
 *
 * Champions use ORIGINAL names and lore inspired by generic MOBA archetypes
 * (marksman, assassin, bruiser, mage, enchanter) to avoid any trademarked
 * material.
 */

/** The five ability slots every champion exposes. */
export type AbilitySlot = 'P' | 'Q' | 'W' | 'E' | 'R';

/**
 * A behavior tag the future battle engine (FEAT-003) will interpret to decide
 * how an ability resolves. Kept intentionally small and typed.
 */
export type AbilityBehavior =
  | 'skillshot' // fires a linear projectile that must be aimed
  | 'dash' // repositions the caster
  | 'buff' // temporary self/ally stat boost
  | 'aoe' // area-of-effect burst around a point
  | 'heal' // restores health to self or ally
  | 'stun'; // applies a crowd-control lockout

/** High-level playstyle classification, used for filtering and flavor. */
export type ChampionRole =
  | 'marksman'
  | 'assassin'
  | 'bruiser'
  | 'mage'
  | 'enchanter';

/**
 * The Summoner's Rift position a champion is expected to play. Drives champion
 * select flavor, AI lane assignment, and (indirectly) which lane a champion is
 * dropped into for the full 3-lane mode.
 */
export type LaneRole = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

/**
 * Per-level stat growth. Applied linearly by the economy/loadout modules so a
 * champion's effective stats scale from level 1 to {@link MAX_LEVEL}.
 */
export interface ChampionGrowth {
  hpPerLevel: number;
  hpRegenPerLevel: number;
  adPerLevel: number;
  armorPerLevel: number;
  attackSpeedPerLevel: number;
}

/** A single champion ability. Numbers feed the combat engine in FEAT-003. */
export interface Ability {
  slot: AbilitySlot;
  /** i18n key resolving to the ability's display name. */
  nameKey: string;
  /** i18n key resolving to the ability's tooltip description. */
  descKey: string;
  /** Cooldown in seconds. Passives use 0 when always-on. */
  cooldown: number;
  /** Resource cost (mana/energy). 0 for free/passive abilities. */
  cost: number;
  /** Effective range in game units. 0 for pure self-buffs. */
  range: number;
  /** Base damage the ability deals. 0 for non-damaging utility. */
  damage: number;
  /** How the engine should resolve this ability. */
  behavior: AbilityBehavior;
}

/** Base combat statistics for a champion. */
export interface ChampionStats {
  hp: number;
  hpRegen: number;
  moveSpeed: number;
  attackDamage: number;
  attackRange: number;
  /** Attacks per second. */
  attackSpeed: number;
}

/** A fully described, localizable champion. */
export interface Champion {
  id: string;
  /** i18n key resolving to the champion's display name. */
  nameKey: string;
  /** i18n key resolving to the champion's title / epithet. */
  titleKey: string;
  role: ChampionRole;
  /** The lane/position this champion plays on Summoner's Rift. */
  laneRole: LaneRole;
  /** Accent color used for CSS art / theming in the UI. */
  accentColor: string;
  stats: ChampionStats;
  /** Per-level stat growth applied by the economy/loadout math. */
  growth: ChampionGrowth;
  /** The always-on passive (slot 'P'). */
  passive: Ability;
  /** Exactly four active abilities in slot order Q, W, E, R. */
  abilities: [Ability, Ability, Ability, Ability];
}

/**
 * The champion roster. Each entry's i18n keys follow the pattern
 * `champions.<id>.name`, `champions.<id>.title`, and
 * `champions.<id>.<slot>.name` / `champions.<id>.<slot>.desc`.
 */
export const CHAMPIONS: readonly Champion[] = [
  {
    id: 'ashborne',
    nameKey: 'champions.ashborne.name',
    titleKey: 'champions.ashborne.title',
    role: 'marksman',
    laneRole: 'bot',
    accentColor: '#e8703a',
    stats: {
      hp: 540,
      hpRegen: 3.5,
      moveSpeed: 330,
      attackDamage: 62,
      attackRange: 575,
      attackSpeed: 0.68,
    },
    growth: {
      hpPerLevel: 101,
      hpRegenPerLevel: 0.55,
      adPerLevel: 3.5,
      armorPerLevel: 4.2,
      attackSpeedPerLevel: 0.04,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.ashborne.P.name',
      descKey: 'champions.ashborne.P.desc',
      cooldown: 0,
      cost: 0,
      range: 575,
      damage: 15,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.ashborne.Q.name',
        descKey: 'champions.ashborne.Q.desc',
        cooldown: 6,
        cost: 40,
        range: 900,
        damage: 80,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.ashborne.W.name',
        descKey: 'champions.ashborne.W.desc',
        cooldown: 12,
        cost: 60,
        range: 650,
        damage: 110,
        behavior: 'aoe',
      },
      {
        slot: 'E',
        nameKey: 'champions.ashborne.E.name',
        descKey: 'champions.ashborne.E.desc',
        cooldown: 16,
        cost: 50,
        range: 400,
        damage: 0,
        behavior: 'dash',
      },
      {
        slot: 'R',
        nameKey: 'champions.ashborne.R.name',
        descKey: 'champions.ashborne.R.desc',
        cooldown: 90,
        cost: 100,
        range: 1200,
        damage: 260,
        behavior: 'skillshot',
      },
    ],
  },
  {
    id: 'nightveil',
    nameKey: 'champions.nightveil.name',
    titleKey: 'champions.nightveil.title',
    role: 'assassin',
    laneRole: 'mid',
    accentColor: '#8a4fff',
    stats: {
      hp: 590,
      hpRegen: 4,
      moveSpeed: 345,
      attackDamage: 68,
      attackRange: 150,
      attackSpeed: 0.72,
    },
    growth: {
      hpPerLevel: 96,
      hpRegenPerLevel: 0.65,
      adPerLevel: 3.3,
      armorPerLevel: 4,
      attackSpeedPerLevel: 0.035,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.nightveil.P.name',
      descKey: 'champions.nightveil.P.desc',
      cooldown: 0,
      cost: 0,
      range: 150,
      damage: 40,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.nightveil.Q.name',
        descKey: 'champions.nightveil.Q.desc',
        cooldown: 5,
        cost: 35,
        range: 300,
        damage: 95,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.nightveil.W.name',
        descKey: 'champions.nightveil.W.desc',
        cooldown: 14,
        cost: 40,
        range: 200,
        damage: 0,
        behavior: 'buff',
      },
      {
        slot: 'E',
        nameKey: 'champions.nightveil.E.name',
        descKey: 'champions.nightveil.E.desc',
        cooldown: 10,
        cost: 45,
        range: 600,
        damage: 70,
        behavior: 'dash',
      },
      {
        slot: 'R',
        nameKey: 'champions.nightveil.R.name',
        descKey: 'champions.nightveil.R.desc',
        cooldown: 80,
        cost: 100,
        range: 725,
        damage: 300,
        behavior: 'dash',
      },
    ],
  },
  {
    id: 'ironhold',
    nameKey: 'champions.ironhold.name',
    titleKey: 'champions.ironhold.title',
    role: 'bruiser',
    laneRole: 'top',
    accentColor: '#c9a227',
    stats: {
      hp: 720,
      hpRegen: 7,
      moveSpeed: 340,
      attackDamage: 60,
      attackRange: 175,
      attackSpeed: 0.62,
    },
    growth: {
      hpPerLevel: 115,
      hpRegenPerLevel: 0.85,
      adPerLevel: 3.6,
      armorPerLevel: 4.8,
      attackSpeedPerLevel: 0.032,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.ironhold.P.name',
      descKey: 'champions.ironhold.P.desc',
      cooldown: 0,
      cost: 0,
      range: 0,
      damage: 0,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.ironhold.Q.name',
        descKey: 'champions.ironhold.Q.desc',
        cooldown: 8,
        cost: 30,
        range: 300,
        damage: 90,
        behavior: 'aoe',
      },
      {
        slot: 'W',
        nameKey: 'champions.ironhold.W.name',
        descKey: 'champions.ironhold.W.desc',
        cooldown: 15,
        cost: 50,
        range: 0,
        damage: 0,
        behavior: 'buff',
      },
      {
        slot: 'E',
        nameKey: 'champions.ironhold.E.name',
        descKey: 'champions.ironhold.E.desc',
        cooldown: 13,
        cost: 55,
        range: 550,
        damage: 60,
        behavior: 'dash',
      },
      {
        slot: 'R',
        nameKey: 'champions.ironhold.R.name',
        descKey: 'champions.ironhold.R.desc',
        cooldown: 100,
        cost: 100,
        range: 450,
        damage: 150,
        behavior: 'stun',
      },
    ],
  },
  {
    id: 'embermage',
    nameKey: 'champions.embermage.name',
    titleKey: 'champions.embermage.title',
    role: 'mage',
    laneRole: 'jungle',
    accentColor: '#2fa8e0',
    stats: {
      hp: 510,
      hpRegen: 3,
      moveSpeed: 335,
      attackDamage: 52,
      attackRange: 525,
      attackSpeed: 0.6,
    },
    growth: {
      hpPerLevel: 92,
      hpRegenPerLevel: 0.5,
      adPerLevel: 3.1,
      armorPerLevel: 3.9,
      attackSpeedPerLevel: 0.02,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.embermage.P.name',
      descKey: 'champions.embermage.P.desc',
      cooldown: 0,
      cost: 0,
      range: 525,
      damage: 25,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.embermage.Q.name',
        descKey: 'champions.embermage.Q.desc',
        cooldown: 5,
        cost: 50,
        range: 1000,
        damage: 120,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.embermage.W.name',
        descKey: 'champions.embermage.W.desc',
        cooldown: 9,
        cost: 70,
        range: 850,
        damage: 160,
        behavior: 'aoe',
      },
      {
        slot: 'E',
        nameKey: 'champions.embermage.E.name',
        descKey: 'champions.embermage.E.desc',
        cooldown: 18,
        cost: 60,
        range: 700,
        damage: 60,
        behavior: 'stun',
      },
      {
        slot: 'R',
        nameKey: 'champions.embermage.R.name',
        descKey: 'champions.embermage.R.desc',
        cooldown: 110,
        cost: 100,
        range: 550,
        damage: 400,
        behavior: 'aoe',
      },
    ],
  },
  {
    id: 'dawnsong',
    nameKey: 'champions.dawnsong.name',
    titleKey: 'champions.dawnsong.title',
    role: 'enchanter',
    laneRole: 'support',
    accentColor: '#3ad6a5',
    stats: {
      hp: 500,
      hpRegen: 4.5,
      moveSpeed: 330,
      attackDamage: 50,
      attackRange: 550,
      attackSpeed: 0.625,
    },
    growth: {
      hpPerLevel: 88,
      hpRegenPerLevel: 0.6,
      adPerLevel: 3,
      armorPerLevel: 3.8,
      attackSpeedPerLevel: 0.022,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.dawnsong.P.name',
      descKey: 'champions.dawnsong.P.desc',
      cooldown: 0,
      cost: 0,
      range: 600,
      damage: 0,
      behavior: 'heal',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.dawnsong.Q.name',
        descKey: 'champions.dawnsong.Q.desc',
        cooldown: 7,
        cost: 55,
        range: 950,
        damage: 75,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.dawnsong.W.name',
        descKey: 'champions.dawnsong.W.desc',
        cooldown: 11,
        cost: 80,
        range: 700,
        damage: 0,
        behavior: 'heal',
      },
      {
        slot: 'E',
        nameKey: 'champions.dawnsong.E.name',
        descKey: 'champions.dawnsong.E.desc',
        cooldown: 14,
        cost: 65,
        range: 800,
        damage: 0,
        behavior: 'buff',
      },
      {
        slot: 'R',
        nameKey: 'champions.dawnsong.R.name',
        descKey: 'champions.dawnsong.R.desc',
        cooldown: 120,
        cost: 100,
        range: 900,
        damage: 0,
        behavior: 'heal',
      },
    ],
  },
  {
    id: 'thornwarden',
    nameKey: 'champions.thornwarden.name',
    titleKey: 'champions.thornwarden.title',
    role: 'bruiser',
    laneRole: 'top',
    accentColor: '#5a9e3f',
    stats: {
      hp: 700,
      hpRegen: 6.5,
      moveSpeed: 340,
      attackDamage: 63,
      attackRange: 175,
      attackSpeed: 0.63,
    },
    growth: {
      hpPerLevel: 112,
      hpRegenPerLevel: 0.8,
      adPerLevel: 3.7,
      armorPerLevel: 4.6,
      attackSpeedPerLevel: 0.03,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.thornwarden.P.name',
      descKey: 'champions.thornwarden.P.desc',
      cooldown: 0,
      cost: 0,
      range: 300,
      damage: 12,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.thornwarden.Q.name',
        descKey: 'champions.thornwarden.Q.desc',
        cooldown: 7,
        cost: 35,
        range: 350,
        damage: 85,
        behavior: 'aoe',
      },
      {
        slot: 'W',
        nameKey: 'champions.thornwarden.W.name',
        descKey: 'champions.thornwarden.W.desc',
        cooldown: 14,
        cost: 50,
        range: 0,
        damage: 0,
        behavior: 'buff',
      },
      {
        slot: 'E',
        nameKey: 'champions.thornwarden.E.name',
        descKey: 'champions.thornwarden.E.desc',
        cooldown: 12,
        cost: 45,
        range: 600,
        damage: 55,
        behavior: 'skillshot',
      },
      {
        slot: 'R',
        nameKey: 'champions.thornwarden.R.name',
        descKey: 'champions.thornwarden.R.desc',
        cooldown: 105,
        cost: 100,
        range: 500,
        damage: 140,
        behavior: 'stun',
      },
    ],
  },
  {
    id: 'grimtrail',
    nameKey: 'champions.grimtrail.name',
    titleKey: 'champions.grimtrail.title',
    role: 'assassin',
    laneRole: 'jungle',
    accentColor: '#a12b3c',
    stats: {
      hp: 585,
      hpRegen: 4.2,
      moveSpeed: 345,
      attackDamage: 66,
      attackRange: 150,
      attackSpeed: 0.7,
    },
    growth: {
      hpPerLevel: 98,
      hpRegenPerLevel: 0.62,
      adPerLevel: 3.4,
      armorPerLevel: 4.1,
      attackSpeedPerLevel: 0.036,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.grimtrail.P.name',
      descKey: 'champions.grimtrail.P.desc',
      cooldown: 0,
      cost: 0,
      range: 400,
      damage: 35,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.grimtrail.Q.name',
        descKey: 'champions.grimtrail.Q.desc',
        cooldown: 6,
        cost: 40,
        range: 450,
        damage: 90,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.grimtrail.W.name',
        descKey: 'champions.grimtrail.W.desc',
        cooldown: 13,
        cost: 45,
        range: 250,
        damage: 60,
        behavior: 'aoe',
      },
      {
        slot: 'E',
        nameKey: 'champions.grimtrail.E.name',
        descKey: 'champions.grimtrail.E.desc',
        cooldown: 11,
        cost: 50,
        range: 550,
        damage: 50,
        behavior: 'dash',
      },
      {
        slot: 'R',
        nameKey: 'champions.grimtrail.R.name',
        descKey: 'champions.grimtrail.R.desc',
        cooldown: 85,
        cost: 100,
        range: 700,
        damage: 280,
        behavior: 'dash',
      },
    ],
  },
  {
    id: 'frostquill',
    nameKey: 'champions.frostquill.name',
    titleKey: 'champions.frostquill.title',
    role: 'mage',
    laneRole: 'mid',
    accentColor: '#6fd0e8',
    stats: {
      hp: 505,
      hpRegen: 3.1,
      moveSpeed: 335,
      attackDamage: 53,
      attackRange: 550,
      attackSpeed: 0.6,
    },
    growth: {
      hpPerLevel: 90,
      hpRegenPerLevel: 0.52,
      adPerLevel: 3.1,
      armorPerLevel: 3.9,
      attackSpeedPerLevel: 0.021,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.frostquill.P.name',
      descKey: 'champions.frostquill.P.desc',
      cooldown: 0,
      cost: 0,
      range: 550,
      damage: 20,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.frostquill.Q.name',
        descKey: 'champions.frostquill.Q.desc',
        cooldown: 6,
        cost: 50,
        range: 950,
        damage: 110,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.frostquill.W.name',
        descKey: 'champions.frostquill.W.desc',
        cooldown: 10,
        cost: 65,
        range: 800,
        damage: 140,
        behavior: 'aoe',
      },
      {
        slot: 'E',
        nameKey: 'champions.frostquill.E.name',
        descKey: 'champions.frostquill.E.desc',
        cooldown: 16,
        cost: 60,
        range: 650,
        damage: 55,
        behavior: 'stun',
      },
      {
        slot: 'R',
        nameKey: 'champions.frostquill.R.name',
        descKey: 'champions.frostquill.R.desc',
        cooldown: 115,
        cost: 100,
        range: 1100,
        damage: 360,
        behavior: 'skillshot',
      },
    ],
  },
  {
    id: 'duskarrow',
    nameKey: 'champions.duskarrow.name',
    titleKey: 'champions.duskarrow.title',
    role: 'marksman',
    laneRole: 'bot',
    accentColor: '#d94fa0',
    stats: {
      hp: 535,
      hpRegen: 3.4,
      moveSpeed: 330,
      attackDamage: 61,
      attackRange: 600,
      attackSpeed: 0.66,
    },
    growth: {
      hpPerLevel: 100,
      hpRegenPerLevel: 0.54,
      adPerLevel: 3.5,
      armorPerLevel: 4.1,
      attackSpeedPerLevel: 0.042,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.duskarrow.P.name',
      descKey: 'champions.duskarrow.P.desc',
      cooldown: 0,
      cost: 0,
      range: 600,
      damage: 18,
      behavior: 'buff',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.duskarrow.Q.name',
        descKey: 'champions.duskarrow.Q.desc',
        cooldown: 7,
        cost: 45,
        range: 850,
        damage: 85,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.duskarrow.W.name',
        descKey: 'champions.duskarrow.W.desc',
        cooldown: 13,
        cost: 55,
        range: 700,
        damage: 95,
        behavior: 'aoe',
      },
      {
        slot: 'E',
        nameKey: 'champions.duskarrow.E.name',
        descKey: 'champions.duskarrow.E.desc',
        cooldown: 15,
        cost: 50,
        range: 450,
        damage: 0,
        behavior: 'dash',
      },
      {
        slot: 'R',
        nameKey: 'champions.duskarrow.R.name',
        descKey: 'champions.duskarrow.R.desc',
        cooldown: 95,
        cost: 100,
        range: 1300,
        damage: 250,
        behavior: 'skillshot',
      },
    ],
  },
  {
    id: 'wardlight',
    nameKey: 'champions.wardlight.name',
    titleKey: 'champions.wardlight.title',
    role: 'enchanter',
    laneRole: 'support',
    accentColor: '#9fb8ff',
    stats: {
      hp: 495,
      hpRegen: 4.6,
      moveSpeed: 335,
      attackDamage: 49,
      attackRange: 525,
      attackSpeed: 0.62,
    },
    growth: {
      hpPerLevel: 87,
      hpRegenPerLevel: 0.6,
      adPerLevel: 3,
      armorPerLevel: 3.8,
      attackSpeedPerLevel: 0.022,
    },
    passive: {
      slot: 'P',
      nameKey: 'champions.wardlight.P.name',
      descKey: 'champions.wardlight.P.desc',
      cooldown: 0,
      cost: 0,
      range: 650,
      damage: 0,
      behavior: 'heal',
    },
    abilities: [
      {
        slot: 'Q',
        nameKey: 'champions.wardlight.Q.name',
        descKey: 'champions.wardlight.Q.desc',
        cooldown: 8,
        cost: 55,
        range: 900,
        damage: 70,
        behavior: 'skillshot',
      },
      {
        slot: 'W',
        nameKey: 'champions.wardlight.W.name',
        descKey: 'champions.wardlight.W.desc',
        cooldown: 12,
        cost: 75,
        range: 750,
        damage: 0,
        behavior: 'heal',
      },
      {
        slot: 'E',
        nameKey: 'champions.wardlight.E.name',
        descKey: 'champions.wardlight.E.desc',
        cooldown: 15,
        cost: 60,
        range: 700,
        damage: 45,
        behavior: 'stun',
      },
      {
        slot: 'R',
        nameKey: 'champions.wardlight.R.name',
        descKey: 'champions.wardlight.R.desc',
        cooldown: 120,
        cost: 100,
        range: 850,
        damage: 0,
        behavior: 'buff',
      },
    ],
  },
];

/** Ordered slots for iterating a champion's full kit (passive first). */
export const ABILITY_SLOT_ORDER: readonly AbilitySlot[] = [
  'P',
  'Q',
  'W',
  'E',
  'R',
];

/** Look up a champion by id. Returns undefined when the id is unknown. */
export function getChampionById(id: string): Champion | undefined {
  return CHAMPIONS.find((champion) => champion.id === id);
}

/** All ability entries (passive + Q/W/E/R) for a champion, in slot order. */
export function getAllAbilities(champion: Champion): Ability[] {
  return [champion.passive, ...champion.abilities];
}

/** Pick a random champion id, optionally excluding one (e.g. the player's). */
export function randomChampionId(excludeId?: string): string {
  const pool = CHAMPIONS.filter((champion) => champion.id !== excludeId);
  const list = pool.length > 0 ? pool : CHAMPIONS;
  const index = Math.floor(Math.random() * list.length);
  return list[index].id;
}
