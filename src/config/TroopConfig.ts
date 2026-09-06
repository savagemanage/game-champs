/**
 * TroopConfig - per-troop tuning for training and combat.
 *
 * Three survivor-militia roles form a soft rock-paper-scissors so army
 * composition matters in CombatSystem:
 *   - Trapper:  cheap, fast to train, strong vs. Vanguard (snares heavy units).
 *   - Marksman: ranged damage, strong vs. Trappers, fragile up close.
 *   - Vanguard: expensive, durable, strong vs. Marksmen.
 *
 * All numbers live here. TrainingQueue reads cost/time; CombatSystem reads the
 * combat stats and the counter matrix.
 */

import { TROOP_TIERS } from './GameConfig';
import type { EnemyKind, ResourceCost, TroopClass, TroopKind, UnitStats } from '../types';

/** Static definition for a trainable troop. */
export interface TroopDef {
  kind: TroopKind;
  /** Resource cost to train ONE unit (tier-1 baseline; tiers scale it). */
  cost: ResourceCost;
  /** Milliseconds to train ONE unit (tier-1 baseline; tiers scale it). */
  trainTimeMs: number;
  /** Combat stat block (tier-1 baseline; tiers scale it). */
  stats: UnitStats;
}

/**
 * Each concrete militia {@link TroopKind} maps to exactly one WOS-style combat
 * {@link TroopClass}, forming the Infantry > Lancer > Marksman > Infantry
 * triangle:
 *   - vanguard -> infantry (durable front-line tank),
 *   - trapper  -> lancer   (fast, snaring skirmish/charge role),
 *   - marksman -> marksman (ranged).
 * The soft-RPS {@link TROOP_COUNTER} matrix already encodes the triangle at the
 * kind level; this mapping lets research/gear buff a class (all its kinds).
 */
export const TROOP_CLASS: Record<TroopKind, TroopClass> = {
  vanguard: 'infantry',
  trapper: 'lancer',
  marksman: 'marksman',
};

/** The class a troop kind belongs to. */
export function troopClass(kind: TroopKind): TroopClass {
  return TROOP_CLASS[kind];
}

/** The trainable troop roster. */
export const TROOP_DEFS: Record<TroopKind, TroopDef> = {
  trapper: {
    kind: 'trapper',
    cost: { food: 20, wood: 10 },
    trainTimeMs: 5_000,
    stats: { hp: 60, attack: 10, attackSpeed: 1.0, speed: 60, range: 24 },
  },
  marksman: {
    kind: 'marksman',
    cost: { food: 15, wood: 25 },
    trainTimeMs: 7_000,
    stats: { hp: 40, attack: 14, attackSpeed: 1.2, speed: 55, range: 140 },
  },
  vanguard: {
    kind: 'vanguard',
    cost: { food: 40, iron: 20 },
    trainTimeMs: 12_000,
    stats: { hp: 140, attack: 22, attackSpeed: 0.8, speed: 70, range: 28 },
  },
};

/** All troop kinds, in a stable display/iteration order. */
export const TROOP_ORDER: readonly TroopKind[] = ['trapper', 'marksman', 'vanguard'] as const;

/** Lookup a troop definition. */
export function troopDef(kind: TroopKind): TroopDef {
  return TROOP_DEFS[kind];
}

/**
 * Damage multiplier a given attacker role deals to a given defender role.
 * 1.5 = strong counter, 1.0 = neutral, 0.75 = weak. Soft RPS:
 *   trapper > vanguard, vanguard > marksman, marksman > trapper.
 *
 * CombatSystem reads this (via {@link troopVsEnemyMultiplier}) so army
 * composition genuinely changes battle outcomes: fielding the troop that
 * counters a wave's dominant enemy role yields more effective power than an
 * equal-cost off-counter stack.
 */
export const TROOP_COUNTER: Record<TroopKind, Record<TroopKind, number>> = {
  trapper: { trapper: 1.0, marksman: 0.75, vanguard: 1.5 },
  marksman: { trapper: 1.5, marksman: 1.0, vanguard: 0.75 },
  vanguard: { trapper: 0.75, marksman: 1.5, vanguard: 1.0 },
};

/**
 * Which troop ROLE each enemy kind fights like, so the soft-RPS
 * {@link TROOP_COUNTER} matrix applies to the Frozen Horde roster too:
 *   - frost_wolf:  light, fast skirmisher       -> trapper-role
 *   - ravager:     durable heavy beast           -> vanguard-role
 *   - frost_titan: slow, armored siege colossus  -> vanguard-role
 * A troop's multiplier against an enemy is the matrix entry for its own kind
 * versus the enemy's analogous role.
 */
