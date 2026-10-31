import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const storageMap = new Map<string, string>();
const eventTarget = new EventTarget();
const mockLocalStorage: Storage = {
  get length() {
    return storageMap.size;
  },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => {
    storageMap.set(k, String(v));
  },
  removeItem: (k: string) => {
    storageMap.delete(k);
  },
  clear: () => {
    storageMap.clear();
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      localStorage: mockLocalStorage,
      location: {
        hostname: '127.0.0.1',
        port: '8000',
        origin: 'http://127.0.0.1:8000',
        pathname: '/',
        search: '',
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        webdriver: false,
      },
    },
    configurable: true,
    writable: true,
  });
}

import {
  extractKstYyyyMmDd,
  getIsMockVan,
  KIOSK_VAN_APPROVAL_TIMEOUT_SEC,
} from '../van/adapters/BaseVanAdapter';
import { KcpVcatAdapter } from '../van/adapters/KcpVcatAdapter';
import { getIsMockHardware } from '../hardware/adapters/HardwareAdapterFactory';
import { api } from '../api';

describe('Kiosk P1 Payment, VAN, Settlement & Date Integrity Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.removeItem('VAN_MOCK');
    window.localStorage.removeItem('HW_MOCK');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('[P1-4] extractKstYyyyMmDd normalizes midnight KST UTC ISO and 12-digit VCAT YYMMDDHHmmss into 8-digit YYYYMMDD', () => {
    // 2026-10-30T15:30:00.000Z == 2026-10-31 00:30:00 KST (UTC slice would wrongly yield 20261030!)
    expect(extractKstYyyyMmDd('2026-10-30T15:30:00.000Z')).toBe('20261031');
    // KST offset ISO string
    expect(extractKstYyyyMmDd('2026-10-31T00:05:12+09:00')).toBe('20261031');
    // 12-digit KCP VCAT YYMMDDHHmmss
    expect(extractKstYyyyMmDd('261031143022')).toBe('20261031');
    // 6-digit YYMMDD
    expect(extractKstYyyyMmDd('261031')).toBe('20261031');
    // 14-digit YYYYMMDDHHmmss
    expect(extractKstYyyyMmDd('20261031143022')).toBe('20261031');
  });

  it('[P1-3] Production non-demo runtime blocks UA-inferred Mock VAN and Mock Hardware', () => {
    Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true });
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });

    expect(getIsMockVan(true)).toBe(false);
    expect(getIsMockHardware(true)).toBe(false);

    window.localStorage.setItem('VAN_MOCK', 'true');
    window.localStorage.setItem('HW_MOCK', 'true');
    expect(getIsMockVan(true)).toBe(true);
    expect(getIsMockHardware(true)).toBe(true);
  });

  it('[P1-1] api.resolveTerminalRoute fails closed on network error for sub-merchant (PRO/SUB) while allowing local fallback for MAIN', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const subRoute = await api.resolveTerminalRoute('dev-3', 'PRO_KIM_01', 'PRO', 'PRO_KIM_01');
    expect(subRoute.error).toBe(true);
    expect(subRoute.terminal_id).toBe('');
    expect(subRoute.status).toBe(503);

    const mainRoute = await api.resolveTerminalRoute('dev-3', 'MAIN', 'MAIN', null);
    expect(mainRoute.error).toBeUndefined();
    expect(mainRoute.terminal_id.length).toBeGreaterThan(0);
  });

  it('[P1-2 & P1-4] KcpVcatAdapter propagates sub-merchant terminalId + tax-free vat=0 and recovers approval from /vcat/last-approval on socket timeout', async () => {
    expect(KIOSK_VAN_APPROVAL_TIMEOUT_SEC).toBe(60);

    const fetchMock = vi
      .fn()
      // 1st call: /vcat/request throws timeout error after card insertion
      .mockRejectedValueOnce(new Error('Socket timeout'))
      // 2nd call: /vcat/last-approval returns persisted approval from vcat_bridge ledger
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          res_cd: '0000',
          auth_no: '77889900',
          auth_date: '261031102500',
          card_no: '9411-****-****-1234',
          issuer_nm: '신한카드',
          acquirer_nm: '신한카드',
          terminal_id: 'SUB_TID_9901',
          van_tr_no: 'KCPTR123456',
        }),
      } as Response);

    global.fetch = fetchMock;

    const adapter = new KcpVcatAdapter({
      provider: 'KCP',
      vcatHost: 'http://127.0.0.1',
      vcatPort: 9099,
      terminalId: 'MAIN_TID_1000',
      isMock: false,
      timeoutSeconds: 60,
    });

    const states: string[] = [];
    const result = await adapter.requestCardPayment(
      {
        amount: 25000,
        isTaxFree: true,
        vatAmount: 0,
        terminalId: 'SUB_TID_9901',
        orderId: 'ORD-PAR3-TEST-01',
      },
      (st) => states.push(st)
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [reqUrl, reqInit] = fetchMock.mock.calls[0];
    expect(reqUrl).toBe('http://127.0.0.1:9099/vcat/request');
    const parsedBody = JSON.parse(String(reqInit?.body || '{}'));
    expect(parsedBody.vat).toBe(0);
    expect(parsedBody.terminal_id).toBe('SUB_TID_9901');
    expect(parsedBody.order_no).toBe('ORD-PAR3-TEST-01');

    const [recUrl] = fetchMock.mock.calls[1];
    expect(recUrl).toContain('/vcat/last-approval?order_no=ORD-PAR3-TEST-01&amount=25000');

    expect(result.success).toBe(true);
    expect(result.auth_code).toBe('77889900');
    expect(result.terminal_id).toBe('SUB_TID_9901');
    expect(extractKstYyyyMmDd(result.approved_at)).toBe('20261031');
    expect(states).toContain('APPROVED');
  });

  it('[P1-2] KcpVcatAdapter.cancelCardPayment treats already-cancelled response and /vcat/last-cancel ledger recovery as idempotent success', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cancel socket dropped'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          res_cd: '0000',
          auth_no: '77889900',
          auth_date: '261031102600',
        }),
      } as Response);

    global.fetch = fetchMock;

    const adapter = new KcpVcatAdapter({
      provider: 'KCP',
      vcatHost: 'http://127.0.0.1',
      vcatPort: 9099,
      terminalId: 'SUB_TID_9901',
      isMock: false,
      timeoutSeconds: 60,
    });

    const cancelRes = await adapter.cancelCardPayment({
      amount: 25000,
      isTaxFree: true,
      vat: 0,
      orgAuthCode: '77889900',
      orgApprovedDate: '20261031',
      terminalId: 'SUB_TID_9901',
    });

    expect(cancelRes.success).toBe(true);
    expect(cancelRes.canceled_amount).toBe(25000);
    expect(cancelRes.cancel_auth_code).toBe('77889900');
  });
});
