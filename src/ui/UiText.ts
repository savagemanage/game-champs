import Phaser from 'phaser';
import { PALETTE } from '../config/GameConfig';

/**
 * UiText - crisp-text strategy for the UI/HUD/menu layer.
 *
 * The game renders at a low logical resolution (540x960) and is upscaled with
 * nearest-neighbour (Scale.FIT + pixelArt), which crushes small text. Text uses
 * a self-hosted vector Hangul webfont (see UI_FONT_FAMILY) so glyph outlines
 * stay legible at small sizes, and to keep them sharp we render Phaser Text at a
 * higher DPI via the `resolution`
 * style property: the glyph texture is rasterized at `resolution` times the
 * logical size, so it stays crisp when the canvas is scaled up and on high-DPI
 * displays. This does NOT change roundPixels or the world pixel-art scale; it
 * only sharpens text.
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
 * Font stack for all UI text. The game is Korean-first (한국어), so the stack
 * MUST lead with a Hangul-capable face or every Korean glyph renders as a tofu
 * box (□) on environments without a Korean system font (headless Chromium, many
 * user machines). We ship "NotoSansKR" - a self-hosted VECTOR (outline) Korean
 * webfont (Noto Sans KR Regular, SIL OFL-1.1, instantiated at wght=400 and
 * subset to the full modern Hangul syllable block + the Latin/symbol glyphs the
 * UI uses; bundled under public/assets/fonts and declared via @font-face in
 * index.html). A vector face replaces the previous pixel/bitmap font because
 * the UI draws small Korean text (~12-16px): a bitmap font is only crisp at its
 * native pixel size and turns to mush at other sizes under Scale.FIT, whereas
 * this outline font stays legible at every size. The sans/system faces after it
 * are fallbacks used only for the brief window before the webfont loads (render
 * is gated on document.fonts in main.ts); the generic `sans-serif` keyword is
 * last.
 *
 * IMPORTANT: the leading family name here must match the @font-face
 * `font-family` in index.html exactly (NotoSansKR).
 */
export const UI_FONT_FAMILY =
  '"NotoSansKR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "DejaVu Sans", "Helvetica Neue", Arial, sans-serif';

/**
 * Build a monospace text style with the crisp text resolution baked in, using
 * the shared palette. Callers pass a font size (in logical px, already sized
 * for the 540x960 canvas) plus optional overrides (colour/align/weight win).
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
