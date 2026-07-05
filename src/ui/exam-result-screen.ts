import type { ExamOutcome } from '../core/exam-result';
import type { ManeuverChecklistLabel } from '../core/hud';

export interface ExamResultScreen {
  show(outcome: ExamOutcome, maneuverLabels: ManeuverChecklistLabel[]): void;
}

const OUTCOME_BADGE_TEXT: Record<ExamOutcome, string> = {
  pass: 'Apto',
  fail: 'No apto',
};

/**
 * Pantalla final del examen: oculta por defecto (`hidden` en index.html),
 * se muestra una única vez que `main.ts` decide el veredicto agregado (ver
 * core/exam-result.ts). Reutiliza las clases `hud-maneuver*` de index.html
 * para listar el estado final de cada maniobra con el mismo lenguaje visual
 * que el checklist en vivo del HUD. `onRestart` lo aporta `main.ts` (hoy:
 * recargar la página, que devuelve al selector de ruta con acceso Pro o
 * directo a ruta-01 en gratuito) — la pantalla no decide qué significa
 * "volver a empezar".
 */
export function buildExamResultScreen(onRestart: () => void): ExamResultScreen {
  const containerEl = requireElement('exam-result');
  const badgeEl = requireElement('exam-result-badge');
  const listEl = requireElement('exam-result-maneuvers');
  requireElement('exam-result-restart').addEventListener('click', onRestart);

  return {
    show(outcome, maneuverLabels) {
      badgeEl.textContent = OUTCOME_BADGE_TEXT[outcome];
      badgeEl.className = `exam-result-badge exam-result-badge--${outcome}`;

      listEl.innerHTML = '';
      maneuverLabels.forEach((label) => {
        const li = document.createElement('li');
        li.className = `hud-maneuver hud-maneuver--${label.tone}`;

        const desc = document.createElement('span');
        desc.textContent = label.description;

        const badge = document.createElement('span');
        badge.className = 'hud-maneuver-badge';
        badge.textContent = label.badgeText;

        li.append(desc, badge);
        listEl.appendChild(li);
      });

      containerEl.hidden = false;
      // La lista scrollea (max-height en index.html) y un "No apto" puede
      // deberse a una maniobra que quede bajo el pliegue (p. ej. la última de
      // 9 en ruta-01): sin esto, el veredicto se ve pero su causa no. El
      // scroll debe hacerse con el contenedor ya visible (hidden = false
      // arriba), si no no hay layout sobre el que desplazarse.
      listEl.querySelector('.hud-maneuver--fail')?.scrollIntoView({ block: 'center' });
    },
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Pantalla de resultado: elemento #${id} no encontrado en el DOM`);
  }
  return el;
}
