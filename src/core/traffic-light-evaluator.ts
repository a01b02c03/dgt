import type { LocalPoint } from './geo';
import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';
import type { Waypoint } from './route-types';
import { getTrafficLightPhase } from './traffic-light';

/**
 * Estado de cruce de línea de stop, en paralelo a ManeuverProgress (mismo
 * índice que route.maneuvers). Solo se actualiza para maniobras
 * type === 'traffic-light'; el resto de entradas quedan intactas para siempre,
 * sin caso especial.
 */
export interface StopLineCrossingState {
  /**
   * Proyección firmada (m) de la posición del vehículo sobre el eje de avance
   * del waypoint, en el frame anterior. null antes del primer frame evaluado.
   */
  lastAxisProjectionM: number | null;
}

export function createStopLineCrossingState(maneuverCount: number): StopLineCrossingState[] {
  return Array.from({ length: maneuverCount }, () => ({ lastAxisProjectionM: null }));
}

/**
 * Distancia firmada de `point` a lo largo del eje de avance (headingDeg) que
 * pasa por `waypointLocal`: negativa (o cero) = antes de la línea de stop,
 * positiva = después. Mismo vector de avance que usa stepVehicle en
 * vehicle-controller.ts (sin(heading), cos(heading)).
 */
export function projectOntoHeadingAxis(point: LocalPoint, waypointLocal: LocalPoint, headingDeg: number): number {
  const headingRad = (headingDeg * Math.PI) / 180;
  const forwardX = Math.sin(headingRad);
  const forwardZ = Math.cos(headingRad);
  return (point.x - waypointLocal.x) * forwardX + (point.z - waypointLocal.z) * forwardZ;
}

/**
 * Evalúa las maniobras type === 'traffic-light' de `progress`: el evento
 * evaluable es el instante en que la proyección firmada del vehículo sobre el
 * eje de avance del waypoint pasa de <= 0 (antes de la línea) a > 0 (después),
 * es decir el cruce de la línea de stop. Criterio v1 (deliberadamente
 * simplificado — ver el comentario sobre duraciones en traffic-light.ts):
 * cruzar en rojo => 'fail'; cruzar en verde o ámbar => 'pass'. Cada maniobra
 * se evalúa como mucho una vez (una vez outcome != 'not-evaluated' ya no se
 * vuelve a tocar), así que no importa si el vehículo merodea cerca de la
 * línea después de cruzar. Maniobras de otros tipos se devuelven sin tocar.
 */
export function updateTrafficLightOutcomes(
  progress: ManeuverProgress[],
  crossingState: StopLineCrossingState[],
  waypoints: Waypoint[],
  waypointPositions: LocalPoint[],
  vehiclePosition: LocalPoint,
  elapsedSimS: number,
): { progress: ManeuverProgress[]; crossingState: StopLineCrossingState[] } {
  const nextCrossingState = [...crossingState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'traffic-light' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    const waypoint = waypoints[entry.maneuver.atWaypointIndex];
    const waypointLocal = waypointPositions[entry.maneuver.atWaypointIndex];
    if (!waypoint || !waypointLocal) {
      return entry;
    }

    const projection = projectOntoHeadingAxis(vehiclePosition, waypointLocal, waypoint.headingDeg);
    const previousProjection = nextCrossingState[index].lastAxisProjectionM;
    nextCrossingState[index] = { lastAxisProjectionM: projection };

    const crossed = previousProjection !== null && previousProjection <= 0 && projection > 0;
    if (!crossed) {
      return entry;
    }

    const phase = getTrafficLightPhase(elapsedSimS, entry.maneuver.atWaypointIndex);
    const outcome: ManeuverOutcome = phase === 'red' ? 'fail' : 'pass';
    return { ...entry, outcome };
  });

  return { progress: nextProgress, crossingState: nextCrossingState };
}
