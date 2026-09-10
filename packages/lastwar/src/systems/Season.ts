/** Deterministic season track, spendable resistance XP, and reward settlement. */
import { SEASON, type RewardBundle } from '../config/Progression';
import type { SeasonState } from '../types';

export function freshSeason(): SeasonState {
  return {
    current: 1,
    progress: 0,
    xp: 0,
    earnedXp: 0,
    availableXp: 0,
    tier: 0,
    claimedFree: 0,
    claimedPremium: 0,
    premiumUnlocked: false,
    resistance: SEASON.START_RESISTANCE,
  };
}

export function tierXpCost(tier: number): number {
  if (tier >= SEASON.MAX_TIER) return Infinity;
  return Math.round(SEASON.TIER_XP_BASE * Math.pow(SEASON.TIER_XP_GROWTH, tier));
}

export function cumulativeXpForTier(tier: number): number {
  let total = 0;
  for (let t = 0; t < tier && t < SEASON.MAX_TIER; t += 1) total += tierXpCost(t);
  return total;
}

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

export function tierReward(tier: number): { free: RewardBundle; premium: RewardBundle } | null {
  return SEASON.TIER_REWARDS[tier - 1] ?? null;
}

export function resistanceCost(level: number): number {
  if (level >= SEASON.MAX_RESISTANCE) return Infinity;
  return Math.round(SEASON.RESISTANCE_COST_BASE * Math.pow(SEASON.RESISTANCE_COST_GROWTH, level));
}

export function mergeRewards(a: RewardBundle, b: RewardBundle): RewardBundle {
  const out: RewardBundle = {
    shards: (a.shards ?? 0) + (b.shards ?? 0),
    seasonXp: (a.seasonXp ?? 0) + (b.seasonXp ?? 0),
    coins: (a.coins ?? 0) + (b.coins ?? 0),
  };
  const resources: Record<string, number> = { ...(a.resources ?? {}) };
  for (const [key, value] of Object.entries(b.resources ?? {})) {
    resources[key] = (resources[key] ?? 0) + (value ?? 0);
  }
  if (Object.keys(resources).length) out.resources = resources as RewardBundle['resources'];
  if (!out.shards) delete out.shards;
  if (!out.seasonXp) delete out.seasonXp;
  if (!out.coins) delete out.coins;
  return out;
}

export interface SeasonXpResult {
  state: SeasonState;
  reward: RewardBundle;
  tiersGained: number;
}

function settleReachedRewards(
  state: SeasonState,
  reachedTier: number,
): { reward: RewardBundle; claimedFree: number; claimedPremium: number } {
  let reward: RewardBundle = {};
  let claimedFree = state.claimedFree;
  let claimedPremium = state.claimedPremium;
  for (let tier = claimedFree + 1; tier <= reachedTier; tier += 1) {
    const pair = tierReward(tier);
    if (pair) reward = mergeRewards(reward, pair.free);
    claimedFree = tier;
  }
  if (state.premiumUnlocked) {
    for (let tier = claimedPremium + 1; tier <= reachedTier; tier += 1) {
      const pair = tierReward(tier);
      if (pair) reward = mergeRewards(reward, pair.premium);
      claimedPremium = tier;
    }
  }
  return { reward, claimedFree, claimedPremium };
}

export function addSeasonXp(state: SeasonState, xp: number): SeasonXpResult {
  const gained = Math.max(0, Math.floor(xp));
  const earnedXp = state.earnedXp + gained;
  const availableXp = state.availableXp + gained;
  const newTier = tierForXp(earnedXp);
  const settled = settleReachedRewards(state, newTier);
  return {
    state: {
      ...state,
      earnedXp,
      availableXp,
      xp: availableXp,
      progress: availableXp,
      tier: newTier,
      claimedFree: settled.claimedFree,
      claimedPremium: settled.claimedPremium,
    },
    reward: settled.reward,
    tiersGained: newTier - state.tier,
  };
}

export interface ResistanceResult {
  ok: boolean;
  state: SeasonState;
  /** Premium backfill granted atomically when resistance 3 is reached. */
  reward: RewardBundle;
}

export function raiseResistance(state: SeasonState): ResistanceResult {
  if (state.resistance >= SEASON.MAX_RESISTANCE) return { ok: false, state, reward: {} };
  const cost = resistanceCost(state.resistance);
  if (state.availableXp < cost) return { ok: false, state, reward: {} };
  const resistance = state.resistance + 1;
  const availableXp = state.availableXp - cost;
  const premiumUnlocked = state.premiumUnlocked || resistance >= SEASON.PREMIUM_UNLOCK_RESISTANCE;
  let next: SeasonState = {
    ...state,
    availableXp,
    xp: availableXp,
    progress: availableXp,
    resistance,
    premiumUnlocked,
  };
  let reward: RewardBundle = {};
  if (!state.premiumUnlocked && premiumUnlocked) {
    const settled = settleReachedRewards(next, next.tier);
    reward = settled.reward;
    next = { ...next, claimedFree: settled.claimedFree, claimedPremium: settled.claimedPremium };
  }
  return { ok: true, state: next, reward };
}

export function rolloverSeason(_state: SeasonState, nextSeasonId: number): SeasonState {
  return { ...freshSeason(), current: Math.max(1, Math.floor(nextSeasonId)) };
}
