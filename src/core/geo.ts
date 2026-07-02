import type { GeoPoint } from './route-types';

const EARTH_RADIUS_M = 6371000;

export interface LocalPoint {
  x: number;
  z: number;
}

/**
 * Proyección equirectangular centrada en `origin`: x = este, z = norte, en metros.
 * Válida para el tamaño de una ruta de examen (unos pocos km); no pensada para
 * distancias donde la curvatura terrestre ya importe.
 */
export function toLocalMeters(origin: GeoPoint, point: GeoPoint): LocalPoint {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const dLat = ((point.lat - origin.lat) * Math.PI) / 180;
  const dLon = ((point.lon - origin.lon) * Math.PI) / 180;
  return {
    x: dLon * Math.cos(originLatRad) * EARTH_RADIUS_M,
    z: dLat * EARTH_RADIUS_M,
  };
}
