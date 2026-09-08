import { describe, it, expect } from 'vitest';
import {
  DRAGON_FIRST_SPAWN,
  DRAGON_RESPAWN,
  HERALD_SPAWN_WINDOW,
  BARON_SPAWN,
  BARON_BUFF_DURATION,
  MONSTER_STATS,
  monsterStats,
  zeroModifiers,
  addModifiers,
  dragonStackBonus,
  heraldReward,
  isHeraldWindowOpen,
  BARON_BUFF,
  noBaronBuff,
  applyBaronBuff,
  expireBaronBuff,
} from './objectives';

describe('spawn timings', () => {
  it('uses the compressed objective cadence from golden-match rules', () => {
    expect(DRAGON_FIRST_SPAWN).toBe(120);
    expect(DRAGON_RESPAWN).toBe(150);
    expect(HERALD_SPAWN_WINDOW).toEqual({ start: 180, end: 420 });
    expect(BARON_SPAWN).toBe(480);
    expect(BARON_BUFF_DURATION).toBe(90);
    expect(DRAGON_FIRST_SPAWN).toBeLessThan(HERALD_SPAWN_WINDOW.end);
    expect(HERALD_SPAWN_WINDOW.end).toBeLessThanOrEqual(BARON_SPAWN);
  });
});

describe('monster stats', () => {
  it('has positive stats and a bounty for every monster', () => {
    for (const id of ['dragon', 'herald', 'baron'] as const) {
      const s = monsterStats(id);
      expect(s.hp).toBeGreaterThan(0);
      expect(s.bounty.gold).toBeGreaterThan(0);
    }
    expect(MONSTER_STATS.baron.hp).toBeGreaterThan(MONSTER_STATS.dragon.hp);
  });
});

describe('team modifiers', () => {
  it('zero modifiers have no effect and add component-wise', () => {
    const z = zeroModifiers();
    expect(z).toEqual({ attackDamage: 0, ability: 0, armor: 0, healthPercent: 0 });
    const sum = addModifiers(
      { attackDamage: 5, ability: 2, armor: 1, healthPercent: 0.1 },
      { attackDamage: 3, ability: 4, armor: 0, healthPercent: 0.05 },
    );
    expect(sum.attackDamage).toBe(8);
    expect(sum.ability).toBe(6);
    expect(sum.armor).toBe(1);
    expect(sum.healthPercent).toBeCloseTo(0.15, 10);
  });
});

describe('dragon stacks', () => {
  it('grant no bonus at zero stacks', () => {
    expect(dragonStackBonus(0)).toEqual(zeroModifiers());
  });

  it('increase monotonically with stacks', () => {
    const one = dragonStackBonus(1);
    const two = dragonStackBonus(2);
    const four = dragonStackBonus(4);
    expect(two.attackDamage).toBeGreaterThan(one.attackDamage);
    expect(four.ability).toBeGreaterThan(two.ability);
    expect(four.armor).toBeGreaterThan(two.armor);
    // Linear scaling.
    expect(two.attackDamage).toBe(one.attackDamage * 2);
  });
});

describe('stone warden', () => {
  it('is a deployable pushing advantage that damages structures', () => {
    const reward = heraldReward();
    expect(reward.deployable).toBe(true);
    expect(reward.structureDamage).toBeGreaterThan(0);
    expect(reward.durationSeconds).toBeGreaterThan(0);
  });

  it('window is open within the spawn window and closed outside', () => {
    expect(isHeraldWindowOpen(HERALD_SPAWN_WINDOW.start - 1)).toBe(false);
    expect(isHeraldWindowOpen(HERALD_SPAWN_WINDOW.start)).toBe(true);
    expect(isHeraldWindowOpen(HERALD_SPAWN_WINDOW.end)).toBe(true);
    expect(isHeraldWindowOpen(HERALD_SPAWN_WINDOW.end + 1)).toBe(false);
  });
});

describe('void tyrant buff', () => {
  it('sets the team modifier when applied and expires after the duration', () => {
    const none = noBaronBuff();
    expect(none.active).toBe(false);
    expect(none.modifiers).toEqual(zeroModifiers());

    const buff = applyBaronBuff(1200);
    expect(buff.active).toBe(true);
    expect(buff.modifiers).toEqual(BARON_BUFF);
    expect(buff.expiresAt).toBe(1200 + BARON_BUFF_DURATION);

    // Still active before expiry.
    expect(expireBaronBuff(buff, 1200 + BARON_BUFF_DURATION - 1).active).toBe(true);
    // Expires at/after the timer.
    const expired = expireBaronBuff(buff, 1200 + BARON_BUFF_DURATION);
    expect(expired.active).toBe(false);
    expect(expired.modifiers).toEqual(zeroModifiers());
  });

  it('grants meaningful combat power', () => {
    expect(BARON_BUFF.attackDamage).toBeGreaterThan(0);
    expect(BARON_BUFF.ability).toBeGreaterThan(0);
  });
});
