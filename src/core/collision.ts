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
 * Proyecta `corners` sobre el eje `(axisX, axisZ)` y devuelve [mínimo, máximo].
 */
function projectOntoAxis(corners: LocalPoint[], axisX: number, axisZ: number): [number, number] {
  const projections = corners.map((p) => p.x * axisX + p.z * axisZ);
  return [Math.min(...projections), Math.max(...projections)];
}

/** true si alguno de los ejes normales a los lados de `corners` separa completamente a `corners` de `other`. */
function hasSeparatingAxis(corners: LocalPoint[], other: LocalPoint[]): boolean {
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const axisX = -(p2.z - p1.z);
    const axisZ = p2.x - p1.x;

    const [minA, maxA] = projectOntoAxis(corners, axisX, axisZ);
    const [minB, maxB] = projectOntoAxis(other, axisX, axisZ);
    if (maxA < minB || maxB < minA) {
      return true;
    }
  }
  return false;
}

/**
 * Solape de dos rectángulos orientados arbitrariamente (SAT: teorema del eje
 * separador). A diferencia de comprobar solo si una esquina de uno cae dentro
 * del otro (como `isPointInPolygon` con un vértice), esto no se pierde un
 * cruce en T donde ninguna esquina de ninguno de los dos rectángulos cae
 * dentro del otro pero sí se solapan — el caso típico de dos vehículos
 * cruzándose en un ángulo.
 */
export function rectanglesOverlap(cornersA: LocalPoint[], cornersB: LocalPoint[]): boolean {
  return !hasSeparatingAxis(cornersA, cornersB) && !hasSeparatingAxis(cornersB, cornersA);
}

/** Índice del primer rectángulo de `others` que se solapa con `corners`, o null. */
export function findCollidingRectangle(corners: LocalPoint[], others: LocalPoint[][]): number | null {
  for (let i = 0; i < others.length; i++) {
    if (rectanglesOverlap(corners, others[i])) {
      return i;
    }
  }
  return null;
}

/** Índice del primer punto de `points` que cae dentro del rectángulo `corners`, o null. */
export function findCollidingPoint(corners: LocalPoint[], points: LocalPoint[]): number | null {
  for (let i = 0; i < points.length; i++) {
    if (isPointInPolygon(points[i], corners)) {
      return i;
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
