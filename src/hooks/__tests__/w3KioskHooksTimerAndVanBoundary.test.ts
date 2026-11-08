import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeVanTimeoutSeconds } from '../useKioskVanPayment';
import { probeKioskHardwareHealthOnce } from '../useKioskHardwareHeartbeat';
import { saveKioskSettings } from '../../stores/kioskSettings';

describe('W3-KSK-hooks: VAN 승인 타임아웃 경계 정규화 및 브릿지 헬스 공백 상태코드 방어', () => {
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
      navigator: {
        userAgent: 'Mozilla/5.0',
        platform: 'MacIntel',
        webdriver: true,
      },
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizeVanTimeoutSeconds는 음수·0·1 미만·NaN·Infinity·불리언을 기본값으로 치환하고 [1, 180] 정수로 클램핑한다', () => {
    expect(sanitizeVanTimeoutSeconds(-5, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(0, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(0.4, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(Number.NaN, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(Number.POSITIVE_INFINITY, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(true, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(2, 30)).toBe(2);
    expect(sanitizeVanTimeoutSeconds(12.9, 30)).toBe(12);
    expect(sanitizeVanTimeoutSeconds('45', 30)).toBe(45);
    expect(sanitizeVanTimeoutSeconds(999, 30)).toBe(180);
  });

  it('probeKioskHardwareHealthOnce는 브릿지/VCAT 응답의 앞뒤 공백(" online ")을 ONLINE으로 정상 판별하고 " offline "은 OFFLINE으로 감지한다', async () => {
    saveKioskSettings({
      storeCode: 'S-HOOK-TRIM',
      providerType: 'KCP_VAN',
      vcatPort: '9099',
    });

    let callIdx = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callIdx += 1;
        if (callIdx === 1) {
          return {
            ok: true,
            json: async () => ({ status: ' online ' }),
          };
        }
        return {
          ok: true,
          json: async () => ({ status: ' online ', printer_status: ' online ' }),
        };
      })
    );

    const onlineResult = await probeKioskHardwareHealthOnce();
    expect(onlineResult.nextVcat).toBe('ONLINE');
    expect(onlineResult.nextPrinter).toBe('ONLINE');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).includes('/vcat/status')) {
          return {
            ok: true,
            json: async () => ({ status: ' offline ', message: '  단말기 미연결  ' }),
          };
        }
        return {
          ok: true,
          json: async () => ({ status: ' degraded ', printer_status: ' online ' }),
        };
      })
    );

    const offlineResult = await probeKioskHardwareHealthOnce();
    expect(offlineResult.nextVcat).toBe('OFFLINE');
    expect(offlineResult.nextVcatReason).toBe('단말기 미연결');
    expect(offlineResult.nextPrinter).toBe('OFFLINE');
  });
});
