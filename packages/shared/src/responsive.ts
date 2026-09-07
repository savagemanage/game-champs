/**
 * responsive.ts - PURE, framework-free math for responsive canvas scaling.
 *
 * This generalizes two per-game helpers that had drifted into copies with
 * slightly different shapes:
 *   - whiteout `src/ui/renderScale.ts` (resolveRenderScale / resolveRenderPlan:
 *     a whole-number backbuffer multiplier derived from BOTH the device pixel
 *     ratio AND the displayed-vs-logical CSS ratio, plus a per-scene camera
 *     zoom/scroll plan that keeps the logical rect anchored at 0,0), and
 *   - lastwar `src/systems/RenderScale.ts` (computeRenderScale / resolveRenderZoom:
 *     the simpler Phaser `scale.zoom` multiplier derived under Scale.FIT).
 *
 * WHY a backbuffer multiplier at all. Every game is authored in a fixed LOGICAL
 * coordinate system (e.g. 960x540). If the drawing buffer is only that logical
 * size, Scale.FIT stretches the small buffer up to fill the window and the
 * browser upscales it, smearing text/glyphs. The magnification a canvas
 * actually undergoes on screen is `devicePixelRatio * (displayedCssSize /
 * logicalSize)` - NOT devicePixelRatio alone - so we size the backbuffer to
 * that real physical-pixel count and let a matching camera zoom preserve the
 * logical coordinate space (no scene math changes).
 *
 * Everything here is deliberately Phaser-free and pure so it is unit-testable
 * in isolation; games wire the returned numbers into their Phaser config,
 * camera, and resize handlers themselves (see phaserScale.ts for the thin
 * Phaser adapter).
 */

/**
 * Lower bound on the render scale. 1 means "never render below logical size"
 * (a 1x / no-DPR display still gets a 1:1 buffer, never a downscaled one).
 */
export const MIN_RENDER_SCALE = 1;

/**
 * Upper bound on the render scale. The buffer AREA grows with the SQUARE of the
 * scale, so past ~4x logical pixels there is no visible sharpness gain for UI
 * text but a large fill-rate/memory cost. 4 lets even a 4K window get a
 * full-resolution buffer of a 540px-tall logical canvas while protecting
 * against absurd allocations on larger / hi-DPI surfaces.
 */
export const MAX_RENDER_SCALE = 4;

/** Default cap shared by the FIT-zoom helper; kept aligned with the games. */
export const DEFAULT_MAX_RENDER_SCALE = MAX_RENDER_SCALE;

/**
 * How much larger than the physical display the backbuffer may be, by AREA,
 * before the whole-number preference is abandoned.
 *
 * Rounding the scale UP to an integer keeps the camera zoom whole, which is
 * what keeps nearest-neighbour pixel art on an exact pixel grid. But the
 * rounding can overshoot badly: a 1280x800 display at dpr 1 needs a ratio of
 * 1.33, and `ceil` turns that into 2 - a 1920x1200 buffer, 2.25x the pixels the
 * screen can actually show. That is pure fill-rate spent on detail the display
 * cannot resolve, and it measurably halves the frame rate.
 *
 * 1.5 keeps the integer step wherever it is a reasonable amount of
 * supersampling (which does sharpen text) and rejects only the cases where
 * rounding up would cost far more than it returns.
 */
export const DEFAULT_MAX_OVERSAMPLE = 1.5;

/** Options for {@link resolveRenderScale}. */
export interface RenderScaleOptions {
  /** Lower bound on the returned scale. Defaults to {@link MIN_RENDER_SCALE}. */
  minScale?: number;
  /** Upper bound on the returned scale. Defaults to {@link MAX_RENDER_SCALE}. */
  maxScale?: number;
  /**
   * Backbuffer area budget as a multiple of the physical display area.
   * Defaults to {@link DEFAULT_MAX_OVERSAMPLE}; pass `Infinity` to always take
   * the whole-number scale.
   */
  maxOversample?: number;
}

