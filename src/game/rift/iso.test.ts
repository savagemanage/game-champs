import { describe, it, expect } from 'vitest';
import {
  WORLD_SIZE,
  BASE_POSITIONS,
  SIDES,
  JUNGLE_CAMPS,
  EPIC_PITS,
  type Vec2,
} from './map';
import {
  DEFAULT_PROJECTION,
  VIEW_W,
  VIEW_H,
  MARGIN,
  HEIGHT_SCALE,
  projectionScale,
  worldToScreen,
  screenToWorld,
  depthFor,
  projectedWorldBounds,
  type ScreenPoint,
} from './iso';

const EPS = 1e-6;

const CENTER: Vec2 = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
const CORNERS = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: WORLD_SIZE, y: 0 },
  bottomLeft: { x: 0, y: WORLD_SIZE },
  bottomRight: { x: WORLD_SIZE, y: WORLD_SIZE },
} as const;

describe('projection constants', () => {
  it('default projection matches the battle view size + margin', () => {
    expect(DEFAULT_PROJECTION.viewWidth).toBe(VIEW_W);
    expect(DEFAULT_PROJECTION.viewHeight).toBe(VIEW_H);
    expect(DEFAULT_PROJECTION.margin).toBe(MARGIN);
    expect(DEFAULT_PROJECTION.worldSize).toBe(WORLD_SIZE);
    expect(VIEW_W).toBe(900);
    expect(VIEW_H).toBe(640);
    expect(MARGIN).toBe(20);
  });

  it('exposes positive per-axis fit scales and height scale', () => {
    const { sx, sy } = projectionScale();
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBeGreaterThan(0);
    expect(HEIGHT_SCALE).toBeGreaterThan(0);
  });

  it('fits X and Y independently so the diamond fills the view both ways', () => {
    const { sx, sy } = projectionScale();
    // The raw diamond is 2W wide but only W tall, so filling both axes needs a
    // larger vertical scale than horizontal (this is what removes the big
    // top/bottom dead margins of the old uniform fit).
    expect(sy).toBeGreaterThan(sx);
    // Each axis fills exactly to its usable span (view minus 2*margin).
    expect(sx).toBeCloseTo((VIEW_W - MARGIN * 2) / (WORLD_SIZE * 2), 6);
    expect(sy).toBeCloseTo((VIEW_H - MARGIN * 2) / WORLD_SIZE, 6);
  });
});

describe('worldToScreen corner + centre mapping', () => {
  it('maps the world centre to the view centre', () => {
    const s = worldToScreen(CENTER);
    expect(s.x).toBeCloseTo(VIEW_W / 2, 6);
    expect(s.y).toBeCloseTo(VIEW_H / 2, 6);
  });

  it('maps the four world corners to the four diamond tips', () => {
    const tl = worldToScreen(CORNERS.topLeft);
    const tr = worldToScreen(CORNERS.topRight);
    const bl = worldToScreen(CORNERS.bottomLeft);
    const br = worldToScreen(CORNERS.bottomRight);

    // top-left world -> TOP tip (smallest screen y, centred horizontally).
    expect(tl.x).toBeCloseTo(VIEW_W / 2, 6);
    // bottom-right world -> BOTTOM tip (largest screen y, centred horizontally).
    expect(br.x).toBeCloseTo(VIEW_W / 2, 6);
    // bottom-left world -> LEFT tip (smallest screen x, vertically centred).
    expect(bl.y).toBeCloseTo(VIEW_H / 2, 6);
    // top-right world -> RIGHT tip (largest screen x, vertically centred).
    expect(tr.y).toBeCloseTo(VIEW_H / 2, 6);

    // Ordering of the tips around the diamond.
    expect(tl.y).toBeLessThan(br.y);
    expect(bl.x).toBeLessThan(tr.x);
    expect(bl.x).toBeLessThan(tl.x);
    expect(tr.x).toBeGreaterThan(br.x);
  });

  it('keeps the ally base toward the lower-left of the diamond', () => {
    const ally = worldToScreen(BASE_POSITIONS.ally);
    const enemy = worldToScreen(BASE_POSITIONS.enemy);
    const center = worldToScreen(CENTER);
    // Ally base (bottom-left world) reads to the LEFT of centre - the lower-left
    // side of the diamond - matching the top-down orientation. It sits on the
    // world anti-diagonal so it projects at the diamond's vertical mid-line.
    expect(ally.x).toBeLessThan(center.x);
    expect(ally.y).toBeCloseTo(center.y, 6);
    // Enemy base (top-right world) mirrors it to the RIGHT of centre.
    expect(enemy.x).toBeGreaterThan(center.x);
    expect(enemy.y).toBeCloseTo(center.y, 6);
    // Ally and enemy bases are horizontally mirrored about the view centre.
    expect(ally.x).toBeLessThan(enemy.x);
    expect(center.x - ally.x).toBeCloseTo(enemy.x - center.x, 6);
  });
});

