/**
 * Team composition for a full 5v5 three-lane conquest match.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so the
 * lane-assignment logic is pure and unit testable. Given the champion roster,
 * the human's pick, the enemy's player-facing pick, and the lanes active this
 * match, it produces a DETERMINISTIC assignment of five champions per team to
 * lanes (there is no `Math.random` on the tested path).
 *
 * Each team fields exactly five champions, one per lane role (top, jungle,
 * mid, bot, support), so both teams always cover the three map lanes. When the
 * roster carries at least two champions per lane role the two teams draw
 * DIFFERENT champions in every role, so ally and enemy are no longer a mirror
 * matchup. The human keeps their chosen champion on the ally side and the
 * enemy's player-facing pick stays on the enemy side.
 *
 * Coordinate/lane note: the game has three map lanes (`top`/`mid`/`bot`) but
 * champions carry a richer {@link LaneRole} (`top`/`jungle`/`mid`/`bot`/
 * `support`). We keep the champion's LaneRole for flavor/pathing intent and
 * additionally map it to one of the ACTIVE map lanes so a champion always walks
 * a real lane. In Midline Skirmish (a single `mid` lane), every champion piles into mid.
 */

import type { Champion, LaneRole } from '../../data/champions';
import type { Lane, MapSide } from './map';

/** One champion's placement within its team. */
export interface TeamSlot {
  /** The champion archetype assigned to this slot. */
  champion: Champion;
  /** Which side of the map the slot belongs to. */
  side: MapSide;
  /** The champion's intended position (from its data), for flavor/pathing. */
  laneRole: LaneRole;
  /** The ACTIVE map lane this champion actually walks/pushes. */
  lane: Lane;
  /** True for the human-controlled slot (exactly one across both teams). */
  isHuman: boolean;
}

/** The full 10-champion composition for a match. */
export interface TeamComposition {
  ally: TeamSlot[];
  enemy: TeamSlot[];
}

/**
 * Map a champion's {@link LaneRole} to one of the active map lanes. `jungle`
 * and `support` do not have dedicated map lanes, so they are folded onto `mid`
 * and `bot` respectively (a jungler roams mid, a support duos bot). When only a
 * subset of lanes is active (Midline Skirmish = `['mid']`), the role always resolves to the
 * first available lane.
 */
export function laneForRole(role: LaneRole, activeLanes: readonly Lane[]): Lane {
  const preferred: Lane =
    role === 'top'
      ? 'top'
      : role === 'bot' || role === 'support'
        ? 'bot'
        : 'mid'; // mid + jungle both march mid
  if (activeLanes.includes(preferred)) return preferred;
  // Fall back to the first active lane (covers Midline Skirmish's single lane).
  return activeLanes[0] ?? 'mid';
}

/**
 * The canonical order lane roles are filled in. Every team gets exactly one
 * champion per role, guaranteeing top/mid/bot coverage (jungle folds to mid,
 * support folds to bot via {@link laneForRole}).
 */
const ROLE_ORDER: readonly LaneRole[] = [
  'top',
  'jungle',
  'mid',
  'bot',
  'support',
];

/**
 * Deterministically pick one champion of a given lane role, preferring a forced
 * pick when it matches the role, then the first roster champion of that role
 * that is not already taken and (when possible) not used by the opposing team.
 * Falls back to the first roster champion of that role, then to the first
 * roster champion overall, so a slot is always filled even for sparse rosters.
 *
 * A forced pick is honored only when it does NOT collide with a champion in the
 * `avoid` set (e.g. the ally champion already placed in this role). When the
 * force would break the disjoint-teams guarantee the force is dropped and the
 * pool scan chooses a distinct alternative instead, so the same-pick case
 * (human and enemy pick the same id) never mirrors a lane.
 */
function pickForRole(
  roster: readonly Champion[],
  role: LaneRole,
  forcedId: string | undefined,
  taken: Set<string>,
  avoid: Set<string>,
): Champion {
  if (forcedId && !avoid.has(forcedId)) {
    const forced = roster.find((c) => c.id === forcedId);
    if (forced && forced.laneRole === role) return forced;
  }
  const pool = roster.filter((c) => c.laneRole === role);
  return (
    pool.find((c) => !taken.has(c.id) && !avoid.has(c.id)) ??
    pool.find((c) => !taken.has(c.id)) ??
    pool[0] ??
    roster[0]
  );
}

