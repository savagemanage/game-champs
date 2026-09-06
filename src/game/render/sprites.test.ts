import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { championArt, vfxArt } from './svgArt';
import { derivePalette, hexToInt } from './palette';
import { SpriteFactory, type SpriteSpec } from './sprites';

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

const CHAMP_SPEC: SpriteSpec = {
  kind: 'champion',
  role: 'mage',
  accent: '#4fa3ff',
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
    expect(key).toBe('spr-champ-mage-4fa3ff-ally');
  });

  it('reports the intrinsic viewBox size and footY = round(footYFrac*height)', () => {
    const { scene } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const art = championArt(
      'mage',
      derivePalette(hexToInt('#4fa3ff'), 0x8fd7ff),
    );
    const { size } = factory.ensure(CHAMP_SPEC);
    expect(size.width).toBe(art.viewW);
    expect(size.height).toBe(art.viewH);
    expect(size.footY).toBe(Math.round(art.footYFrac * art.viewH));
  });

  it('bakes the backing canvas at 2x the intrinsic resolution for crispness', () => {
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    const { key, size } = factory.ensure(CHAMP_SPEC);
    const tex = registered.get(key)!;
    // The reported display size stays intrinsic, but the texture pixels are 2x.
    expect(tex.kind).toBe('canvas');
    expect(tex.width).toBe(size.width * 2);
    expect(tex.height).toBe(size.height * 2);
  });

  it('caches: a second ensure() for the same spec does not re-register', () => {
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    factory.ensure(CHAMP_SPEC);
    const before = registered.size;
    const again = factory.ensure(CHAMP_SPEC);
    expect(registered.size).toBe(before);
    expect(again.key).toBe('spr-champ-mage-4fa3ff-ally');
  });

  it('registers a blank base64 placeholder (no canvas) in a headless env', () => {
    // Simulate the jsdom/no-decode branch by removing the Image global.
    vi.stubGlobal('Image', undefined);
    const { scene, registered } = makeFakeScene();
    const factory = new SpriteFactory(scene);
    expect(() => factory.ensure(CHAMP_SPEC)).not.toThrow();
    const tex = registered.get('spr-champ-mage-4fa3ff-ally')!;
    expect(tex.kind).toBe('base64');
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
