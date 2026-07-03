import type { LocalPoint } from './geo';
import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';
import type { Waypoint } from './route-types';
import { projectOntoHeadingAxis } from './traffic-light-evaluator';

/**
 * Estado de cruce del punto de cesión, en paralelo a ManeuverProgress (mismo
 * índice que route.maneuvers). Solo se actualiza para maniobras
 * type === 'give-way'; el resto de entradas quedan intactas para siempre, sin
 * caso especial. Misma mecánica de detección de cruce que
 * StopLineCrossingState en traffic-light-evaluator.ts.
 */
export interface GiveWayCrossingState {
  lastAxisProjectionM: number | null;
}

export function createGiveWayEvalState(maneuverCount: number): GiveWayCrossingState[] {
  return Array.from({ length: maneuverCount }, () => ({ lastAxisProjectionM: null }));
}

/**
 * Evalúa las maniobras type === 'give-way' de `progress`. El evento evaluable
 * es el instante en que la proyección firmada del vehículo sobre el eje de
 * avance del waypoint pasa de <= 0 a > 0 (mismo cruce de línea que
 * traffic-light-evaluator.ts, reutilizando projectOntoHeadingAxis). Criterio
 * v1: si en ese instante el peatón emparejado con esta maniobra está sobre la
 * calzada (`obstructedByPedestrian[index]`, calculado por el caller — ver
 * main.ts, que empareja cada maniobra 'give-way' con el peatón más cercano a
 * su waypoint una sola vez al construir la escena), el jugador ha cruzado sin
 * cederle el paso => 'fail'; sin peatón en calzada en ese instante => 'pass'.
 * No distingue si el vehículo redujo la velocidad y aun así cruzó con el
 * peatón todavía en calzada de si nunca frenó — ambos violan la cesión de
 * paso real, igual que en un examen real. Cada maniobra se evalúa como mucho
 * una vez.
 */
export function updateGiveWayOutcomes(
  progress: ManeuverProgress[],
  evalState: GiveWayCrossingState[],
  waypoints: Waypoint[],
  waypointPositions: LocalPoint[],
  vehiclePosition: LocalPoint,
  obstructedByPedestrian: boolean[],
): { progress: ManeuverProgress[]; evalState: GiveWayCrossingState[] } {
  const nextEvalState = [...evalState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'give-way' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    const waypoint = waypoints[entry.maneuver.atWaypointIndex];
    const waypointLocal = waypointPositions[entry.maneuver.atWaypointIndex];
    if (!waypoint || !waypointLocal) {
      return entry;
    }

    const projection = projectOntoHeadingAxis(vehiclePosition, waypointLocal, waypoint.headingDeg);
    const previousProjection = nextEvalState[index].lastAxisProjectionM;
    nextEvalState[index] = { lastAxisProjectionM: projection };

    const crossed = previousProjection !== null && previousProjection <= 0 && projection > 0;
    if (!crossed) {
      return entry;
    }

    const outcome: ManeuverOutcome = obstructedByPedestrian[index] ? 'fail' : 'pass';
    return { ...entry, outcome };
  });

  return { progress: nextProgress, evalState: nextEvalState };
}
