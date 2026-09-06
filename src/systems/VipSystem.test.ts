import { describe, it, expect } from 'vitest';
import { VipSystem } from './VipSystem';
import { VIP } from '../config/GameConfig';
import { pointsForLevel, vipModifiers } from '../config/VipConfig';

/**
 * Unit tests for VIP progression: points -> level mapping across the geometric
 * threshold curve, per-level bonus, max clamp, and serialize round-trip.
 */
describe('VipSystem', () => {
  it('starts at level 0 with no bonus', () => {
    const v = new VipSystem();
    expect(v.points).toBe(0);
    expect(v.level).toBe(0);
    expect(v.modifiers().economyOutput).toBe(0);
    expect(v.modifiers().buildSpeed).toBe(0);
  });

  it('maps accumulated points to the correct level', () => {
    const v = new VipSystem();
    // Just below the level-1 threshold stays level 0.
    v.addPoints(pointsForLevel(1) - 1);
    expect(v.level).toBe(0);
    // Crossing it reaches level 1.
    v.addPoints(1);
    expect(v.level).toBe(1);
    // Reaching the level-3 threshold reaches level 3.
    v.addPoints(pointsForLevel(3) - v.points);
    expect(v.level).toBe(3);
  });

  it('grants a per-level permanent bonus', () => {
    const v = new VipSystem({ points: pointsForLevel(2) });
    expect(v.level).toBe(2);
    expect(v.modifiers()).toEqual(vipModifiers(2));
    // The bonus scales with the level.
    expect(v.modifiers().economyOutput).toBeCloseTo(VIP.BONUS_PER_LEVEL.economyOutput * 2, 9);
    expect(v.modifiers().buildSpeed).toBeCloseTo(VIP.BONUS_PER_LEVEL.buildSpeed * 2, 9);
  });

  it('clamps at the maximum level', () => {
    const v = new VipSystem({ points: pointsForLevel(VIP.MAX_LEVEL) * 100 });
    expect(v.level).toBe(VIP.MAX_LEVEL);
    expect(v.pointsToNextLevel()).toBe(0); // no level beyond the max
  });

  it('reports points remaining to the next level', () => {
    const v = new VipSystem();
    expect(v.pointsToNextLevel()).toBe(pointsForLevel(1));
    v.addPoints(pointsForLevel(1));
    expect(v.level).toBe(1);
    expect(v.pointsToNextLevel()).toBe(pointsForLevel(2) - v.points);
  });

  it('points are monotonic (never lowers the level)', () => {
    const v = new VipSystem({ points: pointsForLevel(4) });
    const before = v.level;
    v.addPoints(-1000); // ignored
    v.addPoints(0);
    expect(v.level).toBe(before);
    expect(v.points).toBe(pointsForLevel(4));
  });

  it('serializes and restores VIP points', () => {
    const v = new VipSystem();
    v.addPoints(pointsForLevel(3) + 5);
    const restored = VipSystem.fromJSON(JSON.parse(JSON.stringify(v.toJSON())));
    expect(restored.points).toBe(v.points);
    expect(restored.level).toBe(v.level);
  });

  it('a missing/malformed save yields a fresh VIP state', () => {
    expect(VipSystem.fromJSON(undefined).points).toBe(0);
    expect(VipSystem.fromJSON(null).level).toBe(0);
  });
});
