/**
 * 2.5D projection math for the Summoner's Rift battle view.
 *
 * The game LOGIC lives on a flat, top-down square plane (see {@link ./map},
 * WORLD_SIZE x WORLD_SIZE world units, origin top-left, y grows downward). To
 * render that plane as a 2.5D scene we project each top-down world point onto a
 * dimetric ("2:1 isometric") SCREEN plane: the square world reads as a diamond
 * on the 900x640 canvas, sprites are billboarded upright and depth-sorted so
 * that whatever is lower on screen (nearer the viewer) draws on top.
 *
 * This module deliberately contains NO Phaser (and no DOM) references, so it is
 * a pure, exhaustively unit-testable sibling of {@link ./map} that runs in a
 * plain jsdom/node environment. The rendering layer (BattleScene) imports these
 * helpers and constants instead of re-deriving the transform, and re-maps
 * pointer input back to world space through {@link screenToWorld}.
 *
 * Projection overview
 * -------------------
 * We first centre the world about its middle, apply a 2:1 dimetric rotation
 *
 *   dx = (x - y)
 *   dy = (x + y) / 2
 *
 * (so the world's four corners become the four tips of a diamond), then scale
 * uniformly to fit the view with a margin and translate to the view centre.
 *
 * Corner behaviour (with the default projection):
 *   - world (0,0)      top-left      -> TOP tip of the diamond
 *   - world (W,W)      bottom-right  -> BOTTOM tip of the diamond
 *   - world (0,W)      bottom-left   -> LEFT tip of the diamond
 *   - world (W,0)      top-right     -> RIGHT tip of the diamond
 *   - world (W/2,W/2)  centre        -> view centre
 *
 * The ally base is bottom-left in world space ({@link BASE_POSITIONS}.ally),
 * so it projects toward the LEFT/lower-left of the diamond, matching the
 * current top-down orientation intuitively.
 */

import { WORLD_SIZE, type Vec2 } from './map';

/** A point in screen/canvas pixel space. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Shared projection parameters. These default to the battle canvas' logical
 * size so BattleScene can import {@link DEFAULT_PROJECTION} instead of
 * re-deriving the transform. All lengths are in canvas pixels / world units.
 */
export interface Projection {
  /** Logical view width in pixels (matches BattleScene VIEW_W). */
  viewWidth: number;
  /** Logical view height in pixels (matches BattleScene VIEW_H). */
  viewHeight: number;
  /** Empty border kept around the projected diamond, in pixels. */
  margin: number;
  /** Side length of the square world plane, in world units. */
  worldSize: number;
}

/** Logical battle view width in pixels (matches BattleScene VIEW_W). */
export const VIEW_W = 900;
/** Logical battle view height in pixels (matches BattleScene VIEW_H). */
export const VIEW_H = 640;
/** Border kept around the projected diamond, in pixels (matches BattleScene MARGIN). */
export const MARGIN = 20;

/**
 * The default projection used by the battle renderer. Matches BattleScene's
 * VIEW_W / VIEW_H / MARGIN so gameplay and rendering share ONE transform.
 */
export const DEFAULT_PROJECTION: Projection = {
  viewWidth: VIEW_W,
  viewHeight: VIEW_H,
  margin: MARGIN,
  worldSize: WORLD_SIZE,
};

/**
 * Vertical lift applied per unit of `heightOffset` when billboarding a sprite
 * off the ground plane, in screen pixels per world unit of height. Used both to
 * raise a sprite's drawn position and (negatively) to bias its depth so a
 * lifted sprite still sorts with its ground footprint.
 */
export const HEIGHT_SCALE = 0.5;

/**
 * Independent horizontal / vertical scales that map a raw dimetric coordinate
 * to fitted screen pixels.
 *
 * After centring the world about its middle (each axis in [-W/2, W/2]) and
 * applying the rotation `dx = cx - cy`, `dy = (cx + cy) / 2`, the diamond spans
 * `2 * worldSize` in raw-x (dx in [-W, W]) and `worldSize` in raw-y (dy in
 * [-W/2, W/2]).
 *
 * A single uniform scale would be bound by the (much wider) horizontal span and
 * leave a large vertical gap above/below the diamond (the raw diamond is only
 * half as tall as it is wide). To USE the stage we instead fit each axis
 * independently: `sx` fills the usable width and `sy` fills the usable height,
 * so the diamond tips reach all four margins. The transform stays a pure
 * axis-aligned affine map (scale + translate) after the rotation, so
 * {@link worldToScreen} / {@link screenToWorld} remain exact inverses.
 */
