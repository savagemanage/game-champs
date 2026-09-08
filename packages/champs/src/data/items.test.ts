import { describe, it, expect } from 'vitest';
import {
  ITEMS,
  ITEM_BUILD_GRAPH,
  getItemById,
  missingRecipeComponents,
  remainingBuildCost,
  totalModifiers,
  addItemModifiers,
  zeroItemModifiers,
  type ItemModifiers,
} from './items';
import ko from '../i18n/locales/ko.json';
import en from '../i18n/locales/en.json';

type Json = Record<string, unknown>;

/** Resolve a dotted i18n key against a locale object, or undefined if absent. */
function resolveKey(obj: Json, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Json)[part];
    }
    return undefined;
  }, obj);
}

function keyResolves(key: string): boolean {
  const enValue = resolveKey(en as Json, key);
  const koValue = resolveKey(ko as Json, key);
  return typeof enValue === 'string' && typeof koValue === 'string';
}

const MODIFIER_KEYS = [
  'attackDamage',
  'abilityPower',
  'hp',
  'armor',
  'moveSpeed',
  'attackSpeed',
  'resource',
  'cooldownReduction',
] as const;

describe('item catalog', () => {
  it('defines a representative catalog of items', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(8);
  });

  it('has unique item ids', () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item has a strictly positive cost', () => {
    for (const item of ITEMS) {
      expect(item.cost).toBeGreaterThan(0);
    }
  });

  it('every item has non-negative modifier values', () => {
    for (const item of ITEMS) {
      for (const key of MODIFIER_KEYS) {
        expect(item.modifiers[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every item grants at least one non-zero modifier', () => {
    for (const item of ITEMS) {
      const anyNonZero = MODIFIER_KEYS.some((key) => item.modifiers[key] > 0);
      expect(anyNonZero, item.id).toBe(true);
    }
  });

  it('provides at least one legendary per non-utility archetype', () => {
    for (const archetype of ['attackDamage', 'abilityPower', 'tank', 'lifesteal', 'mana'] as const) {
      const hasLegendary = ITEMS.some(
        (i) => i.archetype === archetype && i.legendary,
      );
      expect(hasLegendary, archetype).toBe(true);
    }
  });

  it('defines valid acyclic recipes whose values equal the finished item cost', () => {
    for (const item of ITEMS) {
      expect(ITEM_BUILD_GRAPH[item.id]).toEqual(item.recipe?.components ?? []);
      if (!item.recipe) continue;

      const componentCost = item.recipe.components.reduce((total, componentId) => {
        const component = getItemById(componentId);
        expect(component, `${item.id}:${componentId}`).toBeDefined();
        expect(componentId).not.toBe(item.id);
        expect(component?.recipe).toBeUndefined();
        return total + (component?.cost ?? 0);
      }, 0);
      expect(componentCost + item.recipe.combineCost, item.id).toBe(item.cost);
    }
  });

  it('resolves every item name/desc key in both ko and en', () => {
    for (const item of ITEMS) {
      expect(keyResolves(item.nameKey), item.nameKey).toBe(true);
      expect(keyResolves(item.descKey), item.descKey).toBe(true);
    }
  });
});

describe('item helpers', () => {
  it('getItemById returns the matching item', () => {
    const first = ITEMS[0];
    expect(getItemById(first.id)).toBe(first);
  });

  it('getItemById returns undefined for unknown ids', () => {
    expect(getItemById('does-not-exist')).toBeUndefined();
  });

  it('zeroItemModifiers is all zeros', () => {
    const zero = zeroItemModifiers();
    for (const key of MODIFIER_KEYS) {
      expect(zero[key]).toBe(0);
    }
  });

  it('addItemModifiers sums component-wise', () => {
    const a: ItemModifiers = { ...zeroItemModifiers(), attackDamage: 10, hp: 100 };
    const b: ItemModifiers = { ...zeroItemModifiers(), attackDamage: 5, armor: 20 };
    const sum = addItemModifiers(a, b);
    expect(sum.attackDamage).toBe(15);
    expect(sum.hp).toBe(100);
    expect(sum.armor).toBe(20);
  });

  it('totalModifiers of no items is zero', () => {
    const total = totalModifiers([]);
    for (const key of MODIFIER_KEYS) {
      expect(total[key]).toBe(0);
    }
  });

  it('totalModifiers sums the modifiers of owned items', () => {
    const a = ITEMS[0];
    const b = ITEMS.find((i) => i.id !== a.id)!;
    const total = totalModifiers([a.id, b.id]);
    for (const key of MODIFIER_KEYS) {
      expect(total[key]).toBeCloseTo(a.modifiers[key] + b.modifiers[key]);
    }
  });

  it('credits owned recipe components toward remaining build cost', () => {
    const target = ITEMS.find((item) => item.recipe)!;
    const components = target.recipe!.components.map((id) => getItemById(id)!);

    expect(missingRecipeComponents(target, [])).toEqual(components);
    expect(remainingBuildCost(target, [])).toBe(target.cost);
    expect(remainingBuildCost(target, [components[0].id])).toBe(
      target.cost - components[0].cost,
    );
    expect(remainingBuildCost(target, [target.id])).toBe(0);
  });

  it('totalModifiers ignores unknown ids', () => {
    const a = ITEMS[0];
    const withGarbage = totalModifiers([a.id, 'nope']);
    const clean = totalModifiers([a.id]);
    for (const key of MODIFIER_KEYS) {
      expect(withGarbage[key]).toBeCloseTo(clean[key]);
    }
  });
});
