import { describe, expect, it } from 'vitest';
import { createManeuverProgress, updateManeuverProgress, type ManeuverProgress } from './maneuver-tracker';
import {
  createParallelParkEvalState,
  updateParallelParkOutcomes,
  type ParallelParkEvalState,
} from './parallel-park-evaluator';
import type { Maneuver, Waypoint } from './route-types';

// Waypoint único en el origen, heading 0 (norte, +z), sin límite de interés aquí.
const waypoints: Waypoint[] = [{ position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 30, twoWay: true, ownDirectionLanes: 1 }];
const waypointPositions = [{ x: 0, z: 0 }];

function parkManeuver(): Maneuver {
  return { type: 'parallel-park', atWaypointIndex: 0, description: 'Aparcamiento de prueba' };
}

interface Sample {
  x: number;
  z: number;
  headingRad: number;
  speedMs: number;
  onRoad?: boolean;
  colliding?: boolean;
}

function drive(progress: ManeuverProgress[], evalState: ParallelParkEvalState[], samples: Sample[]) {
  let result = { progress, evalState };
  for (const sample of samples) {
    result.progress = updateManeuverProgress(result.progress, waypointPositions, sample);
    result = updateParallelParkOutcomes(
      result.progress,
      result.evalState,
      waypoints,
      waypointPositions,
      sample,
      sample.onRoad ?? true,
      sample.colliding ?? false,
    );
  }
  return result;
}

describe('updateParallelParkOutcomes', () => {
  it('passes as soon as the vehicle stops on-road, aligned, near the maneuver point', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 2, headingRad: 0.05, speedMs: 0 },
    ]);
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('fails if the vehicle never stops before leaving the trigger radius', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: -25, headingRad: 0, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle stops but at an angle to the street heading', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 2, headingRad: Math.PI / 2, speedMs: 0 }, // parado en perpendicular
      { x: 0, z: -25, headingRad: Math.PI / 2, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle stops off-road', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 2, headingRad: 0, speedMs: 0, onRoad: false },
      { x: 0, z: -25, headingRad: 0, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle stops too far from the maneuver point along the street', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 12, headingRad: 0, speedMs: 0 }, // parado, pero a 12m del punto (tolerancia 4m)
      { x: 0, z: -25, headingRad: 0, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if a collision happened earlier in the maneuver, even if it later parks correctly', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5, colliding: true },
      { x: 0, z: 2, headingRad: 0, speedMs: 0 },
      { x: 0, z: -25, headingRad: 0, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('evaluates at most once', () => {
    const progress = createManeuverProgress([parkManeuver()]);
    const evalState = createParallelParkEvalState(1);
    const first = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 2, headingRad: 0, speedMs: 0 }, // pass
    ]);
    expect(first.progress[0].outcome).toBe('pass');
    const second = drive(first.progress, first.evalState, [
      { x: 0, z: 2, headingRad: Math.PI / 2, speedMs: 0, colliding: true },
    ]);
    expect(second.progress[0].outcome).toBe('pass');
  });

  it('leaves non-parallel-park maneuvers untouched', () => {
    const giveWayManeuver: Maneuver = { type: 'give-way', atWaypointIndex: 0, description: 'Ceda el paso de prueba' };
    const progress = createManeuverProgress([giveWayManeuver]);
    const evalState = createParallelParkEvalState(1);
    const result = drive(progress, evalState, [{ x: 0, z: 2, headingRad: 0, speedMs: 0 }]);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });
});
