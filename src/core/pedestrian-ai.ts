import type { LocalPoint } from './geo';

/** Velocidad media de paso de una persona caminando, valor de referencia real, no fabricado. */
const PEDESTRIAN_SPEED_MS = 1.2;

/**
 * Espera en cada acera antes de cruzar de vuelta. Placeholder determinista
 * (no aleatorio), misma clase de simplificación que el ciclo de semáforos en
 * traffic-light.ts: no hay datos reales de qué tan seguido cruza la gente en
 * cada paso de peatones de ruta-01 (que además no tiene ninguno todavía, ver
 * CLAUDE.md), así que un valor fijo es lo honesto hasta que haga falta variarlo.
 */
const DWELL_TIME_S = 4;

/** Cuánto se adentra el peatón en la acera a cada lado del paso, más allá del ancho de calzada. */
export const PEDESTRIAN_CROSSING_MARGIN_M = 2;

export interface PedestrianState {
  /** Posición a lo largo del eje del paso de peatones (perpendicular a la calzada), en metros con signo. */
  lateralOffsetM: number;
  /** Sentido de marcha actual: +1 o -1 a lo largo del eje del paso. */
  direction: 1 | -1;
  /** Tiempo restante de espera en la acera actual; 0 = caminando. */
  waitingS: number;
}

export function createPedestrianState(startLateralOffsetM: number): PedestrianState {
  return { lateralOffsetM: startLateralOffsetM, direction: 1, waitingS: 0 };
}

/**
 * Si el peatón está físicamente sobre la calzada (no en la acera): dentro de
 * ±roadHalfWidthM del eje del paso. Usado por la IA de vehículos para saber
 * si deben ceder el paso (ver core/traffic-ai.ts, nextStopArcLengthM) — un
 * peatón esperando en la acera (dentro de crossingHalfWidthM pero fuera de
 * roadHalfWidthM) no bloquea el tráfico todavía.
 */
export function isPedestrianInRoadway(state: PedestrianState, roadHalfWidthM: number): boolean {
  return Math.abs(state.lateralOffsetM) <= roadHalfWidthM;
}

/**
 * Avanza un peatón: camina en línea recta de un extremo al otro del paso
 * (definido por ±crossingHalfWidthM) y espera DWELL_TIME_S en cada acera antes
 * de volver a cruzar. No reacciona al tráfico él mismo (sigue cruzando aunque
 * un coche no vaya a parar) — es la IA de vehículos la que le cede el paso,
 * ver isPedestrianInRoadway arriba.
 */
export function stepPedestrian(
  state: PedestrianState,
  crossingHalfWidthM: number,
  dtSeconds: number,
): PedestrianState {
  if (state.waitingS > 0) {
    return { ...state, waitingS: Math.max(0, state.waitingS - dtSeconds) };
  }

  const lateralOffsetM = state.lateralOffsetM + state.direction * PEDESTRIAN_SPEED_MS * dtSeconds;
  const reachedFarSide =
    state.direction > 0 ? lateralOffsetM >= crossingHalfWidthM : lateralOffsetM <= -crossingHalfWidthM;

  if (reachedFarSide) {
    return {
      lateralOffsetM: state.direction > 0 ? crossingHalfWidthM : -crossingHalfWidthM,
      direction: state.direction > 0 ? -1 : 1,
      waitingS: DWELL_TIME_S,
    };
  }

  return { ...state, lateralOffsetM };
}

export interface PedestrianCrossing {
  position: LocalPoint;
  /** Rumbo de la calzada en el paso (mismo convenio que Waypoint.headingDeg): el peatón cruza perpendicular a esto. */
  headingDeg: number;
}

export interface PedestrianPose {
  x: number;
  z: number;
  headingRad: number;
}

/**
 * Posición y rumbo en el mundo de un peatón sobre su paso de cebra. El eje del
 * paso es perpendicular al rumbo de la calzada, rotado -90° del vector de
 * avance (sin, cos) — mismo convenio de "derecha = positivo" que
 * road-bounds.ts.
 */
export function pedestrianPose(crossing: PedestrianCrossing, state: PedestrianState): PedestrianPose {
  const headingRad = (crossing.headingDeg * Math.PI) / 180;
  const axisX = Math.cos(headingRad);
  const axisZ = -Math.sin(headingRad);

  return {
    x: crossing.position.x + axisX * state.lateralOffsetM,
    z: crossing.position.z + axisZ * state.lateralOffsetM,
    headingRad: Math.atan2(axisX * state.direction, axisZ * state.direction),
  };
}
