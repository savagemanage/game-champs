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
 * An optional caller-provided `seed` rotates WHICH eligible champion fills a
 * non-forced role slot: different matchups (different seeds) can pick the
 * SECOND roster candidate for a role instead of always the first, adding
 * variety while staying deterministic. The seed only reorders the candidate
 * scan; the fill order, ally-first structure, disjointness, no-mirror and
 * forced-pick contracts are all unchanged. The RNG is a pure seeded generator
 * (see {@link makeRng}), so there is still no `Math.random`/`Date.now` on any
 * path.
 *
 * Coordinate/lane note: the game has three map lanes (`top`/`mid`/`bot`) but
 * champions carry a richer {@link LaneRole} (`top`/`jungle`/`mid`/`bot`/
 * `support`). We keep the champion's LaneRole for flavor/pathing intent and
 * additionally map it to one of the ACTIVE map lanes so a champion always walks
 * a real lane. In Midline Skirmish (a single `mid` lane), every champion piles into mid.
 */

import type { Champion, LaneRole } from '../../data/champions';
import type { Lane, MapSide } from './map';
import { makeRng } from './rng';

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
 *
 * When a seeded `rng` is supplied the eligible pool is scanned in a
 * seed-derived deterministic order instead of plain roster order, so different
 * matchups can select a different (e.g. the second) candidate for a role. The
 * fallback chain (not-taken & not-avoided -> not-taken -> pool[0] -> roster[0])
 * is preserved so sparse rosters still always fill the slot.
 */
function pickForRole(
  roster: readonly Champion[],
  role: LaneRole,
  forcedId: string | undefined,
  taken: Set<string>,
  avoid: Set<string>,
  rng?: () => number,
): Champion {
  if (forcedId && !avoid.has(forcedId)) {
    const forced = roster.find((c) => c.id === forcedId);
    if (forced && forced.laneRole === role) return forced;
  }
  const basePool = roster.filter((c) => c.laneRole === role);
  const pool = rng ? shuffle(basePool, rng) : basePool;
  return (
    pool.find((c) => !taken.has(c.id) && !avoid.has(c.id)) ??
    pool.find((c) => !taken.has(c.id)) ??
    pool[0] ??
    roster[0]
  );
}

/**
 * A pure, deterministic Fisher-Yates shuffle driven by the supplied `[0, 1)`
 * generator. Does not mutate the input array. Given the same `rng` stream the
 * output ordering is identical, keeping composition reproducible.
 */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
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
 * `(roster, humanPickId, enemyPickId, activeLanes, seed)` inputs: roles are
 * filled in a fixed order and each pick scans the roster in a fixed
 * seed-derived order. Only a pure seeded RNG is used (no `Math.random`).
 *
 * When `seed` is omitted the non-forced role slots are filled in plain roster
 * order, preserving the historical (pre-seed) behavior. When a `seed` is
 * provided each role scans its eligible pool in a seed-derived order, so a
 * different matchup can pick the second candidate of a role for added variety.
 *
 * @param roster        the champion roster
 * @param humanPickId   id of the human's chosen champion (ally side)
 * @param enemyPickId   id of the enemy's player-facing champion (enemy side)
 * @param activeLanes   lanes active this match (all three for Conquest;
 *                      `['mid']` for Midline Skirmish)
 * @param seed          optional matchup-derived seed rotating non-forced picks
 */
export function composeTeams(
  roster: readonly Champion[],
  humanPickId: string,
  enemyPickId: string,
  activeLanes: readonly Lane[],
  seed?: string | number,
): TeamComposition {
  const lanes = activeLanes.length > 0 ? activeLanes : (['mid'] as Lane[]);
  const seeded = seed !== undefined;

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
    // Derive an independent per-role/per-side generator so each role's scan
    // order varies with the seed without one role leaking into another. Omit
    // the generator entirely (roster order) when no seed was provided.
    const allyRng = seeded ? makeRng(`${seed}:ally:${role}`) : undefined;
    const enemyRng = seeded ? makeRng(`${seed}:enemy:${role}`) : undefined;

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
      allyRng,
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
      enemyRng,
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
