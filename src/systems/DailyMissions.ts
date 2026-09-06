/**
 * DailyMissions.ts - daily "arms race" tasks + weekly "alliance duel"
 * (FEAT-004).
 *
 * Phaser-free and deterministic. The DAILY layer generates a rotating,
 * deterministic-per-day set of arms-race tasks from {@link MISSIONS.DAILY_TEMPLATES}
 * (categories: build / recruit / power-up / combat / mini-game); game events
 * advance task progress; completing a task awards arms-race POINTS plus a reward
 * bundle; crossing a score MILESTONE awards a bonus chest once per day; and a
 * new day resets the daily block. The WEEKLY layer aggregates the player's
 * activity score across the week and, on week rollover, scores it against a
 * seeded AI alliance's score to grant placement (win/loss) rewards.
 *
 * TIME IS A PARAMETER: this pure layer never reads the clock. The day and week
 * indices are derived from a `now` epoch-ms timestamp passed in; the GameStore
 * wrapper supplies the real time. {@link dayIndex} / {@link weekIndex} are the
 * canonical derivations so tests and runtime agree.
 */

import {
  DAILY_TASK_CATEGORIES,
  MISSIONS,
  type DailyTaskTemplate,
  type RewardBundle,
} from '../config/Progression';
import type { DailyTaskCategory, MissionState } from '../types';
import { makeRng } from './Rng';
import { mergeRewards } from './Season';

/** Milliseconds in a day (UTC day boundaries; deterministic and clock-free). */
const DAY_MS = 86_400_000;

/** The integer day index a timestamp falls in (UTC days since the epoch). */
export function dayIndex(now: number): number {
  return Math.floor(now / DAY_MS);
}

/** The integer week index a timestamp falls in (7-day blocks since the epoch). */
export function weekIndex(now: number): number {
  return Math.floor(dayIndex(now) / 7);
}

/** A fresh, uninitialized mission state (no day/week claimed yet). */
export function freshMissions(): MissionState {
  return {
    dayKey: -1,
    weekKey: -1,
    daily: {},
    claimedTasks: [],
    armsScore: 0,
    claimedMilestones: [],
    weekActivity: 0,
    weekly: {},
  };
}

/**
 * The deterministic set of daily arms-race task templates for a given day. The
 * day index seeds an RNG that shuffles the template pool; the first
 * {@link MISSIONS.DAILY_TASK_COUNT} are that day's tasks. Same day => same set,
 * so the runtime and tests agree without persisting the chosen ids.
 */
export function dailyTasksFor(day: number): DailyTaskTemplate[] {
  const rng = makeRng((day >>> 0) ^ 0x9e3779b9);
  const pool = [...MISSIONS.DAILY_TEMPLATES];
  // Fisher-Yates shuffle driven by the seeded RNG (deterministic per day).
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MISSIONS.DAILY_TASK_COUNT);
}

/**
 * Ensure the mission state's daily/weekly blocks belong to `now`. When the day
 * rolled over, the daily task progress, arms score, and claimed lists reset;
 * when the week rolled over the weekly activity resets. Returns a NEW state
 * (pure). Rollover does NOT itself grant the alliance-duel reward - that is
 * settled by {@link settleAllianceDuel} which needs the seed + reward sink.
 */
export function rollover(state: MissionState, now: number): MissionState {
  const day = dayIndex(now);
  const week = weekIndex(now);
  let next = state;
  if (state.dayKey !== day) {
    next = {
      ...next,
      dayKey: day,
      daily: {},
      claimedTasks: [],
      armsScore: 0,
      claimedMilestones: [],
    };
  }
  if (state.weekKey !== week) {
    next = { ...next, weekKey: week, weekActivity: 0 };
  }
  return next;
}

/** The result of recording task progress: new state + any reward earned. */
export interface ProgressResult {
  /** The advanced mission state. */
  state: MissionState;
  /** Reward earned from completing tasks / crossing milestones this event. */
  reward: RewardBundle;
  /** Ids of tasks completed by this event. */
  completed: string[];
}

