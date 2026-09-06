import { describe, it, expect } from 'vitest';
import {
  assembleTeam,
  emptyFormation,
  isFullSquad,
  isSameType,
  placeHero,
  placedHeroIds,
  SQUAD_SIZE,
  validateFormation,
} from './Formation';
import { makeHeroInstance } from './Heroes';
import { GAME_STATE, HEROES } from '../config/GameConfig';
import { HERO_CATALOG } from '../config/Heroes';
import type { FormationState, HeroInstance } from '../types';

/**
 * Formation tests. Enforces the 2-front / 3-back layout and applies the
 * same-type +20% buff ONLY when all 5 placed heroes share a type. These fail if
 * the validation or the same-type buff were reverted.
 */
describe('Formation', () => {
  // Five heroes that all share the 'tank' type for the same-type buff.
  const tanks = HERO_CATALOG.filter((h) => h.type === 'tank').map((h) => h.id);
  // A mixed set (first tank + first missile + more) to break the buff.
  const missiles = HERO_CATALOG.filter((h) => h.type === 'missile').map((h) => h.id);

  /** Build a roster owning the given hero ids. */
  function roster(ids: string[]): Record<string, HeroInstance> {
    const r: Record<string, HeroInstance> = {};
    for (const id of ids) r[id] = makeHeroInstance(id);
    return r;
  }

  /** A full 5-hero formation from the first 5 of the given id list. */
  function fullFormation(ids: string[]): FormationState {
    return {
      front: [ids[0], ids[1]],
      back: [ids[2], ids[3], ids[4]],
    };
  }

  it('SQUAD_SIZE matches the config row counts (2 + 3 = 5)', () => {
    expect(SQUAD_SIZE).toBe(GAME_STATE.FORMATION.FRONT_SLOTS + GAME_STATE.FORMATION.BACK_SLOTS);
    expect(SQUAD_SIZE).toBe(5);
  });

  it('an empty formation has 2 front + 3 back null slots and is valid', () => {
    const f = emptyFormation();
    expect(f.front).toHaveLength(2);
    expect(f.back).toHaveLength(3);
    expect(validateFormation(f)).toEqual({ ok: true });
    expect(isFullSquad(f)).toBe(false);
  });

  it('rejects wrong front/back row sizes', () => {
    expect(validateFormation({ front: [null], back: [null, null, null] })).toEqual({
      ok: false,
      error: 'front_size',
    });
    expect(validateFormation({ front: [null, null], back: [null, null] })).toEqual({
      ok: false,
      error: 'back_size',
    });
  });

  it('rejects an unknown hero and a duplicate placement', () => {
    expect(validateFormation({ front: ['nope', null], back: [null, null, null] })).toEqual({
      ok: false,
      error: 'unknown_hero',
    });
    const dupId = tanks[0];
    expect(
      validateFormation({ front: [dupId, dupId], back: [null, null, null] }),
    ).toEqual({ ok: false, error: 'duplicate_hero' });
  });

  it('placeHero moves a hero to at most one slot (removes prior placement)', () => {
    const id = tanks[0];
    let f = emptyFormation();
    f = placeHero(f, 'front', 0, id);
    expect(f.front[0]).toBe(id);
    // Placing the same hero into a back slot removes it from the front.
    f = placeHero(f, 'back', 1, id);
    expect(f.front[0]).toBeNull();
    expect(f.back[1]).toBe(id);
    expect(placedHeroIds(f)).toEqual([id]);
  });

  it('placeHero(null) clears a slot and ignores out-of-range indices', () => {
    let f = placeHero(emptyFormation(), 'front', 0, tanks[0]);
    f = placeHero(f, 'front', 0, null);
    expect(f.front[0]).toBeNull();
    const before = placeHero(emptyFormation(), 'front', 9, tanks[0]);
    expect(placedHeroIds(before)).toEqual([]); // ignored
  });

  it('isFullSquad is true only when all 5 valid distinct heroes are placed', () => {
    const ids = tanks.slice(0, 5);
    const f = fullFormation(ids);
    expect(isFullSquad(f)).toBe(true);
    // Remove one -> no longer full.
    const partial = placeHero(f, 'back', 2, null);
    expect(isFullSquad(partial)).toBe(false);
  });

  it('same-type buff applies ONLY for a full 5-hero same-type squad', () => {
    const ids = tanks.slice(0, 5);
    const full = fullFormation(ids);
    const r = roster(ids);
    expect(isSameType(full, r)).toBe(true);

    const team = assembleTeam(full, r);
    expect(team.sameTypeBuff).toBe(true);

    // Compare a buffed member's ATK to its unbuffed derived ATK.
    const unbuffed = assembleTeam(full, r); // same, but check factor via a mixed team
    void unbuffed;
    // A mixed squad (swap one tank for a missile) loses the buff entirely.
    const mixedIds = [tanks[0], tanks[1], tanks[2], tanks[3], missiles[0]];
    const mixed = fullFormation(mixedIds);
    const mixedRoster = roster(mixedIds);
    expect(isSameType(mixed, mixedRoster)).toBe(false);
    const mixedTeam = assembleTeam(mixed, mixedRoster);
    expect(mixedTeam.sameTypeBuff).toBe(false);

    // The shared members' stats are exactly (1 + buff) higher in the same-type team.
    const sharedId = tanks[0];
    const buffedMember = team.members.find((m) => m.id === sharedId)!;
    const plainMember = mixedTeam.members.find((m) => m.id === sharedId)!;
    expect(buffedMember.atk).toBe(Math.round(plainMember.atk * (1 + HEROES.SAME_TYPE_BUFF)));
    expect(buffedMember.maxHp).toBe(Math.round(plainMember.maxHp * (1 + HEROES.SAME_TYPE_BUFF)));
  });

  it('a partial same-type squad does NOT get the buff', () => {
    const ids = tanks.slice(0, 4); // only 4 placed
    const f: FormationState = { front: [ids[0], ids[1]], back: [ids[2], ids[3], null] };
    const r = roster(ids);
    expect(isSameType(f, r)).toBe(false);
    expect(assembleTeam(f, r).sameTypeBuff).toBe(false);
  });

  it('assembleTeam skips heroes not owned and tags row/type/role', () => {
    const ids = tanks.slice(0, 5);
    const f = fullFormation(ids);
    // Roster missing one hero -> that member is skipped.
    const r = roster(ids.slice(0, 4));
    const team = assembleTeam(f, r);
    expect(team.members).toHaveLength(4);
    for (const m of team.members) {
      expect(['front', 'back']).toContain(m.row);
      expect(m.type).toBe('tank');
      expect(m.maxHp).toBeGreaterThan(0);
    }
    // Front-row members come first.
    expect(team.members[0].row).toBe('front');
  });
});
