import { describe, it, expect } from 'vitest';
import { HeroSystem } from './HeroSystem';
import { ResourceStore } from './ResourceStore';
import { CombatSystem } from './CombatSystem';
import {
  heroDef,
  heroLevelUpCost,
  heroMultiplierAt,
  type HeroId,
} from '../config/HeroConfig';
import type { Army } from '../types';

/**
 * Unit + integration tests for the pure HeroSystem: the recruit/level/star
 * lifecycle, active-hero selection, role-gated bonus getters (a war hero boosts
 * combat but not economy and an economy hero the reverse), shard accrual, and
 * JSON round-trip. Two integration tests prove the wired seams: the active war
 * hero flips a CombatSystem outcome and the active economy hero increases
 * credited production.
 */
describe('HeroSystem', () => {
  /** A store rich enough to afford any recruit / level-up in these tests. */
  const richStore = (): ResourceStore =>
    new ResourceStore({ food: 99999, wood: 99999, stone: 99999, gold: 99999 });

  const army = (a: Partial<Army>): Army => ({
    spearman: 0,
    archer: 0,
    knight: 0,
    cavalry: 0,
    siege: 0,
    ...a,
  });

  // ---- Recruit -------------------------------------------------------------

  it('recruits a hero, spending its cost and joining the roster at Lv.1/0★', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    const cost = heroDef('ser_alden').recruitCost;
    const beforeGold = store.get('gold');

    const result = heroes.recruit('ser_alden', store);
    expect(result.ok).toBe(true);
    expect(heroes.isRecruited('ser_alden')).toBe(true);
    expect(heroes.progress('ser_alden')).toEqual({ level: 1, stars: 0, shards: 0 });
    expect(store.get('gold')).toBe(beforeGold - (cost.gold ?? 0));
    // First recruit becomes the active hero automatically.
    expect(heroes.activeHero).toBe('ser_alden');
  });

  it('cannot recruit the same hero twice (already)', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const again = heroes.canRecruit('ser_alden', store);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already');
  });

  it('cannot recruit without enough resources (cost) and spends nothing on failure', () => {
    const heroes = new HeroSystem();
    const poor = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const check = heroes.canRecruit('ser_alden', poor);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('cost');
    const result = heroes.recruit('ser_alden', poor);
    expect(result.ok).toBe(false);
    expect(heroes.isRecruited('ser_alden')).toBe(false);
  });

  // ---- Level up ------------------------------------------------------------

  it('levels a recruited hero up, spending the scaling level-up cost', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const cost = heroLevelUpCost('ser_alden', 1);
    const beforeGold = store.get('gold');

    const result = heroes.levelUp('ser_alden', store);
    expect(result.ok).toBe(true);
    expect(heroes.progress('ser_alden')!.level).toBe(2);
    expect(store.get('gold')).toBe(beforeGold - (cost.gold ?? 0));
    // The next level costs strictly more (scales with current level).
    const nextCost = heroLevelUpCost('ser_alden', 2);
    expect((nextCost.gold ?? 0)).toBeGreaterThan(cost.gold ?? 0);
  });

  it('cannot level a hero that has not been recruited (notRecruited)', () => {
    const heroes = new HeroSystem();
    const check = heroes.canLevelUp('ser_alden', richStore());
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('notRecruited');
  });

  it('cannot level past the level cap (maxLevel)', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const max = heroDef('ser_alden').maxLevel;
    for (let i = 1; i < max; i++) heroes.levelUp('ser_alden', store);
    expect(heroes.progress('ser_alden')!.level).toBe(max);
    const check = heroes.canLevelUp('ser_alden', store);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('maxLevel');
  });

  // ---- Stars / shards ------------------------------------------------------

  it('accrues shards and stars up by spending them', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const per = heroDef('ser_alden').shardsPerStar;

    // Not enough shards yet.
    expect(heroes.canStarUp('ser_alden').reason).toBe('shards');
    heroes.addShards('ser_alden', per + 3);
    expect(heroes.progress('ser_alden')!.shards).toBe(per + 3);

    const result = heroes.starUp('ser_alden');
    expect(result.ok).toBe(true);
    expect(heroes.progress('ser_alden')!.stars).toBe(1);
    expect(heroes.progress('ser_alden')!.shards).toBe(3); // per spent
  });

  it('preserves shards received before recruitment and ignores non-positive grants', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.addShards('ser_alden', 10);
    expect(heroes.shards('ser_alden')).toBe(10);
    heroes.recruit('ser_alden', store);
    heroes.addShards('ser_alden', 0);
    heroes.addShards('ser_alden', -5);
    expect(heroes.progress('ser_alden')!.shards).toBe(10);
  });

  it('cannot star up past the star cap (maxLevel reason)', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const def = heroDef('ser_alden');
    heroes.addShards('ser_alden', def.shardsPerStar * def.starMax);
    for (let i = 0; i < def.starMax; i++) heroes.starUp('ser_alden');
    expect(heroes.progress('ser_alden')!.stars).toBe(def.starMax);
    const check = heroes.canStarUp('ser_alden');
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('maxLevel');
  });

  // ---- Active selection ----------------------------------------------------

  it('setActive only accepts recruited heroes and can be cleared with null', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    // Cannot activate an unrecruited hero.
    expect(heroes.setActive('kara_stormblade')).toBe(false);
    heroes.recruit('ser_alden', store);
    heroes.recruit('kara_stormblade', store);
    // Second recruit does NOT steal active from the first.
    expect(heroes.activeHero).toBe('ser_alden');
    expect(heroes.setActive('kara_stormblade')).toBe(true);
    expect(heroes.activeHero).toBe('kara_stormblade');
    expect(heroes.setActive(null)).toBe(true);
    expect(heroes.activeHero).toBeNull();
  });

  // ---- Role-gated bonuses --------------------------------------------------

  it('a war hero boosts combat but NOT economy', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store); // war, auto-active
    const p = heroes.progress('ser_alden')!;
    expect(heroes.combatMultiplier()).toBeCloseTo(
      heroMultiplierAt('ser_alden', p.level, p.stars),
      6,
    );
    expect(heroes.combatMultiplier()).toBeGreaterThan(1);
    expect(heroes.economyMultiplier()).toBe(1);
  });

  it('an economy hero boosts economy but NOT combat', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('mira_goldhand', store); // economy, auto-active
    const p = heroes.progress('mira_goldhand')!;
    expect(heroes.economyMultiplier()).toBeCloseTo(
      heroMultiplierAt('mira_goldhand', p.level, p.stars),
      6,
    );
    expect(heroes.economyMultiplier()).toBeGreaterThan(1);
    expect(heroes.combatMultiplier()).toBe(1);
  });

  it('no active hero => both multipliers are neutral (1)', () => {
    const heroes = new HeroSystem();
    expect(heroes.combatMultiplier()).toBe(1);
    expect(heroes.economyMultiplier()).toBe(1);
  });

  it('the bonus grows with level and stars', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    const base = heroes.combatMultiplier();
    heroes.levelUp('ser_alden', store);
    const leveled = heroes.combatMultiplier();
    expect(leveled).toBeGreaterThan(base);
    heroes.addShards('ser_alden', heroDef('ser_alden').shardsPerStar);
    heroes.starUp('ser_alden');
    expect(heroes.combatMultiplier()).toBeGreaterThan(leveled);
  });

  // ---- JSON round-trip -----------------------------------------------------

  it('round-trips recruited progress + active hero through toJSON/fromJSON', () => {
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    heroes.recruit('mira_goldhand', store);
    heroes.levelUp('mira_goldhand', store);
    heroes.addShards('mira_goldhand', 30);
    heroes.starUp('mira_goldhand');
    heroes.setActive('mira_goldhand');

    const restored = HeroSystem.fromJSON(JSON.parse(JSON.stringify(heroes.toJSON())));
    expect(restored.recruited).toEqual(['ser_alden', 'mira_goldhand']);
    expect(restored.activeHero).toBe('mira_goldhand');
    expect(restored.progress('mira_goldhand')).toEqual(heroes.progress('mira_goldhand'));
    expect(restored.economyMultiplier()).toBeCloseTo(heroes.economyMultiplier(), 6);
  });

  it('fromJSON tolerates missing/malformed data and filters unknown ids', () => {
    expect(HeroSystem.fromJSON(undefined).recruited).toEqual([]);
    expect(HeroSystem.fromJSON(null).recruited).toEqual([]);
    const dirty = HeroSystem.fromJSON({
      recruited: {
        ser_alden: { level: 3, stars: 2, shards: 5 },
        not_a_hero: { level: 9, stars: 9, shards: 9 } as unknown as never,
      },
      active: 'not_a_hero',
    });
    expect(dirty.recruited).toEqual(['ser_alden']);
    // Active pointed at an invalid id => cleared to null.
    expect(dirty.activeHero).toBeNull();
    expect(dirty.progress('ser_alden')).toEqual({ level: 3, stars: 2, shards: 5 });
  });

  it('sanitizes out-of-range progress from a stale/edited save', () => {
    const def = heroDef('ser_alden');
    const clamped = HeroSystem.fromJSON({
      recruited: { ser_alden: { level: 999, stars: 999, shards: -4 } },
      active: 'ser_alden',
    });
    const p = clamped.progress('ser_alden')!;
    expect(p.level).toBe(def.maxLevel);
    expect(p.stars).toBe(def.starMax);
    expect(p.shards).toBe(0);
  });

  // ---- Integration: wired seams --------------------------------------------

  it('INTEGRATION: an active war hero flips a CombatSystem outcome (loss -> win)', () => {
    // Wave 1 is all raiders (spearman-role). Cavalry are WEAK into them (0.75x),
    // so a cavalry stack sized just below the win threshold LOSES on its own but
    // should WIN once the active war hero's combat multiplier is applied.
    const wave = 1;
    const wavePower = CombatSystem.wavePower(wave);

    // Largest cavalry count whose effective power is still below the wave.
    let cavalry = 1;
    while (CombatSystem.effectiveArmyPower(army({ cavalry: cavalry + 1 }), wave) < wavePower) {
      cavalry++;
    }
    const a = army({ cavalry });

    // Without a hero: a loss (attackMult defaults to neutral 1).
    const withoutHero = CombatSystem.resolve(a, wave);
    expect(withoutHero.win).toBe(false);

    // Recruit + activate a war hero and level it enough that its multiplier
    // clears the gap. Ser Alden auto-activates on recruit.
    const heroes = new HeroSystem();
    const store = richStore();
    heroes.recruit('ser_alden', store);
    // Level until the composed effective power beats the wave.
    while (
      CombatSystem.effectiveArmyPower(a, wave, heroes.combatMultiplier()) < wavePower &&
      heroes.canLevelUp('ser_alden', store).ok
    ) {
      heroes.levelUp('ser_alden', store);
    }
    expect(heroes.combatMultiplier()).toBeGreaterThan(1);

    const withHero = CombatSystem.resolve(a, wave, {
      attackMult: heroes.combatMultiplier(),
      defenseMult: 1,
    });
    expect(withHero.win).toBe(true);
  });

  it('INTEGRATION: an active economy hero increases credited production at the seam', () => {
    // The production seam multiplies building rates by the economy multiplier
    // before crediting. Model it directly: base rates credited over a window,
    // then the same window with the hero multiplier applied.
    const rates = { food: 2, wood: 1, stone: 0, gold: 0 };
    const dtMs = 10_000;

    const baseStore = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const baseGain = baseStore.applyProduction(rates, dtMs);

    const heroes = new HeroSystem();
    heroes.recruit('mira_goldhand', richStore()); // economy, auto-active
    const mult = heroes.economyMultiplier();
    expect(mult).toBeGreaterThan(1);

    const boostedRates = {
      food: rates.food * mult,
      wood: rates.wood * mult,
      stone: rates.stone * mult,
      gold: rates.gold * mult,
    };
    const boostedStore = new ResourceStore({ food: 0, wood: 0, stone: 0, gold: 0 });
    const boostedGain = boostedStore.applyProduction(boostedRates, dtMs);

    expect(boostedGain.food).toBeGreaterThan(baseGain.food);
    expect(boostedGain.food).toBeCloseTo(baseGain.food * mult, 6);
    // A war hero would NOT affect production (economy multiplier stays neutral).
    const warHeroes = new HeroSystem();
    warHeroes.recruit('ser_alden', richStore());
    expect(warHeroes.economyMultiplier()).toBe(1);
  });
});

const _typecheckHeroIds: HeroId[] = ['ser_alden', 'kara_stormblade', 'mira_goldhand', 'old_bram'];
void _typecheckHeroIds;
