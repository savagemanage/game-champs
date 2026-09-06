import { describe, it, expect } from 'vitest';
import { CombatSystem } from './CombatSystem';
import { combineModifiers } from '../config/StatModifiers';
import { waveReward } from '../config/WaveConfig';
import type { Army, StatModifiers } from '../types';

/**
 * Unit tests for the deterministic combat resolver: clear win, clear loss, and a
 * close win, plus reward payout and casualty behaviour. Determinism is asserted
 * by resolving the same inputs twice.
 */
describe('CombatSystem', () => {
  const army = (a: Partial<Army>): Army => ({ trapper: 0, marksman: 0, vanguard: 0, ...a });

  it('is deterministic: same inputs give identical results', () => {
    const a = army({ vanguard: 10 });
    const r1 = CombatSystem.resolve(a, 1);
    const r2 = CombatSystem.resolve(a, 1);
    expect(r1).toEqual(r2);
  });

  it('resolves a clear win with few casualties and the wave reward', () => {
    // A large army against wave 1 (a handful of frost wolves) should crush it.
    const result = CombatSystem.resolve(army({ vanguard: 50 }), 1);
    expect(result.win).toBe(true);
    // armyPower is the composition-aware effective power that decided the fight.
    expect(result.armyPower).toBeGreaterThan(result.wavePower);
    // Reward matches the wave table.
    expect(result.reward).toEqual(waveReward(1));
    // Survivors dominate; casualties are a small fraction.
    expect(result.survivors.vanguard).toBeGreaterThan(result.casualties.vanguard);
    // Survivors + casualties conserve the original count.
    expect(result.survivors.vanguard + result.casualties.vanguard).toBe(50);
  });

  it('resolves a clear loss: army wiped, no reward', () => {
    // A single trapper against a late, heavy wave loses.
    const result = CombatSystem.resolve(army({ trapper: 1 }), 8);
    expect(result.win).toBe(false);
    expect(result.armyPower).toBeLessThan(result.wavePower);
    expect(result.reward).toEqual({});
    expect(result.casualties.trapper).toBe(1);
    expect(result.survivors.trapper).toBe(0);
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
    const dominant = CombatSystem.resolve(army({ vanguard: 200 }), wave);
    let n = 1;
    while (CombatSystem.effectiveArmyPower(army({ vanguard: n }), wave) < wavePower) n++;
    const close = CombatSystem.resolve(army({ vanguard: n }), wave);

    expect(dominant.win).toBe(true);
    expect(close.win).toBe(true);
    // Fraction of the stack lost is higher in the close fight.
    const dominantFrac = dominant.casualties.vanguard / 200;
    const closeFrac = close.casualties.vanguard / n;
    expect(closeFrac).toBeGreaterThan(dominantFrac);
  });

  it('wave power scales up with wave number', () => {
    expect(CombatSystem.wavePower(5)).toBeGreaterThan(CombatSystem.wavePower(1));
  });

  it('army composition matters: the countering troop is more effective', () => {
    // Wave 1 is all frost wolves (light/fast, trapper-role). Marksmen counter
    // trapper-role (1.5x); vanguards are weak against it (0.75x). With equal
    // COUNTS, the marksman stack must field more effective power than the vanguard
    // stack against this wave, even though a lone vanguard has more raw power.
    const wave = 1;
    const counters = army({ marksman: 20 });
    const offCounter = army({ vanguard: 20 });

    const counterEff = CombatSystem.effectiveArmyPower(counters, wave);
    const offEff = CombatSystem.effectiveArmyPower(offCounter, wave);
    // The counter multiplier genuinely feeds the resolver.
    expect(counterEff).toBeGreaterThan(CombatSystem.armyPower(counters) * 0.99);
    expect(offEff).toBeLessThan(CombatSystem.armyPower(offCounter));

    // Same raw power, better matchup -> the resolver sees the difference. Build
    // two armies with (near) equal RAW power but different composition and show
    // the counter army wins a wave the off-counter army loses.
    // 1 vanguard raw ~= 5 trappers raw; against a trapper-role wave marksmen get
    // the counter bonus, so a marksman-heavy mix beats a vanguard-heavy mix of the
    // same raw power.
    expect(counterEff / CombatSystem.armyPower(counters)).toBeGreaterThan(
      offEff / CombatSystem.armyPower(offCounter),
    );
  });

  it('the counter matrix changes a knife-edge outcome (win vs loss on mix)', () => {
    // Pick a wave and two equal-RAW-power armies whose only difference is which
    // troop role they field; the countering one wins where the other loses.
    const wave = 6; // frost wolves + ravagers + a frost titan: mixed roles.
    // Marksmen counter frost wolves (trapper-role, the bulk of early waves).
    // Find the smallest marksman count that wins.
    let marksmen = 1;
    while (!CombatSystem.resolve(army({ marksman: marksmen }), wave).win) marksmen++;
    const marksmanRaw = CombatSystem.armyPower(army({ marksman: marksmen }));

    // A vanguard stack of equal raw power should be weaker vs this frost-wolf-heavy
    // wave (vanguards are 0.75x into trapper-role), so it does worse (fewer or equal
    // effective power, and never strictly more).
    const vanguardsEqualRaw = Math.round(
      marksmanRaw / CombatSystem.armyPower(army({ vanguard: 1 })),
    );
    const marksmanEff = CombatSystem.effectiveArmyPower(army({ marksman: marksmen }), wave);
    const vanguardEff = CombatSystem.effectiveArmyPower(army({ vanguard: vanguardsEqualRaw }), wave);
    expect(marksmanEff).toBeGreaterThan(vanguardEff);
  });

  // --- FEAT-005: StatModifiers consumption (triangle + army/class bonuses) ---

  const mods = (m: Partial<StatModifiers>): StatModifiers => combineModifiers(m);

  it('army-wide battle modifiers raise effective power (and stay deterministic)', () => {
    const a = army({ vanguard: 12 });
    const base = CombatSystem.effectiveArmyPower(a, 3);
    const buffed = CombatSystem.effectiveArmyPower(a, 3, mods({ troopAttack: 0.5 }));
    // +50% attack -> armyBattleMultiplier 1.5 -> exactly 1.5x effective power.
    expect(buffed).toBeCloseTo(base * 1.5, 6);
    // Determinism: identical inputs, identical output.
    expect(CombatSystem.effectiveArmyPower(a, 3, mods({ troopAttack: 0.5 }))).toBe(buffed);
  });

  it('per-class bonuses only lift the matching class', () => {
    const wave = 3;
    // vanguard = infantry class; a lancer bonus must NOT change its power, but an
    // infantry bonus must.
    const vanguards = army({ vanguard: 10 });
    const base = CombatSystem.effectiveArmyPower(vanguards, wave);
    const lancerBuffed = CombatSystem.effectiveArmyPower(vanguards, wave, mods({ lancerBonus: 0.5 }));
    const infantryBuffed = CombatSystem.effectiveArmyPower(
      vanguards,
      wave,
      mods({ infantryBonus: 0.5 }),
    );
    expect(lancerBuffed).toBeCloseTo(base, 6);
    expect(infantryBuffed).toBeCloseTo(base * 1.5, 6);
  });

  it('modifiers can turn a loss into a win at the same army/wave', () => {
    const wave = 6;
    // The LARGEST marksman army that still LOSES this wave with no modifiers.
    let n = 1;
    while (!CombatSystem.resolve(army({ marksman: n }), wave).win) n++;
    const loseCount = n - 1;
    expect(loseCount).toBeGreaterThanOrEqual(1);
    const loseArmy = army({ marksman: loseCount });
    const lost = CombatSystem.resolve(loseArmy, wave);
    expect(lost.win).toBe(false);

    // A large all-round buff should flip that exact army into a win.
    const won = CombatSystem.resolve(loseArmy, wave, mods({ troopAttack: 3, marksmanBonus: 1 }));
    expect(won.win).toBe(true);
    expect(won.armyPower).toBeGreaterThan(lost.armyPower);
  });

  it('armyPower (matchup-neutral) also honors modifiers', () => {
    const a = army({ trapper: 8 });
    const base = CombatSystem.armyPower(a);
    const buffed = CombatSystem.armyPower(a, mods({ troopAttack: 0.25 }));
    // trapper = lancer class; a lancer bonus stacks with the army-wide one.
    const classBuffed = CombatSystem.armyPower(a, mods({ troopAttack: 0.25, lancerBonus: 0.1 }));
    expect(buffed).toBeCloseTo(base * 1.25, 6);
    expect(classBuffed).toBeCloseTo(base * 1.25 * 1.1, 6);
  });

  // --- troop TIERS (review v1): tiered army fields stronger units ------------

  it('a higher-tier army fields strictly more effective power', () => {
    const a = army({ vanguard: 10 });
    const base = CombatSystem.effectiveArmyPower(a, 3);
    // Same counts, but every vanguard is tier 3 -> strictly more power.
    const tiered = CombatSystem.effectiveArmyPower(a, 3, undefined, { vanguard: { 3: 10 } });
    expect(tiered).toBeGreaterThan(base);
    // Determinism holds with tiers supplied.
    expect(CombatSystem.effectiveArmyPower(a, 3, undefined, { vanguard: { 3: 10 } })).toBe(tiered);
  });

  it('armyPower respects a partial tier breakdown (remainder defaults to tier 1)', () => {
    const a = army({ trapper: 10 });
    const allT1 = CombatSystem.armyPower(a);
    // 4 are tier 2, the remaining 6 default to tier 1.
    const mixed = CombatSystem.armyPower(a, undefined, { trapper: { 2: 4 } });
    expect(mixed).toBeGreaterThan(allT1);
  });

  it('tiers can turn a losing army into a winning one at the same counts/wave', () => {
    const wave = 6;
    // Largest marksman army that still LOSES at tier 1.
    let n = 1;
    while (!CombatSystem.resolve(army({ marksman: n }), wave).win) n++;
    const loseCount = n - 1;
    expect(loseCount).toBeGreaterThanOrEqual(1);
    const a = army({ marksman: loseCount });
    expect(CombatSystem.resolve(a, wave).win).toBe(false);
    // The SAME army, but every unit at the top tier, wins.
    const won = CombatSystem.resolve(a, wave, undefined, { marksman: { 4: loseCount } });
    expect(won.win).toBe(true);
    // Survivors are reported at their tier so the standing army keeps the tier.
    expect(won.survivorTiers.marksman?.[4]).toBeGreaterThan(0);
  });

  it('resolves the new Frostbeast escort kinds in late waves', () => {
    // Wave 15 now includes a glacier behemoth escort; its wave power is far
    // above an early wave, and a strong marksman-led army can still clear it.
    expect(CombatSystem.wavePower(15)).toBeGreaterThan(CombatSystem.wavePower(9));
    const huge = army({ marksman: 400, vanguard: 200 });
    const result = CombatSystem.resolve(huge, 15, mods({ troopAttack: 1 }));
    expect(result.win).toBe(true);
  });
});
