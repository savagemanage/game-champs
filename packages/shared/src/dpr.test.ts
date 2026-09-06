import { describe, it, expect } from 'vitest';
import {
  clampDpr,
  computeBackbufferBudget,
  DEFAULT_MAX_DPR,
  DEFAULT_MAX_BACKBUFFER_PIXELS,
} from './dpr';

describe('clampDpr', () => {
  it('passes through a value within the cap', () => {
    expect(clampDpr(1)).toBe(1);
    expect(clampDpr(1.5)).toBe(1.5);
    expect(clampDpr(2)).toBe(2);
  });

  it('caps a hi-DPR phone at the max', () => {
    expect(clampDpr(3)).toBe(DEFAULT_MAX_DPR);
    expect(clampDpr(4)).toBe(2);
  });

  it('honors a custom max', () => {
    expect(clampDpr(3, 1.5)).toBe(1.5);
    expect(clampDpr(1, 1.5)).toBe(1);
  });

  it('falls back to 1 on non-finite / non-positive input', () => {
    expect(clampDpr(NaN)).toBe(1);
    expect(clampDpr(0)).toBe(1);
    expect(clampDpr(-2)).toBe(1);
  });
});

describe('computeBackbufferBudget', () => {
  it('returns the scale unchanged when the buffer fits the budget', () => {
    // 960*540*2*2 = ~2.07M px, under the default 4M budget.
    expect(computeBackbufferBudget(960, 540, 2)).toBe(2);
  });

  it('caps the scale so the pixel area stays within budget', () => {
    // At scale 3 the area is 960*540*9 = ~4.66M > 4M, so it must shrink.
    const capped = computeBackbufferBudget(960, 540, 3);
    expect(capped).toBeLessThan(3);
    const area = 960 * 540 * capped * capped;
    expect(area).toBeLessThanOrEqual(DEFAULT_MAX_BACKBUFFER_PIXELS + 1);
  });

  it('returns exactly the boundary scale for a tight budget', () => {
    // maxPixels chosen so sqrt(maxPixels / area) == 2 exactly.
    const maxPixels = 960 * 540 * 4;
    expect(computeBackbufferBudget(960, 540, 5, maxPixels)).toBeCloseTo(2, 6);
  });

  it('falls back to the input scale on degenerate inputs', () => {
    expect(computeBackbufferBudget(0, 540, 3)).toBe(3);
    expect(computeBackbufferBudget(960, 540, 3, NaN)).toBe(3);
    expect(computeBackbufferBudget(960, 540, NaN)).toBe(1);
  });
});
