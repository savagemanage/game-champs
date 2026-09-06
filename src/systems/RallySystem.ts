import { RALLY } from '../config/GameConfig';
import {
  RALLY_BOSSES,
  RALLY_BOSS_IDS,
  RALLY_REWARD_THRESHOLDS,
  isRallyBoss,
  rallyBoss,
  type RallyBossDef,
  type RallyReward,
} from '../config/RallyConfig';
import type { RallyBossState, RallyState } from '../types';

/** The result of ONE rally attempt against a world boss. */
export interface RallyAttemptResult {
  /** The boss id attempted. */
  bossId: string;
  /** Reason the attempt was rejected (only when `dealt` is 0 for a bad id). */
  reason?: 'unknown_boss';
  /** The player's own damage this attempt (before the alliance share). */
  playerDamage: number;
  /** The simulated alliance's deterministic damage contribution this attempt. */
  allianceDamage: number;
  /** Total damage landed this attempt (player + alliance, capped at remaining). */
  dealt: number;
  /** Boss HP remaining AFTER this attempt. */
  remaining: number;
  /** True when this attempt depleted the pool (a kill). */
  defeated: boolean;
  /** Reward tiers newly unlocked by this attempt (granted exactly once). */
  rewards: RallyReward[];
}

/** A fresh, un-attempted boss record. */
function freshBoss(): RallyBossState {
  return { damageDealt: 0, attempts: 0, defeated: false, tierClaimed: -1 };
}

/**
 * RallySystem - world-boss / Frostbeast rallies as PURE logic (no Phaser).
 *
 * Each boss owns a large HP pool (RallyConfig) depleted across REPEATED
 * attempts. On an attempt the player supplies their own damage; the system adds
 * a DETERMINISTIC simulated-alliance share (RALLY.ALLIANCE_DAMAGE_SHARE of the
 * player's damage — no Math.random, so a rally's progress is fully
 * reproducible), applies the total (capped at the remaining pool), and grants
 * any reward TIER whose cumulative-damage threshold was newly crossed — each
 * tier exactly once per cycle. When the pool hits 0 the boss is `defeated`.
 *
 * The system does NOT own the ResourceStore / wallet / roster; the caller
 * (GameState) applies the returned {@link RallyReward}s. Serializable via
 * toJSON / fromJSON.
 */
export class RallySystem {
  private readonly _bosses: Map<string, RallyBossState> = new Map();

  constructor(state?: RallyState) {
    if (state?.bosses) {
      for (const id of RALLY_BOSS_IDS) {
        const b = state.bosses[id];
        if (b) this._bosses.set(id, normalizeBoss(b));
      }
    }
  }

  private ensure(id: string): RallyBossState {
    let b = this._bosses.get(id);
    if (!b) {
      b = freshBoss();
      this._bosses.set(id, b);
    }
    return b;
  }

  /** Cumulative damage dealt to a boss this cycle (0 if un-attempted). */
  damageDealt(bossId: string): number {
    return this._bosses.get(bossId)?.damageDealt ?? 0;
  }

  /** Attempts made against a boss this cycle. */
  attempts(bossId: string): number {
    return this._bosses.get(bossId)?.attempts ?? 0;
  }

  /** Whether a boss has been defeated this cycle. */
  isDefeated(bossId: string): boolean {
    return this._bosses.get(bossId)?.defeated ?? false;
  }

  /** Boss HP remaining (full pool if un-attempted; 0 once defeated). */
  remaining(bossId: string): number {
    const boss = rallyBoss(bossId);
    if (!boss) return 0;
    return Math.max(0, boss.hpPool - this.damageDealt(bossId));
  }

  /** The fraction of a boss's HP pool destroyed so far (0..1). */
  progress(bossId: string): number {
    const boss = rallyBoss(bossId);
    if (!boss || boss.hpPool <= 0) return 0;
    return Math.min(1, this.damageDealt(bossId) / boss.hpPool);
  }

