import { describe, expect, it } from 'vitest';
import { buildArcLengthTable } from './traffic-ai';
import {
  buildOncomingRoute,
  isTwoWaySegment,
  LANE_OFFSET_M,
  mirroredArcLengthOfWaypoint,
  offsetPoseToLane,
} from './lanes';
import type { Waypoint } from './route-types';

function waypoint(twoWay: boolean): Waypoint {
  return { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay };
}

describe('isTwoWaySegment', () => {
  it('reads the flag of the given segment, not segmentIndex + 1', () => {
    const waypoints = [waypoint(true), waypoint(true), waypoint(false)];
    expect(isTwoWaySegment(waypoints, 0)).toBe(true);
    expect(isTwoWaySegment(waypoints, 2)).toBe(false);
  });
});

describe('buildOncomingRoute', () => {
  // Trazado recto norte: (0,0) -> (0,10) -> (0,20) -> (0,30), dos-vías solo hasta wp2.
  const routePoints = [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 0, z: 20 },
    { x: 0, z: 30 },
  ];

  it('stops at the first waypoint whose segment is not two-way', () => {
    const waypoints = [waypoint(true), waypoint(true), waypoint(false), waypoint(false)];
    const oncoming = buildOncomingRoute(waypoints, routePoints);
    expect(oncoming.twoWayEndIndex).toBe(2);
    expect(oncoming.points).toEqual([
      { x: 0, z: 20 },
      { x: 0, z: 10 },
      { x: 0, z: 0 },
    ]);
  });

  it('covers the whole route if every segment is two-way', () => {
    const waypoints = [waypoint(true), waypoint(true), waypoint(true), waypoint(false)];
    const oncoming = buildOncomingRoute(waypoints, routePoints);
    expect(oncoming.twoWayEndIndex).toBe(3);
    expect(oncoming.points).toHaveLength(4);
  });

  it('covers only the first waypoint if the route starts one-way', () => {
    const waypoints = [waypoint(false), waypoint(true), waypoint(true), waypoint(false)];
    const oncoming = buildOncomingRoute(waypoints, routePoints);
    expect(oncoming.twoWayEndIndex).toBe(0);
    expect(oncoming.points).toEqual([{ x: 0, z: 0 }]);
  });
});

describe('mirroredArcLengthOfWaypoint', () => {
  const routePoints = [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 0, z: 20 },
  ];
  const oncomingPoints = [...routePoints].reverse(); // twoWayEndIndex = 2
  const oncomingArcTable = buildArcLengthTable(oncomingPoints); // [0, 10, 20]

  it('maps the last waypoint of the two-way stretch to arc 0', () => {
    expect(mirroredArcLengthOfWaypoint(oncomingArcTable, 2, 2)).toBe(0);
  });

  it('maps the first waypoint of the route to the full stretch length', () => {
    expect(mirroredArcLengthOfWaypoint(oncomingArcTable, 2, 0)).toBe(20);
  });

  it('returns null for a waypoint beyond the two-way stretch', () => {
    expect(mirroredArcLengthOfWaypoint(oncomingArcTable, 2, 3)).toBeNull();
  });
});

describe('offsetPoseToLane', () => {
  it('shifts to the right of a north-facing pose (positive = right, same convention as road-bounds.ts)', () => {
    const pose = offsetPoseToLane({ x: 0, z: 0, headingRad: 0 }, LANE_OFFSET_M);
    expect(pose.x).toBeCloseTo(LANE_OFFSET_M, 6); // este = derecha de norte
    expect(pose.z).toBeCloseTo(0, 6);
    expect(pose.headingRad).toBe(0);
  });

  it('shifts to the other side for a reversed (south-facing) pose without special-casing direction', () => {
    const pose = offsetPoseToLane({ x: 0, z: 0, headingRad: Math.PI }, LANE_OFFSET_M);
    expect(pose.x).toBeCloseTo(-LANE_OFFSET_M, 6); // oeste = derecha de sur
    expect(pose.z).toBeCloseTo(0, 6);
  });
});