/** True only for a finite, strictly-positive number. */
function isPositiveFinite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Compute the whole-number render scale (backbuffer multiplier) for a canvas
 * whose LOGICAL size is `logical*` but which is DISPLAYED (via CSS / Scale.FIT)
 * at `displayCss*` CSS pixels on a display of device pixel ratio `dpr`.
 *
 * The number of PHYSICAL pixels the canvas covers per axis is
 * `displayCss * dpr`, so to rasterize at (or above) display resolution the
 * buffer must be at least `(displayCss * dpr) / logical` times the logical
 * size on that axis. We take the LARGER axis ratio (so neither axis is ever
 * under-sampled), round UP (rounding down would reintroduce a browser upscale
 * and blur), and clamp into [minScale, maxScale].
 *
 * A whole-number scale keeps the camera zoom integer, letting Phaser's
 * roundPixels stay exact for pixel-art sprites. Degenerate inputs (non-finite
 * or non-positive logical/display sizes) fall back to `minScale`; a bad `dpr`
 * is treated as 1.
 */
export function resolveRenderScale(
  logicalWidth: number,
  logicalHeight: number,
  displayCssWidth: number,
  displayCssHeight: number,
  dpr: number,
  opts?: RenderScaleOptions,
): number {
  const minScale = isPositiveFinite(opts?.minScale as number) ? (opts!.minScale as number) : MIN_RENDER_SCALE;
  const maxScale =
    isPositiveFinite(opts?.maxScale as number) && (opts!.maxScale as number) >= minScale
      ? (opts!.maxScale as number)
      : Math.max(minScale, MAX_RENDER_SCALE);

  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const safeLogicalW = isPositiveFinite(logicalWidth) ? logicalWidth : 0;
  const safeLogicalH = isPositiveFinite(logicalHeight) ? logicalHeight : 0;
  const safeDispW = isPositiveFinite(displayCssWidth) ? displayCssWidth : 0;
  const safeDispH = isPositiveFinite(displayCssHeight) ? displayCssHeight : 0;

  const ratioW = safeLogicalW > 0 && safeDispW > 0 ? (safeDispW * safeDpr) / safeLogicalW : 0;
  const ratioH = safeLogicalH > 0 && safeDispH > 0 ? (safeDispH * safeDpr) / safeLogicalH : 0;
  const ratio = Math.max(ratioW, ratioH);
  if (!(ratio > 0) || !Number.isFinite(ratio)) {
    return minScale;
  }

  // Prefer the whole-number scale: an integer camera zoom keeps pixel art on an
  // exact grid. Take it only while the buffer it implies stays within the
  // oversample budget; when `ceil` overshoots the display badly, render at the
  // exact ratio instead, which is 1:1 with the physical pixels - the cheapest
  // option that still never under-samples.
  // Infinity is a meaningful value here ("always round up"), so it is accepted
  // even though it is not finite.
  const rawOversample = opts?.maxOversample;
  const maxOversample =
    typeof rawOversample === 'number' && rawOversample > 0 && !Number.isNaN(rawOversample)
      ? rawOversample
      : DEFAULT_MAX_OVERSAMPLE;
  const stepped = Math.ceil(ratio);
  const oversample = (stepped / ratio) ** 2;
  const chosen = oversample <= maxOversample ? stepped : ratio;
  return Math.min(maxScale, Math.max(minScale, chosen));
}

