import type { BuildingFootprint } from '../core/building-types';
import type { RouteDefinition } from '../core/route-types';
import { ruta01Buildings } from './ruta-01/buildings';
import { ruta01 } from './ruta-01/route';
import { ruta02Buildings } from './ruta-02/buildings';
import { ruta02 } from './ruta-02/route';
import { ruta03Buildings } from './ruta-03/buildings';
import { ruta03 } from './ruta-03/route';

/**
 * Registro central de rutas disponibles en el build actual.
 * La versión gratis solo debe registrar rutas con isFree=true (hoy: únicamente ruta01).
 * `ruta02` es la primera ruta Pro (`isFree: false`, ver su comentario de cabecera) — primer
 * contenido real que protege el gate de licencia.
 */
export const routeRegistry: RouteDefinition[] = [ruta01, ruta02, ruta03];

/** Edificios de contexto por ruta (no forman parte de RouteDefinition: no son datos de examen). */
const buildingsByRouteId: Record<string, BuildingFootprint[]> = {
  [ruta01.id]: ruta01Buildings,
  [ruta02.id]: ruta02Buildings,
  [ruta03.id]: ruta03Buildings,
};

export function getRoute(id: string): RouteDefinition | undefined {
  return routeRegistry.find((route) => route.id === id);
}

export function getFreeRoutes(): RouteDefinition[] {
  return routeRegistry.filter((route) => route.isFree);
}

/**
 * Rutas visibles según el acceso Pro del usuario. Desde `ruta02` (primera ruta
 * `isFree: false`) esto ya no se comporta igual que `getFreeRoutes()` para un
 * usuario con acceso Pro — ver `main.ts` para el cableado real del selector.
 */
export function getAccessibleRoutes(hasProAccess: boolean): RouteDefinition[] {
  return routeRegistry.filter((route) => route.isFree || hasProAccess);
}

export function getBuildings(routeId: string): BuildingFootprint[] {
  return buildingsByRouteId[routeId] ?? [];
}
