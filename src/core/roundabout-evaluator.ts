import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';

/**
 * Estado de evaluación de maniobras 'roundabout', en paralelo a
 * ManeuverProgress (mismo índice que route.maneuvers). Solo se actualiza
 * para ese tipo; el resto de entradas quedan intactas para siempre, sin
 * caso especial.
 */
export interface RoundaboutEvalState {
  /** Rumbo (rad) del vehículo en el primer frame dentro del radio de disparo. null hasta entonces. */
  headingAtEntryRad: number | null;
  /** true si el vehículo estuvo parado (~0 km/h) en algún frame dentro del radio de disparo. */
  stoppedDuringActive: boolean;
  /** true si el vehículo estuvo fuera de calzada en algún frame dentro del radio de disparo. */
  wentOffRoadDuringActive: boolean;
  /** true si el vehículo colisionó con algo en algún frame dentro del radio de disparo. */
  collidedDuringActive: boolean;
}

export function createRoundaboutEvalState(maneuverCount: number): RoundaboutEvalState[] {
  return Array.from({ length: maneuverCount }, () => ({
    headingAtEntryRad: null,
    stoppedDuringActive: false,
    wentOffRoadDuringActive: false,
    collidedDuringActive: false,
  }));
}

/**
 * Rotación mínima (grados) hacia la izquierda para considerar que el vehículo
 * rodeó la rotonda, no que la cruzó recto. Bajado de 60 a 30 (2026-07-04) con
 * datos reales de rotondas de Barcelona: en Plaça de Sant Jordi y Plaça
 * d'Espanya, la combinación de entrada/salida real más natural (la que
 * conecta con una zona de aparcamiento real, ver ruta-02/route.ts) gira solo
 * ~32-35° de rumbo neto entre el radio de disparo de entrada y el de salida
 * — calculado punto a punto sobre la curva real, no como el ángulo de
 * posición alrededor del centro de la rotonda (esa métrica alternativa da
 * valores mucho más altos y engañosos, ver el commit que introdujo este
 * cambio). 60° era un valor elegido sin contrastar contra geometría real;
 * 30° dado el criterio real; 30° deja margen sobre esos ~32-35° reales.
 */
const MIN_ROTATION_DEG = 30;
const STOPPED_SPEED_THRESHOLD_MS = 0.1;

/** Normaliza un ángulo en grados al rango (-180, 180]. */
function normalizeAngleDeg(deg: number): number {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

/**
 * Evalúa las maniobras type === 'roundabout' de `progress`. El evento
 * evaluable es el instante en que la maniobra pasa a 'completed' (mismo
 * patrón que u-turn-evaluator.ts). Criterio v1 (deliberadamente
 * simplificado, igual que el resto de evaluadores de este proyecto): el
 * rumbo debe haber girado a la izquierda (sentido antihorario visto desde
 * arriba, el de circulación en una rotonda con tráfico por la derecha) al
 * menos MIN_ROTATION_DEG respecto al rumbo con el que el vehículo entró al
 * radio de disparo — girar a la derecha, o girar de menos, no cuenta como
 * haber rodeado la rotonda. Además, el vehículo no debe haberse detenido del
 * todo, salido de calzada, ni colisionado en ningún momento de la maniobra.
 *
 * Limitación deliberada (ver CLAUDE.md): esto NO evalúa si el vehículo cedió
 * el paso al tráfico que ya circula por la rotonda — no hay IA de tráfico
 * circulando en rotondas todavía (traffic-ai.ts sigue un trazado lineal por
 * distancia acumulada, no un óvalo), así que ese criterio de examen real no
 * es evaluable hoy. El criterio "no se detiene sin necesidad" es el sustituto
 * v1: sin tráfico real al que ceder, cualquier parada dentro del radio de
 * disparo se trata como una duda/parada injustificada. Cada maniobra se
 * evalúa como mucho una vez.
 */
export function updateRoundaboutOutcomes(
  progress: ManeuverProgress[],
  evalState: RoundaboutEvalState[],
  vehicle: { headingRad: number; speedMs: number },
  onRoad: boolean,
  colliding: boolean,
): { progress: ManeuverProgress[]; evalState: RoundaboutEvalState[] } {
  const nextEvalState = [...evalState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'roundabout' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    const state = nextEvalState[index];

    if (entry.status === 'active') {
      nextEvalState[index] = {
        headingAtEntryRad: state.headingAtEntryRad ?? vehicle.headingRad,
        stoppedDuringActive: state.stoppedDuringActive || Math.abs(vehicle.speedMs) <= STOPPED_SPEED_THRESHOLD_MS,
        wentOffRoadDuringActive: state.wentOffRoadDuringActive || !onRoad,
        collidedDuringActive: state.collidedDuringActive || colliding,
      };
      return entry;
    }

    if (entry.status !== 'completed' || state.headingAtEntryRad === null) {
      return entry;
    }

    const turnedDeg = normalizeAngleDeg(((vehicle.headingRad - state.headingAtEntryRad) * 180) / Math.PI);
    const turnedLeftEnough = turnedDeg <= -MIN_ROTATION_DEG;

    const outcome: ManeuverOutcome =
      turnedLeftEnough && !state.stoppedDuringActive && !state.wentOffRoadDuringActive && !state.collidedDuringActive
        ? 'pass'
        : 'fail';
    return { ...entry, outcome };
  });

  return { progress: nextProgress, evalState: nextEvalState };
}
