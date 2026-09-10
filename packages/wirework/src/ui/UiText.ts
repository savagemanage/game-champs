import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';

/**
 * UiText - crisp-text strategy for the UI/HUD/menu layer.
 *
 * The game renders at a low logical resolution and is upscaled with
 * nearest-neighbour (Scale.FIT + pixelArt), which crushes small text. To keep
 * glyphs sharp we render Phaser Text at a higher DPI via the `resolution`
 * style property: the glyph texture is rasterized at `resolution` times the
 * logical size, so it stays crisp when the canvas is scaled up and on
 * high-DPI displays. This does NOT change roundPixels or the world pixel-art
 * scale; it only sharpens text.
 */

/**
 * Text resolution multiplier. Text is rendered to its OWN glyph texture at
 * `resolution` times the logical size, so it is rasterized independently of the
 * world's nearest-neighbour pixel-art upscale (Phaser Text does not ride the
 * `pixelArt` nearest filter - it uses its own canvas texture, which we upload at
 * high DPI here). We scale with the device pixel ratio and use a min of 3x (was
 * 2x): on a 1x display the canvas is Scale.FIT-upscaled well past 1x for common
 * monitors, so a floor of 3x keeps HUD/menu glyphs crisp there too, and on
 * retina we go higher still. The world art stays pixel-art; only text sharpens.
 */
export const TEXT_RESOLUTION = Math.min(
  4,
  Math.max(3, Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) * 2),
);

/**
 * Font stack for all UI text. A bare `'monospace'` resolves to whatever the
 * platform picks (often a blurry, hinting-heavy default); naming concrete,
 * widely-shipped monospace faces first gives a consistent, sharp glyph grid
 * across platforms and only falls back to the generic keyword last.
 */
export const UI_FONT_FAMILY =
  '"DejaVu Sans Mono", "Consolas", "Liberation Mono", "Menlo", "Courier New", monospace';

/**
 * Build a monospace text style with the crisp text resolution baked in, using
 * the shared palette. Callers pass a font size (in logical px, already sized
 * for the 960x540 canvas) plus optional overrides.
 *
 * Beyond the high-DPI `resolution`, every label gets:
 *  - a legible cross-platform monospace font stack ({@link UI_FONT_FAMILY}),
 *  - a small `padding` so the high-DPI glyph texture never clips ascenders /
 *    descenders (a common cause of "fuzzy" edges on scaled text), and
 *  - a subtle 1px dark shadow for contrast against the busy arena, which reads
 *    as a crisp edge rather than a blur because it is rasterized at `resolution`.
 * Overrides win, so callers can still tweak colour/align/weight per label.
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