  /**
   * Perform ONE rally attempt against `bossId` with the player's `playerDamage`.
   * Adds the deterministic alliance share, applies the total (capped at the
   * remaining pool), advances the per-boss record, and returns any newly-earned
   * reward tiers (each tier granted once per cycle). Does NOT mutate any store —
   * the caller applies the rewards. Deterministic given the inputs + state.
   */
  attack(bossId: string, playerDamage: number): RallyAttemptResult {
    const boss = rallyBoss(bossId);
    if (!boss) {
      return {
        bossId,
        reason: 'unknown_boss',
        playerDamage: 0,
        allianceDamage: 0,
        dealt: 0,
        remaining: 0,
        defeated: false,
        rewards: [],
      };
    }

    const b = this.ensure(bossId);
    const player = Math.max(0, playerDamage);
    // Simulated alliance members pitch in a deterministic share of the player's
    // damage (no randomness), so repeated rallies reproduce exactly.
    const alliance = player * RALLY.ALLIANCE_DAMAGE_SHARE;
    const before = b.damageDealt;
    const remainingBefore = Math.max(0, boss.hpPool - before);
    const dealt = Math.min(player + alliance, remainingBefore);

    b.damageDealt = before + dealt;
    b.attempts += 1;
    const remaining = Math.max(0, boss.hpPool - b.damageDealt);
    if (remaining <= 0) b.defeated = true;

    // Grant any reward tier whose HP-fraction threshold the cumulative damage
    // now meets, but has not yet been claimed this cycle.
    const rewards = this.claimTiers(boss, b);

    return {
      bossId,
      playerDamage: player,
      allianceDamage: alliance,
      dealt,
      remaining,
      defeated: b.defeated,
      rewards,
    };
  }

  /**
   * Reset a boss for a fresh cycle (e.g. a new rally window): clears its damage,
   * attempts, kill flag, and claimed-tier marker so it can be fought again.
   */
  resetBoss(bossId: string): void {
    if (!isRallyBoss(bossId)) return;
    this._bosses.set(bossId, freshBoss());
  }

  /**
   * Grant any reward tier newly crossed by the boss's cumulative damage. Tiers
   * are ascending HP fractions (final = 1.0 kill); the per-boss `tierClaimed`
   * marks the highest already-granted tier so each pays out exactly once.
   */
  private claimTiers(boss: RallyBossDef, b: RallyBossState): RallyReward[] {
    const fraction = boss.hpPool > 0 ? b.damageDealt / boss.hpPool : 0;
    const earned: RallyReward[] = [];
    for (let i = 0; i < RALLY_REWARD_THRESHOLDS.length; i++) {
      if (i <= b.tierClaimed) continue;
      if (fraction + 1e-9 >= RALLY_REWARD_THRESHOLDS[i]) {
        const reward = boss.tierRewards[i];
        if (reward) earned.push(reward);
        b.tierClaimed = i;
      } else {
        break; // thresholds are ascending — stop at the first unmet tier.
      }
    }
    return earned;
  }

  /** All boss defs (config passthrough for UI convenience). */
  static bosses(): RallyBossDef[] {
    return RALLY_BOSSES;
  }

  /** Serialize to a plain {@link RallyState}. */
  toJSON(): RallyState {
    const bosses: RallyState['bosses'] = {};
    for (const [id, b] of this._bosses.entries()) bosses[id] = { ...b };
    return { bosses };
  }

  /**
   * Restore from a persisted {@link RallyState}. A missing / malformed value
   * yields fresh (un-attempted) rallies so old saves load without crashing.
   */
  static fromJSON(data: RallyState | undefined | null): RallySystem {
    if (!data || typeof data !== 'object') return new RallySystem();
    return new RallySystem(data);
  }
}

/** Coerce a persisted boss record into a valid, clamped {@link RallyBossState}. */
function normalizeBoss(b: RallyBossState): RallyBossState {
  return {
    damageDealt: Math.max(0, b.damageDealt ?? 0),
    attempts: Math.max(0, Math.floor(b.attempts ?? 0)),
    defeated: Boolean(b.defeated),
    tierClaimed: Math.max(-1, Math.floor(b.tierClaimed ?? -1)),
  };
}
