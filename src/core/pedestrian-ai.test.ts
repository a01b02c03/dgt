import { describe, expect, it } from 'vitest';
import { createPedestrianState, isPedestrianInRoadway, pedestrianPose, stepPedestrian } from './pedestrian-ai';

describe('isPedestrianInRoadway', () => {
  it('is true while within the road half-width of the crossing axis', () => {
    expect(isPedestrianInRoadway({ lateralOffsetM: 2, direction: 1, waitingS: 0 }, 3)).toBe(true);
    expect(isPedestrianInRoadway({ lateralOffsetM: -2, direction: -1, waitingS: 0 }, 3)).toBe(true);
  });

  it('is false once past the road edge, into the sidewalk margin', () => {
    expect(isPedestrianInRoadway({ lateralOffsetM: 4, direction: 1, waitingS: 4 }, 3)).toBe(false);
    expect(isPedestrianInRoadway({ lateralOffsetM: -4, direction: -1, waitingS: 4 }, 3)).toBe(false);
  });
});

describe('stepPedestrian', () => {
  it('walks forward along the crossing axis', () => {
    const state = createPedestrianState(-5);
    const next = stepPedestrian(state, 5, 1);
    expect(next.lateralOffsetM).toBeCloseTo(-3.8, 6); // -5 + 1.2*1
    expect(next.direction).toBe(1);
    expect(next.waitingS).toBe(0);
  });

  it('reaches the far side, clamps position, flips direction and starts waiting', () => {
    const state = createPedestrianState(4.9);
    const next = stepPedestrian(state, 5, 1); // 4.9 + 1.2 = 6.1 >= 5
    expect(next.lateralOffsetM).toBe(5);
    expect(next.direction).toBe(-1);
    expect(next.waitingS).toBeGreaterThan(0);
  });

  it('counts down the waiting time without moving', () => {
    const state = { lateralOffsetM: 5, direction: -1 as const, waitingS: 4 };
    const next = stepPedestrian(state, 5, 1.5);
    expect(next.lateralOffsetM).toBe(5);
    expect(next.waitingS).toBeCloseTo(2.5, 6);
  });

  it('starts walking again once the wait reaches zero', () => {
    const state = { lateralOffsetM: 5, direction: -1 as const, waitingS: 0.5 };
    const afterWait = stepPedestrian(state, 5, 0.5);
    expect(afterWait.waitingS).toBe(0);
    const afterWalk = stepPedestrian(afterWait, 5, 1);
    expect(afterWalk.lateralOffsetM).toBeCloseTo(3.8, 6); // 5 - 1.2*1
  });
});

describe('pedestrianPose', () => {
  it('places the pedestrian along the perpendicular axis for a north-facing crossing', () => {
    // headingDeg 0 (norte): eje del paso = (cos0, -sin0) = (1, 0), o sea este-oeste.
    const crossing = { position: { x: 0, z: 0 }, headingDeg: 0 };
    const pose = pedestrianPose(crossing, { lateralOffsetM: 3, direction: 1, waitingS: 0 });
    expect(pose.x).toBeCloseTo(3, 6);
    expect(pose.z).toBeCloseTo(0, 6);
  });

  it('faces the direction of walking, not a fixed orientation', () => {
    const crossing = { position: { x: 0, z: 0 }, headingDeg: 0 };
    const forward = pedestrianPose(crossing, { lateralOffsetM: 0, direction: 1, waitingS: 0 });
    const backward = pedestrianPose(crossing, { lateralOffsetM: 0, direction: -1, waitingS: 0 });
    expect(forward.headingRad).not.toBeCloseTo(backward.headingRad, 3);
  });

  it('rotates the crossing axis together with the street heading', () => {
    // headingDeg 90 (este): eje del paso = (cos90, -sin90) = (0, -1), o sea norte-sur.
    const crossing = { position: { x: 0, z: 0 }, headingDeg: 90 };
    const pose = pedestrianPose(crossing, { lateralOffsetM: 3, direction: 1, waitingS: 0 });
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.z).toBeCloseTo(-3, 6);
  });
});
