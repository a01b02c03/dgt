import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial } from '@babylonjs/core';
import { toLocalMeters } from '../core/geo';
import type { GeoPoint, RouteDefinition } from '../core/route-types';

export const MANEUVER_PENDING_COLOR = new Color3(0.6, 0.6, 0.1);
export const MANEUVER_ACTIVE_COLOR = new Color3(0.1, 0.7, 0.9);
export const MANEUVER_COMPLETED_COLOR = new Color3(0.15, 0.75, 0.25);

export interface ManeuverMarker {
  maneuverIndex: number;
  mesh: Mesh;
  material: StandardMaterial;
}

/** Postes de depuración en cada punto de maniobra; el color refleja su ManeuverStatus. */
export function buildManeuverMarkers(route: RouteDefinition, origin: GeoPoint, scene: Scene): ManeuverMarker[] {
  return route.maneuvers.map((maneuver, index) => {
    const waypoint = route.waypoints[maneuver.atWaypointIndex];
    const local = toLocalMeters(origin, waypoint.position);

    const mesh = MeshBuilder.CreateCylinder(
      `maneuver-marker-${index}`,
      { diameterTop: 0.15, diameterBottom: 0.15, height: 3 },
      scene,
    );
    mesh.position.set(local.x, 1.5, local.z);

    const material = new StandardMaterial(`maneuver-marker-${index}-material`, scene);
    material.diffuseColor = MANEUVER_PENDING_COLOR;
    mesh.material = material;

    return { maneuverIndex: index, mesh, material };
  });
}
