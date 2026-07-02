import type { ManeuverProgress } from './maneuver-tracker';
import type { Waypoint } from './route-types';

const MS_TO_KMH = 3.6;

/** Redondeado al entero más cercano; abs() porque la marcha atrás también se muestra como velocidad positiva. */
export function speedMsToKmh(speedMs: number): number {
  return Math.round(Math.abs(speedMs) * MS_TO_KMH);
}

/**
 * Límite de velocidad vigente en el segmento `segmentIndex` (ver queryRoadBounds en
 * road-bounds.ts), según la convención "vigente desde este waypoint en adelante" de
 * route-types.ts / ruta-01/route.ts.
 */
export function currentSpeedLimitKmh(waypoints: Waypoint[], segmentIndex: number): number {
  return (waypoints[segmentIndex] ?? waypoints[0]).speedLimitKmh;
}

export type ManeuverBadgeTone = 'pending' | 'active' | 'completed' | 'pass' | 'fail';

export interface ManeuverChecklistLabel {
  description: string;
  badgeText: string;
  tone: ManeuverBadgeTone;
}

const BADGE_TEXT: Record<ManeuverBadgeTone, string> = {
  pending: 'Pendiente',
  active: 'En curso',
  completed: 'Completada',
  pass: 'Apto',
  fail: 'No apto',
};

/**
 * Etiqueta de checklist para una maniobra: `outcome` manda en cuanto deja de ser
 * 'not-evaluated' (tipos con criterios de examen definidos, hoy solo 'traffic-light');
 * hasta entonces se muestra el `status` de proximidad.
 */
export function maneuverChecklistLabel(
  entry: Pick<ManeuverProgress, 'maneuver' | 'status' | 'outcome'>,
): ManeuverChecklistLabel {
  const tone: ManeuverBadgeTone = entry.outcome === 'not-evaluated' ? entry.status : entry.outcome;
  return { description: entry.maneuver.description, badgeText: BADGE_TEXT[tone], tone };
}
