import { describe, it, expect } from 'vitest';
import {
  resolveRenderScale,
  resolveRenderPlan,
  MIN_RENDER_SCALE,
  MAX_RENDER_SCALE,
} from './renderScale';

/**
 * Pure-logic tests for the crisp-text render-scale helper, in the existing
 * Phaser-free vitest style. These lock in the backbuffer/camera math that keeps
 * UI text rasterized at DISPLAY resolution while preserving the 960x540 logical
 * coordinate system.
 *
 * The scale is now derived from BOTH the device pixel ratio AND the displayed
 * (CSS) size relative to the logical size, because the on-screen magnification
 * of a canvas is `dpr * (displayCss / logical)`, not just dpr. This is the fix
 * for the confirmed live bug: at dpr=1 with the 960x540 canvas stretched to a
 * 1920x1080 window, the buffer must be 2x (1920x1080), not 1x.
 */
const LW = 960;
const LH = 540;

describe('resolveRenderScale()', () => {
  it('is 1 when the canvas is displayed at logical size on a 1x display', () => {
    expect(resolveRenderScale(LW, LH, 960, 540, 1)).toBe(1);
  });

  it('is 2 when a 1x display stretches the canvas to 2x its logical size (the live bug)', () => {
    // dpr=1 desktop, canvas CSS-scaled up to fill a 1920x1080 window: the old
    // DPR-only logic left this at 1x (blurry). It must now be 2x.
    expect(resolveRenderScale(LW, LH, 1920, 1080, 1)).toBe(2);
  });

  it('is 2 when a 2x display shows the canvas at logical size (retina, no stretch)', () => {
    expect(resolveRenderScale(LW, LH, 960, 540, 2)).toBe(2);
  });

  it('multiplies DPR and the CSS-stretch ratio together', () => {
    // dpr 2 AND stretched 2x on screen => 4x physical pixels.
    expect(resolveRenderScale(LW, LH, 1920, 1080, 2)).toBe(4);
  });

  it('rounds a fractional required ratio UP so the buffer is never below display resolution', () => {
    // 1.5x display stretch at dpr 1 => needs 1.5x; rounding DOWN would let the
    // browser upscale and re-blur, so we round up to 2.
    expect(resolveRenderScale(LW, LH, 1440, 810, 1)).toBe(2);
    // Just over logical size still bumps to 2 (never leave a residual upscale).
    expect(resolveRenderScale(LW, LH, 1000, 563, 1)).toBe(2);
  });

  it('takes the larger axis ratio so neither axis is ever under-sampled', () => {
    // A very wide (letterboxed) window: width ratio 3x, height ratio ~1x.
    expect(resolveRenderScale(LW, LH, 2880, 600, 1)).toBe(3);
  });

  it('never renders below the logical size (floors at MIN_RENDER_SCALE)', () => {
    // Canvas shown SMALLER than logical (tiny window) still gets a 1:1 buffer.
    expect(resolveRenderScale(LW, LH, 480, 270, 1)).toBe(MIN_RENDER_SCALE);
    expect(resolveRenderScale(LW, LH, 960, 540, 0.5)).toBe(MIN_RENDER_SCALE);
  });

  it('caps a huge 4K window at MAX_RENDER_SCALE to bound the backbuffer', () => {
    // 3840x2160 at dpr 1 needs 4x (2160/540); clamped to MAX (also 4 here).
    expect(resolveRenderScale(LW, LH, 3840, 2160, 1)).toBe(MAX_RENDER_SCALE);
    // A 4K window on a 2x display would want 8x; clamp protects memory.
    expect(resolveRenderScale(LW, LH, 3840, 2160, 2)).toBe(MAX_RENDER_SCALE);
  });

  it('keeps a dpr=1 1080p window well under the cap so its text is sharp', () => {
    // Regression guard: the OLD MAX_RENDER_SCALE=3-keyed-on-DPR was the bug's
    // accomplice. 1080p needs 2x, comfortably below the cap.
    const scale = resolveRenderScale(LW, LH, 1920, 1080, 1);
    expect(scale).toBe(2);
    expect(scale).toBeLessThan(MAX_RENDER_SCALE);
  });

  it('treats a non-finite / non-positive dpr as a safe 1x fallback', () => {
    expect(resolveRenderScale(LW, LH, 960, 540, Number.NaN)).toBe(1);
    expect(resolveRenderScale(LW, LH, 960, 540, Number.POSITIVE_INFINITY)).toBe(1);
    expect(resolveRenderScale(LW, LH, 960, 540, 0)).toBe(1);
    expect(resolveRenderScale(LW, LH, 960, 540, -3)).toBe(1);
  });

  it('falls back to 1x when the display or logical size cannot be measured', () => {
    // Degenerate inputs must NOT explode the buffer (0 / NaN sizes).
    expect(resolveRenderScale(LW, LH, 0, 0, 1)).toBe(MIN_RENDER_SCALE);
    expect(resolveRenderScale(LW, LH, Number.NaN, Number.NaN, 2)).toBe(MIN_RENDER_SCALE);
    expect(resolveRenderScale(0, 0, 1920, 1080, 2)).toBe(MIN_RENDER_SCALE);
  });

  it('uses the still-valid axis when only ONE display dimension is degenerate', () => {
    // Width is non-finite (ignored) but height is a valid 1080 => 1080/540 = 2x.
    // We must not collapse to 1x just because one axis could not be measured.
    expect(resolveRenderScale(LW, LH, Number.POSITIVE_INFINITY, 1080, 1)).toBe(2);
    expect(resolveRenderScale(LW, LH, 1920, 0, 1)).toBe(2);
  });
});

