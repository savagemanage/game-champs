import { describe, it, expect } from 'vitest';
import {
  freshUpgrades,
  maxLevel,
  upgradeCost,
  canAfford,
  purchaseUpgrade,
  deriveStats,
  baseCoinsFor,
  coinsEarned,
} from './MetaProgress';
import { META, SQUAD } from '../config/GameConfig';

/**
 * Unit tests for pure meta-progression: geometric cost curve, affordability,
 * spending on purchase, derived-stat folding, and coin computation.
 */
describe('MetaProgress cost curve', () => {
  it('fresh upgrades are all zero', () => {
    expect(freshUpgrades()).toEqual({ start_size: 0, damage: 0, fire_rate: 0, coin_bonus: 0 });
  });

  it('first level costs the base', () => {
    expect(upgradeCost('start_size', 0)).toBe(META.UPGRADES.start_size.base);
  });

  it('grows geometrically', () => {
    const l0 = upgradeCost('start_size', 0);
    const l1 = upgradeCost('start_size', 1);
    const l2 = upgradeCost('start_size', 2);
    expect(l1).toBeGreaterThan(l0);
    expect(l2).toBeGreaterThan(l1);
    // Ratio approximates the configured growth factor.
    expect(l1 / l0).toBeCloseTo(META.GROWTH, 1);
  });

  it('returns Infinity at max level', () => {
    expect(upgradeCost('start_size', maxLevel('start_size'))).toBe(Infinity);
  });
});

describe('affordability + purchase', () => {
  it('cannot afford without enough coins', () => {
    expect(canAfford('start_size', freshUpgrades(), 0)).toBe(false);
  });

  it('purchase spends coins and raises the level', () => {
    const upgrades = freshUpgrades();
    const cost = upgradeCost('start_size', 0);
    const result = purchaseUpgrade('start_size', upgrades, cost + 5);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(cost);
    expect(result.coins).toBe(5);
    expect(result.upgrades.start_size).toBe(1);
    // Input state is not mutated (pure).
    expect(upgrades.start_size).toBe(0);
  });

  it('rejects a purchase the player cannot afford', () => {
    const upgrades = freshUpgrades();
    const result = purchaseUpgrade('start_size', upgrades, 0);
    expect(result.ok).toBe(false);
    expect(result.spent).toBe(0);
    expect(result.coins).toBe(0);
    expect(result.upgrades.start_size).toBe(0);
  });

  it('rejects a purchase at max level', () => {
    const maxed = { ...freshUpgrades(), start_size: maxLevel('start_size') };
    const result = purchaseUpgrade('start_size', maxed, 1_000_000);
    expect(result.ok).toBe(false);
  });
});

describe('deriveStats', () => {
  it('base stats with no upgrades', () => {
    const stats = deriveStats(freshUpgrades());
    expect(stats.startSize).toBe(SQUAD.START_SIZE);
    expect(stats.damage).toBe(SQUAD.DAMAGE);
    expect(stats.fireRate).toBe(SQUAD.FIRE_RATE);
    expect(stats.coinMultiplier).toBe(1);
  });

  it('each level raises the corresponding stat', () => {
    const upgrades = { start_size: 3, damage: 2, fire_rate: 1, coin_bonus: 4 };
    const stats = deriveStats(upgrades);
    expect(stats.startSize).toBe(SQUAD.START_SIZE + 3 * META.UPGRADES.start_size.perLevel);
    expect(stats.damage).toBe(SQUAD.DAMAGE + 2 * META.UPGRADES.damage.perLevel);
    expect(stats.fireRate).toBe(SQUAD.FIRE_RATE + 1 * META.UPGRADES.fire_rate.perLevel);
    expect(stats.coinMultiplier).toBeCloseTo(1 + 4 * META.UPGRADES.coin_bonus.perLevel, 6);
  });
});

describe('coin computation', () => {
  it('base coins reward survivors, distance and a win bonus', () => {
    const noWin = baseCoinsFor({ squadFinal: 10, distance: 1000, win: false });
    const win = baseCoinsFor({ squadFinal: 10, distance: 1000, win: true });
    expect(win - noWin).toBe(META.COINS_WIN_BONUS);
    expect(noWin).toBeGreaterThan(0);
  });

  it('coin multiplier scales earnings', () => {
    const base = baseCoinsFor({ squadFinal: 10, distance: 500, win: false });
    expect(coinsEarned({ squadFinal: 10, distance: 500, win: false }, 2)).toBe(Math.floor(base * 2));
  });
});
