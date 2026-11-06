import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() {
      return storageMap.size;
    },
    clear: () => storageMap.clear(),
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    setItem: (k: string, v: string) => {
      storageMap.set(k, String(v));
    },
  } satisfies Storage,
  configurable: true,
  writable: true,
});

import { fetchWithPaymentRetry, PaymentOutboxManager } from '../services/paymentResilience';
import { api } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';

describe('Wave 1 [W1-6]: fetchWithPaymentRetry 시그널 합성, processPaymentWebhook WAL 대칭성 및 KST 매출일자 보장', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_W1_TEST');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'T_W1_01');
  });

  afterEach(() => {
    TimeMaster.syncServerTime(Date.now());
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('init.signal이 함께 전달된 경우에도 내부 timeoutMs 초과 시 요청을 abort하고 지정된 횟수만큼 재시도한다', async () => {
    const callerController = new AbortController();
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Timed out');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const resPromise = fetchWithPaymentRetry(
      'http://127.0.0.1:8000/api/v1/kiosk/test',
      { method: 'POST', signal: callerController.signal },
      { timeoutMs: 500, maxRetries: 1, label: '테스트 결제' }
    );

    // 1차 시도 500ms 타임아웃 + 백오프 대기(1000ms) 진행
    await vi.advanceTimersByTimeAsync(2000);
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('호출자(init.signal)가 직접 취소(abort)한 경우에는 불필요한 백오프 재시도 없이 즉시 예외를 전파한다', async () => {
    const callerController = new AbortController();
    let callCount = 0;

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      callCount += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Caller aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const resPromise = fetchWithPaymentRetry(
      'http://127.0.0.1:8000/api/v1/kiosk/test',
      { method: 'POST', signal: callerController.signal },
      { timeoutMs: 5000, maxRetries: 3, label: '호출자 취소 테스트' }
    );

    callerController.abort();
    await expect(resPromise).rejects.toThrow('Caller aborted');
    expect(callCount).toBe(1);
  });

  it('processPaymentWebhook은 호출 직전 WAL_IN_FLIGHT를 기록하고 통신 실패 시 보존하며 성공 시 제거한다', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network down'));

    const failPromise = api.processPaymentWebhook('RES-9001', 22000, 'CARD', {
      auth_code: '66554433',
      van_tr_no: 'VAN-9001',
      terminal_id: 'T_W1_01',
      prodCd: 'P_DAILY',
    });

    await vi.advanceTimersByTimeAsync(15000);
    const failRes = await failPromise;
    expect(failRes.success).toBe(false);

    // 통신 실패 시 크래시 복구를 위해 WAL 엔트리가 남아 있어야 함
    const pendingAfterFail = PaymentOutboxManager.getEntries();
    expect(pendingAfterFail.some((e) => e.authCode === '66554433' && e.kind === 'WAL_IN_FLIGHT')).toBe(true);

    // 재호출 성공 시 WAL 엔트리가 즉시 제거되어야 함
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: '확정 완료' }), { status: 200 })
    );
    const okRes = await api.processPaymentWebhook('RES-9001', 22000, 'CARD', {
      auth_code: '66554433',
      van_tr_no: 'VAN-9001',
      terminal_id: 'T_W1_01',
      prodCd: 'P_DAILY',
    });
    expect(okRes.success).toBe(true);
    expect(PaymentOutboxManager.getEntries().some((e) => e.authCode === '66554433')).toBe(false);
  });

  it('KST 자정 직후(00:30 KST = 전일 15:30 UTC) 오프라인 R-HOLD 웹훅 정산 시 전일 UTC가 아닌 당일 KST 일자(sale_dt)로 기록한다', async () => {
    // 2026-11-07 00:30:00 KST (= 2026-11-06T15:30:00Z)
    vi.setSystemTime(new Date('2026-11-06T15:30:00.000Z'));
    TimeMaster.syncServerTime(new Date('2026-11-06T15:30:00.000Z').getTime());

    storageMap.set(
      'LM_HOLD_RESERVATIONS',
      JSON.stringify([
        {
          res_id: 'R-HOLD-MIDNIGHT',
          bay_no: 3,
          duration_min: 50,
          member_no: 'M001',
          guest_nm: '심야회원',
          hp_no: '01012345678',
        },
      ])
    );
    storageMap.set('LM_BAYS', JSON.stringify([{ bay_no: 3, status: 'AVAILABLE' }]));

    const res = await api.processPaymentWebhook('R-HOLD-MIDNIGHT', 20000, 'CARD');
    expect(res.success).toBe(true);

    const sales = JSON.parse(storageMap.get('LM_SALES') || '[]') as Array<{ sale_dt: string }>;
    expect(sales).toHaveLength(1);
    expect(sales[0].sale_dt).toBe('20261107');
  });
});