describe('resolveRenderPlan()', () => {
  it('sizes the backbuffer to logical size * scale for a dpr=1 1080p window', () => {
    // THE live repro: dpr=1, 960x540 canvas stretched to a 1920x1080 window.
    const plan = resolveRenderPlan(LW, LH, 1920, 1080, 1);
    expect(plan.scale).toBe(2);
    expect(plan.bufferWidth).toBe(1920);
    expect(plan.bufferHeight).toBe(1080);
  });

  it('is a 1:1 buffer with no camera offset when displayed at logical size on 1x', () => {
    const plan = resolveRenderPlan(LW, LH, 960, 540, 1);
    expect(plan.bufferWidth).toBe(960);
    expect(plan.bufferHeight).toBe(540);
    expect(plan.scrollX).toBe(0);
    expect(plan.scrollY).toBe(0);
  });

  it('anchors the zoomed camera so logical (0,0) is the top-left', () => {
    // At 2x the zoomed camera would otherwise centre a 960x540 world window on
    // the 1920x1080 buffer midpoint; the scroll re-anchors it to (0,0).
    const plan = resolveRenderPlan(LW, LH, 1920, 1080, 1);
    expect(plan.scrollX).toBe(-480);
    expect(plan.scrollY).toBe(-270);
  });

  it('keeps the world window exactly logical-sized under the camera zoom', () => {
    // Phaser camera worldView width = bufferWidth / zoom; with zoom === scale
    // that must equal the logical width regardless of the chosen scale.
    const cases: Array<[number, number, number]> = [
      [960, 540, 1],
      [1920, 1080, 1],
      [1920, 1080, 2],
      [3840, 2160, 1],
    ];
    for (const [cw, ch, dpr] of cases) {
      const plan = resolveRenderPlan(LW, LH, cw, ch, dpr);
      expect(plan.bufferWidth / plan.scale).toBe(960);
      expect(plan.bufferHeight / plan.scale).toBe(540);
    }
  });

  it('recomputes to a larger buffer when the window grows (resize handling)', () => {
    const small = resolveRenderPlan(LW, LH, 960, 540, 1);
    const large = resolveRenderPlan(LW, LH, 1920, 1080, 1);
    expect(large.bufferWidth).toBeGreaterThan(small.bufferWidth);
    expect(large.scale).toBeGreaterThan(small.scale);
    // ...and back down when it shrinks again.
    const shrunk = resolveRenderPlan(LW, LH, 640, 360, 1);
    expect(shrunk.scale).toBe(MIN_RENDER_SCALE);
  });
});
