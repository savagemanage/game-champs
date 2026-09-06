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
 * Font stack for all UI text. Naming concrete, widely-shipped monospace faces
 * first gives a consistent, sharp glyph grid across platforms and only falls
 * back to the generic keyword last (a bare `monospace` often resolves to a
 * blurry platform default).
 */
export const UI_FONT_FAMILY =
  '"DejaVu Sans Mono", "Consolas", "Liberation Mono", "Menlo", "Courier New", monospace';

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
