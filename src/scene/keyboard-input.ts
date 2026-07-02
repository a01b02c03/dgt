import type { DrivingInput } from './vehicle-controller';

/** Flechas o WASD. Devuelve una función a llamar cada frame para leer el estado actual. */
export function attachKeyboardInput(target: Window = window): () => DrivingInput {
  const pressed = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    pressed.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.key);
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return () => ({
    throttle:
      (pressed.has('ArrowUp') || pressed.has('w') || pressed.has('W') ? 1 : 0) -
      (pressed.has('ArrowDown') || pressed.has('s') || pressed.has('S') ? 1 : 0),
    steering:
      (pressed.has('ArrowRight') || pressed.has('d') || pressed.has('D') ? 1 : 0) -
      (pressed.has('ArrowLeft') || pressed.has('a') || pressed.has('A') ? 1 : 0),
  });
}
