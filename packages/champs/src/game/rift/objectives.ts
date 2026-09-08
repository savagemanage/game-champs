/**
 * Epic monster objectives for the three-lane arena: Ember Dragon (permanent
 * stacking team boost), Stone Warden (a one-time pushing advantage), and Void
 * Tyrant (a timed team buff). All effects are expressed as numeric {@link TeamModifiers}
 * record that other systems add into champion / minion stats.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so it can be
 * exhaustively unit tested in a plain jsdom/node environment. Rewards are drawn
 * from {@link ./economy}.
 */

import { CONQUEST_OBJECTIVE_RULES } from '../../config/matchRules';
import { type Bounty, type EpicMonster, epicMonsterBounty } from './economy';

// ---------------------------------------------------------------------------
// Spawn timings (seconds of game time)
// ---------------------------------------------------------------------------

/** First dragon spawn in the compressed three-lane match. */
export const DRAGON_FIRST_SPAWN = CONQUEST_OBJECTIVE_RULES.firstSpawnSeconds;

/** Dragon respawn cadence in the compressed three-lane match. */
export const DRAGON_RESPAWN = CONQUEST_OBJECTIVE_RULES.respawnSeconds;

/** Herald availability window in the compressed three-lane match. */
export const HERALD_SPAWN_WINDOW: { start: number; end: number } = {
  start: CONQUEST_OBJECTIVE_RULES.heraldStartSeconds,
  end: CONQUEST_OBJECTIVE_RULES.heraldEndSeconds,
};

/** Major objective spawn time in the compressed three-lane match. */
export const BARON_SPAWN = CONQUEST_OBJECTIVE_RULES.majorSpawnSeconds;

/** Major-objective team buff duration. */
export const BARON_BUFF_DURATION = CONQUEST_OBJECTIVE_RULES.majorBuffSeconds;

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

/** Base stats per epic monster. The tyrant is toughest, then dragon, then warden. */
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
// Stone Warden: a one-time pushing advantage
// ---------------------------------------------------------------------------

/**
 * The reward for slaying the Stone Warden: a deployable guardian that charges
 * a lane and damages structures. Modeled as a single-use battering deployable
 * with a large one-shot structure damage value plus a small combat
 * buff while it lives.
 */
export interface HeraldReward {
  /** True: the reward is a deployable that pushes a lane. */
  deployable: true;
  /** Damage the charging Warden deals to a struck structure. */
  structureDamage: number;
  /** Seconds the deployable persists before expiring. */
  durationSeconds: number;
  /** Small team combat buff while the Herald is deployed. */
  modifiers: TeamModifiers;
}

/** The Stone Warden reward payload. */
export function heraldReward(): HeraldReward {
  return {
    deployable: true,
    structureDamage: 900,
    durationSeconds: 90,
    modifiers: { attackDamage: 0, ability: 0, armor: 0, healthPercent: 0 },
  };
}

/** Whether the Warden can currently be present at `nowSeconds`. */
export function isHeraldWindowOpen(nowSeconds: number): boolean {
  return nowSeconds >= HERALD_SPAWN_WINDOW.start && nowSeconds <= HERALD_SPAWN_WINDOW.end;
}

// ---------------------------------------------------------------------------
// Void Tyrant: a timed team buff
// ---------------------------------------------------------------------------

/** The team combat buff granted by slaying the Void Tyrant. */
export const BARON_BUFF: TeamModifiers = {
  attackDamage: 24,
  ability: 40,
  armor: 0,
  healthPercent: 0,
};

/**
 * A team's active tyrant buff: the modifiers it applies and when it expires.
 */
export interface BaronBuffState {
  active: boolean;
  modifiers: TeamModifiers;
  expiresAt: number;
}

/** A team with no tyrant buff. */
export function noBaronBuff(): BaronBuffState {
  return { active: false, modifiers: zeroModifiers(), expiresAt: 0 };
}

/**
 * Grant the tyrant buff to a team at `nowSeconds`, expiring after
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
 * Expire the tyrant buff if its timer has elapsed by `nowSeconds`, returning the
 * (possibly reset) buff state. Pure: returns a new record.
 */
export function expireBaronBuff(state: BaronBuffState, nowSeconds: number): BaronBuffState {
  if (state.active && nowSeconds >= state.expiresAt) {
    return noBaronBuff();
  }
  return state;
}
