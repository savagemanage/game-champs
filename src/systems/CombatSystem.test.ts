import { describe, it, expect } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { waveComposition, waveReward } from '../config/WaveConfig';
import type { Army } from '../types';

/**
 * Unit tests for the deterministic combat resolver: clear win, clear loss, and a
 * close win, plus reward payout and casualty behaviour. Determinism is asserted
 * by resolving the same inputs twice.
 */
describe('CombatSystem', () => {
  const army = (a: Partial<Army>): Army => ({
    spearman: 0,
    archer: 0,
    knight: 0,
    cavalry: 0,
    siege: 0,
    ...a,
  });

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
    // armyPower is the composition-aware effective power that decided the fight.
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

    // Find army sizes that produce a dominant win vs. a near-tie win. Size the
    // close army by EFFECTIVE (composition-aware) power, since that is what the
    // resolver compares against the wave.
    const dominant = CombatSystem.resolve(army({ knight: 200 }), wave);
    let n = 1;
    while (CombatSystem.effectiveArmyPower(army({ knight: n }), wave) < wavePower) n++;
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

  it('army composition matters: the countering troop is more effective', () => {
    // Wave 1 is all raiders (light/fast, spearman-role). Under the extended
    // counter cycle, KNIGHTS counter spearman-role (1.5x) while CAVALRY are
    // weak against it (0.75x). With equal COUNTS the knight stack must field
    // more effective power than the cavalry stack against this wave.
    const wave = 1;
    const counters = army({ knight: 20 });
    const offCounter = army({ cavalry: 20 });

    const counterEff = CombatSystem.effectiveArmyPower(counters, wave);
    const offEff = CombatSystem.effectiveArmyPower(offCounter, wave);
    // The counter multiplier genuinely feeds the resolver: the countering stack
    // exceeds its raw power, the off-counter stack falls short of its own.
    expect(counterEff).toBeGreaterThan(CombatSystem.armyPower(counters));
    expect(offEff).toBeLessThan(CombatSystem.armyPower(offCounter));

    // Same-matchup normalized: the counter army converts a higher fraction of
    // its raw power into effective power than the off-counter army.
    expect(counterEff / CombatSystem.armyPower(counters)).toBeGreaterThan(
      offEff / CombatSystem.armyPower(offCounter),
    );
  });

  it('the counter matrix flips a knife-edge outcome (win vs loss on equal raw power)', () => {
    // Wave 1 is all raiders (spearman-role). Knights counter them (1.5x),
    // cavalry are weak (0.75x). Build two armies of (near) EQUAL raw power and
    // show the countering composition wins where the off-counter one loses.
    const wave = 1;

    // Smallest knight count whose EFFECTIVE power beats the wave.
    let knights = 1;
    while (CombatSystem.effectiveArmyPower(army({ knight: knights }), wave) < CombatSystem.wavePower(wave)) {
      knights++;
    }
    const knightRaw = CombatSystem.armyPower(army({ knight: knights }));

    // A cavalry stack of the SAME raw power (cavalry is cheaper raw power per
    // unit, so this needs more bodies) - but weak into the wave, so it should
    // lose the same fight the knights win.
    const cavalryCount = Math.floor(knightRaw / CombatSystem.armyPower(army({ cavalry: 1 })));

    const knightResult = CombatSystem.resolve(army({ knight: knights }), wave);
    const cavalryResult = CombatSystem.resolve(army({ cavalry: cavalryCount }), wave);

    // Equal raw power within a modest tolerance (integer unit counts make exact
    // equality impossible; the point is the matchup, not the rounding).
    expect(Math.abs(CombatSystem.armyPower(army({ cavalry: cavalryCount })) - knightRaw)).toBeLessThan(
      knightRaw * 0.25,
    );
    // The matchup decides it: counter wins, off-counter loses.
    expect(knightResult.win).toBe(true);
    expect(cavalryResult.win).toBe(false);
  });

  it('every troop kind contributes power and appears in survivor/casualty bundles', () => {
    // Each troop kind, fielded alone, must add positive raw power (proving the
    // new kinds are wired into the resolver, not silently ignored).
    for (const kind of ['spearman', 'archer', 'knight', 'cavalry', 'siege'] as const) {
      expect(CombatSystem.armyPower(army({ [kind]: 5 }))).toBeGreaterThan(0);
    }
    // A win result carries a full per-kind survivor/casualty bundle over every
    // troop kind (built from TROOP_ORDER, so no kind is missing).
    const result = CombatSystem.resolve(army({ knight: 60, siege: 10 }), 1);
    expect(result.win).toBe(true);
    const kinds: (keyof Army)[] = ['spearman', 'archer', 'knight', 'cavalry', 'siege'];
    for (const kind of kinds) {
      expect(result.survivors[kind]).toBeDefined();
      expect(result.casualties[kind]).toBeDefined();
    }
  });

  it('the new rider enemy appears at higher waves and is exercised in combat', () => {
    // Riders (cavalry-role) join from wave 7, so late waves carry them and the
    // resolver must account for them (a rider-inclusive wave has more power).
    const early = waveComposition(6);
    const late = waveComposition(9);
    expect(early.some((e) => e.kind === 'rider')).toBe(false);
    expect(late.some((e) => e.kind === 'rider')).toBe(true);
    // The rider slice adds enemy power, so wave 9 is strictly harder than wave 6.
    expect(CombatSystem.wavePower(9)).toBeGreaterThan(CombatSystem.wavePower(6));
  });
});
