import { describe, it, expect } from 'vitest';
import {
  effectiveDamage,
  applyDamage,
  applyHeal,
  advanceAttackCooldown,
  canBasicAttack,
  resetAttackCooldown,
  createCooldownState,
  isReady,
  startCooldown,
  tickCooldowns,
  cooldownProgress,
  resolveAbility,
  distance,
  inRange,
  nearestEnemy,
  stepToward,
  type Unit,
} from './combat';
import type { Ability } from '../data/champions';

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u',
    kind: 'champion',
    team: 'enemy',
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    ad: 50,
    armor: 0,
    attackRange: 150,
    attackSpeed: 0.7,
    moveSpeed: 330,
    attackCdRemaining: 0,
    dead: false,
    ...overrides,
  };
}

function makeAbility(overrides: Partial<Ability>): Ability {
  return {
    slot: 'Q',
    nameKey: 'x',
    descKey: 'x',
    cooldown: 6,
    cost: 40,
    range: 500,
    damage: 100,
    behavior: 'skillshot',
    ...overrides,
  };
}

describe('effectiveDamage (armor mitigation)', () => {
  it('takes full damage with zero armor', () => {
    expect(effectiveDamage(100, 0)).toBe(100);
  });

  it('reduces damage as armor increases', () => {
    // 100 armor halves damage: 100 * 100/200 = 50.
    expect(effectiveDamage(100, 100)).toBe(50);
    // More armor reduces further and strictly less than the 100-armor case.
    expect(effectiveDamage(100, 200)).toBeLessThan(effectiveDamage(100, 100));
  });

  it('amplifies damage with negative armor', () => {
    expect(effectiveDamage(100, -100)).toBeGreaterThan(100);
  });

  it('never returns negative damage', () => {
    expect(effectiveDamage(0, 50)).toBe(0);
    expect(effectiveDamage(-10, 0)).toBe(0);
  });
});

describe('applyDamage', () => {
  it('subtracts armor-mitigated damage from hp', () => {
    const u = makeUnit({ hp: 100, armor: 100 });
    const res = applyDamage(u, 100);
    expect(res.dealt).toBe(50);
    expect(u.hp).toBe(50);
    expect(res.lethal).toBe(false);
    expect(u.dead).toBe(false);
  });

  it('lethal damage kills the unit and clamps hp at 0', () => {
    const u = makeUnit({ hp: 40, armor: 0 });
    const res = applyDamage(u, 999);
    expect(u.hp).toBe(0);
    expect(u.dead).toBe(true);
    expect(res.lethal).toBe(true);
  });

  it('does nothing to an already-dead unit', () => {
    const u = makeUnit({ hp: 0, dead: true });
    const res = applyDamage(u, 100);
    expect(res.dealt).toBe(0);
    expect(res.lethal).toBe(false);
  });
});

describe('applyHeal', () => {
  it('restores hp but not above maxHp', () => {
    const u = makeUnit({ hp: 50, maxHp: 100 });
    expect(applyHeal(u, 30)).toBe(30);
    expect(u.hp).toBe(80);
    expect(applyHeal(u, 999)).toBe(20);
    expect(u.hp).toBe(100);
  });

  it('cannot heal a dead unit', () => {
    const u = makeUnit({ hp: 0, dead: true });
    expect(applyHeal(u, 50)).toBe(0);
  });
});

describe('cooldowns', () => {
  it('an ability starts ready', () => {
    const cds = createCooldownState();
    expect(isReady(cds, 'Q')).toBe(true);
  });

  it('block recasting until the cooldown elapses', () => {
    const cds = createCooldownState();
    startCooldown(cds, 'Q', 6);
    expect(isReady(cds, 'Q')).toBe(false);

    tickCooldowns(cds, 3);
    expect(isReady(cds, 'Q')).toBe(false);

    tickCooldowns(cds, 3);
    expect(isReady(cds, 'Q')).toBe(true);
  });

  it('other slots are unaffected by one slot going on cooldown', () => {
    const cds = createCooldownState();
    startCooldown(cds, 'R', 90);
    expect(isReady(cds, 'R')).toBe(false);
    expect(isReady(cds, 'Q')).toBe(true);
    expect(isReady(cds, 'W')).toBe(true);
    expect(isReady(cds, 'E')).toBe(true);
  });

  it('reports progress from 0 to 1 as the cooldown ticks down', () => {
    const cds = createCooldownState();
    startCooldown(cds, 'Q', 10);
    expect(cooldownProgress(cds, 'Q', 10)).toBe(0);
    tickCooldowns(cds, 5);
    expect(cooldownProgress(cds, 'Q', 10)).toBeCloseTo(0.5);
    tickCooldowns(cds, 5);
    expect(cooldownProgress(cds, 'Q', 10)).toBe(1);
  });
});

