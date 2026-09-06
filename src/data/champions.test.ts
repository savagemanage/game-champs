import { describe, it, expect } from 'vitest';
import {
  CHAMPIONS,
  getAllAbilities,
  getChampionById,
  randomChampionId,
  type Ability,
  type Champion,
} from './champions';
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

const POSITIVE_STAT_KEYS = [
  'hp',
  'hpRegen',
  'moveSpeed',
  'attackDamage',
  'attackRange',
  'attackSpeed',
] as const;

describe('champion roster', () => {
  it('defines at least 5 champions', () => {
    expect(CHAMPIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('has unique champion ids', () => {
    const ids = CHAMPIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CHAMPIONS.map((c) => [c.id, c] as const))(
    '%s has exactly 4 abilities + 1 passive in the right slots',
    (_id, champion: Champion) => {
      expect(champion.abilities).toHaveLength(4);
      expect(champion.passive.slot).toBe('P');
      const slots = champion.abilities.map((a) => a.slot);
      expect(slots).toEqual(['Q', 'W', 'E', 'R']);
      expect(getAllAbilities(champion)).toHaveLength(5);
    },
  );

  it.each(CHAMPIONS.map((c) => [c.id, c] as const))(
    '%s has strictly positive base stats',
    (_id, champion: Champion) => {
      for (const key of POSITIVE_STAT_KEYS) {
        expect(champion.stats[key]).toBeGreaterThan(0);
      }
    },
  );

  it.each(CHAMPIONS.map((c) => [c.id, c] as const))(
    '%s has non-negative ability numbers and a valid behavior tag',
    (_id, champion: Champion) => {
      const validBehaviors = new Set([
        'skillshot',
        'dash',
        'buff',
        'aoe',
        'heal',
        'stun',
      ]);
      for (const ability of getAllAbilities(champion)) {
        expect(ability.cooldown).toBeGreaterThanOrEqual(0);
        expect(ability.cost).toBeGreaterThanOrEqual(0);
        expect(ability.range).toBeGreaterThanOrEqual(0);
        expect(ability.damage).toBeGreaterThanOrEqual(0);
        expect(validBehaviors.has(ability.behavior)).toBe(true);
      }
    },
  );

  it('resolves every champion name/title key in both ko and en', () => {
    for (const champion of CHAMPIONS) {
      expect(keyResolves(champion.nameKey), champion.nameKey).toBe(true);
      expect(keyResolves(champion.titleKey), champion.titleKey).toBe(true);
    }
  });

  it('resolves every ability name/desc key in both ko and en', () => {
    for (const champion of CHAMPIONS) {
      const abilities: Ability[] = getAllAbilities(champion);
      for (const ability of abilities) {
        expect(keyResolves(ability.nameKey), ability.nameKey).toBe(true);
        expect(keyResolves(ability.descKey), ability.descKey).toBe(true);
      }
    }
  });
});

describe('champion helpers', () => {
  it('getChampionById returns the matching champion', () => {
    const first = CHAMPIONS[0];
    expect(getChampionById(first.id)).toBe(first);
  });

  it('getChampionById returns undefined for unknown ids', () => {
    expect(getChampionById('does-not-exist')).toBeUndefined();
  });

  it('randomChampionId never returns the excluded id', () => {
    const excluded = CHAMPIONS[0].id;
    for (let i = 0; i < 50; i += 1) {
      expect(randomChampionId(excluded)).not.toBe(excluded);
    }
  });
});
