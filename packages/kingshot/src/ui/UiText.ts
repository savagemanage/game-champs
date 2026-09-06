import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';

/**
 * UiText - crisp-text strategy for the UI/HUD/menu layer.
 *
 * The game renders at a low logical resolution (960x540) and is upscaled with
 * nearest-neighbour (Scale.FIT + pixelArt), which crushes small text. To keep
 * glyphs sharp we render Phaser Text at a higher DPI via the `resolution`
 * style property: the glyph texture is rasterized at `resolution` times the
 * logical size, so it stays crisp when the canvas is scaled up and on high-DPI
 * displays. This does NOT change roundPixels or the world pixel-art scale; it
 * only sharpens text. Mirrors wirework's ui/UiText.ts approach.
 */

/**
 * Text resolution multiplier. Text is rasterized to its OWN glyph texture at
 * `resolution` times the logical size, independently of the world's
 * nearest-neighbour pixel-art upscale. We scale with the device pixel ratio
 * and floor at 3x so HUD/menu glyphs stay crisp even on 1x monitors that get
 * Scale.FIT-upscaled well past 1x. The world art stays pixel-art; only text
 * sharpens.
 */
export const TEXT_RESOLUTION = Math.max(
  3,
  Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) * 2,
);

/**
 * Font stack for all UI text. Kingdom Rise is KOREAN-FIRST, so the self-hosted
 * pixel Hangul face (Galmuri11, SIL OFL-1.1, declared via @font-face in
 * index.html and loaded before the first text-bearing scene renders — see
 * {@link ensureUiFontLoaded}) MUST come first: it covers the full Korean
 * syllable range, so Hangul renders as real glyphs instead of missing-glyph
 * boxes. The Latin monospace faces stay after it as fallbacks; Galmuri11 also
 * carries clean ASCII, so English keeps the crisp pixel grid.
 */
export const UI_FONT_FAMILY =
  '"Galmuri11", "DejaVu Sans Mono", "Consolas", "Liberation Mono", "Menlo", "Courier New", monospace';

/** The family name that must be resolvable before any UI text is rasterized. */
export const UI_FONT_LOAD_SPEC = '16px "Galmuri11"';

/**
 * Ensure the Korean-capable UI webfont is loaded and ready BEFORE Phaser
 * rasterizes any text. Phaser renders Text to a canvas glyph texture on first
 * paint; if the font is not yet available at that moment the browser draws
 * missing-glyph boxes and Phaser CACHES that boxed texture, so late-arriving
 * fonts never fix the already-painted labels. Gating the first text-bearing
 * scene on this promise guarantees the very first paint uses real glyphs.
 *
 * Resolves (never rejects) so a font hiccup can never wedge the boot flow: on
 * any failure or in a non-DOM/test environment we fall through and let Phaser
 * paint with the fallback stack rather than hang forever.
 */
export function ensureUiFontLoaded(timeoutMs = 4000): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve();
  }
  const fonts = document.fonts as FontFaceSet;
  const load = Promise.all([
    fonts.load(UI_FONT_LOAD_SPEC),
    // A Hangul sample forces the browser to fetch the Korean coverage, not just
    // the (possibly synthesizable) ASCII subset.
    fonts.load(`${UI_FONT_LOAD_SPEC}`, '가나다'),
  ])
    .then(() => fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
  return Promise.race([load, timeout]);
}

/**
 * Build a monospace text style with the crisp text resolution baked in, using
 * the shared palette. Callers pass a font size (in logical px, already sized
 * for the 960x540 canvas) plus optional overrides (colour/align/weight win).
 */
export function textStyle(
  fontSize: number,
  overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI_FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: PALETTE.TEXT_CSS,
    resolution: TEXT_RESOLUTION,
    padding: { x: 2, y: 2 },
    shadow: {
      offsetX: 0,
      offsetY: 1,
      color: '#000000',
      blur: 0,
      fill: true,
      stroke: false,
    },
    ...overrides,
  };
}
