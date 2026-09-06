import { describe, expect, it } from 'vitest';
import {
  darken,
  derivePalette,
  fromRgb,
  hexToInt,
  lighten,
  toRgb,
} from './palette';

describe('palette color helpers', () => {
  it('round-trips rgb channels', () => {
    expect(toRgb(0x123456)).toEqual([0x12, 0x34, 0x56]);
    expect(fromRgb(0x12, 0x34, 0x56)).toBe(0x123456);
  });

  it('clamps channels into byte range', () => {
    expect(fromRgb(-10, 300, 128)).toBe(fromRgb(0, 255, 128));
  });

  it('lighten moves toward white, darken toward black', () => {
    expect(lighten(0x000000, 1)).toBe(0xffffff);
    expect(lighten(0xffffff, 0.5)).toBe(0xffffff);
    expect(darken(0xffffff, 1)).toBe(0x000000);
    expect(darken(0x000000, 0.5)).toBe(0x000000);
  });

  it('lighten/darken by 0 is identity', () => {
    expect(lighten(0x8844cc, 0)).toBe(0x8844cc);
    expect(darken(0x8844cc, 0)).toBe(0x8844cc);
  });

  it('parses hex strings with and without leading #', () => {
    expect(hexToInt('#ff8a7a')).toBe(0xff8a7a);
    expect(hexToInt('8fd7ff')).toBe(0x8fd7ff);
  });
});

describe('derivePalette', () => {
  const accent = 0x4488cc;
  const rim = 0x8fd7ff;
  const p = derivePalette(accent, rim);

  it('keeps the accent as the base tone and passes the rim through', () => {
    expect(p.base).toBe(accent);
    expect(p.rim).toBe(rim);
  });

  it('produces a monotonic dark->light ramp (outline < shadow < base < light)', () => {
    const luma = (c: number) => {
      const [r, g, b] = toRgb(c);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    expect(luma(p.outline)).toBeLessThan(luma(p.shadow));
    expect(luma(p.shadow)).toBeLessThan(luma(p.base));
    expect(luma(p.base)).toBeLessThan(luma(p.light));
  });

  it('is deterministic for the same inputs', () => {
    expect(derivePalette(accent, rim)).toEqual(p);
  });
});
