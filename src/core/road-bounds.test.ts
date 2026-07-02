import { describe, expect, it } from 'vitest';
import { queryRoadBounds } from './road-bounds';

describe('queryRoadBounds', () => {
  // tramo recto de (0,0) a (0,100), sentido de circulación hacia +z (norte)
  const straight = [
    { x: 0, z: 0 },
    { x: 0, z: 100 },
  ];

  it('reports distance 0 exactly on the centerline', () => {
    const result = queryRoadBounds(straight, 6, { x: 0, z: 50 });
    expect(result.distanceFromCenterM).toBeCloseTo(0, 6);
    expect(result.onRoad).toBe(true);
  });

  it('is on-road within half the road width', () => {
    const result = queryRoadBounds(straight, 6, { x: 2.9, z: 50 });
    expect(result.onRoad).toBe(true);
  });

  it('is off-road beyond half the road width', () => {
    const result = queryRoadBounds(straight, 6, { x: 3.1, z: 50 });
    expect(result.onRoad).toBe(false);
  });

  it('clamps distance to the segment endpoints, not the infinite line', () => {
    const result = queryRoadBounds(straight, 6, { x: 0, z: 150 });
    expect(result.distanceFromCenterM).toBeCloseTo(50, 6);
  });

  it('assigns opposite lateral sign on either side of the road', () => {
    const east = queryRoadBounds(straight, 6, { x: 2, z: 50 });
    const west = queryRoadBounds(straight, 6, { x: -2, z: 50 });
    expect(Math.sign(east.lateralOffsetM)).toBe(-Math.sign(west.lateralOffsetM));
    expect(east.lateralOffsetM).not.toBe(0);
  });

  it('picks the nearest of several segments on a bent route', () => {
    const bent = [
      { x: 0, z: 0 },
      { x: 0, z: 50 },
      { x: 50, z: 50 },
    ];
    const result = queryRoadBounds(bent, 6, { x: 25, z: 51 });
    expect(result.distanceFromCenterM).toBeCloseTo(1, 6);
  });
});
