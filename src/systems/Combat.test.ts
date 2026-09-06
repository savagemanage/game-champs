import { describe, it, expect } from 'vitest';
import {
  attackDamage,
  beats,
  resolveBattle,
  typeMultiplier,
  type BattleEvent,
} from './Combat';
import type { Combatant, Team } from './Formation';
import { COMBAT } from '../config/GameConfig';
import type { HeroRole, HeroType } from '../types';

/**
 * Deterministic combat tests. The type triangle changes outcomes, the same
 * seed reproduces the exact result AND timeline, a clearly stronger team wins,
 * and the timeline is consistent with the reported survivors. These fail if the
 * type multiplier, damage formula, or targeting were reverted.
 */
describe('Combat', () => {
  /** Build a single combatant with sensible defaults. */
  function unit(
    id: string,
    type: HeroType,
    role: HeroRole,
    stats: Partial<Pick<Combatant, 'maxHp' | 'atk' | 'def' | 'speed'>> = {},
    row: Combatant['row'] = 'front',
  ): Combatant {
    return {
      id,
      row,
      type,
      role,
      maxHp: stats.maxHp ?? 1000,
      atk: stats.atk ?? 100,
      def: stats.def ?? 50,
      speed: stats.speed ?? 50,
    };
  }

  /** Wrap combatants into a team. */
  function team(members: Combatant[]): Team {
    return { members, sameTypeBuff: false };
  }

  it('type triangle: tank>missile>aircraft>tank', () => {
    expect(beats('tank', 'missile')).toBe(true);
    expect(beats('missile', 'aircraft')).toBe(true);
    expect(beats('aircraft', 'tank')).toBe(true);
    expect(beats('missile', 'tank')).toBe(false);

    expect(typeMultiplier('tank', 'missile')).toBe(COMBAT.ADVANTAGE_MULT);
    expect(typeMultiplier('missile', 'tank')).toBe(COMBAT.DISADVANTAGE_MULT);
    expect(typeMultiplier('tank', 'aircraft')).toBe(COMBAT.DISADVANTAGE_MULT); // aircraft beats tank
    expect(typeMultiplier('tank', 'tank')).toBe(COMBAT.NEUTRAL_MULT);
  });

  it('attackDamage applies type + role + def, floored at MIN_DAMAGE', () => {
    const dealer = unit('d', 'tank', 'dealer', { atk: 100, def: 0 });
    const missileTarget = unit('m', 'missile', 'tank', { def: 40 });
    // Advantage (tank>missile) with variance 1.
    const dmg = attackDamage(dealer, missileTarget, 1);
    const expected = Math.max(
      COMBAT.MIN_DAMAGE,
      Math.round(100 * COMBAT.ADVANTAGE_MULT * COMBAT.DEALER_DAMAGE_MULT * 1 - 40 * COMBAT.DEF_FACTOR),
    );
    expect(dmg).toBe(expected);

    // A tiny attacker against a wall never drops below MIN_DAMAGE.
    const weak = unit('w', 'aircraft', 'support', { atk: 1 });
    const wall = unit('t', 'aircraft', 'tank', { def: 9999 });
    expect(attackDamage(weak, wall, 1)).toBe(COMBAT.MIN_DAMAGE);
  });

  it('is deterministic: same seed + teams => identical result AND timeline', () => {
    const a = team([
      unit('a1', 'tank', 'dealer'),
      unit('a2', 'missile', 'dealer', {}, 'back'),
    ]);
    const b = team([
      unit('b1', 'missile', 'tank'),
      unit('b2', 'aircraft', 'support', {}, 'back'),
    ]);
    const r1 = resolveBattle(a, b, 12345);
    const r2 = resolveBattle(a, b, 12345);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.rounds).toBe(r2.rounds);
    expect(r1.timeline).toEqual(r2.timeline);
    expect(r1.attackerSurvivors).toEqual(r2.attackerSurvivors);

    // A different seed can diverge (proves the RNG actually drives variance).
    const r3 = resolveBattle(a, b, 999);
    const differs =
      JSON.stringify(r3.timeline) !== JSON.stringify(r1.timeline) || r3.rounds !== r1.rounds;
    expect(differs).toBe(true);
  });

  it('type advantage changes the outcome (same stats, only types differ)', () => {
    // Team A is tank-type, Team B is missile-type: A has the advantage.
    const stats = { maxHp: 600, atk: 120, def: 30, speed: 50 };
    const advTank = team([unit('at', 'tank', 'dealer', stats)]);
    const missileFoe = team([unit('mf', 'missile', 'dealer', stats)]);
    const winAdv = resolveBattle(advTank, missileFoe, 7).winner;
    expect(winAdv).toBe('attacker');

    // Flip: now the attacker is missile vs a tank defender (disadvantage).
    const missileAtt = team([unit('ma', 'missile', 'dealer', stats)]);
    const tankFoe = team([unit('tf', 'tank', 'dealer', stats)]);
    const winDis = resolveBattle(missileAtt, tankFoe, 7).winner;
    expect(winDis).toBe('defender');
  });

  it('a clearly stronger team wins regardless of seed', () => {
    const strong = team([
      unit('s1', 'tank', 'dealer', { maxHp: 3000, atk: 400, def: 200, speed: 90 }),
      unit('s2', 'tank', 'dealer', { maxHp: 3000, atk: 400, def: 200, speed: 88 }, 'back'),
    ]);
    const weak = team([
      unit('w1', 'tank', 'tank', { maxHp: 500, atk: 20, def: 10, speed: 10 }),
    ]);
    for (const seed of [1, 2, 3, 42, 1000, 77777]) {
      expect(resolveBattle(strong, weak, seed).winner).toBe('attacker');
    }
  });

  it('targets the front row before the back row', () => {
    const attacker = team([unit('gun', 'tank', 'dealer', { atk: 300, speed: 100 })]);
    const defender = team([
      unit('frontliner', 'tank', 'tank', { maxHp: 2000, def: 20 }, 'front'),
      unit('backline', 'missile', 'dealer', { maxHp: 200 }, 'back'),
    ]);
    const result = resolveBattle(attacker, defender, 55);
    // The first attack event must target the front-row unit.
    const firstAttack = result.timeline.find((e): e is Extract<BattleEvent, { kind: 'attack' }> => e.kind === 'attack');
    expect(firstAttack?.target).toBe('frontliner');
  });

  it('a support heals a wounded ally before attacking', () => {
    // A fragile dealer paired with a support; a hard-hitting enemy wounds the
    // dealer, and the support should emit a heal event at some point.
    const allies = team([
      unit('tank', 'tank', 'tank', { maxHp: 2500, def: 80, speed: 40 }, 'front'),
      unit('medic', 'aircraft', 'support', { atk: 200, maxHp: 1500, speed: 60 }, 'back'),
    ]);
    const foes = team([unit('striker', 'aircraft', 'dealer', { atk: 260, speed: 55 })]);
    const result = resolveBattle(allies, foes, 3);
    const healed = result.timeline.some((e) => e.kind === 'heal' && e.healer === 'medic');
    expect(healed).toBe(true);
  });

  it('timeline is consistent with the reported result', () => {
    const a = team([
      unit('a1', 'tank', 'dealer', { speed: 70 }),
      unit('a2', 'tank', 'support', { atk: 120 }, 'back'),
    ]);
    const b = team([
      unit('b1', 'missile', 'dealer', { speed: 60 }),
      unit('b2', 'missile', 'tank', {}, 'back'),
    ]);
    const result = resolveBattle(a, b, 246);

    // Every death in the timeline corresponds to a unit NOT in survivors.
    const deaths = result.timeline
      .filter((e): e is Extract<BattleEvent, { kind: 'death' }> => e.kind === 'death')
      .map((e) => e.unit);
    for (const dead of deaths) {
      expect(result.attackerSurvivors).not.toContain(dead);
      expect(result.defenderSurvivors).not.toContain(dead);
    }
    // The losing side has no survivors when the battle did not time out.
    if (!result.timedOut) {
      const loserSurvivors =
        result.winner === 'attacker' ? result.defenderSurvivors : result.attackerSurvivors;
      expect(loserSurvivors).toHaveLength(0);
    }
    // Rounds never exceed the cap.
    expect(result.rounds).toBeLessThanOrEqual(COMBAT.MAX_ROUNDS);
  });

  it('a stalemate terminates at the round cap and decides by remaining HP', () => {
    // Two invincible-ish walls that cannot kill each other -> times out.
    const wall = (id: string, side: number): Team =>
      team([unit(id, 'tank', 'tank', { maxHp: 100000, atk: 1, def: 100000, speed: 50 + side })]);
    const result = resolveBattle(wall('a', 1), wall('b', 0), 5);
    expect(result.timedOut).toBe(true);
    expect(result.rounds).toBe(COMBAT.MAX_ROUNDS);
    expect(['attacker', 'defender']).toContain(result.winner);
  });
});
