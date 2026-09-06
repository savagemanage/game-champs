import { describe, it, expect } from 'vitest';
import { classifyGesture, mapDragToMove } from './touch';

describe('classifyGesture', () => {
  it('classifies a quick stationary press as a tap', () => {
    const g = classifyGesture({ startX: 100, startY: 100, endX: 103, endY: 98, durationMs: 90 });
    expect(g.type).toBe('tap');
  });

  it('classifies a fast long flick as a swipe with a direction', () => {
    const g = classifyGesture({ startX: 0, startY: 0, endX: 120, endY: 5, durationMs: 120 });
    expect(g.type).toBe('swipe');
    expect(g.direction).toBe('right');
    expect(g.dx).toBe(120);
  });

  it('detects vertical swipe directions', () => {
    expect(
      classifyGesture({ startX: 0, startY: 0, endX: 0, endY: -100, durationMs: 100 }).direction,
    ).toBe('up');
    expect(
      classifyGesture({ startX: 0, startY: 0, endX: 0, endY: 100, durationMs: 100 }).direction,
    ).toBe('down');
    expect(
      classifyGesture({ startX: 0, startY: 0, endX: -100, endY: 0, durationMs: 100 }).direction,
    ).toBe('left');
  });

  it('classifies a slow sustained move as a drag', () => {
    // Far enough to not be a tap, but too slow to be a swipe.
    const g = classifyGesture({ startX: 0, startY: 0, endX: 200, endY: 0, durationMs: 900 });
    expect(g.type).toBe('drag');
    expect(g.direction).toBeUndefined();
  });

  it('classifies a short slow move (past tap distance) as a drag', () => {
    const g = classifyGesture({ startX: 0, startY: 0, endX: 30, endY: 0, durationMs: 500 });
    expect(g.type).toBe('drag');
  });

  it('honors custom thresholds', () => {
    // Raise the tap distance so a 30px move counts as a tap.
    const g = classifyGesture(
      { startX: 0, startY: 0, endX: 30, endY: 0, durationMs: 100 },
      { tapMaxDistance: 50 },
    );
    expect(g.type).toBe('tap');
  });

  it('degrades a malformed gesture to a tap-at-origin', () => {
    const g = classifyGesture({ startX: NaN, startY: NaN, endX: NaN, endY: NaN, durationMs: NaN });
    expect(g.type).toBe('tap');
    expect(g.dx).toBe(0);
    expect(g.dy).toBe(0);
  });
});

describe('mapDragToMove', () => {
  it('returns zero inside the deadzone', () => {
    expect(mapDragToMove(3, 2, 8)).toEqual({ moveX: 0, moveY: 0 });
  });

  it('maps a drag within the radius to a proportional vector', () => {
    // radius 80: 40px right = 0.5 deflection.
    expect(mapDragToMove(40, 0, 8, 80)).toEqual({ moveX: 0.5, moveY: 0 });
  });

  it('clamps deflection to [-1, 1] past the radius', () => {
    const m = mapDragToMove(200, -200, 8, 80);
    expect(m.moveX).toBe(1);
    expect(m.moveY).toBe(-1);
  });

  it('coerces non-finite displacement to no movement', () => {
    expect(mapDragToMove(NaN, NaN)).toEqual({ moveX: 0, moveY: 0 });
  });
});
