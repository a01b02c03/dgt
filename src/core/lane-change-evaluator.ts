import type { ManeuverOutcome, ManeuverProgress } from './maneuver-tracker';

/**
 * Estado de evaluación de maniobras 'lane-change', en paralelo a
 * ManeuverProgress (mismo índice que route.maneuvers). Solo se actualiza
 * para ese tipo; el resto de entradas quedan intactas para siempre, sin
 * caso especial.
 */
export interface LaneChangeEvalState {
  /** Carril del vehículo (0 = más cercano al eje) en el primer frame dentro del radio de disparo. null hasta entonces. */
  laneIndexAtEntry: number | null;
  /** true si el vehículo estuvo fuera de calzada en algún frame dentro del radio de disparo. */
  wentOffRoadDuringActive: boolean;
  /** true si el vehículo colisionó con algo en algún frame dentro del radio de disparo. */
  collidedDuringActive: boolean;
}

export function createLaneChangeEvalState(maneuverCount: number): LaneChangeEvalState[] {
  return Array.from({ length: maneuverCount }, () => ({
    laneIndexAtEntry: null,
    wentOffRoadDuringActive: false,
    collidedDuringActive: false,
  }));
}

/**
 * Evalúa las maniobras type === 'lane-change' de `progress`. El evento
 * evaluable es el instante en que la maniobra pasa a 'completed' (el
 * vehículo se aleja tras haber estado activa, mismo patrón que
 * u-turn-evaluator.ts/roundabout-evaluator.ts). Criterio v1 (deliberadamente
 * simplificado, igual que el resto de evaluadores de este proyecto): el
 * carril de salida debe ser distinto y adyacente (±1 carril) al carril de
 * entrada — cambiar de carril de verdad, no quedarse en el mismo ni saltar
 * más de uno de golpe — y el vehículo no debe haber salido de calzada ni
 * colisionado con nada en ningún momento de la maniobra. No evalúa uso de
 * intermitente ni comprobación de retrovisor: ninguno de los dos está
 * modelado (ver vehicle-controller.ts/hud.ts), así que no son observables
 * hoy. `vehicle.laneIndex`/`vehicle.laneCount` son los mismos que ya deriva
 * main.ts del desplazamiento lateral del jugador para la IA de tráfico (ver
 * laneIndexFromLateralOffsetM en core/lanes.ts) — el jugador no tiene un
 * carril fijo, se mueve libre en 2D. Cada maniobra se evalúa como mucho una
 * vez.
 */
export function updateLaneChangeOutcomes(
  progress: ManeuverProgress[],
  evalState: LaneChangeEvalState[],
  vehicle: { laneIndex: number },
  onRoad: boolean,
  colliding: boolean,
): { progress: ManeuverProgress[]; evalState: LaneChangeEvalState[] } {
  const nextEvalState = [...evalState];

  const nextProgress = progress.map((entry, index) => {
    if (entry.maneuver.type !== 'lane-change' || entry.outcome !== 'not-evaluated') {
      return entry;
    }

    const state = nextEvalState[index];

    if (entry.status === 'active') {
      nextEvalState[index] = {
        laneIndexAtEntry: state.laneIndexAtEntry ?? vehicle.laneIndex,
        wentOffRoadDuringActive: state.wentOffRoadDuringActive || !onRoad,
        collidedDuringActive: state.collidedDuringActive || colliding,
      };
      return entry;
    }

    if (entry.status !== 'completed' || state.laneIndexAtEntry === null) {
      return entry;
    }

    const changedOneLane = Math.abs(vehicle.laneIndex - state.laneIndexAtEntry) === 1;

    const outcome: ManeuverOutcome =
      changedOneLane && !state.wentOffRoadDuringActive && !state.collidedDuringActive ? 'pass' : 'fail';
    return { ...entry, outcome };
  });

  return { progress: nextProgress, evalState: nextEvalState };
}
