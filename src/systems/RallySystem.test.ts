import { describe, it, expect } from 'vitest';
import { RallySystem } from './RallySystem';
import { RALLY } from '../config/GameConfig';
import { rallyBoss } from '../config/RallyConfig';

/**
 * Unit tests for the world-boss rally resolver: HP depletion across repeated
 * attempts, the deterministic simulated-alliance damage share, reward tiers
 * granted exactly once, kills, and serialize round-trip.
 */
describe('RallySystem', () => {
  const bossId = 'rime_alpha';
  const pool = () => rallyBoss(bossId)!.hpPool;

  it('adds a deterministic simulated-alliance share on top of player damage', () => {
    const r = new RallySystem();
    const res = r.attack(bossId, 1000);
    expect(res.playerDamage).toBe(1000);
    expect(res.allianceDamage).toBeCloseTo(1000 * RALLY.ALLIANCE_DAMAGE_SHARE, 6);
    expect(res.dealt).toBeCloseTo(1000 * (1 + RALLY.ALLIANCE_DAMAGE_SHARE), 6);
    // Deterministic: a fresh system with the same input reproduces it exactly.
    const res2 = new RallySystem().attack(bossId, 1000);
    expect(res2.dealt).toBe(res.dealt);
  });

  it('depletes the HP pool cumulatively across repeated attempts', () => {
    const r = new RallySystem();
    const perAttempt = 500; // player damage each attempt
    const dealtEach = perAttempt * (1 + RALLY.ALLIANCE_DAMAGE_SHARE);
    r.attack(bossId, perAttempt);
    expect(r.damageDealt(bossId)).toBeCloseTo(dealtEach, 6);
    r.attack(bossId, perAttempt);
    expect(r.damageDealt(bossId)).toBeCloseTo(dealtEach * 2, 6);
    expect(r.attempts(bossId)).toBe(2);
    expect(r.remaining(bossId)).toBeCloseTo(pool() - dealtEach * 2, 3);
  });

  it('caps damage at the remaining pool and marks a kill', () => {
    const r = new RallySystem();
    const res = r.attack(bossId, pool() * 10); // way more than the pool
    expect(res.dealt).toBeCloseTo(pool(), 3); // capped at remaining
    expect(res.remaining).toBe(0);
    expect(res.defeated).toBe(true);
    expect(r.isDefeated(bossId)).toBe(true);
    expect(r.progress(bossId)).toBe(1);
  });

  it('grants each reward tier exactly once as thresholds are crossed', () => {
    const r = new RallySystem();
    // First attempt: enough to cross the 25% and 50% thresholds at once.
    const half = pool() * 0.5;
    const playerFor = (dmg: number) => dmg / (1 + RALLY.ALLIANCE_DAMAGE_SHARE);
    const first = r.attack(bossId, playerFor(half));
    // Thresholds are [0.25, 0.5, 0.75, 1.0]; reaching 0.5 unlocks tiers 0 and 1.
    expect(first.rewards.length).toBe(2);

    // A tiny extra attempt that does NOT cross the next threshold grants nothing.
    const nudge = r.attack(bossId, 1);
    expect(nudge.rewards.length).toBe(0);

    // Finish the boss: crosses 0.75 and 1.0 -> the remaining two tiers, once.
    const kill = r.attack(bossId, playerFor(pool()));
    expect(kill.defeated).toBe(true);
    expect(kill.rewards.length).toBe(2);

    // Re-attacking a dead boss grants no further rewards.
    const after = r.attack(bossId, playerFor(pool()));
    expect(after.rewards.length).toBe(0);
    expect(after.dealt).toBe(0);
  });

  it('rejects an unknown boss id', () => {
    const r = new RallySystem();
    const res = r.attack('not_a_boss', 100);
    expect(res.reason).toBe('unknown_boss');
    expect(res.dealt).toBe(0);
  });

  it('resetBoss starts a fresh cycle', () => {
    const r = new RallySystem();
    r.attack(bossId, pool() * 10);
    expect(r.isDefeated(bossId)).toBe(true);
    r.resetBoss(bossId);
    expect(r.isDefeated(bossId)).toBe(false);
    expect(r.damageDealt(bossId)).toBe(0);
    expect(r.attempts(bossId)).toBe(0);
  });

  it('serializes and restores per-boss progress', () => {
    const r = new RallySystem();
    r.attack(bossId, 700);
    r.attack('glacier_behemoth', 300);
    const restored = RallySystem.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
    expect(restored.damageDealt(bossId)).toBeCloseTo(r.damageDealt(bossId), 6);
    expect(restored.attempts(bossId)).toBe(1);
    expect(restored.damageDealt('glacier_behemoth')).toBeCloseTo(
      r.damageDealt('glacier_behemoth'),
      6,
    );
  });

  it('a missing/malformed save yields fresh rallies', () => {
    expect(RallySystem.fromJSON(undefined).attempts(bossId)).toBe(0);
    expect(RallySystem.fromJSON(null).damageDealt(bossId)).toBe(0);
  });
});
