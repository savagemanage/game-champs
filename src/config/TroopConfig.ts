/**
 * TroopConfig - per-troop tuning for training and combat.
 *
 * Five roles form a soft rock-paper-scissors CYCLE so army composition matters
 * in CombatSystem. Arrange the roles on a pentagon in the order
 *   spearman -> cavalry -> archer -> siege -> knight -> (spearman)
 * where each unit is STRONG (1.5x) against the two roles that follow it and
 * WEAK (0.75x) against the two that precede it, neutral (1.0x) against itself:
 *   - Spearman: cheap pike infantry; strong vs. cavalry + archer.
 *   - Cavalry:  fast flanker; strong vs. archer + siege (runs down soft units).
 *   - Archer:   ranged skirmisher; strong vs. siege + knight (kites armour).
 *   - Siege:    slow anti-armour engine; strong vs. knight + spearman (crushes
 *               dense formations), fragile to fast/ranged units.
 *   - Knight:   heavy cavalry; strong vs. spearman + cavalry (shatters light
 *               units), weak to archers + siege.
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
  cavalry: {
    kind: 'cavalry',
    // Fast flanker: nimble and hard-hitting, moderately expensive, trains in
    // the mid band. Higher speed than any other troop, modest hp.
    cost: { food: 35, wood: 15, gold: 10 },
    trainTimeMs: 9_000,
    stats: { hp: 90, attack: 18, attackSpeed: 1.0, speed: 95, range: 26 },
  },
  siege: {
    kind: 'siege',
    // Slow anti-armour engine: very high hp and attack but low attack speed and
    // crawling movement. The most expensive and slowest to build.
    cost: { food: 30, wood: 60, stone: 40, gold: 15 },
    trainTimeMs: 16_000,
    stats: { hp: 200, attack: 34, attackSpeed: 0.5, speed: 30, range: 60 },
  },
};

/** All troop kinds, in a stable display/iteration order. */
export const TROOP_ORDER: readonly TroopKind[] = [
  'spearman',
  'archer',
  'knight',
  'cavalry',
  'siege',
] as const;

/** Lookup a troop definition. */
export function troopDef(kind: TroopKind): TroopDef {
  return TROOP_DEFS[kind];
}

/**
 * Damage multiplier a given attacker role deals to a given defender role.
 * 1.5 = strong counter, 1.0 = neutral, 0.75 = weak.
 *
 * The five roles sit on a pentagon in the order
 *   spearman -> cavalry -> archer -> siege -> knight -> (spearman)
 * where each role is STRONG (1.5x) against the next two roles clockwise and
 * WEAK (0.75x) against the two before it, giving a coherent soft-RPS cycle in
 * which no unit dominates. Reading a row (attacker) across columns (defender):
 *   - spearman: strong vs cavalry, archer;  weak vs siege, knight.
 *   - cavalry:  strong vs archer, siege;    weak vs knight, spearman.
 *   - archer:   strong vs siege, knight;    weak vs spearman, cavalry.
 *   - siege:    strong vs knight, spearman; weak vs cavalry, archer.
 *   - knight:   strong vs spearman, cavalry; weak vs archer, siege.
 *
 * CombatSystem reads this (via {@link troopVsEnemyMultiplier}) so army
 * composition genuinely changes battle outcomes: fielding the troop that
 * counters a wave's dominant enemy role yields more effective power than an
 * equal-cost off-counter stack.
 */
export const TROOP_COUNTER: Record<TroopKind, Record<TroopKind, number>> = {
  spearman: { spearman: 1.0, cavalry: 1.5, archer: 1.5, siege: 0.75, knight: 0.75 },
  cavalry: { spearman: 0.75, cavalry: 1.0, archer: 1.5, siege: 1.5, knight: 0.75 },
  archer: { spearman: 0.75, cavalry: 0.75, archer: 1.0, siege: 1.5, knight: 1.5 },
  siege: { spearman: 1.5, cavalry: 0.75, archer: 0.75, siege: 1.0, knight: 1.5 },
  knight: { spearman: 1.5, cavalry: 1.5, archer: 0.75, siege: 0.75, knight: 1.0 },
};

/**
 * Which troop ROLE each enemy kind fights like, so the soft-RPS
 * {@link TROOP_COUNTER} matrix applies to the wave roster too:
 *   - raider: light, fast skirmisher      -> spearman-role
 *   - brute:  durable heavy infantry       -> knight-role
 *   - ram:    slow, armored siege engine   -> siege-role
 *   - rider:  fast raider-cavalry          -> cavalry-role
 * A troop's multiplier against an enemy is the matrix entry for its own kind
 * versus the enemy's analogous role.
 */
export const ENEMY_ROLE: Record<EnemyKind, TroopKind> = {
  raider: 'spearman',
  brute: 'knight',
  ram: 'siege',
  rider: 'cavalry',
};

/**
 * The soft-RPS damage multiplier a `troop` deals against an `enemy`, resolved
 * through the enemy's analogous troop role. Pure and deterministic; feeds the
 * composition-aware effective power in CombatSystem.
 */
export function troopVsEnemyMultiplier(troop: TroopKind, enemy: EnemyKind): number {
  return TROOP_COUNTER[troop][ENEMY_ROLE[enemy]];
}

/** Enemy raider stat blocks (used by CombatSystem via WaveConfig composition). */
export const ENEMY_DEFS: Record<EnemyKind, UnitStats> = {
  raider: { hp: 50, attack: 9, attackSpeed: 1.0, speed: 65, range: 24 },
  brute: { hp: 130, attack: 18, attackSpeed: 0.7, speed: 45, range: 26 },
  ram: { hp: 260, attack: 30, attackSpeed: 0.5, speed: 35, range: 30 },
  // Fast raider-cavalry: nimble flankers that appear in later waves. Moderate
  // hp, quick and hard-hitting, so an all-off-counter defence bleeds against them.
  rider: { hp: 85, attack: 16, attackSpeed: 1.1, speed: 90, range: 26 },
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