describe('resolveAbility (behavior tags)', () => {
  it('skillshot deals its raw damage as single-target', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'skillshot', damage: 80 }));
    expect(eff.damage).toBe(80);
    expect(eff.area).toBe(false);
    expect(eff.heal).toBe(0);
  });

  it('aoe deals damage over an area', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'aoe', damage: 160 }));
    expect(eff.damage).toBe(160);
    expect(eff.area).toBe(true);
    expect(eff.radius).toBeGreaterThan(0);
  });

  it('dash repositions and carries its damage', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'dash', damage: 70 }));
    expect(eff.dashes).toBe(true);
    expect(eff.damage).toBe(70);
  });

  it('stun applies crowd control plus damage', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'stun', damage: 150 }));
    expect(eff.stunDuration).toBeGreaterThan(0);
    expect(eff.damage).toBe(150);
  });

  it('heal restores health and deals no damage', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'heal', damage: 0 }));
    expect(eff.heal).toBeGreaterThan(0);
    expect(eff.damage).toBe(0);
  });

  it('buff grants a timed buff', () => {
    const eff = resolveAbility(makeAbility({ behavior: 'buff', damage: 0 }));
    expect(eff.buffDuration).toBeGreaterThan(0);
  });
});

describe('basic-attack cadence (turret double-tick regression)', () => {
  // Models the scene loop: once per frame advance the cooldown, then fire if
  // ready. This is the exact contract BattleScene relies on. A turret that
  // decrements its cooldown twice per frame would fire ~2x too fast.
  function countAttacksOverOneSecond(
    attackSpeed: number,
    dt: number,
    decrementsPerFrame: number,
  ): number {
    const u = makeUnit({ kind: 'turret', attackSpeed, attackCdRemaining: 0 });
    let attacks = 0;
    const frames = Math.round(1 / dt);
    for (let i = 0; i < frames; i++) {
      for (let d = 0; d < decrementsPerFrame; d++) advanceAttackCooldown(u, dt);
      if (canBasicAttack(u)) {
        attacks += 1;
        resetAttackCooldown(u);
      }
    }
    return attacks;
  }

  it('fires at roughly its configured attack speed with ONE decrement per frame', () => {
    // 0.9 attacks/sec => a 1.11s interval. Over a 1s window a turret fires its
    // opening shot on frame 0 and cannot come off cooldown again (1.11s > 1s),
    // so exactly one attack lands.
    const attacks = countAttacksOverOneSecond(0.9, 1 / 60, 1);
    expect(attacks).toBe(1);
  });

  it('a second decrement per frame nearly doubles the fire rate (the old bug)', () => {
    const single = countAttacksOverOneSecond(0.9, 1 / 60, 1);
    const doubled = countAttacksOverOneSecond(0.9, 1 / 60, 2);
    expect(doubled).toBeGreaterThan(single);
  });

  it('resetAttackCooldown uses 1/attackSpeed seconds', () => {
    const u = makeUnit({ attackSpeed: 0.5, attackCdRemaining: 0 });
    resetAttackCooldown(u);
    expect(u.attackCdRemaining).toBe(2);
    expect(canBasicAttack(u)).toBe(false);
    advanceAttackCooldown(u, 2);
    expect(canBasicAttack(u)).toBe(true);
  });
});

describe('spatial helpers', () => {
  it('distance and inRange agree', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(inRange({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(inRange({ x: 0, y: 0 }, { x: 3, y: 4 }, 4)).toBe(false);
  });

  it('nearestEnemy ignores allies and dead units', () => {
    const me = makeUnit({ team: 'ally', pos: { x: 0, y: 0 } });
    const ally = makeUnit({ id: 'a', team: 'ally', pos: { x: 10, y: 0 } });
    const deadEnemy = makeUnit({ id: 'd', team: 'enemy', pos: { x: 5, y: 0 }, dead: true });
    const liveEnemy = makeUnit({ id: 'l', team: 'enemy', pos: { x: 50, y: 0 } });
    const found = nearestEnemy(me, [ally, deadEnemy, liveEnemy]);
    expect(found?.id).toBe('l');
  });

  it('stepToward moves at most moveSpeed*dt toward the target', () => {
    const u = makeUnit({ pos: { x: 0, y: 0 }, moveSpeed: 100 });
    stepToward(u, { x: 1000, y: 0 }, 1);
    expect(u.pos.x).toBeCloseTo(100);
    expect(u.pos.y).toBeCloseTo(0);
  });
});
