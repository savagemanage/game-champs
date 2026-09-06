import { describe, it, expect } from 'vitest';
import {
  buildEnemyTeam,
  isStageUnlocked,
  nextStage,
  resolveStage,
  resolveZombieWave,
  stageDef,
  stageEnemyTeam,
  zombieWaveScale,
  zombieWaveTeam,
} from './Campaign';
import { CAMPAIGN_ORDER, CAMPAIGN_STAGES, ENEMY_FORMATIONS } from '../config/Progression';
import type { Combatant, Team } from './Formation';
import type { HeroRole, HeroType } from '../types';

/**
 * Campaign tests: stage gating by seasonal resistance + prior clear, that
 * resolveStage delegates to the FEAT-003 Combat engine and returns a first-clear
 * reward + timeline, and that zombie waves scale and gate correctly. These fail
 * if the resistance gate, prior-clear gate, or Combat delegation were reverted.
 */
describe('Campaign', () => {
  function unit(
    id: string,
    type: HeroType,
    role: HeroRole,
    stats: Partial<Pick<Combatant, 'maxHp' | 'atk' | 'def' | 'speed'>> = {},
    row: Combatant['row'] = 'front',
  ): Combatant {
    return {
      id,
      row,
      type,
      role,
      maxHp: stats.maxHp ?? 1000,
      atk: stats.atk ?? 100,
      def: stats.def ?? 50,
      speed: stats.speed ?? 50,
    };
  }
  const team = (members: Combatant[]): Team => ({ members, sameTypeBuff: false });

  /** A deliberately overwhelming squad that clears any early stage. */
  const strongSquad = (): Team =>
    team([
      unit('s1', 'tank', 'dealer', { maxHp: 8000, atk: 900, def: 400, speed: 95 }),
      unit('s2', 'tank', 'dealer', { maxHp: 8000, atk: 900, def: 400, speed: 92 }, 'front'),
      unit('s3', 'missile', 'dealer', { maxHp: 6000, atk: 800, def: 200, speed: 90 }, 'back'),
      unit('s4', 'aircraft', 'dealer', { maxHp: 6000, atk: 800, def: 200, speed: 88 }, 'back'),
      unit('s5', 'tank', 'support', { maxHp: 7000, atk: 400, def: 300, speed: 60 }, 'back'),
    ]);

  it('stage gating: first stage open, later stages need prior clear', () => {
    // Stage 1 (no prerequisite) is unlocked at resistance 0.
    expect(isStageUnlocked('stage_1', [], 0)).toBe(true);
    // Stage 2 requires stage 1 cleared (resistance 0 is fine for it).
    expect(isStageUnlocked('stage_2', [], 0)).toBe(false);
    expect(isStageUnlocked('stage_2', ['stage_1'], 0)).toBe(true);
    // Unknown stage is never unlocked.
    expect(isStageUnlocked('stage_999', CAMPAIGN_ORDER, 10)).toBe(false);
  });

  it('stage gating: seasonal virus resistance blocks high stages', () => {
    // Stage 3 requires resistance >= 1 AND stage_2 cleared.
    const cleared = ['stage_1', 'stage_2'];
    expect(stageDef('stage_3')!.requiredResistance).toBe(1);
    expect(isStageUnlocked('stage_3', cleared, 0)).toBe(false); // resistance too low
    expect(isStageUnlocked('stage_3', cleared, 1)).toBe(true); // gate met
  });

  it('nextStage returns the first unlockable uncleared stage or null when gated', () => {
    expect(nextStage([], 0)).toBe('stage_1');
    expect(nextStage(['stage_1'], 0)).toBe('stage_2');
    // stage_3 needs resistance 1; with stage_2 cleared but resistance 0 it is gated.
    expect(nextStage(['stage_1', 'stage_2'], 0)).toBeNull();
    expect(nextStage(['stage_1', 'stage_2'], 1)).toBe('stage_3');
  });

  it('buildEnemyTeam scales stats and preserves 2-front/3-back ordering', () => {
    const base = ENEMY_FORMATIONS.armored;
    const scaled = buildEnemyTeam(base, 2);
    // Front-row units come first.
    const frontCount = base.filter((u) => u.row === 'front').length;
    expect(scaled.members.slice(0, frontCount).every((m) => m.row === 'front')).toBe(true);
    // A representative unit's HP is doubled (scale 2), speed unchanged.
    const van = scaled.members.find((m) => m.id === 'armor_van')!;
    const src = base.find((u) => u.id === 'armor_van')!;
    expect(van.maxHp).toBe(src.hp * 2);
    expect(van.speed).toBe(src.speed);
  });

  it('resolveStage rejects a locked stage and an empty squad', () => {
    const locked = resolveStage(strongSquad(), 'stage_3', [], 0, 1);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe('locked');

    const emptyStage = resolveStage({ members: [], sameTypeBuff: false }, 'stage_1', [], 0, 1);
    expect(emptyStage.ok).toBe(false);
    if (!emptyStage.ok) expect(emptyStage.reason).toBe('no_squad');

    const unknown = resolveStage(strongSquad(), 'nope', [], 0, 1);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown_stage');
  });

  it('resolveStage delegates to Combat: strong squad wins with a timeline + first-clear reward', () => {
    const res = resolveStage(strongSquad(), 'stage_1', [], 0, 7);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.win).toBe(true);
    // The battle result + timeline come straight from the combat engine.
    expect(res.outcome.battle.winner).toBe('attacker');
    expect(res.outcome.battle.timeline.length).toBeGreaterThan(0);
    // First clear pays the config reward.
    expect(res.outcome.reward).toEqual(CAMPAIGN_STAGES[0].reward);
  });

  it('resolveStage yields NO reward when replaying an already-cleared stage', () => {
    const res = resolveStage(strongSquad(), 'stage_1', ['stage_1'], 0, 7);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.win).toBe(true);
    expect(res.outcome.reward).toEqual({});
  });

  it('resolveStage is deterministic for a given seed', () => {
    const a = resolveStage(strongSquad(), 'stage_2', ['stage_1'], 0, 999);
    const b = resolveStage(strongSquad(), 'stage_2', ['stage_1'], 0, 999);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.outcome.battle.timeline).toEqual(b.outcome.battle.timeline);
      expect(a.outcome.win).toBe(b.outcome.win);
    }
  });

  it('a hopelessly weak squad loses the stage', () => {
    const weak = team([unit('w', 'tank', 'tank', { maxHp: 50, atk: 1, def: 0, speed: 5 })]);
    const res = resolveStage(weak, 'stage_1', [], 0, 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome.win).toBe(false);
      expect(res.outcome.reward).toEqual({});
    }
  });

  it('zombie waves scale up per index and reuse the combat resolver', () => {
    expect(zombieWaveScale(0)).toBeLessThan(zombieWaveScale(5));
    // Later-wave enemies are strictly tougher than wave-0 enemies of the same slot.
    const w0 = zombieWaveTeam(0);
    const w5 = zombieWaveTeam(5);
    expect(w5.members[0].maxHp).toBeGreaterThan(w0.members[0].maxHp);
  });

  it('zombie waves gate on the previous wave and reward first clears', () => {
    // Cannot skip ahead: wave 3 when nothing cleared (highestWave -1) is locked.
    const skip = resolveZombieWave(strongSquad(), 3, -1, 1);
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.reason).toBe('locked');

    // Wave 0 is allowed when highestWave is -1, and a strong squad clears it.
    const first = resolveZombieWave(strongSquad(), 0, -1, 1);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.outcome.win).toBe(true);
      expect(first.outcome.reward.shards).toBeGreaterThan(0);
    }
  });

  it('stageEnemyTeam builds a non-empty team from config', () => {
    const t = stageEnemyTeam(CAMPAIGN_STAGES[0]);
    expect(t.members.length).toBeGreaterThan(0);
  });
});
