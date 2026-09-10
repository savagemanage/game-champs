import type { Difficulty, MatchKind } from '../game/tutorial/config';

/** Structurally compatible with the arena modes without importing battle state. */
export type ProfileGameMode = 'conquest' | 'midline';

export interface ChampionMastery {
  xp: number;
  matches: number;
  wins: number;
}

export interface LastMatchSetup {
  mode: ProfileGameMode;
  matchKind: MatchKind;
  difficulty: Difficulty;
  playerChampionId: string;
  enemyChampionId: string;
}

/** Persisted profile schema. Changes require a version migration. */
export interface ChampsProfile {
  version: number;
  /** Next installation-local monotonic match counter (never decremented). */
  nextMatchCounter: number;
  accountXp: number;
  currency: number;
  unlockedChampionIds: string[];
  mastery: Record<string, ChampionMastery>;
  tutorialCompleted: boolean;
  practiceCompleted: boolean;
  lastSetup?: LastMatchSetup;
  seenFlags: Record<string, true>;
  appliedMatchIds: string[];
}

/** Minimal storage contract, compatible with window.localStorage and test fakes. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ProfileMatchResult = 'win' | 'loss' | 'draw' | 'abandoned';

/** Self-contained facts needed to apply a result to progression. */
export interface ProfileMatchOutcomeFacts extends LastMatchSetup {
  matchId: string;
  result: ProfileMatchResult;
  /** True only when every mandatory Learning action was performed. */
  learningRequirementsCompleted?: boolean;
}


/** Concise aliases for consumers that do not need the profile namespace. */
export type Profile = ChampsProfile;
export type GameMode = ProfileGameMode;
export type MatchOutcomeFacts = ProfileMatchOutcomeFacts;
