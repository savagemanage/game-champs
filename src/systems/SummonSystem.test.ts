import { describe, it, expect } from 'vitest';
import { SummonSystem, mulberry32 } from './SummonSystem';
import { SUMMON } from '../config/GameConfig';
import { HERO_DEFS } from '../config/HeroConfig';
import type { HeroId, HeroRarity } from '../types';

/**
 * Unit tests for the deterministic summon gacha: reproducibility under a fixed
 * seed, rarity distribution honoring the configured weights, the pity guarantee
 * after the configured miss count, duplicate -> shards conversion, and the
 * serialize round-trip. Each test fails if the corresponding rule were reverted.
 */

/** A never-owned predicate (every pull is a first copy). */
const NONE_OWNED = () => false;

describe('SummonSystem', () => {
  it('is deterministic: the same seed yields the same pull sequence', () => {
    const a = new SummonSystem();
    const b = new SummonSystem();
    const rngA = mulberry32(12345);
    const rngB = mulberry32(12345);
    for (let i = 0; i < 50; i++) {
      const ra = a.pull(rngA, NONE_OWNED);
      const rb = b.pull(rngB, NONE_OWNED);
      expect(rb.hero).toBe(ra.hero);
      expect(rb.rarity).toBe(ra.rarity);
    }
  });

  it('rolls a valid hero of the rolled rarity every pull', () => {
    const s = new SummonSystem();
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const r = s.pull(rng, NONE_OWNED);
      expect(HERO_DEFS[r.hero]).toBeDefined();
      expect(HERO_DEFS[r.hero].rarity).toBe(r.rarity);
    }
  });

  it('roughly honors the configured rarity weights over many pulls', () => {
    const s = new SummonSystem();
    const rng = mulberry32(99);
    const counts: Record<HeroRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const N = 5000;
    for (let i = 0; i < N; i++) counts[s.pull(rng, NONE_OWNED).rarity]++;
    // Commons should dominate rares which dominate epics which dominate legendaries.
    // (Pity nudges epics up, so we assert ordering + a loose common share.)
    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.epic);
    expect(counts.common / N).toBeGreaterThan(0.4);
  });

  it('guarantees an epic+ pull after PITY_THRESHOLD misses', () => {
    // A seed engineered path is unnecessary: force the pity by driving the
    // counter to the threshold, then assert the next pull is epic+.
    const s = new SummonSystem({ totalPulls: 0, pityCounter: SUMMON.PITY_THRESHOLD });
    expect(s.pityReady).toBe(true);
    // Any rng value must still land epic+ because rollRarity restricts the pool.
    const r = s.pull(() => 0.999999, NONE_OWNED);
    expect(r.pity).toBe(true);
    expect(['epic', 'legendary']).toContain(r.rarity);
    // The counter resets after the guaranteed high-rarity pull.
    expect(s.pityCounter).toBe(0);
    expect(s.pityReady).toBe(false);
  });

  it('never lets a dry streak exceed the pity threshold', () => {
    const s = new SummonSystem();
    const rng = mulberry32(4242);
    let sinceHigh = 0;
    let maxStreak = 0;
    for (let i = 0; i < 2000; i++) {
      const r = s.pull(rng, NONE_OWNED);
      if (r.rarity === 'epic' || r.rarity === 'legendary') {
        sinceHigh = 0;
      } else {
        sinceHigh++;
        maxStreak = Math.max(maxStreak, sinceHigh);
      }
    }
    // A miss streak can reach at most PITY_THRESHOLD before a forced high pull.
    expect(maxStreak).toBeLessThanOrEqual(SUMMON.PITY_THRESHOLD);
  });

  it('converts a duplicate pull into rarity-scaled shards', () => {
    const s = new SummonSystem();
    // Own EVERY hero so every pull is a duplicate.
    const owned = () => true;
    const rng = mulberry32(2024);
    for (let i = 0; i < 100; i++) {
      const r = s.pull(rng, owned);
      expect(r.outcome).toBe('shards');
      expect(r.shards).toBe(SUMMON.DUPLICATE_SHARDS[r.rarity]);
    }
  });

  it('grants a first copy when the hero is not owned', () => {
    const s = new SummonSystem();
    const ownedSet = new Set<HeroId>();
    const rng = mulberry32(555);
    let firstCopies = 0;
    for (let i = 0; i < 100; i++) {
      const r = s.pull(rng, (id) => ownedSet.has(id));
      if (r.outcome === 'hero') {
        firstCopies++;
        ownedSet.add(r.hero);
      }
    }
    expect(firstCopies).toBeGreaterThan(0);
  });

  it('serializes and restores the pity + total-pull state', () => {
    const s = new SummonSystem();
    const rng = mulberry32(1);
    for (let i = 0; i < 7; i++) s.pull(rng, NONE_OWNED);
    const json = s.toJSON();
    const restored = SummonSystem.fromJSON(json);
    expect(restored.totalPulls).toBe(s.totalPulls);
    expect(restored.pityCounter).toBe(s.pityCounter);
  });

  it('fromJSON tolerates missing/garbage data (fresh state)', () => {
    expect(SummonSystem.fromJSON(undefined).totalPulls).toBe(0);
    expect(SummonSystem.fromJSON(null).pityCounter).toBe(0);
  });
});
