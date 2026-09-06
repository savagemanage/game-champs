/**
 * Pure, Phaser-free SVG ART builders for the battle renderer.
 *
 * The project ships ZERO binary art assets. Instead of drawing chunky pixel
 * blocks (the old approach), each in-canvas entity is now authored as REAL
 * illustrated vector art expressed as an SVG MARKUP STRING. These strings are
 * later rasterized ONCE to a cached Phaser texture by {@link ./sprites}, but
 * the string-building here has NO Phaser dependency at all, so it can be unit
 * tested directly (see svgArt.test.ts).
 *
 * Every builder returns {@link SvgArt}: the SVG string, its intrinsic viewBox
 * dimensions (`viewW`/`viewH`, kept proportional to the previously-baked pixel
 * sizes so on-screen scale is preserved), and `footYFrac` in (0, 1] marking the
 * ground-contact point as a fraction of the height. The caller computes the
 * baked size and `footY = round(footYFrac * height)` from these.
 *
 * COLOR: builders take the same {@link SpritePalette} five-tone ramp the pixel
 * factory used (derived from a champion/team accent by {@link ./palette}), so
 * champions stay distinct by accent and the ally/enemy rim tell survives. Tones
 * are emitted as `#rrggbb` fills/strokes/gradients so the accent visibly drives
 * the art and tinting is wired without any runtime Phaser tint.
 */

import type { ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import { darken, lighten, type SpritePalette } from './palette';

/** Result of an SVG art builder: markup plus intrinsic geometry. */
export interface SvgArt {
  /** The full `<svg ...>...</svg>` markup string. */
  svg: string;
  /** Intrinsic viewBox width (proportional to the baked texture width). */
  viewW: number;
  /** Intrinsic viewBox height (proportional to the baked texture height). */
  viewH: number;
  /**
   * Ground-contact point as a fraction of the height, in (0, 1]. The caller
   * turns this into `footY = round(footYFrac * pixelHeight)`.
   */
  footYFrac: number;
}

/** Convert a packed `0xRRGGBB` int into a `#rrggbb` string for SVG. */
export function toHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Warm skin tone shared by champion faces/hands (kept off the accent ramp). */
const SKIN = 0xf0e6d2;

/**
 * Wrap authored body markup in an `<svg>` with a shared `<defs>` gradient
 * ramp derived from the palette so figures read as softly shaded volumes
 * rather than flat fills. `id` seeds unique gradient ids so multiple textures
 * on one page never collide.
 */
function svgDoc(
  id: string,
  viewW: number,
  viewH: number,
  pal: SpritePalette,
  body: string,
): string {
  const gid = `g-${id}`;
  const base = toHex(pal.base);
  const light = toHex(pal.light);
  const shadow = toHex(pal.shadow);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" ` +
    `width="${viewW}" height="${viewH}">` +
    `<defs>` +
    `<linearGradient id="${gid}-body" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${light}"/>` +
    `<stop offset="0.55" stop-color="${base}"/>` +
    `<stop offset="1" stop-color="${shadow}"/>` +
    `</linearGradient>` +
    `<radialGradient id="${gid}-core" cx="0.5" cy="0.4" r="0.6">` +
    `<stop offset="0" stop-color="${toHex(lighten(pal.base, 0.55))}"/>` +
    `<stop offset="1" stop-color="${base}"/>` +
    `</radialGradient>` +
    `</defs>` +
    body +
    `</svg>`
  );
}

/** Convenience: the `url(#..-body)` gradient reference for a builder id. */
function bodyFill(id: string): string {
  return `url(#g-${id}-body)`;
}

/** Convenience: the `url(#..-core)` radial gradient reference. */
function coreFill(id: string): string {
  return `url(#g-${id}-core)`;
}

// ---------------------------------------------------------------------------
// Champion figures (54 x 78 baked). Distinct illustrated silhouette per role.
// ---------------------------------------------------------------------------

// Champions are drawn as the FOCAL figures of the scene, so they are baked a
// touch larger than the supporting structures/minions to keep them prominent
// and readable across the lane map (see the size-balance tuning pass).
const CH_W = 64;
const CH_H = 92;
const CH_FOOT = 90 / CH_H; // ground contact near the very bottom

