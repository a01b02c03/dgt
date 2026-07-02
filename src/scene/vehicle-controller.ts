export interface DrivingInput {
  /** -1 (freno/marcha atrás) .. 1 (acelerar) */
  throttle: number;
  /** -1 (izquierda) .. 1 (derecha) */
  steering: number;
}

export interface VehicleState {
  x: number;
  z: number;
  headingRad: number;
  speedMs: number;
}

const MAX_SPEED_MS = 13.9; // ~50 km/h, el límite habitual del tramo de ruta-01
const MAX_REVERSE_SPEED_MS = 4;
const ACCEL_MS2 = 3;
const BRAKE_DECEL_MS2 = 6;
const FRICTION_DECEL_MS2 = 2;
const MAX_TURN_RATE_RAD_S = 1.2;

export function createVehicleState(x: number, z: number, headingRad: number): VehicleState {
  return { x, z, headingRad, speedMs: 0 };
}

/**
 * Modelo cinemático simple (no motor de físicas real): el volante gira el rumbo
 * proporcionalmente mientras el vehículo se mueve, y no gira si está parado.
 */
export function stepVehicle(state: VehicleState, input: DrivingInput, dtSeconds: number): VehicleState {
  let speedMs = state.speedMs;
  if (input.throttle !== 0) {
    const accel = input.throttle > 0 ? ACCEL_MS2 : BRAKE_DECEL_MS2;
    speedMs += input.throttle * accel * dtSeconds;
  } else if (speedMs !== 0) {
    const decel = FRICTION_DECEL_MS2 * dtSeconds;
    speedMs = Math.sign(speedMs) * Math.max(0, Math.abs(speedMs) - decel);
  }
  speedMs = clamp(speedMs, -MAX_REVERSE_SPEED_MS, MAX_SPEED_MS);

  let headingRad = state.headingRad;
  if (Math.abs(speedMs) > 0.05) {
    headingRad += input.steering * MAX_TURN_RATE_RAD_S * dtSeconds * Math.sign(speedMs);
  }

  const x = state.x + Math.sin(headingRad) * speedMs * dtSeconds;
  const z = state.z + Math.cos(headingRad) * speedMs * dtSeconds;

  return { x, z, headingRad, speedMs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
