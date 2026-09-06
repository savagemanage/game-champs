import { describe, it, expect } from 'vitest';
import { CampaignSystem } from './CampaignSystem';
import {
  CAMPAIGN_STAGES,
  TOTAL_STAGES,
  stageByOrder,
  stageRequiredPower,
} from '../config/CampaignConfig';

/**
 * Unit tests for the staged campaign: sequential gating by highest cleared,
 * deterministic power validation, first-clear reward-once semantics, and the
 * serialize round-trip.
 */

/** The first stage's id and a power that comfortably clears it. */
const FIRST = CAMPAIGN_STAGES[0].id;
const AMPLE = 1_000_000;

describe('CampaignSystem', () => {
  it('only the first stage is unlocked on a fresh campaign', () => {
    const c = new CampaignSystem();
    expect(c.highestCleared).toBe(0);
    expect(c.isUnlocked(FIRST)).toBe(true);
    // The second stage is locked until the first is cleared.
    const second = stageByOrder(2)!;
    expect(c.isUnlocked(second.id)).toBe(false);
  });

  it('rejects a locked stage attempt', () => {
    const c = new CampaignSystem();
    const second = stageByOrder(2)!;
    const res = c.attempt(second.id, AMPLE);
    expect(res.win).toBe(false);
    expect(res.reason).toBe('locked');
  });

  it('rejects an unknown stage id', () => {
    const c = new CampaignSystem();
    const res = c.attempt('does_not_exist', AMPLE);
    expect(res.win).toBe(false);
    expect(res.reason).toBe('unknown_stage');
  });

  it('fails an under-powered attempt deterministically', () => {
    const c = new CampaignSystem();
    const required = stageRequiredPower(FIRST);
    // Just under the requirement -> loss, no progress.
    const res = c.attempt(FIRST, required - 0.01);
    expect(res.win).toBe(false);
    expect(res.reason).toBe('insufficient_power');
    expect(c.highestCleared).toBe(0);
    // Deterministic: same inputs, same outcome.
    const res2 = c.attempt(FIRST, required - 0.01);
    expect(res2).toEqual(res);
  });

  it('clears at exactly the required power and unlocks the next stage', () => {
    const c = new CampaignSystem();
    const required = stageRequiredPower(FIRST);
    const res = c.attempt(FIRST, required); // margin is 1.0, so equal clears
    expect(res.win).toBe(true);
    expect(res.firstClear).toBe(true);
    expect(c.highestCleared).toBe(1);
    expect(c.isCleared(FIRST)).toBe(true);
    const second = stageByOrder(2)!;
    expect(c.isUnlocked(second.id)).toBe(true);
  });

  it('grants the first-clear reward exactly once', () => {
    const c = new CampaignSystem();
    const first = c.attempt(FIRST, AMPLE);
    expect(first.firstClear).toBe(true);
    expect(first.reward).toBeDefined();
    expect(first.reward).toEqual(CAMPAIGN_STAGES[0].reward);
    // Replaying the cleared stage re-validates but grants nothing.
    const replay = c.attempt(FIRST, AMPLE);
    expect(replay.win).toBe(true);
    expect(replay.firstClear).toBe(false);
    expect(replay.reward).toBeUndefined();
    expect(c.isClaimed(FIRST)).toBe(true);
  });

  it('progresses sequentially through the whole campaign', () => {
    const c = new CampaignSystem();
    for (const stage of CAMPAIGN_STAGES) {
      expect(c.isUnlocked(stage.id)).toBe(true);
      const res = c.attempt(stage.id, AMPLE);
      expect(res.win).toBe(true);
      expect(res.firstClear).toBe(true);
    }
    expect(c.highestCleared).toBe(TOTAL_STAGES);
    expect(c.complete).toBe(true);
    expect(c.nextStage()).toBeUndefined();
  });

  it('required power matches the shared enemy-power model', () => {
    // Sanity: the required power is strictly positive and grows across stages
    // (later stages have heavier compositions).
    const p1 = stageRequiredPower(CAMPAIGN_STAGES[0].id);
    const pLast = stageRequiredPower(CAMPAIGN_STAGES[TOTAL_STAGES - 1].id);
    expect(p1).toBeGreaterThan(0);
    expect(pLast).toBeGreaterThan(p1);
  });

  it('serializes and restores progress + claimed set', () => {
    const c = new CampaignSystem();
    c.attempt(FIRST, AMPLE);
    c.attempt(stageByOrder(2)!.id, AMPLE);
    const restored = CampaignSystem.fromJSON(c.toJSON());
    expect(restored.highestCleared).toBe(2);
    expect(restored.claimed.sort()).toEqual(c.claimed.sort());
    // The claimed stages do not re-grant after a reload.
    const replay = restored.attempt(FIRST, AMPLE);
    expect(replay.firstClear).toBe(false);
  });

  it('fromJSON tolerates missing/garbage data (fresh progress)', () => {
    expect(CampaignSystem.fromJSON(undefined).highestCleared).toBe(0);
    expect(CampaignSystem.fromJSON(null).claimed).toEqual([]);
  });
});
