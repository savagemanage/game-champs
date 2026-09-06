/**
 * dpr.ts - PURE devicePixelRatio / backbuffer-budget clamps to bound GPU memory.
 *
 * WHY. The reported mobile-tab crashes are classic WebGL memory pressure: a
 * hi-DPR phone (dpr 3+) multiplied by a large displayed canvas produces a
 * backbuffer with tens of millions of pixels, and the mobile GPU/tab budget
 * blows past its allocation ceiling and the tab is killed. The responsive
 * scaler alone would happily produce that buffer, so these helpers give the
 * responsive layer two ceilings to consult:
 *   - {@link clampDpr}: never treat the device as more than `maxDpr` dense
 *     (2 is plenty for text sharpness; 3x on a phone quadruples memory for no
 *     perceptible gain), and
 *   - {@link computeBackbufferBudget}: cap the TOTAL backbuffer pixel AREA so
 *     logicalW*scale * logicalH*scale never exceeds a fixed budget.
 *
 * Both are pure numeric functions - no DOM, no Phaser - so they are trivially
 * unit-testable and can be shared by every game's boot/resize path.
 */

/** Default upper bound on device pixel ratio. */
export const DEFAULT_MAX_DPR = 2;

/**
 * Rough backbuffer pixel-area budget (~4M px, e.g. 2000x2000). Above this a
 * mobile GPU is at real risk of an out-of-memory tab kill; below it a game
 * comfortably fits typical device budgets. Tunable per game via the
 * {@link computeBackbufferBudget} argument.
 */
export const DEFAULT_MAX_BACKBUFFER_PIXELS = 4_000_000;

/** True only for a finite, strictly-positive number. */
function isPositiveFinite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Clamp a devicePixelRatio into (0, maxDpr]. A non-finite or non-positive input
 * (e.g. a test/non-browser bundle where the value is missing) falls back to 1;
 * a too-dense display is capped at `maxDpr` so the backbuffer stays affordable.
 */
export function clampDpr(dpr: number, maxDpr: number = DEFAULT_MAX_DPR): number {
  const cap = isPositiveFinite(maxDpr) ? maxDpr : DEFAULT_MAX_DPR;
  if (!isPositiveFinite(dpr)) return Math.min(1, cap);
  return Math.min(dpr, cap);
}

/**
 * Cap a proposed render scale so the total backbuffer pixel AREA
 * (`logicalW*scale * logicalH*scale`) stays within `maxPixels`. Returns the
 * ORIGINAL `scale` when it already fits; otherwise the largest scale that fits
 * the budget, i.e. `sqrt(maxPixels / (logicalW*logicalH))`.
 *
 * The returned scale is NOT rounded (callers that need a whole-number camera
 * zoom should `Math.floor` it, which can only make the buffer smaller and so
 * stays within budget). Never returns below 0; degenerate inputs fall back to
 * the input `scale` (or 1 if that is also bad) so a bad budget never zeroes the
 * canvas.
 */
export function computeBackbufferBudget(
  logicalWidth: number,
  logicalHeight: number,
  scale: number,
  maxPixels: number = DEFAULT_MAX_BACKBUFFER_PIXELS,
): number {
  const safeScale = isPositiveFinite(scale) ? scale : 1;
  if (
    !isPositiveFinite(logicalWidth) ||
    !isPositiveFinite(logicalHeight) ||
    !isPositiveFinite(maxPixels)
  ) {
    return safeScale;
  }

  const area = logicalWidth * logicalHeight * safeScale * safeScale;
  if (area <= maxPixels) {
    return safeScale;
  }

  const maxScale = Math.sqrt(maxPixels / (logicalWidth * logicalHeight));
  return maxScale;
}
