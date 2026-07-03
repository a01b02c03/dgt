import type { LocalPoint } from './geo';
import type { ManeuverProgress } from './maneuver-tracker';

export type ExamOutcome = 'pass' | 'fail';

/** Radio de llegada al último waypoint de la ruta para darla por completada. */
export const FINISH_RADIUS_M = 10;

export function hasReachedFinish(vehiclePosition: LocalPoint, lastWaypointPosition: LocalPoint): boolean {
  return Math.hypot(vehiclePosition.x - lastWaypointPosition.x, vehiclePosition.z - lastWaypointPosition.z) <= FINISH_RADIUS_M;
}

/**
 * Veredicto agregado del examen. `null` mientras sigue en curso. `'fail'` en
 * cuanto cualquier maniobra evaluada falla — igual que una falta eliminatoria
 * en un examen real: el examen termina ahí, no hace falta llegar al final de
 * la ruta. `'pass'` solo si se llega al final de la ruta (`reachedFinish`)
 * sin ninguna maniobra en 'fail'. Maniobras que siguen en 'not-evaluated'
 * (tipos sin criterios definidos todavía, o nunca disparadas) no cuentan ni a
 * favor ni en contra.
 */
export function examOutcome(maneuverProgress: ManeuverProgress[], reachedFinish: boolean): ExamOutcome | null {
  const anyFail = maneuverProgress.some((entry) => entry.outcome === 'fail');
  if (anyFail) {
    return 'fail';
  }
  if (reachedFinish) {
    return 'pass';
  }
  return null;
}
