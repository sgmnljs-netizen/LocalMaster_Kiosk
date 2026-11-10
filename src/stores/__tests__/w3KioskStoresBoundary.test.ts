import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getKioskSettings,
  hydrateKioskDeviceSettingsFromServer,
  sanitizeMinGapMinutes,
  saveKioskSettings,
} from '../kioskSettings';
import {
  getKioskHardwareHealth,
  normalizeDeviceHealthStatus,
  setKioskHardwareHealth,
} from '../useKioskHardwareHealthStore';

describe('W3-KSK-stores: kioskSettings storeCode 공백 트림·캐시 소거 및 서버 하이드레이션 레이스 가드', () => {
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

  it('sanitizeMinGapMinutes는 숫자형 문자열을 허용하고 [10, 1440] 범위로 안전 클램핑한다', () => {
    expect(sanitizeMinGapMinutes('45')).toBe(45);
    expect(sanitizeMinGapMinutes('9999')).toBe(1440);
    expect(sanitizeMinGapMinutes('5', 50)).toBe(50);
    expect(sanitizeMinGapMinutes(null, 5)).toBe(60);
  });

  it('saveKioskSettings는 storeCode 앞뒤 공백을 제거하고 타 지점 전환 시 로컬 도메인 캐시를 즉시 소거하되 결제 아웃박스는 보존한다', () => {
    saveKioskSettings({ storeCode: 'STORE_A' });
    mockLocalStorage.setItem('LM_BAYS', '[{"bay_no":1}]');
    mockLocalStorage.setItem('LM_PRODUCTS', '[{"prod_cd":"P1"}]');
    mockLocalStorage.setItem('LM_KIOSK_ZONES', '[{"zone_code":"Z1"}]');
    mockLocalStorage.setItem('LM_HOLD_RESERVATIONS', '[{"res_id":"H1"}]');
    mockLocalStorage.setItem('LM_RESERVATIONS', '[{"res_id":"R1"}]');
    mockLocalStorage.setItem('face_terminal_ip', '192.168.0.50');
    mockLocalStorage.setItem('LM_PAYMENT_OUTBOX', '[{"id":"WAL_1"}]');

    const switched = saveKioskSettings({ storeCode: '  STORE_B  ' });
    expect(switched.storeCode).toBe('STORE_B');
    expect(mockLocalStorage.getItem('LM_STORE_CD')).toBe('STORE_B');
    expect(mockLocalStorage.getItem('LM_BAYS')).toBeNull();
    expect(mockLocalStorage.getItem('LM_PRODUCTS')).toBeNull();
    expect(mockLocalStorage.getItem('LM_KIOSK_ZONES')).toBeNull();
    expect(mockLocalStorage.getItem('LM_HOLD_RESERVATIONS')).toBeNull();
    expect(mockLocalStorage.getItem('LM_RESERVATIONS')).toBeNull();
    expect(mockLocalStorage.getItem('face_terminal_ip')).toBeNull();
    expect(mockLocalStorage.getItem('LM_PAYMENT_OUTBOX')).toBe('[{"id":"WAL_1"}]');
  });

  it('hydrateKioskDeviceSettingsFromServer는 배열형 menuOverrides/authMethods 오염 입력을 무시한다', async () => {
    saveKioskSettings({ storeCode: 'STORE_ARR' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          has_saved_settings: true,
          settings: {
            menuOverrides: ['bad_array'],
            authMethods: ['bad_auth'],
          },
        }),
      }))
    );

    const hydrated = await hydrateKioskDeviceSettingsFromServer();
    expect(hydrated).not.toBeNull();
    expect(Array.isArray(hydrated?.menuOverrides)).toBe(false);
    expect(Array.isArray(hydrated?.authMethods)).toBe(false);
  });

  it('hydrateKioskDeviceSettingsFromServer 응답 대기 중 지점이 변경되면 구형 지점 설정 덮어쓰기를 차단한다', async () => {
    saveKioskSettings({ storeCode: 'STORE_A', terminalId: 'TID-INIT' });

    let resolveFetch!: (val: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    const hydratePromise = hydrateKioskDeviceSettingsFromServer();

    // 인플라이트 도중 관리자가 STORE_B로 지점 변경
    saveKioskSettings({ storeCode: 'STORE_B', terminalId: 'TID-STORE-B' });

    resolveFetch({
      ok: true,
      json: async () => ({
        has_saved_settings: true,
        settings: {
          terminalId: 'STALE-TID-STORE-A',
          minGapMinutes: '30',
        },
      }),
    });

    const hydrated = await hydratePromise;
    expect(hydrated).toBeNull();
    expect(getKioskSettings().storeCode).toBe('STORE_B');
    expect(getKioskSettings().terminalId).toBe('TID-STORE-B');
  });

  it('setKioskHardwareHealth 직접 호출 시에도 vcatStatus·printerStatus 열거형과 lastCheckedAt NaN/소수점을 정규화한다', () => {
    expect(normalizeDeviceHealthStatus(' offline ')).toBe('OFFLINE');
    expect(normalizeDeviceHealthStatus(' checking ')).toBe('CHECKING');
    expect(normalizeDeviceHealthStatus('CORRUPTED_STATE', 'ONLINE')).toBe('ONLINE');

    setKioskHardwareHealth({
      vcatStatus: ' offline ' as 'OFFLINE',
      printerStatus: 'INVALID_STATUS' as 'ONLINE',
      lastCheckedAt: Number.NaN,
    });
    const state = getKioskHardwareHealth();
    expect(state.vcatStatus).toBe('OFFLINE');
    expect(state.printerStatus).toBe('ONLINE');
    expect(Number.isFinite(state.lastCheckedAt)).toBe(true);
    expect((state.lastCheckedAt ?? 0) > 0).toBe(true);
  });
});
