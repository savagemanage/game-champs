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

  it('town defense is neutral by default (0) and does not change legacy outcomes', () => {
    // Resolving without a townDefense param behaves exactly as before.
    const a = army({ knight: 10 });
    const withoutParam = CombatSystem.resolve(a, 1);
    const withZero = CombatSystem.resolve(a, 1, { townDefense: 0 });
    expect(withoutParam).toEqual(withZero);
    expect(withoutParam.townDefense).toBe(0);
    // effectiveArmyPower is unchanged when townDefense defaults to 0.
    expect(CombatSystem.effectiveArmyPower(a, 1)).toBe(
      CombatSystem.effectiveArmyPower(a, 1, 1, 0),
    );
  });

  it('town defense adds flat effective power (a walled town beats a raid a bare one loses)', () => {
    // Find an army that LOSES a wave with no defense (its effective power is
    // just below the wave power), then show enough town defense flips it to a
    // win by adding flat power over the top.
    const wave = 4;
    const wavePower = CombatSystem.wavePower(wave);
    let knights = 1;
    while (CombatSystem.effectiveArmyPower(army({ knight: knights }), wave) >= wavePower) {
      knights = Math.max(1, knights - 1);
      break;
    }
    // Shrink until it is a genuine loss with 0 defense.
    while (CombatSystem.effectiveArmyPower(army({ knight: knights }), wave) >= wavePower && knights > 1) {
      knights--;
    }
    const a = army({ knight: knights });
    const bare = CombatSystem.resolve(a, wave, { townDefense: 0 });
    expect(bare.win).toBe(false);

    // The exact defense needed to cover the shortfall turns it into a win.
    const shortfall = wavePower - CombatSystem.effectiveArmyPower(a, wave);
    const walled = CombatSystem.resolve(a, wave, { townDefense: shortfall + 1 });
    expect(walled.win).toBe(true);
    expect(walled.townDefense).toBe(shortfall + 1);
  });

  it('a raid LOST with 0 defense is materially cheaper with adequate defense', () => {
    // A small army that cannot win wave 5, resolved bare vs. well-defended.
    const wave = 5;
    const a = army({ spearman: 3 });
    const bare = CombatSystem.resolve(a, wave, { townDefense: 0 });
    const wavePower = CombatSystem.wavePower(wave);
    // "Adequate" but still short of a win: defense covering ~80% of the wave.
    const armyPow = CombatSystem.effectiveArmyPower(a, wave);
    const defended = CombatSystem.resolve(a, wave, {
      townDefense: Math.max(0, wavePower * 0.8 - armyPow),
    });

    expect(bare.win).toBe(false);
    expect(defended.win).toBe(false);

    // Casualties: the bare town loses its whole army; walls keep a garrison.
    const bareCas = bare.casualties.spearman;
    const defendedCas = defended.casualties.spearman;
    expect(bareCas).toBe(3);
    expect(defendedCas).toBeLessThan(bareCas);
    expect(defended.survivors.spearman).toBeGreaterThan(bare.survivors.spearman);

    // Sack penalty: the bare town is looted; the defended town far less.
    const bareLoot = bare.penalty.wood ?? 0;
    const defendedLoot = defended.penalty.wood ?? 0;
    expect(bareLoot).toBeGreaterThan(0);
    expect(defendedLoot).toBeLessThan(bareLoot);
  });

  it('a low-defense loss costs strictly more than a high-defense loss', () => {
    const wave = 6;
    const a = army({ spearman: 4 });
    const armyPow = CombatSystem.effectiveArmyPower(a, wave);
    const wavePower = CombatSystem.wavePower(wave);

    const low = CombatSystem.resolve(a, wave, { townDefense: 0 });
    // High defense, but still not enough to win (covers most of the shortfall).
    const high = CombatSystem.resolve(a, wave, {
      townDefense: Math.max(0, (wavePower - armyPow) * 0.9),
    });
    expect(low.win).toBe(false);
    expect(high.win).toBe(false);

    const lootOf = (r: typeof low.penalty): number =>
      (r.food ?? 0) + (r.wood ?? 0) + (r.stone ?? 0) + (r.gold ?? 0);
    // More resources sacked AND more troops lost with low defense.
    expect(lootOf(low.penalty)).toBeGreaterThan(lootOf(high.penalty));
    const lowCas = low.casualties.spearman;
    const highCas = high.casualties.spearman;
    expect(lowCas).toBeGreaterThanOrEqual(highCas);
    expect(low.survivors.spearman).toBeLessThanOrEqual(high.survivors.spearman);
  });

  it('town defense composes with the research/hero attack multiplier', () => {
    // Same army + wave: attack multiplier and town defense both raise the
    // reported effective power, and together beat a raid neither alone wins.
    const wave = 5;
    const a = army({ knight: 4 });
    const base = CombatSystem.effectiveArmyPower(a, wave);
    const wavePower = CombatSystem.wavePower(wave);
    expect(base).toBeLessThan(wavePower); // a genuine loss unassisted.

    // Pick a modest attack mult and a modest defense that each alone fall short
    // but together clear the wave.
    const attackMult = 1.2;
    const withAttack = CombatSystem.effectiveArmyPower(a, wave, attackMult);
    const townDefense = wavePower - withAttack + 1; // just enough on top.
    expect(townDefense).toBeGreaterThan(0);
    const composed = CombatSystem.resolve(a, wave, { attackMult, townDefense });
    expect(composed.win).toBe(true);
    // The composed power is attack-scaled base plus flat defense.
    expect(composed.armyPower).toBeCloseTo(withAttack + townDefense, 6);
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
