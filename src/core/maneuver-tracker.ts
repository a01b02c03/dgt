import type { LocalPoint } from './geo';
import type { Maneuver } from './route-types';

export type ManeuverStatus = 'pending' | 'active' | 'completed';

export interface ManeuverProgress {
  maneuver: Maneuver;
  status: ManeuverStatus;
  /** Distancia mínima alcanzada al punto de la maniobra, en metros. */
  closestDistanceM: number;
  /** Velocidad del vehículo (m/s) en el instante de menor distancia. */
  speedAtClosestMs: number;
}

export interface VehicleSample {
  x: number;
  z: number;
  speedMs: number;
}

const TRIGGER_RADIUS_M = 20;

export function createManeuverProgress(maneuvers: Maneuver[]): ManeuverProgress[] {
  return maneuvers.map((maneuver) => ({
    maneuver,
    status: 'pending',
    closestDistanceM: Infinity,
    speedAtClosestMs: 0,
  }));
}

/**
 * Actualiza el progreso de cada maniobra según la posición actual del vehículo:
 * pending -> active al entrar en el radio de disparo del waypoint de la maniobra;
 * active -> completed al volver a alejarse tras haber estado activa. Solo
 * registra métricas (distancia y velocidad mínimas alcanzadas); no evalúa si la
 * maniobra se ejecutó correctamente — eso depende de criterios de examen
 * específicos por tipo de maniobra, todavía por definir.
 */
export function updateManeuverProgress(
  progress: ManeuverProgress[],
  waypointPositions: LocalPoint[],
  vehicle: VehicleSample,
): ManeuverProgress[] {
  return progress.map((entry) => {
    if (entry.status === 'completed') {
      return entry;
    }

    const target = waypointPositions[entry.maneuver.atWaypointIndex];
    if (!target) {
      return entry;
    }

    const distance = Math.hypot(vehicle.x - target.x, vehicle.z - target.z);

    if (distance <= TRIGGER_RADIUS_M) {
      const isNewClosest = distance < entry.closestDistanceM;
      return {
        ...entry,
        status: 'active',
        closestDistanceM: isNewClosest ? distance : entry.closestDistanceM,
        speedAtClosestMs: isNewClosest ? vehicle.speedMs : entry.speedAtClosestMs,
      };
    }

    if (entry.status === 'active') {
      return { ...entry, status: 'completed' };
    }

    return entry;
  });
}
