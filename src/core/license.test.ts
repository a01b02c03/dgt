import { describe, expect, it } from 'vitest';
import { isLicenseActive, licenseStatusView } from './license';
import type { LicenseState } from './license';

const NOW = Date.parse('2026-07-02T12:00:00Z');

function license(expiresAt: string): LicenseState {
  return { licenseKey: 'AAAA-BBBB-CCCC-DDDD', deviceId: 'device-1', expiresAt };
}

describe('isLicenseActive', () => {
  it('is false when there is no license', () => {
    expect(isLicenseActive(null, NOW)).toBe(false);
  });

  it('is true when expiresAt is in the future', () => {
    expect(isLicenseActive(license('2026-08-01T12:00:00Z'), NOW)).toBe(true);
  });

  it('is false when expiresAt already passed', () => {
    expect(isLicenseActive(license('2026-06-01T12:00:00Z'), NOW)).toBe(false);
  });

  it('is false exactly at the expiry instant', () => {
    expect(isLicenseActive(license('2026-07-02T12:00:00Z'), NOW)).toBe(false);
  });

  it('is false when expiresAt is not a parseable date', () => {
    expect(isLicenseActive(license('not-a-date'), NOW)).toBe(false);
  });
});

describe('licenseStatusView', () => {
  it('shows the free label when there is no active license', () => {
    expect(licenseStatusView(null, NOW)).toEqual({ label: 'Versión gratuita', isPro: false });
  });

  it('shows days left, rounded up, for an active license', () => {
    // 30 días exactos desde NOW
    const view = licenseStatusView(license('2026-08-01T12:00:00Z'), NOW);
    expect(view.isPro).toBe(true);
    expect(view.label).toBe('Pro — caduca en 30 días');
  });

  it('uses singular "día" when exactly one day is left', () => {
    const view = licenseStatusView(license('2026-07-03T12:00:00Z'), NOW);
    expect(view.label).toBe('Pro — caduca en 1 día');
  });

  it('rounds up partial days so it never shows 0 días left while still active', () => {
    const view = licenseStatusView(license('2026-07-02T13:00:00Z'), NOW);
    expect(view.label).toBe('Pro — caduca en 1 día');
  });
});
