import type { Unit, Vec2 } from './combat';

export interface DashBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DashBlocker {
  id: string;
  pos: Vec2;
  radius: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Deterministically sweeps a dash and returns its last collision-valid point.
 * Bounds and stable blocker ids are authoritative; render geometry is never queried.
 */
export function resolveDashEndpoint(
  origin: Vec2,
  aim: Vec2,
  range: number,
  bounds: DashBounds,
  blockers: readonly DashBlocker[],
  awayFromAim = false,
): Vec2 {
  const aimDx = aim.x - origin.x;
  const aimDy = aim.y - origin.y;
  const magnitude = Math.hypot(aimDx, aimDy);
  if (magnitude <= Number.EPSILON || range <= 0) return { ...origin };
  const sign = awayFromAim ? -1 : 1;
  const distance = awayFromAim ? range : Math.min(range, magnitude);
  const desired = {
    x: clamp(origin.x + (aimDx / magnitude) * distance * sign, bounds.minX, bounds.maxX),
    y: clamp(origin.y + (aimDy / magnitude) * distance * sign, bounds.minY, bounds.maxY),
  };
  const dx = desired.x - origin.x;
  const dy = desired.y - origin.y;
  const travel = Math.hypot(dx, dy);
  if (travel <= Number.EPSILON) return { ...origin };
  const ordered = [...blockers].sort((a, b) => a.id.localeCompare(b.id));
  const steps = Math.max(1, Math.ceil(travel / 6));
  let valid = { ...origin };
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const candidate = { x: origin.x + dx * t, y: origin.y + dy * t };
    if (ordered.some((blocker) => Math.hypot(candidate.x - blocker.pos.x, candidate.y - blocker.pos.y) < blocker.radius)) {
      break;
    }
    valid = candidate;
  }
  return valid;
}

/** Select the in-range living hostile champion with the lowest HP ratio and stable id tie-break. */
export function lowestHpRatioHostile(
  source: Unit,
  candidates: readonly Unit[],
  range: number,
): Unit | undefined {
  return candidates
    .filter(
      (candidate) =>
        candidate.kind === 'champion' &&
        !candidate.dead &&
        candidate.team !== source.team &&
        candidate.team !== 'neutral' &&
        Math.hypot(candidate.pos.x - source.pos.x, candidate.pos.y - source.pos.y) <= range,
    )
    .sort(
      (a, b) =>
        a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp) ||
        a.id.localeCompare(b.id),
    )[0];
}


export interface LineTarget {
  id: string;
  pos: Vec2;
}

/**
 * Return every target whose centre intersects a finite ability line, ordered by
 * distance travelled along that line and then stable id.
 */
export function targetsIntersectingLine<T extends LineTarget>(
  origin: Vec2,
  endpoint: Vec2,
  halfWidth: number,
  candidates: readonly T[],
): T[] {
  const dx = endpoint.x - origin.x;
  const dy = endpoint.y - origin.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON || halfWidth < 0) return [];

  return candidates
    .map((candidate) => {
      const projection = (
        (candidate.pos.x - origin.x) * dx +
        (candidate.pos.y - origin.y) * dy
      ) / lengthSquared;
      const closest = {
        x: origin.x + dx * projection,
        y: origin.y + dy * projection,
      };
      return {
        candidate,
        projection,
        perpendicularDistance: Math.hypot(
          candidate.pos.x - closest.x,
          candidate.pos.y - closest.y,
        ),
      };
    })
    .filter(
      ({ projection, perpendicularDistance }) =>
        projection >= 0 && projection <= 1 && perpendicularDistance <= halfWidth,
    )
    .sort(
      (a, b) =>
        a.projection - b.projection ||
        (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0),
    )
    .map(({ candidate }) => candidate);
}
