/**
 * Modo de conducción de una sesión (ver el bootstrap de main.ts):
 * - 'exam': el modo de siempre — maniobras evaluadas pass/fail, checklist en
 *   el HUD y veredicto agregado apto/no apto al final (core/exam-result.ts).
 * - 'free': circulación libre, la feature Pro de conducir la ruta sin examen.
 *   El mundo simulado completo se mantiene (tráfico de IA, semáforos con su
 *   fase, peatones, colisiones físicas, límites de calzada) porque es parte
 *   de la conducción, no de la evaluación; lo que se desactiva es solo la
 *   capa de examen: evaluadores de maniobra, checklist, marcadores de
 *   maniobra y pantalla de resultado.
 *
 * Solo se ofrece elegir modo en el selector de ruta, y solo a usuarios con
 * acceso Pro (ver buildRouteSelectScreen) — un usuario gratuito entra
 * directo a su única ruta en modo 'exam', sin selector, igual que siempre.
 */
export type DriveMode = 'exam' | 'free';
