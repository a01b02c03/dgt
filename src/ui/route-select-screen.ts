import type { RouteDefinition } from '../core/route-types';

export interface RouteSelectScreen {
  show(routes: RouteDefinition[], onSelect: (route: RouteDefinition) => void): void;
}

/**
 * Selector de ruta: solo se muestra cuando `main.ts` tiene más de una ruta
 * accesible para el usuario (hoy, un usuario con licencia Pro activa viendo
 * `ruta-01` + `ruta-02`) — un usuario gratuito con una sola ruta accesible
 * nunca ve esta pantalla, ver el bootstrap en main.ts. Mismo patrón que
 * `exam-result-screen.ts` (contenedor estático `hidden` en index.html,
 * `requireElement`, oculta el contenedor al elegir).
 */
export function buildRouteSelectScreen(): RouteSelectScreen {
  const containerEl = requireElement('route-select');
  const listEl = requireElement('route-select-list');

  return {
    show(routes, onSelect) {
      listEl.innerHTML = '';
      routes.forEach((route) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.textContent = route.name;
        button.addEventListener('click', () => {
          containerEl.hidden = true;
          onSelect(route);
        });
        li.appendChild(button);
        listEl.appendChild(li);
      });

      containerEl.hidden = false;
    },
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Selector de ruta: elemento #${id} no encontrado en el DOM`);
  }
  return el;
}
