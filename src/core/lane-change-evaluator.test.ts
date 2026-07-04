import { describe, expect, it } from 'vitest';
import { createLaneChangeEvalState, updateLaneChangeOutcomes, type LaneChangeEvalState } from './lane-change-evaluator';
import { createManeuverProgress, updateManeuverProgress, type ManeuverProgress } from './maneuver-tracker';
import type { Maneuver } from './route-types';

function laneChangeManeuver(): Maneuver {
  return { type: 'lane-change', atWaypointIndex: 0, description: 'Cambio de carril de prueba' };
}

const waypointPositions = [{ x: 0, z: 0 }];

interface Sample {
  x: number;
  z: number;
  laneIndex: number;
  onRoad?: boolean;
  colliding?: boolean;
}

function drive(progress: ManeuverProgress[], evalState: LaneChangeEvalState[], samples: Sample[]) {
  let result = { progress, evalState };
  for (const sample of samples) {
    result.progress = updateManeuverProgress(result.progress, waypointPositions, { x: sample.x, z: sample.z, speedMs: 5 });
    result = updateLaneChangeOutcomes(
      result.progress,
      result.evalState,
      { laneIndex: sample.laneIndex },
      sample.onRoad ?? true,
      sample.colliding ?? false,
    );
  }
  return result;
}

describe('updateLaneChangeOutcomes', () => {
  it('passes a clean move to the adjacent lane, on-road and without collisions', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 }, // entra activo en el carril 0
      { x: 0, z: 5, laneIndex: 1 }, // se cambia al carril 1 dentro del radio
      { x: 0, z: -25, laneIndex: 1 }, // sale del radio -> completed
    ]);
    expect(result.progress[0].status).toBe('completed');
    expect(result.progress[0].outcome).toBe('pass');
  });

  it('fails if the vehicle stays in the same lane', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: -25, laneIndex: 0 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle jumps more than one lane at once', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: -25, laneIndex: 2 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle goes off-road at any point during the maneuver', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0, onRoad: true },
      { x: 0, z: 5, laneIndex: 1, onRoad: false },
      { x: 0, z: -25, laneIndex: 1, onRoad: true },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('fails if the vehicle collides with something during the maneuver', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: 5, laneIndex: 1, colliding: true },
      { x: 0, z: -25, laneIndex: 1 },
    ]);
    expect(result.progress[0].outcome).toBe('fail');
  });

  it('stays not-evaluated while still active (never left the trigger radius)', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [{ x: 0, z: 15, laneIndex: 0 }]);
    expect(result.progress[0].status).toBe('active');
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });

  it('evaluates at most once', () => {
    const progress = createManeuverProgress([laneChangeManeuver()]);
    const evalState = createLaneChangeEvalState(1);
    const first = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: -25, laneIndex: 0 }, // se queda en el mismo carril -> fail
    ]);
    expect(first.progress[0].outcome).toBe('fail');
    // Reentra y ahora sí cambia de carril: no debería sobrescribir el fail ya fijado.
    const second = drive(first.progress, first.evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: 5, laneIndex: 1 },
      { x: 0, z: -25, laneIndex: 1 },
    ]);
    expect(second.progress[0].outcome).toBe('fail');
  });

  it('leaves non-lane-change maneuvers untouched', () => {
    const giveWayManeuver: Maneuver = { type: 'give-way', atWaypointIndex: 0, description: 'Ceda el paso de prueba' };
    const progress = createManeuverProgress([giveWayManeuver]);
    const evalState = createLaneChangeEvalState(1);
    const result = drive(progress, evalState, [
      { x: 0, z: 15, laneIndex: 0 },
      { x: 0, z: 5, laneIndex: 1 },
      { x: 0, z: -25, laneIndex: 1 },
    ]);
    expect(result.progress[0].outcome).toBe('not-evaluated');
  });
});
