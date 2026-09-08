import { describe, it, expect } from 'vitest';
import { composeTeams, laneForRole, enemyFacingSlot } from './teams';
import { CHAMPIONS, getChampionById } from '../../data/champions';
import { LANES, type Lane } from './map';

const RIFT_LANES: readonly Lane[] = [...LANES];
const ARAM_LANES: readonly Lane[] = ['mid'];

describe('laneForRole', () => {
  it('maps the primary roles to their own lanes in Rift', () => {
    expect(laneForRole('top', RIFT_LANES)).toBe('top');
    expect(laneForRole('mid', RIFT_LANES)).toBe('mid');
    expect(laneForRole('bot', RIFT_LANES)).toBe('bot');
  });

  it('folds jungle onto mid and support onto bot', () => {
    expect(laneForRole('jungle', RIFT_LANES)).toBe('mid');
    expect(laneForRole('support', RIFT_LANES)).toBe('bot');
  });

  it('sends every role into mid for ARAM (single-lane)', () => {
    for (const role of ['top', 'jungle', 'mid', 'bot', 'support'] as const) {
      expect(laneForRole(role, ARAM_LANES)).toBe('mid');
    }
  });
});

describe('composeTeams (Rift)', () => {
  it('fields exactly five champions per team', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    expect(c.ally).toHaveLength(5);
    expect(c.enemy).toHaveLength(5);
  });

  it('covers all three map lanes on each team', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    for (const team of [c.ally, c.enemy]) {
      const lanes = new Set(team.map((s) => s.lane));
      expect(lanes.has('top')).toBe(true);
      expect(lanes.has('mid')).toBe(true);
      expect(lanes.has('bot')).toBe(true);
    }
  });

  it('places the human on the ally side in their laneRole lane', () => {
    const humanId = 'ashborne'; // bot marksman
    const c = composeTeams(CHAMPIONS, humanId, 'nightveil', RIFT_LANES);
    const humans = [...c.ally, ...c.enemy].filter((s) => s.isHuman);
    expect(humans).toHaveLength(1);
    const human = humans[0];
    expect(human.side).toBe('ally');
    expect(human.champion.id).toBe(humanId);
    const role = getChampionById(humanId)!.laneRole;
    expect(human.lane).toBe(laneForRole(role, RIFT_LANES));
  });

  it('never marks an enemy slot as human', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'ashborne', RIFT_LANES);
    expect(c.enemy.every((s) => !s.isHuman)).toBe(true);
  });

  it('fields five distinct champions per team (no in-team duplicates)', () => {
    const c = composeTeams(CHAMPIONS, 'embermage', 'dawnsong', RIFT_LANES);
    const allyIds = c.ally.map((s) => s.champion.id);
    const enemyIds = c.enemy.map((s) => s.champion.id);
    expect(new Set(allyIds).size).toBe(5);
    expect(new Set(enemyIds).size).toBe(5);
  });

  it('covers exactly one champion per lane role on each team', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    const roles = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
    for (const team of [c.ally, c.enemy]) {
      const teamRoles = team.map((s) => s.laneRole).sort();
      expect(teamRoles).toEqual([...roles].sort());
    }
  });

  it('does not mirror: ally and enemy field disjoint champion sets', () => {
    // The roster has at least two champions per lane role, so a de-mirrored
    // 5v5 (different champion in every role) is possible.
    const c = composeTeams(CHAMPIONS, 'embermage', 'dawnsong', RIFT_LANES);
    const allyIds = new Set(c.ally.map((s) => s.champion.id));
    const enemyIds = c.enemy.map((s) => s.champion.id);
    for (const id of enemyIds) {
      expect(allyIds.has(id)).toBe(false);
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    const b = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('tags each slot with the correct side', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', RIFT_LANES);
    expect(c.ally.every((s) => s.side === 'ally')).toBe(true);
    expect(c.enemy.every((s) => s.side === 'enemy')).toBe(true);
  });
});

describe('composeTeams (ARAM)', () => {
  it('piles all five per side into mid', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', ARAM_LANES);
    expect(c.ally).toHaveLength(5);
    expect(c.enemy).toHaveLength(5);
    for (const s of [...c.ally, ...c.enemy]) {
      expect(s.lane).toBe('mid');
    }
  });
});

describe('enemyFacingSlot', () => {
  it('returns the enemy slot matching the player-facing pick', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'embermage', RIFT_LANES);
    const slot = enemyFacingSlot(c, 'embermage');
    expect(slot.side).toBe('enemy');
    expect(slot.champion.id).toBe('embermage');
  });

  it('falls back to the first enemy slot for an unknown pick', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'nope', RIFT_LANES);
    expect(enemyFacingSlot(c, 'nope')).toBe(c.enemy[0]);
  });
});
