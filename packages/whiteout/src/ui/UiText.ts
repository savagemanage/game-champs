import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';
import { KO_FONT_FAMILY } from './fonts';

/**
 * UiText - crisp-text strategy for the UI/HUD/menu layer.
 *
 * The game is laid out in a fixed 960x540 LOGICAL coordinate system. As of the
 * FEAT-002 render-pipeline fix the Phaser BACKBUFFER is sized to the device's
 * real pixel resolution (logical size * renderScale, tracking
 * devicePixelRatio - see src/main.ts and @open-games/shared) and each scene's
 * main camera is zoomed by the same factor, so the browser no longer
 * nearest-neighbour-upscales a low-res 960x540 canvas: text now rasterizes at
 * device pixels and stays sharp, while sprites keep NEAREST filtering
 * (pixelArt:true) so they remain crisp pixel-art.
 *
 * The per-Text `resolution` below is an ADDITIONAL sharpener that now actually
 * helps: because the camera is zoomed, a Text drawn at a logical font size is
 * rendered onto `renderScale` times as many device pixels, so its glyph texture
 * must be rasterized at (at least) `renderScale` times the logical size to fill
 * them without softening. `resolution` does exactly that, independently of the
 * world pixel-art scale.
 */

/**
 * Text resolution multiplier. Text is rasterized to its OWN glyph texture at
 * `resolution` times the logical font size. It must comfortably cover the
 * device pixels the zoomed camera maps each logical text pixel onto, so we base
 * it on devicePixelRatio (rounded UP so a fractional DPR never under-samples)
 * and floor it at 2x. The floor keeps HUD/menu glyphs crisp even on a 1x
 * monitor whose window gets Scale.FIT-scaled past 1x, without the wastefully
 * huge textures a larger constant would allocate now that the backbuffer itself
 * is already at device resolution. The world art stays pixel-art; only text
 * sharpens.
 */
export const TEXT_RESOLUTION = Math.max(
  2,
  Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1),
);

/**
 * Font stack for all UI text. The game is KOREAN-FIRST, so the bundled
 * Korean-capable monospace face ({@link KO_FONT_FAMILY}, Nanum Gothic Coding,
 * loaded by ui/fonts.ts) leads the stack: it covers every Hangul glyph the UI
 * uses AND keeps the intended crisp monospace grid, so text renders identically
 * on every browser/OS (including headless Chromium, which ships no CJK fonts).
 * The concrete Latin monospace faces that follow are fallbacks for the rare
 * glyph the subset does not carry, and the generic `monospace` keyword is the
 * last resort.
 */
export const UI_FONT_FAMILY =
  `"${KO_FONT_FAMILY}", "DejaVu Sans Mono", "Consolas", "Liberation Mono", "Menlo", "Courier New", monospace`;

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
