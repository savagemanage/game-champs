/**
 * renderScale - Phaser-free helper for the crisp-text render pipeline.
 *
 * THE PROBLEM this solves: the whole game is laid out in a fixed 960x540
 * LOGICAL coordinate system (CANVAS in GameConfig). Historically the Phaser
 * drawing buffer was ALSO 960x540 (or only DPR-scaled) and Scale.FIT then
 * stretched that low-res buffer up to fill the window (with the browser doing
 * the upscale), so every glyph was nearest-neighbour/bilinear-upscaled and
 * looked blurry/jagged. A per-Text `resolution` could not compensate, because
 * the whole backbuffer was capped before the browser upscaled it.
 *
 * WHY DPR ALONE WAS NOT ENOUGH (the confirmed live bug): the earlier fix keyed
 * the backbuffer size ONLY off `window.devicePixelRatio`. On the common desktop
 * case where devicePixelRatio === 1 but the canvas is CSS-scaled UP to fill a
 * large window (e.g. Scale.FIT stretching 960x540 into 1920x1080, a 2x blow-up),
 * the buffer stayed 960x540 and the browser upscaled it anyway - so UI/HUD/panel
 * TEXT was still blurry for most desktop users. The magnification a canvas
 * undergoes on screen is `devicePixelRatio * (displayedCssSize / logicalSize)`,
 * NOT just devicePixelRatio.
 *
 * THE FIX: render the backbuffer at (close to) the REAL number of physical
 * pixels the canvas occupies on screen - i.e. size the drawing buffer to
 * `logical size * renderScale` where renderScale tracks BOTH the device pixel
 * ratio AND how large the canvas is displayed relative to its logical size
 * (see {@link resolveRenderScale}). A per-scene camera zoom of the same factor
 * keeps the 960x540 logical coordinate system intact (no scene math changes).
 * Text is then rasterized at display resolution and stays sharp regardless of
 * whether the magnification comes from DPR or from Scale.FIT stretching a small
 * logical canvas into a big window; sprites keep NEAREST filtering so they
 * remain crisp pixel-art.
 *
 * This module is deliberately Phaser-free and pure so it is unit-testable in
 * isolation (see renderScale.test.ts). main.ts consumes it to build the initial
 * Phaser game config, to zoom each scene's main camera, and to recompute the
 * plan on every window resize.
 */

/**
 * Lower bound on the render scale. 1 means "never render below logical size"
 * (a 1x/no-DPR display still gets a 1:1 buffer, never a downscaled one).
 */
export const MIN_RENDER_SCALE = 1;

/**
 * Upper bound on the render scale. Rendering much past ~4x logical pixels yields
 * no visible sharpness gain for UI text but wastes fill-rate/memory (the buffer
 * area grows with the SQUARE of the scale), so we cap it. 4 is chosen so that
 * even a 4K (2160p) window - which needs a 4x blow-up of the 540px-tall logical
 * canvas - still gets a full-resolution buffer, while protecting against absurd
 * allocations on even larger/hi-DPI surfaces. This cap is now derived from the
 * REAL displayed pixel size (see resolveRenderScale), not from DPR alone, so a
 * dpr=1 1080p window (which needs 2x) is nowhere near the cap and its text is
 * sharp - the old MAX_RENDER_SCALE=3-keyed-on-DPR was an accomplice to the bug.
 */
export const MAX_RENDER_SCALE = 4;

/**
 * Compute the whole-number render scale (backbuffer multiplier) for a canvas
 * whose LOGICAL size is `logical*` but which is DISPLAYED (via CSS / Scale.FIT
 * letterboxing) at `displayCss*` CSS pixels on a display with device pixel
 * ratio `dpr`.
 *
 * The number of PHYSICAL pixels the canvas covers on each axis is
 * `displayCss * dpr`, so to rasterize at (or above) display resolution the
 * backbuffer must be at least `displayCss * dpr` on that axis, i.e. a multiple
 * of the logical size of `(displayCss * dpr) / logical`. We take the LARGER of
 * the two axis ratios (so neither axis is ever under-sampled), round UP to the
 * next whole number (never render below display resolution - rounding down
 * would reintroduce a browser upscale and blur), and clamp to
 * [MIN_RENDER_SCALE, MAX_RENDER_SCALE].
 *
 * A whole-number scale keeps the camera zoom an integer, which lets Phaser's
 * roundPixels stay exact for pixel-art sprites (a fractional zoom would
 * reintroduce sampling shimmer on sprites). Because the buffer is then AT LEAST
 * the displayed physical size, Scale.FIT only ever DOWNSCALES the buffer to the
 * viewport (a sharp minification), never upscales it.
 *
 * Degenerate inputs (non-finite or non-positive logical/display sizes, or dpr)
 * fall back safely: a bad dpr is treated as 1, and if the display size cannot
 * be measured the scale collapses to a safe 1x rather than exploding.
 *
 * @param logicalWidth   logical (design) canvas width  (e.g. 960)
 * @param logicalHeight  logical (design) canvas height (e.g. 540)
 * @param displayCssWidth   CSS pixels the canvas/container is displayed across
 * @param displayCssHeight  CSS pixels the canvas/container is displayed down
 * @param dpr  window.devicePixelRatio (or any positive number)
 */
