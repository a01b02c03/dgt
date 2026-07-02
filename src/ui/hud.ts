import type { ManeuverChecklistLabel } from '../core/hud';
import type { Maneuver } from '../core/route-types';

export interface Hud {
  setSpeed(speedKmh: number, speedLimitKmh: number): void;
  setManeuverState(index: number, label: ManeuverChecklistLabel): void;
}

/**
 * Construye el checklist de maniobras una sola vez (un <li> por maniobra) sobre los
 * contenedores estáticos de index.html; el resto del ciclo de vida son solo escrituras DOM.
 */
export function buildHud(maneuvers: Maneuver[]): Hud {
  const speedValueEl = requireElement('hud-speed-value');
  const speedLimitEl = requireElement('hud-speed-limit');
  const listEl = requireElement('hud-maneuvers');

  const items = maneuvers.map((maneuver) => {
    const li = document.createElement('li');
    li.className = 'hud-maneuver hud-maneuver--pending';

    const desc = document.createElement('span');
    desc.className = 'hud-maneuver-desc';
    desc.textContent = maneuver.description;

    const badge = document.createElement('span');
    badge.className = 'hud-maneuver-badge';

    li.append(desc, badge);
    listEl.appendChild(li);
    return { li, badge };
  });

  return {
    setSpeed(speedKmh, speedLimitKmh) {
      speedValueEl.textContent = String(speedKmh);
      speedLimitEl.textContent = `Límite: ${speedLimitKmh} km/h`;
    },
    setManeuverState(index, label) {
      const item = items[index];
      if (!item) {
        return;
      }
      item.li.className = `hud-maneuver hud-maneuver--${label.tone}`;
      item.badge.textContent = label.badgeText;
    },
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`HUD: elemento #${id} no encontrado en el DOM`);
  }
  return el;
}
