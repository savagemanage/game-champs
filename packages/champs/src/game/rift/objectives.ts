/**
 * Epic monster objectives for Summoner's Rift: Dragon (permanent stacking team
 * boost), Rift Herald (a one-time pushing advantage), and Baron Nashor (a
 * timed team buff). All effects are expressed as a numeric {@link TeamModifiers}
 * record that other systems add into champion / minion stats.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so it can be
 * exhaustively unit tested in a plain jsdom/node environment. Rewards are drawn
 * from {@link ./economy}.
 */

import { type Bounty, type EpicMonster, epicMonsterBounty } from './economy';

// ---------------------------------------------------------------------------
// Spawn timings (seconds of game time)
// ---------------------------------------------------------------------------

/** First dragon spawns at 5:00. */
export const DRAGON_FIRST_SPAWN = 300;

/** Dragons respawn 5:00 after the previous one is slain. */
export const DRAGON_RESPAWN = 300;

/** Rift Herald is available from 8:00 until it despawns at 19:45. */
export const HERALD_SPAWN_WINDOW: { start: number; end: number } = {
  start: 480,
  end: 1185,
};

/** Baron Nashor spawns at 20:00, replacing the Herald. */
export const BARON_SPAWN = 1200;

/** Baron buff lasts 3:00 after the slaying team picks it up. */
export const BARON_BUFF_DURATION = 180;

// ---------------------------------------------------------------------------
// Monster stats
// ---------------------------------------------------------------------------

/** Static profile for an epic monster. */
export interface MonsterStats {
  id: EpicMonster;
  hp: number;
  ad: number;
  armor: number;
  bounty: Bounty;
}

/** Base stats per epic monster. Baron is the toughest, then dragon, then herald. */
export const MONSTER_STATS: Record<EpicMonster, MonsterStats> = {
  dragon: { id: 'dragon', hp: 3500, ad: 120, armor: 21, bounty: epicMonsterBounty('dragon') },
  herald: { id: 'herald', hp: 6800, ad: 140, armor: 40, bounty: epicMonsterBounty('herald') },
  baron: { id: 'baron', hp: 9000, ad: 220, armor: 90, bounty: epicMonsterBounty('baron') },
};

/** Stats for the given epic monster. */
export function monsterStats(monster: EpicMonster): MonsterStats {
  return MONSTER_STATS[monster];
}

// ---------------------------------------------------------------------------
// Team modifiers
// ---------------------------------------------------------------------------

/**
 * A team-wide additive stat modifier. Other systems ADD these into a champion
 * or minion's base stats, so a zero value means "no effect". Represented as
 * flat/percentage bonuses that stack additively.
 */
export interface TeamModifiers {
  /** Flat bonus attack damage. */
  attackDamage: number;
  /** Flat bonus ability power / ability strength. */
  ability: number;
  /** Flat bonus armor. */
  armor: number;
  /** Fractional bonus health, e.g. 0.05 = +5% max HP. */
  healthPercent: number;
}

/** A zeroed modifier record (no effect). */
export function zeroModifiers(): TeamModifiers {
  return { attackDamage: 0, ability: 0, armor: 0, healthPercent: 0 };
}

/** Add two modifier records component-wise, returning a new record. */
export function addModifiers(a: TeamModifiers, b: TeamModifiers): TeamModifiers {
  return {
    attackDamage: a.attackDamage + b.attackDamage,
    ability: a.ability + b.ability,
    armor: a.armor + b.armor,
    healthPercent: a.healthPercent + b.healthPercent,
  };
}

// ---------------------------------------------------------------------------
// Dragon: permanent stacking team boost
// ---------------------------------------------------------------------------

/** The stat boost a single dragon stack grants a team. */
export const DRAGON_STACK_BONUS: TeamModifiers = {
  attackDamage: 3,
  ability: 3,
  armor: 2,
  healthPercent: 0,
};

/**
 * The PERMANENT team modifier from holding `stacks` dragon souls/kills. The
 * bonus scales linearly with the number of dragons slain and never expires,
 * so more stacks strictly increase every non-zero component.
 */
export function dragonStackBonus(stacks: number): TeamModifiers {
  const n = Math.max(0, Math.floor(stacks));
  return {
    attackDamage: DRAGON_STACK_BONUS.attackDamage * n,
    ability: DRAGON_STACK_BONUS.ability * n,
    armor: DRAGON_STACK_BONUS.armor * n,
    healthPercent: DRAGON_STACK_BONUS.healthPercent * n,
  };
}

// ---------------------------------------------------------------------------
// Rift Herald: a one-time pushing advantage
// ---------------------------------------------------------------------------

/**
 * The reward for slaying the Rift Herald: a deployable "Eye of the Herald" that
 * charges a lane and damages structures. Modeled as a single-use battering
 * deployable with a large one-shot structure damage value plus a small combat
 * buff while it lives.
 */
export interface HeraldReward {
  /** True: the reward is a deployable that pushes a lane. */
  deployable: true;
  /** Damage the charging Herald deals to a struck structure. */
  structureDamage: number;
  /** Seconds the deployable persists before expiring. */
  durationSeconds: number;
  /** Small team combat buff while the Herald is deployed. */
  modifiers: TeamModifiers;
}

/** The Rift Herald reward payload. */
export function heraldReward(): HeraldReward {
  return {
    deployable: true,
    structureDamage: 900,
    durationSeconds: 90,
    modifiers: { attackDamage: 0, ability: 0, armor: 0, healthPercent: 0 },
  };
}

/** Whether the Herald can currently be present at `nowSeconds`. */
export function isHeraldWindowOpen(nowSeconds: number): boolean {
  return nowSeconds >= HERALD_SPAWN_WINDOW.start && nowSeconds <= HERALD_SPAWN_WINDOW.end;
}

// ---------------------------------------------------------------------------
// Baron Nashor: a timed team buff
// ---------------------------------------------------------------------------

/** The team combat buff granted by slaying Baron Nashor. */
export const BARON_BUFF: TeamModifiers = {
  attackDamage: 24,
  ability: 40,
  armor: 0,
  healthPercent: 0,
};

/**
 * A team's active Baron buff: the modifiers it applies and when it expires.
 */
export interface BaronBuffState {
  active: boolean;
  modifiers: TeamModifiers;
  expiresAt: number;
}

/** A team with no Baron buff. */
export function noBaronBuff(): BaronBuffState {
  return { active: false, modifiers: zeroModifiers(), expiresAt: 0 };
}

/**
 * Grant the Baron buff to a team at `nowSeconds`, expiring after
 * {@link BARON_BUFF_DURATION}. Returns a fresh buff-state record.
 */
export function applyBaronBuff(nowSeconds: number): BaronBuffState {
  return {
    active: true,
    modifiers: { ...BARON_BUFF },
    expiresAt: nowSeconds + BARON_BUFF_DURATION,
  };
}

/**
 * Expire the Baron buff if its timer has elapsed by `nowSeconds`, returning the
 * (possibly reset) buff state. Pure: returns a new record.
 */
export function expireBaronBuff(state: BaronBuffState, nowSeconds: number): BaronBuffState {
  if (state.active && nowSeconds >= state.expiresAt) {
    return noBaronBuff();
  }
  return state;
}
