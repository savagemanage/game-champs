import { describe, expect, it } from 'vitest';
import { CHAMPIONS, getChampionById, type ChampionRole } from '../../data/champions';
import type { MinionType } from '../rift/minions';
import { derivePalette, hexToInt } from './palette';
import {
  CHAMPION_POSES,
  MARKER_PALETTES,
  TEAM_RIM,
  championArt,
  championArtSvg,
  championArtVariant,
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

  it('declares the shaded gradient defs and a ground-contact shadow', () => {
    const art = championArt('bruiser', pal);
    // volume shading + team-rim sheen + soft ground base are all wired
    expect(art.svg).toContain('linearGradient');
    expect(art.svg).toContain('radialGradient');
    expect(art.svg).toContain('-body');
    expect(art.svg).toContain('-rim');
    expect(art.svg).toContain('-ground');
    // the ground base is an ellipse referencing the ground gradient
    expect(art.svg).toContain('url(#g-ch-bruiser-ground)');
    expect(art.svg).toContain('<ellipse');
  });

  it('changes color when the accent changes', () => {
    const a = championArt('bruiser', derivePalette(0xff5533, RIM)).svg;
    const b = championArt('bruiser', derivePalette(0x33ff88, RIM)).svg;
    expect(a).not.toBe(b);
  });

  it('maps the finite pose vocabulary to four distinctive Embermage variants', () => {
    const markups = CHAMPION_POSES.map((pose) =>
      championArt('mage', pal, { championId: 'embermage', pose }).svg,
    );
    expect(new Set(markups).size).toBe(4);
    expect(new Set(CHAMPION_POSES.map(championArtVariant))).toEqual(
      new Set(['idle', 'stride', 'strike', 'channel']),
    );
    for (const markup of markups) {
      expect(markup).toContain('data-champion="embermage"');
      expectValidSvg(markup, 64, 92, 90 / 92);
    }
  });

  it('uses generic fallback art for non-benchmark mage identities', () => {
    const benchmark = championArt('mage', pal, { championId: 'embermage' }).svg;
    const fallback = championArt('mage', pal, { championId: 'unknown-mage' }).svg;
    expect(benchmark).toContain('data-champion="embermage"');
    expect(fallback).not.toContain('data-champion="embermage"');
    expect(fallback).toBe(championArt('mage', pal).svg);
  });
});

/**
 * Per-champion silhouette differentiation (FEAT-004): every roster champion,
 * not just embermage, must read as its own character rather than a recolor of
 * its same-role sibling, while unknown ids keep the role-generic art.
 */
