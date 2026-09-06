/**
 * touch.ts - PURE, DOM/Phaser-free touch-input mapping so mouse/keyboard-only
 * games become phone-playable.
 *
 * The user asked that UX optimizations be shared across all games. On a phone
 * there is no mouse or WASD, so every game needs to turn a raw pointer gesture
 * (down -> move -> up) into a normalized INTENT: a tap (fire/confirm), a drag
 * (analog move/aim), or a swipe (a fast directional flick, e.g. dash/dodge).
 *
 * These helpers take plain numbers and return plain data - no Phaser pointer,
 * no DOM event - so they are trivially unit-testable. Each game wires its own
 * Phaser pointer events to these functions and maps the returned intent onto
 * its own controls.
 */

/** The classified kind of a pointer gesture. */
export type GestureType = 'tap' | 'drag' | 'swipe';

/** A cardinal/diagonal direction for a swipe. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Raw pointer gesture measured from pointerdown to pointerup. */
export interface GestureInput {
  /** Pointer x at gesture start (CSS/world px). */
  startX: number;
  /** Pointer y at gesture start. */
  startY: number;
  /** Pointer x at gesture end. */
  endX: number;
  /** Pointer y at gesture end. */
  endY: number;
  /** Elapsed time of the gesture in milliseconds. */
  durationMs: number;
}

/** Tunables for {@link classifyGesture}. */
export interface GestureOptions {
  /**
   * Max travel distance (px) that still counts as a tap rather than a drag.
   * Below this the gesture is stationary enough to be a tap.
   */
  tapMaxDistance?: number;
  /** Max duration (ms) for a tap; a longer stationary press is not a tap. */
  tapMaxDurationMs?: number;
  /**
   * Min travel distance (px) for a fast flick to be a swipe rather than a drag.
   */
  swipeMinDistance?: number;
  /** Max duration (ms) for a flick to count as a swipe (fast). */
  swipeMaxDurationMs?: number;
}

/** Default gesture thresholds tuned for a typical phone screen. */
export const DEFAULT_GESTURE_OPTIONS: Required<GestureOptions> = {
  tapMaxDistance: 12,
  tapMaxDurationMs: 250,
  swipeMinDistance: 60,
  swipeMaxDurationMs: 300,
};

/** A classified gesture and its displacement. */
export interface Gesture {
  type: GestureType;
  /** Horizontal displacement endX - startX. */
  dx: number;
  /** Vertical displacement endY - startY. */
  dy: number;
  /** Dominant direction; present only for a swipe. */
  direction?: Direction;
}

/** Coerce to a finite number, or 0 for non-finite input. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** The dominant cardinal direction of a displacement. */
function dominantDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

/**
 * Classify a pointer gesture into a tap, drag, or swipe.
 *
 * - TAP: travelled less than `tapMaxDistance` within `tapMaxDurationMs` (a
 *   quick stationary press - fire/confirm).
 * - SWIPE: travelled at least `swipeMinDistance` within `swipeMaxDurationMs`
 *   (a fast flick - dash/dodge); carries the dominant `direction`.
 * - DRAG: anything else (a sustained directional move - analog move/aim).
 *
 * Non-finite coordinates are treated as 0 so a malformed event degrades to a
 * tap-at-origin rather than throwing.
 */
export function classifyGesture(input: GestureInput, opts?: GestureOptions): Gesture {
  const o = { ...DEFAULT_GESTURE_OPTIONS, ...opts };
  const dx = finite(input.endX) - finite(input.startX);
  const dy = finite(input.endY) - finite(input.startY);
  const distance = Math.hypot(dx, dy);
  const duration = Math.max(0, finite(input.durationMs));

  if (distance <= o.tapMaxDistance && duration <= o.tapMaxDurationMs) {
    return { type: 'tap', dx, dy };
  }

  if (distance >= o.swipeMinDistance && duration <= o.swipeMaxDurationMs) {
    return { type: 'swipe', dx, dy, direction: dominantDirection(dx, dy) };
  }

  return { type: 'drag', dx, dy };
}

/** A normalized 2D move intent, each axis in [-1, 1]. */
export interface MoveIntent {
  moveX: number;
  moveY: number;
}

/**
 * Map a drag displacement to a normalized move vector in [-1, 1] per axis, e.g.
 * a virtual-joystick move. `radius` is the drag distance that maps to full
 * deflection (1.0); anything past it clamps to 1. Displacement within
 * `deadzone` (px) produces no movement (0) so a resting thumb does not drift.
 *
 * Pure numeric transform: the game reads `moveX`/`moveY` as its analog stick.
 */
export function mapDragToMove(
  dx: number,
  dy: number,
  deadzone: number = 8,
  radius: number = 80,
): MoveIntent {
  const sx = finite(dx);
  const sy = finite(dy);
  const dz = Number.isFinite(deadzone) && deadzone > 0 ? deadzone : 0;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1;

  const magnitude = Math.hypot(sx, sy);
  if (magnitude <= dz) {
    return { moveX: 0, moveY: 0 };
  }

  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { moveX: clamp(sx / r), moveY: clamp(sy / r) };
}
