/**
 * renderScale - Phaser-free helper for the crisp-text render pipeline.
 *
 * THE PROBLEM this solves: the whole game is laid out in a fixed 960x540
 * LOGICAL coordinate system (CANVAS in GameConfig). Historically the Phaser
 * drawing buffer was ALSO 960x540 and the browser then scaled that low-res
 * buffer up to the physical display (with `image-rendering: pixelated`), so
 * every glyph was nearest-neighbour-upscaled and looked blurry/jagged. A
 * per-Text `resolution` could not compensate, because the whole backbuffer was
 * capped at 960x540 before the browser upscaled it.
 *
 * THE FIX: render the backbuffer at (close to) the device's REAL pixel
 * resolution - i.e. size the drawing buffer to `logical size * renderScale`
 * where renderScale tracks window.devicePixelRatio - while a per-scene camera
 * zoom of the same factor keeps the 960x540 logical coordinate system intact
 * (no scene math changes). Text is then rasterized at device pixels and stays
 * sharp; sprites keep NEAREST filtering so they remain crisp pixel-art.
 *
 * This module is deliberately Phaser-free and pure so it is unit-testable in
 * isolation (see renderScale.test.ts). main.ts consumes it to build the Phaser
 * game config and to zoom each scene's main camera.
 */

/**
 * Lower bound on the render scale. 1 means "never render below logical size"
 * (a 1x/no-DPR display still gets a 1:1 buffer, never a downscaled one).
 */
export const MIN_RENDER_SCALE = 1;

/**
 * Upper bound on the render scale. Rendering much past ~3x device pixels yields
 * no visible sharpness gain for UI text but wastes fill-rate/memory (the buffer
 * area grows with the SQUARE of the scale), so we cap it. 3 keeps text crisp on
 * 2x/3x displays while protecting very high-DPR or huge viewports from an
 * enormous backbuffer.
 */
export const MAX_RENDER_SCALE = 3;

/**
 * Compute the integer-ish render scale (backbuffer multiplier) for a given
 * device pixel ratio. We round the DPR to the nearest whole step and clamp it
 * to [MIN_RENDER_SCALE, MAX_RENDER_SCALE]. A whole-number scale keeps the
 * camera zoom an integer, which lets Phaser's roundPixels stay exact for
 * pixel-art sprites (fractional zoom would reintroduce sampling blur on
 * sprites).
 *
 * @param dpr - window.devicePixelRatio (or any positive number). Non-finite or
 *   non-positive input is treated as 1 (a safe 1x fallback).
 */
export function resolveRenderScale(dpr: number): number {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const rounded = Math.round(safeDpr);
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, rounded));
}

/** The backbuffer + camera-zoom plan for a given logical canvas and DPR. */
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
 * canvas at a given DPR. Keeping this pure means main.ts stays a thin wiring
 * layer and the math is covered by tests rather than only by screenshots.
 */
export function resolveRenderPlan(
  logicalWidth: number,
  logicalHeight: number,
  dpr: number,
): RenderPlan {
  const scale = resolveRenderScale(dpr);
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
