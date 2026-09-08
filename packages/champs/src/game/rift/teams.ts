/**
 * Team composition for a full 5v5 three-lane conquest match.
 *
 * This module deliberately contains NO Phaser (or any DOM) imports so the
 * lane-assignment logic is pure and unit testable. Given the champion roster,
 * the human's pick, the enemy's player-facing pick, and the lanes active this
 * match, it produces a DETERMINISTIC assignment of five champions per team to
 * lanes (there is no `Math.random` on the tested path).
 *
 * With only five champion definitions in the roster BOTH teams reuse the same
 * five archetypes; they are distinguished at render time by the ally/enemy
 * sprite rim and team accent, not by the pure composition here.
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
 * Build the full 5v5 composition.
 *
 * Both teams field the SAME five archetypes (the entire roster), so every lane
 * role is covered exactly once per team. The human keeps their chosen champion
 * on the ally side; the enemy's player-facing champion (the one picked in
 * select) is flagged so the caller can wire the HUD's enemy bar to it. All
 * other slots are AI.
 *
 * The result is deterministic: slots follow the roster order, and each team is
 * a straight archetype-per-slot mapping. No randomness is used.
 *
 * @param roster        the champion roster (all five archetypes)
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

  const ally: TeamSlot[] = roster.map((champion) => ({
    champion,
    side: 'ally' as MapSide,
    laneRole: champion.laneRole,
    lane: laneForRole(champion.laneRole, lanes),
    isHuman: champion.id === humanPickId,
  }));

  // If the human's pick is not in the roster (should not happen), fall back to
  // marking the first ally slot as human so exactly one human exists.
  if (!ally.some((s) => s.isHuman) && ally.length > 0) {
    ally[0] = { ...ally[0], isHuman: true };
  }

  const enemy: TeamSlot[] = roster.map((champion) => ({
    champion,
    side: 'enemy' as MapSide,
    laneRole: champion.laneRole,
    lane: laneForRole(champion.laneRole, lanes),
    isHuman: false,
  }));

  // Mark the enemy's player-facing pick so the caller can point the HUD's enemy
  // bar at it. It stays AI-driven (isHuman is only ever true on the ally side).
  void enemyPickId; // enemy pick is surfaced via findEnemyFacingSlot below.

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
