/**
 * TroopConfig - per-troop tuning for training and combat.
 *
 * Three roles form a soft rock-paper-scissors so army composition matters in
 * CombatSystem:
 *   - Spearman: cheap, fast to train, strong vs. Knights (anti-cavalry pikes).
 *   - Archer:   ranged damage, strong vs. Spearmen, fragile up close.
 *   - Knight:   expensive, durable, strong vs. Archers.
 *
 * All numbers live here. TrainingQueue reads cost/time; CombatSystem reads the
 * combat stats and the counter matrix.
 */

import type { EnemyKind, ResourceCost, TroopKind, UnitStats } from '../types';

/** Static definition for a trainable troop. */
export interface TroopDef {
  kind: TroopKind;
  /** Resource cost to train ONE unit. */
  cost: ResourceCost;
  /** Milliseconds to train ONE unit. */
  trainTimeMs: number;
  /** Combat stat block. */
  stats: UnitStats;
}

/** The trainable troop roster. */
export const TROOP_DEFS: Record<TroopKind, TroopDef> = {
  spearman: {
    kind: 'spearman',
    cost: { food: 20, wood: 10 },
    trainTimeMs: 5_000,
    stats: { hp: 60, attack: 10, attackSpeed: 1.0, speed: 60, range: 24 },
  },
  archer: {
    kind: 'archer',
    cost: { food: 15, wood: 25 },
    trainTimeMs: 7_000,
    stats: { hp: 40, attack: 14, attackSpeed: 1.2, speed: 55, range: 140 },
  },
  knight: {
    kind: 'knight',
    cost: { food: 40, gold: 20 },
    trainTimeMs: 12_000,
    stats: { hp: 140, attack: 22, attackSpeed: 0.8, speed: 70, range: 28 },
  },
};

/** All troop kinds, in a stable display/iteration order. */
export const TROOP_ORDER: readonly TroopKind[] = ['spearman', 'archer', 'knight'] as const;

/** Lookup a troop definition. */
export function troopDef(kind: TroopKind): TroopDef {
  return TROOP_DEFS[kind];
}

/**
 * Damage multiplier a given attacker role deals to a given defender role.
 * 1.5 = strong counter, 1.0 = neutral, 0.75 = weak. Soft RPS:
 *   spear > knight, knight > archer, archer > spear.
 */
export const TROOP_COUNTER: Record<TroopKind, Record<TroopKind, number>> = {
  spearman: { spearman: 1.0, archer: 0.75, knight: 1.5 },
  archer: { spearman: 1.5, archer: 1.0, knight: 0.75 },
  knight: { spearman: 0.75, archer: 1.5, knight: 1.0 },
};

/** Enemy raider stat blocks (used by CombatSystem via WaveConfig composition). */
export const ENEMY_DEFS: Record<EnemyKind, UnitStats> = {
  raider: { hp: 50, attack: 9, attackSpeed: 1.0, speed: 65, range: 24 },
  brute: { hp: 130, attack: 18, attackSpeed: 0.7, speed: 45, range: 26 },
  ram: { hp: 260, attack: 30, attackSpeed: 0.5, speed: 35, range: 30 },
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
