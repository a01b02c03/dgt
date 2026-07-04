import { describe, expect, it } from 'vitest';
import {
  crossTrafficPhaseOffsetM,
  crossTrafficPose,
  crossTrafficPositionAt,
  CROSS_TRAFFIC_HALF_LENGTH_M,
} from './cross-traffic-ai';

describe('crossTrafficPositionAt', () => {
  it('starts at the negative edge of the crossing at time 0 with no offset', () => {
    const position = crossTrafficPositionAt(0, 0);
    expect(position.lateralOffsetM).toBeCloseTo(-CROSS_TRAFFIC_HALF_LENGTH_M, 6);
    expect(position.onCrossing).toBe(true);
  });

  it('crosses the junction axis (offset 0) partway through the crossing', () => {
    const position = crossTrafficPositionAt(CROSS_TRAFFIC_HALF_LENGTH_M / 8.3, 0);
    expect(position.lateralOffsetM).toBeCloseTo(0, 3);
    expect(position.onCrossing).toBe(true);
  });

  it('is not on the crossing during the gap between cycles', () => {
    // Justo después de cruzar del todo (2 * HALF_LENGTH de distancia recorrida), debería estar en el hueco.
    const secondsToFinishCrossing = (CROSS_TRAFFIC_HALF_LENGTH_M * 2) / 8.3;
    const position = crossTrafficPositionAt(secondsToFinishCrossing + 1, 0);
    expect(position.onCrossing).toBe(false);
  });

  it('loops back to the start after a full cycle', () => {
    const early = crossTrafficPositionAt(1, 0);
    // Un ciclo completo más tarde, misma posición relativa (mismo desfase de fase).
    const cycleLengthS = (CROSS_TRAFFIC_HALF_LENGTH_M * 2 + 20) / 8.3;
    const later = crossTrafficPositionAt(1 + cycleLengthS, 0);
    expect(later.lateralOffsetM).toBeCloseTo(early.lateralOffsetM, 6);
    expect(later.onCrossing).toBe(early.onCrossing);
  });

  it('applies a phase offset to desynchronize multiple crossings', () => {
    const withoutOffset = crossTrafficPositionAt(0, 0);
    const withOffset = crossTrafficPositionAt(0, 10);
    expect(withOffset.lateralOffsetM).not.toBeCloseTo(withoutOffset.lateralOffsetM, 3);
  });
});

describe('crossTrafficPhaseOffsetM', () => {
  it('is 0 for the first crossing', () => {
    expect(crossTrafficPhaseOffsetM(0)).toBe(0);
  });

  it('differs for consecutive crossings', () => {
    expect(crossTrafficPhaseOffsetM(1)).not.toBe(crossTrafficPhaseOffsetM(0));
  });
});

describe('crossTrafficPose', () => {
  const junction = { position: { x: 0, z: 0 }, headingDeg: 0 };

  it('places a left-side vehicle to the right of the axis as it finishes crossing (left to right)', () => {
    const pose = crossTrafficPose(junction, 'left', { lateralOffsetM: CROSS_TRAFFIC_HALF_LENGTH_M, onCrossing: true });
    expect(pose.x).toBeCloseTo(CROSS_TRAFFIC_HALF_LENGTH_M, 6);
    expect(pose.z).toBeCloseTo(0, 6);
  });

  it('places a right-side vehicle to the right of the axis as it starts crossing (right to left)', () => {
    const pose = crossTrafficPose(junction, 'right', { lateralOffsetM: -CROSS_TRAFFIC_HALF_LENGTH_M, onCrossing: true });
    expect(pose.x).toBeCloseTo(CROSS_TRAFFIC_HALF_LENGTH_M, 6);
    expect(pose.z).toBeCloseTo(0, 6);
  });

  it('gives opposite travel headings for left vs right approach at the same crossing offset', () => {
    const fromLeft = crossTrafficPose(junction, 'left', { lateralOffsetM: 0, onCrossing: true });
    const fromRight = crossTrafficPose(junction, 'right', { lateralOffsetM: 0, onCrossing: true });
    expect(Math.abs(fromLeft.headingRad - fromRight.headingRad)).toBeCloseTo(Math.PI, 6);
  });
});
