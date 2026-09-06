import { describe, it, expect } from 'vitest';
import { QuestSystem } from './QuestSystem';
import { QUESTS } from '../config/GameConfig';
import { dailyQuest, growthQuest } from '../config/QuestConfig';

/**
 * Unit tests for the quest board: metric-driven progress, daily reset on a day
 * boundary from an injected clock, one-time growth-milestone reward-once, the
 * time-boxed event window, and serialize round-trip.
 */
describe('QuestSystem', () => {
  const DAY = QUESTS.DAY_MS;

  it('records progress on matching daily + growth quests', () => {
    const q = new QuestSystem();
    // 'daily_battle' + 'growth_first_wave' + 'growth_champion' all watch waveCleared.
    q.record('waveCleared', 1, 0);
    expect(q.dailyProgress('daily_battle')).toBe(1);
    expect(q.milestoneProgress('growth_first_wave')).toBe(1);
    expect(q.milestoneProgress('growth_champion')).toBe(1);
  });

  it('resets the daily set on a day boundary but keeps milestones', () => {
    const q = new QuestSystem();
    q.record('waveCleared', 3, 0); // day 0
    expect(q.dailyProgress('daily_battle')).toBe(3);
    expect(q.milestoneProgress('growth_first_wave')).toBe(3);

    // Cross into the next day via the injected clock: dailies reset, milestones
    // persist.
    q.sync(DAY);
    expect(q.dailyProgress('daily_battle')).toBe(0);
    expect(q.milestoneProgress('growth_first_wave')).toBe(3);
  });

  it('claims a completed daily reward once per day, then resets next day', () => {
    const q = new QuestSystem();
    const target = dailyQuest('daily_battle')!.target;
    q.record('waveCleared', target, 0);
    expect(q.isDailyComplete('daily_battle')).toBe(true);

    const first = q.claimDaily('daily_battle', 0);
    expect(first.ok).toBe(true);
    expect(first.reward).toEqual(dailyQuest('daily_battle')!.reward);

    // Second claim same day fails (already claimed).
    expect(q.claimDaily('daily_battle', 0).reason).toBe('already_claimed');

    // Next day: it resets and can be earned + claimed again.
    q.record('waveCleared', target, DAY);
    expect(q.isDailyClaimed('daily_battle')).toBe(false);
    expect(q.claimDaily('daily_battle', DAY).ok).toBe(true);
  });

  it('rejects claiming an incomplete quest', () => {
    const q = new QuestSystem();
    q.record('waveCleared', 1, 0); // below target
    expect(q.claimDaily('daily_battle', 0).reason).toBe('incomplete');
  });

  it('grants a one-time growth milestone reward exactly once, ever', () => {
    const q = new QuestSystem();
    const target = growthQuest('growth_first_wave')!.target;
    q.record('waveCleared', target, 0);
    const first = q.claimMilestone('growth_first_wave', 0);
    expect(first.ok).toBe(true);
    // Never claimable again, even on a later day.
    expect(q.claimMilestone('growth_first_wave', DAY * 5).reason).toBe('already_claimed');
    // Progress on a claimed milestone is frozen (does not keep accruing).
    q.record('waveCleared', 100, DAY * 6);
    expect(q.milestoneProgress('growth_first_wave')).toBe(target);
  });

  it('runs a time-boxed event within its window only', () => {
    const q = new QuestSystem();
    expect(q.eventActive(0)).toBe(false);
    expect(q.productionBonus(0)).toBe(1);

    const ok = q.startEvent('ember_rush', 1000, 5000); // runs [1000, 6000)
    expect(ok).toBe(true);
    expect(q.eventActive(2000)).toBe(true);
    expect(q.productionBonus(2000)).toBeGreaterThan(1);

    // After the window it expires.
    expect(q.eventActive(6000)).toBe(false);
    expect(q.productionBonus(7000)).toBe(1);

    // Unknown event id is rejected.
    expect(q.startEvent('not_an_event', 0)).toBe(false);
  });

  it('serializes and restores dailies, milestones, and the active event', () => {
    const q = new QuestSystem();
    q.record('buildingUpgraded', 2, 0);
    q.record('waveCleared', 1, 0);
    q.startEvent('frostfall_hunt', 0, 10_000);
    const restored = QuestSystem.fromJSON(JSON.parse(JSON.stringify(q.toJSON())));
    expect(restored.dailyProgress('daily_upgrade')).toBe(2);
    expect(restored.milestoneProgress('growth_first_wave')).toBe(1);
    expect(restored.eventActive(5000)).toBe(true);
    expect(restored.productionBonus(5000)).toBe(q.productionBonus(5000));
  });

  it('a missing/malformed save yields a fresh quest board', () => {
    expect(QuestSystem.fromJSON(undefined).dailyProgress('daily_battle')).toBe(0);
    expect(QuestSystem.fromJSON(null).eventActive(0)).toBe(false);
  });
});
