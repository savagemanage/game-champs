import { describe, it, expect } from 'vitest';
import {
  resolveRenderScale,
  resolveRenderPlan,
  resolveRenderZoom,
  resolveFillSize,
  resolveFillPlan,
  resolveViewportPlan,
  resolveVisibleWorldRect,
  MIN_RENDER_SCALE,
  MAX_RENDER_SCALE,
} from './responsive';

describe('resolveRenderScale', () => {
  it('returns a whole number', () => {
    const scale = resolveRenderScale(960, 540, 1920, 1080, 1);
    expect(Number.isInteger(scale)).toBe(true);
  });

  it('rounds UP the display-vs-logical ratio (never below display resolution)', () => {
    // 1440 CSS px across 960 logical = 1.5x; dpr 1 -> ratio 1.5 -> ceil 2.
    expect(resolveRenderScale(960, 540, 1440, 810, 1)).toBe(2);
  });

  it('factors in devicePixelRatio (dpr multiplies the ratio)', () => {
    // 960 displayed at logical size but dpr 2 -> ratio 2.
    expect(resolveRenderScale(960, 540, 960, 540, 2)).toBe(2);
  });

  it('takes the larger of the two axis ratios', () => {
    // Width ratio 1x, height stretched to 2x -> scale keys off the taller axis.
    expect(resolveRenderScale(960, 540, 960, 1080, 1)).toBe(2);
  });

  it('never renders below the design buffer (min clamp = 1)', () => {
    // Displayed much smaller than logical -> ratio < 1 -> clamps up to 1.
    expect(resolveRenderScale(960, 540, 480, 270, 1)).toBe(MIN_RENDER_SCALE);
  });

  it('caps at MAX_RENDER_SCALE', () => {
    expect(resolveRenderScale(960, 540, 9600, 5400, 4)).toBe(MAX_RENDER_SCALE);
  });

  it('honors custom min/max options', () => {
    expect(resolveRenderScale(960, 540, 9600, 5400, 4, { maxScale: 2 })).toBe(2);
    expect(resolveRenderScale(960, 540, 100, 100, 1, { minScale: 2 })).toBe(2);
  });

  it('falls back to min scale when NO axis can be measured', () => {
    // Both display axes zero -> no ratio at all -> safe min fallback.
    expect(resolveRenderScale(960, 540, 0, 0, 1)).toBe(MIN_RENDER_SCALE);
    // Every dimension degenerate -> min fallback.
    expect(resolveRenderScale(-1, -1, -1, -1, -1)).toBe(MIN_RENDER_SCALE);
    // Non-finite everything -> min fallback.
    expect(resolveRenderScale(NaN, NaN, NaN, NaN, NaN)).toBe(MIN_RENDER_SCALE);
  });

  it('still derives scale from a valid axis when the other axis is degenerate', () => {
    // width logical 0 (ratioW unusable) but height 1080/540*1 = 2 -> scale 2.
    expect(resolveRenderScale(0, 540, 1920, 1080, 1)).toBe(2);
    // NaN display width but valid height axis -> keys off the height ratio.
    expect(resolveRenderScale(960, 540, NaN, 1080, 1)).toBe(2);
  });

  it('treats a bad dpr as 1', () => {
    // dpr NaN -> treated as 1; 1440/960 = 1.5 -> ceil 2.
    expect(resolveRenderScale(960, 540, 1440, 810, NaN)).toBe(2);
  });
});

describe('resolveRenderPlan', () => {
  it('derives buffer size and centered scroll from the scale', () => {
    const plan = resolveRenderPlan(960, 540, 1920, 1080, 1);
    expect(plan.scale).toBe(2);
    expect(plan.bufferWidth).toBe(1920);
    expect(plan.bufferHeight).toBe(1080);
    // Re-anchor the centered zoomed view to logical (0,0).
    expect(plan.scrollX).toBe(-(1920 - 960) / 2);
    expect(plan.scrollY).toBe(-(1080 - 540) / 2);
  });

  it('produces plain 0 scroll (not -0) at scale 1', () => {
    const plan = resolveRenderPlan(960, 540, 480, 270, 1);
    expect(plan.scale).toBe(1);
    expect(plan.bufferWidth).toBe(960);
    expect(Object.is(plan.scrollX, 0)).toBe(true);
    expect(Object.is(plan.scrollY, 0)).toBe(true);
  });
});