/**
 * Shared champion body: legs, torso, head + a neutral cloak, all shaded from
 * the palette. The per-role motif (weapon/prop) is layered on top so each of
 * the five roles reads as a different character.
 */
function championBase(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const skin = toHex(SKIN);
  const skinShade = toHex(darken(SKIN, 0.22));
  const fill = bodyFill(id);
  const rim = toHex(pal.rim);
  return (
    // ground-anchored legs
    `<path d="M22 58 L21 74 L26 74 L27 60 Z" fill="${toHex(pal.shadow)}" stroke="${outline}" stroke-width="1"/>` +
    `<path d="M32 58 L33 74 L28 74 L27 60 Z" fill="${toHex(darken(pal.base, 0.2))}" stroke="${outline}" stroke-width="1"/>` +
    // boots
    `<rect x="20" y="72" width="9" height="4" rx="1.5" fill="${outline}"/>` +
    `<rect x="27" y="72" width="9" height="4" rx="1.5" fill="${outline}"/>` +
    // torso: a rounded cuirass tapering to the waist
    `<path d="M27 30 C18 32 15 42 18 56 L36 56 C39 42 36 32 27 30 Z" ` +
    `fill="${fill}" stroke="${outline}" stroke-width="1.4"/>` +
    // team-rim highlight down the lit shoulder edge
    `<path d="M22 33 C18 40 18 48 19 55" fill="none" stroke="${rim}" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>` +
    // shoulder pauldrons
    `<ellipse cx="18" cy="34" rx="6" ry="4.5" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
    `<ellipse cx="36" cy="34" rx="6" ry="4.5" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
    // neck + head
    `<rect x="24" y="24" width="6" height="6" fill="${skinShade}"/>` +
    `<circle cx="27" cy="18" r="8" fill="${skin}" stroke="${outline}" stroke-width="1.2"/>` +
    // jaw shade
    `<path d="M21 20 A8 8 0 0 0 33 20" fill="none" stroke="${skinShade}" stroke-width="1.4" opacity="0.6"/>`
  );
}

/** Marksman: hooded scout drawing a longbow on the right. */
function marksman(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const wood = toHex(lighten(pal.base, 0.4));
  const string = toHex(lighten(pal.rim, 0.2));
  return (
    championBase(id, pal) +
    // longbow arc down the right side
    `<path d="M42 10 C52 24 52 46 42 60" fill="none" stroke="${wood}" stroke-width="2.4" stroke-linecap="round"/>` +
    // bowstring
    `<path d="M42 10 L38 35 L42 60" fill="none" stroke="${string}" stroke-width="1" opacity="0.85"/>` +
    // nocked arrow
    `<path d="M20 35 L40 35" stroke="${outline}" stroke-width="1.4"/>` +
    `<path d="M40 35 L36 33 M40 35 L36 37" stroke="${outline}" stroke-width="1.2"/>` +
    // quiver hood peak
    `<path d="M20 13 L27 6 L27 12 Z" fill="${bodyFill(id)}" stroke="${outline}" stroke-width="1"/>`
  );
}

/** Assassin: hooded rogue with twin crossed daggers. */
function assassin(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const blade = toHex(lighten(pal.rim, 0.35));
  const hood = bodyFill(id);
  return (
    championBase(id, pal) +
    // deep hood cowl over the head
    `<path d="M17 20 C17 6 37 6 37 20 L33 18 C33 10 21 10 21 18 Z" fill="${hood}" stroke="${outline}" stroke-width="1.2"/>` +
    // crossed daggers
    `<path d="M12 30 L24 46" stroke="${blade}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M42 30 L30 46" stroke="${blade}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M12 30 L15 33 M42 30 L39 33" stroke="${outline}" stroke-width="2"/>` +
    // shadowy glint eyes
    `<circle cx="24" cy="17" r="1.4" fill="${toHex(pal.rim)}"/>` +
    `<circle cx="30" cy="17" r="1.4" fill="${toHex(pal.rim)}"/>`
  );
}

