/**
 * Procedural LOW-RES PIXEL-ART sprite/texture factory for the battle renderer.
 *
 * The project ships ZERO binary art assets, so every sprite in the 2.5D battle
 * scene is drawn ONCE into an offscreen {@link Phaser.GameObjects.Graphics} and
 * baked into a GPU texture via `generateTexture(key, w, h)`. Baked textures are
 * cached by a key derived from the entity type + team + variant, so a given
 * sprite is only generated a single time and thereafter reused by many
 * {@link Phaser.GameObjects.Image} billboards. Nothing here regenerates a
 * texture per frame.
 *
 * STYLE: each sprite is authored on a SMALL integer texel grid and drawn as
 * BLOCKY, hard-edged pixels from a LIMITED five-tone palette derived from the
 * caller's accent color (see {@link ./palette}). We only ever fill
 * integer-aligned rectangles (no anti-aliased circles/arcs/rounded rects), and
 * curves/diagonals are stair-stepped as blocks. The grid is baked at a small
 * integer multiple (`TEXEL` block size) so that, combined with the Phaser
 * `render.pixelArt` (nearest-neighbor) config in PhaserGame.tsx and Scale.FIT,
 * the sprites blow up into crisp chunky retro pixels instead of blurring.
 *
 * Unlike the `rift/*` modules (which stay pure and Phaser-free), this is an
 * explicit RENDER helper, so it MAY import Phaser. It contains no gameplay
 * logic: it only turns a description of an entity into a stylized pixel-art
 * texture, tinted by the caller-supplied accent/team color. The pure color math
 * lives in {@link ./palette} and is unit-tested there.
 *
 * Each entity is drawn as an upright BILLBOARD (a stylized front-facing
 * silhouette) meant to be paired, at draw time, with a separate ground-shadow
 * ellipse and lifted off the ground plane so it reads as "standing" in the
 * dimetric view (see BattleScene syncVisuals + iso.ts HEIGHT_SCALE).
 */

import Phaser from 'phaser';
import type { ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import {
  darken,
  derivePalette,
  hexToInt,
  lighten,
  type SpritePalette,
} from './palette';

/** Team a sprite belongs to; used only to bias the outline/rim color. */
export type SpriteTeam = 'ally' | 'enemy';

/** Baked size (in texture pixels) of a generated billboard sprite. */
export interface SpriteSize {
  width: number;
  height: number;
  /**
   * Y offset (in texture pixels, measured from the texture's top) of the
   * sprite's ground-contact point. The billboard image is placed so this point
   * sits on the projected ground, then lifted by the entity's height.
   */
  footY: number;
}

/** A description of a champion billboard to bake. */
export interface ChampionSpriteSpec {
  kind: 'champion';
  role: ChampionRole;
  accent: string;
  team: SpriteTeam;
}

/** A description of a lane-minion billboard to bake. */
export interface MinionSpriteSpec {
  kind: 'minion';
  type: MinionType;
  accent: string;
  team: SpriteTeam;
}

/** A description of a structure billboard to bake. */
export interface StructureSpriteSpec {
  kind: 'structure';
  tier: 'turret' | 'inhibitor' | 'nexus';
  accent: string;
  team: SpriteTeam;
}

/** A description of an epic/jungle marker billboard to bake. */
export interface MarkerSpriteSpec {
  kind: 'marker';
  variant: 'jungle' | 'dragon' | 'baron' | 'herald';
}

export type SpriteSpec =
  | ChampionSpriteSpec
  | MinionSpriteSpec
  | StructureSpriteSpec
  | MarkerSpriteSpec;

/** Rim/outline color per team (kept bright so the ally/enemy tell reads). */
const TEAM_RIM: Record<SpriteTeam, number> = {
  ally: 0x8fd7ff,
  enemy: 0xff8a7a,
};

/**
 * Texel block size: how many real texture pixels each authored grid cell
 * occupies when baked. A grid cell is a hard square block; combined with the
 * scene's nearest-neighbor upscaling this keeps the "chunky pixel" read.
 */
const TEXEL = 3;

/**
 * A tiny helper that treats the offscreen Graphics as a coarse pixel grid:
 * every `px`/`rect` call fills BLOCKY, integer-aligned rectangles scaled by
 * {@link TEXEL}. No anti-aliased primitives are ever used, so baked edges stay
 * perfectly hard. Coordinates are in GRID (texel) units, not pixels.
 */
class PixelGrid {
  constructor(private readonly g: Phaser.GameObjects.Graphics) {}

  /** Fill a single texel block at grid (x, y). */
  px(x: number, y: number, color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha);
    this.g.fillRect(x * TEXEL, y * TEXEL, TEXEL, TEXEL);
  }

  /** Fill a `w`x`h` block of texels with its top-left at grid (x, y). */
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle(color, alpha);
    this.g.fillRect(x * TEXEL, y * TEXEL, w * TEXEL, h * TEXEL);
  }

  /** Draw a 1-texel-thick hard outline just OUTSIDE the given texel box. */
  outlineBox(x: number, y: number, w: number, h: number, color: number): void {
    this.rect(x - 1, y - 1, w + 2, 1, color); // top
    this.rect(x - 1, y + h, w + 2, 1, color); // bottom
    this.rect(x - 1, y, 1, h, color); // left
    this.rect(x + w, y, 1, h, color); // right
  }
}

