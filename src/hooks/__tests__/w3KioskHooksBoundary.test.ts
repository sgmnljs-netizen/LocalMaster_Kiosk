import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeVanPort } from '../useKioskVanPayment';
import { probeKioskHardwareHealthOnce } from '../useKioskHardwareHeartbeat';
import { saveKioskSettings } from '../../stores/kioskSettings';
import { sanitizeScannerOptions, resolveScannerChar } from '../../services/hardware/hooks/useHardwareScanner';

describe('W3-KSK-hooks: VAN 포트 범위(1..65535) 정규화 및 하드웨어 헬스 프로브 방어', () => {
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

  it('sanitizeVanPort는 음수·0·65536 이상·문자열 오타를 안전하게 기본 포트로 폴백한다', () => {
    expect(sanitizeVanPort('9099')).toBe(9099);
    expect(sanitizeVanPort(' 8088 ', 9099)).toBe(8088);
    expect(sanitizeVanPort('-1', 8088)).toBe(8088);
    expect(sanitizeVanPort('0', 8089)).toBe(8089);
    expect(sanitizeVanPort('70000', 9099)).toBe(9099);
    expect(sanitizeVanPort('invalid', 9099)).toBe(9099);
    expect(sanitizeVanPort(null, 99999)).toBe(9099);
  });

  it('probeKioskHardwareHealthOnce는 vcatPort가 "-50" 또는 "99999"여도 VAN사 기본 포트로 정상 핑을 전송한다', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        requestedUrls.push(String(input));
        return {
          ok: true,
          json: async () => ({ status: 'ONLINE', printer_status: 'ONLINE' }),
        };
      })
    );

    saveKioskSettings({
      storeCode: 'S-HOOK',
      providerType: 'NICE_VAN',
      vcatPort: '-50',
    });

    const result = await probeKioskHardwareHealthOnce();
    expect(result.nextVcat).toBe('ONLINE');
    expect(result.nextPrinter).toBe('ONLINE');
    expect(requestedUrls[0]).toBe('http://127.0.0.1:8088/nice/status');
  });

  it('sanitizeScannerOptions는 NaN/0/음수 스캐너 임계치를 안전한 기본값(3자, 50ms)으로 정규화하고 IME 키코드를 복원한다', () => {
    expect(sanitizeScannerOptions(Number.NaN, -10)).toEqual({ safeMinLen: 3, safeMaxInterval: 50 });
    expect(sanitizeScannerOptions(0, 0)).toEqual({ safeMinLen: 3, safeMaxInterval: 50 });
    expect(sanitizeScannerOptions(5.9, 35)).toEqual({ safeMinLen: 5, safeMaxInterval: 35 });

    const imeEvent = {
      key: 'ㅁ',
      code: 'KeyA',
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
      keyCode: 65,
    } as unknown as KeyboardEvent;
    expect(resolveScannerChar(imeEvent, false)).toBe('A');
  });
});
