import { PREMIUM } from '../config/GameConfig';

/**
 * PremiumWallet - the Ember Sparks soft-premium currency as PURE logic.
 *
 * Ember Sparks are an ORIGINAL stand-in for a gacha/premium gem. They are NOT
 * an idle resource, so they live outside ResourceStore / RESOURCE_ORDER in
 * their own single-scalar wallet: a later feature spends them on summons and
 * boosts. The only passive source in FEAT-002 is a slow drip from the lit
 * Furnace (see {@link drip}), reconciled over the offline window like other
 * production. Serializable via toJSON / fromJSON (a bare number).
 */
export class PremiumWallet {
  private _sparks: number;

  constructor(initial: number = PREMIUM.START_SPARKS) {
    this._sparks = Number.isFinite(initial) ? Math.max(0, initial) : PREMIUM.START_SPARKS;
  }

  /** Current Ember Sparks balance. */
  get sparks(): number {
    return this._sparks;
  }

  /** Whether the wallet can pay `amount` sparks. */
  canAfford(amount: number): boolean {
    return amount <= this._sparks;
  }

  /** Spend sparks atomically; returns true only if affordable. */
  spend(amount: number): boolean {
    if (amount <= 0) return true;
    if (!this.canAfford(amount)) return false;
    this._sparks -= amount;
    return true;
  }

  /** Grant sparks (rewards, purchases). Negative parts are ignored. */
  grant(amount: number): void {
    if (amount > 0) this._sparks += amount;
  }

  /**
   * Drip passive Ember Sparks over an elapsed time while the Furnace is lit
   * (furnaceLevel >= 1). `dtMs` is elapsed milliseconds; `efficiency` scales the
   * gain (1 live, ECONOMY.OFFLINE_EFFICIENCY offline). Returns the amount added.
   */
  drip(dtMs: number, furnaceLevel: number, efficiency = 1): number {
    if (dtMs <= 0 || efficiency <= 0 || furnaceLevel < 1) return 0;
    const gained = PREMIUM.SPARK_DRIP_PER_SEC * (dtMs / 1000) * efficiency;
    if (gained <= 0) return 0;
    this._sparks += gained;
    return gained;
  }

  /** Serialize to a bare number for the save layer. */
  toJSON(): number {
    return this._sparks;
  }

  /** Restore from a persisted value; missing / non-finite yields the fresh start. */
  static fromJSON(data: number | undefined | null): PremiumWallet {
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      return new PremiumWallet();
    }
    return new PremiumWallet(data);
  }
}