export function resolveRenderScale(
  logicalWidth: number,
  logicalHeight: number,
  displayCssWidth: number,
  displayCssHeight: number,
  dpr: number,
): number {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const safeLogicalW = Number.isFinite(logicalWidth) && logicalWidth > 0 ? logicalWidth : 0;
  const safeLogicalH = Number.isFinite(logicalHeight) && logicalHeight > 0 ? logicalHeight : 0;
  const safeDispW = Number.isFinite(displayCssWidth) && displayCssWidth > 0 ? displayCssWidth : 0;
  const safeDispH = Number.isFinite(displayCssHeight) && displayCssHeight > 0 ? displayCssHeight : 0;

  // If we cannot measure either the logical or the displayed size, fall back to
  // a safe 1x buffer (never explode, never divide by zero).
  const ratioW = safeLogicalW > 0 && safeDispW > 0 ? (safeDispW * safeDpr) / safeLogicalW : 0;
  const ratioH = safeLogicalH > 0 && safeDispH > 0 ? (safeDispH * safeDpr) / safeLogicalH : 0;
  const ratio = Math.max(ratioW, ratioH);
  if (!(ratio > 0) || !Number.isFinite(ratio)) {
    return MIN_RENDER_SCALE;
  }

  // Round UP so the buffer is never below display resolution (rounding down
  // would leave the browser to upscale and re-blur text). Whole number keeps
  // the camera zoom integer for exact roundPixels on pixel-art sprites.
  const stepped = Math.ceil(ratio);
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, stepped));
}

/** The backbuffer + camera-zoom plan for a given logical canvas and display. */
export interface RenderPlan {
  /** Whole-number backbuffer/camera multiplier from {@link resolveRenderScale}. */
  scale: number;
  /** Backbuffer (Phaser gameSize) width in device pixels: logicalWidth * scale. */
  bufferWidth: number;
  /** Backbuffer (Phaser gameSize) height in device pixels: logicalHeight * scale. */
  bufferHeight: number;
  /**
   * Camera scrollX that keeps the logical 0..logicalWidth region filling the
   * scaled buffer when the main camera is zoomed by `scale`. With a default
   * 0.5 camera origin, a zoom of `scale` on a `bufferWidth`-wide viewport shows
   * a `logicalWidth`-wide world window centred on the buffer midpoint; scrolling
   * by this negative offset re-anchors that window to logical (0,0).
   */
  scrollX: number;
  /** Camera scrollY counterpart to {@link RenderPlan.scrollX}. */
  scrollY: number;
}

/**
 * Build the full render plan (buffer size + camera zoom/scroll) for a logical
 * canvas displayed at `displayCss*` CSS pixels on a display of ratio `dpr`.
 * Keeping this pure means main.ts stays a thin wiring layer and the math is
 * covered by tests rather than only by screenshots. Called on boot AND on every
 * window resize so the buffer/zoom track the live window size.
 */
export function resolveRenderPlan(
  logicalWidth: number,
  logicalHeight: number,
  displayCssWidth: number,
  displayCssHeight: number,
  dpr: number,
): RenderPlan {
  const scale = resolveRenderScale(
    logicalWidth,
    logicalHeight,
    displayCssWidth,
    displayCssHeight,
    dpr,
  );
  const bufferWidth = logicalWidth * scale;
  const bufferHeight = logicalHeight * scale;
  // The zoomed camera's world view is (bufferSize / scale) = logical size, but
  // it is centred on the buffer midpoint; shift it back so logical (0,0) is the
  // top-left. See RenderPlan.scrollX docs for the derivation.
  // `|| 0` normalizes the `-0` that `-(0)/2` produces at scale 1 to a plain 0.
  const scrollX = -(bufferWidth - logicalWidth) / 2 || 0;
  const scrollY = -(bufferHeight - logicalHeight) / 2 || 0;
  return { scale, bufferWidth, bufferHeight, scrollX, scrollY };
}
