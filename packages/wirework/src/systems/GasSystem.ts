import { GAS } from '../config/PlayerConfig';

/**
 * Charge is consumed by firing the tether, reeling the wire, maintaining an
 * attachment, and dashing. It regenerates fastest while stable and more slowly
 * during release momentum. Actions must first check {@link canAfford}
 * and then {@link spend}; when the meter is empty those actions are blocked.
 *
 * The system is pure logic (no Phaser dependency) so it is trivially unit
 * testable and reusable. The HUD (FEAT-005) reads {@link current} / {@link max}
 * and {@link ratio} to draw the gauge.
 */
export class GasSystem {
  private _current: number;
  private readonly _max: number;
  /** Timestamp (ms) after which regen is allowed again. */
  private regenBlockedUntil = 0;

  constructor(start: number = GAS.START, max: number = GAS.MAX) {
    this._max = max;
    this._current = Math.min(start, max);
  }

  /** Current gas in the tank. */
  get current(): number {
    return this._current;
  }

  /** Maximum gas capacity. */
  get max(): number {
    return this._max;
  }

  /** Normalized fill level [0..1] for HUD gauges. */
  get ratio(): number {
    return this._max > 0 ? this._current / this._max : 0;
  }

  /** True when the tank is fully empty (no action can be paid for). */
  get isEmpty(): boolean {
    return this._current <= 0;
  }

  /** Whether there is enough gas to pay {@link cost}. */
  canAfford(cost: number): boolean {
    return this._current >= cost;
  }

  /**
   * Attempt to spend a one-off cost. Returns true and deducts if affordable,
   * otherwise returns false and changes nothing. Spending pauses regen briefly.
   */
  spend(cost: number, nowMs: number): boolean {
    if (cost <= 0) return true;
    if (!this.canAfford(cost)) return false;
    this._current = Math.max(0, this._current - cost);
    this.regenBlockedUntil = nowMs + GAS.REGEN_DELAY_MS;
    return true;
  }

  /**
   * Drain a continuous cost over a frame (cost-per-second * dt). Drains only as
   * much as is available and returns the fraction [0..1] actually paid so a
   * caller (e.g. reeling) can scale its effect when the tank runs dry.
   */
  drain(costPerSec: number, dtMs: number, nowMs: number): number {
    if (costPerSec <= 0) return 1;
    const want = costPerSec * (dtMs / 1000);
    if (want <= 0) return 1;
    const paid = Math.min(want, this._current);
    this._current = Math.max(0, this._current - paid);
    this.regenBlockedUntil = nowMs + GAS.REGEN_DELAY_MS;
    return want > 0 ? paid / want : 1;
  }

  /**
   * Advance regeneration for a frame. Call once per update AFTER any spending.
   * Regen is suppressed for {@link GAS.REGEN_DELAY_MS} after the last spend so
   * rapid action does not passively refill.
   */
  regen(grounded: boolean, dtMs: number, nowMs: number): void {
    if (nowMs < this.regenBlockedUntil) return;
    if (this._current >= this._max) return;
    const rate = grounded ? GAS.REGEN_GROUNDED_PER_SEC : GAS.REGEN_AIRBORNE_PER_SEC;
    this._current = Math.min(this._max, this._current + rate * (dtMs / 1000));
  }

  /** Refill to full (e.g. on respawn / new wave). */
  refill(): void {
    this._current = this._max;
  }
}