describe('screenToWorld inverts worldToScreen', () => {
  const samples: Vec2[] = [
    CENTER,
    CORNERS.topLeft,
    CORNERS.topRight,
    CORNERS.bottomLeft,
    CORNERS.bottomRight,
    BASE_POSITIONS.ally,
    BASE_POSITIONS.enemy,
    { x: 123.4, y: 2876.5 },
    { x: 2500, y: 400 },
    ...JUNGLE_CAMPS.map((c) => c.pos),
    ...EPIC_PITS.map((p) => p.pos),
  ];

  it('round-trips world -> screen -> world within epsilon', () => {
    for (const p of samples) {
      const back = screenToWorld(worldToScreen(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('round-trips screen -> world -> screen within epsilon', () => {
    const screenSamples: ScreenPoint[] = [
      { x: VIEW_W / 2, y: VIEW_H / 2 },
      { x: 100, y: 200 },
      { x: 800, y: 500 },
      { x: 450, y: 120 },
    ];
    for (const s of screenSamples) {
      const back = worldToScreen(screenToWorld(s));
      expect(back.x).toBeCloseTo(s.x, 6);
      expect(back.y).toBeCloseTo(s.y, 6);
    }
  });

  it('base positions from map.ts survive the round-trip', () => {
    for (const side of SIDES) {
      const back = screenToWorld(worldToScreen(BASE_POSITIONS[side]));
      expect(Math.abs(back.x - BASE_POSITIONS[side].x)).toBeLessThan(EPS);
      expect(Math.abs(back.y - BASE_POSITIONS[side].y)).toBeLessThan(EPS);
    }
  });
});

describe('depthFor ordering', () => {
  it('increases as the projected screen Y increases', () => {
    // Walk down the world main diagonal: screen Y strictly increases, so depth
    // must strictly increase (nearer-the-viewer rows draw on top).
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
      x: t * WORLD_SIZE,
      y: t * WORLD_SIZE,
    }));
    for (let i = 1; i < steps.length; i++) {
      expect(depthFor(steps[i])).toBeGreaterThan(depthFor(steps[i - 1]));
    }
  });

  it('tracks the projected screen Y for the same footprint', () => {
    const a: Vec2 = { x: 500, y: 500 };
    const b: Vec2 = { x: 2500, y: 2500 };
    // b projects lower on screen than a, so it must sort on top (larger depth).
    expect(worldToScreen(b).y).toBeGreaterThan(worldToScreen(a).y);
    expect(depthFor(b)).toBeGreaterThan(depthFor(a));
  });

  it('respects heightOffset ordering at the same ground footprint', () => {
    const ground: Vec2 = { x: 1500, y: 1500 };
    const grounded = depthFor(ground, 0);
    const lifted = depthFor(ground, 120);
    // A taller sprite at the same footprint sorts just above the shorter one.
    expect(lifted).toBeGreaterThan(grounded);
  });

  it('height bias never overtakes a genuinely nearer row', () => {
    // A lifted sprite on a far row must still sort below a grounded sprite on a
    // clearly nearer row, so height is only a tiny tie-breaker.
    const far: Vec2 = { x: 300, y: 300 };
    const near: Vec2 = { x: 2700, y: 2700 };
    expect(depthFor(far, 500)).toBeLessThan(depthFor(near, 0));
  });
});

describe('projected in-world points stay within the view', () => {
  it('keeps every in-world sample inside the view bounds (with margin)', () => {
    const samples: Vec2[] = [
      CORNERS.topLeft,
      CORNERS.topRight,
      CORNERS.bottomLeft,
      CORNERS.bottomRight,
      CENTER,
      BASE_POSITIONS.ally,
      BASE_POSITIONS.enemy,
      ...JUNGLE_CAMPS.map((c) => c.pos),
      ...EPIC_PITS.map((p) => p.pos),
    ];
    for (const p of samples) {
      const s = worldToScreen(p);
      // With independent X/Y fit the diamond now reaches all four margins, so
      // every in-world sample stays within the margin box on BOTH axes.
      expect(s.x).toBeGreaterThanOrEqual(MARGIN - EPS);
      expect(s.x).toBeLessThanOrEqual(VIEW_W - MARGIN + EPS);
      expect(s.y).toBeGreaterThanOrEqual(MARGIN - EPS);
      expect(s.y).toBeLessThanOrEqual(VIEW_H - MARGIN + EPS);
    }
  });

  it('the diamond fits the margins exactly at all four tips', () => {
    const left = worldToScreen(CORNERS.bottomLeft);
    const right = worldToScreen(CORNERS.topRight);
    const top = worldToScreen(CORNERS.topLeft);
    const bottom = worldToScreen(CORNERS.bottomRight);
    // Horizontal tips sit on the left/right margins.
    expect(left.x).toBeCloseTo(MARGIN, 6);
    expect(right.x).toBeCloseTo(VIEW_W - MARGIN, 6);
    // Vertical tips now sit on the top/bottom margins too (no dead band).
    expect(top.y).toBeCloseTo(MARGIN, 6);
    expect(bottom.y).toBeCloseTo(VIEW_H - MARGIN, 6);
  });
});

describe('projectedWorldBounds (camera setBounds source)', () => {
  it('covers the full projected diamond to the four margins with no padding', () => {
    const b = projectedWorldBounds();
    // The diamond tips sit on the margins, so the bounding box is the view
    // inset by the projection margin on all four sides.
    expect(b.minX).toBeCloseTo(MARGIN, 6);
    expect(b.minY).toBeCloseTo(MARGIN, 6);
    expect(b.width).toBeCloseTo(VIEW_W - MARGIN * 2, 6);
    expect(b.height).toBeCloseTo(VIEW_H - MARGIN * 2, 6);
  });

  it('contains every projected in-world corner and centre', () => {
    const b = projectedWorldBounds();
    const pts: Vec2[] = [
      CORNERS.topLeft,
      CORNERS.topRight,
      CORNERS.bottomLeft,
      CORNERS.bottomRight,
      CENTER,
    ];
    for (const p of pts) {
      const s = worldToScreen(p);
      expect(s.x).toBeGreaterThanOrEqual(b.minX - EPS);
      expect(s.x).toBeLessThanOrEqual(b.minX + b.width + EPS);
      expect(s.y).toBeGreaterThanOrEqual(b.minY - EPS);
      expect(s.y).toBeLessThanOrEqual(b.minY + b.height + EPS);
    }
  });

  it('expands symmetrically by the requested padding on every side', () => {
    const pad = 64;
    const base = projectedWorldBounds();
    const padded = projectedWorldBounds(DEFAULT_PROJECTION, pad);
    expect(padded.minX).toBeCloseTo(base.minX - pad, 6);
    expect(padded.minY).toBeCloseTo(base.minY - pad, 6);
    expect(padded.width).toBeCloseTo(base.width + pad * 2, 6);
    expect(padded.height).toBeCloseTo(base.height + pad * 2, 6);
  });
});
