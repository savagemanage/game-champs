/**
 * MetaProgress.ts - pure meta-progression for LAST SQUAD.
 *
 * Coins earned across runs buy permanent upgrades on a geometric cost curve.
 * Upgrade levels are folded into a {@link DerivedStats} block that a run reads
 * to seed the squad. All functions are pure and Phaser-free; the caller owns
 * the mutable {@link MetaUpgradeState} and coin balance (typically inside the
 * persisted GameState).
 */

import { META, SQUAD, UPGRADE_ORDER } from '../config/GameConfig';
import type { DerivedStats, MetaUpgradeKind, MetaUpgradeState, RunResult } from '../types';

/** A fresh, all-zero upgrade state (nothing purchased yet). */
export function freshUpgrades(): MetaUpgradeState {
  const out = {} as MetaUpgradeState;
  for (const kind of UPGRADE_ORDER) out[kind] = 0;
  return out;
}

/** Maximum purchasable level for an upgrade. */
export function maxLevel(kind: MetaUpgradeKind): number {
  return META.UPGRADES[kind].max;
}

/**
 * Cost of buying the NEXT level of an upgrade given its current level, using
 * the geometric curve `round(base * GROWTH^level)`. Returns Infinity when the
 * upgrade is already maxed (so affordability checks naturally fail).
 */
export function upgradeCost(kind: MetaUpgradeKind, currentLevel: number): number {
  const def = META.UPGRADES[kind];
  if (currentLevel >= def.max) return Infinity;
  return Math.round(def.base * Math.pow(META.GROWTH, currentLevel));
}

/** Whether the player can afford the next level of an upgrade. */
export function canAfford(kind: MetaUpgradeKind, upgrades: MetaUpgradeState, coins: number): boolean {
  const level = upgrades[kind] ?? 0;
  if (level >= maxLevel(kind)) return false;
  return coins >= upgradeCost(kind, level);
}

/** Result of a purchase attempt. */
export interface PurchaseResult {
  /** Whether the purchase succeeded. */
  ok: boolean;
  /** Coin balance after the purchase (unchanged on failure). */
  coins: number;
  /** Upgrade state after the purchase (unchanged on failure). */
  upgrades: MetaUpgradeState;
  /** Coins spent (0 on failure). */
  spent: number;
}

/**
 * Attempt to buy the next level of an upgrade. Pure: returns NEW coin balance
 * and a NEW upgrade state rather than mutating the inputs. Fails (ok=false,
 * inputs echoed back) when maxed or unaffordable.
 */
export function purchaseUpgrade(
  kind: MetaUpgradeKind,
  upgrades: MetaUpgradeState,
  coins: number,
): PurchaseResult {
  const level = upgrades[kind] ?? 0;
  if (level >= maxLevel(kind) || !canAfford(kind, upgrades, coins)) {
    return { ok: false, coins, upgrades, spent: 0 };
  }
  const cost = upgradeCost(kind, level);
  const nextUpgrades: MetaUpgradeState = { ...upgrades, [kind]: level + 1 };
  return { ok: true, coins: coins - cost, upgrades: nextUpgrades, spent: cost };
}

/**
 * Fold upgrade levels into derived run stats. Each level adds `perLevel` on top
 * of the base config value; the coin bonus starts from a 1.0 base multiplier.
 */
export function deriveStats(upgrades: MetaUpgradeState): DerivedStats {
  const u = { ...freshUpgrades(), ...upgrades };
  return {
    startSize: SQUAD.START_SIZE + u.start_size * META.UPGRADES.start_size.perLevel,
    damage: SQUAD.DAMAGE + u.damage * META.UPGRADES.damage.perLevel,
    fireRate: SQUAD.FIRE_RATE + u.fire_rate * META.UPGRADES.fire_rate.perLevel,
    coinMultiplier: 1 + u.coin_bonus * META.UPGRADES.coin_bonus.perLevel,
  };
}

/**
 * Coins earned from a run BEFORE the coin multiplier: survivors + distance +
 * an optional win bonus. Floored to an integer. The multiplier is applied by
 * the run simulator (which knows the derived stats) so callers do not
 * double-count it; this helper exists for testing and display of the base.
 */
export function baseCoinsFor(result: Pick<RunResult, 'squadFinal' | 'distance' | 'win'>): number {
  const survivors = Math.max(0, result.squadFinal) * META.COINS_PER_SURVIVOR;
  const distance = (result.distance / 100) * META.COINS_PER_DISTANCE * 100;
  const winBonus = result.win ? META.COINS_WIN_BONUS : 0;
  return Math.floor(survivors + distance + winBonus);
}

/** Coins earned from a run AFTER applying the coin multiplier. */
export function coinsEarned(
  result: Pick<RunResult, 'squadFinal' | 'distance' | 'win'>,
  coinMultiplier: number,
): number {
  return Math.floor(baseCoinsFor(result) * coinMultiplier);
}
