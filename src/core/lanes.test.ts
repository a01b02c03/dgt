import { describe, expect, it } from 'vitest';
import { buildArcLengthTable } from './traffic-ai';
import {
  buildOncomingRoute,
  clampLaneIndex,
  isTwoWaySegment,
  LANE_OFFSET_M,
  laneIndexFromLateralOffsetM,
  laneOffsetM,
  mirroredArcLengthOfWaypoint,
  offsetPoseToLane,
  ownDirectionLaneCount,
} from './lanes';
import type { Waypoint } from './route-types';

function waypoint(twoWay: boolean, ownDirectionLanes = 1): Waypoint {
  return { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay, ownDirectionLanes };
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

describe('ownDirectionLaneCount', () => {
  it('reads the lane count of the given segment, not segmentIndex + 1', () => {
    const waypoints = [waypoint(true, 1), waypoint(true, 2), waypoint(false, 1)];
    expect(ownDirectionLaneCount(waypoints, 1)).toBe(2);
    expect(ownDirectionLaneCount(waypoints, 2)).toBe(1);
  });
});

describe('clampLaneIndex', () => {
  it('leaves an in-range index untouched', () => {
    expect(clampLaneIndex(1, 3)).toBe(1);
  });

  it('clamps a negative index to 0', () => {
    expect(clampLaneIndex(-1, 3)).toBe(0);
  });

  it('clamps an out-of-range index to the last available lane', () => {
    expect(clampLaneIndex(5, 3)).toBe(2);
  });
});

describe('laneOffsetM', () => {
  it('matches LANE_OFFSET_M for the single-lane case', () => {
    expect(laneOffsetM(0, 1)).toBeCloseTo(LANE_OFFSET_M, 6);
  });

  it('places lane 0 closest to the centerline and higher indices further out', () => {
    expect(laneOffsetM(0, 2)).toBeCloseTo(1.5, 6);
    expect(laneOffsetM(1, 2)).toBeCloseTo(4.5, 6);
  });

  it('clamps to the last lane if the road narrows under the vehicle', () => {
    expect(laneOffsetM(1, 1)).toBeCloseTo(laneOffsetM(0, 1), 6);
  });
});

describe('laneIndexFromLateralOffsetM', () => {
  it('always resolves to lane 0 on a single-lane road', () => {
    expect(laneIndexFromLateralOffsetM(0.5, 1)).toBe(0);
    expect(laneIndexFromLateralOffsetM(2.9, 1)).toBe(0);
  });

  it('picks the lane whose band contains the offset on a multi-lane road', () => {
    expect(laneIndexFromLateralOffsetM(1, 2)).toBe(0);
    expect(laneIndexFromLateralOffsetM(4, 2)).toBe(1);
  });

  it('clamps offsets on the wrong side of the centerline to the innermost lane', () => {
    expect(laneIndexFromLateralOffsetM(-2, 2)).toBe(0);
  });
});
