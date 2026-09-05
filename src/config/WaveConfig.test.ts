import { describe, it, expect } from 'vitest';
import { EnemyRole } from './GameConfig';
import {
  DIFFICULTY_TUNING,
  expandWave,
  scaledSpawnIntervalMs,
  scaledStartDelayMs,
  waveSize,
  type WaveDef,
} from './WaveConfig';

const SAMPLE: WaveDef = {
  wave: 1,
  groups: [
    { role: EnemyRole.Wanderer, count: 2 },
    { role: EnemyRole.Sprinter, count: 1 },
  ],
  spawnIntervalMs: 1000,
  startDelayMs: 3000,
};

describe('expandWave', () => {
  it('produces exactly the wave size, one entry per giant', () => {
    const order = expandWave(SAMPLE);
    expect(order).toHaveLength(waveSize(SAMPLE));
    const wanderers = order.filter((r) => r === EnemyRole.Wanderer).length;
    const sprinters = order.filter((r) => r === EnemyRole.Sprinter).length;
    expect(wanderers).toBe(2);
    expect(sprinters).toBe(1);
  });

  it('interleaves groups round-robin so composition arrives mixed', () => {
    // Round-robin: Wanderer, Sprinter, then the leftover Wanderer.
    expect(expandWave(SAMPLE)).toEqual([EnemyRole.Wanderer, EnemyRole.Sprinter, EnemyRole.Wanderer]);
  });

  it('appends difficulty filler as MORE baseline giants, not tougher ones', () => {
    const brutal = DIFFICULTY_TUNING.brutal;
    const order = expandWave(SAMPLE, brutal);
    expect(order).toHaveLength(waveSize(SAMPLE) + brutal.extraFillerPerWave);
    const fillerCount = order.filter((r) => r === brutal.fillerRole).length;
    // Original 2 Wanderers + the brutal filler Wanderers.
    expect(fillerCount).toBe(2 + brutal.extraFillerPerWave);
  });

  it('adds no filler on standard difficulty', () => {
    expect(expandWave(SAMPLE, DIFFICULTY_TUNING.standard)).toHaveLength(waveSize(SAMPLE));
  });
});

describe('difficulty pacing scaling', () => {
  it('brutal spawns faster and relaxed slower than standard', () => {
    const relaxed = scaledSpawnIntervalMs(SAMPLE, DIFFICULTY_TUNING.relaxed);
    const standard = scaledSpawnIntervalMs(SAMPLE, DIFFICULTY_TUNING.standard);
    const brutal = scaledSpawnIntervalMs(SAMPLE, DIFFICULTY_TUNING.brutal);
    expect(brutal).toBeLessThan(standard);
    expect(relaxed).toBeGreaterThan(standard);
    expect(standard).toBe(SAMPLE.spawnIntervalMs);
  });

  it('scales the inter-wave delay the same way and floors it', () => {
    expect(scaledStartDelayMs(SAMPLE, DIFFICULTY_TUNING.standard)).toBe(SAMPLE.startDelayMs);
    expect(scaledStartDelayMs(SAMPLE, DIFFICULTY_TUNING.brutal)).toBeLessThan(SAMPLE.startDelayMs);
    // Never below the 500ms floor even with a tiny base delay.
    expect(scaledStartDelayMs({ ...SAMPLE, startDelayMs: 100 }, DIFFICULTY_TUNING.brutal)).toBe(500);
  });
});
