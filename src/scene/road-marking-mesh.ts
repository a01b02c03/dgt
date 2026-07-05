import { Color3, Mesh, type Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import type { MarkingQuad } from '../core/road-markings';

/** Elevación sobre la calzada (y=0) para evitar z-fighting con la cinta de road-mesh.ts. */
const MARKING_Y = 0.02;

/**
 * Una única malla con toda la señalización horizontal de la ruta (dos
 * triángulos por quad, con ambos sentidos de winding para no depender de la
 * orientación de las esquinas) — un solo draw call aunque ruta-03 genere
 * miles de trazos, en vez de un mesh por trazo.
 */
export function buildRoadMarkingMesh(quads: MarkingQuad[], routeId: string, scene: Scene): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  quads.forEach((quad, quadIndex) => {
    const base = quadIndex * 4;
    quad.corners.forEach((corner) => {
      positions.push(corner.x, MARKING_Y, corner.z);
      normals.push(0, 1, 0);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });

  const mesh = new Mesh(`road-markings-${routeId}`, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);

  const material = new StandardMaterial(`road-markings-${routeId}-material`, scene);
  material.diffuseColor = new Color3(0.85, 0.85, 0.82);
  material.specularColor = Color3.Black();
  mesh.material = material;

  return mesh;
}
