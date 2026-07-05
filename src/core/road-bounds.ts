import type { LocalPoint } from './geo';

export interface RoadBoundsQuery {
  /** Distancia absoluta al eje de la calzada, en metros. */
  distanceFromCenterM: number;
  /** Desplazamiento lateral con signo respecto al sentido de circulación: negativo = izquierda, positivo = derecha. */
  lateralOffsetM: number;
  /** true si está dentro del ancho de calzada (distanceFromCenterM <= roadWidthM / 2). */
  onRoad: boolean;
  /** Índice i tal que el segmento más cercano es centerline[i]-centerline[i+1]. */
  segmentIndex: number;
  /**
   * Proyección de la posición consultada sobre el eje: el punto de la
   * polilínea más cercano. Usado para "encajar" al eje de la calzada un
   * punto de un dataset real que cae desplazado lateralmente (p. ej. la
   * posición oficial de un paso de peatones, medida en la esquina de la
   * acera y no en el centro de la vía — el paso #0 de ruta-02 está a -5.6m
   * del eje, fuera del propio asfalto de 9m).
   */
  closestPoint: LocalPoint;
}

/**
 * Distancia mínima (con signo lateral) de `position` al eje de la ruta, formado por
 * los segmentos consecutivos de `centerline`. Para cada segmento se proyecta el
 * punto y se recorta al propio segmento (no a la recta infinita), y se toma el
 * segmento con menor distancia — necesario para trazados con curvas/cruces.
 *
 * `roadWidthMAt` se consulta solo con el segmentIndex ya elegido (la búsqueda
 * del segmento más cercano es puramente geométrica, no depende del ancho) —
 * así el ancho puede variar por tramo (ver roadWidthMAtSegment en lanes.ts)
 * sin que esta función necesite saber nada de carriles/sentido único.
 */
export function queryRoadBounds(
  centerline: LocalPoint[],
  roadWidthMAt: (segmentIndex: number) => number,
  position: LocalPoint,
): RoadBoundsQuery {
  let bestDistance = Infinity;
  let bestLateral = 0;
  let bestSegmentIndex = 0;
  let bestClosest: LocalPoint = centerline[0];

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
      bestClosest = { x: closestX, z: closestZ };
      // cruz 2D (dx,dz) x (toPointX,toPointZ): >0 = izquierda del sentido de circulación, <0 = derecha.
      const cross = dx * toPointZ - dz * toPointX;
      const length = Math.sqrt(segmentLengthSq) || 1;
      bestLateral = -cross / length;
    }
  }

  const halfWidth = roadWidthMAt(bestSegmentIndex) / 2;
  return {
    distanceFromCenterM: bestDistance,
    lateralOffsetM: bestLateral,
    onRoad: bestDistance <= halfWidth,
    segmentIndex: bestSegmentIndex,
    closestPoint: bestClosest,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
