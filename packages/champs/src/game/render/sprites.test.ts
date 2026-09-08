import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { championArt, vfxArt } from './svgArt';
import { derivePalette, hexToInt } from './palette';
import {
  CHAMPION_PREWARM_POSES,
  SpriteFactory,
  type ChampionSpriteSpec,
} from './sprites';

/**
 * These tests exercise the SpriteFactory texture-baking path (key derivation,
 * placeholder registration, headless guard, and the SpriteSize/footY contract)
 * without a real GPU. A lightweight fake scene records the texture-manager
 * calls the factory makes, so we can assert what would be registered.
 */

interface RegisteredTexture {
  key: string;
  kind: 'canvas' | 'base64';
  width?: number;
  height?: number;
}

function makeFakeScene() {
  const registered = new Map<string, RegisteredTexture>();
  const textures = {
    exists: (key: string) => registered.has(key),
    createCanvas: (key: string, width: number, height: number) => {
      registered.set(key, { key, kind: 'canvas', width, height });
      // Return a minimal CanvasTexture-like object; the async onload path is
      // not driven in these synchronous tests.
      return {
        width,
        height,
        getContext: () => ({ clearRect: () => {}, drawImage: () => {} }),
        refresh: () => {},
      };
    },
    addBase64: (key: string) => {
      registered.set(key, { key, kind: 'base64' });
    },
    get: (key: string) => registered.get(key),
  };
  const scene = { textures } as unknown as Phaser.Scene;
  return { scene, registered };
}

const CHAMP_SPEC: ChampionSpriteSpec = {
  kind: 'champion',
  championId: 'embermage',
  role: 'mage',
  accent: '#2fa8e0',
  team: 'ally',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpriteFactory.ensure', () => {
  it('returns a stable key derived from the spec', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const { key } = factory.ensure(CHAMP_SPEC);
    expect(key).toBe('spr-champ-embermage-mage-idle-2fa8e0-ally');
  });

  it('reports the intrinsic viewBox size and footY = round(footYFrac*height)', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const art = championArt(
      'mage',
      derivePalette(hexToInt('#2fa8e0'), 0x8fd7ff),
      { championId: 'embermage', pose: 'idle' },
    );
    const { size } = factory.ensure(CHAMP_SPEC);
    expect(size.width).toBe(art.viewW);
    expect(size.height).toBe(art.viewH);
    expect(size.footY).toBe(Math.round(art.footYFrac * art.viewH));
  });

  it('bakes the backing canvas at 3x the intrinsic resolution for crispness', () => {
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const { key, size } = factory.ensure(CHAMP_SPEC);
    const tex = registered.get(key)!;
    // The reported display size stays intrinsic, but the texture pixels are
    // baked at RASTER_SCALE (3x) density so vectors stay crisp under the
    // zoomed-in battle camera.
    expect(tex.kind).toBe('canvas');
    expect(tex.width).toBe(size.width * 3);
    expect(tex.height).toBe(size.height * 3);
  });

  it('caches: a second ensure() for the same spec does not re-register', () => {
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    factory.ensure(CHAMP_SPEC);
    const before = registered.size;
    const again = factory.ensure(CHAMP_SPEC);
    expect(registered.size).toBe(before);
    expect(again.key).toBe('spr-champ-embermage-mage-idle-2fa8e0-ally');
  });

  it('infers canonical identity and idle pose for legacy callers', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const legacy = factory.ensure({
      kind: 'champion',
      role: 'mage',
      accent: '#2FA8E0',
      team: 'ally',
    });
    expect(legacy.key).toBe('spr-champ-embermage-mage-idle-2fa8e0-ally');
  });

  it('includes champion identity and every bounded pose in texture keys', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const idle = factory.ensure(CHAMP_SPEC);
    const cast = factory.ensure({ ...CHAMP_SPEC, pose: 'castQ' });
    const unsafe = factory.ensure({
      ...CHAMP_SPEC,
      pose: 'dance' as ChampionSpriteSpec['pose'],
    });
    expect(idle.key).toContain('embermage-mage-idle');
    expect(cast.key).toContain('embermage-mage-castQ');
    expect(cast.key).not.toBe(idle.key);
    expect(unsafe.key).toBe(idle.key);
  });

  it('prewarms four authored variants and accounts for cache cardinality', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const handles = factory.prewarmChampion(CHAMP_SPEC);
    expect(handles).toHaveLength(CHAMPION_PREWARM_POSES.length);
    expect(new Set(handles.map(({ key }) => key)).size).toBe(4);
    expect(factory.getCacheCardinality()).toMatchObject({
      total: 4,
      champion: 4,
      vfx: 0,
    });
  });

  it('shares size/readiness metadata across factories for one texture manager', () => {
    const { scene, registered } = makeFakeScene();
    const first = new SpriteFactory(scene).ensure(CHAMP_SPEC);
    const second = new SpriteFactory(scene).ensure(CHAMP_SPEC);
    expect(second.key).toBe(first.key);
    expect(second.size).toEqual(first.size);
    expect(registered.size).toBe(1);
  });

  it('registers a blank base64 placeholder (no canvas) in a headless env', async () => {
    // Simulate the jsdom/no-decode branch by removing the Image global.
    vi.stubGlobal('Image', undefined);
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const handle = factory.ensure(CHAMP_SPEC);
    const tex = registered.get('spr-champ-embermage-mage-idle-2fa8e0-ally')!;
    expect(tex.kind).toBe('base64');
    await expect(handle.ready).resolves.toBe('placeholder');
    expect(factory.getCacheCardinality().placeholder).toBe(1);
  });
});

describe('SpriteFactory.ensureVfx', () => {
  it('keys VFX by kind + 6-digit hex color and reports intrinsic size', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const art = vfxArt('aoeRing', 0x4fa3ff);
    const { key, size } = factory.ensureVfx('aoeRing', 0x4fa3ff);
    expect(key).toBe('spr-vfx-aoeRing-4fa3ff');
    expect(size.width).toBe(art.viewW);
    expect(size.height).toBe(art.viewH);
    expect(size.footY).toBe(Math.round(art.footYFrac * art.viewH));
  });

  it('does not throw and registers a placeholder in a headless env', () => {
    vi.stubGlobal('Image', undefined);
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    expect(() => factory.ensureVfx('impact', 0xffffff)).not.toThrow();
    expect(registered.has('spr-vfx-impact-ffffff')).toBe(true);
  });
});
