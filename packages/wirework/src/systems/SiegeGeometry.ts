/** Pure float64 geometry shared by simulation, cues, and tests. */
export interface Vec2 { readonly x: number; readonly y: number }
export interface Aabb { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
export interface SegmentLike { readonly x: number; readonly y: number; readonly breached: boolean }
export interface SlashShape { readonly originX: number; readonly originY: number; readonly forwardX: number; readonly forwardY: number; readonly reach: number; readonly halfWidth: number }

export function radialPoint(centerX: number, centerY: number, angle: number, radius: number): Vec2 {
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

export function spawnRadius(outerRadius: number, jitter01: number): number {
  return outerRadius + 90 + Math.max(0, Math.min(0.999_999_999, jitter01)) * 60;
}

export function segmentAngle(index: number, count: number): number {
  return (index / count) * Math.PI * 2;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function normalizedAngle(x: number, y: number, centerX: number, centerY: number): number {
  const angle = Math.atan2(y - centerY, x - centerX);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

export function sectorIndexForPoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  count: number,
): number {
  const turns = normalizedAngle(x, y, centerX, centerY) / (Math.PI * 2);
  return Math.floor(turns * count + 0.5) % count;
}

/** Outer sector -> same normalized-angle inner sector -> citizens. */
export function sectorTargetIndex(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  outer: readonly SegmentLike[],
  inner: readonly SegmentLike[],
): { ring: 0 | 1; index: number } {
  const outerIndex = sectorIndexForPoint(x, y, centerX, centerY, outer.length);
  if (!outer[outerIndex]?.breached) return { ring: 0, index: outerIndex };
  const innerIndex = sectorIndexForPoint(x, y, centerX, centerY, inner.length);
  if (!inner[innerIndex]?.breached) return { ring: 1, index: innerIndex };
  return { ring: 1, index: -1 };
}

/** Compatibility export now implementing authoritative sector-local progression. */
export function nearestTargetIndex(
  x: number,
  y: number,
  outer: readonly SegmentLike[],
  inner: readonly SegmentLike[],
): { ring: 0 | 1; index: number } {
  return sectorTargetIndex(x, y, 0, 0, outer, inner);
}

export function dashDirection(dirX: number, dirY: number): Vec2 {
  const len = Math.hypot(dirX, dirY);
  return len < 1e-6 ? { x: 0, y: -1 } : { x: dirX / len, y: dirY / len };
}

export function facingDashDirection(inputX: number, inputY: number, lastX: number, lastY: number): Vec2 {
  return Math.hypot(inputX, inputY) > 1e-6
    ? dashDirection(inputX, inputY)
    : dashDirection(lastX, lastY);
}

export function coolingNodeOffset(facingX: number, facingY: number, nodeDistance: number): Vec2 {
  const facing = dashDirection(facingX, facingY);
  return { x: -facing.x * nodeDistance, y: -facing.y * nodeDistance };
}

export function isRearNodeHit(
  playerX: number,
  playerY: number,
  enemyX: number,
  enemyY: number,
  facingX: number,
  facingY: number,
): boolean {
  const dx = playerX - enemyX;
  const dy = playerY - enemyY;
  const len = Math.hypot(dx, dy);
  return len >= 1 && (dx / len) * facingX + (dy / len) * facingY < 0;
}

export function isFrontalHit(
  facingX: number,
  facingY: number,
  hitDX: number,
  hitDY: number,
  coneDeg: number,
): boolean {
  const hit = dashDirection(hitDX, hitDY);
  const facing = dashDirection(facingX, facingY);
  return hit.x * facing.x + hit.y * facing.y >= Math.cos((coneDeg * Math.PI) / 180);
}

export function isNodeHook(hitX: number, hitY: number, nodeX: number, nodeY: number, snapDist: number): boolean {
  return distance(hitX, hitY, nodeX, nodeY) <= snapDist;
}

export function nodeFlingAccel(base: number, boosted: number, nodeHooked: boolean): number {
  return nodeHooked ? boosted : base;
}

export function isTraversing(dashing: boolean, wireAttachedOrFlinging: boolean): boolean {
  return dashing || wireAttachedOrFlinging;
}

export function reelStep(
  heroX: number,
  heroY: number,
  anchorX: number,
  anchorY: number,
  reelIn: boolean,
  speed: number,
  dt: number,
  minLength: number,
  maxLength: number,
): { x: number; y: number; ropeLength: number } {
  const rx = heroX - anchorX;
  const ry = heroY - anchorY;
  const dist = Math.hypot(rx, ry) || 1e-6;
  const clamped = Math.max(minLength, Math.min(maxLength, dist + (reelIn ? -1 : 1) * speed * dt));
  return { x: anchorX + (rx / dist) * clamped, y: anchorY + (ry / dist) * clamped, ropeLength: clamped };
}

export function makeSlashShape(
  originX: number,
  originY: number,
  aimX: number,
  aimY: number,
  fallbackX: number,
  fallbackY: number,
  reach: number,
  halfWidth: number,
): SlashShape {
  const dx = aimX - originX;
  const dy = aimY - originY;
  const forward = Math.hypot(dx, dy) < 1 ? dashDirection(fallbackX, fallbackY) : dashDirection(dx, dy);
  return { originX, originY, forwardX: forward.x, forwardY: forward.y, reach, halfWidth };
}

function projectionRadius(aabb: Aabb, axisX: number, axisY: number): number {
  return ((aabb.right - aabb.left) * 0.5) * Math.abs(axisX) + ((aabb.bottom - aabb.top) * 0.5) * Math.abs(axisY);
}

/** Closed oriented slash rectangle versus closed axis-aligned body box. */
export function slashIntersectsAabb(slash: SlashShape, aabb: Aabb): boolean {
  const rightX = -slash.forwardY;
  const rightY = slash.forwardX;
  const slashCx = slash.originX + slash.forwardX * slash.reach * 0.5;
  const slashCy = slash.originY + slash.forwardY * slash.reach * 0.5;
  const boxCx = (aabb.left + aabb.right) * 0.5;
  const boxCy = (aabb.top + aabb.bottom) * 0.5;
  const dx = boxCx - slashCx;
  const dy = boxCy - slashCy;
  const axes: readonly Vec2[] = [
    { x: slash.forwardX, y: slash.forwardY },
    { x: rightX, y: rightY },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (const axis of axes) {
    const centerDistance = Math.abs(dx * axis.x + dy * axis.y);
    const slashRadius =
      slash.reach * 0.5 * Math.abs(slash.forwardX * axis.x + slash.forwardY * axis.y) +
      slash.halfWidth * Math.abs(rightX * axis.x + rightY * axis.y);
    if (centerDistance > slashRadius + projectionRadius(aabb, axis.x, axis.y)) return false;
  }
  return true;
}

/** Closed oriented slash rectangle versus closed node circle. */
export function slashIntersectsCircle(
  slash: SlashShape,
  circleX: number,
  circleY: number,
  radius: number,
): boolean {
  const dx = circleX - slash.originX;
  const dy = circleY - slash.originY;
  const u = dx * slash.forwardX + dy * slash.forwardY;
  const v = dx * -slash.forwardY + dy * slash.forwardX;
  const closestU = Math.max(0, Math.min(slash.reach, u));
  const closestV = Math.max(-slash.halfWidth, Math.min(slash.halfWidth, v));
  return (u - closestU) ** 2 + (v - closestV) ** 2 <= radius ** 2;
}

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** First closed AABB boundary hit along a finite ray segment. */
export function rayAabbIntersection(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxDistance: number,
  aabb: Aabb,
): { distance: number; point: Vec2 } | null {
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  const inside = originX > aabb.left && originX < aabb.right && originY > aabb.top && originY < aabb.bottom;
  for (const [origin, direction, min, max] of [
    [originX, dirX, aabb.left, aabb.right],
    [originY, dirY, aabb.top, aabb.bottom],
  ] as const) {
    if (Math.abs(direction) < Number.EPSILON) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const t1 = (min - origin) / direction;
    const t2 = (max - origin) / direction;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  const distance = inside ? far : Math.max(0, near);
  if (!Number.isFinite(distance) || distance < 0 || distance > maxDistance) return null;
  return { distance, point: { x: originX + dirX * distance, y: originY + dirY * distance } };
}
