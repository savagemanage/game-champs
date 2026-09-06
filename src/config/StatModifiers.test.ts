import { describe, it, expect } from 'vitest';
import {
  STAT_MODIFIER_KEYS,
  armyBattleMultiplier,
  buildTimeMultiplier,
  classBattleMultiplier,
  combineModifiers,
  economyMultiplierFor,
  emptyModifiers,
} from './StatModifiers';

/**
 * Unit tests for the shared StatModifiers bundle + its pure combiner: the
 * additive identity, key-wise summation across sources (missing keys = 0), and
 * the derived multiplier helpers research/gear/heroes all funnel through.
 */
describe('StatModifiers combiner', () => {
  it('emptyModifiers is the all-zero additive identity', () => {
    const z = emptyModifiers();
    for (const key of STAT_MODIFIER_KEYS) expect(z[key]).toBe(0);
    // Combining nothing yields the identity.
    expect(combineModifiers()).toEqual(z);
    expect(combineModifiers(undefined, null)).toEqual(z);
  });

  it('sums partial bundles key-wise (bonuses are additive)', () => {
    const combined = combineModifiers(
      { economyOutput: 0.1, troopAttack: 0.05 },
      { economyOutput: 0.05, foodOutput: 0.2 },
      { troopAttack: 0.03 },
    );
    expect(combined.economyOutput).toBeCloseTo(0.15);
    expect(combined.foodOutput).toBeCloseTo(0.2);
    expect(combined.troopAttack).toBeCloseTo(0.08);
    // Untouched keys stay zero.
    expect(combined.buildSpeed).toBe(0);
    expect(combined.marksmanBonus).toBe(0);
  });

  it('ignores non-finite contributions defensively', () => {
    const combined = combineModifiers({ economyOutput: NaN as number }, { economyOutput: 0.2 });
    expect(combined.economyOutput).toBeCloseTo(0.2);
  });

  it('economyMultiplierFor adds the all-producer and resource-specific bonuses', () => {
    const mods = combineModifiers({ economyOutput: 0.1, foodOutput: 0.25, ironOutput: 0.4 });
    // Food gets economyOutput + foodOutput.
    expect(economyMultiplierFor(mods, 'food')).toBeCloseTo(1.35);
    // Iron gets economyOutput + ironOutput.
    expect(economyMultiplierFor(mods, 'iron')).toBeCloseTo(1.5);
    // Wood only gets the all-producer bonus.
    expect(economyMultiplierFor(mods, 'wood')).toBeCloseTo(1.1);
    // Never below 0.
    expect(economyMultiplierFor(combineModifiers({ economyOutput: -5 }), 'wood')).toBe(0);
  });

  it('buildTimeMultiplier turns a build-speed bonus into a shorter time', () => {
    expect(buildTimeMultiplier(emptyModifiers())).toBe(1);
    // +25% build speed -> 1 / 1.25 = 0.8 of the base time.
    expect(buildTimeMultiplier(combineModifiers({ buildSpeed: 0.25 }))).toBeCloseTo(0.8);
    // Faster (lower multiplier) when speed rises; never negative.
    expect(buildTimeMultiplier(combineModifiers({ buildSpeed: 1 }))).toBeCloseTo(0.5);
  });

  it('armyBattleMultiplier weights attack fully and hp/defense half', () => {
    expect(armyBattleMultiplier(emptyModifiers())).toBe(1);
    const mods = combineModifiers({ troopAttack: 0.2, troopHp: 0.2, troopDefense: 0.2 });
    // 0.2 + 0.5*0.2 + 0.5*0.2 = 0.4 -> 1.4x.
    expect(armyBattleMultiplier(mods)).toBeCloseTo(1.4);
  });

  it('classBattleMultiplier applies only the matching class bonus', () => {
    const mods = combineModifiers({ infantryBonus: 0.15, marksmanBonus: 0.3 });
    expect(classBattleMultiplier(mods, 'infantry')).toBeCloseTo(1.15);
    expect(classBattleMultiplier(mods, 'lancer')).toBeCloseTo(1.0);
    expect(classBattleMultiplier(mods, 'marksman')).toBeCloseTo(1.3);
  });
});
