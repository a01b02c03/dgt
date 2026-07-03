import { describe, expect, it } from 'vitest';
import {
  findCollidingBuilding,
  findCollidingPoint,
  findCollidingRectangle,
  isPointInPolygon,
  rectanglesOverlap,
  vehicleCorners,
} from './collision';

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

describe('rectanglesOverlap', () => {
  it('is true for two clearly overlapping axis-aligned rectangles', () => {
    const a = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
    const b = [{ x: 2, z: 2 }, { x: 6, z: 2 }, { x: 6, z: 6 }, { x: 2, z: 6 }];
    expect(rectanglesOverlap(a, b)).toBe(true);
  });

  it('is false for two clearly separate rectangles', () => {
    const a = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
    const b = [{ x: 100, z: 100 }, { x: 104, z: 100 }, { x: 104, z: 104 }, { x: 100, z: 104 }];
    expect(rectanglesOverlap(a, b)).toBe(false);
  });

  it('detects a T-bone crossing where neither rectangle has a corner inside the other', () => {
    // A: larga y fina, horizontal (10 x 1). B: larga y fina, vertical (1 x 10).
    // Se cruzan en el centro en forma de "+", pero ninguna esquina de una cae
    // dentro de la otra — el caso que un test de "esquina dentro del polígono"
    // (isPointInPolygon con un solo vértice) se perdería.
    const horizontal = [{ x: -5, z: -0.5 }, { x: 5, z: -0.5 }, { x: 5, z: 0.5 }, { x: -5, z: 0.5 }];
    const vertical = [{ x: -0.5, z: -5 }, { x: -0.5, z: 5 }, { x: 0.5, z: 5 }, { x: 0.5, z: -5 }];
    expect(rectanglesOverlap(horizontal, vertical)).toBe(true);
  });
});

describe('findCollidingRectangle', () => {
  const player = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];

  it('returns the index of the first overlapping rectangle', () => {
    const others = [
      [{ x: 100, z: 100 }, { x: 102, z: 100 }, { x: 102, z: 102 }, { x: 100, z: 102 }], // lejos
      [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 3 }, { x: 1, z: 3 }], // solapa
    ];
    expect(findCollidingRectangle(player, others)).toBe(1);
  });

  it('returns null when nothing overlaps', () => {
    const others = [[{ x: 100, z: 100 }, { x: 102, z: 100 }, { x: 102, z: 102 }, { x: 100, z: 102 }]];
    expect(findCollidingRectangle(player, others)).toBeNull();
  });
});

describe('findCollidingPoint', () => {
  const box = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];

  it('returns the index of the first point inside the rectangle', () => {
    expect(findCollidingPoint(box, [{ x: 100, z: 100 }, { x: 2, z: 2 }])).toBe(1);
  });

  it('returns null when no point is inside', () => {
    expect(findCollidingPoint(box, [{ x: 100, z: 100 }])).toBeNull();
  });
});