export const ENEMY_ROLE: Record<EnemyKind, TroopKind> = {
  frost_wolf: 'trapper',
  ravager: 'vanguard',
  frost_titan: 'vanguard',
};

/**
 * The soft-RPS damage multiplier a `troop` deals against an `enemy`, resolved
 * through the enemy's analogous troop role. Pure and deterministic; feeds the
 * composition-aware effective power in CombatSystem.
 */
export function troopVsEnemyMultiplier(troop: TroopKind, enemy: EnemyKind): number {
  return TROOP_COUNTER[troop][ENEMY_ROLE[enemy]];
}

/** Frozen Horde enemy stat blocks (used by CombatSystem via WaveConfig composition). */
export const ENEMY_DEFS: Record<EnemyKind, UnitStats> = {
  frost_wolf: { hp: 50, attack: 9, attackSpeed: 1.0, speed: 65, range: 24 },
  ravager: { hp: 130, attack: 18, attackSpeed: 0.7, speed: 45, range: 26 },
  frost_titan: { hp: 260, attack: 30, attackSpeed: 0.5, speed: 35, range: 30 },
};

/**
 * A troop's effective combat "power" contribution used by the deterministic
 * resolver: sustained damage output (attack * attackSpeed) plus a fraction of
 * its hp as staying power. Pure and monotonic so tests are stable.
 */
export function troopPower(kind: TroopKind): number {
  const s = TROOP_DEFS[kind].stats;
  return s.attack * s.attackSpeed + s.hp * 0.25;
}

/** An enemy's effective combat "power", same formula shape as troopPower. */
export function enemyPower(kind: EnemyKind): number {
  const s = ENEMY_DEFS[kind];
  return s.attack * s.attackSpeed + s.hp * 0.25;
}

// --- FEAT-004: troop TIERS (T1..Tn), research-gated -------------------------

/** Clamp a requested tier into the valid [1, MAX_TIER] range. */
function clampTier(tier: number): number {
  return Math.min(TROOP_TIERS.MAX_TIER, Math.max(1, Math.floor(tier)));
}

/**
 * The combat stat block of a troop KIND at a given TIER. Tier 1 is the TroopDef
 * baseline; each higher tier multiplies attack/hp/attackSpeed by
 * TROOP_TIERS.STAT_GROWTH per tier above 1 (movement/range stay flat so tiers
 * feel like stronger versions of the same role, not new units). Pure + monotonic.
 */
export function troopTierStats(kind: TroopKind, tier: number): UnitStats {
  const base = TROOP_DEFS[kind].stats;
  const t = clampTier(tier);
  const factor = Math.pow(TROOP_TIERS.STAT_GROWTH, t - 1);
  return {
    hp: base.hp * factor,
    attack: base.attack * factor,
    attackSpeed: base.attackSpeed * factor,
    speed: base.speed,
    range: base.range,
  };
}

/**
 * The training cost of ONE unit of a troop kind at a given tier: the baseline
 * cost scaled by TROOP_TIERS.COST_GROWTH per tier above 1 (rounded up). Pure.
 */
export function troopTierCost(kind: TroopKind, tier: number): ResourceCost {
  const t = clampTier(tier);
  const factor = Math.pow(TROOP_TIERS.COST_GROWTH, t - 1);
  const out: ResourceCost = {};
  for (const [res, amount] of Object.entries(TROOP_DEFS[kind].cost) as [
    keyof ResourceCost,
    number,
  ][]) {
    if (typeof amount === 'number') out[res] = Math.ceil(amount * factor);
  }
  return out;
}

/**
 * The training time (ms) of ONE unit at a given tier: the baseline train time
 * scaled by TROOP_TIERS.TIME_GROWTH per tier above 1. Pure + monotonic.
 */
export function troopTierTrainTimeMs(kind: TroopKind, tier: number): number {
  const t = clampTier(tier);
  return TROOP_DEFS[kind].trainTimeMs * Math.pow(TROOP_TIERS.TIME_GROWTH, t - 1);
}

/**
 * The effective combat "power" of a troop kind at a given tier, same shape as
 * {@link troopPower} but on the tier-scaled stats. Pure + monotonic in tier so
 * a higher-tier unit is always stronger.
 */
export function troopTierPower(kind: TroopKind, tier: number): number {
  const s = troopTierStats(kind, tier);
  return s.attack * s.attackSpeed + s.hp * 0.25;
}

/**
 * The current MAX trainable troop tier given the research-unlocked ceiling.
 * Tier 1 is always trainable; `researchMaxTier` (from ResearchSystem) raises
 * it, clamped to TROOP_TIERS.MAX_TIER. Pure so training UI / tests share it.
 */
export function maxTrainableTier(researchMaxTier: number): number {
  return clampTier(Math.max(1, Math.floor(researchMaxTier)));
}