/** Bruiser: heavy armor with a broad round shield on the left. */
function bruiser(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const metal = toHex(lighten(pal.base, 0.35));
  const boss = toHex(lighten(pal.rim, 0.3));
  return (
    championBase(id, pal) +
    // broad shield on the left arm
    `<ellipse cx="12" cy="44" rx="10" ry="14" fill="${metal}" stroke="${outline}" stroke-width="1.6"/>` +
    `<ellipse cx="12" cy="44" rx="6" ry="9" fill="none" stroke="${outline}" stroke-width="1" opacity="0.6"/>` +
    `<circle cx="12" cy="44" r="3" fill="${boss}" stroke="${outline}" stroke-width="1"/>` +
    // heavy chest plate ridge
    `<path d="M27 32 L27 54" stroke="${outline}" stroke-width="1.2" opacity="0.5"/>` +
    // helm crest
    `<path d="M23 11 L27 5 L31 11 Z" fill="${metal}" stroke="${outline}" stroke-width="1"/>`
  );
}

/** Mage: robed caster with a tall staff and glowing orb. */
function mage(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const shaft = toHex(darken(lighten(pal.base, 0.3), 0.2));
  return (
    championBase(id, pal) +
    // flowing robe hem widening at the base
    `<path d="M18 44 C12 58 14 70 12 74 L42 74 C40 70 42 58 36 44 Z" ` +
    `fill="${bodyFill(id)}" stroke="${outline}" stroke-width="1.2" opacity="0.96"/>` +
    // staff
    `<path d="M43 16 L41 66" stroke="${shaft}" stroke-width="2.4" stroke-linecap="round"/>` +
    // glowing orb
    `<circle cx="42" cy="12" r="6" fill="${coreFill(id)}" stroke="${outline}" stroke-width="1"/>` +
    `<circle cx="40" cy="10" r="1.8" fill="${toHex(lighten(pal.rim, 0.4))}"/>` +
    // wide wizard hat
    `<path d="M17 12 L27 -2 L37 12 Z" fill="${bodyFill(id)}" stroke="${outline}" stroke-width="1.2"/>`
  );
}

/** Enchanter: gowned support with a radiant halo. */
function enchanter(id: string, pal: SpritePalette): string {
  const outline = toHex(pal.outline);
  const halo = toHex(lighten(pal.rim, 0.3));
  return (
    championBase(id, pal) +
    // long flowing gown
    `<path d="M19 42 C10 58 14 72 13 75 L41 75 C40 72 44 58 35 42 Z" ` +
    `fill="${bodyFill(id)}" stroke="${outline}" stroke-width="1.2" opacity="0.95"/>` +
    // radiant halo above the head
    `<ellipse cx="27" cy="7" rx="11" ry="3.4" fill="none" stroke="${halo}" stroke-width="2"/>` +
    `<ellipse cx="27" cy="7" rx="7" ry="2" fill="none" stroke="${toHex(lighten(pal.rim, 0.5))}" stroke-width="1" opacity="0.8"/>` +
    // gentle wing/veil flourishes
    `<path d="M18 36 C8 40 8 52 14 56" fill="none" stroke="${halo}" stroke-width="1.6" opacity="0.7"/>` +
    `<path d="M36 36 C46 40 46 52 40 56" fill="none" stroke="${halo}" stroke-width="1.6" opacity="0.7"/>`
  );
}

const CHAMPION_BUILDERS: Record<ChampionRole, (id: string, pal: SpritePalette) => string> = {
  marksman,
  assassin,
  bruiser,
  mage,
  enchanter,
};

/**
 * Intrinsic coordinate space the champion body markup is authored in. The
 * builders below draw with hard-coded coordinates in this 54x78 box; the whole
 * figure is then uniformly scaled up into the (larger) {@link CH_W}x{@link CH_H}
 * baked viewBox via a `<g transform>` so champions read as the focal figures
 * without re-authoring every path coordinate.
 */
const CH_ART_W = 54;
const CH_ART_H = 78;

