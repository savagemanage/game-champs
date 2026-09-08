/**
 * Bounded procedural SVG texture factory for the battle renderer.
 *
 * Specs resolve to deterministic keys and one cached rasterization. Champion
 * keys include canonical identity + a finite pose, while legacy callers that
 * only provide role/accent/team are matched back to the canonical roster and
 * default to `idle`. Unknown identities deliberately share role-generic art.
 */

import Phaser from 'phaser';
import { CHAMPIONS, type ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import { derivePalette, hexToInt } from './palette';
import {
  CHAMPION_POSES,
  MARKER_PALETTES,
  TEAM_RIM,
  championArt,
  markerArt,
  minionArt,
  structureArt,
  vfxArt,
  type ChampionPose,
  type SpriteTeam,
  type SvgArt,
  type VfxKind,
} from './svgArt';

export { CHAMPION_POSES };
export type { ChampionPose, SpriteTeam };

/** Baked display size of a generated billboard sprite. */
export interface SpriteSize {
  width: number;
  height: number;
  /** Ground-contact offset measured from the texture top. */
  footY: number;
}

/** A description of a champion billboard to bake. */
export interface ChampionSpriteSpec {
  kind: 'champion';
  role: ChampionRole;
  accent: string;
  team: SpriteTeam;
  /** Optional for source compatibility; canonical roster identity is inferred. */
  championId?: string;
  /** Optional for source compatibility; omitted poses resolve to `idle`. */
  pose?: ChampionPose;
}

export interface MinionSpriteSpec {
  kind: 'minion';
  type: MinionType;
  accent: string;
  team: SpriteTeam;
}

export interface StructureSpriteSpec {
  kind: 'structure';
  tier: 'turret' | 'inhibitor' | 'nexus';
  accent: string;
  team: SpriteTeam;
}

export interface MarkerSpriteSpec {
  kind: 'marker';
  variant: 'jungle' | 'dragon' | 'baron' | 'herald';
}

export type SpriteSpec =
  | ChampionSpriteSpec
  | MinionSpriteSpec
  | StructureSpriteSpec
  | MarkerSpriteSpec;

export type TextureReadiness = 'pending' | 'ready' | 'placeholder' | 'failed';

/** Additive handle: existing callers can keep destructuring only key + size. */
export interface SpriteTextureHandle {
  key: string;
  size: SpriteSize;
  /** Resolves after browser decode, or immediately to placeholder in headless mode. */
  ready: Promise<Exclude<TextureReadiness, 'pending'>>;
}

export interface TextureCacheCardinality {
  total: number;
  champion: number;
  vfx: number;
  pending: number;
  ready: number;
  placeholder: number;
  failed: number;
}

/** Four representative poses, matching the four authored Embermage variants. */
export const CHAMPION_PREWARM_POSES: readonly ChampionPose[] = [
  'idle',
  'move',
  'attack',
  'castR',
];

const RASTER_SCALE = 3;

type TextureCategory = SpriteSpec['kind'] | 'vfx';
type SettledReadiness = Exclude<TextureReadiness, 'pending'>;

interface TextureEntry {
  key: string;
  size: SpriteSize;
  category: TextureCategory;
  status: TextureReadiness;
  ready: Promise<SettledReadiness>;
}

/** Share metadata between factories that point at the same TextureManager. */
const MANAGER_CACHES = new WeakMap<object, Map<string, TextureEntry>>();

function cacheFor(manager: object): Map<string, TextureEntry> {
  let cache = MANAGER_CACHES.get(manager);
  if (!cache) {
    cache = new Map<string, TextureEntry>();
    MANAGER_CACHES.set(manager, cache);
  }
  return cache;
}

function canRasterize(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Image !== 'undefined'
  );
}

function normalizedHex(accent: string): string {
  return (hexToInt(accent) & 0xffffff).toString(16).padStart(6, '0');
}

/** Runtime guard keeps JavaScript/unsafe callers inside the finite pose cache. */
function normalizedPose(pose: ChampionPose | undefined): ChampionPose {
  return pose && (CHAMPION_POSES as readonly string[]).includes(pose) ? pose : 'idle';
}

