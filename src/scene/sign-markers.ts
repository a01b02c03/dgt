import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial } from '@babylonjs/core';
import { toLocalMeters } from '../core/geo';
import type { GeoPoint, RouteDefinition, SignType } from '../core/route-types';

const SIGN_COLORS: Record<SignType, Color3> = {
  stop: new Color3(0.8, 0.05, 0.05),
  yield: new Color3(0.85, 0.75, 0.1),
  'speed-limit': new Color3(0.9, 0.9, 0.95),
  'no-entry': new Color3(0.75, 0.1, 0.1),
  'pedestrian-crossing': new Color3(0.1, 0.4, 0.85),
  roundabout: new Color3(0.1, 0.6, 0.85),
};

/** Poste + placa simple por señal de la ruta (placeholder hasta tener modelos reales por tipo). */
export function buildSignMarkers(route: RouteDefinition, origin: GeoPoint, scene: Scene): Mesh[] {
  return route.signs.map((sign, index) => {
    const local = toLocalMeters(origin, sign.position);

    const post = MeshBuilder.CreateCylinder(`sign-post-${index}`, { diameter: 0.08, height: 2.2 }, scene);
    post.position.set(local.x, 1.1, local.z);

    const face = MeshBuilder.CreateBox(`sign-face-${index}`, { width: 0.6, height: 0.6, depth: 0.05 }, scene);
    face.parent = post;
    face.position.y = 0.9;
    face.rotation.y = (sign.headingDeg * Math.PI) / 180;

    const material = new StandardMaterial(`sign-${index}-material`, scene);
    material.diffuseColor = SIGN_COLORS[sign.type];
    face.material = material;

    return post;
  });
}
