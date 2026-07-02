import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial } from '@babylonjs/core';

export const VEHICLE_LENGTH_M = 4.2;
export const VEHICLE_WIDTH_M = 1.8;
const BODY_HEIGHT_M = 1.4;
const NOSE_LENGTH_M = 0.4;

export const VEHICLE_ON_ROAD_COLOR = new Color3(0.15, 0.35, 0.75);
export const VEHICLE_OFF_ROAD_COLOR = new Color3(0.75, 0.2, 0.15);

export interface VehicleMesh {
  mesh: Mesh;
  bodyMaterial: StandardMaterial;
}

/**
 * Placeholder de vehículo (caja + morro de color) hasta que se cargue un modelo
 * glTF real. El morro marca el frente: el mesh está orientado para que
 * rotation.y coincida con el rumbo de compás (0 = norte/+Z, 90 = este/+X), igual
 * que headingDeg en el modelo de ruta. Se expone `bodyMaterial` para poder
 * teñir la carrocería (p.ej. al salirse de la calzada).
 */
export function buildVehicleMesh(scene: Scene): VehicleMesh {
  const body = MeshBuilder.CreateBox(
    'vehicle-body',
    { width: VEHICLE_WIDTH_M, height: BODY_HEIGHT_M, depth: VEHICLE_LENGTH_M },
    scene,
  );
  body.position.y = BODY_HEIGHT_M / 2;

  const bodyMaterial = new StandardMaterial('vehicle-body-material', scene);
  bodyMaterial.diffuseColor = VEHICLE_ON_ROAD_COLOR;
  body.material = bodyMaterial;

  const nose = MeshBuilder.CreateBox(
    'vehicle-nose',
    { width: VEHICLE_WIDTH_M * 0.6, height: BODY_HEIGHT_M * 0.3, depth: NOSE_LENGTH_M },
    scene,
  );
  nose.parent = body;
  nose.position.set(0, 0, VEHICLE_LENGTH_M / 2 + NOSE_LENGTH_M / 2 - 0.1);

  const noseMaterial = new StandardMaterial('vehicle-nose-material', scene);
  noseMaterial.diffuseColor = new Color3(0.9, 0.75, 0.1);
  nose.material = noseMaterial;

  return { mesh: body, bodyMaterial };
}
