import type { LocalPoint } from './geo';
import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';
import type { Waypoint } from './route-types';
import { projectOntoHeadingAxis } from './traffic-light-evaluator';

/**
 * Estado de evaluación de maniobras 'parallel-park', en paralelo a
 * ManeuverProgress (mismo índice que route.maneuvers). Solo se actualiza
 * para ese tipo; el resto de entradas quedan intactas para siempre, sin
 * caso especial.
 */
export interface ParallelParkEvalState {
  /** true si el vehículo colisionó con un edificio en algún frame dentro del radio de disparo. */
  collidedDuringActive: boolean;
}

export function createParallelParkEvalState(maneuverCount: number): ParallelParkEvalState[] {
  return Array.from({ length: maneuverCount }, () => ({ collidedDuringActive: false }));
}

const STOPPED_SPEED_THRESHOLD_MS = 0.1;

// Longitud aproximada de una plaza de aparcamiento típica, usada como margen
// para considerar el vehículo "en el hueco" a lo largo de la calle. Ninguna
// ruta tiene todavía una plaza real georreferenciada — placeholder ajustable
// cuando exista una, mismo criterio que las duraciones de traffic-light.ts.
const BAY_LONGITUDINAL_TOLERANCE_M = 4;

// Tolerancia sobre el rumbo de la calle para considerar el vehículo aparcado
// en paralelo (no en ángulo). Simplificación v1: solo se acepta el mismo
// sentido que `waypoint.headingDeg` (el de circulación), no el opuesto —
// aparcar de cara al tráfico en una calle de doble sentido también sería
// correcto en la vida real, pero el modelo de ruta actual no distingue calles
// de doble sentido, así que no se fabrica ese caso todavía.
const HEADING_TOLERANCE_DEG = 20;

function headingDeviationDeg(vehicleHeadingRad: number, targetHeadingDeg: number): number {
  const vehicleHeadingDeg = (vehicleHeadingRad * 180) / Math.PI;
  const diff = (((vehicleHeadingDeg - targetHeadingDeg + 180) % 360) + 360) % 360 - 180;
  return Math.abs(diff);
}

/**
 * Evalúa las maniobras type === 'parallel-park' de `progress`. Criterio v1:
 * mientras la maniobra está activa (dentro del radio de disparo), en cuanto
 * el vehículo se detiene (velocidad ~0) dentro de calzada, alineado con el
 * rumbo de la calle (± HEADING_TOLERANCE_DEG) y a no más de
 * BAY_LONGITUDINAL_TOLERANCE_M del punto de la maniobra a lo largo de esta,
 * sin haber colisionado con ningún edificio en ningún momento de la maniobra,
 * se marca 'pass' de inmediato. Si el vehículo se aleja del punto (maniobra
 * 'completed') sin haber cumplido nunca esas condiciones, se marca 'fail'.
 * Cada maniobra se evalúa como mucho una vez.
 */
export function updateParallelParkOutcomes(
  progress: ManeuverProgress[],
  evalState: ParallelParkEvalState[],
  waypoints: Waypoint[],
  waypointPositions: LocalPoint[],
  vehicle: { x: number; z: number; headingRad: number; speedMs: number },
  onRoad: boolean,
  colliding: boolean,
): { progress: ManeuverProgress[]; evalState: ParallelParkEvalState[] } {
  const nextEvalState = [...evalState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'parallel-park' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    if (entry.status === 'pending') {
      return entry;
    }

    const collidedDuringActive = nextEvalState[index].collidedDuringActive || colliding;
    nextEvalState[index] = { collidedDuringActive };

    if (entry.status === 'completed') {
      return { ...entry, outcome: 'fail' as ManeuverOutcome };
    }

    const waypoint = waypoints[entry.maneuver.atWaypointIndex];
    const waypointLocal = waypointPositions[entry.maneuver.atWaypointIndex];
    if (!waypoint || !waypointLocal) {
      return entry;
    }

    const stopped = Math.abs(vehicle.speedMs) <= STOPPED_SPEED_THRESHOLD_MS;
    const longitudinalOffsetM = Math.abs(
      projectOntoHeadingAxis({ x: vehicle.x, z: vehicle.z }, waypointLocal, waypoint.headingDeg),
    );
    const aligned = headingDeviationDeg(vehicle.headingRad, waypoint.headingDeg) <= HEADING_TOLERANCE_DEG;

    const parkedCorrectly =
      stopped && onRoad && longitudinalOffsetM <= BAY_LONGITUDINAL_TOLERANCE_M && aligned && !collidedDuringActive;

    return parkedCorrectly ? { ...entry, outcome: 'pass' as ManeuverOutcome } : entry;
  });

  return { progress: nextProgress, evalState: nextEvalState };
}
