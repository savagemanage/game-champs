import { CHAMPIONS } from '../data/champions';
import {
  DIFFICULTY_CONFIG,
  MATCH_KIND_CONFIG,
} from '../game/tutorial/config';
import { MAX_APPLIED_MATCH_IDS, migrateProfile } from './profile';
import type {
  ChampionMastery,
  ChampsProfile,
  LastMatchSetup,
  ProfileMatchOutcomeFacts,
} from './types';

export interface MatchRewards {
  accountXp: number;
  currency: number;
  masteryXp: number;
}

const BASE_REWARDS = {
  win: { accountXp: 120, currency: 90, masteryXp: 75 },
  loss: { accountXp: 70, currency: 40, masteryXp: 45 },
} as const;

const CHAMPION_IDS = new Set(CHAMPIONS.map((champion) => champion.id));

function scaled(value: number, multiplier: number): number {
  return Math.max(0, Math.round(value * multiplier));
}

export function rewardsForMatch(facts: ProfileMatchOutcomeFacts): MatchRewards {
  const base = facts.win ? BASE_REWARDS.win : BASE_REWARDS.loss;
  const kind = MATCH_KIND_CONFIG[facts.matchKind];
  const multiplier =
    kind.progressionMultiplier *
    DIFFICULTY_CONFIG[facts.difficulty].progressionMultiplier;

  return {
    accountXp: scaled(base.accountXp, multiplier),
    currency: kind.grantsCurrency ? scaled(base.currency, multiplier) : 0,
    masteryXp: scaled(base.masteryXp, multiplier),
  };
}

export function accountLevelForXp(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  return Math.floor(Math.sqrt(safeXp / 250)) + 1;
}

export function masteryLevelForXp(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  return Math.min(10, Math.floor(safeXp / 200) + 1);
}

export function setLastSetup(
  profile: ChampsProfile,
  setup: LastMatchSetup,
): ChampsProfile {
  return { ...migrateProfile(profile), lastSetup: { ...setup } };
}

export function markSeen(profile: ChampsProfile, flag: string): ChampsProfile {
  const current = migrateProfile(profile);
  if (flag.length === 0 || current.seenFlags[flag]) return current;
  return { ...current, seenFlags: { ...current.seenFlags, [flag]: true } };
}

export function unlockChampion(
  profile: ChampsProfile,
  championId: string,
  cost: number,
): ChampsProfile {
  const current = migrateProfile(profile);
  const safeCost = Number.isFinite(cost) ? Math.max(0, Math.floor(cost)) : Infinity;
  if (
    !CHAMPION_IDS.has(championId) ||
    current.unlockedChampionIds.includes(championId) ||
    current.currency < safeCost
  ) {
    return current;
  }

  return {
    ...current,
    currency: current.currency - safeCost,
    unlockedChampionIds: [...current.unlockedChampionIds, championId],
  };
}

/** Apply one match exactly once without importing mutable battle state. */
export function applyMatchOutcome(
  profile: ChampsProfile,
  facts: ProfileMatchOutcomeFacts,
): ChampsProfile {
  const current = migrateProfile(profile);
  if (facts.matchId.length === 0 || current.appliedMatchIds.includes(facts.matchId)) {
    return current;
  }

  const rewards = rewardsForMatch(facts);
  const priorMastery: ChampionMastery = current.mastery[facts.playerChampionId] ?? {
    xp: 0,
    matches: 0,
    wins: 0,
  };
  const mastery = CHAMPION_IDS.has(facts.playerChampionId)
    ? {
        ...current.mastery,
        [facts.playerChampionId]: {
          xp: priorMastery.xp + rewards.masteryXp,
          matches: priorMastery.matches + 1,
          wins: priorMastery.wins + (facts.win ? 1 : 0),
        },
      }
    : current.mastery;

  // Midline randomizes the actual roster inside BattleScene. Continue must
  // preserve the player's requested (and unlocked) setup rather than replacing
  // it with a random champion that may be locked. Mastery above still credits
  // the champion that was actually played.
  const lastSetup =
    facts.mode === 'midline' && current.lastSetup?.mode === 'midline'
      ? current.lastSetup
      : {
          mode: facts.mode,
          matchKind: facts.matchKind,
          difficulty: facts.difficulty,
          playerChampionId: facts.playerChampionId,
          enemyChampionId: facts.enemyChampionId,
        };

  return {
    ...current,
    accountXp: current.accountXp + rewards.accountXp,
    currency: current.currency + rewards.currency,
    mastery,
    tutorialCompleted:
      current.tutorialCompleted || facts.matchKind === 'tutorial',
    practiceCompleted:
      current.practiceCompleted || facts.matchKind === 'practice',
    lastSetup,
    appliedMatchIds: [...current.appliedMatchIds, facts.matchId].slice(
      -MAX_APPLIED_MATCH_IDS,
    ),
  };
}
