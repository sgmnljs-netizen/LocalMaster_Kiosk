import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaymentOutboxManager,
  fetchWithPaymentRetry,
} from '../paymentResilience';
import { executeKioskAutoReversal } from '../van/kioskPaymentReversal';
import { kioskVanClient } from '../van/van_client';

describe('Wave 3 Kiosk Services — PaymentOutbox Multi-Store & Idempotency Header Boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  it('removeByAuthCode는 공백 패딩된 승인번호도 정규화하여 제거하고 storeCd 지정 시 타 지점 WAL을 보존한다', () => {
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_A',
      terminalId: 'TID-A',
      authCode: '  12345678  ',
      amount: 15000,
      payload: { store_cd: 'STORE_A' },
    });
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_B',
      terminalId: 'TID-B',
      authCode: '12345678',
      amount: 20000,
      payload: { store_cd: 'STORE_B' },
    });

    expect(PaymentOutboxManager.getEntries()).toHaveLength(2);

    PaymentOutboxManager.removeByAuthCode(' 12345678 ', 'STORE_A');
    const remaining = PaymentOutboxManager.getEntries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].storeCd).toBe('STORE_B');

    PaymentOutboxManager.removeByAuthCode('12345678  ');
    expect(PaymentOutboxManager.getEntries()).toHaveLength(0);
  });

  it('enqueuePendingDlq는 동일 storeCd의 WAL_IN_FLIGHT만 승격하고 타 지점의 동번 승인번호 WAL은 건드리지 않는다', () => {
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_A',
      terminalId: 'TID-A',
      authCode: '99887766',
      amount: 30000,
      payload: { store_cd: 'STORE_A' },
    });
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_B',
      terminalId: 'TID-B',
      authCode: '99887766',
      amount: 30000,
      payload: { store_cd: 'STORE_B' },
    });

    PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'STORE_A',
      terminalId: 'TID-A',
      authCode: ' 99887766 ',
      amount: 30000,
      payload: { store_cd: 'STORE_A' },
    });

    const entries = PaymentOutboxManager.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.storeCd === 'STORE_B')?.kind).toBe('WAL_IN_FLIGHT');
    expect(entries.find((e) => e.storeCd === 'STORE_A')?.kind).toBe('PENDING_DLQ');
  });

  it('fetchWithPaymentRetry는 대소문자 구분 없이 기존 Idempotency 헤더가 있으면 중복 주입하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithPaymentRetry(
      'https://example.test/api/sales',
      {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': 'CALLER-KEY-001',
          'Content-Type': 'application/json',
        },
      },
      { idempotencyKey: 'FALLBACK-KEY-002', retryDelaysMs: [] }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const passedHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(passedHeaders['X-Idempotency-Key']).toBe('CALLER-KEY-001');
    expect(passedHeaders['x-idempotency-key']).toBeUndefined();
  });

  it('executeKioskAutoReversal에 storeCd가 전달되면 망취소 성공 시 해당 지점 Outbox만 선택 정리한다', async () => {
    vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValue({
      success: true,
      provider: 'KIS',
      amount: 10000,
      vat: 909,
      installment_months: 0,
      auth_code: '55443322',
      card_no_masked: '1234-****-****-5678',
      issuer_name: '국민카드',
      approved_at: '2026-11-08T10:00:00+09:00',
    });

    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_A',
      terminalId: 'TID-A',
      authCode: '55443322',
      amount: 10000,
      payload: {},
    });
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'STORE_B',
      terminalId: 'TID-B',
      authCode: '55443322',
      amount: 10000,
      payload: {},
    });

    const result = await executeKioskAutoReversal({
      cardApproval: {
        success: true,
        provider: 'KIS',
        amount: 10000,
        vat: 909,
        installment_months: 0,
        auth_code: '55443322',
        card_no_masked: '1234-****-****-5678',
        issuer_name: '국민카드',
        approved_at: '2026-11-08T10:00:00+09:00',
      },
      payAmount: 10000,
      reason: '배정 타임아웃',
      storeCd: 'STORE_A',
    });

    expect(result.success).toBe(true);
    const remaining = PaymentOutboxManager.getEntries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].storeCd).toBe('STORE_B');
  });
});