/**
 * Factory that bakes and caches procedural pixel-art billboard textures. One
 * instance is created per {@link Phaser.Scene}; textures live in the scene's
 * texture manager and are keyed so repeated requests reuse the same baked image.
 */
export class SpriteFactory {
  private readonly scene: Phaser.Scene;
  /** Cache of baked sizes, keyed by texture key. */
  private readonly sizes = new Map<string, SpriteSize>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Stable texture key for a spec (drives the once-only generation cache). */
  private keyFor(spec: SpriteSpec): string {
    switch (spec.kind) {
      case 'champion':
        return `spr-champ-${spec.role}-${spec.accent.replace('#', '')}-${spec.team}`;
      case 'minion':
        return `spr-minion-${spec.type}-${spec.accent.replace('#', '')}-${spec.team}`;
      case 'structure':
        return `spr-struct-${spec.tier}-${spec.accent.replace('#', '')}-${spec.team}`;
      case 'marker':
        return `spr-marker-${spec.variant}`;
    }
  }

  /**
   * Return the texture key for a spec, generating and caching the texture on
   * first request. Never regenerates an existing texture.
   */
  ensure(spec: SpriteSpec): { key: string; size: SpriteSize } {
    const key = this.keyFor(spec);
    if (this.scene.textures.exists(key)) {
      return { key, size: this.sizes.get(key)! };
    }
    const size = this.bake(key, spec);
    this.sizes.set(key, size);
    return { key, size };
  }

  /** Draw the spec into an offscreen Graphics and bake it to `key`. */
  private bake(key: string, spec: SpriteSpec): SpriteSize {
    const g = this.scene.add.graphics();
    g.setVisible(false);
    const grid = new PixelGrid(g);
    let size: SpriteSize;
    switch (spec.kind) {
      case 'champion':
        size = this.drawChampion(grid, spec);
        break;
      case 'minion':
        size = this.drawMinion(grid, spec);
        break;
      case 'structure':
        size = this.drawStructure(grid, spec);
        break;
      case 'marker':
        size = this.drawMarker(grid, spec);
        break;
    }
    g.generateTexture(key, size.width, size.height);
    g.destroy();
    return size;
  }

  // -- Champion: upright pixel figure + head + an archetype motif ----------

