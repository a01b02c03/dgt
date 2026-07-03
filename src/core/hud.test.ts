import { describe, expect, it } from 'vitest';
import { currentSpeedLimitKmh, maneuverChecklistLabel, speedMsToKmh } from './hud';
import type { Maneuver, Waypoint } from './route-types';

describe('speedMsToKmh', () => {
  it('converts zero to zero', () => {
    expect(speedMsToKmh(0)).toBe(0);
  });

  it('converts and rounds to the nearest integer', () => {
    expect(speedMsToKmh(13.9)).toBe(50); // ~50 km/h, el límite habitual de ruta-01
  });

  it('shows reverse (negative) speed as a positive value', () => {
    expect(speedMsToKmh(-5)).toBe(18);
  });
});

describe('currentSpeedLimitKmh', () => {
  const waypoints: Waypoint[] = [
    { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 50, twoWay: true, ownDirectionLanes: 1 },
    { position: { lat: 0, lon: 0 }, headingDeg: 0, speedLimitKmh: 30, twoWay: true, ownDirectionLanes: 1 },
  ];

  it('reads the limit of the given segment index, not segmentIndex + 1', () => {
    expect(currentSpeedLimitKmh(waypoints, 0)).toBe(50);
    expect(currentSpeedLimitKmh(waypoints, 2)).toBe(30);
  });
});

describe('maneuverChecklistLabel', () => {
  function maneuver(): Maneuver {
    return { type: 'traffic-light', atWaypointIndex: 0, description: 'Semáforo de prueba' };
  }

  it('shows the pending status when outcome is not-evaluated', () => {
    const label = maneuverChecklistLabel({ maneuver: maneuver(), status: 'pending', outcome: 'not-evaluated' });
    expect(label).toEqual({ description: 'Semáforo de prueba', badgeText: 'Pendiente', tone: 'pending' });
  });

  it('shows the active status when outcome is not-evaluated', () => {
    const label = maneuverChecklistLabel({ maneuver: maneuver(), status: 'active', outcome: 'not-evaluated' });
    expect(label.tone).toBe('active');
    expect(label.badgeText).toBe('En curso');
  });

  it('shows the completed status for a maneuver type without evaluation criteria', () => {
    const label = maneuverChecklistLabel({ maneuver: maneuver(), status: 'completed', outcome: 'not-evaluated' });
    expect(label.tone).toBe('completed');
    expect(label.badgeText).toBe('Completada');
  });

  it('shows pass regardless of proximity status once outcome is decided', () => {
    const label = maneuverChecklistLabel({ maneuver: maneuver(), status: 'active', outcome: 'pass' });
    expect(label.tone).toBe('pass');
    expect(label.badgeText).toBe('Apto');
  });

  it('shows fail regardless of proximity status once outcome is decided', () => {
    const label = maneuverChecklistLabel({ maneuver: maneuver(), status: 'completed', outcome: 'fail' });
    expect(label.tone).toBe('fail');
    expect(label.badgeText).toBe('No apto');
  });
});
