export type TrafficLightPhase = 'red' | 'amber' | 'green';

export interface TrafficLightCycleConfig {
  greenDurationS: number;
  amberDurationS: number;
  redDurationS: number;
}

// Duraciones placeholder, no calibradas contra ningún plan de fases real del
// Ajuntament — ajustables libremente cuando haya datos reales.
export const DEFAULT_TRAFFIC_LIGHT_CYCLE: TrafficLightCycleConfig = {
  greenDurationS: 6,
  amberDurationS: 3,
  redDurationS: 8,
};

// Espaciado placeholder entre el desfase de semáforos consecutivos (por
// atWaypointIndex), solo para que no se pongan todos en rojo a la vez.
const PHASE_OFFSET_SPACING_S = 5;

function totalCycleDurationS(cycle: TrafficLightCycleConfig): number {
  return cycle.greenDurationS + cycle.amberDurationS + cycle.redDurationS;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Desfase determinista (no aleatorio) de un semáforo según su waypoint, para desincronizarlo de los demás. */
export function trafficLightPhaseOffsetS(
  atWaypointIndex: number,
  cycle: TrafficLightCycleConfig = DEFAULT_TRAFFIC_LIGHT_CYCLE,
): number {
  return positiveModulo(atWaypointIndex * PHASE_OFFSET_SPACING_S, totalCycleDurationS(cycle));
}

/**
 * Fase actual de un semáforo dado el tiempo de simulación transcurrido.
 * Orden verde → ámbar → rojo → verde (convención española, sin el rojo+ámbar
 * combinado del Reino Unido).
 */
export function getTrafficLightPhase(
  elapsedSimS: number,
  atWaypointIndex: number,
  cycle: TrafficLightCycleConfig = DEFAULT_TRAFFIC_LIGHT_CYCLE,
): TrafficLightPhase {
  const offset = trafficLightPhaseOffsetS(atWaypointIndex, cycle);
  const t = positiveModulo(elapsedSimS + offset, totalCycleDurationS(cycle));

  if (t < cycle.greenDurationS) {
    return 'green';
  }
  if (t < cycle.greenDurationS + cycle.amberDurationS) {
    return 'amber';
  }
  return 'red';
}
