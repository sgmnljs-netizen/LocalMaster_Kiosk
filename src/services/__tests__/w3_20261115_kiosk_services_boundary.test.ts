import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, safeParseStorageArray } from '../api';
import { PaymentOutboxManager, PAYMENT_RESILIENCE_CONFIG } from '../paymentResilience';
import { getKioskSettings, saveKioskSettings } from '../../stores/kioskSettings';

describe('Wave 3 (20261115) Kiosk Services & PaymentOutbox Boundary Audit', () => {
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
        pathname: '/',
        search: '',
      },
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PaymentOutboxManager: NaN/소수점 금액 정규화 및 큐 포화(100건 초과) 시 PENDING_DLQ(고아결제) 보존 보장', () => {
    const dlqKey = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S0531',
      terminalId: 'TID-01',
      authCode: 'APPR-CRITICAL-01',
      amount: 25000.9,
      payload: { reason: '단말기 미응답' },
    });
    expect(dlqKey).toBe('DLQ_S0531_APPR-CRITICAL-01_25000');

    const nanWalId = PaymentOutboxManager.recordWalInFlight({
      storeCd: 'S0531',
      terminalId: 'TID-01',
      authCode: 'APPR-NAN',
      amount: Number.NaN,
      payload: {},
    });
    expect(nanWalId).toBe('WAL_S0531_APPR-NAN');
    const nanEntry = PaymentOutboxManager.getEntries().find((e) => e.id === nanWalId);
    expect(nanEntry?.amount).toBe(0);

    // 105건의 WAL_IN_FLIGHT가 추가 유입되어도 기존 PENDING_DLQ는 절대 축출되지 않는다
    for (let i = 0; i < PAYMENT_RESILIENCE_CONFIG.MAX_OUTBOX_ITEMS + 5; i += 1) {
      PaymentOutboxManager.recordWalInFlight({
        storeCd: 'S0531',
        terminalId: 'TID-01',
        authCode: `APPR-WAL-${i}`,
        amount: 10000,
        payload: {},
      });
    }

    const entries = PaymentOutboxManager.getEntries();
    expect(entries.length).toBe(PAYMENT_RESILIENCE_CONFIG.MAX_OUTBOX_ITEMS);
    expect(entries.some((e) => e.id === dlqKey && e.kind === 'PENDING_DLQ')).toBe(true);
  });

  it('api.getStoreInfo: 최상위 bay_number_order 및 배열/손상 meta_data 방어 + kioskSettings 자동 동기화', async () => {
    saveKioskSettings({ storeCode: 'S0531', bayNumberOrder: 'ASC' }, { syncRemote: false });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const urlStr = String(input);
        if (urlStr.includes('/health')) {
          return { ok: true, json: async () => ({ status: 'ok' }) };
        }
        return {
          ok: true,
          json: async () => ({
            store_cd: 'S0531',
            store_nm: '군산대학교 아카데미',
            bay_number_order: 'desc',
            meta_data: '[1, 2, 3]',
          }),
        };
      })
    );

    const info = await api.getStoreInfo();
    expect(info.store_nm).toBe('군산대학교 아카데미');
    expect(info.bay_number_order).toBe('DESC');
    expect(getKioskSettings().bayNumberOrder).toBe('DESC');
  });

  it('safeParseStorageArray: LM_BAYS가 손상 JSON 또는 비배열("null", "{}")일 때 예외 없이 빈 배열을 반환한다', () => {
    mockLocalStorage.setItem('LM_BAYS', 'null');
    expect(safeParseStorageArray('LM_BAYS')).toEqual([]);
    mockLocalStorage.setItem('LM_BAYS', '{"broken":true}');
    expect(safeParseStorageArray('LM_BAYS')).toEqual([]);
    mockLocalStorage.setItem('LM_BAYS', '{corrupted');
    expect(safeParseStorageArray('LM_BAYS')).toEqual([]);
  });
});
