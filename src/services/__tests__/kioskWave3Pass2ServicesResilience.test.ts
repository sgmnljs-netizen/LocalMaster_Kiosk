import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

import {
  PAYMENT_RESILIENCE_CONFIG,
  PaymentOutboxManager,
  buildAttemptIdempotencyKey,
  fetchWithPaymentRetry,
} from '../paymentResilience';
import { api } from '../api';

describe('[Wave 3 Pass 2][Kiosk/Services] PaymentOutboxManager 동시성 유실 방어 및 Stale WAL 승격 복원력 검증', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flushPendingDlq 비동기 전송 도중 신규 기록된 WAL_IN_FLIGHT 엔트리를 덮어쓰지 않고 안전하게 보존한다', async () => {
    PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S-OUTBOX-01',
      terminalId: '88010003',
      authCode: '11112222',
      amount: 20000,
      payload: { auth_no: '11112222', amount: 20000 },
    });

    const sendDlqSpy = vi.fn(async () => {
      // DLQ 전송 대기 중 고객의 신규 카드 승인 WAL이 기록되는 동시성 레이스 재현
      PaymentOutboxManager.recordWalInFlight({
        storeCd: 'S-OUTBOX-01',
        terminalId: '88010003',
        authCode: '99998888',
        amount: 35000,
        purpose: 'ALLOCATE_BAY',
        endpoint: '/v1/kiosk/allocate-bay',
        payload: { bayNo: 7 },
      });
      return true;
    });

    // online 이벤트와 부팅 초기화에서 동시 호출되어도 단일 실행(Single-flight) 보장
    const [res1, res2] = await Promise.all([
      PaymentOutboxManager.flushPendingDlq(sendDlqSpy),
      PaymentOutboxManager.flushPendingDlq(sendDlqSpy),
    ]);

    expect(sendDlqSpy).toHaveBeenCalledTimes(1);
    expect(res1.flushed).toBe(1);
    expect(res2.flushed).toBe(1);

    const remaining = PaymentOutboxManager.getEntries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].authCode).toBe('99998888');
    expect(remaining[0].kind).toBe('WAL_IN_FLIGHT');
  });

  it('60초 이상 경과한 미확정 WAL_IN_FLIGHT는 정전 복구 DLQ로 자동 승격하고 60초 미만 활성 WAL은 보존한다', async () => {
    const staleIso = new Date(Date.now() - PAYMENT_RESILIENCE_CONFIG.STALE_WAL_MS - 5000).toISOString();
    const freshIso = new Date(Date.now() - 5000).toISOString();

    storageMap.set(
      PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'WAL_S-01_STALE001',
          kind: 'WAL_IN_FLIGHT',
          createdAt: staleIso,
          updatedAt: staleIso,
          retryCount: 0,
          storeCd: 'S-01',
          terminalId: '88010003',
          authCode: 'STALE001',
          amount: 25000,
          purpose: 'PURCHASE_PRODUCT',
          payload: { issuer_name: '현대카드' },
        },
        {
          id: 'WAL_S-01_FRESH002',
          kind: 'WAL_IN_FLIGHT',
          createdAt: freshIso,
          updatedAt: freshIso,
          retryCount: 0,
          storeCd: 'S-01',
          terminalId: '88010003',
          authCode: 'FRESH002',
          amount: 15000,
          purpose: 'ALLOCATE_BAY',
          payload: {},
        },
      ])
    );

    // 1차 전송 실패 -> STALE001은 PENDING_DLQ로 승격되고 retryCount가 1 증가해야 함
    const failRes = await PaymentOutboxManager.flushPendingDlq(async () => false);
    expect(failRes.flushed).toBe(0);
    const afterFail = PaymentOutboxManager.getEntries();
    expect(afterFail).toHaveLength(2);
    expect(afterFail.find((e) => e.authCode === 'STALE001')?.kind).toBe('PENDING_DLQ');
    expect(afterFail.find((e) => e.authCode === 'STALE001')?.retryCount).toBe(1);
    expect(afterFail.find((e) => e.authCode === 'FRESH002')?.kind).toBe('WAL_IN_FLIGHT');

    // 2차 전송 성공 -> STALE001만 제거되고 FRESH002는 유지됨
    const okRes = await PaymentOutboxManager.flushPendingDlq(async () => true);
    expect(okRes.flushed).toBe(1);
    expect(okRes.remaining).toBe(1);
    expect(PaymentOutboxManager.getEntries()[0].authCode).toBe('FRESH002');
  });

  it('fetchWithPaymentRetry는 4xx 비즈니스 에러(409/422)를 즉시 반환하고 503 일시 장애만 지수 백오프 재시도한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Conflict', { status: 409 }))
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const conflictRes = await fetchWithPaymentRetry('http://127.0.0.1:8000/api/test', { method: 'POST' });
    expect(conflictRes.status).toBe(409);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const recoveredRes = await fetchWithPaymentRetry('http://127.0.0.1:8000/api/test', { method: 'POST' });
    expect(recoveredRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('holdLockerExtension·verifyKioskCheckin 등 합성 멱등키는 단일 호출 재시도 간 동일성을 유지하되 재진입 호출 간에는 고유 키를 발급해 24h 캐시 오재생을 차단한다', async () => {
    const k1 = buildAttemptIdempotencyKey('LOCKER_HOLD_S1_T1_3_LC01');
    const k2 = buildAttemptIdempotencyKey('LOCKER_HOLD_S1_T1_3_LC01');
    expect(k1).not.toBe(k2);
    expect(k1.startsWith('LOCKER_HOLD_S1_T1_3_LC01_')).toBe(true);

    const capturedKeys: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_url, init) => {
        const hdrs = (init?.headers || {}) as Record<string, string>;
        capturedKeys.push(hdrs['x-idempotency-key'] || '');
        return new Response('Bad Gateway', { status: 502 });
      })
      .mockImplementationOnce(async (_url, init) => {
        const hdrs = (init?.headers || {}) as Record<string, string>;
        capturedKeys.push(hdrs['x-idempotency-key'] || '');
        return new Response(JSON.stringify({ success: true, res_id: 'RES_HOLD_1' }), { status: 200 });
      })
      .mockImplementationOnce(async (_url, init) => {
        const hdrs = (init?.headers || {}) as Record<string, string>;
        capturedKeys.push(hdrs['x-idempotency-key'] || '');
        return new Response(JSON.stringify({ success: true, res_id: 'RES_HOLD_2' }), { status: 200 });
      });

    const firstHold = await api.holdLockerExtension(3, 10000, 'LC01', 'M260501', 3, '71000000');
    const secondHoldAfterCancel = await api.holdLockerExtension(3, 10000, 'LC01', 'M260501', 3, '71000000');

    expect(firstHold.res_id).toBe('RES_HOLD_1');
    expect(secondHoldAfterCancel.res_id).toBe('RES_HOLD_2');
    expect(capturedKeys).toHaveLength(3);
    // 1차 호출의 502 재시도 2건은 동일한 x-idempotency-key를 유지해야 함
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    // 취소 후 2차 재진입 호출은 반드시 새로운 x-idempotency-key를 발급해 이전 취소된 res_id 오재생을 방지해야 함
    expect(capturedKeys[2]).not.toBe(capturedKeys[0]);
  });
});
