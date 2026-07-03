import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial } from '@babylonjs/core';

const BODY_HEIGHT_M = 1.5;
const BODY_DIAMETER_M = 0.44;
const HEAD_DIAMETER_M = 0.28;

export const PEDESTRIAN_COLOR = new Color3(0.9, 0.55, 0.1);

export interface PedestrianMesh {
  mesh: Mesh;
}

/** Placeholder de peatón (cilindro + cabeza) hasta que se cargue un modelo glTF real. */
export function buildPedestrianMesh(scene: Scene): PedestrianMesh {
  const body = MeshBuilder.CreateCylinder(
    'pedestrian-body',
    { height: BODY_HEIGHT_M, diameter: BODY_DIAMETER_M },
    scene,
  );
  body.position.y = BODY_HEIGHT_M / 2;

  const material = new StandardMaterial('pedestrian-material', scene);
  material.diffuseColor = PEDESTRIAN_COLOR;
  body.material = material;

  const head = MeshBuilder.CreateSphere('pedestrian-head', { diameter: HEAD_DIAMETER_M }, scene);
  head.parent = body;
  head.position.set(0, BODY_HEIGHT_M / 2 + HEAD_DIAMETER_M / 2, 0);
  head.material = material;

  return { mesh: body };
}
