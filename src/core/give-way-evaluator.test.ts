import { describe, expect, it } from 'vitest';
import { createGiveWayEvalState, updateGiveWayOutcomes, type GiveWayCrossingState } from './give-way-evaluator';
import { createManeuverProgress, type ManeuverProgress } from './maneuver-tracker';
import type { Maneuver, Waypoint } from './route-types';

// Ruta sintética: un único waypoint en el origen, heading 0° (norte, +z),
// mismo convenio que traffic-light-evaluator.test.ts.
const waypoints: Waypoint[] = [{ position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 1 }];
const waypointPositions = [{ x: 0, z: 0 }];

function giveWayManeuver(): Maneuver {
  return { type: 'give-way', atWaypointIndex: 0, description: 'Paso de peatones de prueba' };
}

function drive(progress: ManeuverProgress[], evalState: GiveWayCrossingState[], zPositions: number[], obstructed: boolean) {
  let result = { progress, evalState };
  for (const z of zPositions) {
    result = updateGiveWayOutcomes(result.progress, result.evalState, waypoints, waypointPositions, { x: 0, z }, [
      obstructed,
    ]);
  }
  return result;
}

describe('updateGiveWayOutcomes', () => {
  it('fails a crossing that happens while the paired pedestrian is in the roadway', () => {
    const progress = createManeuverProgress([giveWayManeuver()]);
    const evalState = createGiveWayEvalState(1);
    const result = drive(progress, evalState, [-1, 1], true);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('passes a crossing that happens with no pedestrian in the roadway', () => {
    const progress = createManeuverProgress([giveWayManeuver()]);
    const evalState = createGiveWayEvalState(1);
    const result = drive(progress, evalState, [-1, 1], false);
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('stays not-evaluated if the vehicle never crosses the line', () => {
    const progress = createManeuverProgress([giveWayManeuver()]);
    const evalState = createGiveWayEvalState(1);
    const result = drive(progress, evalState, [-10, -5, -1], true);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('evaluates at most once: a later re-crossing does not overwrite the outcome', () => {
    const progress = createManeuverProgress([giveWayManeuver()]);
    const evalState = createGiveWayEvalState(1);
    const first = drive(progress, evalState, [-1, 1], true);
    expect(first.progress[0].outcome).toBe('fail');
    const second = drive(first.progress, first.evalState, [-1, 1], false);
    expect(second.progress[0].outcome).toBe('fail');
  });

  it('does not retroactively evaluate a vehicle that starts already past the line', () => {
    const progress = createManeuverProgress([giveWayManeuver()]);
    const evalState = createGiveWayEvalState(1);
    const result = drive(progress, evalState, [5], true);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('leaves non-give-way maneuvers untouched regardless of vehicle position', () => {
    const trafficLightManeuver: Maneuver = {
      type: 'traffic-light',
      atWaypointIndex: 0,
      description: 'Semáforo de prueba',
    };
    const progress = createManeuverProgress([trafficLightManeuver]);
    const evalState = createGiveWayEvalState(1);
    const result = drive(progress, evalState, [-1, 1, -1, 1], true);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });
});
