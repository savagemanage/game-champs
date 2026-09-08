/** Pure configuration shared by standard, practice, and learning matches. */

export type MatchKind = 'standard' | 'practice' | 'tutorial';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  /** Multiplier used by profile rewards. */
  progressionMultiplier: number;
  /** Delay before an AI-controlled champion may react, in milliseconds. */
  reactionDelayMs: number;
  /** How often the AI may reconsider its plan, in milliseconds. */
  decisionIntervalMs: number;
}

export interface MatchKindConfig {
  recordsCompletion: boolean;
  grantsCurrency: boolean;
  progressionMultiplier: number;
}

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const MATCH_KINDS: readonly MatchKind[] = [
  'standard',
  'practice',
  'tutorial',
];

export const DIFFICULTY_CONFIG: Readonly<Record<Difficulty, DifficultyConfig>> = {
  easy: {
    progressionMultiplier: 0.8,
    reactionDelayMs: 500,
    decisionIntervalMs: 900,
  },
  normal: {
    progressionMultiplier: 1,
    reactionDelayMs: 300,
    decisionIntervalMs: 650,
  },
  hard: {
    progressionMultiplier: 1.25,
    reactionDelayMs: 150,
    decisionIntervalMs: 450,
  },
};

export const MATCH_KIND_CONFIG: Readonly<Record<MatchKind, MatchKindConfig>> = {
  standard: {
    recordsCompletion: false,
    grantsCurrency: true,
    progressionMultiplier: 1,
  },
  practice: {
    recordsCompletion: true,
    grantsCurrency: false,
    progressionMultiplier: 0.5,
  },
  tutorial: {
    recordsCompletion: true,
    grantsCurrency: false,
    progressionMultiplier: 0.35,
  },
};

export function isMatchKind(value: unknown): value is MatchKind {
  return typeof value === 'string' && MATCH_KINDS.includes(value as MatchKind);
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as Difficulty);
}
