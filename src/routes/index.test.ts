import { describe, expect, it } from 'vitest';
import { getAccessibleRoutes, getFreeRoutes, getRoute, routeRegistry } from './index';

describe('routeRegistry', () => {
  it('exposes only free routes in the free build scope', () => {
    const freeRoutes = getFreeRoutes();
    expect(freeRoutes.length).toBeGreaterThan(0);
    expect(freeRoutes.every((route) => route.isFree)).toBe(true);
  });

  it('finds ruta-01 by id', () => {
    const route = getRoute('ruta-01');
    expect(route).toBeDefined();
    expect(route?.city).toBe('Barcelona');
  });

  it('finds ruta-02 by id, registered as Pro (isFree: false)', () => {
    const route = getRoute('ruta-02');
    expect(route).toBeDefined();
    expect(route?.city).toBe('Barcelona');
    expect(route?.isFree).toBe(false);
  });

  it('does not register duplicate route ids', () => {
    const ids = routeRegistry.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getAccessibleRoutes', () => {
  it('matches getFreeRoutes for a user without Pro access', () => {
    expect(getAccessibleRoutes(false)).toEqual(getFreeRoutes());
  });

  it('includes the Pro route for a user with Pro access, unlike getFreeRoutes', () => {
    const accessible = getAccessibleRoutes(true);
    expect(accessible).toEqual(routeRegistry);
    expect(accessible.length).toBeGreaterThan(getFreeRoutes().length);
  });
});
