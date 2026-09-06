import { describe, it, expect } from 'vitest';
import { GasSystem } from './GasSystem';
import { GAS } from '../config/PlayerConfig';

/**
 * Unit tests for the pure gas economy. These assert the spend/drain/regen and
 * regen-delay behaviour so a regression in the resource rules is caught without
 * a browser. Each test would fail if the corresponding logic were broken.
 */
describe('GasSystem', () => {
  it('starts clamped to max and reports ratio', () => {
    const gas = new GasSystem(200, 100);
    expect(gas.current).toBe(100);
    expect(gas.max).toBe(100);
    expect(gas.ratio).toBe(1);
    expect(gas.isEmpty).toBe(false);
  });

  it('spends only when affordable and blocks otherwise', () => {
    const gas = new GasSystem(10, 100);
    expect(gas.canAfford(8)).toBe(true);
    expect(gas.spend(8, 0)).toBe(true);
    expect(gas.current).toBe(2);
    // Now too poor to pay 8: spend must fail and leave the tank untouched.
    expect(gas.spend(8, 0)).toBe(false);
    expect(gas.current).toBe(2);
  });

  it('drain returns the fraction actually paid when the tank runs dry', () => {
    const gas = new GasSystem(5, 100);
    // Want 10/sec for 1s = 10 units, only 5 available -> pays half.
    const paid = gas.drain(10, 1000, 0);
    expect(paid).toBeCloseTo(0.5, 5);
    expect(gas.current).toBe(0);
    expect(gas.isEmpty).toBe(true);
  });

  it('suppresses regen for REGEN_DELAY_MS after a spend, then refills', () => {
    const gas = new GasSystem(50, 100);
    gas.spend(10, 0); // -> 40, regen blocked until REGEN_DELAY_MS
    expect(gas.current).toBe(40);

    // Within the delay window: regen is a no-op.
    gas.regen(true, 1000, GAS.REGEN_DELAY_MS - 1);
    expect(gas.current).toBe(40);

    // After the delay: grounded regen adds rate * dt.
    gas.regen(true, 1000, GAS.REGEN_DELAY_MS + 10);
    expect(gas.current).toBeCloseTo(40 + GAS.REGEN_GROUNDED_PER_SEC, 5);
  });

  it('never regenerates past max', () => {
    const gas = new GasSystem(95, 100);
    gas.regen(true, 1000, 10_000); // grounded, well past any delay
    expect(gas.current).toBe(100);
  });
});
