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
 * Text resolution multiplier. Scales with the device pixel ratio (min 2x) so
 * text is rasterized at a high enough DPI to survive both the Scale.FIT upscale
 * and retina displays.
 */
export const TEXT_RESOLUTION = Math.max(2, Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1) * 2);

/**
 * Build a monospace text style with the crisp text resolution baked in, using
 * the shared palette. Callers pass a font size (in logical px, already sized
 * for the 960x540 canvas) plus optional overrides.
 */
export function textStyle(
  fontSize: number,
  overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'monospace',
    fontSize: `${fontSize}px`,
    color: PALETTE.TEXT_CSS,
    resolution: TEXT_RESOLUTION,
    ...overrides,
  };
}
