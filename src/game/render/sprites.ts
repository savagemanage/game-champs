/**
 * SVG-VECTOR sprite/texture factory for the battle renderer.
 *
 * The project ships ZERO binary art assets. Every in-canvas entity is authored
 * as REAL illustrated vector art (SVG markup strings built by the pure,
 * Phaser-free {@link ./svgArt} module), rasterized ONCE to a GPU texture and
 * cached by a key derived from the entity type + team + variant. A given sprite
 * is therefore rasterized a single time and thereafter reused by many
 * {@link Phaser.GameObjects.Image} billboards. Nothing here regenerates a
 * texture per frame.
 *
 * PIPELINE: {@link SpriteFactory.ensure} derives the caller's five-tone palette
 * from the accent + team rim (see {@link ./palette}), asks {@link ./svgArt} for
 * the matching SVG string + intrinsic geometry, and bakes it. Because decoding
 * an SVG into an image is ASYNC, `ensure` returns immediately with a synchronous
 * transparent PLACEHOLDER texture of the correct `{width, height}` (so
 * billboards created right away are positioned correctly but invisible), kicks
 * off the async decode, and when it resolves REPLACES/REFRESHES that same
 * texture key in-place so the existing Images pick up the finished art. The
 * public contract - `ensure(spec) -> {key, size:{width,height,footY}}` with
 * `footY` marking the ground-contact point - is unchanged, so BattleScene needs
 * no changes.
 *
 * HEADLESS GUARD: rasterization needs `document`/`Image`/`<canvas>`, which
 * jsdom (the unit-test environment) cannot decode SVG through. When those are
 * unavailable we register only the blank placeholder texture and skip the
 * decode entirely - mirroring the {@link ../audio} no-op-when-unavailable
 * precedent - so the Vitest suite and the production build stay green. All the
 * unit-testable string/geometry logic lives in {@link ./svgArt}; nothing here
 * is unit tested.
 *
 * Each entity is drawn as an upright BILLBOARD (a stylized front-facing figure)
 * meant to be paired, at draw time, with a separate ground-shadow ellipse and
 * lifted off the ground plane so it reads as "standing" in the dimetric view
 * (see BattleScene syncVisuals + iso.ts HEIGHT_SCALE).
 */

import Phaser from 'phaser';
import type { ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import { derivePalette, hexToInt } from './palette';
import {
  MARKER_PALETTES,
  TEAM_RIM,
  championArt,
  markerArt,
  minionArt,
  structureArt,
  vfxArt,
  type SpriteTeam,
  type SvgArt,
  type VfxKind,
} from './svgArt';

export type { SpriteTeam };

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

/**
 * Resolution multiplier: the backing CanvasTexture is created at
 * `intrinsic * RASTER_SCALE` pixels and the decoded SVG is drawn at that higher
 * density, so the texture genuinely carries extra detail. The on-screen
 * (display) size reported via {@link SpriteSize} stays at the intrinsic viewBox
 * dimensions, so BattleScene anchoring/shadows/depth are unchanged; callers pin
 * the Image's display size to the intrinsic {@link SpriteSize} (see
 * `makeBillboard`/`spawnMarker`), letting Phaser scale the denser texture down
 * at draw time for crisp vectors when Scale.FIT blows up the 900x640 stage.
 */
const RASTER_SCALE = 2;

/**
 * True when we can actually decode an SVG to a texture (real browser). jsdom
 * lacks working `<canvas>`/`Image` SVG decode, so we detect that and fall back
 * to a blank placeholder, mirroring the audio.ts no-op-when-unavailable guard.
 */
function canRasterize(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Image !== 'undefined'
  );
}

/**
 * Factory that bakes and caches illustrated SVG billboard textures. One
 * instance is created per {@link Phaser.Scene}; textures live in the scene's
 * texture manager and are keyed so repeated requests reuse the same baked image.
 */
export class SpriteFactory {
  private readonly scene: Phaser.Scene;
  /** Cache of baked sizes, keyed by texture key. */
  private readonly sizes = new Map<string, SpriteSize>();
  /** Whether we've already logged a decode failure (log at most once). */
  private loggedDecodeError = false;

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
   * Return the texture key for a spec, baking and caching the texture on first
   * request. Never regenerates an existing texture. The returned key resolves
   * synchronously (as a placeholder if the real art is still decoding).
   */
  ensure(spec: SpriteSpec): { key: string; size: SpriteSize } {
    const key = this.keyFor(spec);
    if (this.scene.textures.exists(key)) {
      return { key, size: this.sizes.get(key)! };
    }
    const art = this.artFor(spec);
    const width = art.viewW;
    const height = art.viewH;
    const size: SpriteSize = {
      width,
      height,
      footY: Math.round(art.footYFrac * height),
    };
    this.sizes.set(key, size);
    this.registerPlaceholder(key, width, height);
    if (canRasterize()) {
      this.rasterize(key, art, width, height);
    }
    return { key, size };
  }

