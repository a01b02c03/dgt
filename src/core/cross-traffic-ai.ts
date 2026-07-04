import type { LocalPoint } from './geo';

/** Velocidad de aproximación al cruce, placeholder no ligado a ningún dato real (misma clase de simplificación que DWELL_TIME_S en pedestrian-ai.ts). */
const CROSS_TRAFFIC_SPEED_MS = 8.3; // ~30 km/h

/** Cuánto recorre el vehículo transversal a cada lado del eje del cruce antes de "desaparecer" y reaparecer al inicio del ciclo. */
export const CROSS_TRAFFIC_HALF_LENGTH_M = 15;

/** Hueco sin vehículo entre el final de un cruce y el siguiente, para que no vaya uno pegado al otro. */
const CYCLE_GAP_M = 20;

const CYCLE_LENGTH_M = CROSS_TRAFFIC_HALF_LENGTH_M * 2 + CYCLE_GAP_M;

// Espaciado placeholder entre el desfase de cruces consecutivos (por
// atWaypointIndex), mismo patrón que PHASE_OFFSET_SPACING_S en traffic-light.ts
// y pedestrian-ai.ts — solo para que no aparezcan todos sincronizados.
const PHASE_OFFSET_SPACING_M = 10;

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Desfase determinista (no aleatorio) de un cruce según su índice de aparición, mismo patrón que trafficLightPhaseOffsetS/pedestrianPhaseOffsetS. */
export function crossTrafficPhaseOffsetM(crossTrafficIndex: number): number {
  return positiveModulo(crossTrafficIndex * PHASE_OFFSET_SPACING_M, CYCLE_LENGTH_M);
}

/**
 * Sin estado propio, igual que getTrafficLightPhase: la posición del
 * vehículo transversal es una función pura del tiempo transcurrido, no hace
 * falta simularla incrementalmente frame a frame. El vehículo recorre en
 * línea recta desde -CROSS_TRAFFIC_HALF_LENGTH_M hasta +CROSS_TRAFFIC_HALF_LENGTH_M
 * (cruzando el eje del cruce en el punto 0) y luego "desaparece"
 * (`onCrossing: false`) durante CYCLE_GAP_M antes de reaparecer al principio
 * — un bucle continuo en un único sentido, no un vaivén como los peatones
 * (un coche real no cruza, aparca en la otra acera y vuelve marcha atrás).
 */
export interface CrossTrafficPosition {
  /** Posición con signo a lo largo del eje del cruce, metros desde su centro. */
  lateralOffsetM: number;
  /** true si el vehículo está dentro del tramo visible/con colisión (no en el hueco entre ciclos). */
  onCrossing: boolean;
}

export function crossTrafficPositionAt(elapsedSimS: number, phaseOffsetM: number): CrossTrafficPosition {
  const distanceM = positiveModulo(elapsedSimS * CROSS_TRAFFIC_SPEED_MS + phaseOffsetM, CYCLE_LENGTH_M);
  const onCrossing = distanceM < CROSS_TRAFFIC_HALF_LENGTH_M * 2;
  return {
    lateralOffsetM: distanceM - CROSS_TRAFFIC_HALF_LENGTH_M,
    onCrossing,
  };
}

export interface CrossTrafficPose {
  x: number;
  z: number;
  headingRad: number;
}

/**
 * Posición y rumbo en el mundo del vehículo transversal en el waypoint del
 * cruce. Su eje es perpendicular al rumbo del tramo principal — a la
 * izquierda si `fromSide === 'left'` (llega desde la izquierda del jugador,
 * cruza hacia la derecha), a la derecha si no, mismo convenio "derecha =
 * positivo" que road-bounds.ts/pedestrian-ai.ts.
 */
export function crossTrafficPose(
  junction: { position: LocalPoint; headingDeg: number },
  fromSide: 'left' | 'right',
  crossing: CrossTrafficPosition,
): CrossTrafficPose {
  const headingRad = (junction.headingDeg * Math.PI) / 180;
  const axisX = Math.cos(headingRad);
  const axisZ = -Math.sin(headingRad);
  // fromSide 'left': avanza de izquierda a derecha, o sea en la dirección +axis
  // (misma convención "derecha = positivo" que road-bounds.ts); 'right': en
  // la dirección -axis. Vehicle-controller.ts define adelante como
  // (sin(headingRad), cos(headingRad)); moverse en +axis (cos(h), -sin(h))
  // equivale a headingRad + 90°, y en -axis a headingRad - 90°.
  const direction = fromSide === 'left' ? 1 : -1;
  const travelHeadingRad = fromSide === 'left' ? headingRad + Math.PI / 2 : headingRad - Math.PI / 2;

  return {
    x: junction.position.x + axisX * crossing.lateralOffsetM * direction,
    z: junction.position.z + axisZ * crossing.lateralOffsetM * direction,
    headingRad: travelHeadingRad,
  };
}
