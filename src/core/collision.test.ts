import { describe, expect, it } from 'vitest';
import { findCollidingBuilding, isPointInPolygon, vehicleCorners } from './collision';

describe('isPointInPolygon', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];

  it('returns true for a point inside the polygon', () => {
    expect(isPointInPolygon({ x: 5, z: 5 }, square)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(isPointInPolygon({ x: 15, z: 5 }, square)).toBe(false);
  });

  it('returns false for a point far away in every direction', () => {
    expect(isPointInPolygon({ x: -100, z: -100 }, square)).toBe(false);
  });
});

describe('findCollidingBuilding', () => {
  const buildings = [
    { id: 'a', footprint: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] },
    { id: 'b', footprint: [{ x: 100, z: 100 }, { x: 110, z: 100 }, { x: 110, z: 110 }, { x: 100, z: 110 }] },
  ];

  it('finds the building containing one of the given points', () => {
    const result = findCollidingBuilding([{ x: 5, z: 5 }], buildings);
    expect(result?.id).toBe('a');
  });

  it('returns null when no point is inside any building', () => {
    const result = findCollidingBuilding([{ x: 50, z: 50 }], buildings);
    expect(result).toBeNull();
  });
});

describe('vehicleCorners', () => {
  it('produces an axis-aligned box facing north (heading 0)', () => {
    const corners = vehicleCorners(0, 0, 0, 4, 2);
    const xs = corners.map((c) => c.x).sort((a, b) => a - b);
    const zs = corners.map((c) => c.z).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[3]).toBeCloseTo(1, 6);
    expect(zs[0]).toBeCloseTo(-2, 6);
    expect(zs[3]).toBeCloseTo(2, 6);
  });

  it('rotates the box when facing east (heading 90deg)', () => {
    const corners = vehicleCorners(0, 0, Math.PI / 2, 4, 2);
    const xs = corners.map((c) => c.x).sort((a, b) => a - b);
    const zs = corners.map((c) => c.z).sort((a, b) => a - b);
    // ahora el largo (4) queda a lo largo de x, el ancho (2) a lo largo de z
    expect(xs[0]).toBeCloseTo(-2, 6);
    expect(xs[3]).toBeCloseTo(2, 6);
    expect(zs[0]).toBeCloseTo(-1, 6);
    expect(zs[3]).toBeCloseTo(1, 6);
  });
});
