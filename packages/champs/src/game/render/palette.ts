/**
 * Pure, Phaser-free color helpers for the procedural pixel-art sprite factory.
 *
 * The sprite factory ({@link ../render/sprites}) draws chunky, hard-edged pixel
 * art from a LIMITED palette derived from a single caller-supplied accent color.
 * Deriving that palette (base + lighten + shadow + hard outline + team rim) is
 * pure integer color math with no Phaser dependency, so it lives here where it
 * can be unit-tested directly.
 *
 * All colors are packed 24-bit `0xRRGGBB` integers.
 */

/** Clamp a channel value into the valid 0..255 byte range. */
function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

/** Split a packed `0xRRGGBB` int into its `[r, g, b]` byte channels. */
export function toRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** Combine `[r, g, b]` byte channels back into a packed `0xRRGGBB` int. */
export function fromRgb(r: number, g: number, b: number): number {
  return (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
}

/** Lighten a packed color toward white by `amount` in [0, 1]. */
export function lighten(color: number, amount: number): number {
  const [r, g, b] = toRgb(color);
  return fromRgb(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken a packed color toward black by `amount` in [0, 1]. */
export function darken(color: number, amount: number): number {
  const [r, g, b] = toRgb(color);
  return fromRgb(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Parse a `#rrggbb` (or `rrggbb`) hex string into a packed int. */
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) & 0xffffff;
}

/**
 * A tiny, fixed palette derived from one accent color. The pixel-art draw code
 * only ever uses these ramps so every sprite reads as a limited-palette,
 * hard-edged retro asset regardless of the champion/team accent supplied.
 */
export interface SpritePalette {
  /** Deepest tone: hard 1-texel silhouette outline. */
  outline: number;
  /** Shadow / cast-side body tone. */
  shadow: number;
  /** The accent itself: the main body fill. */
  base: number;
  /** One lit step toward white for the front-facing highlight plane. */
  light: number;
  /** Team rim highlight (ally vs enemy tell), kept as a bright edge tone. */
  rim: number;
}

/**
 * Derive the five-tone {@link SpritePalette} from an accent color and a team
 * rim color. Deterministic and pure so the sprite factory bakes stable textures
 * and this can be asserted in tests.
 */
export function derivePalette(accent: number, rim: number): SpritePalette {
  return {
    outline: darken(accent, 0.78),
    shadow: darken(accent, 0.42),
    base: accent,
    light: lighten(accent, 0.34),
    rim,
  };
}