function rosterIdentity(spec: ChampionSpriteSpec): string {
  const explicit = spec.championId
    ? CHAMPIONS.find((champion) => champion.id === spec.championId)
    : undefined;
  if (explicit) return explicit.id;

  const accent = normalizedHex(spec.accent);
  const inferred = CHAMPIONS.find(
    (champion) =>
      champion.role === spec.role && normalizedHex(champion.accentColor) === accent,
  );
  return inferred?.id ?? `generic-${spec.role}`;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class SpriteFactory {
  private readonly scene: Phaser.Scene;
  private readonly entries: Map<string, TextureEntry>;
  private loggedDecodeError = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.entries = cacheFor(scene.textures as unknown as object);
  }

  /** Deterministic key; champion identity and pose are always represented. */
  private keyFor(spec: SpriteSpec): string {
    switch (spec.kind) {
      case 'champion': {
        const championId = rosterIdentity(spec);
        const pose = normalizedPose(spec.pose);
        return `spr-champ-${championId}-${spec.role}-${pose}-${normalizedHex(spec.accent)}-${spec.team}`;
      }
      case 'minion':
        return `spr-minion-${spec.type}-${normalizedHex(spec.accent)}-${spec.team}`;
      case 'structure':
        return `spr-struct-${spec.tier}-${normalizedHex(spec.accent)}-${spec.team}`;
      case 'marker':
        return `spr-marker-${spec.variant}`;
    }
  }

  /** Ensure one figure texture and expose its asynchronous readiness. */
  ensure(spec: SpriteSpec): SpriteTextureHandle {
    const key = this.keyFor(spec);
    const cached = this.entries.get(key);
    if (cached) return this.handle(cached);
    return this.ensureArt(key, this.artFor(spec), spec.kind);
  }

  /** Ensure one bounded kind/color VFX texture. */
  ensureVfx(kind: VfxKind, color: number): SpriteTextureHandle {
    const hex = (color & 0xffffff).toString(16).padStart(6, '0');
    const key = `spr-vfx-${kind}-${hex}`;
    const cached = this.entries.get(key);
    if (cached) return this.handle(cached);
    return this.ensureArt(key, vfxArt(kind, color), 'vfx');
  }

  /** Batch ensure arbitrary specs without introducing a separate cache path. */
  prewarm(specs: readonly SpriteSpec[]): SpriteTextureHandle[] {
    return specs.map((spec) => this.ensure(spec));
  }

  /**
   * Prewarm the four authored champion variants. Reduced-motion clients only
   * prewarm idle unless a caller explicitly supplies a finite pose list.
   */
  prewarmChampion(
    spec: Omit<ChampionSpriteSpec, 'pose'>,
    poses?: readonly ChampionPose[],
  ): SpriteTextureHandle[] {
    const selected = poses ?? (prefersReducedMotion() ? ['idle'] : CHAMPION_PREWARM_POSES);
    return selected.map((pose) => this.ensure({ ...spec, pose }));
  }

  /** Manager-local cardinality/status accounting for budgets and diagnostics. */
  getCacheCardinality(): TextureCacheCardinality {
    const result: TextureCacheCardinality = {
      total: this.entries.size,
      champion: 0,
      vfx: 0,
      pending: 0,
      ready: 0,
      placeholder: 0,
      failed: 0,
    };
    for (const entry of this.entries.values()) {
      if (entry.category === 'champion') result.champion += 1;
      if (entry.category === 'vfx') result.vfx += 1;
      result[entry.status] += 1;
    }
    return result;
  }

  private handle(entry: TextureEntry): SpriteTextureHandle {
    return { key: entry.key, size: entry.size, ready: entry.ready };
  }

  private ensureArt(
    key: string,
    art: SvgArt,
    category: TextureCategory,
  ): SpriteTextureHandle {
    const size: SpriteSize = {
      width: art.viewW,
      height: art.viewH,
      footY: Math.round(art.footYFrac * art.viewH),
    };

    // Respect textures registered outside this factory while restoring size
    // metadata instead of returning the old undefined non-null assertion.
    if (this.scene.textures.exists(key)) {
      const entry: TextureEntry = {
        key,
        size,
        category,
        status: 'ready',
        ready: Promise.resolve('ready'),
      };
      this.entries.set(key, entry);
      return this.handle(entry);
    }

    this.registerPlaceholder(key, size.width, size.height);
    if (!canRasterize()) {
      const entry: TextureEntry = {
        key,
        size,
        category,
        status: 'placeholder',
        ready: Promise.resolve('placeholder'),
      };
      this.entries.set(key, entry);
      return this.handle(entry);
    }

    let settle!: (status: SettledReadiness) => void;
    const ready = new Promise<SettledReadiness>((resolve) => {
      settle = resolve;
    });
    const entry: TextureEntry = { key, size, category, status: 'pending', ready };
    this.entries.set(key, entry);
    this.rasterize(key, art, size.width, size.height, (status) => {
      entry.status = status;
      settle(status);
    });
    return this.handle(entry);
  }

  private artFor(spec: SpriteSpec): SvgArt {
    switch (spec.kind) {
      case 'champion':
        return championArt(
          spec.role,
          derivePalette(hexToInt(spec.accent), TEAM_RIM[spec.team]),
          {
            championId: rosterIdentity(spec),
            pose: normalizedPose(spec.pose),
          },
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
        const palette = MARKER_PALETTES[spec.variant];
        return markerArt(spec.variant, derivePalette(palette.base, palette.rim));
      }
    }
  }

  private registerPlaceholder(key: string, width: number, height: number): void {
    if (this.scene.textures.exists(key)) return;
    if (canRasterize()) {
      this.scene.textures.createCanvas(key, width * RASTER_SCALE, height * RASTER_SCALE);
    } else {
      this.scene.textures.addBase64(
        key,
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      );
    }
  }

  private rasterize(
    key: string,
    art: SvgArt,
    width: number,
    height: number,
    settle: (status: SettledReadiness) => void,
  ): void {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}`;
    const img = new Image();
    img.onload = () => {
      try {
        const texture = this.scene.textures.get(key) as Phaser.Textures.CanvasTexture;
        if (!texture || typeof texture.getContext !== 'function') {
          settle('failed');
          return;
        }
        const context = texture.getContext();
        context.clearRect(0, 0, texture.width, texture.height);
        context.drawImage(img, 0, 0, texture.width, texture.height);
        texture.refresh();
        settle('ready');
      } catch (error) {
        this.reportDecodeError(error);
        settle('failed');
      }
    };
    img.onerror = (error) => {
      this.reportDecodeError(error);
      settle('failed');
    };
    img.width = width * RASTER_SCALE;
    img.height = height * RASTER_SCALE;
    img.src = url;
  }

  private reportDecodeError(error: unknown): void {
    if (this.loggedDecodeError) return;
    this.loggedDecodeError = true;
    // eslint-disable-next-line no-console
    console.warn('[sprites] SVG rasterization failed; using placeholder texture', error);
  }
}
