import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapLocalKioskSettings,
  getKioskSettings,
  hydrateKioskDeviceSettingsFromServer,
  saveKioskSettings,
} from '../kioskSettings';
import {
  getKioskHardwareHealth,
  setKioskHardwareHealth,
} from '../useKioskHardwareHealthStore';

describe('Wave 3 (20261115) Kiosk Stores Boundary Audit', () => {
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
      location: {
        hostname: '127.0.0.1',
        port: '5179',
        origin: 'http://127.0.0.1:5179',
        protocol: 'http:',
      },
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveKioskSettings: 오염된 bayNumberOrder/defaultAuthMode/topDashboardMode 입력 시 기존 유효 설정을 보존한다', () => {
    saveKioskSettings(
      {
        storeCode: 'S0531',
        bayNumberOrder: 'DESC',
        defaultAuthMode: 'PHONE_KEYPAD',
        topDashboardMode: 'COMPACT_1ROW',
      },
      { syncRemote: false }
    );

    const afterCorrupt = saveKioskSettings(
      {
        bayNumberOrder: '' as unknown as 'ASC',
        defaultAuthMode: 'INVALID_MODE' as unknown as 'SMART_TAG',
        topDashboardMode: 'BROKEN' as unknown as 'AUTO',
      },
      { syncRemote: false }
    );

    expect(afterCorrupt.bayNumberOrder).toBe('DESC');
    expect(afterCorrupt.defaultAuthMode).toBe('PHONE_KEYPAD');
    expect(afterCorrupt.topDashboardMode).toBe('COMPACT_1ROW');
  });

  it('hydrateKioskDeviceSettingsFromServer & bootstrapLocalKioskSettings: 서버 bay_number_order를 정합 동기화한다', async () => {
    saveKioskSettings({ storeCode: 'S0531', bayNumberOrder: 'ASC' }, { syncRemote: false });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          has_saved_settings: true,
          settings: {
            bay_number_order: 'desc',
            qr_coupon_only_mode: false,
          },
        }),
      }))
    );

    const hydrated = await hydrateKioskDeviceSettingsFromServer();
    expect(hydrated?.bayNumberOrder).toBe('DESC');
    expect(hydrated?.qrCouponOnlyMode).toBe(false);
    expect(getKioskSettings().bayNumberOrder).toBe('DESC');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          store_cd: 'S0531',
          device_key: 'DEV-KEY-1',
          bayNumberOrder: 'ASC',
        }),
      }))
    );

    const bootstrapped = await bootstrapLocalKioskSettings({ force: true });
    expect(bootstrapped?.bayNumberOrder).toBe('ASC');
  });

  it('setKioskHardwareHealth: 비문자열 에러 객체 입력 시 문자열로 안전 정규화하여 React 렌더링 크래시를 차단한다', () => {
    setKioskHardwareHealth({
      vcatStatus: 'OFFLINE',
      vcatErrorMessage: { message: 'VCAT 포트 응답 없음' } as unknown as string,
      printerErrorMessage: 503 as unknown as string,
    });
    const health = getKioskHardwareHealth();
    expect(typeof health.vcatErrorMessage).toBe('string');
    expect(health.vcatErrorMessage).toBe('VCAT 포트 응답 없음');
    expect(health.printerErrorMessage).toBe('503');
  });
});
