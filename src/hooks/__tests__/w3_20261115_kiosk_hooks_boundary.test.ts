import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeVanPort } from '../useKioskVanPayment';
import { probeKioskHardwareHealthOnce } from '../useKioskHardwareHeartbeat';
import { saveKioskSettings } from '../../stores/kioskSettings';

describe('Wave 3 (20261115) Kiosk Hooks Boundary Audit', () => {
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

  it('sanitizeVanPort: 부분 접미어 오염("80http", "9099.5")은 차단하고 호스트:포트("127.0.0.1:8090")는 정확히 포트를 추출한다', () => {
    expect(sanitizeVanPort('80http', 9099)).toBe(9099);
    expect(sanitizeVanPort('9099.5', 8088)).toBe(8088);
    expect(sanitizeVanPort(9099.5, 8088)).toBe(8088);
    expect(sanitizeVanPort(true, 9099)).toBe(9099);
    expect(sanitizeVanPort('127.0.0.1:8090', 9099)).toBe(8090);
    expect(sanitizeVanPort('http://localhost:8088/', 9099)).toBe(8088);
    expect(sanitizeVanPort(':8089', 9099)).toBe(8089);
    expect(sanitizeVanPort('127.0.0.1:99999', 9099)).toBe(9099);
  });

  it('probeKioskHardwareHealthOnce: VCAT ERROR/DISCONNECTED 응답 시 OFFLINE 및 사유를 감지하고 호스트:포트 입력도 정상 연결한다', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const urlStr = String(input);
        requestedUrls.push(urlStr);
        if (urlStr.includes('/vcat/status')) {
          return {
            ok: true,
            json: async () => ({ status: 'DISCONNECTED', message: '리더기 USB 분리됨' }),
          };
        }
        return {
          ok: true,
          json: async () => ({ status: 'ONLINE', printer_status: 'ONLINE' }),
        };
      })
    );

    saveKioskSettings(
      {
        storeCode: 'S-HOOK-20261115',
        providerType: 'KCP_VAN',
        vcatPort: '127.0.0.1:8090',
      },
      { syncRemote: false }
    );

    const res = await probeKioskHardwareHealthOnce();
    expect(requestedUrls[0]).toBe('http://127.0.0.1:8090/vcat/status');
    expect(res.nextVcat).toBe('OFFLINE');
    expect(res.nextVcatReason).toBe('리더기 USB 분리됨');
    expect(res.nextPrinter).toBe('ONLINE');
  });
});
