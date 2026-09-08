import { describe, it, expect } from 'vitest';
import {
  WORLD_SIZE,
  LANES,
  SIDES,
  LANE_WAYPOINTS,
  laneWaypoints,
  BASE_POSITIONS,
  FOUNTAIN_POSITIONS,
  STRUCTURES,
  JUNGLE_CAMPS,
  EPIC_PITS,
  RIVER_ANCHORS,
  distance,
  lerp,
  pathLength,
  pointAlongPath,
  nextWaypoint,
  type Lane,
} from './map';

describe('lane geometry', () => {
  it('every lane has at least two waypoints', () => {
    for (const lane of LANES) {
      expect(LANE_WAYPOINTS[lane].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all lane waypoints sit inside the world bounds', () => {
    for (const lane of LANES) {
      for (const p of LANE_WAYPOINTS[lane]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(WORLD_SIZE);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(WORLD_SIZE);
      }
    }
  });

  it('laneWaypoints reverses correctly for the enemy team', () => {
    for (const lane of LANES) {
      const ally = laneWaypoints(lane, 'ally');
      const enemy = laneWaypoints(lane, 'enemy');
      // The enemy marches the reverse: their first waypoint equals the ally's
      // last waypoint, and vice versa.
      expect(enemy[0]).toEqual(ally[ally.length - 1]);
      expect(enemy[enemy.length - 1]).toEqual(ally[0]);
      expect(enemy.length).toBe(ally.length);
    }
  });

  it('laneWaypoints returns a fresh, mutable copy each call', () => {
    const a = laneWaypoints('mid', 'ally');
    a[0].x = -999;
    const b = laneWaypoints('mid', 'ally');
    expect(b[0].x).not.toBe(-999);
  });

  it('mid lane endpoints sit at the two bases', () => {
    const mid = LANE_WAYPOINTS.mid;
    const start = mid[0];
    const end = mid[mid.length - 1];
    // The mid lane runs corner-to-corner: its start is nearest the ally base
    // and its end is nearest the enemy base.
    expect(distance(start, BASE_POSITIONS.ally)).toBeLessThan(
      distance(start, BASE_POSITIONS.enemy),
    );
    expect(distance(end, BASE_POSITIONS.enemy)).toBeLessThan(
      distance(end, BASE_POSITIONS.ally),
    );
  });
});

describe('base / fountain positions', () => {
  it('ally base is bottom-left, enemy base is top-right', () => {
    expect(BASE_POSITIONS.ally.x).toBeLessThan(WORLD_SIZE / 2);
    expect(BASE_POSITIONS.ally.y).toBeGreaterThan(WORLD_SIZE / 2);
    expect(BASE_POSITIONS.enemy.x).toBeGreaterThan(WORLD_SIZE / 2);
    expect(BASE_POSITIONS.enemy.y).toBeLessThan(WORLD_SIZE / 2);
  });

  it('fountains are co-located with bases', () => {
    for (const side of SIDES) {
      expect(FOUNTAIN_POSITIONS[side]).toEqual(BASE_POSITIONS[side]);
    }
  });
});

describe('structures (arena topology)', () => {
  it('each side has 2 turrets per lane, an inhibitor per lane, 2 nexus turrets and a nexus', () => {
    for (const side of SIDES) {
      const s = STRUCTURES[side];
      const lanes: Lane[] = ['top', 'mid', 'bot'];
      for (const lane of lanes) {
        expect(s.outerTurrets[lane]).toBeDefined();
        expect(s.innerTurrets[lane]).toBeDefined();
        expect(s.inhibitorTurrets[lane]).toBeDefined();
        expect(s.inhibitors[lane]).toBeDefined();
      }
      expect(s.nexusTurrets).toHaveLength(2);
      expect(s.nexus).toBeDefined();
    }
  });

  it('nexus sits near the owning base', () => {
    for (const side of SIDES) {
      expect(distance(STRUCTURES[side].nexus, BASE_POSITIONS[side])).toBeLessThan(300);
    }
  });
});

describe('jungle and river anchors', () => {
  it('has ally-side and enemy-side jungle camps', () => {
    expect(JUNGLE_CAMPS.some((c) => c.side === 'ally')).toBe(true);
    expect(JUNGLE_CAMPS.some((c) => c.side === 'enemy')).toBe(true);
  });

  it('has dragon (bot river) and baron/herald (top river) pits', () => {
    const ids = EPIC_PITS.map((p) => p.id);
    expect(ids).toContain('dragon');
    expect(ids).toContain('baron');
    expect(ids).toContain('herald');
    const dragon = EPIC_PITS.find((p) => p.id === 'dragon')!;
    const baron = EPIC_PITS.find((p) => p.id === 'baron')!;
    // Dragon is toward the bottom-right river; baron toward the top-left.
    expect(dragon.pos.x).toBeGreaterThan(baron.pos.x);
    expect(dragon.pos.y).toBeGreaterThan(baron.pos.y);
  });

  it('river anchors lie roughly on the anti-diagonal through centre', () => {
    for (const a of RIVER_ANCHORS) {
      // On the map anti-diagonal band, x and y are close to each other.
      expect(Math.abs(a.x - a.y)).toBeLessThan(1);
    }
    expect(RIVER_ANCHORS.length).toBeGreaterThanOrEqual(2);
  });
});

describe('path helpers', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it('distance is euclidean', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('lerp interpolates endpoints and midpoint', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 20 };
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('pathLength sums segment lengths', () => {
    expect(pathLength(path)).toBe(20);
  });

  it('pointAlongPath returns endpoints at distance 0 and >= total length', () => {
    expect(pointAlongPath(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath(path, -5)).toEqual({ x: 0, y: 0 });
    const total = pathLength(path);
    expect(pointAlongPath(path, total)).toEqual({ x: 10, y: 10 });
    expect(pointAlongPath(path, total + 100)).toEqual({ x: 10, y: 10 });
  });

  it('pointAlongPath interpolates within a segment', () => {
    expect(pointAlongPath(path, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAlongPath(path, 15)).toEqual({ x: 10, y: 5 });
  });

  it('pointAlongPath handles empty and single-point paths', () => {
    expect(pointAlongPath([], 5)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath([{ x: 7, y: 8 }], 5)).toEqual({ x: 7, y: 8 });
  });

  it('nextWaypoint advances and clamps at the final index', () => {
    expect(nextWaypoint(path, 0)).toBe(1);
    expect(nextWaypoint(path, 1)).toBe(2);
    expect(nextWaypoint(path, 2)).toBe(2);
    expect(nextWaypoint(path, 99)).toBe(2);
  });

  it('every real lane path returns its endpoints from pointAlongPath', () => {
    for (const lane of LANES) {
      const p = LANE_WAYPOINTS[lane];
      expect(pointAlongPath(p, 0)).toEqual(p[0]);
      // At exactly the total length, float accumulation can drift by a hair,
      // so compare coordinates with a tolerance. Beyond the length it clamps.
      const end = pointAlongPath(p, pathLength(p));
      expect(end.x).toBeCloseTo(p[p.length - 1].x, 6);
      expect(end.y).toBeCloseTo(p[p.length - 1].y, 6);
      expect(pointAlongPath(p, pathLength(p) + 500)).toEqual(p[p.length - 1]);
    }
  });
});
