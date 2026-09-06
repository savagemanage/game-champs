/**
 * Procedural 2.5D sprite/texture factory for the battle renderer.
 *
 * The project ships ZERO binary art assets, so every sprite in the 2.5D battle
 * scene is drawn ONCE into an offscreen {@link Phaser.GameObjects.Graphics} and
 * baked into a GPU texture via `generateTexture(key, w, h)`. Baked textures are
 * cached by a key derived from the entity type + team + variant, so a given
 * sprite is only generated a single time and thereafter reused by many
 * {@link Phaser.GameObjects.Image} billboards. Nothing here regenerates a
 * texture per frame.
 *
 * Unlike the `rift/*` modules (which stay pure and Phaser-free), this is an
 * explicit RENDER helper, so it MAY import Phaser. It contains no gameplay
 * logic: it only turns a description of an entity into a stylized silhouette
 * texture, tinted by the caller-supplied accent/team color.
 *
 * Each entity is drawn as an upright BILLBOARD (a stylized front-facing
 * silhouette) meant to be paired, at draw time, with a separate ground-shadow
 * ellipse and lifted off the ground plane so it reads as "standing" in the
 * dimetric view (see BattleScene syncVisuals + iso.ts HEIGHT_SCALE).
 */

import Phaser from 'phaser';
import type { ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';

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

/** Rim/outline color per team (kept subtle so the accent still reads). */
const TEAM_RIM: Record<SpriteTeam, number> = {
  ally: 0x8fd7ff,
  enemy: 0xff8a7a,
};

const OUTLINE = 0x05100a;

/** Lighten a packed 0xRRGGBB color toward white by `amount` in [0,1]. */
function lighten(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red + (255 - c.red) * amount),
    Math.round(c.green + (255 - c.green) * amount),
    Math.round(c.blue + (255 - c.blue) * amount),
  );
}

/** Darken a packed 0xRRGGBB color toward black by `amount` in [0,1]. */
function darken(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red * (1 - amount)),
    Math.round(c.green * (1 - amount)),
    Math.round(c.blue * (1 - amount)),
  );
}

