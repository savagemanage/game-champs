import { CAMPAIGN } from '../config/GameConfig';
import {
  CAMPAIGN_STAGES,
  TOTAL_STAGES,
  stageById,
  stageByOrder,
  stageRequiredPower,
  type StageDef,
} from '../config/CampaignConfig';
import type { CampaignState } from '../types';

/** The result of attempting a campaign stage. */
export interface CampaignAttemptResult {
  /** The stage id attempted. */
  stageId: string;
  /** True when the stage was cleared (met the required power + was unlocked). */
  win: boolean;
  /** True when this was the FIRST clear (so first-clear rewards apply). */
  firstClear: boolean;
  /** Reason the attempt was rejected (only set when `win` is false). */
  reason?: 'locked' | 'insufficient_power' | 'unknown_stage';
  /** The stage's required power (for UI / debugging). */
  requiredPower: number;
  /** The army power the attempt brought. */
  attemptPower: number;
  /** The first-clear reward to grant (only present on a first clear). */
  reward?: StageDef['reward'];
}

/**
 * CampaignSystem - the staged story/exploration progression as PURE logic.
 *
 * No Phaser import. It tracks the HIGHEST cleared stage order and the set of
 * stages whose first-clear reward has been granted, and validates an attempt
 * deterministically:
 *   - a stage is UNLOCKED iff its order <= highestCleared + 1 (sequential gate),
 *   - a stage CLEARS iff the attempt's army power meets the stage's required
 *     power (from the shared CombatSystem enemy-power model in CampaignConfig)
 *     scaled by CAMPAIGN.CLEAR_POWER_MARGIN,
 *   - the first clear yields the stage's reward exactly ONCE (subsequent clears
 *     re-validate and can be replayed for practice but grant nothing).
 *
 * The system does not own the ResourceStore / PremiumWallet / HeroRoster; the
 * caller (GameState) applies the returned reward, keeping this decoupled and
 * testable. Serializable via toJSON / fromJSON.
 */
export class CampaignSystem {
  private _highestCleared: number;
  private readonly _claimed: Set<string>;

  constructor(state?: CampaignState) {
    this._highestCleared = state ? Math.max(0, Math.floor(state.highestCleared ?? 0)) : 0;
    this._claimed = new Set(state?.claimed ?? []);
    // Clamp to a valid range in case a save over-reports.
    if (this._highestCleared > TOTAL_STAGES) this._highestCleared = TOTAL_STAGES;
  }

  /** The highest stage ORDER cleared (0 = nothing cleared). */
  get highestCleared(): number {
    return this._highestCleared;
  }

  /** Stage ids whose first-clear reward has been granted (a copy). */
  get claimed(): string[] {
    return [...this._claimed];
  }

  /** Whether a stage's first-clear reward has already been granted. */
  isClaimed(stageId: string): boolean {
    return this._claimed.has(stageId);
  }

  /**
   * Whether a stage is UNLOCKED (attemptable): sequential gate on the highest
   * cleared order. Unknown stage ids are never unlocked.
   */
  isUnlocked(stageId: string): boolean {
    const stage = stageById(stageId);
    if (!stage) return false;
    return stage.order <= this._highestCleared + 1;
  }

  /** Whether a stage has been cleared at least once. */
  isCleared(stageId: string): boolean {
    const stage = stageById(stageId);
    if (!stage) return false;
    return stage.order <= this._highestCleared;
  }

  /** The next stage to attempt (undefined once the campaign is complete). */
  nextStage(): StageDef | undefined {
    return stageByOrder(this._highestCleared + 1);
  }

  /**
   * Attempt a stage with a given army power. Deterministic: the outcome is a
   * pure function of `(stageId, armyPower, current progress)`. On a first clear
   * it advances progress, marks the reward claimed, and returns the reward for
   * the caller to grant. A replay of an already-cleared stage re-validates but
   * grants nothing (firstClear = false, no reward).
   */
  attempt(stageId: string, armyPower: number): CampaignAttemptResult {
    const stage = stageById(stageId);
    const requiredPower = stage ? stageRequiredPower(stageId) : 0;
    const attemptPower = Math.max(0, armyPower);

    if (!stage) {
      return { stageId, win: false, firstClear: false, reason: 'unknown_stage', requiredPower, attemptPower };
    }
    if (!this.isUnlocked(stageId)) {
      return { stageId, win: false, firstClear: false, reason: 'locked', requiredPower, attemptPower };
    }
    const needed = requiredPower * CAMPAIGN.CLEAR_POWER_MARGIN;
    if (attemptPower < needed) {
      return {
        stageId,
        win: false,
        firstClear: false,
        reason: 'insufficient_power',
        requiredPower,
        attemptPower,
      };
    }

    // Cleared. Determine first-clear (reward-once) semantics.
    const firstClear = !this._claimed.has(stageId);
    if (firstClear) {
      this._claimed.add(stageId);
      if (stage.order > this._highestCleared) this._highestCleared = stage.order;
    }
    return {
      stageId,
      win: true,
      firstClear,
      requiredPower,
      attemptPower,
      reward: firstClear ? stage.reward : undefined,
    };
  }

  /** Whether the whole campaign has been cleared. */
  get complete(): boolean {
    return this._highestCleared >= TOTAL_STAGES;
  }

  /** Total stages in the campaign (mirrors config). */
  get totalStages(): number {
    return TOTAL_STAGES;
  }

  /** All stage defs (config passthrough for UI convenience). */
  static stages(): StageDef[] {
    return CAMPAIGN_STAGES;
  }

  /** Serialize to a plain {@link CampaignState}. */
  toJSON(): CampaignState {
    return { highestCleared: this._highestCleared, claimed: [...this._claimed] };
  }

  /**
   * Restore from a persisted {@link CampaignState}. A missing / malformed value
   * yields fresh progress (nothing cleared) so old saves load without crashing.
   */
  static fromJSON(data: CampaignState | undefined | null): CampaignSystem {
    if (!data || typeof data !== 'object') return new CampaignSystem();
    return new CampaignSystem(data);
  }
}
