import { describe, expect, it } from 'vitest';
import { rulesForMode } from '../config/matchRules';
import {
  advanceChampionLife,
  championLifeTimerRemaining,
  championRespawnDelay,
  createChampionLifeState,
  isChampionDamageable,
  isChampionPresent,
  killChampion,
} from './championLifeState';

describe('champion life state', () => {
  it('uses deterministic mode-specific respawn tuning', () => {
    expect(championRespawnDelay(1, 'conquest')).toBe(5.25);
    expect(championRespawnDelay(18, 'conquest')).toBe(26);
    expect(championRespawnDelay(18, 'midline')).toBeLessThan(
      championRespawnDelay(18, 'conquest'),
    );
  });

  it('advances dead -> respawning -> invulnerable -> alive at exact deadlines', () => {
    const killed = killChampion(createChampionLifeState(), 100, 4, 'conquest');
    const respawnsAt = 100 + championRespawnDelay(4, 'conquest');
    expect(killed.phase).toBe('dead');
    expect(killed.respawnsAt).toBe(respawnsAt);
    expect(isChampionPresent(killed)).toBe(false);
    expect(isChampionDamageable(killed)).toBe(false);

    const respawning = advanceChampionLife(killed, 101, 'conquest');
    expect(respawning.phase).toBe('respawning');
    expect(championLifeTimerRemaining(respawning, 101)).toBe(respawnsAt - 101);

    const returned = advanceChampionLife(respawning, respawnsAt, 'conquest');
    expect(returned.phase).toBe('invulnerable');
    expect(isChampionPresent(returned)).toBe(true);
    expect(isChampionDamageable(returned)).toBe(false);

    const vulnerableAt =
      respawnsAt + rulesForMode('conquest').respawn.invulnerabilitySeconds;
    expect(advanceChampionLife(returned, vulnerableAt - 0.01, 'conquest').phase).toBe(
      'invulnerable',
    );
    const alive = advanceChampionLife(returned, vulnerableAt, 'conquest');
    expect(alive).toEqual(createChampionLifeState());
    expect(isChampionDamageable(alive)).toBe(true);
  });

  it('ignores duplicate kills until the champion is damageable again', () => {
    const killed = killChampion(createChampionLifeState(), 50, 2);
    expect(killChampion(killed, 55, 18)).toBe(killed);

    const returned = advanceChampionLife(killed, killed.respawnsAt ?? 0);
    expect(returned.phase).toBe('invulnerable');
    expect(killChampion(returned, 100, 18)).toBe(returned);
  });
});
