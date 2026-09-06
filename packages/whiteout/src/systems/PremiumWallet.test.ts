import { describe, it, expect } from 'vitest';
import { PremiumWallet } from './PremiumWallet';
import { PREMIUM } from '../config/GameConfig';

/**
 * Unit tests for the Ember Sparks premium wallet: starting balance, atomic
 * spend, grant, the lit-Furnace passive drip, and serialize round-trip.
 */
describe('PremiumWallet', () => {
  it('starts from PREMIUM.START_SPARKS', () => {
    expect(new PremiumWallet().sparks).toBe(PREMIUM.START_SPARKS);
    expect(new PremiumWallet(25).sparks).toBe(25);
  });

  it('spend is atomic and refuses when short', () => {
    const w = new PremiumWallet(10);
    expect(w.spend(11)).toBe(false);
    expect(w.sparks).toBe(10);
    expect(w.spend(6)).toBe(true);
    expect(w.sparks).toBe(4);
    // Zero / negative spends are no-ops that succeed.
    expect(w.spend(0)).toBe(true);
    expect(w.sparks).toBe(4);
  });

  it('grant adds sparks (ignoring non-positive amounts)', () => {
    const w = new PremiumWallet(0);
    w.grant(5);
    w.grant(-3);
    expect(w.sparks).toBe(5);
  });

  it('drips passive sparks only while the Furnace is lit', () => {
    const w = new PremiumWallet(0);
    // Furnace level 0 (unlit) -> no drip.
    expect(w.drip(10_000, 0)).toBe(0);
    expect(w.sparks).toBe(0);
    // Lit furnace drips at the configured rate, scaled by efficiency.
    const gained = w.drip(10_000, 1);
    expect(gained).toBeCloseTo(PREMIUM.SPARK_DRIP_PER_SEC * 10, 6);
    expect(w.sparks).toBeCloseTo(gained, 6);
    // Offline efficiency scaling.
    const before = w.sparks;
    const scaled = w.drip(10_000, 1, 0.5);
    expect(scaled).toBeCloseTo(PREMIUM.SPARK_DRIP_PER_SEC * 10 * 0.5, 6);
    expect(w.sparks).toBeCloseTo(before + scaled, 6);
  });

  it('round-trips through toJSON / fromJSON with graceful fallback', () => {
    const w = new PremiumWallet(123.5);
    expect(PremiumWallet.fromJSON(w.toJSON()).sparks).toBe(123.5);
    // Missing / non-finite values yield the fresh start.
    expect(PremiumWallet.fromJSON(undefined).sparks).toBe(PREMIUM.START_SPARKS);
    expect(PremiumWallet.fromJSON(null).sparks).toBe(PREMIUM.START_SPARKS);
    expect(PremiumWallet.fromJSON(NaN).sparks).toBe(PREMIUM.START_SPARKS);
  });
});
