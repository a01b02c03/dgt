import { describe, expect, it } from 'vitest';
import { toLocalMeters } from './geo';

describe('toLocalMeters', () => {
  const origin = { lat: 41.3991287, lon: 2.1812288 };

  it('maps the origin onto itself', () => {
    expect(toLocalMeters(origin, origin)).toEqual({ x: 0, z: 0 });
  });

  it('moving north increases z and leaves x unchanged', () => {
    const north = { lat: origin.lat + 0.001, lon: origin.lon };
    const { x, z } = toLocalMeters(origin, north);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(111.2, 0);
  });

  it('moving east increases x and leaves z unchanged', () => {
    const east = { lat: origin.lat, lon: origin.lon + 0.001 };
    const { x, z } = toLocalMeters(origin, east);
    expect(z).toBeCloseTo(0, 6);
    expect(x).toBeCloseTo(83.4, 0);
  });

  it('moving south/west gives negative z/x', () => {
    const southWest = { lat: origin.lat - 0.001, lon: origin.lon - 0.001 };
    const { x, z } = toLocalMeters(origin, southWest);
    expect(x).toBeLessThan(0);
    expect(z).toBeLessThan(0);
  });
});
