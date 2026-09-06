import { describe, it, expect } from 'vitest';
import { HeroRoster } from './HeroRoster';
import {
  heroDef,
  heroPower,
  levelCapForStars,
  maxStars,
  shardsForStar,
  shardsToOwn,
  xpToNextLevel,
} from '../config/HeroConfig';
import { HEROES } from '../config/GameConfig';

/**
 * Unit tests for the hero roster: ownership/shards, the XP level curve gated by
 * the star-derived level cap, star-up consuming the correct shards + unlocking
 * skills, the aggregate lead-hero bonus math, and serialize round-trip.
 */
describe('HeroRoster', () => {
  it('grants a first copy at level 1 / 1 star with skill 0 unlocked', () => {
    const r = new HeroRoster();
    expect(r.isOwned('ember_warden')).toBe(false);
    expect(r.grantHero('ember_warden')).toBe(true);
    expect(r.isOwned('ember_warden')).toBe(true);
    const h = r.get('ember_warden')!;
    expect(h.level).toBe(1);
    expect(h.stars).toBe(1);
    // Skill 0 (unlocks at 1 star) is present at level 1.
    const skill0 = heroDef('ember_warden').skills[0].id;
    expect(h.skillLevels[skill0]).toBe(1);
    // Granting again does nothing (already owned).
    expect(r.grantHero('ember_warden')).toBe(false);
  });

  it('banks shards and can craft the first copy at the star-0 cost', () => {
    const r = new HeroRoster();
    const cost = shardsToOwn('iron_bulwark');
    r.addShards('iron_bulwark', cost - 1);
    expect(r.craftFromShards('iron_bulwark')).toBe(false); // one short
    r.addShards('iron_bulwark', 1);
    expect(r.craftFromShards('iron_bulwark')).toBe(true);
    expect(r.isOwned('iron_bulwark')).toBe(true);
    expect(r.shards('iron_bulwark')).toBe(0);
  });

  it('levels up by spending XP against the curve, capped by star level cap', () => {
    const r = new HeroRoster();
    r.grantHero('ember_warden');
    // The 1-star level cap.
    const cap = levelCapForStars(1);
    expect(cap).toBe(HEROES.LEVEL_CAP_PER_STAR);
    // Pour in far more XP than needed to hit the cap.
    let hugeXp = 0;
    for (let l = 1; l < cap; l++) hugeXp += xpToNextLevel(l);
    hugeXp += 10_000; // surplus
    r.addXp('ember_warden', hugeXp);
    const h = r.get('ember_warden')!;
    // Level is clamped at the 1-star cap even with surplus XP.
    expect(h.level).toBe(cap);
    // Surplus XP is retained (not lost) for when the hero stars up.
    expect(h.xp).toBeGreaterThan(0);
  });

  it('exact XP for one level-up advances exactly one level', () => {
    const r = new HeroRoster();
    r.grantHero('snow_picket');
    const need = xpToNextLevel(1);
    expect(r.addXp('snow_picket', need)).toBe(1);
    expect(r.get('snow_picket')!.level).toBe(2);
    // One short of the next level does not advance.
    expect(r.addXp('snow_picket', xpToNextLevel(2) - 1)).toBe(0);
    expect(r.get('snow_picket')!.level).toBe(2);
  });

  it('stars up by spending the correct shard cost and unlocks the next skill', () => {
    const r = new HeroRoster();
    r.grantHero('iron_bulwark'); // rare, 2 skills, maxStars 4
    const cost1 = shardsForStar('iron_bulwark', 1);
    // Not enough shards -> refuses.
    r.addShards('iron_bulwark', cost1 - 1);
    expect(r.starUp('iron_bulwark')).toBe(false);
    r.addShards('iron_bulwark', 1);
    expect(r.starUp('iron_bulwark')).toBe(true);
    const h = r.get('iron_bulwark')!;
    expect(h.stars).toBe(2);
    expect(r.shards('iron_bulwark')).toBe(0);
    // Skill 1 (unlocks at 2 stars) is now present.
    const skill1 = heroDef('iron_bulwark').skills[1].id;
    expect(h.skillLevels[skill1]).toBe(2);
  });

  it('refuses to star up past the rarity ceiling', () => {
    const r = new HeroRoster();
    r.grantHero('ember_warden'); // common, maxStars 3
    const ceiling = maxStars('ember_warden');
    // Give a mountain of shards and star up to the ceiling.
    r.addShards('ember_warden', 1_000_000);
    let guard = 0;
    while (r.starUp('ember_warden') && guard++ < 100) {
      /* keep starring */
    }
    expect(r.get('ember_warden')!.stars).toBe(ceiling);
    expect(r.starUp('ember_warden')).toBe(false);
  });

  it("a higher star raises the hero's power", () => {
    const r = new HeroRoster();
    r.grantHero('glacier_lance');
    const p1 = r.power('glacier_lance');
    r.addShards('glacier_lance', 1_000_000);
    r.starUp('glacier_lance');
    const p2 = r.power('glacier_lance');
    expect(p2).toBeGreaterThan(p1);
    expect(p2).toBeCloseTo(heroPower('glacier_lance', 1, 2), 6);
  });

  it('aggregates only LEAD heroes into the army/economy bonuses', () => {
    const r = new HeroRoster();
    r.grantHero('ember_warden'); // army bonus
    r.grantHero('snow_picket'); // economy bonus
    // No lead set yet -> no bonuses.
    expect(r.bonuses()).toEqual({ army: 0, economy: 0 });
    r.setLead(['ember_warden', 'snow_picket']);
    const b = r.bonuses();
    // Both base bonuses (at level1/star1, skill factor 1 for the fresh skill 0
    // ... actually skill 0 is unlocked, so skillFactor > 1). Just assert both
    // channels are positive and match the expected sign per hero class.
    expect(b.army).toBeGreaterThan(0);
    expect(b.economy).toBeGreaterThan(0);
    expect(r.armyPowerMultiplier()).toBeCloseTo(1 + b.army, 9);
    expect(r.economyMultiplier()).toBeCloseTo(1 + b.economy, 9);
  });

  it('lead is capped at MAX_LEAD and owned-only', () => {
    const r = new HeroRoster();
    r.grantHero('ember_warden');
    r.grantHero('snow_picket');
    r.grantHero('drift_runner');
    // iron_bulwark is NOT owned -> filtered out.
    r.setLead(['ember_warden', 'snow_picket', 'drift_runner', 'iron_bulwark']);
    expect(r.lead.length).toBe(Math.min(3, HEROES.MAX_LEAD));
    expect(r.lead).not.toContain('iron_bulwark');
  });

  it('a starred/leveled lead hero grants a larger bonus than a fresh one', () => {
    const base = new HeroRoster();
    base.grantHero('ember_warden');
    base.setLead(['ember_warden']);
    const baseBonus = base.bonuses().army;

    const dev = new HeroRoster();
    dev.grantHero('ember_warden');
    dev.addShards('ember_warden', 1_000_000);
    dev.starUp('ember_warden');
    dev.addXp('ember_warden', 100_000);
    dev.setLead(['ember_warden']);
    expect(dev.bonuses().army).toBeGreaterThan(baseBonus);
  });

  it('serializes and restores heroes + lead round-trip', () => {
    const r = new HeroRoster();
    r.grantHero('aurora_sentinel');
    r.addShards('aurora_sentinel', 1_000_000);
    r.starUp('aurora_sentinel');
    r.addXp('aurora_sentinel', xpToNextLevel(1) + 5);
    r.addShards('winters_eye', 3);
    r.setLead(['aurora_sentinel']);

    const restored = HeroRoster.fromJSON(r.toJSON());
    const a = restored.get('aurora_sentinel')!;
    const orig = r.get('aurora_sentinel')!;
    expect(a.level).toBe(orig.level);
    expect(a.stars).toBe(orig.stars);
    expect(a.xp).toBe(orig.xp);
    expect(a.skillLevels).toEqual(orig.skillLevels);
    expect(restored.shards('winters_eye')).toBe(3);
    expect(restored.lead).toEqual(['aurora_sentinel']);
  });

  it('fromJSON tolerates missing/garbage data (empty roster)', () => {
    expect(HeroRoster.fromJSON(undefined).ownedIds()).toEqual([]);
    expect(HeroRoster.fromJSON(null).lead).toEqual([]);
  });

  it('clamps a tampered save that over-levels beyond its star cap', () => {
    const restored = HeroRoster.fromJSON({
      heroes: {
        ember_warden: {
          id: 'ember_warden',
          owned: true,
          level: 999,
          xp: 0,
          stars: 1,
          shards: 0,
          skillLevels: {},
        },
      },
      lead: [],
    });
    // Level clamped to the 1-star cap; skill 0 rebuilt.
    expect(restored.get('ember_warden')!.level).toBe(levelCapForStars(1));
    const skill0 = heroDef('ember_warden').skills[0].id;
    expect(restored.get('ember_warden')!.skillLevels[skill0]).toBe(1);
  });
});
