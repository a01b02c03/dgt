import type { LocalPoint } from './geo';

export interface CollisionShape {
  id: string;
  /** Anillo cerrado en metros locales (el primer punto no se repite al final). */
  footprint: LocalPoint[];
}

/** Ray casting point-in-polygon; asume un polígono simple (sin huecos). */
export function isPointInPolygon(point: LocalPoint, polygon: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const crossesRay = zi > point.z !== zj > point.z;
    if (crossesRay) {
      const intersectX = ((xj - xi) * (point.z - zi)) / (zj - zi) + xi;
      if (point.x < intersectX) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Primer edificio que contiene alguno de los `points` dados (p.ej. las esquinas del vehículo), o null. */
export function findCollidingBuilding(points: LocalPoint[], buildings: CollisionShape[]): CollisionShape | null {
  for (const building of buildings) {
    for (const point of points) {
      if (isPointInPolygon(point, building.footprint)) {
        return building;
      }
    }
  }
  return null;
}

/**
 * Esquinas del rectángulo del vehículo en coordenadas de mundo, a partir del
 * centro, el rumbo (mismo convenio que headingDeg: 0=norte/+z, 90=este/+x,
 * sentido horario visto desde arriba) y sus dimensiones.
 */
export function vehicleCorners(
  x: number,
  z: number,
  headingRad: number,
  lengthM: number,
  widthM: number,
): LocalPoint[] {
  const halfLength = lengthM / 2;
  const halfWidth = widthM / 2;
  const cos = Math.cos(headingRad);
  const sin = Math.sin(headingRad);

  const localCorners = [
    { lx: halfWidth, lz: halfLength },
    { lx: -halfWidth, lz: halfLength },
    { lx: -halfWidth, lz: -halfLength },
    { lx: halfWidth, lz: -halfLength },
  ];

  return localCorners.map(({ lx, lz }) => ({
    x: x + lx * cos + lz * sin,
    z: z - lx * sin + lz * cos,
  }));
}
