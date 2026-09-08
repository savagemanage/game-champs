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

describe('composeTeams (seeded rotation)', () => {
  const roles = ['top', 'jungle', 'mid', 'bot', 'support'] as const;

  const expectValidComposition = (c: ReturnType<typeof composeTeams>) => {
    expect(c.ally).toHaveLength(5);
    expect(c.enemy).toHaveLength(5);
    // Exactly one human, on ally.
    const humans = [...c.ally, ...c.enemy].filter((s) => s.isHuman);
    expect(humans).toHaveLength(1);
    expect(humans[0].side).toBe('ally');
    for (const team of [c.ally, c.enemy]) {
      // Five distinct champions, one per lane role.
      expect(new Set(team.map((s) => s.champion.id)).size).toBe(5);
      expect(team.map((s) => s.laneRole).sort()).toEqual([...roles].sort());
    }
    // Disjoint ally/enemy sets (no mirror).
    const allyIds = new Set(c.ally.map((s) => s.champion.id));
    for (const id of c.enemy.map((s) => s.champion.id)) {
      expect(allyIds.has(id)).toBe(false);
    }
  };

  it('is deterministic for the same seed (byte-identical output)', () => {
    const a = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES, 'match-7');
    const b = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES, 'match-7');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('can yield different non-picked champions across seeds for at least one role', () => {
    // Scan a range of seeds; at least one must diverge from the base seed in a
    // non-forced role slot, proving the rotation actually varies the choice.
    const base = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES, 'seed-0');
    const baseIds = JSON.stringify([
      base.ally.map((s) => s.champion.id),
      base.enemy.map((s) => s.champion.id),
    ]);
    let sawDifference = false;
    for (let i = 1; i < 40 && !sawDifference; i++) {
      const other = composeTeams(
        CHAMPIONS,
        'nightveil',
        'ironhold',
        CONQUEST_LANES,
        `seed-${i}`,
      );
      const otherIds = JSON.stringify([
        other.ally.map((s) => s.champion.id),
        other.enemy.map((s) => s.champion.id),
      ]);
      if (otherIds !== baseIds) sawDifference = true;
    }
    expect(sawDifference).toBe(true);
  });

  it('preserves the forced picks: human on ally, enemy pick on enemy', () => {
    for (let i = 0; i < 25; i++) {
      const c = composeTeams(
        CHAMPIONS,
        'ashborne',
        'embermage',
        CONQUEST_LANES,
        `s-${i}`,
      );
      const human = [...c.ally, ...c.enemy].find((s) => s.isHuman);
      expect(human?.side).toBe('ally');
      expect(human?.champion.id).toBe('ashborne');
      // Enemy pick does not collide with the ally pick, so it stays on enemy.
      expect(c.enemy.some((s) => s.champion.id === 'embermage')).toBe(true);
    }
  });

  it('keeps all invariants (distinct, one-per-role, disjoint) across many seeds', () => {
    for (let i = 0; i < 40; i++) {
      expectValidComposition(
        composeTeams(CHAMPIONS, 'nightveil', 'ashborne', CONQUEST_LANES, `k-${i}`),
      );
    }
  });

  it('never mirrors on the same-pick case across seeds', () => {
    for (let i = 0; i < 40; i++) {
      const c = composeTeams(CHAMPIONS, 'embermage', 'embermage', CONQUEST_LANES, `m-${i}`);
      const humans = [...c.ally, ...c.enemy].filter((s) => s.isHuman);
      expect(humans).toHaveLength(1);
      expect(humans[0].side).toBe('ally');
      expect(humans[0].champion.id).toBe('embermage');
      const allyIds = new Set(c.ally.map((s) => s.champion.id));
      for (const id of c.enemy.map((s) => s.champion.id)) {
        expect(allyIds.has(id)).toBe(false);
      }
    }
  });

  it('produces a valid composition when the seed is omitted', () => {
    expectValidComposition(
      composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES),
    );
  });

  it('accepts a numeric seed and stays deterministic', () => {
    const a = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES, 12345);
    const b = composeTeams(CHAMPIONS, 'nightveil', 'ironhold', CONQUEST_LANES, 12345);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
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
