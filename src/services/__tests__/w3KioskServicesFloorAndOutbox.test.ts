import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';
import { PaymentOutboxManager } from '../paymentResilience';
import { HardwareAdapterFactory } from '../hardware/adapters/HardwareAdapterFactory';

describe('[W3-KSK-services] 지하층 보존·아웃박스 지점 격리·하드웨어 스캐너 리스너 해제 검증', () => {
  const storageMap = new Map<string, string>();
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    storageMap.clear();
    listeners.clear();
    const mockLocalStorage = {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', {
      location: {
        hostname: '127.0.0.1',
        port: '5179',
        origin: 'http://127.0.0.1:5179',
        protocol: 'http:',
      },
      navigator: { userAgent: 'Mozilla/5.0', platform: 'MacIntel', webdriver: true },
      localStorage: mockLocalStorage,
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent: () => true,
    });
  });

  afterEach(() => {
    HardwareAdapterFactory.clearInstances();
    vi.unstubAllGlobals();
  });

  it('api.getBays는 지하층(floor_no: -1, floor: "B1F") 데이터를 지상 1층으로 뭉개지 않고 보존한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/bays/')) {
          return {
            ok: true,
            json: async () => [
              { bay_no: 1, floor_no: -1, floor: 'B1', status: 'AVAILABLE' },
              { bay_no: 11, floor_no: 2, floor: '2층', status: 'AVAILABLE' },
            ],
          };
        }
        return { ok: true, json: async () => ({ status: 'ok' }) };
      })
    );

    const bays = await api.getBays();
    expect(bays).toHaveLength(2);
    expect(bays[0].floor_no).toBe(-1);
    expect(bays[0].floor).toBe('B1F');
    expect(bays[1].floor_no).toBe(2);
    expect(bays[1].floor).toBe('2F');
  });

  it('PaymentOutboxManager.removeByAuthCode는 동일 승인번호여도 다른 지점(storeCd)의 WAL을 침범하지 않는다', () => {
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_A',
      terminalId: 'TID_A',
      authCode: 'APPR1234',
      amount: 15000,
      purpose: 'ALLOCATE_BAY',
      endpoint: '/v1/kiosk/allocate-bay',
      payload: { bayNo: 1 },
    });
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_B',
      terminalId: 'TID_B',
      authCode: 'APPR1234',
      amount: 15000,
      purpose: 'ALLOCATE_BAY',
      endpoint: '/v1/kiosk/allocate-bay',
      payload: { bayNo: 2 },
    });

    PaymentOutboxManager.removeByAuthCode('APPR1234', 'STORE_A');
    const remaining = PaymentOutboxManager.getEntries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].storeCd).toBe('STORE_B');
  });

  it('HardwareAdapterFactory.clearInstances는 MockScannerAdapter의 전역 이벤트 리스너를 누수 없이 제거한다', () => {
    HardwareAdapterFactory.createScanner(() => ({
      bridgeHost: 'http://127.0.0.1',
      bridgePort: 18080,
      isMock: true,
      printMode: 'AUTO',
      drawerAutoOpen: false,
    }));
    expect(listeners.get('lm-kiosk-mock-barcode-scan')?.size).toBe(1);

    HardwareAdapterFactory.clearInstances();
    expect(listeners.get('lm-kiosk-mock-barcode-scan')?.size ?? 0).toBe(0);
  });
});
