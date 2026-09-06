/**
 * RenderScale.ts - THIN wrapper delegating to the shared @open-games/shared
 * render-scale module (FEAT-002).
 *
 * lastwar is a portrait 540x960 design and was already crisp: it derives a
 * Phaser `scale.zoom` backing-buffer multiplier so the canvas is never upscaled
 * from a low-res 540x960 buffer (which smeared dense Korean glyphs). That exact
 * FIT-zoom math (ceil(displayScale * dpr), clamped to [1, maxScale]) now lives
 * ONCE in @open-games/shared (packages/shared/src/responsive.ts, resolveRenderZoom)
 * so every game shares a single source of truth. This module keeps the local
 * names main.ts's boot wiring already consumes and simply forwards to shared.
 */

import { resolveRenderZoom as sharedResolveRenderZoom, DEFAULT_MAX_RENDER_SCALE } from '@open-games/shared';

export { DEFAULT_MAX_RENDER_SCALE } from '@open-games/shared';

/** Inputs for {@link computeRenderScale}. All in the caller's native units. */
export interface RenderScaleInput {
  /** Viewport (window) width in CSS pixels. */
  viewportW: number;
  /** Viewport (window) height in CSS pixels. */
  viewportH: number;
  /** Device pixel ratio (window.devicePixelRatio); 1 on a standard display. */
  dpr: number;
  /** Logical/design canvas width (CANVAS.WIDTH, 540). */
  baseW: number;
  /** Logical/design canvas height (CANVAS.HEIGHT, 960). */
  baseH: number;
  /** Upper bound on the returned zoom, to cap backing-buffer memory. */
  maxScale: number;
}

/**
 * The subset of `window` the boot wiring reads. Kept minimal (and structurally
 * typed) so it can be unit-tested with a plain object instead of a real DOM.
 */
export interface WindowLike {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/**
 * Compute the Phaser `scale.zoom` factor for the canvas backing buffer.
 *
 * THIN WRAPPER: delegates to the shared {@link sharedResolveRenderZoom}, which
 * implements the identical FIT-zoom math (zoom = ceil(min(vw/bw, vh/bh) * dpr),
 * clamped to [1, maxScale]) with the same safe fallback of 1 for any degenerate
 * viewport/dpr/base dimension or a maxScale below 1.
 */
export function computeRenderScale(input: RenderScaleInput): number {
  const { viewportW, viewportH, dpr, baseW, baseH, maxScale } = input;
  return sharedResolveRenderZoom(
    { innerWidth: viewportW, innerHeight: viewportH, devicePixelRatio: dpr },
    baseW,
    baseH,
    maxScale,
  );
}

/**
 * Boot-time bridge between the live `window` and the shared render-zoom math.
 * This is the exact zoom `main.ts` wires into the Phaser config's `scale.zoom`.
 * Pass `undefined` (no `window`, e.g. a non-browser/test bundle) for the safe
 * fallback of 1.
 */
export function resolveRenderZoom(
  win: WindowLike | undefined,
  baseW: number,
  baseH: number,
): number {
  return sharedResolveRenderZoom(win, baseW, baseH, DEFAULT_MAX_RENDER_SCALE);
}
