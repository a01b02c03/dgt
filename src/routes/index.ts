import type { BuildingFootprint } from '../core/building-types';
import type { RouteDefinition } from '../core/route-types';
import { ruta01Buildings } from './ruta-01/buildings';
import { ruta01 } from './ruta-01/route';

/**
 * Registro central de rutas disponibles en el build actual.
 * La versión gratis solo debe registrar rutas con isFree=true (hoy: únicamente ruta01).
 * Las rutas Pro se añaden aquí cuando exista el gate de licencia (ver CLAUDE.md).
 */
export const routeRegistry: RouteDefinition[] = [ruta01];

/** Edificios de contexto por ruta (no forman parte de RouteDefinition: no son datos de examen). */
const buildingsByRouteId: Record<string, BuildingFootprint[]> = {
  [ruta01.id]: ruta01Buildings,
};

export function getRoute(id: string): RouteDefinition | undefined {
  return routeRegistry.find((route) => route.id === id);
}

export function getFreeRoutes(): RouteDefinition[] {
  return routeRegistry.filter((route) => route.isFree);
}

export function getBuildings(routeId: string): BuildingFootprint[] {
  return buildingsByRouteId[routeId] ?? [];
}
