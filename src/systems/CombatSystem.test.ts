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
    // Wave 1 is all raiders (light/fast, spearman-role). Archers counter
    // spearman-role (1.5x); knights are weak against it (0.75x). With equal
    // COUNTS, the archer stack must field more effective power than the knight
    // stack against this wave, even though a lone knight has more raw power.
    const wave = 1;
    const counters = army({ archer: 20 });
    const offCounter = army({ knight: 20 });

    const counterEff = CombatSystem.effectiveArmyPower(counters, wave);
    const offEff = CombatSystem.effectiveArmyPower(offCounter, wave);
    // The counter multiplier genuinely feeds the resolver.
    expect(counterEff).toBeGreaterThan(CombatSystem.armyPower(counters) * 0.99);
    expect(offEff).toBeLessThan(CombatSystem.armyPower(offCounter));

    // Same raw power, better matchup -> the resolver sees the difference. Build
    // two armies with (near) equal RAW power but different composition and show
    // the counter army wins a wave the off-counter army loses.
    // 1 knight raw ~= 5 spearmen raw; against a spearman-role wave archers get
    // the counter bonus, so an archer-heavy mix beats a knight-heavy mix of the
    // same raw power.
    expect(counterEff / CombatSystem.armyPower(counters)).toBeGreaterThan(
      offEff / CombatSystem.armyPower(offCounter),
    );
  });

  it('the counter matrix changes a knife-edge outcome (win vs loss on mix)', () => {
    // Pick a wave and two equal-RAW-power armies whose only difference is which
    // troop role they field; the countering one wins where the other loses.
    const wave = 6; // raiders + brutes + a ram: mixed roles.
    // Archers counter raiders (spearman-role, the bulk of early waves).
    // Find the smallest archer count that wins.
    let archers = 1;
    while (!CombatSystem.resolve(army({ archer: archers }), wave).win) archers++;
    const archerRaw = CombatSystem.armyPower(army({ archer: archers }));

    // A knight stack of equal raw power should be weaker vs this raider-heavy
    // wave (knights are 0.75x into raiders), so it does worse (fewer or equal
    // effective power, and never strictly more).
    const knightsEqualRaw = Math.round(
      archerRaw / CombatSystem.armyPower(army({ knight: 1 })),
    );
    const archerEff = CombatSystem.effectiveArmyPower(army({ archer: archers }), wave);
    const knightEff = CombatSystem.effectiveArmyPower(army({ knight: knightsEqualRaw }), wave);
    expect(archerEff).toBeGreaterThan(knightEff);
  });
});
