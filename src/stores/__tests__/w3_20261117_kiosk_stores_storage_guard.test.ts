import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKioskSettings, saveKioskSettings } from '../kioskSettings';

describe('Wave 3 (20261117) Kiosk Stores Storage Quota & Boolean Sanitization Audit', () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', port: '5179', origin: 'http://127.0.0.1:5179', protocol: 'http:' },
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getKioskSettings: 손상된 문자열 "false" 플래그를 엄격한 boolean 기본값으로 정규화한다', () => {
    storageMap.set(
      'lm-kiosk-settings',
      JSON.stringify({
        storeCode: 'S001',
        isMaintenanceMode: 'false',
        hasCustomAdminPin: 'false',
        qrCouponOnlyMode: 'false',
      })
    );

    const s = getKioskSettings();
    expect(s.isMaintenanceMode).toBe(false);
    expect(s.hasCustomAdminPin).toBeUndefined();
    expect(s.qrCouponOnlyMode).toBe(true);
  });

  it('saveKioskSettings: localStorage QuotaExceededError 발생 시 크래시 없이 정규화된 설정 객체를 반환한다', () => {
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    const saved = saveKioskSettings({ storeCode: '  S999  ', isMaintenanceMode: false }, { syncRemote: false });
    expect(saved.storeCode).toBe('S999');
    expect(saved.isMaintenanceMode).toBe(false);
  });
});
