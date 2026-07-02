import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial } from '@babylonjs/core';
import { toLocalMeters } from '../core/geo';
import type { GeoPoint, RouteDefinition } from '../core/route-types';
import type { TrafficLightPhase } from '../core/traffic-light';

export const TRAFFIC_LIGHT_PHASE_COLORS: Record<TrafficLightPhase, Color3> = {
  red: new Color3(0.9, 0.1, 0.1),
  amber: new Color3(0.95, 0.65, 0.05),
  green: new Color3(0.15, 0.85, 0.25),
};

export interface TrafficLightMarker {
  /** Índice en route.maneuvers (no en este array, que solo contiene las de tipo traffic-light). */
  maneuverIndex: number;
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * Esfera pequeña sobre el poste de cada maniobra type === 'traffic-light',
 * recoloreada cada frame según la fase real del semáforo (getTrafficLightPhase).
 * Independiente del poste de maneuver-markers.ts, que sigue reflejando el
 * ManeuverStatus (pending/active/completed), no la fase del semáforo.
 */
export function buildTrafficLightMarkers(route: RouteDefinition, origin: GeoPoint, scene: Scene): TrafficLightMarker[] {
  return route.maneuvers
    .map((maneuver, maneuverIndex) => ({ maneuver, maneuverIndex }))
    .filter(({ maneuver }) => maneuver.type === 'traffic-light')
    .map(({ maneuver, maneuverIndex }) => {
      const waypoint = route.waypoints[maneuver.atWaypointIndex];
      const local = toLocalMeters(origin, waypoint.position);

      const mesh = MeshBuilder.CreateSphere(`traffic-light-marker-${maneuverIndex}`, { diameter: 0.4 }, scene);
      mesh.position.set(local.x, 3.3, local.z); // justo encima del poste de 3m de maneuver-markers.ts

      const material = new StandardMaterial(`traffic-light-marker-${maneuverIndex}-material`, scene);
      material.diffuseColor = TRAFFIC_LIGHT_PHASE_COLORS.red;
      mesh.material = material;

      return { maneuverIndex, mesh, material };
    });
}
