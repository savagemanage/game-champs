import { describe, it, expect } from 'vitest';
import { applyGate, formatGate, gateLabel, isGoodGate, generateGateRow } from './GateMath';
import { makeRng } from './Rng';
import { SQUAD } from '../config/GameConfig';

/**
 * Unit tests for the pure gate math: each operation, integer flooring and the
 * >= 0 clamp, label formatting, and the deterministic, always-survivable row
 * generator.
 */
describe('applyGate', () => {
  it('adds', () => {
    expect(applyGate(10, 'add', 5)).toBe(15);
  });

  it('multiplies and grows', () => {
    expect(applyGate(6, 'mul', 3)).toBe(18);
  });

  it('subtracts and clamps at zero (never negative)', () => {
    expect(applyGate(4, 'sub', 10)).toBe(0);
    expect(applyGate(4, 'sub', 10)).toBeGreaterThanOrEqual(SQUAD.MIN_SIZE);
  });

  it('divides with floor', () => {
    expect(applyGate(9, 'div', 2)).toBe(4); // 4.5 -> 4
    expect(applyGate(7, 'div', 3)).toBe(2); // 2.33 -> 2
  });

  it('treats a non-positive divisor as a no-op', () => {
    expect(applyGate(8, 'div', 0)).toBe(8);
  });

  it('clamps to the max squad size', () => {
    expect(applyGate(SQUAD.MAX_SIZE, 'mul', 3)).toBe(SQUAD.MAX_SIZE);
  });
});

describe('formatGate / gateLabel', () => {
  it('formats every operation', () => {
    expect(formatGate('add', 10)).toBe('+10');
    expect(formatGate('sub', 5)).toBe('-5');
    expect(formatGate('mul', 2)).toBe('x2');
    expect(formatGate('div', 2)).toBe('/2');
  });

  it('gateLabel formats a gate object', () => {
    expect(gateLabel({ op: 'add', value: 3, lane: 0 })).toBe('+3');
  });
});

describe('isGoodGate', () => {
  it('add and mul are good', () => {
    expect(isGoodGate(10, { op: 'add', value: 1, lane: 0 })).toBe(true);
    expect(isGoodGate(10, { op: 'mul', value: 2, lane: 0 })).toBe(true);
  });

  it('sub and div that shrink are bad', () => {
    expect(isGoodGate(10, { op: 'sub', value: 3, lane: 0 })).toBe(false);
    expect(isGoodGate(10, { op: 'div', value: 2, lane: 0 })).toBe(false);
  });
});

describe('generateGateRow', () => {
  it('is deterministic for the same seed and inputs', () => {
    const rowA = generateGateRow(makeRng(123), 10, 1);
    const rowB = generateGateRow(makeRng(123), 10, 1);
    expect(rowA).toEqual(rowB);
  });

  it('produces exactly two gates, one per lane', () => {
    const row = generateGateRow(makeRng(7), 20, 2);
    expect(row).toHaveLength(2);
    expect(row[0].lane).toBe(0);
    expect(row[1].lane).toBe(1);
  });

  it('always offers at least one non-catastrophic (non-shrinking) lane', () => {
    // Sweep many seeds at high difficulty; every row must have a safe choice.
    for (let seed = 0; seed < 500; seed++) {
      const row = generateGateRow(makeRng(seed), 12, 3);
      const safe = row.some((g) => isGoodGate(12, g));
      expect(safe, `row from seed ${seed} had no safe lane`).toBe(true);
    }
  });
});
