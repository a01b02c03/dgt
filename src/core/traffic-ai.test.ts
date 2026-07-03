import { describe, expect, it } from 'vitest';
import {
  buildArcLengthTable,
  estimateArcLength,
  nextStopArcLengthM,
  poseAtArcLength,
  stepAiVehicle,
} from './traffic-ai';

// Trazado en L: (0,0) -> (0,10) [norte] -> (10,10) [este].
const waypointPositions = [
  { x: 0, z: 0 },
  { x: 0, z: 10 },
  { x: 10, z: 10 },
];

describe('buildArcLengthTable', () => {
  it('accumulates the distance between consecutive waypoints', () => {
    expect(buildArcLengthTable(waypointPositions)).toEqual([0, 10, 20]);
  });
});

describe('poseAtArcLength', () => {
  const arcTable = buildArcLengthTable(waypointPositions);

  it('interpolates position and heading within the first segment', () => {
    const pose = poseAtArcLength(waypointPositions, arcTable, 5);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.z).toBeCloseTo(5, 6);
    expect(pose.headingRad).toBeCloseTo(0, 6); // norte
  });

  it('interpolates within the second segment with the turned heading', () => {
    const pose = poseAtArcLength(waypointPositions, arcTable, 15);
    expect(pose.x).toBeCloseTo(5, 6);
    expect(pose.z).toBeCloseTo(10, 6);
    expect(pose.headingRad).toBeCloseTo(Math.PI / 2, 6); // este
  });

  it('clamps to the start of the route', () => {
    const pose = poseAtArcLength(waypointPositions, arcTable, -50);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.z).toBeCloseTo(0, 6);
  });

  it('clamps to the end of the route', () => {
    const pose = poseAtArcLength(waypointPositions, arcTable, 999);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.z).toBeCloseTo(10, 6);
  });
});

describe('estimateArcLength', () => {
  const arcTable = buildArcLengthTable(waypointPositions);

  it('matches the exact arc length for a point on the centerline', () => {
    expect(estimateArcLength(waypointPositions, arcTable, { x: 0, z: 7 })).toBeCloseTo(7, 6);
  });

  it('projects an off-centerline point onto the nearest segment', () => {
    expect(estimateArcLength(waypointPositions, arcTable, { x: 3, z: 7 })).toBeCloseTo(7, 6);
  });

  it('picks the closer of two segments near a turn', () => {
    expect(estimateArcLength(waypointPositions, arcTable, { x: 5, z: 11 })).toBeCloseTo(15, 6);
  });
});

describe('nextStopArcLengthM', () => {
  it('returns null when there is nothing ahead', () => {
    expect(nextStopArcLengthM(10, [], null)).toBeNull();
  });

  it('ignores red lights already passed', () => {
    expect(nextStopArcLengthM(20, [10], null)).toBeNull();
  });

  it('returns the nearest red light ahead', () => {
    expect(nextStopArcLengthM(10, [50, 30], null)).toBe(30);
  });

  it('returns the following gap behind the lead vehicle when closer than any red light', () => {
    expect(nextStopArcLengthM(10, [100], 25, 8)).toBe(17); // 25 - 8
  });

  it('returns the red light when it is closer than the lead-vehicle gap', () => {
    expect(nextStopArcLengthM(10, [15], 100, 8)).toBe(15);
  });
});

describe('stepAiVehicle', () => {
  it('accelerates towards the speed limit when there is no stop point', () => {
    let state = { distanceAlongRouteM: 0, speedMs: 0 };
    for (let i = 0; i < 10; i++) {
      state = stepAiVehicle(state, { speedLimitMs: 10, stopLineArcM: null }, 1);
    }
    expect(state.speedMs).toBe(10);
    expect(state.distanceAlongRouteM).toBeGreaterThan(0);
  });

  it('never exceeds the speed limit', () => {
    let state = { distanceAlongRouteM: 0, speedMs: 0 };
    for (let i = 0; i < 100; i++) {
      state = stepAiVehicle(state, { speedLimitMs: 10, stopLineArcM: null }, 1);
    }
    expect(state.speedMs).toBe(10);
  });

  it('brakes to a stop before reaching a stop line within the braking distance', () => {
    let state = { distanceAlongRouteM: 0, speedMs: 10 };
    // Punto de parada a 10m, dentro de la distancia de frenada (15m): debe decelerar.
    state = stepAiVehicle(state, { speedLimitMs: 10, stopLineArcM: 10 }, 1);
    expect(state.speedMs).toBeLessThan(10);
  });

  it('keeps accelerating when the stop point is far beyond the braking distance', () => {
    let state = { distanceAlongRouteM: 0, speedMs: 0 };
    state = stepAiVehicle(state, { speedLimitMs: 10, stopLineArcM: 1000 }, 1);
    expect(state.speedMs).toBeGreaterThan(0);
  });
});