describe('resolveRenderZoom', () => {
  it('returns 1 when there is no window', () => {
    expect(resolveRenderZoom(undefined, 540, 960)).toBe(1);
  });

  it('computes the FIT zoom from viewport/dpr', () => {
    // FIT of 540x960 into 1080x1920 window = 2x; dpr 1 -> zoom 2.
    const win = { innerWidth: 1080, innerHeight: 1920, devicePixelRatio: 1 };
    expect(resolveRenderZoom(win, 540, 960)).toBe(2);
  });

  it('clamps to at least 1 and at most maxScale', () => {
    const small = { innerWidth: 270, innerHeight: 480, devicePixelRatio: 1 };
    expect(resolveRenderZoom(small, 540, 960)).toBe(1);
    const huge = { innerWidth: 5400, innerHeight: 9600, devicePixelRatio: 2 };
    expect(resolveRenderZoom(huge, 540, 960, 3)).toBe(3);
  });

  it('falls back to 1 on degenerate window geometry', () => {
    const bad = { innerWidth: 0, innerHeight: 960, devicePixelRatio: 1 };
    expect(resolveRenderZoom(bad, 540, 960)).toBe(1);
  });
});

describe('resolveFillSize', () => {
  it('grows height so a landscape game fills a portrait phone', () => {
    // 960x540 design (16:9) on a 390x844 portrait phone.
    const fill = resolveFillSize(960, 540, 390, 844);
    expect(fill.width).toBe(960); // width kept
    // height grown to match the taller viewport aspect: 960 / (390/844).
    expect(fill.height).toBe(Math.round(960 / (390 / 844)));
    expect(fill.height).toBeGreaterThan(540);
    // Resulting aspect matches the viewport aspect (within whole-pixel rounding).
    expect(fill.width / fill.height).toBeCloseTo(390 / 844, 2);
  });

  it('grows width when the viewport is wider than the design', () => {
    // 960x540 (16:9) on an ultra-wide 2560x1080 (21:9) viewport.
    const fill = resolveFillSize(960, 540, 2560, 1080);
    expect(fill.height).toBe(540); // height kept
    expect(fill.width).toBe(Math.round(540 * (2560 / 1080)));
    expect(fill.width).toBeGreaterThan(960);
    expect(fill.width / fill.height).toBeCloseTo(2560 / 1080, 2);
  });

  it('never shrinks below the design size', () => {
    const fill = resolveFillSize(960, 540, 1600, 900); // exact 16:9 match
    expect(fill.width).toBeGreaterThanOrEqual(960);
    expect(fill.height).toBeGreaterThanOrEqual(540);
  });

  it('falls back to the design size on degenerate inputs', () => {
    expect(resolveFillSize(960, 540, 0, 844)).toEqual({ width: 960, height: 540 });
    expect(resolveFillSize(960, 540, 390, NaN)).toEqual({ width: 960, height: 540 });
  });
});

