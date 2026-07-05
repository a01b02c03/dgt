import { describe, expect, it } from 'vitest';
import {
  buildLaneLineQuads,
  buildStopLineQuads,
  buildZebraQuads,
  DASH_GAP_M,
  DASH_LENGTH_M,
  LINE_WIDTH_M,
  STOP_LINE_THICKNESS_M,
  ZEBRA_STRIPE_GAP_M,
  ZEBRA_STRIPE_WIDTH_M,
} from './road-markings';
import type { Maneuver, Waypoint } from './route-types';

// Trazado sintético recto hacia el norte (+z), 100m: heading 0 => derecha = +x,
// así que el offset lateral de cada quad se lee directamente en su x.
function waypoint(twoWay: boolean, ownDirectionLanes: number): Waypoint {
  return { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay, ownDirectionLanes };
}
const routePoints = [
  { x: 0, z: 0 },
  { x: 0, z: 100 },
];

function xValues(quad: { corners: { x: number }[] }): number[] {
  return quad.corners.map((c) => c.x);
}

describe('buildLaneLineQuads', () => {
  it('draws a full-length direction separator on a two-way segment, at the model boundary', () => {
    // 2+1 carriles = 9m: contrario [-4.5,-1.5] => separador en -1.5.
    const quads = buildLaneLineQuads([waypoint(true, 2), waypoint(true, 2)], routePoints);
    const solid = quads.filter((q) => Math.abs(q.corners[2].z - q.corners[0].z) > DASH_LENGTH_M + 1);
    expect(solid).toHaveLength(1);
    expect(Math.min(...xValues(solid[0]))).toBeCloseTo(-1.5 - LINE_WIDTH_M / 2, 6);
    expect(Math.max(...xValues(solid[0]))).toBeCloseTo(-1.5 + LINE_WIDTH_M / 2, 6);
  });

  it('draws no separator on a one-way segment', () => {
    const quads = buildLaneLineQuads([waypoint(false, 1), waypoint(false, 1)], routePoints);
    expect(quads).toHaveLength(0);
  });

  it('draws dashed dividers between adjacent own lanes, one dash per cycle', () => {
    // 3 carriles one-way = 9m: divisores en -1.5 y +1.5; 100m / (2+4) = 17 trazos por divisor.
    const quads = buildLaneLineQuads([waypoint(false, 3), waypoint(false, 3)], routePoints);
    const dashesPerDivider = Math.ceil(100 / (DASH_LENGTH_M + DASH_GAP_M));
    expect(quads).toHaveLength(2 * dashesPerDivider);
    const lateralCenters = new Set(quads.map((q) => ((Math.min(...xValues(q)) + Math.max(...xValues(q))) / 2).toFixed(3)));
    expect(lateralCenters).toEqual(new Set(['-1.500', '1.500']));
    expect(Math.abs(quads[0].corners[2].z - quads[0].corners[0].z)).toBeCloseTo(DASH_LENGTH_M, 6);
  });

  it('keeps every line inside the ribbon width', () => {
    const waypoints = [waypoint(true, 5), waypoint(true, 5)];
    const quads = buildLaneLineQuads(waypoints, routePoints);
    const halfWidth = 9; // (5+1)*3/2
    quads.forEach((quad) => {
      xValues(quad).forEach((x) => {
        expect(Math.abs(x)).toBeLessThanOrEqual(halfWidth);
      });
    });
  });
});

describe('buildZebraQuads', () => {
  it('spreads stripes across the full roadway of the crossing segment', () => {
    // 2+1 = 9m de ancho: franjas de 0.5m cada 1m desde -4.5 => 9 franjas.
    const waypoints = [waypoint(true, 2), waypoint(true, 2)];
    const quads = buildZebraQuads([{ position: { x: 0, z: 50 }, headingDeg: 0 }], waypoints, routePoints);
    const expectedStripes = Math.floor((9 - ZEBRA_STRIPE_WIDTH_M) / (ZEBRA_STRIPE_WIDTH_M + ZEBRA_STRIPE_GAP_M)) + 1;
    expect(quads).toHaveLength(expectedStripes);
    expect(Math.min(...quads.flatMap(xValues))).toBeCloseTo(-4.5, 6);
    quads.forEach((quad) => {
      expect(Math.max(...xValues(quad))).toBeLessThanOrEqual(4.5 + 1e-6);
    });
  });

  it('centers each stripe longitudinally on the crossing position', () => {
    const waypoints = [waypoint(false, 1), waypoint(false, 1)];
    const quads = buildZebraQuads([{ position: { x: 0, z: 50 }, headingDeg: 0 }], waypoints, routePoints);
    quads.forEach((quad) => {
      const zs = quad.corners.map((c) => c.z);
      expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(50, 6);
    });
  });

  it('anchors laterally to the polyline projection, not to an off-axis dataset position', () => {
    // Ancla cruda a -5.6m del eje (fuera de una calzada de 9m, el caso real
    // del paso #0 de ruta-02): la cebra debe cubrir [-4.5, +4.5] igualmente.
    const waypoints = [waypoint(true, 2), waypoint(true, 2)];
    const quads = buildZebraQuads([{ position: { x: -5.6, z: 50 }, headingDeg: 0 }], waypoints, routePoints);
    expect(Math.min(...quads.flatMap(xValues))).toBeCloseTo(-4.5, 6);
    expect(Math.max(...quads.flatMap(xValues))).toBeLessThanOrEqual(4.5 + 1e-6);
    quads.forEach((quad) => {
      const zs = quad.corners.map((c) => c.z);
      expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(50, 6);
    });
  });
});

describe('buildStopLineQuads', () => {
  const maneuvers: Maneuver[] = [
    { type: 'traffic-light', atWaypointIndex: 1, description: 'semáforo' },
    { type: 'give-way', atWaypointIndex: 0, description: 'ceda' },
  ];

  it('draws one band per traffic-light maneuver, ending exactly at the waypoint (the evaluation line)', () => {
    const quads = buildStopLineQuads(maneuvers, [waypoint(true, 2), waypoint(true, 2)], routePoints);
    expect(quads).toHaveLength(1);
    const zs = quads[0].corners.map((c) => c.z);
    expect(Math.max(...zs)).toBeCloseTo(100, 6);
    expect(Math.min(...zs)).toBeCloseTo(100 - STOP_LINE_THICKNESS_M, 6);
  });

  it('covers only the own-direction lanes, not the oncoming strip', () => {
    // 2+1 = 9m: propios [-1.5, +4.5].
    const quads = buildStopLineQuads(maneuvers, [waypoint(true, 2), waypoint(true, 2)], routePoints);
    expect(Math.min(...xValues(quads[0]))).toBeCloseTo(-1.5, 6);
    expect(Math.max(...xValues(quads[0]))).toBeCloseTo(4.5, 6);
  });
});
