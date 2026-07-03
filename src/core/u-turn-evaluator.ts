import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';

/**
 * Estado de evaluación de maniobras 'u-turn', en paralelo a ManeuverProgress
 * (mismo índice que route.maneuvers). Solo se actualiza para ese tipo; el
 * resto de entradas quedan intactas para siempre, sin caso especial.
 */
export interface UTurnEvalState {
  /** Rumbo (rad) del vehículo en el primer frame dentro del radio de disparo. null hasta entonces. */
  headingAtEntryRad: number | null;
  /** true si el vehículo estuvo fuera de calzada en algún frame dentro del radio de disparo. */
  wentOffRoadDuringActive: boolean;
  /** true si el vehículo colisionó con un edificio en algún frame dentro del radio de disparo. */
  collidedDuringActive: boolean;
}

export function createUTurnEvalState(maneuverCount: number): UTurnEvalState[] {
  return Array.from({ length: maneuverCount }, () => ({
    headingAtEntryRad: null,
    wentOffRoadDuringActive: false,
    collidedDuringActive: false,
  }));
}

/** Tolerancia sobre los 180° esperados de un cambio de sentido bien ejecutado. */
const HEADING_TOLERANCE_DEG = 45;

/** Normaliza un ángulo en grados al rango (-180, 180]. */
function normalizeAngleDeg(deg: number): number {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

/**
 * Evalúa las maniobras type === 'u-turn' de `progress`. El evento evaluable
 * es el instante en que la maniobra pasa a 'completed' (el vehículo se aleja
 * tras haber estado activa, ver maneuver-tracker.ts). Criterio v1: el rumbo
 * debe haber girado ~180° respecto al rumbo con el que el vehículo entró al
 * radio de disparo (tolerancia HEADING_TOLERANCE_DEG — girar de menos no
 * cuenta como cambio de sentido, y da igual si el giro fue a izquierda o
 * derecha), y el vehículo no debe haber salido de calzada ni colisionado con
 * ningún edificio en ningún momento de la maniobra (igual que en un examen
 * real: subirse a la acera o golpear un obstáculo durante el giro es falta).
 * Cada maniobra se evalúa como mucho una vez.
 */
export function updateUTurnOutcomes(
  progress: ManeuverProgress[],
  evalState: UTurnEvalState[],
  vehicle: { headingRad: number },
  onRoad: boolean,
  colliding: boolean,
): { progress: ManeuverProgress[]; evalState: UTurnEvalState[] } {
  const nextEvalState = [...evalState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'u-turn' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    const state = nextEvalState[index];

    if (entry.status === 'active') {
      nextEvalState[index] = {
        headingAtEntryRad: state.headingAtEntryRad ?? vehicle.headingRad,
        wentOffRoadDuringActive: state.wentOffRoadDuringActive || !onRoad,
        collidedDuringActive: state.collidedDuringActive || colliding,
      };
      return entry;
    }

    if (entry.status !== 'completed' || state.headingAtEntryRad === null) {
      return entry;
    }

    const turnedDeg = ((vehicle.headingRad - state.headingAtEntryRad) * 180) / Math.PI;
    const deviationFrom180Deg = Math.abs(normalizeAngleDeg(turnedDeg - 180));
    const turnedAround = deviationFrom180Deg <= HEADING_TOLERANCE_DEG;

    const outcome: ManeuverOutcome =
      turnedAround && !state.wentOffRoadDuringActive && !state.collidedDuringActive ? 'pass' : 'fail';
    return { ...entry, outcome };
  });

  return { progress: nextProgress, evalState: nextEvalState };
}
