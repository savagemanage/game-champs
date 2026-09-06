import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL,
  xpForLevel,
  xpToNextLevel,
  createProgress,
  STARTING_GOLD,
  addXp,
  addGold,
  passiveGold,
  PASSIVE_GOLD_PER_SECOND,
  minionBounty,
  MINION_BOUNTY,
  CHAMPION_TAKEDOWN_BOUNTY,
  jungleCampBounty,
  JUNGLE_CAMP_BOUNTY,
  epicMonsterBounty,
  EPIC_MONSTER_BOUNTY,
  statsForLevel,
  type ProgressState,
  type MinionType,
  type JungleCampKind,
  type EpicMonster,
} from './economy';

describe('xp curve', () => {
  it('xpForLevel is strictly monotonic increasing up to the cap', () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('level 1 requires 0 total xp', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('xpToNextLevel is positive below cap and 0 at/above cap', () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpToNextLevel(l)).toBeGreaterThan(0);
    }
    expect(xpToNextLevel(MAX_LEVEL)).toBe(0);
    expect(xpToNextLevel(MAX_LEVEL + 5)).toBe(0);
  });

  it('xpToNextLevel is itself increasing (later levels cost more)', () => {
    for (let l = 1; l < MAX_LEVEL - 1; l++) {
      expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    }
  });
});

describe('addXp leveling', () => {
  it('promotes a single level when the threshold is met', () => {
    const state: ProgressState = createProgress();
    const res = addXp(state, xpToNextLevel(1));
    expect(res.leveled).toBe(true);
    expect(res.newLevel).toBe(2);
    expect(state.level).toBe(2);
  });

  it('promotes across multiple level thresholds at once', () => {
    const state: ProgressState = createProgress();
    const bulk = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3);
    const res = addXp(state, bulk);
    expect(res.newLevel).toBe(4);
    expect(state.level).toBe(4);
    expect(state.xp).toBe(0);
  });

  it('caps at MAX_LEVEL no matter how much xp is granted', () => {
    const state: ProgressState = createProgress();
    const res = addXp(state, 10_000_000);
    expect(res.newLevel).toBe(MAX_LEVEL);
    expect(state.level).toBe(MAX_LEVEL);
    expect(state.xp).toBe(0);
  });

  it('does not level when below the threshold', () => {
    const state: ProgressState = createProgress();
    const res = addXp(state, xpToNextLevel(1) - 1);
    expect(res.leveled).toBe(false);
    expect(state.level).toBe(1);
    expect(state.xp).toBe(xpToNextLevel(1) - 1);
  });

  it('ignores non-positive xp', () => {
    const state: ProgressState = createProgress();
    addXp(state, -50);
    expect(state.xp).toBe(0);
    expect(state.level).toBe(1);
  });
});

describe('gold', () => {
  it('createProgress starts with STARTING_GOLD at level 1', () => {
    const state = createProgress();
    expect(state.gold).toBe(STARTING_GOLD);
    expect(state.level).toBe(1);
    expect(STARTING_GOLD).toBeGreaterThan(0);
  });

  it('addGold accumulates', () => {
    const state = createProgress(0);
    addGold(state, 100);
    addGold(state, 50);
    expect(state.gold).toBe(150);
  });

  it('addGold ignores non-positive amounts', () => {
    const state = createProgress(0);
    addGold(state, -20);
    expect(state.gold).toBe(0);
  });

  it('passive gold accrues at the documented rate', () => {
    expect(PASSIVE_GOLD_PER_SECOND).toBeGreaterThan(0);
    expect(passiveGold(10)).toBeCloseTo(PASSIVE_GOLD_PER_SECOND * 10);
    expect(passiveGold(0)).toBe(0);
    expect(passiveGold(-5)).toBe(0);
  });
});

describe('bounty tables', () => {
  const minionTypes: MinionType[] = ['melee', 'caster', 'siege', 'super'];

  it('every minion bounty grants both gold and xp', () => {
    for (const t of minionTypes) {
      const b = minionBounty(t);
      expect(b.gold).toBeGreaterThan(0);
      expect(b.xp).toBeGreaterThan(0);
    }
  });

  it('minion bounties have distinct gold values per type', () => {
    const golds = minionTypes.map((t) => MINION_BOUNTY[t].gold);
    expect(new Set(golds).size).toBe(minionTypes.length);
  });

  it('champion takedown bounty is positive gold and xp', () => {
    expect(CHAMPION_TAKEDOWN_BOUNTY.gold).toBeGreaterThan(0);
    expect(CHAMPION_TAKEDOWN_BOUNTY.xp).toBeGreaterThan(0);
  });

  it('every jungle camp bounty is positive', () => {
    const kinds = Object.keys(JUNGLE_CAMP_BOUNTY) as JungleCampKind[];
    for (const k of kinds) {
      const b = jungleCampBounty(k);
      expect(b.gold).toBeGreaterThan(0);
      expect(b.xp).toBeGreaterThan(0);
    }
  });

  it('every epic monster bounty is positive; baron gives the most xp', () => {
    const monsters = Object.keys(EPIC_MONSTER_BOUNTY) as EpicMonster[];
    for (const m of monsters) {
      const b = epicMonsterBounty(m);
      expect(b.gold).toBeGreaterThan(0);
      expect(b.xp).toBeGreaterThan(0);
    }
    expect(EPIC_MONSTER_BOUNTY.baron.xp).toBeGreaterThan(EPIC_MONSTER_BOUNTY.dragon.xp);
  });
});

describe('statsForLevel', () => {
  it('equals base at level 1', () => {
    expect(statsForLevel(500, 90, 1)).toBe(500);
  });

  it('scales linearly with level', () => {
    expect(statsForLevel(500, 90, 2)).toBe(590);
    expect(statsForLevel(500, 90, 3)).toBe(680);
    // Linear: the increment between consecutive levels is constant.
    const d1 = statsForLevel(500, 90, 3) - statsForLevel(500, 90, 2);
    const d2 = statsForLevel(500, 90, 4) - statsForLevel(500, 90, 3);
    expect(d1).toBe(d2);
  });

  it('clamps level into the 1..MAX_LEVEL range', () => {
    expect(statsForLevel(100, 10, 0)).toBe(100);
    expect(statsForLevel(100, 10, MAX_LEVEL + 5)).toBe(statsForLevel(100, 10, MAX_LEVEL));
  });
});
