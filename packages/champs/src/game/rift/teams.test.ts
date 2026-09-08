import { describe, it, expect } from 'vitest';
import { composeTeams, laneForRole, enemyFacingSlot } from './teams';
import { CHAMPIONS, getChampionById } from '../../data/champions';
import { LANES, type Lane } from './map';

const CONQUEST_LANES: readonly Lane[] = [...LANES];
const MIDLINE_LANES: readonly Lane[] = ['mid'];

describe('laneForRole', () => {
  it('maps the primary roles to their own lanes in Conquest', () => {
    expect(laneForRole('top', CONQUEST_LANES)).toBe('top');
    expect(laneForRole('mid', CONQUEST_LANES)).toBe('mid');
    expect(laneForRole('bot', CONQUEST_LANES)).toBe('bot');
  });

  it('folds jungle onto mid and support onto bot', () => {
    expect(laneForRole('jungle', CONQUEST_LANES)).toBe('mid');
    expect(laneForRole('support', CONQUEST_LANES)).toBe('bot');
  });

  it('sends every role into mid for Midline Skirmish', () => {
    for (const role of ['top', 'jungle', 'mid', 'bot', 'support'] as const) {
      expect(laneForRole(role, MIDLINE_LANES)).toBe('mid');
    }
  });
});

describe('composeTeams (Conquest)', () => {
  it('fields exactly five champions per team', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES);
    expect(c.ally).toHaveLength(5);
    expect(c.enemy).toHaveLength(5);
  });

  it('covers all three map lanes on each team', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES);
    for (const team of [c.ally, c.enemy]) {
      const lanes = new Set(team.map((s) => s.lane));
      expect(lanes.has('top')).toBe(true);
      expect(lanes.has('mid')).toBe(true);
      expect(lanes.has('bot')).toBe(true);
    }
  });

  it('places the human on the ally side in their lane-role lane', () => {
    const humanId = 'ashborne';
    const c = composeTeams(CHAMPIONS, humanId, 'nightveil', CONQUEST_LANES);
    const humans = [...c.ally, ...c.enemy].filter((s) => s.isHuman);
    expect(humans).toHaveLength(1);
    const human = humans[0];
    expect(human.side).toBe('ally');
    expect(human.champion.id).toBe(humanId);
    const role = getChampionById(humanId)!.laneRole;
    expect(human.lane).toBe(laneForRole(role, CONQUEST_LANES));
  });

  it('never marks an enemy slot as human', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'ashborne', CONQUEST_LANES);
    expect(c.enemy.every((s) => !s.isHuman)).toBe(true);
  });

  it('fields five distinct champions per team with one per lane role', () => {
    const c = composeTeams(CHAMPIONS, 'embermage', 'dawnsong', CONQUEST_LANES);
    const roles = ['top', 'jungle', 'mid', 'bot', 'support'] as const;
    for (const team of [c.ally, c.enemy]) {
      expect(new Set(team.map((s) => s.champion.id)).size).toBe(5);
      expect(team.map((s) => s.laneRole).sort()).toEqual([...roles].sort());
    }
  });

  it('fields disjoint ally and enemy champion sets', () => {
    const c = composeTeams(CHAMPIONS, 'embermage', 'dawnsong', CONQUEST_LANES);
    const allyIds = new Set(c.ally.map((s) => s.champion.id));
    for (const id of c.enemy.map((s) => s.champion.id)) {
      expect(allyIds.has(id)).toBe(false);
    }
  });

  it('does not mirror when the human and enemy pick the same champion', () => {
    const championId = 'embermage';
    const c = composeTeams(CHAMPIONS, championId, championId, CONQUEST_LANES);
    const humans = [...c.ally, ...c.enemy].filter((s) => s.isHuman);
    expect(humans).toHaveLength(1);
    expect(humans[0].side).toBe('ally');
    expect(humans[0].champion.id).toBe(championId);

    const allyIds = new Set(c.ally.map((s) => s.champion.id));
    for (const id of c.enemy.map((s) => s.champion.id)) {
      expect(allyIds.has(id)).toBe(false);
    }

    const again = composeTeams(CHAMPIONS, championId, championId, CONQUEST_LANES);
    expect(JSON.stringify(again)).toEqual(JSON.stringify(c));
  });

  it('is deterministic for the same inputs', () => {
    const a = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES);
    const b = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('tags each slot with the correct side', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES);
    expect(c.ally.every((s) => s.side === 'ally')).toBe(true);
    expect(c.enemy.every((s) => s.side === 'enemy')).toBe(true);
  });
});

describe('composeTeams (Midline Skirmish)', () => {
  it('piles all five champions per side into mid', () => {
    const c = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', MIDLINE_LANES);
    expect(c.ally).toHaveLength(5);
    expect(c.enemy).toHaveLength(5);
    for (const slot of [...c.ally, ...c.enemy]) {
      expect(slot.lane).toBe('mid');
    }
  });
});

describe('enemyFacingSlot', () => {
  it('returns the enemy slot matching the player-facing pick', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'embermage', CONQUEST_LANES);
    const slot = enemyFacingSlot(c, 'embermage');
    expect(slot.side).toBe('enemy');
    expect(slot.champion.id).toBe('embermage');
  });

  it('falls back to the first enemy slot for an unknown pick', () => {
    const c = composeTeams(CHAMPIONS, 'ashborne', 'nope', CONQUEST_LANES);
    expect(enemyFacingSlot(c, 'nope')).toBe(c.enemy[0]);
  });
});
