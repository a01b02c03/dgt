/** Estado de una licencia Pro tal como se guarda localmente y se recibe del backend. */
export interface LicenseState {
  licenseKey: string;
  deviceId: string;
  /** ISO 8601, como lo devuelven activate.php/validate.php. */
  expiresAt: string;
}

/** Activa si hay estado y su fecha de caducidad todavía no ha pasado. */
export function isLicenseActive(state: LicenseState | null, nowMs: number): boolean {
  if (!state) {
    return false;
  }
  const expiresAtMs = Date.parse(state.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

export interface LicenseStatusView {
  label: string;
  isPro: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Vista derivada del estado de licencia para license-panel.ts (mismo patrón que
 * maneuverChecklistLabel en hud.ts: la derivación vive aquí, la escritura DOM no
 * decide nada por su cuenta).
 */
export function licenseStatusView(state: LicenseState | null, nowMs: number): LicenseStatusView {
  if (!isLicenseActive(state, nowMs)) {
    return { label: 'Versión gratuita', isPro: false };
  }

  const daysLeft = Math.max(1, Math.ceil((Date.parse(state!.expiresAt) - nowMs) / MS_PER_DAY));
  const unit = daysLeft === 1 ? 'día' : 'días';
  return { label: `Pro — caduca en ${daysLeft} ${unit}`, isPro: true };
}
