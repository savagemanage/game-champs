import { describe, it, expect } from 'vitest';
import {
  allianceAiScore,
  dailyTasksFor,
  dayIndex,
  freshMissions,
  recordProgress,
  rollover,
  settleAllianceDuel,
  weekIndex,
} from './DailyMissions';
import { MISSIONS } from '../config/Progression';

const DAY = 86_400_000;

/**
 * DailyMissions tests: the daily task set is deterministic per day, progress
 * awards points at thresholds, day/week rollover resets the right blocks, and
 * the weekly alliance duel scores the week's activity against a seeded AI. These
 * fail if the per-day determinism, threshold awards, rollover, or duel scoring
 * were reverted.
 */
describe('DailyMissions', () => {
  it('derives day and week indices from a timestamp (clock-free)', () => {
    expect(dayIndex(0)).toBe(0);
    expect(dayIndex(DAY * 3 + 5)).toBe(3);
    expect(weekIndex(DAY * 3)).toBe(0);
    expect(weekIndex(DAY * 4)).toBe(1);
  });

  it('daily task set is deterministic per day and sized to config', () => {
    const dayA1 = dailyTasksFor(10);
    const dayA2 = dailyTasksFor(10);
    const dayB = dailyTasksFor(11);
    expect(dayA1).toHaveLength(MISSIONS.DAILY_TASK_COUNT);
    expect(dayA1.map((t) => t.id)).toEqual(dayA2.map((t) => t.id));
    // Different days generally rotate to a different ordering/subset.
    const differs = JSON.stringify(dayA1.map((t) => t.id)) !== JSON.stringify(dayB.map((t) => t.id));
    expect(differs).toBe(true);
    // All chosen templates are from the pool.
    const poolIds = new Set<string>(MISSIONS.DAILY_TEMPLATES.map((t) => t.id));
    expect(dayA1.every((t) => poolIds.has(t.id))).toBe(true);
  });

  /** Find a category present in the day's task set for deterministic testing. */
  function pickTaskFor(day: number) {
    const tasks = dailyTasksFor(day);
    return tasks[0];
  }

  it('records progress and awards points + reward when a task completes', () => {
    const now = DAY * 100 + 1000; // deterministic day 100
    const day = dayIndex(now);
    const task = pickTaskFor(day);
    let state = rollover(freshMissions(), now);

    // Progress the task to just below its target -> no completion yet.
    const partial = recordProgress(state, task.category, task.target - 1 > 0 ? task.target - 1 : 0, now);
    state = partial.state;
    if (task.target > 1) {
      expect(partial.completed).not.toContain(task.id);
      expect(state.armsScore).toBe(0);
    }
    // Finish it -> completion awards the task's points + reward once.
    const done = recordProgress(state, task.category, task.target, now);
    state = done.state;
    expect(done.completed).toContain(task.id);
    expect(state.armsScore).toBeGreaterThanOrEqual(task.points);
    // Repeating does not re-award the same task.
    const again = recordProgress(state, task.category, task.target, now);
    expect(again.completed).not.toContain(task.id);
    expect(again.state.armsScore).toBe(state.armsScore);
  });

  it('awards milestone chests as the arms-race score crosses thresholds', () => {
    const now = DAY * 200;
    let state = rollover(freshMissions(), now);
    // Drive every category hard so multiple tasks complete and the score climbs.
    for (const category of ['build', 'recruit', 'power_up', 'combat', 'mini_game'] as const) {
      const res = recordProgress(state, category, 100, now);
      state = res.state;
    }
    const firstMilestone = MISSIONS.DAILY_MILESTONES[0].points;
    if (state.armsScore >= firstMilestone) {
      expect(state.claimedMilestones).toContain(firstMilestone);
    }
    // Milestones are recorded at most once.
    expect(new Set(state.claimedMilestones).size).toBe(state.claimedMilestones.length);
  });

  it('day rollover resets the daily block but keeps the weekly activity within a week', () => {
    const day1 = DAY * 301; // week 43 (301/7)
    let state = rollover(freshMissions(), day1);
    const res = recordProgress(state, dailyTasksFor(dayIndex(day1))[0].category, 999, day1);
    state = res.state;
    expect(state.armsScore).toBeGreaterThan(0);
    const weekActivity = state.weekActivity;

    // Next day, SAME week (302/7 == 301/7 == 43). Daily resets, week persists.
    const day2 = DAY * 302;
    expect(weekIndex(day2)).toBe(weekIndex(day1));
    const rolled = rollover(state, day2);
    expect(rolled.armsScore).toBe(0);
    expect(rolled.daily).toEqual({});
    expect(rolled.claimedTasks).toEqual([]);
    expect(rolled.weekActivity).toBe(weekActivity); // weekly survives a day rollover
  });

  it('week rollover resets the weekly activity', () => {
    const weekA = DAY * 0; // week 0
    let state = rollover(freshMissions(), weekA);
    state = recordProgress(state, dailyTasksFor(0)[0].category, 999, weekA).state;
    expect(state.weekActivity).toBeGreaterThan(0);
    // Jump a full week ahead.
    const weekB = DAY * 7;
    expect(weekIndex(weekB)).toBe(1);
    const rolled = rollover(state, weekB);
    expect(rolled.weekActivity).toBe(0);
    expect(rolled.weekKey).toBe(1);
  });

  it('weekly alliance duel scores the week vs a seeded AI (deterministic)', () => {
    // The AI score is fixed per week index.
    expect(allianceAiScore(5)).toBe(allianceAiScore(5));
    const [lo, hi] = MISSIONS.ALLIANCE_DUEL.AI_SCORE_RANGE;
    expect(allianceAiScore(5)).toBeGreaterThanOrEqual(lo);
    expect(allianceAiScore(5)).toBeLessThanOrEqual(hi);

    // A crushing weekly activity beats the AI and yields the win reward.
    const winState = { ...freshMissions(), weekKey: 5, weekActivity: hi + 1000 };
    const win = settleAllianceDuel(winState);
    expect(win.win).toBe(true);
    expect(win.reward).toEqual(MISSIONS.ALLIANCE_DUEL.WIN_REWARD);

    // Zero activity loses and yields the loss reward.
    const lossState = { ...freshMissions(), weekKey: 5, weekActivity: 0 };
    const loss = settleAllianceDuel(lossState);
    expect(loss.win).toBe(false);
    expect(loss.reward).toEqual(MISSIONS.ALLIANCE_DUEL.LOSS_REWARD);
    expect(loss.aiScore).toBe(allianceAiScore(5));
  });
});
