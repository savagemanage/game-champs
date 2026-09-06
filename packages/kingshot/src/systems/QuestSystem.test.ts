import { describe, it, expect } from 'vitest';
import { QuestSystem } from './QuestSystem';
import {
  QUEST_DEFS,
  QUEST_ORDER,
  conditionProgress,
  isComplete,
  questDef,
  type QuestProgress,
} from '../config/QuestConfig';

/**
 * Pure-logic tests for the progression-quest runtime (FEAT-006). No Phaser: the
 * QuestSystem is evaluated entirely against plain {@link QuestProgress}
 * snapshots, so the completion logic, chain unlocking, claim-once semantics, and
 * JSON round-trip are all exercised without a scene.
 */

/** A zeroed progress snapshot; individual cases override the fields they test. */
function emptyProgress(over: Partial<QuestProgress> = {}): QuestProgress {
  return {
    buildingLevels: {},
    townCenterLevel: 1,
    troopsTrained: 0,
    battlesWon: 0,
    techsUnlocked: 0,
    unlockedTechIds: [],
    ...over,
  };
}

describe('QuestConfig.isComplete', () => {
  it('buildingLevel: satisfied only when the building is at/above the level', () => {
    const def = questDef('raise_a_farm'); // farm >= 1
    expect(isComplete(def, emptyProgress({ buildingLevels: {} }))).toBe(false);
    expect(isComplete(def, emptyProgress({ buildingLevels: { farm: 0 } }))).toBe(false);
    expect(isComplete(def, emptyProgress({ buildingLevels: { farm: 1 } }))).toBe(true);
    expect(isComplete(def, emptyProgress({ buildingLevels: { farm: 3 } }))).toBe(true);
  });

  it('townCenterLevel: satisfied at/above the target level', () => {
    const def = questDef('grow_the_center'); // TC >= 3
    expect(isComplete(def, emptyProgress({ townCenterLevel: 2 }))).toBe(false);
    expect(isComplete(def, emptyProgress({ townCenterLevel: 3 }))).toBe(true);
    expect(isComplete(def, emptyProgress({ townCenterLevel: 5 }))).toBe(true);
  });

  it('troopsTrained: satisfied at/above the count', () => {
    const def = questDef('first_recruits'); // trained >= 10
    expect(isComplete(def, emptyProgress({ troopsTrained: 9 }))).toBe(false);
    expect(isComplete(def, emptyProgress({ troopsTrained: 10 }))).toBe(true);
    expect(isComplete(def, emptyProgress({ troopsTrained: 40 }))).toBe(true);
  });

  it('battlesWon: satisfied at/above the count', () => {
    const def = questDef('repel_the_raiders'); // battlesWon >= 5
    expect(isComplete(def, emptyProgress({ battlesWon: 4 }))).toBe(false);
    expect(isComplete(def, emptyProgress({ battlesWon: 5 }))).toBe(true);
  });

  it('techUnlocked (count): satisfied at/above the tech count', () => {
    const def = questDef('first_research'); // techsUnlocked >= 1
    expect(isComplete(def, emptyProgress({ techsUnlocked: 0 }))).toBe(false);
    expect(isComplete(def, emptyProgress({ techsUnlocked: 1 }))).toBe(true);
  });

  it('techUnlocked (specific techId): matches a specific unlocked tech', () => {
    const def = {
      id: 'raise_a_farm' as const,
      condition: { type: 'techUnlocked' as const, techId: 'crop_rotation' },
      reward: {},
    };
    expect(isComplete(def, emptyProgress({ unlockedTechIds: [] }))).toBe(false);
    expect(isComplete(def, emptyProgress({ unlockedTechIds: ['sharpened_blades'] }))).toBe(false);
    expect(isComplete(def, emptyProgress({ unlockedTechIds: ['crop_rotation'] }))).toBe(true);
  });

  it('conditionProgress reports a clamped have/need pair', () => {
    expect(conditionProgress(questDef('first_recruits'), emptyProgress({ troopsTrained: 4 }))).toEqual({ have: 4, need: 10 });
    // Clamped so a "have" never exceeds "need".
    expect(conditionProgress(questDef('first_recruits'), emptyProgress({ troopsTrained: 40 }))).toEqual({ have: 10, need: 10 });
    expect(conditionProgress(questDef('grow_the_center'), emptyProgress({ townCenterLevel: 2 }))).toEqual({ have: 2, need: 3 });
  });
});

describe('QuestSystem.refresh - chain unlocking', () => {
  it('locks every quest but the first on a fresh log', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress());
    // The chain now leads with the wood-first Lumber Mill quest.
    expect(q.status('secure_the_timber')).toBe('active'); // first, unlocked, condition unmet
    expect(q.status('raise_a_farm')).toBe('locked'); // predecessor not claimed
    expect(q.status('grow_the_center')).toBe('locked');
  });

  it('marks the first quest completable once its condition is met', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1 } }));
    expect(q.status('secure_the_timber')).toBe('completable');
    // The next quest stays locked until the first is CLAIMED (not merely done).
    expect(q.status('raise_a_farm')).toBe('locked');
  });

  it('unlocks the next quest only after the predecessor is claimed', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1, farm: 1 } }));
    expect(q.status('secure_the_timber')).toBe('completable');
    expect(q.status('raise_a_farm')).toBe('locked');

    // Claim the first: the second (raise_a_farm) unlocks and, since the farm is
    // already built, is completable.
    expect(q.claim('secure_the_timber')).not.toBeNull();
    q.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1, farm: 1 } }));
    expect(q.status('secure_the_timber')).toBe('claimed');
    expect(q.status('raise_a_farm')).toBe('completable');
    expect(q.status('grow_the_center')).toBe('locked'); // still behind raise_a_farm
  });
});

