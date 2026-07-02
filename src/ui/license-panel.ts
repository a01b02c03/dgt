import type { LicenseStatusView } from '../core/license';

export interface LicensePanelHandlers {
  onCheckout(email: string): void | Promise<void>;
  onActivate(licenseKey: string): void | Promise<void>;
}

export interface LicensePanel {
  render(view: LicenseStatusView): void;
  setMessage(message: string | null): void;
}

/**
 * Construye el panel de licencia una sola vez sobre los contenedores estáticos de
 * index.html (mismo patrón que buildHud en ui/hud.ts) y engancha los dos formularios
 * a los handlers recibidos — la decisión de qué hacer con el email/clave vive en
 * main.ts, aquí solo hay lectura de inputs y escritura DOM.
 */
export function buildLicensePanel(handlers: LicensePanelHandlers): LicensePanel {
  const statusEl = requireElement('license-status');
  const messageEl = requireElement('license-message');
  const checkoutForm = requireElement('license-checkout-form') as HTMLFormElement;
  const emailInput = requireElement('license-email-input') as HTMLInputElement;
  const activateForm = requireElement('license-activate-form') as HTMLFormElement;
  const keyInput = requireElement('license-key-input') as HTMLInputElement;

  checkoutForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handlers.onCheckout(emailInput.value.trim());
  });

  activateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handlers.onActivate(keyInput.value.trim());
  });

  return {
    render(view) {
      statusEl.textContent = view.label;
      statusEl.className = `license-status ${view.isPro ? 'license-status--pro' : 'license-status--free'}`;
      checkoutForm.hidden = view.isPro;
    },
    setMessage(message) {
      messageEl.textContent = message ?? '';
    },
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`License panel: elemento #${id} no encontrado en el DOM`);
  }
  return el;
}
