import { describe, expect, it } from 'vitest';
import { createManeuverProgress, updateManeuverProgress, type ManeuverProgress } from './maneuver-tracker';
import type { Maneuver } from './route-types';
import { createUTurnEvalState, updateUTurnOutcomes, type UTurnEvalState } from './u-turn-evaluator';

function uTurnManeuver(): Maneuver {
  return { type: 'u-turn', atWaypointIndex: 0, description: 'Cambio de sentido de prueba' };
}

const waypointPositions = [{ x: 0, z: 0 }];

interface Sample {
  x: number;
  z: number;
  headingRad: number;
  speedMs: number;
  onRoad?: boolean;
  colliding?: boolean;
}

function drive(progress: ManeuverProgress[], evalState: UTurnEvalState[], samples: Sample[]) {
  let result = { progress, evalState };
  for (const sample of samples) {
    result.progress = updateManeuverProgress(result.progress, waypointPositions, sample);
    result = updateUTurnOutcomes(
      result.progress,
      result.evalState,
      { headingRad: sample.headingRad },
      sample.onRoad ?? true,
      sample.colliding ?? false,
    );
  }
  return result;
}

describe('updateUTurnOutcomes', () => {
  it('passes a clean 180deg turn completed on-road without collisions', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 }, // entra activo, rumbo 0
      { x: 0, z: 5, headingRad: Math.PI, speedMs: 5 }, // gira 180deg dentro del radio
      { x: 0, z: 25, headingRad: Math.PI, speedMs: 5 }, // sale del radio -> completed
    ]);
    expect(result.progress[0].status).toBe('completed');
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('fails if the vehicle drives past without turning around', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: -25, headingRad: 0, speedMs: 5 }, // sigue recto, mismo rumbo, sale del radio
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle goes off-road at any point during the maneuver', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5, onRoad: true },
      { x: 5, z: 5, headingRad: Math.PI / 2, speedMs: 5, onRoad: false }, // se sube a la acera
      { x: 0, z: 5, headingRad: Math.PI, speedMs: 5, onRoad: true },
      { x: 0, z: 25, headingRad: Math.PI, speedMs: 5, onRoad: true },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle collides with a building at any point during the maneuver', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 10, headingRad: Math.PI / 2, speedMs: 0, colliding: true },
      { x: 0, z: 5, headingRad: Math.PI, speedMs: 5 },
      { x: 0, z: 25, headingRad: Math.PI, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('stays not-evaluated while still active (never left the trigger radius)', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [{ x: 0, z: 15, headingRad: 0, speedMs: 5 }]);
    expect(result.progress[0].status).toBe('active');
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('evaluates at most once', () => {
    const progress = createManeuverProgress([uTurnManeuver()]);
    const evalState = createUTurnEvalState(1);
    const first = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: -25, headingRad: 0, speedMs: 5 }, // sin girar -> fail
    ]);
    expect(first.progress[0].outcome).toBe('fail');
    // Reentra y ahora sí gira bien: no debería sobrescribir el fail ya fijado.
    const second = drive(first.progress, first.evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 5, headingRad: Math.PI, speedMs: 5 },
      { x: 0, z: -25, headingRad: Math.PI, speedMs: 5 },
    ]);
    expect(second.progress[0].outcome).toBe('fail');
  });

  it('leaves non-u-turn maneuvers untouched', () => {
    const giveWayManeuver: Maneuver = { type: 'give-way', atWaypointIndex: 0, description: 'Ceda el paso de prueba' };
    const progress = createManeuverProgress([giveWayManeuver]);
    const evalState = createUTurnEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, headingRad: 0, speedMs: 5 },
      { x: 0, z: 5, headingRad: Math.PI, speedMs: 5 },
      { x: 0, z: 25, headingRad: Math.PI, speedMs: 5 },
    ]);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });
});