/** Build the illustrated SVG for a champion of the given role. */
export function championArt(role: ChampionRole, pal: SpritePalette): SvgArt {
  const id = `ch-${role}`;
  const inner = CHAMPION_BUILDERS[role](id, pal);
  // Uniformly scale the 54x78-authored figure up into the larger baked box.
  const sx = (CH_W / CH_ART_W).toFixed(4);
  const sy = (CH_H / CH_ART_H).toFixed(4);
  const body = `<g transform="scale(${sx} ${sy})">${inner}</g>`;
  return { svg: svgDoc(id, CH_W, CH_H, pal, body), viewW: CH_W, viewH: CH_H, footYFrac: CH_FOOT };
}

// ---------------------------------------------------------------------------
// Minions (proportional to old 42x54 .. 54x72). Small footsoldier pawn.
// ---------------------------------------------------------------------------

/** Build the illustrated SVG for a lane minion. */
export function minionArt(type: MinionType, pal: SpritePalette): SvgArt {
  const id = `mn-${type}`;
  const big = type === 'super' ? 2 : type === 'siege' ? 1 : 0;
  // Baked a touch larger than the old 42x54 so minions stay readable next to
  // the now-more-prominent champions (see the size-balance tuning pass).
  const viewW = 46 + big * 6;
  const viewH = 60 + big * 9;
  const outline = toHex(pal.outline);
  const fill = bodyFill(id);
  const cx = viewW / 2;
  const bw = 20 + big * 5;
  const bh = 24 + big * 6;
  const bx = cx - bw / 2;
  const by = viewH - bh - 4;
  const head = 12 + big * 3;

  let body =
    // rounded pawn body
    `<path d="M${bx} ${by + bh} Q${bx} ${by} ${cx} ${by} Q${bx + bw} ${by} ${bx + bw} ${by + bh} Z" ` +
    `fill="${fill}" stroke="${outline}" stroke-width="1.4"/>` +
    // team-rim edge
    `<path d="M${bx + 2} ${by + 4} Q${bx + 3} ${by + bh - 4} ${bx + 4} ${by + bh}" fill="none" stroke="${toHex(pal.rim)}" stroke-width="1.4" opacity="0.85"/>` +
    // head knob
    `<circle cx="${cx}" cy="${by - head / 2 + 2}" r="${head / 2}" fill="${toHex(lighten(pal.base, 0.2))}" stroke="${outline}" stroke-width="1.2"/>` +
    // little boots
    `<rect x="${cx - bw / 2 + 1}" y="${viewH - 5}" width="${bw / 2 - 1}" height="4" rx="1.5" fill="${outline}"/>` +
    `<rect x="${cx + 1}" y="${viewH - 5}" width="${bw / 2 - 1}" height="4" rx="1.5" fill="${outline}"/>`;

  if (type === 'siege' || type === 'super') {
    // a cannon/spear jutting out so bigger minions read as bigger threats
    const barrel = toHex(lighten(pal.base, 0.4));
    body +=
      `<rect x="${bx + bw - 2}" y="${by + 4}" width="${8 + big * 2}" height="5" rx="2" fill="${barrel}" stroke="${outline}" stroke-width="1"/>`;
  }

  return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
}

// ---------------------------------------------------------------------------
// Structures: turret / inhibitor / nexus, ally & enemy via palette rim.
// ---------------------------------------------------------------------------

