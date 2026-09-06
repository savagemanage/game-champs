/**
 * League.ts - alliance membership + league standings as an OFFLINE simulation
 * (FEAT-004).
 *
 * Phaser-free and deterministic. There is NO networking and NO real
 * multiplayer: the "league" is a single-player simulation. A fixed number of AI
 * alliances ({@link LEAGUE.AI_ALLIANCE_COUNT}) are given deterministic seeded
 * power scores that DRIFT each league period; the player is placed into the
 * standings by their own team power; and league "PvP" matches are resolved
 * against a seeded AI formation via the FEAT-003 {@link resolveBattle} engine.
 *
 * Same period + same seed => identical AI alliance scores, identical standings,
 * and identical match results, so the simulation is fully reproducible in tests.
 */

import {
  ENEMY_FORMATIONS,
  LEAGUE,
  type RewardBundle,
} from '../config/Progression';
import type { LeagueState } from '../types';
import { buildEnemyTeam } from './Campaign';
import { resolveBattle, type BattleResult } from './Combat';
import type { Team } from './Formation';
import { makeRng } from './Rng';

/** A single alliance's standings entry. */
export interface AllianceStanding {
  /** Stable alliance id ('player' for the player's alliance). */
  id: string;
  /** i18n key for the alliance display name. */
  nameKey: string;
  /** Simulated alliance power (higher ranks better). */
  power: number;
  /** True for the player's own alliance. */
  isPlayer: boolean;
  /** 1-based rank in the standings (filled by {@link standings}). */
  rank: number;
}

/** A fresh league state: the player's alliance, period 0, no record. */
export function freshLeague(): LeagueState {
  return {
    alliance: 'league.alliance.player',
    period: 0,
    wins: 0,
    losses: 0,
    bestRank: 0,
  };
}

/**
 * The deterministic seeded power of AI alliance `index` in league `period`.
 * The base power is seeded per-alliance; a per-period drift (bounded by
 * {@link LEAGUE.AI_DRIFT}) is layered on so standings shift over time without
 * any persistence. Always non-negative.
 */
export function aiAlliancePower(index: number, period: number): number {
  const baseRng = makeRng((index * 0x1000193) >>> 0);
  const base = LEAGUE.AI_BASE_POWER + baseRng.range(-LEAGUE.AI_POWER_SPREAD, LEAGUE.AI_POWER_SPREAD);
  const driftRng = makeRng(((index * 0x100000001 + period * 0x9e3779b9) >>> 0) >>> 0);
  const drift = driftRng.range(-LEAGUE.AI_DRIFT, LEAGUE.AI_DRIFT) * period;
  return Math.max(0, Math.round(base + drift));
}

/**
 * A rough "power" score for a player {@link Team}, summing each combatant's
 * offensive + defensive weight. Used only to place the player in the AI
 * standings; combat itself is resolved by {@link resolveBattle}.
 */
export function teamPower(team: Team): number {
  return team.members.reduce((sum, m) => sum + m.maxHp + (m.atk + m.def) * 4 + m.speed, 0);
}

/**
 * Build the full league standings for a period: the player's alliance (power
 * from `playerPower`) plus every AI alliance, sorted by descending power and
 * assigned 1-based ranks. Deterministic for a given period + player power.
 * Ties break in favor of the player, then by alliance id, so ranks are stable.
 */
export function standings(playerPower: number, period: number): AllianceStanding[] {
  const entries: AllianceStanding[] = [
    { id: 'player', nameKey: 'league.alliance.player', power: Math.max(0, Math.round(playerPower)), isPlayer: true, rank: 0 },
  ];
  for (let i = 0; i < LEAGUE.AI_ALLIANCE_COUNT; i += 1) {
    entries.push({
      id: `ai_${i}`,
      nameKey: `league.alliance.ai${i}`,
      power: aiAlliancePower(i, period),
      isPlayer: false,
      rank: 0,
    });
  }
  entries.sort((a, b) => {
    if (b.power !== a.power) return b.power - a.power;
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });
  return entries;
}

/** The player's 1-based rank in the standings for a period. */
export function playerRank(playerPower: number, period: number): number {
  const table = standings(playerPower, period);
  const me = table.find((e) => e.isPlayer);
  return me ? me.rank : table.length;
}

/** The placement reward for a final standings rank. */
export function rankReward(rank: number): RewardBundle {
  for (const bracket of LEAGUE.RANK_REWARDS) {
    if (rank <= bracket.maxRank) return bracket.reward;
  }
  return LEAGUE.RANK_REWARDS[LEAGUE.RANK_REWARDS.length - 1].reward;
}

/** The AI opponent team for a league PvP match, chosen deterministically. */
export function matchOpponent(matchSeed: number): Team {
  const rng = makeRng(matchSeed >>> 0);
  const key = rng.pick(LEAGUE.MATCH_FORMATIONS);
  return buildEnemyTeam(ENEMY_FORMATIONS[key], LEAGUE.MATCH_SCALE);
}

/** The outcome of a league PvP match. */
export interface MatchOutcome {
  /** True when the player (attacker) won. */
  win: boolean;
  /** The full battle result + timeline for animation. */
  battle: BattleResult;
}

/**
 * Resolve a league "PvP" match: build a seeded AI opponent formation and run
 * the FEAT-003 combat resolver. This is an OFFLINE simulation - no real player
 * is involved. Returns null when the player has no assembled squad.
 */
export function resolveLeagueMatch(playerTeam: Team, matchSeed: number): MatchOutcome | null {
  if (playerTeam.members.length === 0) return null;
  const enemy = matchOpponent(matchSeed);
  const battle = resolveBattle(playerTeam, enemy, matchSeed);
  return { win: battle.winner === 'attacker', battle };
}

/**
 * Advance the league to `nextPeriod`, returning the new state plus the
 * placement reward for the player's final rank in the ENDING period (computed
 * from `playerPower`). Wins/losses reset for the new period; `bestRank` keeps
 * the best (lowest) rank ever achieved. Pure.
 */
export function rolloverLeague(
  state: LeagueState,
  playerPower: number,
  nextPeriod: number,
): { state: LeagueState; rank: number; reward: RewardBundle } {
  const rank = playerRank(playerPower, state.period);
  const bestRank = state.bestRank === 0 ? rank : Math.min(state.bestRank, rank);
  return {
    state: {
      ...state,
      period: Math.max(0, Math.floor(nextPeriod)),
      wins: 0,
      losses: 0,
      bestRank,
    },
    rank,
    reward: rankReward(rank),
  };
}
