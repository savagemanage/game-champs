/**
 * Tests for RenderScale.computeRenderScale - the pure canvas backing-buffer
 * scale math. The core invariant we assert for normal viewports is that the
 * backing buffer covers the FIT-displayed canvas in device pixels:
 *   baseW*zoom >= displayScale*baseW*dpr   (equivalently zoom >= displayScale*dpr)
 * where displayScale = min(viewportW/baseW, viewportH/baseH). We also check the
 * maxScale cap and the degenerate-input fallback to 1.
 */

import { describe, it, expect } from 'vitest';
import { computeRenderScale, resolveRenderZoom, DEFAULT_MAX_RENDER_SCALE } from './RenderScale';

// The game's logical/design resolution (CANVAS in GameConfig).
const BASE_W = 540;
const BASE_H = 960;

/** displayScale under Scale.FIT for the portrait design canvas. */
function displayScale(viewportW: number, viewportH: number): number {
  return Math.min(viewportW / BASE_W, viewportH / BASE_H);
}

describe('computeRenderScale', () => {
  it('(a) 1440x820 dpr=1 desktop: buffer covers the FIT-displayed CSS width', () => {
    const viewportW = 1440;
    const viewportH = 820;
    const dpr = 1;
    const zoom = computeRenderScale({
      viewportW,
      viewportH,
      dpr,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    });

    // The displayed canvas is height-bound here: displayScale = 820/960 ~= 0.854,
    // so the displayed CSS width is ~461px. A plain 540 buffer would be DOWNSCALED
    // below display size only when zoom<displayScale*dpr; we require it to cover it.
    const ds = displayScale(viewportW, viewportH); // ~0.854
    const displayedCssWidth = BASE_W * ds; // ~461

    expect(zoom).toBeGreaterThanOrEqual(1);
    // Essential invariant: backing buffer (device px) >= displayed device px.
    expect(BASE_W * zoom).toBeGreaterThanOrEqual(ds * BASE_W * dpr);
    // And concretely the buffer width (540*zoom) covers the ~461 displayed CSS px.
    expect(BASE_W * zoom).toBeGreaterThanOrEqual(displayedCssWidth);
    // ceil(0.854*1) = 1.
    expect(zoom).toBe(1);
  });

  it('(b) HiDPI dpr=2 scales the buffer up further', () => {
    const viewportW = 1440;
    const viewportH = 820;
    const dpr = 2;
    const zoom = computeRenderScale({
      viewportW,
      viewportH,
      dpr,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    });

    const ds = displayScale(viewportW, viewportH); // ~0.854
    // ceil(0.854*2) = ceil(1.708) = 2.
    expect(zoom).toBe(2);
    // Covers display in device pixels.
    expect(BASE_W * zoom).toBeGreaterThanOrEqual(ds * BASE_W * dpr);
    // Strictly larger buffer than the dpr=1 case.
    const zoomDpr1 = computeRenderScale({
      viewportW,
      viewportH,
      dpr: 1,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    });
    expect(zoom).toBeGreaterThan(zoomDpr1);
  });

  it('(c) narrow mobile portrait 390x844 dpr=3 returns a capped, >=1 value covering the display', () => {
    const viewportW = 390;
    const viewportH = 844;
    const dpr = 3;
    const maxScale = DEFAULT_MAX_RENDER_SCALE;
    const zoom = computeRenderScale({
      viewportW,
      viewportH,
      dpr,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale,
    });

    const ds = displayScale(viewportW, viewportH); // width-bound: 390/540 ~= 0.722
    // ceil(0.722*3) = ceil(2.167) = 3, within the cap of 4.
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(zoom).toBeLessThanOrEqual(maxScale);
    expect(zoom).toBe(3);
    // Backing buffer covers the displayed device pixels.
    expect(BASE_W * zoom).toBeGreaterThanOrEqual(ds * BASE_W * dpr);
  });

  it('(d) honors the maxScale cap', () => {
    // A high dpr that would demand zoom 6 without a cap.
    const zoom = computeRenderScale({
      viewportW: 1440,
      viewportH: 820,
      dpr: 7,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: 4,
    });
    // Uncapped target would be ceil(0.854*7)=6, but the cap clamps to 4.
    expect(zoom).toBe(4);
  });

  it('(d2) a maxScale below 1 falls back to 1 (never below the design buffer)', () => {
    const zoom = computeRenderScale({
      viewportW: 1440,
      viewportH: 820,
      dpr: 2,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: 0.5,
    });
    expect(zoom).toBe(1);
  });

  it('(e) degenerate inputs (0/NaN/negative) fall back to 1', () => {
    const base = {
      viewportW: 1440,
      viewportH: 820,
      dpr: 1,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    };
    expect(computeRenderScale({ ...base, viewportW: 0 })).toBe(1);
    expect(computeRenderScale({ ...base, viewportH: 0 })).toBe(1);
    expect(computeRenderScale({ ...base, dpr: 0 })).toBe(1);
    expect(computeRenderScale({ ...base, viewportW: Number.NaN })).toBe(1);
    expect(computeRenderScale({ ...base, dpr: Number.NaN })).toBe(1);
    expect(computeRenderScale({ ...base, viewportH: -820 })).toBe(1);
    expect(computeRenderScale({ ...base, baseW: 0 })).toBe(1);
    expect(computeRenderScale({ ...base, baseH: Number.NaN })).toBe(1);
    expect(computeRenderScale({ ...base, dpr: Number.POSITIVE_INFINITY })).toBe(1);
  });

  it('always returns at least 1 for a tiny viewport (never shrinks the buffer)', () => {
    const zoom = computeRenderScale({
      viewportW: 100,
      viewportH: 100,
      dpr: 1,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    });
    expect(zoom).toBe(1);
  });
});

