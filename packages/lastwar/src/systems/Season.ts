/**
 * Season.ts - season / battle-pass progression + seasonal virus resistance
 * (FEAT-004).
 *
 * Phaser-free and deterministic. The season track advances purely by XP earned
 * from the rest of the meta loop (campaign clears, daily arms-race tasks, the
 * gate-runner mini-game, league placements). Each tier costs a geometrically
 * growing amount of XP; crossing a tier grants that tier's FREE reward always
 * and its PREMIUM reward only once the premium track is unlocked.
 *
 * The premium track is unlocked by an IN-GAME achievement - raising the
 * seasonal virus-resistance stat to {@link SEASON.PREMIUM_UNLOCK_RESISTANCE} -
 * NOT by any real-money purchase (this is a static single-player game with no
 * store). The seasonal virus-resistance stat is bought with season XP and gates
 * campaign stages (see Campaign.ts) and can gate later tiers too.
 *
 * SEASON ROLLOVER resets the seasonal progress (XP, tier, claimed rewards,
 * resistance, premium unlock) while PERMANENT gains banked elsewhere (heroes,
 * buildings, resources, coins) are untouched - this module only ever returns a
 * reset {@link SeasonState}, never the permanent state.
 */

import { SEASON, type RewardBundle } from '../config/Progression';
import type { SeasonState } from '../types';

/** A fresh, empty season state (season 1, tier 0, no XP, no resistance). */
export function freshSeason(): SeasonState {
  return {
    current: 1,
    progress: 0,
    xp: 0,
    tier: 0,
    claimedFree: 0,
    claimedPremium: 0,
    premiumUnlocked: false,
    resistance: SEASON.START_RESISTANCE,
  };
}

/** XP required to advance FROM `tier` to `tier + 1`. */
export function tierXpCost(tier: number): number {
  if (tier >= SEASON.MAX_TIER) return Infinity;
  return Math.round(SEASON.TIER_XP_BASE * Math.pow(SEASON.TIER_XP_GROWTH, tier));
}

/** Total cumulative XP required to reach `tier` from tier 0. */
export function cumulativeXpForTier(tier: number): number {
  let total = 0;
  for (let t = 0; t < tier && t < SEASON.MAX_TIER; t += 1) {
    total += tierXpCost(t);
  }
  return total;
}

/** The tier a cumulative XP total maps to (capped at MAX_TIER). */
export function tierForXp(xp: number): number {
  let tier = 0;
  let spent = 0;
  while (tier < SEASON.MAX_TIER) {
    const cost = tierXpCost(tier);
    if (spent + cost > xp) break;
    spent += cost;
    tier += 1;
  }
  return tier;
}

/** The tier-reward pair for a 1-based tier, or null if beyond the reward list. */
export function tierReward(tier: number): { free: RewardBundle; premium: RewardBundle } | null {
  const idx = tier - 1;
  if (idx < 0 || idx >= SEASON.TIER_REWARDS.length) return null;
  return SEASON.TIER_REWARDS[idx];
}

/** XP cost to raise virus resistance FROM `level` to `level + 1`. */
export function resistanceCost(level: number): number {
  if (level >= SEASON.MAX_RESISTANCE) return Infinity;
  return Math.round(SEASON.RESISTANCE_COST_BASE * Math.pow(SEASON.RESISTANCE_COST_GROWTH, level));
}

/** Merge reward bundle `b` into `a`, summing overlapping fields. */
export function mergeRewards(a: RewardBundle, b: RewardBundle): RewardBundle {
  const out: RewardBundle = {
    shards: (a.shards ?? 0) + (b.shards ?? 0),
    seasonXp: (a.seasonXp ?? 0) + (b.seasonXp ?? 0),
    coins: (a.coins ?? 0) + (b.coins ?? 0),
  };
  const resources: Record<string, number> = { ...(a.resources ?? {}) };
  for (const [k, v] of Object.entries(b.resources ?? {})) {
    resources[k] = (resources[k] ?? 0) + (v ?? 0);
  }
  if (Object.keys(resources).length > 0) out.resources = resources as RewardBundle['resources'];
  if (!out.shards) delete out.shards;
  if (!out.seasonXp) delete out.seasonXp;
  if (!out.coins) delete out.coins;
  return out;
}