describe('resolveFillPlan', () => {
  it('centers the 960x540 design inside a portrait-fill surface', () => {
    // 960x540 landscape game on a 390x844 portrait phone: height grows, width kept.
    const plan = resolveFillPlan(960, 540, 390, 844);
    expect(plan.width).toBe(960);
    expect(plan.height).toBe(resolveFillSize(960, 540, 390, 844).height);
    // No horizontal slack -> no x offset; vertical slack centered (negative half).
    expect(Object.is(plan.offsetX, 0)).toBe(true);
    expect(plan.offsetY).toBe(-(plan.height - 540) / 2);
    expect(plan.offsetY).toBeLessThan(0);
  });

  it('centers horizontally when the viewport is wider than the design', () => {
    const plan = resolveFillPlan(960, 540, 2560, 1080);
    expect(plan.height).toBe(540);
    expect(plan.offsetY === 0).toBe(true);
    expect(plan.offsetX).toBe(-(plan.width - 960) / 2);
    expect(plan.offsetX).toBeLessThan(0);
  });

  it('is a no-op (design size, zero offset) at an exact aspect match', () => {
    const plan = resolveFillPlan(960, 540, 1600, 900);
    expect(plan.width).toBe(960);
    expect(plan.height).toBe(540);
    expect(Object.is(plan.offsetX, 0)).toBe(true);
    expect(Object.is(plan.offsetY, 0)).toBe(true);
  });

  it('falls back to the design size with zero offset on degenerate inputs', () => {
    expect(resolveFillPlan(960, 540, 0, 844)).toEqual({
      width: 960,
      height: 540,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe('resolveViewportPlan', () => {
  it('fills a portrait phone: fill size matches the viewport aspect', () => {
    const plan = resolveViewportPlan(960, 540, 390, 844, 1);
    // Height grows to match the taller viewport; width kept at design.
    expect(plan.fillWidth).toBe(960);
    expect(plan.fillHeight).toBeGreaterThan(540);
    // The fill surface aspect equals the viewport aspect (no FIT letterbox band).
    expect(plan.fillWidth / plan.fillHeight).toBeCloseTo(390 / 844, 2);
    // Backbuffer is fill size * whole-number scale.
    expect(plan.gameWidth).toBe(plan.fillWidth * plan.scale);
    expect(plan.gameHeight).toBe(plan.fillHeight * plan.scale);
    expect(Number.isInteger(plan.scale)).toBe(true);
    expect(plan.scale).toBeGreaterThanOrEqual(1);
  });

  it('is an identity-ish plan (scale 1, zero scroll) at exact aspect + 1x', () => {
    const plan = resolveViewportPlan(960, 540, 960, 540, 1);
    expect(plan.fillWidth).toBe(960);
    expect(plan.fillHeight).toBe(540);
    expect(plan.scale).toBe(1);
    expect(plan.gameWidth).toBe(960);
    expect(plan.gameHeight).toBe(540);
    expect(Object.is(plan.scrollX, 0)).toBe(true);
    expect(Object.is(plan.scrollY, 0)).toBe(true);
  });

  it('clamps the backbuffer via the max scale option', () => {
    const plan = resolveViewportPlan(960, 540, 3840, 2160, 3, { maxScale: 2 });
    expect(plan.scale).toBeLessThanOrEqual(2);
  });

  it('respects an already-clamped dpr (caller clamps before calling)', () => {
    // dpr clamped to 2 by the caller: a portrait phone gets a bounded buffer.
    const plan = resolveViewportPlan(960, 540, 390, 844, 2);
    expect(plan.scale).toBeGreaterThanOrEqual(1);
    expect(plan.scale).toBeLessThanOrEqual(MAX_RENDER_SCALE);
  });
});

describe('resolveVisibleWorldRect', () => {
  it('spans the full fill size, centered on the design rect (portrait phone)', () => {
    const plan = resolveViewportPlan(960, 540, 390, 844, 1);
    const rect = resolveVisibleWorldRect(960, 540, plan);
    // Visible width/height equal the fill size in design/world units.
    expect(rect.width).toBe(plan.fillWidth);
    expect(rect.height).toBe(plan.fillHeight);
    // No horizontal slack -> x stays 0; vertical slack -> negative top edge.
    expect(Object.is(rect.x, 0)).toBe(true);
    expect(rect.y).toBe(-(plan.fillHeight - 540) / 2);
    expect(rect.y).toBeLessThan(0);
    // The rect fully CONTAINS the 960x540 design rect.
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(960);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(540);
  });

  it('offsets horizontally when the viewport is wider than the design', () => {
    const plan = resolveViewportPlan(960, 540, 2560, 1080, 1);
    const rect = resolveVisibleWorldRect(960, 540, plan);
    expect(rect.height).toBe(540);
    expect(Object.is(rect.y, 0)).toBe(true);
    expect(rect.x).toBe(-(plan.fillWidth - 960) / 2);
    expect(rect.x).toBeLessThan(0);
  });

  it('is the design rect at (0,0) with no slack at an exact aspect match', () => {
    const rect = resolveVisibleWorldRect(960, 540, { fillWidth: 960, fillHeight: 540 });
    expect(rect).toEqual({ x: 0, y: 0, width: 960, height: 540 });
    // -0 must be normalized to plain 0.
    expect(Object.is(rect.x, 0)).toBe(true);
    expect(Object.is(rect.y, 0)).toBe(true);
  });

  it('accepts a bare {fillWidth,fillHeight} object (not only a full plan)', () => {
    const rect = resolveVisibleWorldRect(960, 540, { fillWidth: 960, fillHeight: 2078 });
    expect(rect.width).toBe(960);
    expect(rect.height).toBe(2078);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(-(2078 - 540) / 2);
  });

  it('falls back to the design rect on degenerate fill sizes', () => {
    const rect = resolveVisibleWorldRect(960, 540, { fillWidth: NaN, fillHeight: 0 });
    expect(rect).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });
});
