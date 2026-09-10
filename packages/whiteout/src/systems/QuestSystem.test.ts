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
    q.record('battleCompleted', 1, 0);
    q.record('waveCleared', 1, 0);
    expect(q.dailyProgress('daily_battle')).toBe(1);
    expect(q.milestoneProgress('growth_first_wave')).toBe(1);
    expect(q.milestoneProgress('growth_champion')).toBe(1);
  });

  it('resets the daily set on a day boundary but keeps milestones', () => {
    const q = new QuestSystem();
    q.record('battleCompleted', 3, 0);
    q.record('waveCleared', 3, 0); // day 0
    expect(q.dailyProgress('daily_battle')).toBe(3);
    expect(q.milestoneProgress('growth_first_wave')).toBe(3);

    // Cross into the next day via the injected clock: dailies reset, milestones
    // persist.
    q.sync(DAY);
    expect(q.dailyProgress('daily_battle')).toBe(0);
    expect(q.milestoneProgress('growth_first_wave')).toBe(3);
  });

  it('auto-claims a completed daily reward once per day, then resets next day', () => {
    const q = new QuestSystem();
    const target = dailyQuest('daily_battle')!.target;
    const rewards = q.record('battleCompleted', target, 0);
    expect(q.isDailyComplete('daily_battle')).toBe(true);
    expect(q.isDailyClaimed('daily_battle')).toBe(true);
    expect(rewards).toContainEqual(dailyQuest('daily_battle')!.reward);
    expect(q.claimDaily('daily_battle', 0).reason).toBe('already_claimed');

    const nextRewards = q.record('battleCompleted', target, DAY);
    expect(q.isDailyClaimed('daily_battle')).toBe(true);
    expect(nextRewards).toContainEqual(dailyQuest('daily_battle')!.reward);
  });

  it('rejects claiming an incomplete quest', () => {
    const q = new QuestSystem();
    q.record('battleCompleted', 1, 0); // below target
    expect(q.claimDaily('daily_battle', 0).reason).toBe('incomplete');
  });

  it('grants a one-time growth milestone reward exactly once, ever', () => {
    const q = new QuestSystem();
    const target = growthQuest('growth_first_wave')!.target;
    const rewards = q.record('waveCleared', target, 0);
    expect(rewards).toContainEqual(growthQuest('growth_first_wave')!.reward);
    expect(q.claimMilestone('growth_first_wave', 0).reason).toBe('already_claimed');
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

  // --- events framework ARMING (review v2) ----------------------------------

  it('dailySync arms the day event on a fresh board and applies the bonus', () => {
    const q = new QuestSystem();
    // A fresh board has NO event until the daily driver runs (mirrors the old
    // behaviour for plain sync()).
    expect(q.eventActive(0)).toBe(false);
    expect(q.productionBonus(0)).toBe(1);

    // The live-ops driver arms today's event and returns true (a new day armed).
    expect(q.dailySync(0)).toBe(true);
    expect(q.eventActive(0)).toBe(true);
    expect(q.productionBonus(0)).toBeGreaterThan(1);
  });

  it('dailySync arms once per day (idempotent within a day) and re-arms next day', () => {
    const q = new QuestSystem();
    expect(q.dailySync(0)).toBe(true);
    const firstEvent = q.activeEvent(0);
    // Same day again: no new arming.
    expect(q.dailySync(1000)).toBe(false);
    expect(q.activeEvent(1000)).toBe(firstEvent);

    // Next day: a new event is armed (deterministic rotation).
    expect(q.dailySync(DAY)).toBe(true);
    expect(q.eventActive(DAY)).toBe(true);
    expect(q.activeEvent(DAY)).toBe(QuestSystem.eventForDay(1).id);
  });

  it('the armed-day marker survives a save so a reload does not re-arm', () => {
    const q = new QuestSystem();
    q.dailySync(0);
    const restored = QuestSystem.fromJSON(JSON.parse(JSON.stringify(q.toJSON())));
    // Same day after reload: the persisted marker suppresses a re-arm.
    expect(restored.dailySync(1000)).toBe(false);
  });

  it('eventForDay rotates deterministically through the configured events', () => {
    const a = QuestSystem.eventForDay(0).id;
    const b = QuestSystem.eventForDay(1).id;
    // With 2 configured events the rotation wraps every 2 days.
    expect(QuestSystem.eventForDay(2).id).toBe(a);
    expect(QuestSystem.eventForDay(3).id).toBe(b);
  });
});