describe('championArt per-champion motifs', () => {
  // The two roster champions that share each lane role.
  const SAME_ROLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['ashborne', 'duskarrow'], // marksman
    ['nightveil', 'grimtrail'], // assassin
    ['ironhold', 'thornwarden'], // bruiser
    ['embermage', 'frostquill'], // mage
    ['dawnsong', 'wardlight'], // enchanter
  ];

  /** Build a champion's idle art from its own role + accent, like the battle path. */
  function artFor(id: string): string {
    const champ = getChampionById(id)!;
    return championArt(champ.role, derivePalette(hexToInt(champ.accentColor), RIM), {
      championId: champ.id,
    }).svg;
  }

  it('renders every roster champion as a valid, sized SVG', () => {
    for (const champ of CHAMPIONS) {
      const art = championArt(champ.role, pal, { championId: champ.id });
      expectValidSvg(art.svg, art.viewW, art.viewH, art.footYFrac);
    }
  });

  it('gives the two champions of every role DIFFERENT silhouette markup', () => {
    for (const [a, b] of SAME_ROLE_PAIRS) {
      expect(artFor(a)).not.toBe(artFor(b));
    }
  });

  it('differs even when two same-role siblings share an identical palette', () => {
    // Isolate the SILHOUETTE from the accent: force the same palette on both.
    for (const [a, b] of SAME_ROLE_PAIRS) {
      const roleA = getChampionById(a)!.role;
      const svgA = championArt(roleA, pal, { championId: a }).svg;
      const svgB = championArt(roleA, pal, { championId: b }).svg;
      expect(svgA).not.toBe(svgB);
    }
  });

  it('tags each non-benchmark roster champion with its own motif overlay', () => {
    for (const champ of CHAMPIONS) {
      if (champ.id === 'embermage') continue; // bespoke path, not a motif overlay
      const svg = championArt(champ.role, pal, { championId: champ.id }).svg;
      expect(svg).toContain(`data-motif="${champ.id}"`);
    }
  });

  it('is deterministic: identical (champion, palette, pose) inputs are byte-identical', () => {
    for (const champ of CHAMPIONS) {
      const once = championArt(champ.role, pal, { championId: champ.id, pose: 'attack' }).svg;
      const twice = championArt(champ.role, pal, { championId: champ.id, pose: 'attack' }).svg;
      expect(once).toBe(twice);
    }
  });

  it('keeps role-generic fallback for unknown and generic-<role> ids', () => {
    for (const role of ROLES) {
      const plain = championArt(role, pal).svg;
      // The sentinel the sprite factory passes for unresolved identities.
      expect(championArt(role, pal, { championId: `generic-${role}` }).svg).toBe(plain);
      // A wholly unknown id also falls back with no motif overlay.
      const unknown = championArt(role, pal, { championId: 'no-such-champion' }).svg;
      expect(unknown).toBe(plain);
      expect(unknown).not.toContain('data-motif');
    }
  });

  it('does not regress embermage bespoke pose-aware art', () => {
    const poses = ['idle', 'move', 'attack', 'castR'] as const;
    const variants = poses.map(
      (pose) => championArt('mage', pal, { championId: 'embermage', pose }).svg,
    );
    // Still four distinct authored silhouettes, all tagged as embermage, and
    // NOT carrying the generic motif-overlay marker.
    for (const svg of variants) {
      expect(svg).toContain('data-champion="embermage"');
      expect(svg).not.toContain('data-motif="embermage"');
    }
    expect(new Set(variants).size).toBe(4);
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
      { championId: champ.id }, // championArtSvg threads the id through for the motif
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

  it('selects Embermage identity and a requested bounded pose', () => {
    const embermage = getChampionById('embermage')!;
    const expected = championArt(
      embermage.role,
      derivePalette(hexToInt(embermage.accentColor), TEAM_RIM.ally),
      { championId: embermage.id, pose: 'castR' },
    ).svg;
    expect(championArtSvg(embermage, 'ally', 'castR')).toBe(expected);
    expect(expected).toContain('data-variant="channel"');
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

  it('carries the team rim + a ground shadow so minions read as standing', () => {
    for (const type of MINION_TYPES) {
      const svg = minionArt(type, pal).svg;
      expect(svg).toContain(toHex(pal.rim));
      expect(svg).toContain(`url(#g-mn-${type}-ground)`);
    }
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

  it('wires a glowing core and the team rim so structures read as energized', () => {
    for (const tier of TIERS) {
      const svg = structureArt(tier, pal).svg;
      // glowing core references the radial core gradient
      expect(svg).toContain(`url(#g-st-${tier}-core)`);
      // team-rim tell present
      expect(svg).toContain(toHex(pal.rim));
    }
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

  it('declares glow + streak gradient defs so VFX read as authored energy', () => {
    for (const kind of VFX_KINDS) {
      const svg = vfxArt(kind, COLOR).svg;
      expect(svg).toContain('radialGradient');
      expect(svg).toContain('-glow');
    }
    // the aoe telegraph is a dashed ring; the projectile carries a hot trail
    expect(vfxArt('aoeRing', COLOR).svg).toContain('stroke-dasharray');
    expect(vfxArt('projectile', COLOR).svg).toContain('<circle');
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

  // FEAT-004: a champion's abilities should read as "theirs". The battle scene
  // tints every VFX with the caster's unique accentColor, so the (kind + color)
  // texture cache already yields a per-champion family. On top of that the cast
  // flare carries a small color-seeded signature flourish.
  it('tints every champion accent distinctly (per-champion VFX family)', () => {
    // Each of the ten roster accents is unique, so per-champion VFX differ.
    const accents = CHAMPIONS.map((c) => hexToInt(c.accentColor));
    expect(new Set(accents).size).toBe(CHAMPIONS.length);
    const flares = accents.map((accent) => vfxArt('castFlare', accent).svg);
    // No two champions share the same cast-flare markup.
    expect(new Set(flares).size).toBe(CHAMPIONS.length);
  });

  it('cast-flare signature is deterministic and a pure function of color', () => {
    for (const champ of CHAMPIONS) {
      const accent = hexToInt(champ.accentColor);
      expect(vfxArt('castFlare', accent).svg).toBe(vfxArt('castFlare', accent).svg);
    }
  });

  it('cast-flare signature flourish varies with the accent color where intended', () => {
    // Two deliberately different accents seed a different star point-count, so
    // the flourish is more than a recolor. (Colors chosen to fall in different
    // signature buckets.)
    const a = vfxArt('castFlare', 0x000000).svg;
    const b = vfxArt('castFlare', 0x0000ff).svg;
    expect(a).not.toBe(b);
  });
});
