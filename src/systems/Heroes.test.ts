import { describe, it, expect } from 'vitest';
import {
  deriveHeroStats,
  levelUp,
  levelUpCost,
  makeHeroInstance,
  maxLevel,
  maxStars,
  progressionScale,
  skillPotency,
  skillUp,
  skillUpCost,
  starUp,
  starUpCost,
} from './Heroes';
import { HEROES } from '../config/GameConfig';
import { HERO_CATALOG, heroDef } from '../config/Heroes';
import type { HeroInstance } from '../types';

/**
 * Pure hero progression tests. Stat derivation folds grade + level + stars +
 * skill; the cost curves are monotonic and config-driven. These fail if the
 * fold or the curves were reverted.
 */
describe('Heroes progression', () => {
  const urTank = 'ironward'; // UR / tank / tank
  const srTank = 'granitehold'; // SR / tank / tank

  it('catalog covers all 3 types x 3 roles across the grades', () => {
    const types = new Set(HERO_CATALOG.map((h) => h.type));
    const roles = new Set(HERO_CATALOG.map((h) => h.role));
    const grades = new Set(HERO_CATALOG.map((h) => h.grade));
    expect([...types].sort()).toEqual(['aircraft', 'missile', 'tank']);
    expect([...roles].sort()).toEqual(['dealer', 'support', 'tank']);
    expect([...grades].sort()).toEqual(['SR', 'SSR', 'UR']);
    // Every (type, role) cell is filled by at least one hero.
    for (const type of ['tank', 'missile', 'aircraft']) {
      for (const role of ['dealer', 'tank', 'support']) {
        const found = HERO_CATALOG.some((h) => h.type === type && h.role === role);
        expect(found, `missing ${type}/${role}`).toBe(true);
      }
    }
    // Enough heroes of each type to fill a same-type squad of 5.
    for (const type of ['tank', 'missile', 'aircraft']) {
      expect(HERO_CATALOG.filter((h) => h.type === type).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('a fresh instance starts at level 1 / start-star / start-skill', () => {
    const inst = makeHeroInstance(urTank);
    expect(inst).toEqual({
      id: urTank,
      level: 1,
      stars: HEROES.START_STARS,
      skillLevel: HEROES.START_SKILL_LEVEL,
      dupes: 0,
    });
  });

  it('deriveHeroStats applies the grade multiplier at base progression', () => {
    const inst = makeHeroInstance(urTank);
    const def = heroDef(urTank)!;
    const stats = deriveHeroStats(inst);
    // Level 1 / 1 star / skill 1 => scale 1, so only the grade mult applies.
    expect(stats.hp).toBe(Math.round(def.base.hp * HEROES.GRADES.UR.statMult));
    expect(stats.atk).toBe(Math.round(def.base.atk * HEROES.GRADES.UR.statMult));
  });

  it('higher grade yields higher stats for equal catalog base (UR > SR)', () => {
    // Compare grade mult directly: UR statMult > SR statMult.
    expect(HEROES.GRADES.UR.statMult).toBeGreaterThan(HEROES.GRADES.SR.statMult);
  });

  it('stats increase with level, stars, and skill (each fold matters)', () => {
    const base = makeHeroInstance(urTank);
    const baseStats = deriveHeroStats(base);

    const leveled: HeroInstance = { ...base, level: 10 };
    const starred: HeroInstance = { ...base, stars: 3 };
    const skilled: HeroInstance = { ...base, skillLevel: 5 };

    expect(deriveHeroStats(leveled).atk).toBeGreaterThan(baseStats.atk);
    expect(deriveHeroStats(starred).atk).toBeGreaterThan(baseStats.atk);
    expect(deriveHeroStats(skilled).atk).toBeGreaterThan(baseStats.atk);

    // The combined scale equals the documented sum of the three tracks.
    const combined: HeroInstance = { ...base, level: 10, stars: 3, skillLevel: 5 };
    const expectedScale =
      1 +
      HEROES.LEVEL_STAT_GROWTH * 9 +
      HEROES.STAR_STAT_BONUS * 2 +
      HEROES.SKILL_STAT_BONUS_PER_LEVEL * 4;
    expect(progressionScale(combined)).toBeCloseTo(expectedScale, 10);
  });

  it('deriveHeroStats returns zeros for an unknown hero id', () => {
    expect(deriveHeroStats(makeHeroInstance('not-a-hero'))).toEqual({
      hp: 0,
      atk: 0,
      def: 0,
      speed: 0,
    });
  });

  it('level-up cost is monotonic and matches the config curve', () => {
    let prev = -1;
    for (let level = 1; level < 8; level += 1) {
      const inst: HeroInstance = { ...makeHeroInstance(urTank), level };
      const cost = levelUpCost(inst);
      const expected = Math.round(
        HEROES.LEVEL_COST_BASE * Math.pow(HEROES.LEVEL_COST_GROWTH, level - 1),
      );
      expect(cost).toBe(expected);
      expect(cost).toBeGreaterThan(prev);
      prev = cost;
    }
  });

  it('star-up and skill-up costs are monotonic and config-driven', () => {
    let prevStar = -1;
    for (let stars = 1; stars < HEROES.GRADES.UR.maxStars; stars += 1) {
      const cost = starUpCost({ ...makeHeroInstance(urTank), stars });
      const expected = Math.round(HEROES.STAR_COST_BASE * Math.pow(HEROES.STAR_COST_GROWTH, stars - 1));
      expect(cost).toBe(expected);
      expect(cost).toBeGreaterThan(prevStar);
      prevStar = cost;
    }
    let prevSkill = -1;
    for (let sk = 1; sk < HEROES.MAX_SKILL_LEVEL; sk += 1) {
      const cost = skillUpCost({ ...makeHeroInstance(urTank), skillLevel: sk });
      const expected = Math.round(HEROES.SKILL_COST_BASE * Math.pow(HEROES.SKILL_COST_GROWTH, sk - 1));
      expect(cost).toBe(expected);
      expect(cost).toBeGreaterThan(prevSkill);
      prevSkill = cost;
    }
  });

  it('costs are Infinity at the grade caps', () => {
    const cappedLevel: HeroInstance = { ...makeHeroInstance(srTank), level: maxLevel('SR') };
    expect(levelUpCost(cappedLevel)).toBe(Infinity);
    const cappedStars: HeroInstance = { ...makeHeroInstance(srTank), stars: maxStars('SR') };
    expect(starUpCost(cappedStars)).toBe(Infinity);
    const cappedSkill: HeroInstance = { ...makeHeroInstance(srTank), skillLevel: HEROES.MAX_SKILL_LEVEL };
    expect(skillUpCost(cappedSkill)).toBe(Infinity);
  });

  it('skillPotency scales the base potency by skill level', () => {
    expect(skillPotency(0.3, 1)).toBeCloseTo(0.3, 10);
    expect(skillPotency(0.3, 3)).toBeCloseTo(0.3 + HEROES.SKILL_POTENCY_PER_LEVEL * 2, 10);
  });

  it('levelUp/starUp/skillUp spend shards and only succeed when affordable', () => {
    const inst = makeHeroInstance(urTank);
    const cost = levelUpCost(inst);

    // Not enough shards -> no change.
    const poor = levelUp(inst, cost - 1);
    expect(poor.ok).toBe(false);
    expect(poor.instance).toBe(inst);
    expect(poor.shards).toBe(cost - 1);

    // Exactly enough -> level rises, shards drained.
    const rich = levelUp(inst, cost + 100);
    expect(rich.ok).toBe(true);
    expect(rich.instance.level).toBe(inst.level + 1);
    expect(rich.shards).toBe(100);
    // Pure: original untouched.
    expect(inst.level).toBe(1);

    const s = starUp(inst, starUpCost(inst) + 1);
    expect(s.ok).toBe(true);
    expect(s.instance.stars).toBe(inst.stars + 1);

    const sk = skillUp(inst, skillUpCost(inst) + 1);
    expect(sk.ok).toBe(true);
    expect(sk.instance.skillLevel).toBe(inst.skillLevel + 1);
  });
});
