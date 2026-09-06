/**
 * RenderScale.ts - pure, Phaser-free math for the canvas backing-buffer scale.
 *
 * THE PROBLEM. The game is authored in a fixed logical/design resolution of
 * 540x960 (see CANVAS in src/config/GameConfig.ts) and displayed with
 * Phaser.Scale.FIT, which uniformly scales the canvas to fit the viewport while
 * preserving aspect. By default the canvas BACKING BUFFER is exactly 540x960
 * device-independent pixels; FIT then stretches that buffer to the displayed
 * CSS size. On a typical desktop (e.g. a 1440x820 dpr=1 window) the portrait
 * canvas is displayed at ~461x820 CSS px, so a 540-wide buffer is actually
 * DOWNSCALED (~0.85x) onto the screen. Rendering the whole scene at only 540px
 * wide and shrinking it softens and mangles small, dense Korean glyphs. This is
 * the root cause of the "broken font" complaint.
 *
 * THE FIX. Phaser 3.80's game-config `scale.zoom` multiplies only the canvas
 * BACKING STORE: the canvas element becomes `width*zoom x height*zoom` physical
 * pixels while the world/camera coordinate space stays `width x height` (540x960).
 * So scene layout never changes, but the buffer gains resolution. We choose a
 * zoom that makes the backing buffer at least as large, in device pixels, as the
 * displayed canvas will occupy - so the browser never has to UPSCALE the buffer
 * (which is what smears text). Note Phaser 3 removed the old game-config
 * `resolution` property (it is a no-op now); `scale.zoom` is the supported knob.
 *
 * THE MATH. Under Scale.FIT the portrait canvas is displayed at
 *   displayScale = min(viewportW / baseW, viewportH / baseH)
 * i.e. the displayed CSS size is `baseW*displayScale x baseH*displayScale`. The
 * displayed DEVICE-pixel size is that times the device pixel ratio `dpr`. The
 * backing buffer is `baseW*zoom x baseH*zoom` device pixels, so to guarantee the
 * buffer covers the display (buffer device px >= displayed device px) we need
 *   baseW*zoom >= baseW*displayScale*dpr   <=>   zoom >= displayScale*dpr.
 * We round UP to that target (never leave the buffer below display size), clamp
 * the result to at least 1 (never shrink below the design buffer), and cap it at
 * `maxScale` to bound GPU texture memory. Any degenerate input (0, negative, or
 * NaN for a viewport dimension, dpr, or base dimension) falls back to a safe 1.
 */

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

/** Default cap on the render scale (backing-buffer multiplier). */
export const DEFAULT_MAX_RENDER_SCALE = 4;

/**
 * The subset of `window` that {@link resolveRenderZoom} reads. Kept minimal (and
 * structurally typed) so the boot wiring can be unit-tested with a plain object
 * instead of a real DOM.
 */
export interface WindowLike {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/**
 * True only for a finite, strictly-positive number. Guards against 0, negative
 * values, NaN, and +/-Infinity so any bad input triggers the safe fallback.
 */
function isPositiveFinite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Compute the Phaser `scale.zoom` factor for the canvas backing buffer.
 *
 * Returns a factor `z` in the range [1, maxScale] such that the backing buffer
 * (`baseW*z x baseH*z` device pixels) is at least as large as the FIT-displayed
 * canvas measured in device pixels (`displayScale*dpr` per logical pixel, where
 * `displayScale = min(viewportW/baseW, viewportH/baseH)`). The result is rounded
 * UP so the buffer always covers the display, then clamped to [1, maxScale].
 *
 * Degenerate inputs (any non-positive or non-finite dimension/dpr, or a
 * `maxScale` below 1) fall back to `1` (the plain 540x960 backing buffer).
 */
export function computeRenderScale(input: RenderScaleInput): number {
  const { viewportW, viewportH, dpr, baseW, baseH, maxScale } = input;

  // Any bad geometry -> safe fallback of the design-size buffer.
  if (
    !isPositiveFinite(viewportW) ||
    !isPositiveFinite(viewportH) ||
    !isPositiveFinite(dpr) ||
    !isPositiveFinite(baseW) ||
    !isPositiveFinite(baseH)
  ) {
    return 1;
  }

  // maxScale must be a sane cap (>= 1); otherwise fall back to no upscaling.
  const cap = isPositiveFinite(maxScale) && maxScale >= 1 ? maxScale : 1;

  // FIT uniform display scale, then the device-pixel target for the buffer.
  const displayScale = Math.min(viewportW / baseW, viewportH / baseH);
  const target = displayScale * dpr;

  // Round UP so the buffer never falls below the displayed device-pixel size,
  // then clamp into [1, cap].
  const zoom = Math.ceil(target);
  return Math.min(Math.max(zoom, 1), cap);
}

/**
 * Boot-time bridge between the live `window` and {@link computeRenderScale}.
 *
 * This is the exact zoom-derivation `main.ts` wires into the Phaser config's
 * `scale.zoom`, factored out of `main.ts` (which cannot be unit-tested because
 * it boots a real `Phaser.Game`) so the wiring itself is covered: it reads the
 * viewport + DPR off `win`, pins the design dims to CANVAS 540x960 and the
 * default cap, and returns the backing-buffer multiplier. Pass `undefined` (no
 * `window`, e.g. a non-browser/test bundle) to get the safe fallback of 1.
 */
export function resolveRenderZoom(
  win: WindowLike | undefined,
  baseW: number,
  baseH: number,
): number {
  if (!win) {
    return 1;
  }
  return computeRenderScale({
    viewportW: win.innerWidth,
    viewportH: win.innerHeight,
    dpr: win.devicePixelRatio,
    baseW,
    baseH,
    maxScale: DEFAULT_MAX_RENDER_SCALE,
  });
}
