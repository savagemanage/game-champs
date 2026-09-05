import { describe, it, expect } from 'vitest';
import { EnemyRole } from './GameConfig';
import { ENEMY_STATS, HERO_AGGRESSION, HERO_THREAT } from './EnemyConfig';

/**
 * These tests lock in the two hard rules FEAT-003 must not break:
 *  1. Every role has fixed base stats AND a hero-aggression profile (so the
 *     enemy factory's exhaustiveness is mirrored in config).
 *  2. Hero-threat tuning stays sane (radius >= melee reach), so a giant can
 *     actually close the gap after diverting - the fix for "giants ignore me".
 * They are pure-data checks (no Phaser runtime), matching the existing suites.
 */

const ALL_ROLES: readonly EnemyRole[] = [
  EnemyRole.Wanderer,
  EnemyRole.Sprinter,
  EnemyRole.Breaker,
  EnemyRole.Aberrant,
  EnemyRole.Armored,
  EnemyRole.Thrower,
];

describe('ENEMY_STATS base-stats invariant', () => {
  it('defines fixed stats for every role, keyed by its own role', () => {
    for (const role of ALL_ROLES) {
      const stats = ENEMY_STATS[role];
      expect(stats.role).toBe(role);
      expect(stats.maxHp).toBeGreaterThan(0);
      expect(stats.moveSpeed).toBeGreaterThan(0);
      expect(stats.attack).toBeGreaterThan(0);
      expect(stats.napeCritMultiplier).toBeGreaterThan(1);
    }
  });

  it('only the Armored role carries frontal resistance', () => {
    for (const role of ALL_ROLES) {
      const expected = role === EnemyRole.Armored;
      expect(ENEMY_STATS[role].frontalResist > 0).toBe(expected);
    }
  });
});

describe('HERO_AGGRESSION (bug 4: giants threaten the hero)', () => {
  it('defines a divert profile for every role', () => {
    for (const role of ALL_ROLES) {
      const a = HERO_AGGRESSION[role];
      expect(a.divertChance).toBeGreaterThanOrEqual(0);
      expect(a.divertChance).toBeLessThanOrEqual(1);
      expect(a.stickinessMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps roles distinct: Sprinter pounces hardest, Breaker least, Thrower never melee-hunts', () => {
    expect(HERO_AGGRESSION[EnemyRole.Sprinter].divertChance).toBeGreaterThan(
      HERO_AGGRESSION[EnemyRole.Wanderer].divertChance,
    );
    expect(HERO_AGGRESSION[EnemyRole.Breaker].divertChance).toBeLessThan(
      HERO_AGGRESSION[EnemyRole.Wanderer].divertChance,
    );
    expect(HERO_AGGRESSION[EnemyRole.Thrower].divertChance).toBe(0);
  });
});

describe('HERO_THREAT tuning', () => {
  it('lets a diverting giant close from the threat radius into melee reach', () => {
    expect(HERO_THREAT.THREAT_RADIUS).toBeGreaterThan(HERO_THREAT.MELEE_HERO_RANGE);
    expect(HERO_THREAT.MELEE_HERO_RANGE).toBeGreaterThan(0);
    expect(HERO_THREAT.LUNGE_DISTANCE).toBeGreaterThan(0);
    expect(HERO_THREAT.LUNGE_MS).toBeGreaterThan(0);
  });
});
