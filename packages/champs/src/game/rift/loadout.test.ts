import { describe, it, expect } from 'vitest';
import {
  computeEffectiveStats,
  affordable,
  recommendPurchase,
  recommendBuild,
  ROLE_BUILD_TARGETS,
  ROLE_BUY_ORDER,
  BASE_ARMOR,
} from './loadout';
import { getChampionById, type ChampionRole } from '../../data/champions';
import { getItemById, ITEMS } from '../../data/items';
import { zeroModifiers, dragonStackBonus, BARON_BUFF } from './objectives';

const ashborne = getChampionById('ashborne')!;
const embermage = getChampionById('embermage')!;

describe('computeEffectiveStats', () => {
  it('equals base stats at level 1 with no items or team modifiers', () => {
    const s = computeEffectiveStats(ashborne, 1);
    expect(s.hp).toBeCloseTo(ashborne.stats.hp);
    expect(s.attackDamage).toBeCloseTo(ashborne.stats.attackDamage);
    expect(s.attackSpeed).toBeCloseTo(ashborne.stats.attackSpeed);
    expect(s.moveSpeed).toBeCloseTo(ashborne.stats.moveSpeed);
    expect(s.armor).toBeCloseTo(BASE_ARMOR);
    expect(s.abilityPower).toBe(0);
    expect(s.resource).toBe(0);
  });

  it('leveling raises growth-scaled stats', () => {
    const l1 = computeEffectiveStats(ashborne, 1);
    const l18 = computeEffectiveStats(ashborne, 18);
    expect(l18.hp).toBeGreaterThan(l1.hp);
    expect(l18.attackDamage).toBeGreaterThan(l1.attackDamage);
    expect(l18.armor).toBeGreaterThan(l1.armor);
    expect(l18.attackSpeed).toBeGreaterThan(l1.attackSpeed);
  });

  it('applies exact per-level growth', () => {
    const l2 = computeEffectiveStats(ashborne, 2);
    expect(l2.attackDamage).toBeCloseTo(
      ashborne.stats.attackDamage + ashborne.growth.adPerLevel,
    );
    expect(l2.hp).toBeCloseTo(ashborne.stats.hp + ashborne.growth.hpPerLevel);
  });

  it('buying an AD item raises effective attack damage by its modifier', () => {
    const shortsword = getItemById('shortsword')!;
    const without = computeEffectiveStats(ashborne, 1);
    const withItem = computeEffectiveStats(ashborne, 1, ['shortsword']);
    expect(withItem.attackDamage).toBeCloseTo(
      without.attackDamage + shortsword.modifiers.attackDamage,
    );
  });

  it('buying an AP item raises effective ability power by its modifier', () => {
    const emberRod = getItemById('emberRod')!;
    const withItem = computeEffectiveStats(embermage, 1, ['emberRod']);
    expect(withItem.abilityPower).toBeCloseTo(emberRod.modifiers.abilityPower);
  });

  it('a health item raises effective HP', () => {
    const ironVest = getItemById('ironVest')!;
    const without = computeEffectiveStats(ashborne, 1);
    const withItem = computeEffectiveStats(ashborne, 1, ['ironVest']);
    expect(withItem.hp).toBeCloseTo(without.hp + ironVest.modifiers.hp);
    expect(withItem.armor).toBeCloseTo(without.armor + ironVest.modifiers.armor);
  });

  it('team modifiers stack on top of base + items', () => {
    const base = computeEffectiveStats(ashborne, 6, ['shortsword']);
    const team = dragonStackBonus(3); // +9 AD, +9 ability, +6 armor
    const boosted = computeEffectiveStats(ashborne, 6, ['shortsword'], team);
    expect(boosted.attackDamage).toBeCloseTo(base.attackDamage + team.attackDamage);
    expect(boosted.armor).toBeCloseTo(base.armor + team.armor);
    expect(boosted.abilityPower).toBeCloseTo(base.abilityPower + team.ability);
  });

  it('baron ability buff adds ability power', () => {
    const withBaron = computeEffectiveStats(embermage, 6, ['emberRod'], BARON_BUFF);
    const emberRod = getItemById('emberRod')!;
    expect(withBaron.abilityPower).toBeCloseTo(
      emberRod.modifiers.abilityPower + BARON_BUFF.ability,
    );
    expect(withBaron.attackDamage).toBeGreaterThan(
      computeEffectiveStats(embermage, 6, ['emberRod']).attackDamage,
    );
  });

  it('healthPercent team modifier scales max HP', () => {
    const team = { ...zeroModifiers(), healthPercent: 0.1 };
    const base = computeEffectiveStats(ashborne, 1);
    const boosted = computeEffectiveStats(ashborne, 1, [], team);
    expect(boosted.hp).toBeCloseTo(base.hp * 1.1);
  });
});

