import { describe, it, expect } from 'vitest';
import {
  FIRST_WAVE_DELAY,
  WAVE_INTERVAL_SECONDS,
  SIEGE_EVERY_N_WAVES,
  MELEE_PER_WAVE,
  CASTER_PER_WAVE,
  nextWaveNumberAt,
  waveSpawnTime,
  waveComposition,
  superMinionsFor,
  laneWaveComposition,
  MINION_STATS,
  minionStats,
  spawnMinion,
  advanceMinion,
  type MinionType,
} from './minions';
import { laneWaypoints, pathLength } from './map';

describe('wave scheduling', () => {
  it('spawns no wave before the first-wave delay', () => {
    expect(nextWaveNumberAt(0)).toBe(0);
    expect(nextWaveNumberAt(FIRST_WAVE_DELAY - 1)).toBe(0);
  });

  it('spawns wave 1 at the first-wave delay and advances by interval', () => {
    expect(nextWaveNumberAt(FIRST_WAVE_DELAY)).toBe(1);
    expect(nextWaveNumberAt(FIRST_WAVE_DELAY + WAVE_INTERVAL_SECONDS)).toBe(2);
    expect(nextWaveNumberAt(FIRST_WAVE_DELAY + WAVE_INTERVAL_SECONDS * 4)).toBe(5);
  });

  it('waveSpawnTime is the inverse of nextWaveNumberAt', () => {
    for (let n = 1; n <= 10; n++) {
      expect(nextWaveNumberAt(waveSpawnTime(n))).toBe(n);
    }
  });
});

describe('wave composition', () => {
  it('has the standard melee + caster count on non-siege waves', () => {
    const wave = waveComposition(1);
    expect(wave.filter((m) => m === 'melee').length).toBe(MELEE_PER_WAVE);
    expect(wave.filter((m) => m === 'caster').length).toBe(CASTER_PER_WAVE);
    expect(wave).not.toContain('siege');
    expect(wave.length).toBe(MELEE_PER_WAVE + CASTER_PER_WAVE);
  });

  it('adds a siege minion every Nth wave', () => {
    const siege = waveComposition(SIEGE_EVERY_N_WAVES);
    expect(siege.filter((m) => m === 'siege').length).toBe(1);
    expect(siege.length).toBe(MELEE_PER_WAVE + CASTER_PER_WAVE + 1);

    const noSiege = waveComposition(SIEGE_EVERY_N_WAVES + 1);
    expect(noSiege).not.toContain('siege');
  });
});

describe('super minions', () => {
  it('adds no super minions when no inhibitor is down', () => {
    expect(superMinionsFor(0)).toEqual([]);
    expect(laneWaveComposition(1, 0)).not.toContain('super');
  });

  it('adds super minions only when the matching inhibitor is down', () => {
    expect(superMinionsFor(1)).toEqual<MinionType[]>(['super']);
    expect(superMinionsFor(2)).toEqual<MinionType[]>(['super', 'super']);

    const lane = laneWaveComposition(1, 1);
    expect(lane.filter((m) => m === 'super').length).toBe(1);
    // Super minions lead the wave.
    expect(lane[0]).toBe('super');
  });
});

describe('minion stats', () => {
  it('exposes distinct rising stats per type with a bounty', () => {
    const types: MinionType[] = ['melee', 'caster', 'siege', 'super'];
    for (const t of types) {
      const s = minionStats(t);
      expect(s.hp).toBeGreaterThan(0);
      expect(s.bounty.gold).toBeGreaterThan(0);
      expect(s.bounty.xp).toBeGreaterThan(0);
    }
    expect(MINION_STATS.super.hp).toBeGreaterThan(MINION_STATS.siege.hp);
    expect(MINION_STATS.super.ad).toBeGreaterThan(MINION_STATS.melee.ad);
  });
});

describe('advanceMinion', () => {
  it('progresses along the path and eventually reaches the end', () => {
    const path = laneWaypoints('mid', 'ally');
    const minion = spawnMinion('melee', 'ally', 'mid');
    const total = pathLength(path);

    const first = advanceMinion(minion, path, 1);
    expect(first.distanceTravelled).toBeGreaterThan(0);
    expect(first.atEnd).toBe(false);

    // Walk enough ticks to guarantee arrival.
    let m = { ...minion, ...first };
    let result = first;
    for (let i = 0; i < 1000 && !result.atEnd; i++) {
      result = advanceMinion(m, path, 1);
      m = { ...m, pos: result.pos, waypointIndex: result.waypointIndex, distanceTravelled: result.distanceTravelled };
    }
    expect(result.atEnd).toBe(true);
    expect(result.distanceTravelled).toBeCloseTo(total, 3);
    expect(result.pos.x).toBeCloseTo(path[path.length - 1].x, 3);
    expect(result.pos.y).toBeCloseTo(path[path.length - 1].y, 3);
    expect(result.waypointIndex).toBe(path.length - 1);
  });

  it('never overshoots the total path length', () => {
    const path = laneWaypoints('top', 'enemy');
    const minion = spawnMinion('super', 'enemy', 'top');
    const result = advanceMinion(minion, path, 10_000);
    expect(result.distanceTravelled).toBeLessThanOrEqual(pathLength(path) + 1e-6);
    expect(result.atEnd).toBe(true);
  });
});
