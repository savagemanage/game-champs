import { ARENA } from '../config/GameConfig';
import { mulberry32 } from './SummonSystem';
import type { ArenaState } from '../types';

/** The result of one arena (simulated PvP) match. */
export interface ArenaMatchResult {
  /** True when the player's power beat the generated opponent's. */
  win: boolean;
  /** The player power brought to the match. */
  playerPower: number;
  /** The opponent's deterministically-generated power profile. */
  opponentPower: number;
  /** The player's rank BEFORE the match. */
  rankBefore: number;
  /** The player's rank AFTER the match (lower = better). */
  rankAfter: number;
  /** Ember Sparks awarded (0 on a loss). */
  sparks: number;
}

/**
 * ArenaSystem - a simulated PvP ladder as PURE logic (no Phaser, no servers).
 *
 * The player holds a `rank` (1 = champion; larger numbers are worse) on an NPC
 * ladder. Each match generates an opponent power profile DETERMINISTICALLY from
 * the current rank + a persisted seed (seeded PRNG, no Math.random): a base
 * power that scales up as the rank improves, plus a bounded +/- variance drawn
 * from the seed. A battle-power comparison decides win/loss — the caller passes
 * the hold's combat power (from GameState, itself derived from CombatSystem +
 * modifiers). On a win the player climbs and earns Ember Sparks (scaled by how
 * high the rank is); on a loss they slip. The seed advances each match so
 * rematches vary but stay reproducible.
 *
 * The system does NOT own the wallet; the caller applies the returned `sparks`.
 * Serializable via toJSON / fromJSON.
 */
export class ArenaSystem {
  private _rank: number;
  private _wins: number;
  private _losses: number;
  private _seed: number;

  constructor(state?: ArenaState) {
    this._rank = state ? clampRank(state.rank ?? ARENA.START_RANK) : ARENA.START_RANK;
    this._wins = state ? Math.max(0, Math.floor(state.wins ?? 0)) : 0;
    this._losses = state ? Math.max(0, Math.floor(state.losses ?? 0)) : 0;
    this._seed = state && Number.isFinite(state.seed) ? state.seed >>> 0 : 1;
  }

  /** Current ladder rank (1 = champion; larger = lower). */
  get rank(): number {
    return this._rank;
  }

  /** Total arena matches won. */
  get wins(): number {
    return this._wins;
  }

  /** Total arena matches lost. */
  get losses(): number {
    return this._losses;
  }

  /**
   * The opponent power the player would face right now, generated
   * DETERMINISTICALLY from the current rank + seed. Exposed (without mutating
   * state) so UI can preview the next match. Higher ranks field stronger
   * opponents; a bounded variance from the seed keeps rematches from being
   * identical while staying reproducible.
   */
  previewOpponentPower(): number {
    return ArenaSystem.opponentPowerFor(this._rank, this._seed);
  }

  /**
   * Resolve ONE match with the player's `playerPower`. Deterministic given
   * `(rank, seed, playerPower)`: generates the opponent, compares power, adjusts
   * rank, tallies the win/loss, advances the seed, and returns the outcome +
   * any Ember Sparks earned (the caller credits the wallet). A tie counts as a
   * win for the challenger (>= comparison), mirroring the combat resolver.
   */
  fight(playerPower: number): ArenaMatchResult {
    const rankBefore = this._rank;
    const opponentPower = ArenaSystem.opponentPowerFor(rankBefore, this._seed);
    const player = Math.max(0, playerPower);
    const win = player >= opponentPower && player > 0;

    if (win) {
      this._wins += 1;
      this._rank = clampRank(this._rank - ARENA.RANK_GAIN_PER_WIN);
    } else {
      this._losses += 1;
      this._rank = clampRank(this._rank + ARENA.RANK_LOSS_PER_LOSS);
    }

    // Advance the seed deterministically so the next match differs but replays
    // identically from a given saved state.
    this._seed = (Math.imul(this._seed || 1, 1664525) + 1013904223) >>> 0;

    // A win higher up the ladder is worth more Ember Sparks.
    const sparks = win ? ArenaSystem.winSparksFor(rankBefore) : 0;

    return {
      win,
      playerPower: player,
      opponentPower,
      rankBefore,
      rankAfter: this._rank,
      sparks,
    };
  }

  /**
   * The deterministic opponent power for a given rank + seed: a base that grows
   * as the rank improves toward the top, jittered by a bounded variance drawn
   * from the seed. Pure (seeded PRNG only) so callers/tests share one definition.
   */
  static opponentPowerFor(rank: number, seed: number): number {
    const r = clampRank(rank);
    // Ranks climbed from the worst rank toward the top (0 at START_RANK).
    const climbed = ARENA.START_RANK - r;
    const base = ARENA.BASE_OPPONENT_POWER * Math.pow(ARENA.RANK_POWER_GROWTH, Math.max(0, climbed));
    // Bounded +/- variance from the seed (deterministic).
    const rng = mulberry32((seed >>> 0) ^ (r * 2654435761));
    const jitter = (rng() * 2 - 1) * ARENA.POWER_VARIANCE; // in [-VARIANCE, +VARIANCE]
    return Math.max(1, base * (1 + jitter));
  }

  /** Ember Sparks a win at a given rank is worth (more the higher the rank). */
  static winSparksFor(rank: number): number {
    const r = clampRank(rank);
    const climbed = ARENA.START_RANK - r;
    return Math.round(ARENA.WIN_SPARKS_BASE * (1 + climbed / ARENA.START_RANK));
  }

  /** Serialize to a plain {@link ArenaState}. */
  toJSON(): ArenaState {
    return { rank: this._rank, wins: this._wins, losses: this._losses, seed: this._seed >>> 0 };
  }

  /**
   * Restore from a persisted {@link ArenaState}. A missing / malformed value
   * yields a fresh ladder (start rank, no record) so old saves load gracefully.
   */
  static fromJSON(data: ArenaState | undefined | null): ArenaSystem {
    if (!data || typeof data !== 'object') return new ArenaSystem();
    return new ArenaSystem(data);
  }
}

/** Clamp a rank into the valid [TOP_RANK, START_RANK] range (integer). */
function clampRank(rank: number): number {
  return Math.min(ARENA.START_RANK, Math.max(ARENA.TOP_RANK, Math.floor(rank)));
}
