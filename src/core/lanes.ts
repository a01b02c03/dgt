import type { LocalPoint } from './geo';
import type { RoutePose } from './traffic-ai';
import type { Waypoint } from './route-types';

/**
 * Offset lateral del centro de cada carril respecto al eje de la calzada,
 * la mitad del ancho total (ver ROAD_WIDTH_M en road-bounds.ts): con 6m de
 * calzada, cada sentido ocupa su mitad (3m), centrado en ±1.5m.
 */
export const LANE_OFFSET_M = 1.5;

/**
 * Si el tramo que empieza en `waypoints[segmentIndex]` es de doble sentido.
 * Misma convención "aplica desde este waypoint en adelante" que
 * currentSpeedLimitKmh en core/hud.ts.
 */
export function isTwoWaySegment(waypoints: Waypoint[], segmentIndex: number): boolean {
  return (waypoints[segmentIndex] ?? waypoints[0]).twoWay;
}

export interface OncomingRoute {
  /** Puntos del trazado invertidos (de vuelta hacia el principio de la ruta), solo el tramo de doble sentido. */
  points: LocalPoint[];
  /** Índice (en el sentido original de la ruta) del último waypoint que forma parte de ese tramo. */
  twoWayEndIndex: number;
}

/**
 * Sub-trazado invertido restringido al tramo de doble sentido que arranca en
 * el principio de la ruta — el único lugar donde puede circular tráfico en
 * sentido contrario. Simplificación deliberada: solo detecta un tramo inicial
 * de doble sentido (no doble-sentido → sentido-único → doble-sentido otra
 * vez), suficiente para el único caso real que existe hoy (ver
 * `ruta-01/route.ts`); ampliar si una ruta futura lo necesita.
 */
export function buildOncomingRoute(waypoints: Waypoint[], routePoints: LocalPoint[]): OncomingRoute {
  let twoWayEndIndex = 0;
  while (twoWayEndIndex < waypoints.length - 1 && waypoints[twoWayEndIndex].twoWay) {
    twoWayEndIndex++;
  }
  return { points: routePoints.slice(0, twoWayEndIndex + 1).reverse(), twoWayEndIndex };
}

/**
 * Distancia acumulada (en el espacio de arco invertido de `OncomingRoute`) del
 * waypoint `waypointIndex` de la ruta original — para saber a qué distancia,
 * desde la perspectiva de un vehículo en sentido contrario, está un semáforo
 * anclado a ese waypoint. `null` si el waypoint queda fuera del tramo de
 * doble sentido (`oncomingArcTable` no lo cubre).
 */
export function mirroredArcLengthOfWaypoint(
  oncomingArcTable: number[],
  twoWayEndIndex: number,
  waypointIndex: number,
): number | null {
  if (waypointIndex > twoWayEndIndex) {
    return null;
  }
  return oncomingArcTable[twoWayEndIndex - waypointIndex];
}

/**
 * Desplaza una pose lateralmente (perpendicular a su propio rumbo, positivo =
 * a la derecha del sentido de circulación — mismo convenio que
 * RoadBoundsQuery.lateralOffsetM en road-bounds.ts). Para vehículos en
 * sentido contrario, `pose.headingRad` ya viene invertido de fábrica al venir
 * de un `OncomingRoute` (puntos en orden inverso), así que "a la derecha" ya
 * es correcto desde su propio punto de vista sin ningún caso especial.
 */
export function offsetPoseToLane(pose: RoutePose, lateralOffsetM: number): RoutePose {
  const axisX = Math.cos(pose.headingRad);
  const axisZ = -Math.sin(pose.headingRad);
  return {
    x: pose.x + axisX * lateralOffsetM,
    z: pose.z + axisZ * lateralOffsetM,
    headingRad: pose.headingRad,
  };
}