/**
 * `resolveRenderZoom` is the boot wiring main.ts hands to `scale.zoom`. These
 * tests guard that wiring end-to-end: that it reads the viewport + DPR off the
 * window-like object and pins CANVAS 540x960 + the default cap. If main.ts ever
 * dropped the zoom derivation (or stopped feeding the live window/DPR), the
 * chain these tests exercise would no longer match `computeRenderScale`.
 */
describe('resolveRenderZoom (main.ts boot wiring)', () => {
  it('returns the safe fallback 1 when there is no window (non-browser bundle)', () => {
    expect(resolveRenderZoom(undefined, BASE_W, BASE_H)).toBe(1);
  });

  it('reads innerWidth/innerHeight/devicePixelRatio and matches computeRenderScale', () => {
    const win = { innerWidth: 1440, innerHeight: 820, devicePixelRatio: 2 };
    const expected = computeRenderScale({
      viewportW: win.innerWidth,
      viewportH: win.innerHeight,
      dpr: win.devicePixelRatio,
      baseW: BASE_W,
      baseH: BASE_H,
      maxScale: DEFAULT_MAX_RENDER_SCALE,
    });
    expect(resolveRenderZoom(win, BASE_W, BASE_H)).toBe(expected);
    // Concretely HiDPI here: ceil(0.854*2) = 2.
    expect(resolveRenderZoom(win, BASE_W, BASE_H)).toBe(2);
  });

  it('is DPR-sensitive: a higher devicePixelRatio yields a larger (capped) buffer', () => {
    const base = { innerWidth: 1440, innerHeight: 820 };
    const dpr1 = resolveRenderZoom({ ...base, devicePixelRatio: 1 }, BASE_W, BASE_H);
    const dpr2 = resolveRenderZoom({ ...base, devicePixelRatio: 2 }, BASE_W, BASE_H);
    expect(dpr1).toBe(1);
    expect(dpr2).toBeGreaterThan(dpr1);
    // Even an absurd DPR stays within the default cap.
    expect(resolveRenderZoom({ ...base, devicePixelRatio: 99 }, BASE_W, BASE_H)).toBe(
      DEFAULT_MAX_RENDER_SCALE,
    );
  });

  it('applies the CANVAS design dims it is given (fallback on degenerate dims)', () => {
    const win = { innerWidth: 1440, innerHeight: 820, devicePixelRatio: 2 };
    // A zero base dimension is degenerate -> computeRenderScale fallback of 1.
    expect(resolveRenderZoom(win, 0, BASE_H)).toBe(1);
  });
});
