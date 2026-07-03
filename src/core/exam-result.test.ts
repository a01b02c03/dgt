import { describe, expect, it } from 'vitest';
import { examOutcome, hasReachedFinish } from './exam-result';
import { createManeuverProgress } from './maneuver-tracker';
import type { Maneuver } from './route-types';

describe('hasReachedFinish', () => {
  const finish = { x: 0, z: 0 };

  it('is true within the finish radius', () => {
    expect(hasReachedFinish({ x: 3, z: 4 }, finish)).toBe(true); // dist 5
  });

  it('is false outside the finish radius', () => {
    expect(hasReachedFinish({ x: 15, z: 0 }, finish)).toBe(false);
    expect(hasReachedFinish({ x: 20, z: 0 }, finish)).toBe(false);
  });
});

describe('examOutcome', () => {
  function maneuvers(): Maneuver[] {
    return [
      { type: 'traffic-light', atWaypointIndex: 0, description: 'Semáforo A' },
      { type: 'traffic-light', atWaypointIndex: 1, description: 'Semáforo B' },
    ];
  }

  it('is null while in progress: no failures yet and route not finished', () => {
    const progress = createManeuverProgress(maneuvers());
    expect(examOutcome(progress, false)).toBeNull();
  });

  it('is pass once the route is finished with no failed maneuvers', () => {
    const progress = createManeuverProgress(maneuvers());
    expect(examOutcome(progress, true)).toBe('pass');
  });

  it('is fail as soon as any maneuver fails, even before finishing the route', () => {
    let progress = createManeuverProgress(maneuvers());
    progress = progress.map((entry, index) => (index === 0 ? { ...entry, outcome: 'fail' } : entry));
    expect(examOutcome(progress, false)).toBe('fail');
  });

  it('fail takes priority over reaching the finish', () => {
    let progress = createManeuverProgress(maneuvers());
    progress = progress.map((entry, index) => (index === 0 ? { ...entry, outcome: 'fail' } : entry));
    expect(examOutcome(progress, true)).toBe('fail');
  });

  it('pass ignores maneuvers still not-evaluated (types without criteria, or never triggered)', () => {
    let progress = createManeuverProgress(maneuvers());
    progress = progress.map((entry, index) => (index === 0 ? { ...entry, outcome: 'pass' } : entry));
    // index 1 stays 'not-evaluated'
    expect(examOutcome(progress, true)).toBe('pass');
  });
});
