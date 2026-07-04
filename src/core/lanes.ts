import type { LocalPoint } from './geo';
import type { RoutePose } from './traffic-ai';
import type { Waypoint } from './route-types';

/**
 * Offset lateral del centro de cada carril respecto al eje de la calzada,
 * la mitad del ancho total (ver ROAD_WIDTH_M en road-bounds.ts): con 6m de
 * calzada, cada sentido ocupa su mitad (3m), centrado en ±1.5m. Caso
 * particular de `laneOffsetM(0, 1)` de abajo — se mantiene como constante
 * aparte porque el sentido contrario siempre se modela con un único carril
 * (ver `oncomingVehicles` en main.ts), así que no necesita pasar por el
 * modelo genérico de varios carriles.
 */
export const LANE_OFFSET_M = 1.5;

/** Ancho de un carril, en metros — igual al ancho por sentido de ROAD_WIDTH_M/2 cuando hay un único carril. */
export const LANE_WIDTH_M = 3;

/**
 * Si el tramo que empieza en `waypoints[segmentIndex]` es de doble sentido.
 * Misma convención "aplica desde este waypoint en adelante" que
 * currentSpeedLimitKmh en core/hud.ts.
 */
export function isTwoWaySegment(waypoints: Waypoint[], segmentIndex: number): boolean {
  return (waypoints[segmentIndex] ?? waypoints[0]).twoWay;
}

/**
 * Número de carriles del propio sentido en el tramo que empieza en
 * `waypoints[segmentIndex]`. Misma convención "aplica desde este waypoint en
 * adelante" que isTwoWaySegment/currentSpeedLimitKmh. Modelo genérico, listo
 * para una ruta futura con varios carriles en el mismo sentido — ninguna ruta
 * real lo usa hoy (ver CLAUDE.md): ruta-01 tiene `ownDirectionLanes: 1` en
 * todos sus waypoints, así que este modelo se comporta como el carril único
 * de siempre.
 */
export function ownDirectionLaneCount(waypoints: Waypoint[], segmentIndex: number): number {
  return (waypoints[segmentIndex] ?? waypoints[0]).ownDirectionLanes;
}

/**
 * Ancho total de calzada del tramo que empieza en `waypoints[segmentIndex]`:
 * un bloque de LANE_WIDTH_M por cada carril del propio sentido
 * (ownDirectionLaneCount) más, solo si el tramo es de doble sentido
 * (isTwoWaySegment), un único carril más para el sentido contrario — que
 * siempre se modela con un carril fijo, ver `OncomingRoute` más abajo. Usado
 * por road-mesh.ts (ancho visual de la cinta) y road-bounds.ts (umbral de
 * salida de calzada) para no asumir un ROAD_WIDTH_M fijo en toda la ruta: con
 * `ownDirectionLanes: 1` en todos los waypoints (caso de ruta-01 hoy, ver
 * CLAUDE.md) da 6m en los tramos de doble sentido y 3m en los de sentido
 * único, coherente con LANE_OFFSET_M/ROAD_WIDTH_M de antes de existir este
 * modelo.
 */
export function roadWidthMAtSegment(waypoints: Waypoint[], segmentIndex: number): number {
  const laneCount = ownDirectionLaneCount(waypoints, segmentIndex);
  const oncomingLanes = isTwoWaySegment(waypoints, segmentIndex) ? 1 : 0;
  return (laneCount + oncomingLanes) * LANE_WIDTH_M;
}

/** Recorta un índice de carril al rango disponible [0, laneCount - 1] — p. ej. si el tramo actual tiene menos carriles que donde arrancó el vehículo. */
export function clampLaneIndex(laneIndex: number, laneCount: number): number {
  return Math.min(Math.max(laneIndex, 0), laneCount - 1);
}

/**
 * Offset lateral del centro del carril `laneIndex` (0 = el más cercano al eje
 * de la calzada, creciente hacia la acera) dentro de un bloque de `laneCount`
 * carriles del propio sentido, cada uno de LANE_WIDTH_M. Recorta laneIndex al
 * rango disponible en vez de lanzar, para que un vehículo con un carril
 * asignado en un tramo más ancho no quede fuera de calzada si el tramo
 * siguiente tiene menos carriles (no hay modelo de fusión de carriles, ver
 * traffic-ai.ts).
 */
export function laneOffsetM(laneIndex: number, laneCount: number): number {
  return LANE_WIDTH_M * (clampLaneIndex(laneIndex, laneCount) + 0.5);
}

/**
 * Carril más cercano a un desplazamiento lateral dado (mismo convenio que
 * RoadBoundsQuery.lateralOffsetM: positivo = a la derecha del sentido de
 * circulación, o sea, el lado del propio sentido). Usado para saber en qué
 * carril está el jugador (que se mueve libre en 2D, no por carril fijo como
 * la IA) a efectos de si bloquea a un vehículo de IA que le sigue por detrás.
 */
export function laneIndexFromLateralOffsetM(lateralOffsetM: number, laneCount: number): number {
  return clampLaneIndex(Math.floor(lateralOffsetM / LANE_WIDTH_M), laneCount);
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