export interface ProjectionScale {
  /** Screen px per raw-dimetric unit along X. */
  sx: number;
  /** Screen px per raw-dimetric unit along Y. */
  sy: number;
}

export function projectionScale(
  proj: Projection = DEFAULT_PROJECTION,
): ProjectionScale {
  const usableW = proj.viewWidth - proj.margin * 2;
  const usableH = proj.viewHeight - proj.margin * 2;
  // Raw dimetric extents of the centred world: dx in [-W, W] (span 2W),
  // dy in [-W/2, W/2] (span W).
  const rawWidth = proj.worldSize * 2;
  const rawHeight = proj.worldSize;
  return { sx: usableW / rawWidth, sy: usableH / rawHeight };
}

/**
 * Project a top-down world point onto the dimetric screen plane.
 *
 * @param p    world-space point (0..worldSize on each axis).
 * @param proj projection parameters (defaults to {@link DEFAULT_PROJECTION}).
 * @returns    screen-space pixel point.
 */
export function worldToScreen(
  p: Vec2,
  proj: Projection = DEFAULT_PROJECTION,
): ScreenPoint {
  const { sx, sy } = projectionScale(proj);
  const half = proj.worldSize / 2;
  // Centre the world about its middle.
  const cx = p.x - half;
  const cy = p.y - half;
  // 2:1 dimetric rotation.
  const dx = cx - cy;
  const dy = (cx + cy) / 2;
  return {
    x: proj.viewWidth / 2 + dx * sx,
    y: proj.viewHeight / 2 + dy * sy,
  };
}

/**
 * Inverse of {@link worldToScreen}: map a screen-space pixel point back to a
 * top-down world point. Round-trips worldToScreen within floating-point
 * epsilon, so pointer input can be translated back to world coordinates.
 *
 * @param s    screen-space point.
 * @param proj projection parameters (defaults to {@link DEFAULT_PROJECTION}).
 * @returns    world-space point.
 */
export function screenToWorld(
  s: ScreenPoint,
  proj: Projection = DEFAULT_PROJECTION,
): Vec2 {
  const { sx, sy } = projectionScale(proj);
  const half = proj.worldSize / 2;
  // Undo translate + (per-axis) scale to recover the raw dimetric coordinates.
  const dx = (s.x - proj.viewWidth / 2) / sx;
  const dy = (s.y - proj.viewHeight / 2) / sy;
  // Invert the rotation:
  //   dx = cx - cy,  dy = (cx + cy) / 2
  //   => cx = dy + dx / 2,  cy = dy - dx / 2
  const cx = dy + dx / 2;
  const cy = dy - dx / 2;
  return { x: cx + half, y: cy + half };
}

/**
 * Depth-sort key for an entity at a world position, optionally lifted by
 * `heightOffset` world units off the ground plane.
 *
 * The key increases with the entity's projected screen Y so that entities lower
 * on screen (nearer the viewer) get a larger depth and draw ON TOP, matching
 * painter's-order expectations. A positive `heightOffset` lifts a sprite up but
 * should NOT change which ground footprint it sorts against, so it contributes
 * only a tiny positive bias (a taller sprite at the same footprint draws just
 * above a shorter one). Usable directly with Phaser's `setDepth`.
 *
 * @param worldPos     the entity's ground position in world space.
 * @param heightOffset height above the ground plane, in world units (default 0).
 * @param proj         projection parameters (defaults to {@link DEFAULT_PROJECTION}).
 */
export function depthFor(
  worldPos: Vec2,
  heightOffset = 0,
  proj: Projection = DEFAULT_PROJECTION,
): number {
  const groundY = worldToScreen(worldPos, proj).y;
  // Height gives a small positive tie-breaker so taller sprites at the same
  // footprint sort just above shorter ones, without leaping past nearer rows.
  return groundY + heightOffset * HEIGHT_SCALE * 0.001;
}
