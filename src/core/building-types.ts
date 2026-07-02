import type { GeoPoint } from './route-types';

/** Huella 3D de un edificio: contorno cerrado (el primer punto no se repite al final) + altura. */
export interface BuildingFootprint {
  id: string;
  footprint: GeoPoint[];
  heightM: number;
}
