import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { toLocalMeters } from '../core/geo';
import { ROAD_WIDTH_M } from '../core/road-bounds';
import type { GeoPoint, RouteDefinition } from '../core/route-types';

/**
 * Construye la calzada como una cinta (ribbon) siguiendo los waypoints de la ruta:
 * en cada punto se calcula la normal del trazado (perpendicular a la dirección
 * prev->next) para desplazar el borde izquierdo/derecho medio ancho de calzada.
 */
export function buildRoadMesh(route: RouteDefinition, origin: GeoPoint, scene: Scene): Mesh {
  const points = route.waypoints.map((waypoint) => toLocalMeters(origin, waypoint.position));

  const left: Vector3[] = [];
  const right: Vector3[] = [];
  const halfWidth = ROAD_WIDTH_M / 2;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, points.length - 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    const normalX = -dz / length;
    const normalZ = dx / length;

    const point = points[i];
    left.push(new Vector3(point.x - normalX * halfWidth, 0, point.z - normalZ * halfWidth));
    right.push(new Vector3(point.x + normalX * halfWidth, 0, point.z + normalZ * halfWidth));
  }

  const road = MeshBuilder.CreateRibbon(
    `road-${route.id}`,
    { pathArray: [left, right], sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );

  const material = new StandardMaterial(`road-${route.id}-material`, scene);
  material.diffuseColor = new Color3(0.25, 0.25, 0.25);
  material.specularColor = Color3.Black();
  road.material = material;

  return road;
}