function hexToInt(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/**
 * Factory that bakes and caches procedural billboard textures. One instance is
 * created per {@link Phaser.Scene}; textures live in the scene's texture manager
 * and are keyed so repeated requests reuse the same baked image.
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
    let size: SpriteSize;
    switch (spec.kind) {
      case 'champion':
        size = this.drawChampion(g, spec);
        break;
      case 'minion':
        size = this.drawMinion(g, spec);
        break;
      case 'structure':
        size = this.drawStructure(g, spec);
        break;
      case 'marker':
        size = this.drawMarker(g, spec);
        break;
    }
    g.generateTexture(key, size.width, size.height);
    g.destroy();
    return size;
  }

  // -- Champion: upright body + head + an archetype motif ------------------

  private drawChampion(g: Phaser.GameObjects.Graphics, spec: ChampionSpriteSpec): SpriteSize {
    const w = 40;
    const h = 56;
    const accent = hexToInt(spec.accent);
    const rim = TEAM_RIM[spec.team];
    const cx = w / 2;

    // Cast shadow on the base (small dark oval already handled by BattleScene;
    // here we only draw the standing figure so it can float above the shadow).
    // Cloak / torso: a rounded trapezoid body.
    const bodyTop = 20;
    const bodyBottom = h - 4;
    g.fillStyle(darken(accent, 0.35), 1);
    g.fillRoundedRect(cx - 12, bodyTop, 24, bodyBottom - bodyTop, 6);
    // Front lit panel.
    g.fillStyle(accent, 1);
    g.fillRoundedRect(cx - 9, bodyTop + 2, 18, bodyBottom - bodyTop - 4, 5);
    g.fillStyle(lighten(accent, 0.3), 1);
    g.fillRoundedRect(cx - 7, bodyTop + 3, 6, bodyBottom - bodyTop - 8, 3);
    // Team rim outline around the torso.
    g.lineStyle(2, rim, 0.9);
    g.strokeRoundedRect(cx - 12, bodyTop, 24, bodyBottom - bodyTop, 6);

    // Head.
    g.fillStyle(0xf0e6d2, 1);
    g.fillCircle(cx, 14, 8);
    g.lineStyle(2, OUTLINE, 0.8);
    g.strokeCircle(cx, 14, 8);

    // Archetype motif drawn as a held prop, tinted lighter than the accent.
    const motif = lighten(accent, 0.45);
    this.drawChampionMotif(g, spec.role, cx, motif);

    return { width: w, height: h, footY: h - 3 };
  }

  private drawChampionMotif(
    g: Phaser.GameObjects.Graphics,
    role: ChampionRole,
    cx: number,
    motif: number,
  ) {
    g.lineStyle(3, motif, 1);
    switch (role) {
      case 'marksman': {
        // A bow: a curved arc on the right side.
        g.beginPath();
        g.arc(cx + 16, 30, 16, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
        g.strokePath();
        g.lineStyle(1.5, motif, 1);
        g.lineBetween(cx + 4, 15, cx + 4, 45); // bowstring
        break;
      }
      case 'assassin': {
        // Twin blades: two thin daggers crossing.
        g.fillStyle(motif, 1);
        g.fillTriangle(cx + 10, 42, cx + 14, 42, cx + 20, 12);
        g.fillTriangle(cx - 10, 42, cx - 14, 42, cx - 20, 12);
        break;
      }
      case 'bruiser': {
        // A shield: a rounded plate on the left arm.
        g.fillStyle(motif, 1);
        g.fillRoundedRect(cx - 22, 22, 12, 20, 4);
        g.lineStyle(1.5, OUTLINE, 0.7);
        g.strokeRoundedRect(cx - 22, 22, 12, 20, 4);
        break;
      }
      case 'mage': {
        // A staff with a glowing orb at the top.
        g.lineStyle(3, motif, 1);
        g.lineBetween(cx + 16, 12, cx + 16, 48);
        g.fillStyle(lighten(motif, 0.4), 1);
        g.fillCircle(cx + 16, 10, 6);
        break;
      }
      case 'enchanter': {
        // A floating orb / halo above the shoulder.
        g.lineStyle(2.5, motif, 1);
        g.strokeCircle(cx + 15, 16, 7);
        g.fillStyle(lighten(motif, 0.5), 0.9);
        g.fillCircle(cx + 15, 16, 3);
        break;
      }
    }
  }

  // -- Minion: a small pawn, bigger for siege/super ------------------------

  private drawMinion(g: Phaser.GameObjects.Graphics, spec: MinionSpriteSpec): SpriteSize {
    const scale = spec.type === 'super' ? 1.5 : spec.type === 'siege' ? 1.25 : 1;
    const w = Math.round(22 * scale);
    const h = Math.round(30 * scale);
    const accent = hexToInt(spec.accent);
    const rim = TEAM_RIM[spec.team];
    const cx = w / 2;

    // Body: a rounded pawn.
    g.fillStyle(darken(accent, 0.3), 1);
    g.fillRoundedRect(cx - 7 * scale, 12 * scale, 14 * scale, 16 * scale, 4 * scale);
    g.fillStyle(accent, 1);
    g.fillRoundedRect(cx - 5 * scale, 13 * scale, 10 * scale, 13 * scale, 3 * scale);
    g.lineStyle(1.5, rim, 0.85);
    g.strokeRoundedRect(cx - 7 * scale, 12 * scale, 14 * scale, 16 * scale, 4 * scale);
    // Head.
    g.fillStyle(lighten(accent, 0.25), 1);
    g.fillCircle(cx, 8 * scale, 5 * scale);
    g.lineStyle(1, OUTLINE, 0.7);
    g.strokeCircle(cx, 8 * scale, 5 * scale);
    // Siege/super get a little cannon/spike to read as bigger threats.
    if (spec.type === 'siege' || spec.type === 'super') {
      g.fillStyle(lighten(accent, 0.4), 1);
      g.fillRect(cx + 4 * scale, 14 * scale, 6 * scale, 4 * scale);
    }

    return { width: w, height: h, footY: h - 2 };
  }

  // -- Structure: tiered tower / crystal with visible height ---------------

  private drawStructure(g: Phaser.GameObjects.Graphics, spec: StructureSpriteSpec): SpriteSize {
    const accent = hexToInt(spec.accent);
    const rim = TEAM_RIM[spec.team];
    if (spec.tier === 'nexus') {
      // Tall crystal on a plinth.
      const w = 56;
      const h = 96;
      const cx = w / 2;
      g.fillStyle(darken(accent, 0.4), 1);
      g.fillRoundedRect(cx - 22, h - 18, 44, 16, 5); // plinth
      g.lineStyle(2, rim, 0.8);
      g.strokeRoundedRect(cx - 22, h - 18, 44, 16, 5);
      // Crystal body: a tall diamond.
      g.fillStyle(accent, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(cx, 6),
          new Phaser.Geom.Point(cx + 18, h - 30),
          new Phaser.Geom.Point(cx, h - 14),
          new Phaser.Geom.Point(cx - 18, h - 30),
        ],
        true,
      );
      g.fillStyle(lighten(accent, 0.5), 0.9);
      g.fillPoints(
        [
          new Phaser.Geom.Point(cx, 6),
          new Phaser.Geom.Point(cx + 8, h - 34),
          new Phaser.Geom.Point(cx, h - 20),
          new Phaser.Geom.Point(cx - 8, h - 34),
        ],
        true,
      );
      g.lineStyle(2.5, rim, 1);
      g.strokePoints(
        [
          new Phaser.Geom.Point(cx, 6),
          new Phaser.Geom.Point(cx + 18, h - 30),
          new Phaser.Geom.Point(cx, h - 14),
          new Phaser.Geom.Point(cx - 18, h - 30),
        ],
        true,
        true,
      );
      return { width: w, height: h, footY: h - 4 };
    }

    if (spec.tier === 'inhibitor') {
      const w = 44;
      const h = 60;
      const cx = w / 2;
      g.fillStyle(darken(accent, 0.4), 1);
      g.fillRoundedRect(cx - 16, h - 14, 32, 12, 4);
      g.fillStyle(accent, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(cx, 10),
          new Phaser.Geom.Point(cx + 14, h - 16),
          new Phaser.Geom.Point(cx - 14, h - 16),
        ],
        true,
      );
      g.fillStyle(lighten(accent, 0.4), 0.85);
      g.fillCircle(cx, h - 30, 7);
      g.lineStyle(2, rim, 0.9);
      g.strokeCircle(cx, h - 30, 7);
      return { width: w, height: h, footY: h - 3 };
    }

    // Turret: a stepped tower with a glowing top.
    const w = 40;
    const h = 76;
    const cx = w / 2;
    g.fillStyle(darken(accent, 0.45), 1);
    g.fillRoundedRect(cx - 16, h - 16, 32, 14, 4); // base
    g.fillStyle(darken(accent, 0.2), 1);
    g.fillRect(cx - 11, 24, 22, h - 38); // shaft
    g.lineStyle(2, rim, 0.85);
    g.strokeRect(cx - 11, 24, 22, h - 38);
    // Crenellated head.
    g.fillStyle(accent, 1);
    g.fillRoundedRect(cx - 14, 12, 28, 16, 4);
    // Glowing eye.
    g.fillStyle(lighten(accent, 0.6), 1);
    g.fillCircle(cx, 20, 5);
    g.lineStyle(2, rim, 1);
    g.strokeRoundedRect(cx - 14, 12, 28, 16, 4);
    return { width: w, height: h, footY: h - 4 };
  }

  // -- Markers: jungle camp dot / epic monster silhouette ------------------

  private drawMarker(g: Phaser.GameObjects.Graphics, spec: MarkerSpriteSpec): SpriteSize {
    if (spec.variant === 'jungle') {
      const w = 20;
      const h = 20;
      g.fillStyle(0x6fe08a, 0.9);
      g.fillCircle(w / 2, h / 2, 6);
      g.lineStyle(1.5, 0x0a2417, 1);
      g.strokeCircle(w / 2, h / 2, 6);
      return { width: w, height: h, footY: h - 2 };
    }
    // Epic monsters: larger creature silhouettes.
    const color =
      spec.variant === 'dragon' ? 0xe8703a : spec.variant === 'baron' ? 0x9b6bff : 0x7ad0ff;
    const w = 54;
    const h = 58;
    const cx = w / 2;
    // Hulking body.
    g.fillStyle(darken(color, 0.3), 1);
    g.fillEllipse(cx, h - 18, 40, 30);
    g.fillStyle(color, 1);
    g.fillEllipse(cx, h - 20, 32, 22);
    // Head + horns.
    g.fillStyle(lighten(color, 0.2), 1);
    g.fillCircle(cx + 12, h - 30, 9);
    g.fillStyle(darken(color, 0.15), 1);
    g.fillTriangle(cx + 8, h - 38, cx + 12, h - 48, cx + 16, h - 38);
    g.fillTriangle(cx + 16, h - 36, cx + 22, h - 44, cx + 22, h - 34);
    // Wings for dragon/herald.
    if (spec.variant !== 'baron') {
      g.fillStyle(lighten(color, 0.1), 0.9);
      g.fillTriangle(cx - 4, h - 30, cx - 26, h - 44, cx - 18, h - 22);
    }
    g.lineStyle(2, 0x120704, 0.9);
    g.strokeEllipse(cx, h - 20, 32, 22);
    return { width: w, height: h, footY: h - 4 };
  }
}
