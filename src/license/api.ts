/**
 * Cliente fetch de la API de licencias (backend/public/api/, ver backend/README.md).
 * Asume que el backend PHP está expuesto en el mismo origen bajo /api/ — así es como
 * se documenta el despliegue en Freehostia (public_html/api/*.php).
 */

const API_BASE = '/api';

export interface CheckoutResponse {
  url: string;
  sessionId: string;
}

export async function requestCheckout(email: string): Promise<CheckoutResponse> {
  return postJson('checkout.php', { email }, 'No se pudo iniciar el pago');
}

export interface SessionStatusResponse {
  status: 'pending' | 'complete';
  licenseKey?: string;
}

export async function fetchSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${API_BASE}/session-status.php?session_id=${encodeURIComponent(sessionId)}`);
  return parseJsonOrThrow(res, 'No se pudo comprobar el estado del pago');
}

export interface ActivateResponse {
  activated: true;
  expiresAt: string;
}

export async function activateLicense(licenseKey: string, deviceId: string): Promise<ActivateResponse> {
  return postJson('activate.php', { licenseKey, deviceId }, 'No se pudo activar la licencia');
}

export interface ValidateResponse {
  valid: boolean;
  expiresAt: string | null;
}

export async function validateLicense(licenseKey: string, deviceId: string): Promise<ValidateResponse> {
  return postJson('validate.php', { licenseKey, deviceId }, 'No se pudo validar la licencia');
}

async function postJson<T>(path: string, body: unknown, fallbackMessage: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(res, fallbackMessage);
}

async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    throw new Error((await safeErrorMessage(res)) ?? fallbackMessage);
  }
  return res.json() as Promise<T>;
}

async function safeErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).error === 'string') {
      return (body as Record<string, unknown>).error as string;
    }
  } catch {
    // cuerpo no-JSON o vacío: se usa el mensaje por defecto del llamador.
  }
  return undefined;
}
