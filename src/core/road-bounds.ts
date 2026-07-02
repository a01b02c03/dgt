import type { LocalPoint } from './geo';

export const ROAD_WIDTH_M = 6;

export interface RoadBoundsQuery {
  /** Distancia absoluta al eje de la calzada, en metros. */
  distanceFromCenterM: number;
  /** Desplazamiento lateral con signo respecto al sentido de circulación: negativo = izquierda, positivo = derecha. */
  lateralOffsetM: number;
  /** true si está dentro del ancho de calzada (distanceFromCenterM <= roadWidthM / 2). */
  onRoad: boolean;
  /** Índice i tal que el segmento más cercano es centerline[i]-centerline[i+1]. */
  segmentIndex: number;
}

/**
 * Distancia mínima (con signo lateral) de `position` al eje de la ruta, formado por
 * los segmentos consecutivos de `centerline`. Para cada segmento se proyecta el
 * punto y se recorta al propio segmento (no a la recta infinita), y se toma el
 * segmento con menor distancia — necesario para trazados con curvas/cruces.
 */
export function queryRoadBounds(
  centerline: LocalPoint[],
  roadWidthM: number,
  position: LocalPoint,
): RoadBoundsQuery {
  let bestDistance = Infinity;
  let bestLateral = 0;
  let bestSegmentIndex = 0;

  for (let i = 0; i < centerline.length - 1; i++) {
    const p1 = centerline[i];
    const p2 = centerline[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const segmentLengthSq = dx * dx + dz * dz;

    const toPointX = position.x - p1.x;
    const toPointZ = position.z - p1.z;

    const t = segmentLengthSq === 0 ? 0 : clamp((toPointX * dx + toPointZ * dz) / segmentLengthSq, 0, 1);
    const closestX = p1.x + dx * t;
    const closestZ = p1.z + dz * t;

    const distX = position.x - closestX;
    const distZ = position.z - closestZ;
    const distance = Math.hypot(distX, distZ);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegmentIndex = i;
      // cruz 2D (dx,dz) x (toPointX,toPointZ): >0 = izquierda del sentido de circulación, <0 = derecha.
      const cross = dx * toPointZ - dz * toPointX;
      const length = Math.sqrt(segmentLengthSq) || 1;
      bestLateral = -cross / length;
    }
  }

  const halfWidth = roadWidthM / 2;
  return {
    distanceFromCenterM: bestDistance,
    lateralOffsetM: bestLateral,
    onRoad: bestDistance <= halfWidth,
    segmentIndex: bestSegmentIndex,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
