import type { LocalPoint } from './geo';

const ACCEL_MS2 = 2.5;
const BRAKE_DECEL_MS2 = 4;

// Distancia de seguridad a la que un vehículo de IA empieza a frenar antes de
// un punto de parada (semáforo en rojo o el vehículo de delante). Frenada a
// distancia fija, no un cálculo de frenada real dependiente de la velocidad
// — misma clase de simplificación que el criterio del ámbar en
// traffic-light-evaluator.ts, documentada igual: no hay modelo de físicas de
// frenada en este proyecto.
const BRAKING_DISTANCE_M = 15;

/** Hueco mínimo que un vehículo de IA mantiene con el vehículo de delante (jugador u otra IA). */
export const FOLLOWING_GAP_M = 8;

export interface AiVehicleState {
  /** Distancia recorrida a lo largo del trazado de la ruta, en metros. */
  distanceAlongRouteM: number;
  speedMs: number;
}

export function createAiVehicleState(distanceAlongRouteM: number): AiVehicleState {
  return { distanceAlongRouteM, speedMs: 0 };
}

/** Distancia acumulada (m) en cada waypoint del trazado; table[0] = 0. */
export function buildArcLengthTable(waypointPositions: LocalPoint[]): number[] {
  const table = [0];
  for (let i = 1; i < waypointPositions.length; i++) {
    const prev = waypointPositions[i - 1];
    const curr = waypointPositions[i];
    table.push(table[i - 1] + Math.hypot(curr.x - prev.x, curr.z - prev.z));
  }
  return table;
}

/** Índice i tal que arcLengthM cae en el segmento waypointPositions[i]-[i+1] (recortado a los extremos del trazado). */
function segmentIndexAtArcLength(arcTable: number[], arcLengthM: number): number {
  if (arcLengthM <= arcTable[0]) {
    return 0;
  }
  for (let i = 1; i < arcTable.length; i++) {
    if (arcLengthM <= arcTable[i]) {
      return i - 1;
    }
  }
  return arcTable.length - 2;
}

export interface RoutePose {
  x: number;
  z: number;
  headingRad: number;
}

/**
 * Posición y rumbo interpolados linealmente entre los dos waypoints del
 * segmento que contiene `arcLengthM`. Recorta a los extremos del trazado
 * (un vehículo de IA no puede "salirse" del final de la ruta por este medio).
 */
export function poseAtArcLength(waypointPositions: LocalPoint[], arcTable: number[], arcLengthM: number): RoutePose {
  const clamped = Math.max(arcTable[0], Math.min(arcLengthM, arcTable[arcTable.length - 1]));
  const i = segmentIndexAtArcLength(arcTable, clamped);
  const p1 = waypointPositions[i];
  const p2 = waypointPositions[i + 1];
  const segmentLength = arcTable[i + 1] - arcTable[i];
  const t = segmentLength === 0 ? 0 : (clamped - arcTable[i]) / segmentLength;

  return {
    x: p1.x + (p2.x - p1.x) * t,
    z: p1.z + (p2.z - p1.z) * t,
    // Mismo convenio (sin, cos) que el resto del proyecto: heading 0 = norte/+Z.
    headingRad: Math.atan2(p2.x - p1.x, p2.z - p1.z),
  };
}

/**
 * Proyecta `point` sobre el segmento más cercano del trazado y devuelve su
 * distancia acumulada equivalente. El vehículo del jugador no sigue el
 * trazado por arco (se mueve libremente en 2D), así que esto es lo que
 * permite ubicarlo en la misma escala de distancia que los vehículos de IA
 * para saber si va delante o detrás de ellos.
 */
export function estimateArcLength(waypointPositions: LocalPoint[], arcTable: number[], point: LocalPoint): number {
  let bestDistanceSq = Infinity;
  let bestArc = 0;

  for (let i = 0; i < waypointPositions.length - 1; i++) {
    const p1 = waypointPositions[i];
    const p2 = waypointPositions[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const segmentLengthSq = dx * dx + dz * dz;
    const t =
      segmentLengthSq === 0
        ? 0
        : clamp(((point.x - p1.x) * dx + (point.z - p1.z) * dz) / segmentLengthSq, 0, 1);
    const closestX = p1.x + dx * t;
    const closestZ = p1.z + dz * t;
    const distanceSq = (point.x - closestX) ** 2 + (point.z - closestZ) ** 2;

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestArc = arcTable[i] + (arcTable[i + 1] - arcTable[i]) * t;
    }
  }

  return bestArc;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Punto de parada más cercano por delante de `currentArcM`, en distancia
 * acumulada: el mínimo entre los semáforos en rojo que aún no se han cruzado
 * y el hueco de seguridad respecto al vehículo de delante. `null` si no hay
 * ninguno (vía libre).
 */
export function nextStopArcLengthM(
  currentArcM: number,
  redLightArcLengthsM: number[],
  leadVehicleArcM: number | null,
  followingGapM: number = FOLLOWING_GAP_M,
): number | null {
  const candidates = redLightArcLengthsM.filter((arc) => arc > currentArcM);
  if (leadVehicleArcM !== null) {
    candidates.push(leadVehicleArcM - followingGapM);
  }
  return candidates.length === 0 ? null : Math.min(...candidates);
}

/**
 * Avanza un vehículo de IA a lo largo del trazado: no tiene volante, su única
 * decisión es la velocidad. Acelera hacia el límite vigente salvo que haya un
 * punto de parada (`stopLineArcM`) a menos de BRAKING_DISTANCE_M, en cuyo caso
 * frena a 0.
 */
export function stepAiVehicle(
  state: AiVehicleState,
  params: { speedLimitMs: number; stopLineArcM: number | null },
  dtSeconds: number,
): AiVehicleState {
  const remaining =
    params.stopLineArcM === null ? Infinity : params.stopLineArcM - state.distanceAlongRouteM;
  const targetSpeedMs = remaining <= BRAKING_DISTANCE_M ? 0 : params.speedLimitMs;

  let speedMs = state.speedMs;
  if (speedMs < targetSpeedMs) {
    speedMs = Math.min(targetSpeedMs, speedMs + ACCEL_MS2 * dtSeconds);
  } else if (speedMs > targetSpeedMs) {
    speedMs = Math.max(targetSpeedMs, speedMs - BRAKE_DECEL_MS2 * dtSeconds);
  }

  return { distanceAlongRouteM: state.distanceAlongRouteM + speedMs * dtSeconds, speedMs };
}