/** Whether a value is one of the valid daily task categories. */
export function isDailyCategory(value: string): value is DailyTaskCategory {
  return (DAILY_TASK_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Record `amount` units of progress in a task `category` at time `now`. Rolls
 * the day/week over first, advances every active task of that category toward
 * its target, awards completion points + rewards for tasks that cross their
 * target for the first time this day, and awards milestone chests as the
 * accumulated arms-race score passes each threshold. Also accrues the same
 * points into the weekly alliance-duel activity score. Pure.
 */
export function recordProgress(
  state: MissionState,
  category: DailyTaskCategory,
  amount: number,
  now: number,
): ProgressResult {
  const rolled = rollover(state, now);
  const units = Math.max(0, Math.floor(amount));
  if (units === 0) return { state: rolled, reward: {}, completed: [] };

  const tasks = dailyTasksFor(rolled.dayKey);
  const daily = { ...rolled.daily };
  const claimedTasks = [...rolled.claimedTasks];
  const claimedMilestones = [...rolled.claimedMilestones];
  let armsScore = rolled.armsScore;
  let weekActivity = rolled.weekActivity;
  let reward: RewardBundle = {};
  const completed: string[] = [];

  for (const task of tasks) {
    if (task.category !== category) continue;
    const before = daily[task.id] ?? 0;
    const after = Math.min(task.target, before + units);
    daily[task.id] = after;
    // First time this task crosses its target this day -> award once.
    if (before < task.target && after >= task.target && !claimedTasks.includes(task.id)) {
      claimedTasks.push(task.id);
      armsScore += task.points;
      weekActivity += task.points;
      reward = mergeRewards(reward, task.reward);
      completed.push(task.id);
    }
  }

  // Milestone chests: any threshold newly crossed by the updated arms score.
  for (const milestone of MISSIONS.DAILY_MILESTONES) {
    if (armsScore >= milestone.points && !claimedMilestones.includes(milestone.points)) {
      claimedMilestones.push(milestone.points);
      reward = mergeRewards(reward, milestone.reward);
    }
  }

  return {
    state: {
      ...rolled,
      daily,
      claimedTasks,
      claimedMilestones,
      armsScore,
      weekActivity,
    },
    reward,
    completed,
  };
}

/** The AI alliance's deterministic weekly score for a given week. */
export function allianceAiScore(week: number): number {
  const rng = makeRng((week >>> 0) ^ 0x85ebca6b);
  const [lo, hi] = MISSIONS.ALLIANCE_DUEL.AI_SCORE_RANGE;
  return Math.round(rng.range(lo, hi));
}

/** The result of settling the weekly alliance duel. */
export interface DuelResult {
  /** True when the player's weekly activity beat the AI alliance's score. */
  win: boolean;
  /** The player's weekly activity score that was compared. */
  playerScore: number;
  /** The AI alliance's seeded score. */
  aiScore: number;
  /** Placement reward (win or loss bundle). */
  reward: RewardBundle;
}

/**
 * Score the JUST-ENDED week (the week identified by `state.weekKey`) against
 * the seeded AI alliance and produce the placement reward. This is called by
 * the runtime at week rollover, BEFORE {@link rollover} resets `weekActivity`,
 * so it reads the completed week's accumulated activity. Deterministic: the AI
 * score depends only on the week index.
 */
export function settleAllianceDuel(state: MissionState): DuelResult {
  const aiScore = allianceAiScore(state.weekKey < 0 ? 0 : state.weekKey);
  const playerScore = state.weekActivity;
  const win = playerScore >= aiScore;
  return {
    win,
    playerScore,
    aiScore,
    reward: win ? MISSIONS.ALLIANCE_DUEL.WIN_REWARD : MISSIONS.ALLIANCE_DUEL.LOSS_REWARD,
  };
}
