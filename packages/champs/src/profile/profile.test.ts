import { describe, expect, it } from 'vitest';
import {
  MAX_APPLIED_MATCH_IDS,
  PROFILE_STORAGE_KEY,
  PROFILE_VERSION,
  STARTER_CHAMPION_IDS,
  applyMatchOutcome,
  createDefaultProfile,
  loadProfile,
  markSeen,
  migrateProfile,
  resetProfile,
  rewardsForMatch,
  saveProfile,
  unlockChampion,
  type ProfileMatchOutcomeFacts,
  type ProfileStorage,
} from './index';

class MemoryStorage implements ProfileStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const outcome: ProfileMatchOutcomeFacts = {
  matchId: 'match-1',
  result: 'win',
  mode: 'conquest',
  matchKind: 'standard',
  difficulty: 'normal',
  playerChampionId: 'ashborne',
  enemyChampionId: 'nightveil',
};

describe('profile persistence', () => {
  it('creates a current version profile with starter unlocks', () => {
    const profile = createDefaultProfile();
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.unlockedChampionIds).toEqual(STARTER_CHAMPION_IDS);
    expect(profile.accountXp).toBe(0);
    expect(profile.currency).toBeGreaterThan(0);
  });

  it('migrates legacy fields and sanitizes corrupt values independently', () => {
    const profile = migrateProfile({
      xp: 125,
      currency: -50,
      unlockedChampions: ['nightveil', 'unknown', 'nightveil'],
      completedTutorial: true,
      completion: { practice: true },
      seen: { intro: true, invalid: false },
      appliedMatchIds: ['one', 'one', 2],
    });

    expect(profile.accountXp).toBe(125);
    expect(profile.currency).toBe(createDefaultProfile().currency);
    expect(profile.unlockedChampionIds).toContain('nightveil');
    expect(profile.unlockedChampionIds).not.toContain('unknown');
    expect(profile.tutorialCompleted).toBe(true);
    expect(profile.practiceCompleted).toBe(true);
    expect(profile.seenFlags).toEqual({ intro: true });
    expect(profile.appliedMatchIds).toEqual(['one']);
  });

  it('round-trips through the versioned storage key and resets', () => {
    const storage = new MemoryStorage();
    const profile = { ...createDefaultProfile(), accountXp: 42 };

    expect(saveProfile(profile, storage)).toBe(true);
    expect(storage.values.has(PROFILE_STORAGE_KEY)).toBe(true);
    expect(loadProfile(storage).accountXp).toBe(42);

    expect(resetProfile(storage)).toEqual(createDefaultProfile());
    expect(storage.values.has(PROFILE_STORAGE_KEY)).toBe(false);
  });

  it('fails safe when stored JSON or storage access fails', () => {
    const invalid = new MemoryStorage();
    invalid.setItem(PROFILE_STORAGE_KEY, '{invalid');
    expect(loadProfile(invalid)).toEqual(createDefaultProfile());

    const throwing: ProfileStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadProfile(throwing)).toEqual(createDefaultProfile());
    expect(saveProfile(createDefaultProfile(), throwing)).toBe(false);
    expect(resetProfile(throwing)).toEqual(createDefaultProfile());
  });
});

describe('profile progression', () => {
  it('applies an outcome once and records progression/setup/mastery', () => {
    const once = applyMatchOutcome(createDefaultProfile(), outcome);
    const twice = applyMatchOutcome(once, outcome);

    expect(once.accountXp).toBeGreaterThan(0);
    expect(once.currency).toBeGreaterThan(createDefaultProfile().currency);
    expect(once.mastery.ashborne).toMatchObject({ matches: 1, wins: 1 });
    expect(once.lastSetup).toEqual({
      mode: outcome.mode,
      matchKind: outcome.matchKind,
      difficulty: outcome.difficulty,
      playerChampionId: outcome.playerChampionId,
      enemyChampionId: outcome.enemyChampionId,
    });
    expect(once.appliedMatchIds).toEqual([outcome.matchId]);
    expect(twice).toEqual(once);
  });

  it('records practice/tutorial completion and suppresses their currency', () => {
    const practice = { ...outcome, matchId: 'practice-1', matchKind: 'practice' } as const;
    const tutorial = {
      ...outcome,
      matchId: 'tutorial-1',
      matchKind: 'tutorial',
      learningRequirementsCompleted: true,
    } as const;
    const start = createDefaultProfile();
    const afterPractice = applyMatchOutcome(start, practice);
    const afterTutorial = applyMatchOutcome(afterPractice, tutorial);

    expect(afterPractice.practiceCompleted).toBe(true);
    expect(afterPractice.currency).toBe(start.currency);
    expect(afterTutorial.tutorialCompleted).toBe(true);
    expect(afterTutorial.currency).toBe(start.currency);
  });

  it('preserves the requested Midline setup when the played roster was randomized', () => {
    const requested = {
      mode: 'midline',
      matchKind: 'standard',
      difficulty: 'hard',
      playerChampionId: 'ashborne',
      enemyChampionId: 'nightveil',
    } as const;
    const start = { ...createDefaultProfile(), lastSetup: requested };
    const randomizedOutcome = {
      ...outcome,
      matchId: 'midline-random-1',
      mode: 'midline',
      difficulty: 'hard',
      playerChampionId: 'dawnsong',
      enemyChampionId: 'embermage',
    } as const;

    const next = applyMatchOutcome(start, randomizedOutcome);

    expect(next.lastSetup).toEqual(requested);
    expect(next.mastery.dawnsong).toMatchObject({ matches: 1, wins: 1 });
  });

  it('bounds migrated and newly applied match ids to the recent window', () => {
    const oldIds = Array.from(
      { length: MAX_APPLIED_MATCH_IDS + 10 },
      (_, index) => `old-${index}`,
    );
    const migrated = migrateProfile({
      ...createDefaultProfile(),
      appliedMatchIds: oldIds,
    });

    expect(migrated.appliedMatchIds).toEqual(oldIds.slice(-MAX_APPLIED_MATCH_IDS));

    const next = applyMatchOutcome(migrated, {
      ...outcome,
      matchId: 'latest-match',
    });
    expect(next.appliedMatchIds).toHaveLength(MAX_APPLIED_MATCH_IDS);
    expect(next.appliedMatchIds[next.appliedMatchIds.length - 1]).toBe('latest-match');
    expect(next.appliedMatchIds).not.toContain(oldIds[oldIds.length - MAX_APPLIED_MATCH_IDS]);
  });

  it('uses difficulty in rewards and supports seen flags and paid unlocks', () => {
    const easy = rewardsForMatch({ ...outcome, difficulty: 'easy' });
    const hard = rewardsForMatch({ ...outcome, difficulty: 'hard' });
    expect(hard.accountXp).toBeGreaterThan(easy.accountXp);

    const seen = markSeen(createDefaultProfile(), 'build-tip');
    expect(seen.seenFlags['build-tip']).toBe(true);

    const unlocked = unlockChampion(seen, 'nightveil', 200);
    expect(unlocked.unlockedChampionIds).toContain('nightveil');
    expect(unlocked.currency).toBe(seen.currency - 200);
    expect(unlockChampion(unlocked, 'nightveil', 200)).toEqual(unlocked);
  });
});
