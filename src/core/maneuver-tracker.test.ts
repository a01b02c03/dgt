import { describe, expect, it } from 'vitest';
import { createManeuverProgress, updateManeuverProgress } from './maneuver-tracker';
import type { Maneuver } from './route-types';

describe('maneuver progress tracking', () => {
  const maneuvers: Maneuver[] = [
    { type: 'give-way', atWaypointIndex: 1, description: 'Ceda el paso de prueba' },
  ];
  const waypointPositions = [
    { x: 0, z: 0 },
    { x: 0, z: 100 }, // el waypoint 1 es el objetivo de la maniobra
  ];

  it('stays pending while far from the maneuver waypoint', () => {
    const progress = createManeuverProgress(maneuvers);
    const next = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 0, speedMs: 10 });
    expect(next[0].status).toBe('pending');
  });

  it('becomes active on entering the trigger radius and records speed/distance', () => {
    const progress = createManeuverProgress(maneuvers);
    const next = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 90, speedMs: 8 });
    expect(next[0].status).toBe('active');
    expect(next[0].closestDistanceM).toBeCloseTo(10, 6);
    expect(next[0].speedAtClosestMs).toBe(8);
  });

  it('keeps the closest distance/speed reached while active, not the latest', () => {
    let progress = createManeuverProgress(maneuvers);
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 85, speedMs: 6 }); // dist 15
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 100, speedMs: 12 }); // dist 0, closest
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 95, speedMs: 9 }); // dist 5, not closer
    expect(progress[0].closestDistanceM).toBeCloseTo(0, 6);
    expect(progress[0].speedAtClosestMs).toBe(12);
  });

  it('becomes completed after leaving the radius once it was active', () => {
    let progress = createManeuverProgress(maneuvers);
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 95, speedMs: 8 });
    expect(progress[0].status).toBe('active');
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 0, speedMs: 8 });
    expect(progress[0].status).toBe('completed');
  });

  it('never regresses out of completed', () => {
    let progress = createManeuverProgress(maneuvers);
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 95, speedMs: 8 });
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 0, speedMs: 8 });
    expect(progress[0].status).toBe('completed');
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 100, speedMs: 8 });
    expect(progress[0].status).toBe('completed');
  });

  it('honors a per-maneuver triggerRadiusM over the 20m default', () => {
    const wideManeuvers: Maneuver[] = [
      { type: 'u-turn', atWaypointIndex: 1, description: 'Cambio de sentido en glorieta', triggerRadiusM: 50 },
    ];
    let progress = createManeuverProgress(wideManeuvers);
    // A 45m del waypoint: fuera del radio global de 20m, dentro del propio de 50m.
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 55, speedMs: 8 });
    expect(progress[0].status).toBe('active');
    // A 60m: fuera también del radio propio -> completed.
    progress = updateManeuverProgress(progress, waypointPositions, { x: 0, z: 40, speedMs: 8 });
    expect(progress[0].status).toBe('completed');
  });
});
