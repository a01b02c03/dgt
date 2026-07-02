import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAFFIC_LIGHT_CYCLE, getTrafficLightPhase, trafficLightPhaseOffsetS } from './traffic-light';

// DEFAULT_TRAFFIC_LIGHT_CYCLE: green=6, amber=3, red=8, total=17.

describe('trafficLightPhaseOffsetS', () => {
  it('is deterministic for the same waypoint index', () => {
    expect(trafficLightPhaseOffsetS(4)).toBe(trafficLightPhaseOffsetS(4));
  });

  it('stays within [0, totalCycleS)', () => {
    for (let index = 0; index < 20; index++) {
      const offset = trafficLightPhaseOffsetS(index);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(17);
    }
  });

  it('respects a custom cycle config', () => {
    const cycle = { greenDurationS: 1, amberDurationS: 1, redDurationS: 1 };
    expect(trafficLightPhaseOffsetS(3, cycle)).toBe((3 * 5) % 3);
  });
});

describe('getTrafficLightPhase', () => {
  it('is green at the start of an unoffset cycle (waypoint index 0)', () => {
    expect(getTrafficLightPhase(0, 0)).toBe('green');
    expect(getTrafficLightPhase(5.999, 0)).toBe('green');
  });

  it('switches to amber exactly at the green/amber boundary', () => {
    expect(getTrafficLightPhase(6, 0)).toBe('amber');
    expect(getTrafficLightPhase(8.999, 0)).toBe('amber');
  });

  it('switches to red exactly at the amber/red boundary', () => {
    expect(getTrafficLightPhase(9, 0)).toBe('red');
    expect(getTrafficLightPhase(16.999, 0)).toBe('red');
  });

  it('wraps back to green after a full cycle', () => {
    expect(getTrafficLightPhase(17, 0)).toBe('green');
    expect(getTrafficLightPhase(17 * 3 + 2, 0)).toBe('green');
  });

  it('desyncs different waypoint indices at the same instant', () => {
    expect(getTrafficLightPhase(0, 0)).toBe('green');
    expect(getTrafficLightPhase(0, 3)).toBe('red');
    expect(getTrafficLightPhase(0, 4)).toBe('green');
    expect(getTrafficLightPhase(0, 5)).toBe('amber');
    expect(getTrafficLightPhase(0, 6)).toBe('red');
  });

  it('handles large elapsed times without NaN or drift', () => {
    const phase = getTrafficLightPhase(17 * 1000 + 6, 0);
    expect(phase).toBe('amber');
  });

  it('honors a custom cycle config instead of the default', () => {
    const cycle = { greenDurationS: 2, amberDurationS: 1, redDurationS: 1 };
    expect(getTrafficLightPhase(0, 0, cycle)).toBe('green');
    expect(getTrafficLightPhase(2, 0, cycle)).toBe('amber');
    expect(getTrafficLightPhase(3, 0, cycle)).toBe('red');
    expect(getTrafficLightPhase(4, 0, cycle)).toBe('green');
  });

  it('uses the exported default cycle constant for the total duration used above', () => {
    const total =
      DEFAULT_TRAFFIC_LIGHT_CYCLE.greenDurationS +
      DEFAULT_TRAFFIC_LIGHT_CYCLE.amberDurationS +
      DEFAULT_TRAFFIC_LIGHT_CYCLE.redDurationS;
    expect(total).toBe(17);
  });
});