/** Build the illustrated SVG for a structure of the given tier. */
export function structureArt(
  tier: 'turret' | 'inhibitor' | 'nexus',
  pal: SpritePalette,
): SvgArt {
  const id = `st-${tier}`;
  const outline = toHex(pal.outline);
  const fill = bodyFill(id);
  const rim = toHex(pal.rim);

  if (tier === 'nexus') {
    // Structures are baked SMALLER than before so they read as landmarks
    // rather than towering over the champions (size-balance tuning pass).
    const viewW = 56;
    const viewH = 74;
    const cx = viewW / 2;
    const body =
      // stone plinth
      `<path d="M12 ${viewH - 4} L${viewW - 12} ${viewH - 4} L${viewW - 18} ${viewH - 16} L18 ${viewH - 16} Z" ` +
      `fill="${toHex(pal.shadow)}" stroke="${outline}" stroke-width="1.6"/>` +
      // large faceted crystal
      `<path d="M${cx} 6 L${cx + 20} 40 L${cx + 12} ${viewH - 18} L${cx - 12} ${viewH - 18} L${cx - 20} 40 Z" ` +
      `fill="${fill}" stroke="${outline}" stroke-width="1.8"/>` +
      // inner facet highlights
      `<path d="M${cx} 6 L${cx} ${viewH - 18}" stroke="${rim}" stroke-width="1.4" opacity="0.8"/>` +
      `<path d="M${cx} 6 L${cx - 20} 40 M${cx} 6 L${cx + 20} 40" stroke="${toHex(lighten(pal.base, 0.4))}" stroke-width="1" opacity="0.7"/>` +
      // glowing core
      `<circle cx="${cx}" cy="46" r="7" fill="${coreFill(id)}"/>`;
    return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
  }

  if (tier === 'inhibitor') {
    const viewW = 40;
    const viewH = 44;
    const cx = viewW / 2;
    const body =
      // base
      `<path d="M8 ${viewH - 3} L${viewW - 8} ${viewH - 3} L${viewW - 14} ${viewH - 12} L14 ${viewH - 12} Z" ` +
      `fill="${toHex(pal.shadow)}" stroke="${outline}" stroke-width="1.4"/>` +
      // crystal pyramid
      `<path d="M${cx} 6 L${viewW - 12} ${viewH - 12} L12 ${viewH - 12} Z" ` +
      `fill="${fill}" stroke="${outline}" stroke-width="1.6"/>` +
      // facet + glowing core
      `<path d="M${cx} 6 L${cx} ${viewH - 12}" stroke="${rim}" stroke-width="1.2" opacity="0.75"/>` +
      `<circle cx="${cx}" cy="30" r="6" fill="${coreFill(id)}"/>`;
    return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
  }

  // Turret: tapered tower with a crenellated glowing head.
  const viewW = 40;
  const viewH = 52;
  const cx = viewW / 2;
  const body =
    // foot
    `<path d="M8 ${viewH - 3} L${viewW - 8} ${viewH - 3} L${viewW - 12} ${viewH - 14} L12 ${viewH - 14} Z" ` +
    `fill="${toHex(pal.shadow)}" stroke="${outline}" stroke-width="1.4"/>` +
    // tapered shaft
    `<path d="M16 ${viewH - 14} L${viewW - 16} ${viewH - 14} L${cx + 8} 20 L${cx - 8} 20 Z" ` +
    `fill="${fill}" stroke="${outline}" stroke-width="1.6"/>` +
    // lit column + team rim
    `<path d="M${cx - 5} 22 L${cx - 6} ${viewH - 15}" stroke="${rim}" stroke-width="1.6" opacity="0.85"/>` +
    // crenellated head
    `<rect x="${cx - 12}" y="8" width="24" height="14" rx="2" fill="${fill}" stroke="${outline}" stroke-width="1.4"/>` +
    `<rect x="${cx - 12}" y="4" width="5" height="6" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
    `<rect x="${cx - 2.5}" y="4" width="5" height="6" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
    `<rect x="${cx + 7}" y="4" width="5" height="6" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
    // glowing eye
    `<circle cx="${cx}" cy="16" r="4" fill="${coreFill(id)}"/>` +
    `<circle cx="${cx - 1}" cy="15" r="1.2" fill="${toHex(lighten(pal.rim, 0.4))}"/>`;
  return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
}

// ---------------------------------------------------------------------------
// Markers: jungle gem/leaf + epic beasts (dragon / herald / baron).
// ---------------------------------------------------------------------------

/** Fixed accent palette per marker variant (markers are not team-tinted). */
export const MARKER_PALETTES: Record<
  'jungle' | 'dragon' | 'baron' | 'herald',
  { base: number; rim: number }
> = {
  jungle: { base: 0x6fe08a, rim: 0xbfffcf },
  dragon: { base: 0xe8703a, rim: 0xffcaa8 },
  baron: { base: 0x9b6bff, rim: 0xc9b0ff },
  herald: { base: 0x7ad0ff, rim: 0xbfe9ff },
};

/** Build the illustrated SVG for a jungle/epic marker. */
export function markerArt(
  variant: 'jungle' | 'dragon' | 'baron' | 'herald',
  pal: SpritePalette,
): SvgArt {
  const id = `mk-${variant}`;
  const outline = toHex(pal.outline);
  const fill = bodyFill(id);
  const rim = toHex(pal.rim);

  if (variant === 'jungle') {
    const viewW = 24;
    const viewH = 24;
    const body =
      // leaf
      `<path d="M12 4 C20 8 20 18 12 21 C4 18 4 8 12 4 Z" fill="${fill}" stroke="${outline}" stroke-width="1"/>` +
      `<path d="M12 5 L12 20" stroke="${rim}" stroke-width="1" opacity="0.8"/>`;
    return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
  }

  const viewW = 54;
  const viewH = 60;
  let body =
    // hulking body
    `<path d="M8 34 Q6 48 18 50 L40 50 Q50 48 46 34 Q40 26 27 26 Q14 26 8 34 Z" ` +
    `fill="${fill}" stroke="${outline}" stroke-width="1.6"/>` +
    // lit flank
    `<path d="M14 34 Q20 32 26 33" fill="none" stroke="${rim}" stroke-width="1.4" opacity="0.8"/>` +
    // head
    `<path d="M40 18 Q52 18 50 30 L40 32 L36 24 Z" fill="${fill}" stroke="${outline}" stroke-width="1.4"/>` +
    // eye
    `<circle cx="45" cy="24" r="1.8" fill="${toHex(lighten(pal.rim, 0.3))}"/>`;

  if (variant === 'dragon' || variant === 'herald') {
    // sweeping wings
    body +=
      `<path d="M14 30 Q0 18 2 8 Q14 16 22 28 Z" fill="${fill}" stroke="${outline}" stroke-width="1.2" opacity="0.95"/>` +
      `<path d="M30 28 Q40 14 52 10 Q48 24 40 32 Z" fill="${fill}" stroke="${outline}" stroke-width="1.2" opacity="0.9"/>` +
      // horns
      `<path d="M44 18 L48 8 L46 18 Z" fill="${toHex(lighten(pal.base, 0.2))}" stroke="${outline}" stroke-width="1"/>`;
  } else {
    // baron: spine hump + tendrils instead of wings
    body +=
      `<path d="M14 28 Q20 16 27 26" fill="none" stroke="${toHex(lighten(pal.base, 0.25))}" stroke-width="2.4"/>` +
      `<path d="M24 26 Q30 14 37 24" fill="none" stroke="${toHex(lighten(pal.base, 0.25))}" stroke-width="2.4"/>` +
      `<path d="M8 40 Q2 46 4 52" fill="none" stroke="${outline}" stroke-width="2"/>`;
  }

  return { svg: svgDoc(id, viewW, viewH, pal, body), viewW, viewH, footYFrac: (viewH - 1) / viewH };
}

// ---------------------------------------------------------------------------
// Combat / skill VFX. Unlike the figure builders above, VFX are authored as
// small, self-contained SVG textures parameterized ONLY by a single ability
// color (a packed 0xRRGGBB int) so they can be baked once and cached by
// (kind + color) and animated with the existing BattleScene tweens. They do
// not use the champion palette ramp; instead each builder derives a soft
// light/dark ramp from the passed color so the caster's ability tint carries
// through while keeping a glowing, "authored" VFX look.
// ---------------------------------------------------------------------------

/** The set of VFX textures the battle renderer can bake. */
export type VfxKind =
  | 'projectile'
  | 'beam'
  | 'aoeRing'
  | 'castFlare'
  | 'impact'
  | 'heal'
  | 'stun'
  | 'death';

/**
 * Wrap VFX body markup in an `<svg>` with a shared radial "glow" gradient and a
 * tapered streak gradient derived from the ability color. `id` seeds unique ids
 * so multiple VFX textures on one page never collide.
 */
function vfxDoc(
  id: string,
  viewW: number,
  viewH: number,
  color: number,
  body: string,
): string {
  const gid = `v-${id}`;
  const core = toHex(lighten(color, 0.6));
  const mid = toHex(color);
  const edge = toHex(darken(color, 0.35));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} ${viewH}" ` +
    `width="${viewW}" height="${viewH}">` +
    `<defs>` +
    `<radialGradient id="${gid}-glow" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="${core}" stop-opacity="1"/>` +
    `<stop offset="0.5" stop-color="${mid}" stop-opacity="0.95"/>` +
    `<stop offset="1" stop-color="${edge}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<linearGradient id="${gid}-streak" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${mid}" stop-opacity="0"/>` +
    `<stop offset="0.6" stop-color="${mid}" stop-opacity="0.9"/>` +
    `<stop offset="1" stop-color="${core}" stop-opacity="1"/>` +
    `</linearGradient>` +
    `</defs>` +
    body +
    `</svg>`
  );
}

