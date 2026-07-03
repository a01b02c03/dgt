import { describe, expect, it } from 'vitest';
import { createManeuverProgress, type ManeuverProgress } from './maneuver-tracker';
import type { Maneuver, Waypoint } from './route-types';
import {
  createStopLineCrossingState,
  projectOntoHeadingAxis,
  updateTrafficLightOutcomes,
  type StopLineCrossingState,
} from './traffic-light-evaluator';

// Ruta sintética: un único waypoint en el origen, heading 0° (norte, +z).
// DEFAULT_TRAFFIC_LIGHT_CYCLE: green=6, amber=3, red=8 -> offset(0) = 0.
// Por tanto en t=0 la fase es verde, t=6 ámbar, t=9 rojo.
const waypoints: Waypoint[] = [{ position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay: true }];
const waypointPositions = [{ x: 0, z: 0 }];

function trafficLightManeuver(): Maneuver {
  return { type: 'traffic-light', atWaypointIndex: 0, description: 'Semáforo de prueba' };
}

function drive(
  progress: ManeuverProgress[],
  crossingState: StopLineCrossingState[],
  zPositions: number[],
  elapsedSimS: number,
) {
  let result = { progress, crossingState };
  for (const z of zPositions) {
    result = updateTrafficLightOutcomes(
      result.progress,
      result.crossingState,
      waypoints,
      waypointPositions,
      { x: 0, z },
      elapsedSimS,
    );
  }
  return result;
}

describe('projectOntoHeadingAxis', () => {
  it('is positive ahead of the waypoint along a north (0deg) heading', () => {
    expect(projectOntoHeadingAxis({ x: 0, z: 5 }, { x: 0, z: 0 }, 0)).toBeCloseTo(5, 6);
  });

  it('is negative behind the waypoint along a north (0deg) heading', () => {
    expect(projectOntoHeadingAxis({ x: 0, z: -5 }, { x: 0, z: 0 }, 0)).toBeCloseTo(-5, 6);
  });

  it('is ~0 exactly on the perpendicular through the waypoint', () => {
    expect(projectOntoHeadingAxis({ x: 3, z: 0 }, { x: 0, z: 0 }, 0)).toBeCloseTo(0, 6);
  });

  it('matches the (sin, cos) forward-vector convention for a non-axis-aligned heading', () => {
    // heading 90deg (este): forward = (sin 90, cos 90) = (1, 0)
    expect(projectOntoHeadingAxis({ x: 5, z: 0 }, { x: 0, z: 0 }, 90)).toBeCloseTo(5, 6);
    expect(projectOntoHeadingAxis({ x: 0, z: 5 }, { x: 0, z: 0 }, 90)).toBeCloseTo(0, 6);
  });
});

describe('updateTrafficLightOutcomes', () => {
  it('fails a crossing that happens while the light is red', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [-1, 1], 9); // t=9 -> red
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('passes a crossing that happens while the light is green', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [-1, 1], 0); // t=0 -> green
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('passes a crossing that happens while the light is amber (v1: amber never penalizes)', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [-1, 1], 6); // t=6 -> amber
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('stays not-evaluated if the vehicle never crosses the line', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [-10, -5, -1], 9);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('evaluates at most once: a later re-crossing does not overwrite the outcome', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    // Cruza en rojo (t=9) -> fail; luego retrocede y vuelve a cruzar "en verde"
    // (t=0 en la siguiente llamada) -> no debe cambiar el veredicto.
    const first = drive(progress, crossingState, [-1, 1], 9);
    expect(first.progress[0].outcome).toBe('fail');
    const second = drive(first.progress, first.crossingState, [-1, 1], 0);
    expect(second.progress[0].outcome).toBe('fail');
  });

  it('does not retroactively evaluate a vehicle that starts already past the line', () => {
    const progress = createManeuverProgress([trafficLightManeuver()]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [5], 9); // ya pasado, sin proyección previa
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('leaves non-traffic-light maneuvers untouched regardless of vehicle position', () => {
    const giveWayManeuver: Maneuver = { type: 'give-way', atWaypointIndex: 0, description: 'Ceda el paso de prueba' };
    const progress = createManeuverProgress([giveWayManeuver]);
    const crossingState = createStopLineCrossingState(1);
    const result = drive(progress, crossingState, [-1, 1, -1, 1], 9);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });
});
