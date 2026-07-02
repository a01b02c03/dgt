import earcut from 'earcut';
import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { BuildingFootprint } from '../core/building-types';
import { toLocalMeters } from '../core/geo';
import type { GeoPoint } from '../core/route-types';

/**
 * Extruye cada huella de edificio en un volumen 3D. `ExtrudePolygon` extruye hacia
 * -Y desde el plano de la huella, así que subimos el mesh `heightM` para que la
 * base quede en y=0 y la azotea en y=heightM.
 *
 * `sideOrientation: DOUBLESIDE` es necesario porque las huellas vienen de OSM
 * (`ruta01Buildings`), donde el sentido de giro del contorno no es consistente entre
 * edificios (cada `way` se digitalizó independientemente) — con una sola cara, el
 * culling trasero de Babylon oculta las paredes de los edificios cuyo sentido de
 * giro no coincide con lo que espera ExtrudePolygon, dejando huecos hacia el cielo.
 */
export function buildBuildingMeshes(buildings: BuildingFootprint[], origin: GeoPoint, scene: Scene): Mesh[] {
  const material = new StandardMaterial('building-material', scene);
  material.diffuseColor = new Color3(0.82, 0.78, 0.7);

  return buildings.map((building) => {
    const shape = building.footprint.map((point) => {
      const local = toLocalMeters(origin, point);
      return new Vector3(local.x, 0, local.z);
    });

    const mesh = MeshBuilder.ExtrudePolygon(
      `building-${building.id}`,
      { shape, depth: building.heightM, sideOrientation: Mesh.DOUBLESIDE },
      scene,
      earcut,
    );
    mesh.position.y = building.heightM;
    mesh.material = material;
    return mesh;
  });
}
