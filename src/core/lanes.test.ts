import { describe, expect, it } from 'vitest';
import { buildArcLengthTable } from './traffic-ai';
import {
  buildOncomingRoute,
  clampLaneIndex,
  isTwoWaySegment,
  laneIndexFromLateralOffsetM,
  laneOffsetM,
  mirroredArcLengthOfWaypoint,
  offsetPoseToLane,
  oncomingLaneOffsetM,
  ownDirectionLaneCount,
  roadWidthMAtSegment,
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
    const pose = offsetPoseToLane({ x: 0, z: 0, headingRad: 0 }, 1.5);
    expect(pose.x).toBeCloseTo(1.5, 6); // este = derecha de norte
    expect(pose.z).toBeCloseTo(0, 6);
    expect(pose.headingRad).toBe(0);
  });

  it('shifts to the other side for a reversed (south-facing) pose without special-casing direction', () => {
    const pose = offsetPoseToLane({ x: 0, z: 0, headingRad: Math.PI }, 1.5);
    expect(pose.x).toBeCloseTo(-1.5, 6); // oeste = derecha de sur
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

describe('roadWidthMAtSegment', () => {
  it('matches the legacy fixed ROAD_WIDTH_M for a single-lane two-way segment', () => {
    const waypoints = [waypoint(true, 1)];
    expect(roadWidthMAtSegment(waypoints, 0)).toBe(6);
  });

  it('halves for a single-lane one-way segment (no oncoming lane)', () => {
    const waypoints = [waypoint(false, 1)];
    expect(roadWidthMAtSegment(waypoints, 0)).toBe(3);
  });

  it('adds one lane width per extra own-direction lane', () => {
    const waypoints = [waypoint(false, 2)];
    expect(roadWidthMAtSegment(waypoints, 0)).toBe(6);
  });

  it('adds the oncoming lane on top of multiple own-direction lanes', () => {
    const waypoints = [waypoint(true, 2)];
    expect(roadWidthMAtSegment(waypoints, 0)).toBe(9);
  });

  it('reads the segment given, not segmentIndex + 1', () => {
    const waypoints = [waypoint(false, 1), waypoint(true, 2)];
    expect(roadWidthMAtSegment(waypoints, 0)).toBe(3);
    expect(roadWidthMAtSegment(waypoints, 1)).toBe(9);
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

describe('laneOffsetM (layout centrado en la polilínea, ver el comentario de cabecera de lanes.ts)', () => {
  it('keeps the legacy +-1.5 split for the 1+1 two-way case', () => {
    expect(laneOffsetM(0, 1, true)).toBeCloseTo(1.5, 6);
  });

  it('centers a single one-way lane on the polyline (no oncoming strip to skip)', () => {
    expect(laneOffsetM(0, 1, false)).toBeCloseTo(0, 6);
  });

  it('fills the ribbon width symmetrically on a multi-lane two-way road', () => {
    // 2+1 carriles = 9m de cinta: contrario [-4.5,-1.5], propios [-1.5,+1.5] y [+1.5,+4.5].
    expect(laneOffsetM(0, 2, true)).toBeCloseTo(0, 6);
    expect(laneOffsetM(1, 2, true)).toBeCloseTo(3, 6);
  });

  it('fills the ribbon width symmetrically on a multi-lane one-way road', () => {
    // 2 carriles = 6m de cinta: [-3,0] y [0,+3].
    expect(laneOffsetM(0, 2, false)).toBeCloseTo(-1.5, 6);
    expect(laneOffsetM(1, 2, false)).toBeCloseTo(1.5, 6);
  });

  it('never places a lane center outside the ribbon (regression: pre-centered model overflowed by (N-1)*1.5m)', () => {
    const laneCount = 5;
    const halfWidth = roadWidthMAtSegment([waypoint(true, laneCount)], 0) / 2;
    for (let lane = 0; lane < laneCount; lane++) {
      expect(Math.abs(laneOffsetM(lane, laneCount, true))).toBeLessThan(halfWidth);
    }
  });

  it('clamps to the last lane if the road narrows under the vehicle', () => {
    expect(laneOffsetM(1, 1, true)).toBeCloseTo(laneOffsetM(0, 1, true), 6);
  });
});

describe('oncomingLaneOffsetM', () => {
  it('keeps the legacy 1.5 for a single own lane', () => {
    expect(oncomingLaneOffsetM(1)).toBeCloseTo(1.5, 6);
  });

  it('tracks the far edge of the ribbon as own lanes grow', () => {
    // 5+1 carriles = 18m: franja contraria [-9,-6] en el frame propio, centro -7.5
    // = +7.5 a la derecha desde el rumbo invertido del vehículo contrario.
    expect(oncomingLaneOffsetM(5)).toBeCloseTo(7.5, 6);
  });
});

describe('laneIndexFromLateralOffsetM', () => {
  it('always resolves to lane 0 on a single-lane road', () => {
    expect(laneIndexFromLateralOffsetM(0.5, 1, true)).toBe(0);
    expect(laneIndexFromLateralOffsetM(-1, 1, false)).toBe(0);
  });

  it('picks the lane whose band contains the offset on a multi-lane road', () => {
    // 2+1: propios en [-1.5,+1.5] y [+1.5,+4.5].
    expect(laneIndexFromLateralOffsetM(0, 2, true)).toBe(0);
    expect(laneIndexFromLateralOffsetM(3, 2, true)).toBe(1);
  });

  it('clamps offsets inside the oncoming strip to the innermost own lane', () => {
    expect(laneIndexFromLateralOffsetM(-3, 2, true)).toBe(0);
  });
});
