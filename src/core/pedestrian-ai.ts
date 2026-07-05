import type { LocalPoint } from './geo';

/** Velocidad media de paso de una persona caminando, valor de referencia real, no fabricado. */
const PEDESTRIAN_SPEED_MS = 1.2;

/**
 * Espera en cada acera antes de cruzar de vuelta. Placeholder determinista
 * (no aleatorio), misma clase de simplificación que el ciclo de semáforos en
 * traffic-light.ts: no hay datos reales de qué tan seguido cruza la gente en
 * cada paso de peatones, así que un valor fijo es lo honesto hasta que haga
 * falta variarlo. Subido de 4s a 25s (2026-07-05): con las calzadas reales de
 * ruta-01 (15-18m de ancho, 16-18s de cruce a PEDESTRIAN_SPEED_MS) una espera
 * de 4s dejaba a cada peatón sobre la calzada ~2/3 del tiempo — el tráfico de
 * IA pasaba más tiempo parado cediendo el paso que circulando, y la ventana
 * para aprobar el give-way era mínima. Con 25s la calzada queda ocupada ~40%
 * del tiempo, sigue habiendo cruces frecuentes y las ventanas son razonables.
 */
const DWELL_TIME_S = 25;

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

// Espaciado placeholder entre el desfase de peatones consecutivos (por índice
// de aparición en la ruta) — mismo patrón que PHASE_OFFSET_SPACING_S en
// traffic-light.ts, solo para que no arranquen todos sincronizados.
const PHASE_OFFSET_SPACING_S = 5;

/** Desfase determinista (no aleatorio) de un peatón según su índice de aparición, mismo patrón que trafficLightPhaseOffsetS. */
export function pedestrianPhaseOffsetS(pedestrianIndex: number): number {
  return pedestrianIndex * PHASE_OFFSET_SPACING_S;
}

// Paso de la simulación usada para adelantar el estado inicial (ver
// advancePedestrian): tiene que ser lo bastante pequeño para no saltarse una
// transición espera<->cruce dentro del intervalo de desfase.
const FAST_FORWARD_STEP_S = 0.5;

/**
 * Adelanta el estado de un peatón `offsetS` segundos antes de empezar a
 * renderizarlo, en incrementos de FAST_FORWARD_STEP_S (no un único paso
 * grande) para que las transiciones espera<->cruce que caigan dentro de ese
 * intervalo se resuelvan igual que en la simulación real fotograma a
 * fotograma. Usado una sola vez al construir la escena, con
 * pedestrianPhaseOffsetS, para desincronizar a los peatones entre sí.
 */
export function advancePedestrian(
  state: PedestrianState,
  crossingHalfWidthM: number,
  offsetS: number,
): PedestrianState {
  let next = state;
  let remaining = offsetS;
  while (remaining > 0) {
    const step = Math.min(FAST_FORWARD_STEP_S, remaining);
    next = stepPedestrian(next, crossingHalfWidthM, step);
    remaining -= step;
  }
  return next;
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
