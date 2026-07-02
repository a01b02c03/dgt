import { describe, expect, it } from 'vitest';
import { createVehicleState, stepVehicle } from './vehicle-controller';

describe('stepVehicle', () => {
  it('accelerates forward and moves in the heading direction', () => {
    const state = createVehicleState(0, 0, 0); // heading 0 = norte (+z)
    const next = stepVehicle(state, { throttle: 1, steering: 0 }, 1);
    expect(next.speedMs).toBeGreaterThan(0);
    expect(next.z).toBeGreaterThan(0);
    expect(next.x).toBeCloseTo(0, 5);
  });

  it('does not exceed the max speed no matter how long the throttle is held', () => {
    let state = createVehicleState(0, 0, 0);
    for (let i = 0; i < 100; i++) {
      state = stepVehicle(state, { throttle: 1, steering: 0 }, 1);
    }
    expect(state.speedMs).toBeLessThanOrEqual(13.9);
  });

  it('coasts to a stop via friction when there is no throttle input', () => {
    let state = createVehicleState(0, 0, 0);
    state = stepVehicle(state, { throttle: 1, steering: 0 }, 1);
    const speedAfterAccel = state.speedMs;
    state = stepVehicle(state, { throttle: 0, steering: 0 }, 1);
    expect(state.speedMs).toBeLessThan(speedAfterAccel);
    expect(state.speedMs).toBeGreaterThanOrEqual(0);
  });

  it('does not turn while stationary', () => {
    const state = createVehicleState(0, 0, 0);
    const next = stepVehicle(state, { throttle: 0, steering: 1 }, 1);
    expect(next.headingRad).toBe(state.headingRad);
  });

  it('turns while moving forward', () => {
    let state = createVehicleState(0, 0, 0);
    state = stepVehicle(state, { throttle: 1, steering: 0 }, 1);
    const before = state.headingRad;
    state = stepVehicle(state, { throttle: 0, steering: 1 }, 1);
    expect(state.headingRad).toBeGreaterThan(before);
  });

  it('flips steering direction in reverse, like a real car', () => {
    let state = createVehicleState(0, 0, 0);
    state = stepVehicle(state, { throttle: -1, steering: 0 }, 1);
    expect(state.speedMs).toBeLessThan(0);
    const before = state.headingRad;
    state = stepVehicle(state, { throttle: 0, steering: 1 }, 1);
    expect(state.headingRad).toBeLessThan(before);
  });
});
