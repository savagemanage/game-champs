import { CHAMPIONS } from '../data/champions';
import { DIFFICULTY_CONFIG, MATCH_KIND_CONFIG } from '../game/tutorial/config';
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

export interface AppliedMatchOutcome {
  profile: ChampsProfile;
  applied: boolean;
  rewards: MatchRewards;
}

const NO_REWARDS: MatchRewards = { accountXp: 0, currency: 0, masteryXp: 0 };
const BASE_REWARDS = {
  win: { accountXp: 120, currency: 90, masteryXp: 75 },
  loss: { accountXp: 70, currency: 40, masteryXp: 45 },
} as const;

const CHAMPION_IDS = new Set(CHAMPIONS.map((champion) => champion.id));

function scaled(value: number, multiplier: number): number {
  return Math.max(0, Math.round(value * multiplier));
}

export function rewardsForMatch(facts: ProfileMatchOutcomeFacts): MatchRewards {
  if (facts.result === 'abandoned') return NO_REWARDS;
  const base = facts.result === 'win' ? BASE_REWARDS.win : BASE_REWARDS.loss;
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

export function setLastSetup(profile: ChampsProfile, setup: LastMatchSetup): ChampsProfile {
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
  ) return current;

  return {
    ...current,
    currency: current.currency - safeCost,
    unlockedChampionIds: [...current.unlockedChampionIds, championId],
  };
}

/** Apply one normal match exactly once and expose the actually applied delta. */
export function applyMatchOutcomeTransaction(
  profile: ChampsProfile,
  facts: ProfileMatchOutcomeFacts,
): AppliedMatchOutcome {
  const current = migrateProfile(profile);
  if (
    facts.result === 'abandoned' ||
    facts.matchId.trim().length === 0 ||
    current.appliedMatchIds.includes(facts.matchId)
  ) {
    return { profile: current, applied: false, rewards: NO_REWARDS };
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
          wins: priorMastery.wins + (facts.result === 'win' ? 1 : 0),
        },
      }
    : current.mastery;

  // Midline Continue preserves request settings; mastery credits the actual pick.
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

  const next: ChampsProfile = {
    ...current,
    accountXp: current.accountXp + rewards.accountXp,
    currency: current.currency + rewards.currency,
    mastery,
    tutorialCompleted:
      current.tutorialCompleted ||
      (facts.matchKind === 'tutorial' && facts.learningRequirementsCompleted === true),
    practiceCompleted: current.practiceCompleted || facts.matchKind === 'practice',
    lastSetup,
    appliedMatchIds: [...current.appliedMatchIds, facts.matchId].slice(-MAX_APPLIED_MATCH_IDS),
  };
  return { profile: next, applied: true, rewards };
}

export function applyMatchOutcome(
  profile: ChampsProfile,
  facts: ProfileMatchOutcomeFacts,
): ChampsProfile {
  return applyMatchOutcomeTransaction(profile, facts).profile;
}
