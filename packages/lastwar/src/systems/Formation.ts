/**
 * Formation.ts - the 5-slot squad layout + same-type buff (FEAT-003).
 *
 * A squad is 2 front-row + 3 back-row slots (sizes from
 * {@link GAME_STATE}.FORMATION). Each slot holds a hero id or null. Placement
 * validation guarantees the row sizes and that no hero is placed twice.
 *
 * SAME-TYPE BUFF: when ALL FIVE placed heroes share one combat type, the whole
 * squad gains +{@link HEROES.SAME_TYPE_BUFF} (20%) HP/ATK/DEF. The buff requires
 * a FULL squad of five (a partial same-type squad gets nothing), matching the
 * spec's "team of the same type" bonus.
 *
 * {@link assembleTeam} folds each placed hero's derived stats (via
 * {@link deriveHeroStats}) and the same-type buff into the concrete per-combatant
 * stat blocks the combat resolver consumes, tagged with row (front/back), role,
 * and type for targeting and behavior.
 *
 * Phaser-free and deterministic.
 */

import { GAME_STATE, HEROES } from '../config/GameConfig';
import { heroDef } from '../config/Heroes';
import { deriveHeroStats } from './Heroes';
import type {
  FormationState,
  HeroInstance,
  HeroRole,
  HeroStats,
  HeroType,
} from '../types';

/** Which row a slot belongs to. */
export type Row = 'front' | 'back';

/** A single assembled combatant the {@link Combat} resolver consumes. */
export interface Combatant {
  /** Catalog hero id. */
  id: string;
  /** Row placement (front-row is targeted before back-row). */
  row: Row;
  /** Combat type (type triangle). */
  type: HeroType;
  /** Battlefield role (behavior). */
  role: HeroRole;
  /** Max HP after buffs (starting HP). */
  maxHp: number;
  /** Attack power after buffs. */
  atk: number;
  /** Defense after buffs. */
  def: number;
  /** Turn-order speed. */
  speed: number;
}

/** An assembled squad ready for battle. */
export interface Team {
  /** The combatants, front row first then back row (config order preserved). */
  members: Combatant[];
  /** Whether the same-type buff was applied (all 5 share a type). */
  sameTypeBuff: boolean;
}

/** Total slot count a full squad requires. */
export const SQUAD_SIZE = GAME_STATE.FORMATION.FRONT_SLOTS + GAME_STATE.FORMATION.BACK_SLOTS;

/** A fresh, empty formation with config-sized rows. */
export function emptyFormation(): FormationState {
  return {
    front: new Array<string | null>(GAME_STATE.FORMATION.FRONT_SLOTS).fill(null),
    back: new Array<string | null>(GAME_STATE.FORMATION.BACK_SLOTS).fill(null),
  };
}

/** Every non-null hero id placed in the formation, in front-then-back order. */
export function placedHeroIds(formation: FormationState): string[] {
  return [...formation.front, ...formation.back].filter((id): id is string => typeof id === 'string');
}

/** The reason a formation is invalid (or null when valid). */
export type FormationError =
  | 'front_size'
  | 'back_size'
  | 'duplicate_hero'
  | 'unknown_hero';

/**
 * Validate a formation's shape and contents. Enforces the 2-front / 3-back row
 * sizes, that every placed hero is a real catalog hero, and that no hero id
 * appears in more than one slot. Empty slots (null) are allowed. Returns
 * `{ ok: true }` or `{ ok: false, error }`.
 */
export function validateFormation(
  formation: FormationState,
): { ok: true } | { ok: false; error: FormationError } {
  if (formation.front.length !== GAME_STATE.FORMATION.FRONT_SLOTS) {
    return { ok: false, error: 'front_size' };
  }
  if (formation.back.length !== GAME_STATE.FORMATION.BACK_SLOTS) {
    return { ok: false, error: 'back_size' };
  }
  const placed = placedHeroIds(formation);
  const seen = new Set<string>();
  for (const id of placed) {
    if (!heroDef(id)) return { ok: false, error: 'unknown_hero' };
    if (seen.has(id)) return { ok: false, error: 'duplicate_hero' };
    seen.add(id);
  }
  return { ok: true };
}

/** Whether all five slots are filled with valid, distinct heroes. */
export function isFullSquad(formation: FormationState): boolean {
  return validateFormation(formation).ok === true && placedHeroIds(formation).length === SQUAD_SIZE;
}

/**
 * Place a hero id into a row slot, returning a NEW formation. If the hero is
 * already placed elsewhere it is first removed (a hero occupies at most one
 * slot). Passing null clears the slot. Out-of-range indices are ignored
 * (returns an unchanged copy). Pure.
 */
export function placeHero(
  formation: FormationState,
  row: Row,
  index: number,
  heroId: string | null,
): FormationState {
  const next: FormationState = {
    front: [...formation.front],
    back: [...formation.back],
  };
  const target = row === 'front' ? next.front : next.back;
  if (index < 0 || index >= target.length) return next;

  // Remove the hero from any existing slot so it is never placed twice.
  if (heroId !== null) {
    for (let i = 0; i < next.front.length; i += 1) if (next.front[i] === heroId) next.front[i] = null;
    for (let i = 0; i < next.back.length; i += 1) if (next.back[i] === heroId) next.back[i] = null;
  }
  target[index] = heroId;
  return next;
}

/**
 * Whether all placed heroes share one combat type. Requires a FULL squad of
 * five; a partial squad (even if uniform) returns false so the buff only ever
 * applies to a complete same-type team.
 */
export function isSameType(formation: FormationState, roster: Record<string, HeroInstance>): boolean {
  if (!isFullSquad(formation)) return false;
  const ids = placedHeroIds(formation);
  let type: HeroType | null = null;
  for (const id of ids) {
    // Only consider heroes actually owned; an id not in the roster disqualifies.
    if (!roster[id]) return false;
    const def = heroDef(id);
    if (!def) return false;
    if (type === null) type = def.type;
    else if (def.type !== type) return false;
  }
  return type !== null;
}

/** Apply the same-type buff multiplier to a stat block (HP/ATK/DEF only). */
function buffStats(stats: HeroStats, applyBuff: boolean): HeroStats {
  if (!applyBuff) return stats;
  const m = 1 + HEROES.SAME_TYPE_BUFF;
  return {
    hp: Math.round(stats.hp * m),
    atk: Math.round(stats.atk * m),
    def: Math.round(stats.def * m),
    speed: stats.speed,
  };
}

/**
 * Assemble the battle-ready {@link Team} from a formation + the owning roster.
 * Each placed hero's derived stats are folded in, the same-type buff is applied
 * to HP/ATK/DEF when the squad qualifies, and combatants are tagged with row /
 * role / type for combat targeting and behavior. Heroes not in the roster are
 * skipped (only owned heroes fight). Front-row combatants come first.
 */
export function assembleTeam(
  formation: FormationState,
  roster: Record<string, HeroInstance>,
): Team {
  const sameTypeBuff = isSameType(formation, roster);
  const members: Combatant[] = [];

  const addRow = (slots: (string | null)[], row: Row): void => {
    for (const id of slots) {
      if (id === null) continue;
      const def = heroDef(id);
      const instance = roster[id];
      if (!def || !instance) continue;
      const stats = buffStats(deriveHeroStats(instance), sameTypeBuff);
      members.push({
        id,
        row,
        type: def.type,
        role: def.role,
        maxHp: stats.hp,
        atk: stats.atk,
        def: stats.def,
        speed: stats.speed,
      });
    }
  };

  addRow(formation.front, 'front');
  addRow(formation.back, 'back');
  return { members, sameTypeBuff };
}
