import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearKioskAdminSession,
  getKioskAdminSessionToken,
  getKioskSettings,
  normalizeDefaultAuthMode,
  normalizeTopDashboardMode,
  saveKioskSettings,
  setKioskAdminSessionToken,
} from '../kioskSettings';
import {
  getKioskHardwareHealth,
  setLastCheckedAt,
} from '../useKioskHardwareHealthStore';

describe('W3-KSK-stores: 인증모드·현황판모드 열거형 자가치유, 세션 토큰 공백 가드 및 헬스 타임스탬프 방어', () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    clearKioskAdminSession();
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
    clearKioskAdminSession();
    vi.unstubAllGlobals();
  });

  it('localStorage에 오염된 defaultAuthMode·topDashboardMode가 저장되어 있어도 안전하게 표준 열거형으로 자가치유한다', () => {
    expect(normalizeDefaultAuthMode(' face ')).toBe('FACE');
    expect(normalizeDefaultAuthMode('CORRUPTED_MODE', 'PHONE_KEYPAD')).toBe('PHONE_KEYPAD');
    expect(normalizeTopDashboardMode(' hidden ')).toBe('HIDDEN');
    expect(normalizeTopDashboardMode('UNKNOWN_LAYOUT', 'COMPACT_1ROW')).toBe('COMPACT_1ROW');

    mockLocalStorage.setItem(
      'lm-kiosk-settings',
      JSON.stringify({
        storeCode: 'S-NORM',
        defaultAuthMode: 'BROKEN_AUTH_TAB',
        topDashboardMode: 'BROKEN_DASHBOARD',
      })
    );

    const loaded = getKioskSettings();
    expect(loaded.defaultAuthMode).toBe('SMART_TAG');
    expect(loaded.topDashboardMode).toBe('AUTO');

    const saved = saveKioskSettings({
      defaultAuthMode: ' phone_keypad ' as 'PHONE_KEYPAD',
      topDashboardMode: ' compact_1row ' as 'COMPACT_1ROW',
    });
    expect(saved.defaultAuthMode).toBe('PHONE_KEYPAD');
    expect(saved.topDashboardMode).toBe('COMPACT_1ROW');
  });

  it('setKioskAdminSessionToken은 공백 전용 토큰을 null로 차단하고 유효 토큰은 앞뒤 공백을 제거한다', () => {
    setKioskAdminSessionToken('   ', 'abcd');
    expect(getKioskAdminSessionToken()).toBeNull();

    setKioskAdminSessionToken('  tok-admin-123  ', ' 1234 ');
    expect(getKioskAdminSessionToken()).toBe('tok-admin-123');
  });

  it('setLastCheckedAt은 NaN·음수·0 타임스탬프 유입 시 현재 시각(양의 정수)으로 방어한다', () => {
    setLastCheckedAt(Number.NaN);
    const afterNan = getKioskHardwareHealth().lastCheckedAt;
    expect(typeof afterNan).toBe('number');
    expect(Number.isFinite(afterNan)).toBe(true);
    expect((afterNan ?? 0) > 0).toBe(true);

    setLastCheckedAt(-100);
    const afterNeg = getKioskHardwareHealth().lastCheckedAt;
    expect((afterNeg ?? 0) > 0).toBe(true);

    setLastCheckedAt(1700000123456.8);
    expect(getKioskHardwareHealth().lastCheckedAt).toBe(1700000123456);
  });
});
