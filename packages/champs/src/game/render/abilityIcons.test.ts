import { describe, expect, it } from 'vitest';
import {
  ABILITY_SLOT_ORDER,
  CHAMPIONS,
  getAllAbilities,
} from '../../data/champions';
import {
  ALL_ABILITY_ICON_IDS,
  abilityIconSvg,
  abilitySvgFor,
  resolveAbilityIconId,
} from './abilityIcons';

describe('ability icon resolver', () => {
  it('resolves every champion (passive + Q/W/E/R) slot to a known icon id', () => {
    for (const champion of CHAMPIONS) {
      for (const ability of getAllAbilities(champion)) {
        const id = resolveAbilityIconId(
          champion.id,
          ability.slot,
          ability.behavior,
        );
        expect(ALL_ABILITY_ICON_IDS).toContain(id);
      }
    }
  });

  it('covers all five ability slots for each champion', () => {
    for (const champion of CHAMPIONS) {
      for (const slot of ABILITY_SLOT_ORDER) {
        // Behavior does not matter for the flavored per-slot mapping, but pass
        // a valid one so the fallback path is also always defined.
        const id = resolveAbilityIconId(champion.id, slot, 'skillshot');
        expect(ALL_ABILITY_ICON_IDS).toContain(id);
      }
    }
  });

  it('gives every champion a distinct Q icon', () => {
    const qIcons = CHAMPIONS.map((champion) =>
      resolveAbilityIconId(champion.id, 'Q', champion.abilities[0].behavior),
    );
    expect(new Set(qIcons).size).toBe(CHAMPIONS.length);
  });

  it('falls back to a per-behavior glyph for unknown champions', () => {
    expect(resolveAbilityIconId('unknown', 'Q', 'skillshot')).toBe(
      'behavior-skillshot',
    );
    expect(resolveAbilityIconId('unknown', 'R', 'heal')).toBe('behavior-heal');
    expect(resolveAbilityIconId('unknown', 'W', 'dash')).toBe('behavior-dash');
    expect(resolveAbilityIconId('unknown', 'E', 'aoe')).toBe('behavior-aoe');
    expect(resolveAbilityIconId('unknown', 'Q', 'stun')).toBe('behavior-stun');
    expect(resolveAbilityIconId('unknown', 'P', 'buff')).toBe('behavior-buff');
  });
});

describe('ability icon SVG markup', () => {
  it('produces a valid self-contained svg for every icon id', () => {
    for (const id of ALL_ABILITY_ICON_IDS) {
      const svg = abilityIconSvg(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      // Self-contained: uses currentColor, no external references.
      expect(svg).toContain('currentColor');
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('url(');
      expect(svg).not.toContain('http');
    }
  });

  it('resolves and renders SVG markup for a real ability in one call', () => {
    const svg = abilitySvgFor('ashborne', 'Q', 'skillshot');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 24 24"');
  });
});