describe('QuestSystem.claim - reward correctness + claim-once', () => {
  it('returns the exact reward bundle for a completable quest', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1 } }));
    const reward = q.claim('secure_the_timber');
    expect(reward).toEqual(QUEST_DEFS.secure_the_timber.reward);
    expect(reward?.resources).toEqual({ wood: 200 });
  });

  it('returns a shard reward when the quest grants shards', () => {
    const q = new QuestSystem();
    // Fast-forward the chain by claiming predecessors with a satisfying snapshot.
    const full = emptyProgress({
      buildingLevels: { lumber_mill: 1, farm: 1, research: 1 },
      townCenterLevel: 3,
      troopsTrained: 10,
    });
    q.refresh(full);
    q.claim('secure_the_timber');
    q.refresh(full);
    q.claim('raise_a_farm');
    q.refresh(full);
    q.claim('grow_the_center');
    q.refresh(full);
    const reward = q.claim('first_recruits');
    expect(reward?.shards).toEqual({ heroId: 'ser_alden', shards: 5 });
  });

  it('cannot claim a locked or incomplete quest', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress()); // lumber mill not built, chain locked
    expect(q.canClaim('secure_the_timber')).toBe(false);
    expect(q.claim('secure_the_timber')).toBeNull();
    expect(q.canClaim('raise_a_farm')).toBe(false); // locked
    expect(q.claim('raise_a_farm')).toBeNull();
  });

  it('cannot be claimed twice (claim-once)', () => {
    const q = new QuestSystem();
    q.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1 } }));
    expect(q.claim('secure_the_timber')).not.toBeNull();
    expect(q.isClaimed('secure_the_timber')).toBe(true);
    // A second claim yields nothing.
    expect(q.canClaim('secure_the_timber')).toBe(false);
    expect(q.claim('secure_the_timber')).toBeNull();
  });
});

describe('QuestSystem JSON round-trip', () => {
  it('persists and restores the claimed set', () => {
    const q = new QuestSystem();
    const snap = emptyProgress({ buildingLevels: { lumber_mill: 1, farm: 1 }, townCenterLevel: 3 });
    q.refresh(snap);
    q.claim('secure_the_timber');
    q.refresh(snap);
    q.claim('raise_a_farm');

    const json = q.toJSON();
    expect(json.claimed).toEqual(['secure_the_timber', 'raise_a_farm']);

    const restored = QuestSystem.fromJSON(json);
    expect(restored.claimed).toEqual(['secure_the_timber', 'raise_a_farm']);
    expect(restored.isClaimed('secure_the_timber')).toBe(true);
    // After restore, refresh derives the next quest as unlocked.
    restored.refresh(emptyProgress({ buildingLevels: { lumber_mill: 1, farm: 1, research: 1 }, townCenterLevel: 3, troopsTrained: 10 }));
    expect(restored.status('grow_the_center')).toBe('completable');
  });

  it('tolerates a missing / malformed / stale save', () => {
    expect(QuestSystem.fromJSON(undefined).claimed).toEqual([]);
    expect(QuestSystem.fromJSON(null).claimed).toEqual([]);
    expect(QuestSystem.fromJSON({}).claimed).toEqual([]);
    // Unknown ids are filtered out.
    expect(QuestSystem.fromJSON({ claimed: ['not_a_quest', 'raise_a_farm'] }).claimed).toEqual(['raise_a_farm']);
  });
});

describe('QuestSystem integration - full progression snapshot', () => {
  it('drives the chain to completable and claims resources + shards exactly once', () => {
    const q = new QuestSystem();

    // A snapshot satisfying: farm built, TC L3, 10 troops trained, 5 battles
    // won, and 1 tech unlocked.
    const progress = emptyProgress({
      buildingLevels: { lumber_mill: 1, farm: 2, research: 1 },
      townCenterLevel: 3,
      troopsTrained: 30,
      battlesWon: 5,
      techsUnlocked: 1,
      unlockedTechIds: ['crop_rotation'],
    });

    // Walk the chain: each claim unlocks the next, and all conditions are met
    // except hold_the_line (needs 3 techs) so it stays active at the end.
    const applied: { resources: number; shards: number } = { resources: 0, shards: 0 };
    const walk = ['secure_the_timber', 'raise_a_farm', 'grow_the_center', 'first_recruits', 'found_the_hall', 'first_research'] as const;
    for (const id of walk) {
      q.refresh(progress);
      expect(q.canClaim(id)).toBe(true);
      const reward = q.claim(id);
      expect(reward).not.toBeNull();
      if (reward?.resources) applied.resources += 1;
      if (reward?.shards) applied.shards += 1;
    }

    q.refresh(progress);
    // muster_an_army (30 troops) is now unlocked + completable.
    expect(q.status('muster_an_army')).toBe('completable');
    // A claimed quest never pays again.
    expect(q.claim('raise_a_farm')).toBeNull();

    // Every walked quest paid resources; two of them (first_recruits,
    // first_research) also paid shards.
    expect(applied.resources).toBe(walk.length);
    expect(applied.shards).toBe(2);
  });

  it('QUEST_ORDER and QUEST_DEFS agree; every requires points backward', () => {
    expect(QUEST_ORDER.length).toBe(Object.keys(QUEST_DEFS).length);
    QUEST_ORDER.forEach((id, i) => {
      const req = QUEST_DEFS[id].requires;
      if (req) {
        // A predecessor must appear earlier in the chain.
        expect(QUEST_ORDER.indexOf(req)).toBeLessThan(i);
      } else {
        // Only the first quest has no predecessor.
        expect(i).toBe(0);
      }
    });
  });
});