  private drawChampion(grid: PixelGrid, spec: ChampionSpriteSpec): SpriteSize {
    // Authored on an 18x26 texel grid; baked to 54x78 px at TEXEL=3.
    const GW = 18;
    const GH = 26;
    const pal = derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]);
    const cx = GW / 2; // 9

    // --- Legs (two blocky stumps) ---
    grid.rect(6, 21, 2, 4, pal.shadow);
    grid.rect(10, 21, 2, 4, pal.shadow);
    grid.outlineBox(6, 21, 2, 4, pal.outline);
    grid.outlineBox(10, 21, 2, 4, pal.outline);

    // --- Torso: blocky trapezoid (shadow side + base + lit front strip) ---
    const bx = 4;
    const by = 10;
    const bw = 10;
    const bh = 12;
    grid.rect(bx, by, bw, bh, pal.shadow); // full body base = shadow tone
    grid.rect(bx + 1, by, bw - 2, bh, pal.base); // main body plate
    grid.rect(bx + 2, by + 1, 3, bh - 2, pal.light); // front-lit strip
    grid.outlineBox(bx, by, bw, bh, pal.outline);
    // Team rim: a bright 1-texel highlight down the lit shoulder edge.
    grid.rect(bx + 1, by, 1, bh, pal.rim);

    // --- Shoulders (slightly wider block) ---
    grid.rect(bx - 1, by, 1, 3, pal.shadow);
    grid.rect(bx + bw, by, 1, 3, pal.shadow);

    // --- Head (blocky, skin-toned) ---
    const HEAD = 0xf0e6d2;
    const hx = cx - 3; // 6
    const hy = 4;
    grid.rect(hx, hy, 6, 6, HEAD);
    grid.rect(hx + 1, hy + 1, 4, 2, lighten(HEAD, 0.2)); // lit brow
    grid.rect(hx + 1, hy + 4, 4, 1, darken(HEAD, 0.3)); // jaw shadow
    grid.outlineBox(hx, hy, 6, 6, pal.outline);

    // --- Archetype motif (held prop, drawn as blocks in a lighter accent) ---
    this.drawChampionMotif(grid, spec.role, pal);

    return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
  }

  private drawChampionMotif(grid: PixelGrid, role: ChampionRole, pal: SpritePalette) {
    const motif = lighten(pal.base, 0.5);
    const motifDark = darken(motif, 0.35);
    switch (role) {
      case 'marksman': {
        // A bow: a stair-stepped vertical arc on the right, blocky string.
        grid.rect(15, 8, 1, 2, motif);
        grid.rect(16, 10, 1, 5, motif);
        grid.rect(15, 15, 1, 2, motif);
        grid.rect(14, 11, 1, 3, motifDark); // grip
        grid.rect(13, 9, 1, 8, motif); // bowstring
        break;
      }
      case 'assassin': {
        // Twin daggers crossing: two thin stair-stepped blades.
        grid.rect(13, 9, 1, 3, motif);
        grid.rect(14, 11, 1, 3, motif);
        grid.rect(15, 13, 1, 3, motif);
        grid.rect(4, 9, 1, 3, motif);
        grid.rect(3, 11, 1, 3, motif);
        grid.rect(2, 13, 1, 3, motif);
        break;
      }
      case 'bruiser': {
        // A shield: a solid plate on the left arm with a bright boss.
        grid.rect(1, 12, 4, 7, motifDark);
        grid.rect(2, 13, 2, 5, motif);
        grid.rect(2, 15, 2, 1, lighten(motif, 0.4)); // boss highlight
        grid.outlineBox(1, 12, 4, 7, pal.outline);
        break;
      }
      case 'mage': {
        // A staff with a glowing orb at the top.
        grid.rect(15, 6, 1, 15, motifDark); // shaft
        grid.rect(14, 3, 3, 3, motif); // orb
        grid.rect(15, 4, 1, 1, lighten(motif, 0.5)); // orb glint
        break;
      }
      case 'enchanter': {
        // A floating halo ring above the shoulder (blocky ring).
        grid.rect(13, 5, 3, 1, motif);
        grid.rect(13, 8, 3, 1, motif);
        grid.rect(12, 6, 1, 2, motif);
        grid.rect(16, 6, 1, 2, motif);
        grid.rect(14, 6, 1, 2, lighten(motif, 0.4)); // inner glow
        break;
      }
    }
  }

  // -- Minion: a small pixel pawn, bigger for siege/super ------------------

  private drawMinion(grid: PixelGrid, spec: MinionSpriteSpec): SpriteSize {
    // Base melee/caster on a 14x18 grid; siege/super get more texels so they
    // read as physically bigger threats (siege 16x20, super 18x24).
    const big = spec.type === 'super' ? 2 : spec.type === 'siege' ? 1 : 0;
    const GW = 14 + big * 2;
    const GH = 18 + big * 3;
    const pal = derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]);
    const cx = Math.floor(GW / 2);

    // Body: a squat blocky pawn.
    const bw = 8 + big * 2;
    const bh = 8 + big * 2;
    const bx = cx - Math.floor(bw / 2);
    const by = GH - bh - 2;
    grid.rect(bx, by, bw, bh, pal.shadow);
    grid.rect(bx + 1, by, bw - 2, bh, pal.base);
    grid.rect(bx + 1, by + 1, 2, bh - 2, pal.light); // lit strip
    grid.outlineBox(bx, by, bw, bh, pal.outline);
    grid.rect(bx + 1, by, 1, bh, pal.rim); // team rim edge

    // Head: a blocky knob.
    const hs = 4 + big;
    const hx = cx - Math.floor(hs / 2);
    const hy = by - hs;
    grid.rect(hx, hy, hs, hs, lighten(pal.base, 0.2));
    grid.outlineBox(hx, hy, hs, hs, pal.outline);

    // Siege/super: a cannon/spike jutting out to read as a bigger threat.
    if (spec.type === 'siege' || spec.type === 'super') {
      const barrel = lighten(pal.base, 0.4);
      grid.rect(bx + bw, by + 1, 2 + big, 2, barrel);
      grid.outlineBox(bx + bw, by + 1, 2 + big, 2, pal.outline);
    }

    return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
  }

  // -- Structure: tiered pixel tower / crystal with visible height ---------

  private drawStructure(grid: PixelGrid, spec: StructureSpriteSpec): SpriteSize {
    const pal = derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]);

    if (spec.tier === 'nexus') {
      // Tall crystal on a plinth. 22x38 grid -> 66x114 px.
      const GW = 22;
      const GH = 38;
      const cx = GW / 2; // 11
      // Plinth.
      grid.rect(2, GH - 6, GW - 4, 5, pal.shadow);
      grid.rect(3, GH - 6, GW - 6, 2, pal.base);
      grid.outlineBox(2, GH - 6, GW - 4, 5, pal.outline);
      // Crystal: a stair-stepped diamond built from horizontal blocks.
      const top = 2;
      const midY = 18;
      const botY = GH - 8;
      for (let y = top; y <= botY; y++) {
        // Half-width grows to the middle then shrinks.
        const t = y <= midY ? (y - top) / (midY - top) : (botY - y) / (botY - midY);
        const half = Math.max(1, Math.round(1 + t * 6));
        const tone = y < midY ? pal.light : pal.base;
        grid.rect(cx - half, y, half * 2, 1, tone);
      }
      // Bright core facet.
      grid.rect(cx - 1, top + 3, 2, midY - top - 3, lighten(pal.base, 0.5));
      // Hard outline pass down the crystal silhouette edges.
      for (let y = top; y <= botY; y++) {
        const t = y <= midY ? (y - top) / (midY - top) : (botY - y) / (botY - midY);
        const half = Math.max(1, Math.round(1 + t * 6));
        grid.px(cx - half - 1, y, pal.outline);
        grid.px(cx + half, y, pal.outline);
      }
      grid.rect(cx - 1, top - 1, 2, 1, pal.outline); // apex cap
      grid.rect(cx - 2, top, 1, 1, pal.rim); // rim glint
      return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
    }

    if (spec.tier === 'inhibitor') {
      // A squat pyramid with a glowing core. 16x24 grid -> 48x72 px.
      const GW = 16;
      const GH = 24;
      const cx = GW / 2; // 8
      // Base.
      grid.rect(2, GH - 5, GW - 4, 4, pal.shadow);
      grid.outlineBox(2, GH - 5, GW - 4, 4, pal.outline);
      // Stepped pyramid.
      const top = 3;
      const bot = GH - 6;
      for (let y = top; y <= bot; y++) {
        const half = Math.max(1, Math.round(1 + ((y - top) / (bot - top)) * 5));
        grid.rect(cx - half, y, half * 2, 1, y < (top + bot) / 2 ? pal.light : pal.base);
        grid.px(cx - half - 1, y, pal.outline);
        grid.px(cx + half, y, pal.outline);
      }
      // Glowing core.
      grid.rect(cx - 2, 10, 4, 4, lighten(pal.base, 0.5));
      grid.outlineBox(cx - 2, 10, 4, 4, pal.outline);
      grid.rect(cx - 1, 11, 1, 2, pal.rim);
      return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
    }

    // Turret: a stepped tower with a crenellated glowing head. 16x30 -> 48x90.
    const GW = 16;
    const GH = 30;
    const cx = GW / 2; // 8
    // Base foot.
    grid.rect(2, GH - 6, GW - 4, 5, pal.shadow);
    grid.outlineBox(2, GH - 6, GW - 4, 5, pal.outline);
    // Shaft.
    const sx = cx - 4;
    const sw = 8;
    const sy = 9;
    const sh = GH - 6 - sy;
    grid.rect(sx, sy, sw, sh, pal.shadow);
    grid.rect(sx + 1, sy, sw - 2, sh, pal.base);
    grid.rect(sx + 1, sy, 2, sh, pal.light); // lit column
    grid.outlineBox(sx, sy, sw, sh, pal.outline);
    grid.rect(sx + 1, sy, 1, sh, pal.rim); // team rim edge
    // Crenellated head (wider block with two notches).
    const hx = cx - 5;
    const hw = 10;
    grid.rect(hx, 3, hw, 6, pal.base);
    grid.rect(hx + 2, 2, 2, 1, pal.base); // merlon
    grid.rect(hx + hw - 4, 2, 2, 1, pal.base); // merlon
    grid.outlineBox(hx, 3, hw, 6, pal.outline);
    // Glowing eye.
    grid.rect(cx - 1, 5, 2, 2, lighten(pal.base, 0.6));
    grid.px(cx - 1, 5, pal.rim);
    return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
  }

  // -- Markers: jungle camp dot / epic monster pixel silhouette ------------

  private drawMarker(grid: PixelGrid, spec: MarkerSpriteSpec): SpriteSize {
    if (spec.variant === 'jungle') {
      // A small blocky leaf/gem dot. 8x8 grid -> 24x24 px.
      const GW = 8;
      const GH = 8;
      const green = 0x6fe08a;
      grid.rect(2, 2, 4, 4, green);
      grid.rect(3, 2, 2, 4, lighten(green, 0.3));
      grid.rect(2, 3, 1, 2, darken(green, 0.2));
      grid.outlineBox(2, 2, 4, 4, 0x0a2417);
      return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
    }

    // Epic monsters: larger blocky creature silhouettes. 18x20 grid -> 54x60px.
    const baseColor =
      spec.variant === 'dragon' ? 0xe8703a : spec.variant === 'baron' ? 0x9b6bff : 0x7ad0ff;
    const pal = derivePalette(baseColor, spec.variant === 'baron' ? 0xc9b0ff : 0xbfe9ff);
    const GW = 18;
    const GH = 20;

    // Hulking body (wide blocky mass).
    grid.rect(3, 11, 12, 6, pal.shadow);
    grid.rect(4, 11, 10, 5, pal.base);
    grid.rect(5, 12, 4, 2, pal.light); // lit flank
    grid.outlineBox(3, 11, 12, 6, pal.outline);

    // Head jutting to the right.
    grid.rect(11, 6, 5, 5, pal.base);
    grid.rect(12, 7, 2, 2, pal.light);
    grid.outlineBox(11, 6, 5, 5, pal.outline);
    // Horns (stair-stepped blocks).
    grid.rect(12, 4, 1, 2, lighten(pal.base, 0.2));
    grid.rect(14, 3, 1, 3, lighten(pal.base, 0.2));

    // Wings for dragon/herald (a stepped left wing); baron gets a spine hump.
    if (spec.variant !== 'baron') {
      grid.rect(1, 7, 2, 2, lighten(pal.base, 0.15));
      grid.rect(2, 9, 2, 2, lighten(pal.base, 0.15));
      grid.rect(3, 11, 1, 1, lighten(pal.base, 0.15));
      grid.outlineBox(1, 7, 2, 2, pal.outline);
    } else {
      grid.rect(4, 9, 2, 2, lighten(pal.base, 0.25));
      grid.rect(7, 9, 2, 2, lighten(pal.base, 0.25));
    }

    return { width: GW * TEXEL, height: GH * TEXEL, footY: (GH - 1) * TEXEL };
  }
}
