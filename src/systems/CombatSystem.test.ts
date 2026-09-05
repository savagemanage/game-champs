import { describe, it, expect } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { waveReward } from '../config/WaveConfig';
import type { Army } from '../types';

/**
 * Unit tests for the deterministic combat resolver: clear win, clear loss, and a
 * close win, plus reward payout and casualty behaviour. Determinism is asserted
 * by resolving the same inputs twice.
 */
describe('CombatSystem', () => {
  const army = (a: Partial<Army>): Army => ({ spearman: 0, archer: 0, knight: 0, ...a });

  it('is deterministic: same inputs give identical results', () => {
    const a = army({ knight: 10 });
    const r1 = CombatSystem.resolve(a, 1);
    const r2 = CombatSystem.resolve(a, 1);
    expect(r1).toEqual(r2);
  });

  it('resolves a clear win with few casualties and the wave reward', () => {
    // A large army against wave 1 (a handful of raiders) should crush it.
    const result = CombatSystem.resolve(army({ knight: 50 }), 1);
    expect(result.win).toBe(true);
    expect(result.armyPower).toBeGreaterThan(result.wavePower);
    // Reward matches the wave table.
    expect(result.reward).toEqual(waveReward(1));
    // Survivors dominate; casualties are a small fraction.
    expect(result.survivors.knight).toBeGreaterThan(result.casualties.knight);
    // Survivors + casualties conserve the original count.
    expect(result.survivors.knight + result.casualties.knight).toBe(50);
  });

  it('resolves a clear loss: army wiped, no reward', () => {
    // A single spearman against a late, heavy wave loses.
    const result = CombatSystem.resolve(army({ spearman: 1 }), 8);
    expect(result.win).toBe(false);
    expect(result.armyPower).toBeLessThan(result.wavePower);
    expect(result.reward).toEqual({});
    expect(result.casualties.spearman).toBe(1);
    expect(result.survivors.spearman).toBe(0);
  });

  it('an empty army never wins', () => {
    const result = CombatSystem.resolve(army({}), 1);
    expect(result.win).toBe(false);
    expect(result.armyPower).toBe(0);
  });

  it('a close win costs proportionally more troops than a dominant win', () => {
    const wave = 3;
    const wavePower = CombatSystem.wavePower(wave);

    // Find army sizes that produce a dominant win vs. a near-tie win.
    const dominant = CombatSystem.resolve(army({ knight: 200 }), wave);
    // Barely enough: scale knights so army power is just over wave power.
    let n = 1;
    while (CombatSystem.armyPower(army({ knight: n })) < wavePower) n++;
    const close = CombatSystem.resolve(army({ knight: n }), wave);

    expect(dominant.win).toBe(true);
    expect(close.win).toBe(true);
    // Fraction of the stack lost is higher in the close fight.
    const dominantFrac = dominant.casualties.knight / 200;
    const closeFrac = close.casualties.knight / n;
    expect(closeFrac).toBeGreaterThan(dominantFrac);
  });

  it('wave power scales up with wave number', () => {
    expect(CombatSystem.wavePower(5)).toBeGreaterThan(CombatSystem.wavePower(1));
  });
});
