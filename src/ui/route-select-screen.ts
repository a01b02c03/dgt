import type { DriveMode } from '../core/drive-mode';
import type { RouteDefinition } from '../core/route-types';

export interface RouteSelectScreen {
  show(
    routes: RouteDefinition[],
    onSelect: (route: RouteDefinition, mode: DriveMode) => void,
    offerFreeDrive: boolean,
  ): void;
}

/**
 * Selector de ruta: solo se muestra cuando `main.ts` tiene más de una ruta
 * accesible para el usuario (hoy, un usuario con licencia Pro activa viendo
 * `ruta-01` + `ruta-02`) — un usuario gratuito con una sola ruta accesible
 * nunca ve esta pantalla, ver el bootstrap en main.ts. Mismo patrón que
 * `exam-result-screen.ts` (contenedor estático `hidden` en index.html,
 * `requireElement`, oculta el contenedor al elegir).
 *
 * Con `offerFreeDrive` (acceso Pro, ver core/drive-mode.ts) cada ruta ofrece
 * dos modos: 'exam' (el de siempre) y 'free' (circulación libre). Sin él,
 * un único botón que arranca directamente en 'exam' — hoy esa rama no se ve
 * en la práctica (el selector solo aparece con más de una ruta accesible, y
 * eso hoy implica acceso Pro), pero mantiene el gate de la feature en un
 * único sitio si algún día hay dos rutas gratuitas.
 */
export function buildRouteSelectScreen(): RouteSelectScreen {
  const containerEl = requireElement('route-select');
  const listEl = requireElement('route-select-list');

  return {
    show(routes, onSelect, offerFreeDrive) {
      listEl.innerHTML = '';
      routes.forEach((route) => {
        const li = document.createElement('li');
        li.className = 'route-select-item';

        const pick = (mode: DriveMode) => {
          containerEl.hidden = true;
          onSelect(route, mode);
        };

        const label = routeLabel(route);

        if (offerFreeDrive) {
          const name = document.createElement('span');
          name.className = 'route-select-name';
          name.textContent = label;

          const examButton = document.createElement('button');
          examButton.textContent = 'Examen';
          examButton.addEventListener('click', () => pick('exam'));

          const freeButton = document.createElement('button');
          freeButton.textContent = 'Circulación libre';
          freeButton.className = 'route-select-free';
          freeButton.addEventListener('click', () => pick('free'));

          li.append(name, examButton, freeButton);
        } else {
          const button = document.createElement('button');
          button.textContent = label;
          button.addEventListener('click', () => pick('exam'));
          li.appendChild(button);
        }

        listEl.appendChild(li);
      });

      containerEl.hidden = false;
    },
  };
}

/**
 * Etiqueta visible de una ruta: el número del id del código ('ruta-03' → 'Ruta 03')
 * delante del nombre, para que el usuario pueda referirse a la misma ruta que
 * los ids de `src/routes/`.
 */
function routeLabel(route: RouteDefinition): string {
  const num = route.id.replace(/^ruta-/, '');
  return `Ruta ${num} — ${route.name}`;
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Selector de ruta: elemento #${id} no encontrado en el DOM`);
  }
  return el;
}
