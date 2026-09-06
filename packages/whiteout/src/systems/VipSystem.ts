import { VIP } from '../config/GameConfig';
import { levelForPoints, pointsForLevel, vipModifiers } from '../config/VipConfig';
import type { StatModifiers, VipState } from '../types';

/**
 * VipSystem - the VIP progression as PURE logic (no Phaser).
 *
 * VIP points accumulate (monotonically) from spending / activity; the total
 * maps to a VIP LEVEL via the geometric threshold curve in VipConfig, and each
 * level grants a permanent QoL / stat bonus expressed as the shared
 * {@link StatModifiers} bundle. GameState folds {@link modifiers} into its
 * combined bundle so VIP always helps idle output + build speed.
 *
 * Serializable via toJSON / fromJSON.
 */
export class VipSystem {
  private _points: number;

  constructor(state?: VipState) {
    this._points = state ? Math.max(0, state.points ?? 0) : 0;
  }

  /** Total accumulated VIP points. */
  get points(): number {
    return this._points;
  }

  /** The current VIP level the accumulated points earn. */
  get level(): number {
    return levelForPoints(this._points);
  }

  /** The maximum VIP level attainable. */
  get maxLevel(): number {
    return VIP.MAX_LEVEL;
  }

  /** Cumulative points needed to REACH the next level (0 once at max). */
  pointsToNextLevel(): number {
    const next = this.level + 1;
    if (next > VIP.MAX_LEVEL) return 0;
    return Math.max(0, pointsForLevel(next) - this._points);
  }

  /**
   * Add `amount` VIP points (from spending / activity). Monotonic; raises the
   * level when a threshold is crossed. Returns the level AFTER the addition.
   */
  addPoints(amount: number): number {
    if (amount > 0) this._points += amount;
    return this.level;
  }

  /**
   * The permanent StatModifiers bonus from the current VIP level, folded into
   * GameState's combined bundle so VIP measurably helps the hold.
   */
  modifiers(): StatModifiers {
    return vipModifiers(this.level);
  }

  /** Serialize to a plain {@link VipState}. */
  toJSON(): VipState {
    return { points: this._points };
  }

  /**
   * Restore from a persisted {@link VipState}. A missing / malformed value
   * yields a fresh VIP state (0 points, level 0) so old saves load gracefully.
   */
  static fromJSON(data: VipState | undefined | null): VipSystem {
    if (!data || typeof data !== 'object') return new VipSystem();
    return new VipSystem(data);
  }
}
