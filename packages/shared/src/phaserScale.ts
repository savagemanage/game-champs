/**
 * phaserScale.ts - a thin adapter that BUILDS a Phaser scale-config object for
 * FILLING a mobile/portrait viewport instead of letterboxing a fixed-aspect
 * landscape game into a thin band.
 *
 * THE MOBILE PROBLEM. The landscape games are authored at logical 960x540 with
 * Phaser.Scale.FIT. On a portrait phone (e.g. 390x844) FIT preserves the 16:9
 * aspect and shrinks the canvas into a thin horizontal strip with huge black
 * bars above and below - unplayable on a phone. The fix is to hand Phaser a
 * game width/height that MATCHES the live viewport aspect (expanding the
 * shorter design axis via {@link resolveFillSize}) and let the camera stay
 * anchored top-left, so the canvas FILLS the screen.
 *
 * This module stays Phaser-TYPE-only: it imports NOTHING from Phaser at runtime
 * (the numeric Scale mode / autoCenter constants are injected by the caller, or
 * default to the installed Phaser's enum values - verified against phaser
 * 3.90.0), so all the real math lives in the pure responsive.ts and this file
 * is just the shape adapter. Consumers pass the LIVE viewport size + dpr; on
 * resize they rebuild and re-apply.
 */

import { resolveFillSize, resolveRenderScale } from './responsive';
import { clampDpr, computeBackbufferBudget } from './dpr';

/**
 * `Phaser.Scale.ScaleModes.RESIZE`. Injected by default so this module needs no
 * Phaser runtime import; pass `mode` explicitly to override. RESIZE lets the
 * game surface track the (aspect-matched) viewport we compute.
 *
 * VALUE VERIFIED against the installed phaser 3.90.0
 * (node_modules/phaser/src/scale/const/SCALE_MODE_CONST.js): the mode enum is
 * NONE:0, WIDTH_CONTROLS_HEIGHT:1, HEIGHT_CONTROLS_WIDTH:2, FIT:3, ENVELOP:4,
 * RESIZE:5. RESIZE is therefore 5 (NOT 3 - 3 is FIT, which would reintroduce
 * the letterbox). Prefer passing `Phaser.Scale.RESIZE` explicitly from the game
 * to be version-proof.
 */
export const PHASER_SCALE_RESIZE = 5;

/**
 * `Phaser.Scale.Center.CENTER_BOTH`. Injected by default; pass `autoCenter`
 * explicitly to override. VALUE VERIFIED against phaser 3.90.0
 * (CENTER_CONST.js): NO_CENTER:0, CENTER_BOTH:1.
 */
export const PHASER_CENTER_BOTH = 1;

/** Inputs for {@link buildFillScaleConfig}. */
export interface FillScaleInput {
  /** Design/logical width (e.g. 960). */
  logicalWidth: number;
  /** Design/logical height (e.g. 540). */
  logicalHeight: number;
  /** Live viewport width in CSS px (e.g. window.innerWidth). */
  viewportWidth: number;
  /** Live viewport height in CSS px (e.g. window.innerHeight). */
  viewportHeight: number;
  /** Device pixel ratio (window.devicePixelRatio). */
  dpr: number;
  /** Cap on the backbuffer zoom multiplier. Defaults to responsive's max (4). */
  maxScale?: number;
  /** Total backbuffer pixel-area budget (GPU memory ceiling). */
  maxBackbufferPixels?: number;
  /** Phaser Scale mode constant. Defaults to {@link PHASER_SCALE_RESIZE}. */
  mode?: number;
  /** Phaser autoCenter constant. Defaults to {@link PHASER_CENTER_BOTH}. */
  autoCenter?: number;
}

/**
 * A plain Phaser-`scale`-shaped object (values only - no Phaser import). Spread
 * this into a Phaser.Types.Core.GameConfig `scale` block.
 */
export interface FillScaleConfig {
  /** Phaser Scale mode constant. */
  mode: number;
  /** Phaser autoCenter constant. */
  autoCenter: number;
  /** Aspect-matched logical width to hand Phaser. */
  width: number;
  /** Aspect-matched logical height to hand Phaser. */
  height: number;
  /** Whole-number backbuffer multiplier (Phaser `scale.zoom`), budget-clamped. */
  zoom: number;
}

/**
 * Build a Phaser scale config that fills the viewport: the game width/height is
 * grown from the design size to match the viewport aspect ({@link resolveFillSize}),
 * and the backbuffer `zoom` is the display-aware render scale
 * ({@link resolveRenderScale}) using a DPR-clamped ratio and then floored to a
 * whole number that fits the backbuffer pixel budget ({@link computeBackbufferBudget}).
 *
 * The consumer wires the returned `width`/`height`/`zoom` into its Phaser game
 * config and anchors its scene cameras top-left; on window resize it calls this
 * again with the new viewport and re-applies.
 */
export function buildFillScaleConfig(input: FillScaleInput): FillScaleConfig {
  const {
    logicalWidth,
    logicalHeight,
    viewportWidth,
    viewportHeight,
    dpr,
    maxScale,
    maxBackbufferPixels,
    mode = PHASER_SCALE_RESIZE,
    autoCenter = PHASER_CENTER_BOTH,
  } = input;

  const fill = resolveFillSize(logicalWidth, logicalHeight, viewportWidth, viewportHeight);
  const safeDpr = clampDpr(dpr);

  // Display-aware backbuffer multiplier for the aspect-matched surface: the
  // viewport IS the displayed CSS size once we fill it.
  const rawScale = resolveRenderScale(
    fill.width,
    fill.height,
    viewportWidth,
    viewportHeight,
    safeDpr,
    maxScale !== undefined ? { maxScale } : undefined,
  );

  // Keep the backbuffer within the GPU memory budget, then floor to a whole
  // number so the camera zoom stays integer (flooring can only shrink the
  // buffer, so it never breaks the budget).
  const budgeted = computeBackbufferBudget(fill.width, fill.height, rawScale, maxBackbufferPixels);
  const zoom = Math.max(1, Math.floor(budgeted));

  return { mode, autoCenter, width: fill.width, height: fill.height, zoom };
}
