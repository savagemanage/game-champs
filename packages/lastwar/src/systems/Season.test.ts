import { describe, it, expect } from 'vitest';
import {
  addSeasonXp,
  cumulativeXpForTier,
  freshSeason,
  raiseResistance,
  resistanceCost,
  rolloverSeason,
  tierForXp,
  tierReward,
  tierXpCost,
} from './Season';
import { SEASON } from '../config/Progression';

/**
 * Season / battle-pass tests: the XP -> tier curve is monotonic, XP grants
 * cross tiers and pay free rewards (premium only when unlocked), the virus-
 * resistance gate unlocks the premium track, and season rollover resets
 * seasonal progress. These fail if the tier curve, the premium-gate, or the
 * rollover reset were reverted.
 */
describe('Season', () => {
  it('tier XP cost curve is monotonically increasing and caps at MAX_TIER', () => {
    for (let t = 0; t < SEASON.MAX_TIER - 1; t += 1) {
      expect(tierXpCost(t + 1)).toBeGreaterThan(tierXpCost(t));
    }
    expect(tierXpCost(SEASON.MAX_TIER)).toBe(Infinity);
  });

  it('tierForXp maps cumulative XP to the right tier', () => {
    expect(tierForXp(0)).toBe(0);
    // Exactly enough XP for tier 1.
    expect(tierForXp(cumulativeXpForTier(1))).toBe(1);
    // One short of tier 2 stays at tier 1.
    expect(tierForXp(cumulativeXpForTier(2) - 1)).toBe(1);
    expect(tierForXp(cumulativeXpForTier(3))).toBe(3);
  });

  it('addSeasonXp advances the tier and pays free rewards, not premium (locked)', () => {
    const start = freshSeason();
    // Enough XP to reach several tiers.
    const xp = cumulativeXpForTier(3);
    const res = addSeasonXp(start, xp);
    expect(res.state.tier).toBe(3);
    expect(res.tiersGained).toBe(3);
    expect(res.state.xp).toBe(xp);
    expect(res.state.progress).toBe(xp); // legacy alias kept in sync
    // Free reward for tier 1 (rations) is present; premium (shards) is NOT,
    // because the premium track is locked on a fresh season.
    expect(res.reward.resources?.rations).toBeGreaterThan(0);
    // Tier 1 premium is 20 shards; with premium locked those must not appear
    // beyond any free-track shards. Tier-1/3 free tracks give no shards, tier 2
    // free gives 8 shards.
    expect(res.reward.shards ?? 0).toBe(tierReward(2)!.free.shards);
  });

  it('addSeasonXp pays premium rewards once the premium track is unlocked', () => {
    const unlocked = { ...freshSeason(), premiumUnlocked: true };
    const xp = cumulativeXpForTier(1);
    const res = addSeasonXp(unlocked, xp);
    expect(res.state.tier).toBe(1);
    // Tier 1 premium is 20 shards, so unlocked premium adds them.
    expect(res.reward.shards ?? 0).toBeGreaterThanOrEqual(tierReward(1)!.premium.shards ?? 0);
    expect(res.state.claimedPremium).toBe(1);
  });

  it('does not double-pay a tier across successive XP grants', () => {
    let s = freshSeason();
    const toTier2 = cumulativeXpForTier(2);
    const first = addSeasonXp(s, toTier2);
    s = first.state;
    expect(s.tier).toBe(2);
    // A tiny extra grant that does not cross a new tier pays nothing.
    const second = addSeasonXp(s, 1);
    expect(second.tiersGained).toBe(0);
    expect(second.reward).toEqual({});
  });

  it('resistance cost curve is monotonic and gated by banked XP', () => {
    for (let l = 0; l < SEASON.MAX_RESISTANCE - 1; l += 1) {
      expect(resistanceCost(l + 1)).toBeGreaterThan(resistanceCost(l));
    }
    // Not enough XP -> fails, unchanged.
    const poor = { ...freshSeason(), xp: 0 };
    const failed = raiseResistance(poor);
    expect(failed.ok).toBe(false);
    expect(failed.state.resistance).toBe(0);
  });

  it('raising virus resistance to the threshold unlocks the premium track', () => {
    // Bank a large amount of XP so several resistance levels are affordable.
    let s = { ...freshSeason(), xp: 100000 };
    expect(s.premiumUnlocked).toBe(false);
    for (let i = 0; i < SEASON.PREMIUM_UNLOCK_RESISTANCE; i += 1) {
      const res = raiseResistance(s);
      expect(res.ok).toBe(true);
      s = res.state;
    }
    expect(s.resistance).toBe(SEASON.PREMIUM_UNLOCK_RESISTANCE);
    expect(s.premiumUnlocked).toBe(true);
    // XP was actually spent.
    expect(s.xp).toBeLessThan(100000);
  });

  it('resistance is capped at MAX_RESISTANCE', () => {
    let s = { ...freshSeason(), xp: 1e9, resistance: SEASON.MAX_RESISTANCE };
    const res = raiseResistance(s);
    expect(res.ok).toBe(false);
    expect(res.state.resistance).toBe(SEASON.MAX_RESISTANCE);
  });

  it('season rollover resets seasonal progress but advances the season id', () => {
    const played = {
      ...freshSeason(),
      current: 1,
      xp: 5000,
      tier: 8,
      claimedFree: 8,
      claimedPremium: 8,
      premiumUnlocked: true,
      resistance: 5,
    };
    const rolled = rolloverSeason(played, 2);
    expect(rolled.current).toBe(2);
    expect(rolled.xp).toBe(0);
    expect(rolled.tier).toBe(0);
    expect(rolled.resistance).toBe(SEASON.START_RESISTANCE);
    expect(rolled.premiumUnlocked).toBe(false);
    expect(rolled.claimedFree).toBe(0);
    expect(rolled.claimedPremium).toBe(0);
  });
});