  /**
   * Return the texture key for a combat/skill VFX texture, baking and caching
   * it on first request. VFX are keyed by (kind + color) so a given effect is
   * rasterized ONCE and reused across many transient effect instances. Reuses
   * the exact same rasterize-once/placeholder/headless-guard path as
   * {@link ensure}. Returns the key + baked size (intrinsic viewBox pixels).
   */
  ensureVfx(kind: VfxKind, color: number): { key: string; size: SpriteSize } {
    const hex = (color & 0xffffff).toString(16).padStart(6, '0');
    const key = `spr-vfx-${kind}-${hex}`;
    if (this.scene.textures.exists(key)) {
      return { key, size: this.sizes.get(key)! };
    }
    const art = vfxArt(kind, color);
    const width = art.viewW;
    const height = art.viewH;
    const size: SpriteSize = {
      width,
      height,
      footY: Math.round(art.footYFrac * height),
    };
    this.sizes.set(key, size);
    this.registerPlaceholder(key, width, height);
    if (canRasterize()) {
      this.rasterize(key, art, width, height);
    }
    return { key, size };
  }

  /** Build the SVG art description for a spec via the pure svgArt builders. */
  private artFor(spec: SpriteSpec): SvgArt {
    switch (spec.kind) {
      case 'champion':
        return championArt(
          spec.role,
          derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]),
        );
      case 'minion':
        return minionArt(
          spec.type,
          derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]),
        );
      case 'structure':
        return structureArt(
          spec.tier,
          derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]),
        );
      case 'marker': {
        const mp = MARKER_PALETTES[spec.variant];
        return markerArt(spec.variant, derivePalette(mp.base, mp.rim));
      }
    }
  }

  /**
   * Synchronously register a transparent placeholder texture of the correct
   * size so billboards created immediately are anchored/depth-sorted correctly
   * even before the real art finishes decoding (or forever, in headless tests).
   */
  private registerPlaceholder(key: string, width: number, height: number): void {
    if (this.scene.textures.exists(key)) return;
    // A CanvasTexture is a real, drawable texture of exactly this size and is
    // fully transparent until we draw onto it - perfect as a placeholder we can
    // later refresh in place when the SVG decodes.
    if (canRasterize()) {
      // Create the backing canvas at RASTER_SCALE density so the decoded SVG
      // can be drawn at 2x detail; callers pin the Image display size to the
      // intrinsic SpriteSize so the extra pixels are pure crispness, not scale.
      this.scene.textures.createCanvas(key, width * RASTER_SCALE, height * RASTER_SCALE);
    } else {
      // jsdom: no working canvas. Register a 1-frame blank so exists()/getFrame
      // succeed without needing a real 2D context.
      this.scene.textures.addBase64(
        key,
        // A tiny transparent GIF; the frame is resized via the size cache, and
        // headless tests never actually render pixels.
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      );
    }
  }

  /**
   * Kick off the async SVG decode and, when it resolves, draw the decoded image
   * onto the placeholder CanvasTexture and refresh it in place so existing
   * Images pick up the finished art. Rasterized exactly once per key. Decode
   * errors are swallowed (logged at most once) so the console stays clean.
   */
  private rasterize(key: string, art: SvgArt, width: number, height: number): void {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}`;
    const img = new Image();
    img.onload = () => {
      try {
        const tex = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
        if (!tex || typeof tex.getContext !== 'function') return;
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, tex.width, tex.height);
        ctx.drawImage(img, 0, 0, tex.width, tex.height);
        tex.refresh();
      } catch (err) {
        this.reportDecodeError(err);
      }
    };
    img.onerror = (err) => this.reportDecodeError(err);
    // Decode the SVG at RASTER_SCALE density; the CanvasTexture backing this key
    // was created at width*RASTER_SCALE x height*RASTER_SCALE, and the onload
    // draws the image onto it at that full size (drawImage -> tex.width/height),
    // so the baked texture retains the extra detail. Callers scale the Image
    // display size back down to the intrinsic SpriteSize.
    img.width = width * RASTER_SCALE;
    img.height = height * RASTER_SCALE;
    img.src = url;
  }

  /** Log an SVG decode/rasterize failure at most once to keep the console clean. */
  private reportDecodeError(err: unknown): void {
    if (this.loggedDecodeError) return;
    this.loggedDecodeError = true;
    // eslint-disable-next-line no-console
    console.warn('[sprites] SVG rasterization failed; using placeholder texture', err);
  }
}
