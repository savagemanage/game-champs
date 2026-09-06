import { describe, expect, it } from 'vitest';
import { CHAMPIONS, getChampionById, type ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import { derivePalette, hexToInt } from './palette';
import {
  MARKER_PALETTES,
  TEAM_RIM,
  championArt,
  championArtSvg,
  markerArt,
  minionArt,
  structureArt,
  toHex,
  vfxArt,
  type VfxKind,
} from './svgArt';

const ACCENT = 0x4fa3ff;
const RIM = 0x8fd7ff;
const pal = derivePalette(ACCENT, RIM);

const ROLES: ChampionRole[] = ['marksman', 'assassin', 'bruiser', 'mage', 'enchanter'];
const MINION_TYPES: MinionType[] = ['melee', 'caster', 'siege', 'super'];
const TIERS = ['turret', 'inhibitor', 'nexus'] as const;
const VARIANTS = ['jungle', 'dragon', 'baron', 'herald'] as const;
const VFX_KINDS: VfxKind[] = [
  'projectile',
  'beam',
  'aoeRing',
  'castFlare',
  'impact',
  'heal',
  'stun',
  'death',
];

/** Every art builder must emit a valid-looking, sized SVG document. */
function expectValidSvg(svg: string, viewW: number, viewH: number, footYFrac: number) {
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toContain('viewBox');
  expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  expect(viewW).toBeGreaterThan(0);
  expect(viewH).toBeGreaterThan(0);
  expect(footYFrac).toBeGreaterThan(0);
  expect(footYFrac).toBeLessThanOrEqual(1);
}

describe('toHex', () => {
  it('formats a packed int as a 6-digit #rrggbb string', () => {
    expect(toHex(0x4fa3ff)).toBe('#4fa3ff');
    expect(toHex(0x000000)).toBe('#000000');
    expect(toHex(0xffffff)).toBe('#ffffff');
  });
});

describe('championArt', () => {
  it('returns a valid sized SVG for every role', () => {
    for (const role of ROLES) {
      const art = championArt(role, pal);
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('produces DIFFERENT markup for each of the 5 roles', () => {
    const markups = ROLES.map((role) => championArt(role, pal).svg);
    const unique = new Set(markups);
    expect(unique.size).toBe(ROLES.length);
  });

  it('embeds a palette-derived accent tone so tinting is wired', () => {
    const art = championArt('mage', pal);
    expect(art.svg).toContain(toHex(pal.base));
    // ally/enemy rim tell survives in the markup
    expect(art.svg).toContain(toHex(pal.rim));
  });

  it('changes color when the accent changes', () => {
    const a = championArt('bruiser', derivePalette(0xff5533, RIM)).svg;
    const b = championArt('bruiser', derivePalette(0x33ff88, RIM)).svg;
    expect(a).not.toBe(b);
  });
});

describe('championArtSvg', () => {
  it('returns a non-empty inline SVG string for a champion', () => {
    const svg = championArtSvg(CHAMPIONS[0]);
    expect(typeof svg).toBe('string');
    expect(svg.length).toBeGreaterThan(0);
    expect(svg).toContain('<svg');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('matches the battle art path (championArt + derivePalette + TEAM_RIM)', () => {
    const champ = CHAMPIONS[0];
    const expected = championArt(
      champ.role,
      derivePalette(hexToInt(champ.accentColor), TEAM_RIM.ally),
    ).svg;
    expect(championArtSvg(champ, 'ally')).toBe(expected);
    expect(championArtSvg(champ)).toBe(expected); // default team is 'ally'
  });

  it('differs by team so the ally/enemy rim tell survives', () => {
    const champ = CHAMPIONS[0];
    expect(championArtSvg(champ, 'ally')).not.toBe(championArtSvg(champ, 'enemy'));
    expect(championArtSvg(champ, 'ally')).toContain(toHex(TEAM_RIM.ally));
    expect(championArtSvg(champ, 'enemy')).toContain(toHex(TEAM_RIM.enemy));
  });

  it('varies by champion accent and role', () => {
    const marksman = getChampionById('ashborne')!;
    const assassin = getChampionById('nightveil')!;
    expect(championArtSvg(marksman)).not.toBe(championArtSvg(assassin));
    // accent color is embedded as the base tone
    expect(championArtSvg(marksman)).toContain(toHex(hexToInt(marksman.accentColor)));
  });
});

describe('minionArt', () => {
  it('returns a valid sized SVG for every minion type', () => {
    for (const type of MINION_TYPES) {
      const art = minionArt(type, pal);
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('scales bigger minions to larger viewboxes', () => {
    expect(minionArt('super', pal).viewH).toBeGreaterThan(minionArt('melee', pal).viewH);
  });
});

describe('structureArt', () => {
  it('returns a valid sized SVG for every tier', () => {
    for (const tier of TIERS) {
      const art = structureArt(tier, pal);
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('produces distinct markup per tier', () => {
    const markups = TIERS.map((tier) => structureArt(tier, pal).svg);
    expect(new Set(markups).size).toBe(TIERS.length);
  });
});

describe('markerArt', () => {
  it('returns a valid sized SVG for every variant', () => {
    for (const variant of VARIANTS) {
      const mp = MARKER_PALETTES[variant];
      const art = markerArt(variant, derivePalette(mp.base, mp.rim));
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('produces distinct markup per variant', () => {
    const markups = VARIANTS.map((variant) => {
      const mp = MARKER_PALETTES[variant];
      return markerArt(variant, derivePalette(mp.base, mp.rim)).svg;
    });
    expect(new Set(markups).size).toBe(VARIANTS.length);
  });
});

describe('vfxArt', () => {
  const COLOR = 0x4fa3ff;

  it('returns a valid sized SVG for every vfx kind', () => {
    for (const kind of VFX_KINDS) {
      const art = vfxArt(kind, COLOR);
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('embeds the requested color in every vfx kind so the tint carries through', () => {
    const hex = toHex(COLOR);
    for (const kind of VFX_KINDS) {
      expect(vfxArt(kind, COLOR).svg).toContain(hex);
    }
  });

  it('contains a viewBox and requested color together', () => {
    const art = vfxArt('projectile', COLOR);
    expect(art.svg).toContain('viewBox');
    expect(art.svg).toContain(toHex(COLOR));
  });

  it('changes markup when the color changes', () => {
    for (const kind of VFX_KINDS) {
      const a = vfxArt(kind, 0xff5533).svg;
      const b = vfxArt(kind, 0x33ff88).svg;
      expect(a).not.toBe(b);
    }
  });

  it('produces distinct markup per vfx kind', () => {
    const markups = VFX_KINDS.map((kind) => vfxArt(kind, COLOR).svg);
    expect(new Set(markups).size).toBe(VFX_KINDS.length);
  });
});
