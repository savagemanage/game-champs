import { describe, it, expect } from 'vitest';
import { makeRng, mulberry32, xmur3 } from './rng';

describe('xmur3', () => {
  it('returns a 32-bit unsigned integer', () => {
    const h = xmur3('hello');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('is deterministic and differs for different inputs', () => {
    expect(xmur3('a')).toBe(xmur3('a'));
    expect(xmur3('a')).not.toBe(xmur3('b'));
  });
});

describe('mulberry32', () => {
  it('produces a deterministic sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in the half-open range [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe('makeRng', () => {
  it('is deterministic for string and number seeds', () => {
    const s1 = makeRng('match:1');
    const s2 = makeRng('match:1');
    expect([s1(), s1(), s1()]).toEqual([s2(), s2(), s2()]);

    const n1 = makeRng(123);
    const n2 = makeRng(123);
    expect([n1(), n1()]).toEqual([n2(), n2()]);
  });

  it('treats a numeric seed the same as its string form', () => {
    const fromNumber = makeRng(99);
    const fromString = makeRng('99');
    expect([fromNumber(), fromNumber()]).toEqual([fromString(), fromString()]);
  });
});