/** The backbuffer + camera-zoom plan for a given logical canvas and display. */
export interface RenderPlan {
  /** Whole-number backbuffer/camera multiplier from {@link resolveRenderScale}. */
  scale: number;
  /** Backbuffer width in device pixels: logicalWidth * scale. */
  bufferWidth: number;
  /** Backbuffer height in device pixels: logicalHeight * scale. */
  bufferHeight: number;
  /**
   * Camera scrollX that re-anchors the logical 0..logicalWidth region to the
   * top-left when the main camera is zoomed by `scale`. With a default 0.5
   * camera origin, a zoom of `scale` on a `bufferWidth`-wide viewport shows a
   * `logicalWidth`-wide world window centred on the buffer midpoint; this
   * negative offset shifts that window back to logical (0,0).
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
  opts?: RenderScaleOptions,
): RenderPlan {
  const scale = resolveRenderScale(
    logicalWidth,
    logicalHeight,
    displayCssWidth,
    displayCssHeight,
    dpr,
    opts,
  );
  const bufferWidth = logicalWidth * scale;
  const bufferHeight = logicalHeight * scale;
  // The zoomed camera's world view is (bufferSize / scale) = logical size, but
  // centred on the buffer midpoint; shift it back so logical (0,0) is top-left.
  // `|| 0` normalizes the `-0` that `-(0)/2` produces at scale 1 to a plain 0.
  const scrollX = -(bufferWidth - logicalWidth) / 2 || 0;
  const scrollY = -(bufferHeight - logicalHeight) / 2 || 0;
  return { scale, bufferWidth, bufferHeight, scrollX, scrollY };
}

/**
 * The subset of `window` that {@link resolveRenderZoom} reads. Kept minimal (and
 * structurally typed) so boot wiring can be unit-tested with a plain object
 * instead of a real DOM.
 */
export interface WindowLike {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/**
 * The simpler Phaser `scale.zoom` multiplier (the shape lastwar uses).
 *
 * Under Scale.FIT the canvas is displayed at
 *   displayScale = min(viewportW / baseW, viewportH / baseH)
 * so the displayed device-pixel size is `baseSize * displayScale * dpr`. The
 * backing buffer is `baseSize * zoom` device pixels, so `zoom >= displayScale *
 * dpr` guarantees the buffer covers the display (no browser upscale). We round
 * UP to that target, clamp to at least 1 (never shrink below the design buffer),
 * and cap at `maxScale` to bound GPU texture memory. Pass `undefined` for `win`
 * (e.g. a non-browser/test bundle) to get the safe fallback of 1; any
 * degenerate viewport/dpr/base dimension also falls back to 1.
 */
export function resolveRenderZoom(
  win: WindowLike | undefined,
  baseW: number,
  baseH: number,
  maxScale: number = DEFAULT_MAX_RENDER_SCALE,
): number {
  if (!win) {
    return 1;
  }
  const { innerWidth: viewportW, innerHeight: viewportH, devicePixelRatio: dpr } = win;

  if (
    !isPositiveFinite(viewportW) ||
    !isPositiveFinite(viewportH) ||
    !isPositiveFinite(dpr) ||
    !isPositiveFinite(baseW) ||
    !isPositiveFinite(baseH)
  ) {
    return 1;
  }

  const cap = isPositiveFinite(maxScale) && maxScale >= 1 ? maxScale : 1;
  const displayScale = Math.min(viewportW / baseW, viewportH / baseH);
  const zoom = Math.ceil(displayScale * dpr);
  return Math.min(Math.max(zoom, 1), cap);
}

/** A logical canvas size sized to MATCH a target viewport aspect ratio. */
export interface FillSize {
  /** Logical width to hand Phaser (>= design width). */
  width: number;
  /** Logical height to hand Phaser (>= design height). */
  height: number;
}

/**
 * Compute a logical canvas size that MATCHES the viewport aspect ratio by
 * EXPANDING the shorter design axis, so a fixed-aspect (e.g. landscape 960x540)
 * game FILLS a differently-shaped (e.g. portrait phone) viewport instead of
 * letterboxing into a thin band.
 *
 * We never shrink below the design size on either axis (so all existing scene
 * content stays on-screen); we only grow the axis that is "too short" for the
 * viewport. The design content stays anchored at (0,0) and the extra space
 * becomes margin the game can fill with background - the camera is expected to
 * be anchored top-left by the consumer. Degenerate inputs fall back to the
 * design size unchanged.
 *
 * @param logicalWidth   design width  (e.g. 960)
 * @param logicalHeight  design height (e.g. 540)
 * @param viewportWidth  live viewport width  in CSS px
 * @param viewportHeight live viewport height in CSS px
 */
export function resolveFillSize(
  logicalWidth: number,
  logicalHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): FillSize {
  if (
    !isPositiveFinite(logicalWidth) ||
    !isPositiveFinite(logicalHeight) ||
    !isPositiveFinite(viewportWidth) ||
    !isPositiveFinite(viewportHeight)
  ) {
    return {
      width: isPositiveFinite(logicalWidth) ? logicalWidth : 0,
      height: isPositiveFinite(logicalHeight) ? logicalHeight : 0,
    };
  }

  const designAspect = logicalWidth / logicalHeight;
  const viewportAspect = viewportWidth / viewportHeight;

  if (viewportAspect > designAspect) {
    // Viewport is WIDER than the design: grow the width to match its aspect.
    return { width: Math.round(logicalHeight * viewportAspect), height: logicalHeight };
  }
  // Viewport is TALLER (e.g. a portrait phone on a landscape game): grow height.
  return { width: logicalWidth, height: Math.round(logicalWidth / viewportAspect) };
}

/**
 * The plan for FILLING a viewport with a fixed-design game while keeping the
 * design content (e.g. the 960x540 scene layout) unchanged and CENTERED.
 *
 * The trick that avoids rewriting scene layouts: we hand Phaser a game
 * width/height that MATCHES the live viewport aspect (from {@link resolveFillSize})
 * so the canvas fills the screen with no thin-band letterbox, but the scenes
 * keep drawing in the original `design*` coordinate space. To keep that design
 * rect centered inside the (now larger) game surface, each scene offsets its
 * main camera scroll by {@link FillPlan.offsetX}/{@link FillPlan.offsetY} - the
 * negative half of the extra space grown on each axis. A scene that anchored at
 * the design center (e.g. cx = designWidth/2) therefore stays centered in the
 * filled viewport, and content authored at design (0,0) simply gains an equal
 * margin on each side that the game background fills.
 */
export interface FillPlan {
  /** Aspect-matched game width to hand Phaser (>= designWidth). */
  width: number;
  /** Aspect-matched game height to hand Phaser (>= designHeight). */
  height: number;
  /**
   * Camera scrollX that centers the `designWidth`-wide content inside the
   * filled `width`. Negative half of the horizontal slack, so the design rect's
   * center matches the game surface center. 0 when no width was added.
   */
  offsetX: number;
  /** Camera scrollY counterpart to {@link FillPlan.offsetX}. */
  offsetY: number;
}

/**
 * Compute a {@link FillPlan}: the aspect-matched game size for the viewport plus
 * the camera scroll offsets that keep the fixed `design*` layout centered in it.
 * Pure; a game calls this on boot AND on resize/orientationchange and applies
 * `width`/`height` to `game.scale.resize(...)` and `offsetX`/`offsetY` to each
 * scene's `cameras.main.setScroll(...)`. Degenerate inputs fall back to the
 * design size with zero offset (equivalent to the old fixed layout).
 */
export function resolveFillPlan(
  designWidth: number,
  designHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): FillPlan {
  const fill = resolveFillSize(designWidth, designHeight, viewportWidth, viewportHeight);
  const safeDesignW = isPositiveFinite(designWidth) ? designWidth : fill.width;
  const safeDesignH = isPositiveFinite(designHeight) ? designHeight : fill.height;
  // Negative half of the slack centers the design rect; `|| 0` normalizes -0.
  const offsetX = -(fill.width - safeDesignW) / 2 || 0;
  const offsetY = -(fill.height - safeDesignH) / 2 || 0;
  return { width: fill.width, height: fill.height, offsetX, offsetY };
}

/**
 * The world-space rectangle that a zoomed+scrolled camera ACTUALLY shows for a
 * fixed-design game filling a (possibly portrait) viewport. The design rect
 * stays at (0,0)..(designWidth,designHeight); because the fill surface is grown
 * on the short axis and centered, the visible rect starts at a NEGATIVE x/y and
 * spans the full fill size in design/world coordinates.
 *
 * Scenes use this to PAINT their backdrop (sky tileSprite, backdrop image, etc.)
 * across the whole visible area instead of only the 960x540 design rect, so a
 * portrait phone shows no flat dead margin above/below the design band while all
 * interactive UI stays authored in the unchanged 960x540 space.
 */
export interface VisibleWorldRect {
  /** World-space left edge (<= 0; negative half of the horizontal slack). */
  x: number;
  /** World-space top edge (<= 0; negative half of the vertical slack). */
  y: number;
  /** Visible width in design/world units (== fillWidth, >= designWidth). */
  width: number;
  /** Visible height in design/world units (== fillHeight, >= designHeight). */
  height: number;
}

/**
 * Derive the {@link VisibleWorldRect} the camera shows from the design size and
 * a {@link ViewportPlan} (or any object exposing fillWidth/fillHeight). Pure and
 * Phaser-free: the visible rect is the fill size, positioned so the design rect
 * stays centered - i.e. offset by the negative half of the slack grown on each
 * axis. Degenerate fill sizes fall back to the design rect at (0,0).
 *
 * @param designWidth  design width  (e.g. 960)
 * @param designHeight design height (e.g. 540)
 * @param fill         the fill size (a ViewportPlan, FillPlan, or {fillWidth,fillHeight})
 */
export function resolveVisibleWorldRect(
  designWidth: number,
  designHeight: number,
  fill: { fillWidth: number; fillHeight: number },
): VisibleWorldRect {
  const safeDesignW = isPositiveFinite(designWidth) ? designWidth : 0;
  const safeDesignH = isPositiveFinite(designHeight) ? designHeight : 0;
  const width = isPositiveFinite(fill?.fillWidth) ? fill.fillWidth : safeDesignW;
  const height = isPositiveFinite(fill?.fillHeight) ? fill.fillHeight : safeDesignH;
  // Negative half of the slack keeps the design rect centered; `|| 0` normalizes -0.
  const x = -(width - safeDesignW) / 2 || 0;
  const y = -(height - safeDesignH) / 2 || 0;
  return { x, y, width, height };
}

/** Options for {@link resolveViewportPlan}. */
export interface ViewportPlanOptions {
  /** Upper bound on the backbuffer multiplier. Defaults to {@link MAX_RENDER_SCALE}. */
  maxScale?: number;
  /** Total backbuffer pixel-area budget passed to the caller's dpr clamp. */
  maxBackbufferPixels?: number;
}

/**
 * The complete boot/resize plan for a fixed-design landscape game that must
 * FILL a (possibly portrait) viewport while keeping its `design*` scene layout
 * unchanged and CENTERED, AND keep text crisp at display resolution.
 *
 * It composes the two concerns:
 *   1. FILL - grow the game surface to the viewport aspect ({@link resolveFillPlan})
 *      so Scale.FIT has no thin-band letterbox to leave; and
 *   2. SHARPNESS - size the backbuffer to the real displayed physical pixels
 *      ({@link resolveRenderScale}) and zoom the camera by the same whole-number
 *      `scale`, so the design coordinate space is preserved.
 *
 * The caller hands Phaser `gameWidth`/`gameHeight` (the fill size * scale), sets
 * `mode: Scale.FIT` (the fill size already matches the viewport aspect, so FIT
 * fills it with no bars), and on each scene applies `cameras.main.setZoom(scale)`
 * + `cameras.main.setScroll(scrollX, scrollY)`. `scrollX`/`scrollY` both anchor
 * the zoomed camera and center the design rect inside the filled surface, so a
 * scene that centered on half the design size stays centered on a portrait phone.
 */
export interface ViewportPlan {
  /** Aspect-matched fill width in design units (>= designWidth). */
  fillWidth: number;
  /** Aspect-matched fill height in design units (>= designHeight). */
  fillHeight: number;
  /** Whole-number backbuffer/camera multiplier (Phaser scale.zoom / setZoom). */
  scale: number;
  /** Phaser game (backbuffer) width in device px: fillWidth * scale. */
  gameWidth: number;
  /** Phaser game (backbuffer) height in device px: fillHeight * scale. */
  gameHeight: number;
  /** cameras.main.setScroll x: anchors the zoom AND centers the design rect. */
  scrollX: number;
  /** cameras.main.setScroll y counterpart. */
  scrollY: number;
}

/**
 * Build a {@link ViewportPlan} from the design size, the live viewport, and a
 * DPR that the caller has ALREADY clamped (see @open-games/shared `clampDpr`),
 * so a hi-DPR phone never inflates the backbuffer. Pure and Phaser-free; every
 * landscape game calls this on boot and on resize/orientationchange.
 */
export function resolveViewportPlan(
  designWidth: number,
  designHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  clampedDpr: number,
  opts?: ViewportPlanOptions,
): ViewportPlan {
  const fill = resolveFillPlan(designWidth, designHeight, viewportWidth, viewportHeight);
  const scale = resolveRenderScale(
    fill.width,
    fill.height,
    viewportWidth,
    viewportHeight,
    clampedDpr,
    opts?.maxScale !== undefined ? { maxScale: opts.maxScale } : undefined,
  );
  const gameWidth = fill.width * scale;
  const gameHeight = fill.height * scale;
  // Anchor the zoomed camera so the fill-world (0,0) is top-left, THEN shift by
  // the fill offset so the design rect is centered inside the fill surface.
  const anchorX = -(gameWidth - fill.width) / 2;
  const anchorY = -(gameHeight - fill.height) / 2;
  const scrollX = anchorX + fill.offsetX || 0;
  const scrollY = anchorY + fill.offsetY || 0;
  return {
    fillWidth: fill.width,
    fillHeight: fill.height,
    scale,
    gameWidth,
    gameHeight,
    scrollX,
    scrollY,
  };
}
