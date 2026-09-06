import { describe, it, expect } from 'vitest';
import {
  resolveRenderScale,
  resolveRenderPlan,
  MIN_RENDER_SCALE,
  MAX_RENDER_SCALE,
} from './renderScale';

/**
 * Pure-logic tests for the crisp-text render-scale helper (FEAT-002), in the
 * existing Phaser-free vitest style. These lock in the backbuffer/camera math
 * that keeps UI text rasterized at device pixels while preserving the 960x540
 * logical coordinate system.
 */
describe('resolveRenderScale()', () => {
  it('returns 1 on a standard 1x (non-HiDPI) display', () => {
    expect(resolveRenderScale(1)).toBe(1);
  });

  it('returns 2 on a 2x (retina / deviceScaleFactor 2) display', () => {
    expect(resolveRenderScale(2)).toBe(2);
  });

  it('rounds fractional device pixel ratios to a whole number', () => {
    // A whole-number scale keeps the camera zoom integer so roundPixels stays
    // exact for pixel-art sprites.
    expect(resolveRenderScale(1.5)).toBe(2);
    expect(resolveRenderScale(1.25)).toBe(1);
    expect(resolveRenderScale(2.75)).toBe(3);
  });

  it('never renders below the logical size (floors at MIN_RENDER_SCALE)', () => {
    expect(resolveRenderScale(0)).toBe(MIN_RENDER_SCALE);
    expect(resolveRenderScale(0.5)).toBe(MIN_RENDER_SCALE);
    expect(resolveRenderScale(-4)).toBe(MIN_RENDER_SCALE);
  });

  it('caps very high DPRs at MAX_RENDER_SCALE to bound the backbuffer', () => {
    expect(resolveRenderScale(4)).toBe(MAX_RENDER_SCALE);
    expect(resolveRenderScale(8)).toBe(MAX_RENDER_SCALE);
  });

  it('treats non-finite input as a safe 1x fallback', () => {
    // NaN / Infinity are not finite, so they fall back to 1x rather than being
    // clamped to MAX (an infinite backbuffer would be catastrophic).
    expect(resolveRenderScale(Number.NaN)).toBe(1);
    expect(resolveRenderScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('resolveRenderPlan()', () => {
  it('sizes the backbuffer to logical size * scale at 2x', () => {
    const plan = resolveRenderPlan(960, 540, 2);
    expect(plan.scale).toBe(2);
    expect(plan.bufferWidth).toBe(1920);
    expect(plan.bufferHeight).toBe(1080);
  });

  it('is a 1:1 buffer with no camera offset at 1x', () => {
    const plan = resolveRenderPlan(960, 540, 1);
    expect(plan.bufferWidth).toBe(960);
    expect(plan.bufferHeight).toBe(540);
    expect(plan.scrollX).toBe(0);
    expect(plan.scrollY).toBe(0);
  });

  it('anchors the zoomed camera so logical (0,0) is the top-left', () => {
    // At 2x the zoomed camera would otherwise centre a 960x540 world window on
    // the 1920x1080 buffer midpoint; the scroll re-anchors it to (0,0).
    const plan = resolveRenderPlan(960, 540, 2);
    expect(plan.scrollX).toBe(-480);
    expect(plan.scrollY).toBe(-270);
  });

  it('keeps the world window exactly logical-sized under the camera zoom', () => {
    // Phaser camera worldView width = bufferWidth / zoom; with zoom === scale
    // that must equal the logical width regardless of the chosen scale.
    for (const dpr of [1, 2, 3, 4]) {
      const plan = resolveRenderPlan(960, 540, dpr);
      expect(plan.bufferWidth / plan.scale).toBe(960);
      expect(plan.bufferHeight / plan.scale).toBe(540);
    }
  });
});