/** N-pointed star path centered at (cx, cy) with outer/inner radii. */
function starPath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

/**
 * Build a self-contained VFX SVG texture for the given `kind`, tinted by
 * `color` (a packed 0xRRGGBB int). Returns markup + intrinsic view size; the
 * `footYFrac` is a nominal 1 (VFX are centered sprites, not ground-anchored
 * billboards, so the caller positions them by center, not foot).
 */
export function vfxArt(kind: VfxKind, color: number): SvgArt {
  const id = `${kind}-${(color & 0xffffff).toString(16).padStart(6, '0')}`;
  const core = toHex(lighten(color, 0.7));
  const mid = toHex(color);
  const glow = `url(#v-${id}-glow)`;

  switch (kind) {
    case 'projectile': {
      // A glowing orb with a soft comet trail sweeping to the left.
      const w = 40;
      const h = 24;
      const cy = h / 2;
      const body =
        `<path d="M4 ${cy} Q18 ${cy - 5} 28 ${cy} Q18 ${cy + 5} 4 ${cy} Z" fill="${glow}" opacity="0.7"/>` +
        `<circle cx="28" cy="${cy}" r="11" fill="${glow}"/>` +
        `<circle cx="28" cy="${cy}" r="6" fill="${mid}"/>` +
        `<circle cx="26" cy="${cy - 2}" r="2.4" fill="${core}"/>`;
      return { svg: vfxDoc(id, w, h, color, body), viewW: w, viewH: h, footYFrac: 1 };
    }
    case 'beam': {
      // A tapered gradient streak (thin at the source, bright at the tip).
      const w = 48;
      const h = 14;
      const cy = h / 2;
      const body =
        `<path d="M2 ${cy} L46 ${cy - 4} L46 ${cy + 4} Z" fill="url(#v-${id}-streak)"/>` +
        `<rect x="2" y="${cy - 1}" width="44" height="2" rx="1" fill="${core}" opacity="0.9"/>` +
        `<circle cx="46" cy="${cy}" r="4.5" fill="${glow}"/>`;
      return { svg: vfxDoc(id, w, h, color, body), viewW: w, viewH: h, footYFrac: 1 };
    }
    case 'aoeRing': {
      // A telegraph ring meant to be drawn as a ground ellipse: a bright
      // stroked circle with a soft inner fill, in a square viewBox so the
      // caller can squash it to any rx/ry.
      const s = 64;
      const c = s / 2;
      const body =
        `<circle cx="${c}" cy="${c}" r="${c - 3}" fill="${glow}" opacity="0.45"/>` +
        `<circle cx="${c}" cy="${c}" r="${c - 3}" fill="none" stroke="${core}" stroke-width="3"/>` +
        `<circle cx="${c}" cy="${c}" r="${c - 10}" fill="none" stroke="${mid}" stroke-width="1.5" opacity="0.7"/>`;
      return { svg: vfxDoc(id, s, s, color, body), viewW: s, viewH: s, footYFrac: 1 };
    }
    case 'castFlare': {
      // A radiant burst: a central glow behind a spiky star.
      const s = 48;
      const c = s / 2;
      const body =
        `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${glow}"/>` +
        `<path d="${starPath(c, c, c - 4, (c - 4) * 0.42, 8)}" fill="${core}" opacity="0.9"/>` +
        `<circle cx="${c}" cy="${c}" r="4" fill="${core}"/>`;
      return { svg: vfxDoc(id, s, s, color, body), viewW: s, viewH: s, footYFrac: 1 };
    }
    case 'impact': {
      // A spark/shard burst: several tapered shards radiating from the center.
      const s = 32;
      const c = s / 2;
      let shards = `<circle cx="${c}" cy="${c}" r="5" fill="${glow}"/>`;
      const spikes = 6;
      for (let i = 0; i < spikes; i += 1) {
        const a = (Math.PI * 2 * i) / spikes;
        const tipX = c + Math.cos(a) * (c - 1);
        const tipY = c + Math.sin(a) * (c - 1);
        const bx1 = c + Math.cos(a + 0.4) * 3;
        const by1 = c + Math.sin(a + 0.4) * 3;
        const bx2 = c + Math.cos(a - 0.4) * 3;
        const by2 = c + Math.sin(a - 0.4) * 3;
        shards +=
          `<path d="M${bx1.toFixed(2)} ${by1.toFixed(2)} L${tipX.toFixed(2)} ${tipY.toFixed(2)} ` +
          `L${bx2.toFixed(2)} ${by2.toFixed(2)} Z" fill="${core}"/>`;
      }
      return { svg: vfxDoc(id, s, s, color, shards), viewW: s, viewH: s, footYFrac: 1 };
    }
    case 'heal': {
      // A soft plus/cross sparkle with a glow behind it.
      const s = 32;
      const c = s / 2;
      const body =
        `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${glow}" opacity="0.8"/>` +
        `<rect x="${c - 2.5}" y="4" width="5" height="${s - 8}" rx="2" fill="${core}"/>` +
        `<rect x="4" y="${c - 2.5}" width="${s - 8}" height="5" rx="2" fill="${core}"/>` +
        `<circle cx="${c}" cy="${c}" r="2.5" fill="${toHex(lighten(color, 0.9))}"/>`;
      return { svg: vfxDoc(id, s, s, color, body), viewW: s, viewH: s, footYFrac: 1 };
    }
    case 'stun': {
      // Orbiting stars around an empty center, meant to spin over an entity.
      const s = 40;
      const c = s / 2;
      const orbit = c - 6;
      let stars = '';
      const n = 3;
      for (let i = 0; i < n; i += 1) {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const sx = c + Math.cos(a) * orbit;
        const sy = c + Math.sin(a) * orbit * 0.5;
        stars += `<path d="${starPath(sx, sy, 5, 2, 5)}" fill="${core}" stroke="${mid}" stroke-width="0.6"/>`;
      }
      return { svg: vfxDoc(id, s, s, color, stars), viewW: s, viewH: s, footYFrac: 1 };
    }
    case 'death': {
      // A shatter/burst ring: a thick broken ring with radiating shards.
      const s = 48;
      const c = s / 2;
      let body =
        `<circle cx="${c}" cy="${c}" r="${c - 6}" fill="none" stroke="${core}" stroke-width="3" opacity="0.9"/>` +
        `<circle cx="${c}" cy="${c}" r="${c - 6}" fill="${glow}" opacity="0.35"/>`;
      const shards = 8;
      for (let i = 0; i < shards; i += 1) {
        const a = (Math.PI * 2 * i) / shards + 0.2;
        const ix = c + Math.cos(a) * (c - 8);
        const iy = c + Math.sin(a) * (c - 8);
        const ox = c + Math.cos(a) * (c - 1);
        const oy = c + Math.sin(a) * (c - 1);
        body += `<path d="M${ix.toFixed(2)} ${iy.toFixed(2)} L${ox.toFixed(2)} ${oy.toFixed(2)}" stroke="${mid}" stroke-width="2.4" stroke-linecap="round"/>`;
      }
      return { svg: vfxDoc(id, s, s, color, body), viewW: s, viewH: s, footYFrac: 1 };
    }
  }
}