/**
 * The result of adding XP to a season: the new state plus the aggregated reward
 * bundle unlocked by any tiers crossed. The caller (GameStore) applies the
 * reward to the permanent economy. NOTE: `seasonXp` inside a tier reward is NOT
 * fed back into the season track by this function (the caller decides), to keep
 * the XP-award step non-recursive and deterministic.
 */
export interface SeasonXpResult {
  /** The advanced season state. */
  state: SeasonState;
  /** Aggregated free + premium rewards for every tier newly crossed. */
  reward: RewardBundle;
  /** Tiers gained on this XP grant (0 if none). */
  tiersGained: number;
}

/**
 * Add season XP and settle any tiers crossed, granting each newly-reached
 * tier's free reward (always) and premium reward (only if the premium track is
 * unlocked). Pure: returns a new {@link SeasonState}; the input is not mutated.
 */
export function addSeasonXp(state: SeasonState, xp: number): SeasonXpResult {
  const gained = Math.max(0, Math.floor(xp));
  const newXp = state.xp + gained;
  const newTier = tierForXp(newXp);

  let reward: RewardBundle = {};
  let claimedFree = state.claimedFree;
  let claimedPremium = state.claimedPremium;

  // Grant free rewards for every tier from (claimedFree+1)..newTier.
  for (let t = claimedFree + 1; t <= newTier; t += 1) {
    const r = tierReward(t);
    if (r) reward = mergeRewards(reward, r.free);
    claimedFree = t;
  }
  // Grant premium rewards only when unlocked, for unclaimed reached tiers.
  if (state.premiumUnlocked) {
    for (let t = claimedPremium + 1; t <= newTier; t += 1) {
      const r = tierReward(t);
      if (r) reward = mergeRewards(reward, r.premium);
      claimedPremium = t;
    }
  }

  return {
    state: {
      ...state,
      xp: newXp,
      progress: newXp,
      tier: newTier,
      claimedFree,
      claimedPremium,
    },
    reward,
    tiersGained: newTier - state.tier,
  };
}

/** The result of spending XP to raise virus resistance. */
export interface ResistanceResult {
  /** True when the resistance level was raised. */
  ok: boolean;
  /** The (possibly unchanged) season state. */
  state: SeasonState;
}

/**
 * Spend banked season XP to raise the seasonal virus-resistance by one level.
 * Fails (ok:false, unchanged state) at the resistance cap or when the player
 * has not banked enough XP. Raising resistance to
 * {@link SEASON.PREMIUM_UNLOCK_RESISTANCE} unlocks the premium reward track as
 * an in-game achievement AND retroactively grants nothing here (the next XP
 * gain settles premium rewards for already-reached tiers).
 *
 * Spending XP reduces the banked XP but does NOT lower the earned tier: tiers,
 * once reached, are permanent for the season (claimedFree tracks that), so the
 * resistance sink competes with future tier progress rather than clawing back
 * past tiers.
 */
export function raiseResistance(state: SeasonState): ResistanceResult {
  if (state.resistance >= SEASON.MAX_RESISTANCE) return { ok: false, state };
  const cost = resistanceCost(state.resistance);
  if (state.xp < cost) return { ok: false, state };
  const newResistance = state.resistance + 1;
  const newXp = state.xp - cost;
  return {
    ok: true,
    state: {
      ...state,
      xp: newXp,
      progress: newXp,
      resistance: newResistance,
      premiumUnlocked: state.premiumUnlocked || newResistance >= SEASON.PREMIUM_UNLOCK_RESISTANCE,
    },
  };
}

/**
 * Roll the season over to `nextSeasonId`, RESETTING all seasonal progress (XP,
 * tier, claimed rewards, resistance, premium unlock) to fresh values while
 * carrying nothing forward. Permanent gains (heroes/buildings/resources) live
 * in other sub-states and are never touched here. Pure.
 */
export function rolloverSeason(_state: SeasonState, nextSeasonId: number): SeasonState {
  return { ...freshSeason(), current: Math.max(1, Math.floor(nextSeasonId)) };
}