/**
 * Build the full 5v5 composition.
 *
 * Each team fields exactly five champions, one per lane role, so both teams
 * always cover the three map lanes. The human's chosen champion is placed on
 * the ally side in its role slot; the enemy's player-facing pick is placed on
 * the enemy side. Remaining slots draw from the roster so that, whenever the
 * roster holds at least two champions of a role, the ally and enemy champions
 * for that role are DIFFERENT (no mirror matchup). Only the ally side ever
 * carries the single {@link TeamSlot.isHuman} flag.
 *
 * The enemy's player-facing pick is honored only when it does not collide with
 * the ally champion in the same role: if the human and enemy pick the same id,
 * the ally keeps it (as the human) and the enemy falls back to a distinct
 * champion of that role, so the teams stay disjoint.
 *
 * The result is fully deterministic for the same
 * `(roster, humanPickId, enemyPickId, activeLanes)` inputs: roles are filled in
 * a fixed order and each pick scans the roster in order. No randomness is used.
 *
 * @param roster        the champion roster
 * @param humanPickId   id of the human's chosen champion (ally side)
 * @param enemyPickId   id of the enemy's player-facing champion (enemy side)
 * @param activeLanes   lanes active this match (all three for Conquest;
 *                      `['mid']` for Midline Skirmish)
 */
export function composeTeams(
  roster: readonly Champion[],
  humanPickId: string,
  enemyPickId: string,
  activeLanes: readonly Lane[],
): TeamComposition {
  const lanes = activeLanes.length > 0 ? activeLanes : (['mid'] as Lane[]);

  const humanPick = roster.find((c) => c.id === humanPickId);
  const enemyPick = roster.find((c) => c.id === enemyPickId);

  const ally: TeamSlot[] = [];
  const enemy: TeamSlot[] = [];
  const allyTaken = new Set<string>();
  const enemyTaken = new Set<string>();

  for (const role of ROLE_ORDER) {
    // Ally first, so the enemy can actively avoid the ally's champion for this
    // role (de-mirroring) while still honoring the enemy's forced pick. The
    // ally keeps its own forced pick even when it collides with the enemy pick
    // (same-pick case): the ally avoids the enemy pick only in the non-forced
    // case, and the enemy is the side that yields a distinct champion.
    const allyForced = humanPick?.laneRole === role ? humanPickId : undefined;
    const allyAvoid =
      enemyPick?.laneRole === role && enemyPick && enemyPick.id !== allyForced
        ? new Set([enemyPick.id])
        : new Set<string>();
    const allyChampion = pickForRole(
      roster,
      role,
      allyForced,
      allyTaken,
      allyAvoid,
    );
    allyTaken.add(allyChampion.id);
    ally.push({
      champion: allyChampion,
      side: 'ally',
      laneRole: allyChampion.laneRole,
      lane: laneForRole(allyChampion.laneRole, lanes),
      isHuman: allyChampion.id === humanPickId,
    });

    const enemyForced = enemyPick?.laneRole === role ? enemyPickId : undefined;
    const enemyChampion = pickForRole(
      roster,
      role,
      enemyForced,
      enemyTaken,
      new Set([allyChampion.id]),
    );
    enemyTaken.add(enemyChampion.id);
    enemy.push({
      champion: enemyChampion,
      side: 'enemy',
      laneRole: enemyChampion.laneRole,
      lane: laneForRole(enemyChampion.laneRole, lanes),
      isHuman: false,
    });
  }

  // Guarantee exactly one human on the ally side even if the human's pick did
  // not resolve into a role slot (e.g. an unknown id).
  if (!ally.some((s) => s.isHuman) && ally.length > 0) {
    ally[0] = { ...ally[0], isHuman: true };
  }

  return { ally, enemy };
}

/**
 * The enemy slot whose champion matches the player-facing enemy pick, or the
 * first enemy slot as a fallback. The caller wires the HUD's enemy hp bar to
 * this slot's rendered entity so the existing single-enemy HUD stays sensible.
 */
export function enemyFacingSlot(
  composition: TeamComposition,
  enemyPickId: string,
): TeamSlot {
  return (
    composition.enemy.find((s) => s.champion.id === enemyPickId) ??
    composition.enemy[0]
  );
}
