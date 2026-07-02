import type { LicenseState } from '../core/license';

const DEVICE_ID_KEY = 'drive-test:device-id';
const LICENSE_KEY = 'drive-test:license';

/** Identificador estable del dispositivo, generado una vez y reutilizado (no es DRM real, ver backend/README.md). */
export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function readStoredLicense(): LicenseState | null {
  const raw = localStorage.getItem(LICENSE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLicenseState(parsed)) {
      return parsed;
    }
  } catch {
    // JSON corrupto o de un formato antiguo: se trata como "sin licencia guardada".
  }
  return null;
}

export function writeStoredLicense(state: LicenseState): void {
  localStorage.setItem(LICENSE_KEY, JSON.stringify(state));
}

function isLicenseState(value: unknown): value is LicenseState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.licenseKey === 'string' &&
    typeof candidate.deviceId === 'string' &&
    typeof candidate.expiresAt === 'string'
  );
}