describe('affordable', () => {
  it('is true when gold meets or exceeds cost', () => {
    const item = ITEMS[0];
    expect(affordable(item.cost, item)).toBe(true);
    expect(affordable(item.cost + 1, item)).toBe(true);
  });

  it('is false when gold is below cost', () => {
    const item = ITEMS[0];
    expect(affordable(item.cost - 1, item)).toBe(false);
  });
});

describe('recommendPurchase', () => {
  const roles: ChampionRole[] = [
    'marksman',
    'assassin',
    'bruiser',
    'mage',
    'enchanter',
  ];

  it('returns undefined when nothing is affordable', () => {
    expect(recommendPurchase('marksman', 0)).toBeUndefined();
  });

  it('never returns an unaffordable item', () => {
    for (const role of roles) {
      for (const gold of [300, 500, 900, 2000, 5000]) {
        const rec = recommendPurchase(role, gold);
        if (rec) expect(rec.cost).toBeLessThanOrEqual(gold);
      }
    }
  });

  it('never recommends an already-owned item', () => {
    for (const role of roles) {
      const owned: string[] = [];
      // Greedily buy the whole build with a big budget; must never repeat.
      for (let i = 0; i < ITEMS.length + 2; i += 1) {
        const rec = recommendPurchase(role, 100000, owned);
        if (!rec) break;
        expect(owned).not.toContain(rec.id);
        owned.push(rec.id);
      }
      expect(new Set(owned).size).toBe(owned.length);
    }
  });

  it('opens with the shared starter for every role when affordable', () => {
    const starter = ITEMS.find((i) => i.archetype === 'starter')!;
    for (const role of roles) {
      const rec = recommendPurchase(role, starter.cost);
      expect(rec?.id).toBe(starter.id);
    }
  });

  it('every role buy order references only known archetypes', () => {
    const known = new Set(ITEMS.map((i) => i.archetype));
    for (const role of roles) {
      for (const archetype of ROLE_BUY_ORDER[role]) {
        expect(known.has(archetype)).toBe(true);
      }
    }
  });
});


describe('recommendBuild', () => {
  it('returns a role target even when no component is affordable', () => {
    const recommendation = recommendBuild('mage', [], 0)!;
    expect(recommendation.targetItem.id).toBe(ROLE_BUILD_TARGETS.mage[0]);
    expect(recommendation.nextPurchasableComponent).toBeUndefined();
    expect(recommendation.remainingCost).toBe(recommendation.targetItem.cost);
    expect(recommendation.alternatives.length).toBeGreaterThan(0);
  });

  it('recommends the cheapest affordable missing component', () => {
    const recommendation = recommendBuild('marksman', [], 500)!;
    expect(recommendation.nextPurchasableComponent?.id).toBe('shortsword');
  });

  it('credits owned components and advances past completed targets', () => {
    const initial = recommendBuild('mage', ['emberRod'], 1000)!;
    expect(initial.remainingCost).toBe(initial.targetItem.cost - 850);
    expect(initial.nextPurchasableComponent?.id).toBe('manaCrystal');

    const next = recommendBuild('mage', [initial.targetItem.id], 0)!;
    expect(next.targetItem.id).toBe(ROLE_BUILD_TARGETS.mage[1]);
  });

  it('returns undefined after every role target is owned', () => {
    expect(recommendBuild('bruiser', ROLE_BUILD_TARGETS.bruiser, 1000)).toBeUndefined();
  });
});
