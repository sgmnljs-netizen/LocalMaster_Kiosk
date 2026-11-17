import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentOutboxManager } from '../paymentResilience';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('[W3P2-KSK-services] PaymentOutboxManager 빈 승인번호 DLQ 키 충돌 방지 검증', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('승인번호(authCode)가 비어 있는 동일 매장/동일 금액 망취소 실패 건 2건을 덮어쓰지 않고 모두 보존한다', () => {
    const key1 = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S0001',
      terminalId: 'KIOSK-01',
      authCode: '',
      amount: 50000,
      payload: { tx_seq: 1 },
    });
    const key2 = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S0001',
      terminalId: 'KIOSK-01',
      authCode: '   ',
      amount: 50000,
      payload: { tx_seq: 2 },
    });

    expect(key1).not.toBe(key2);
    const entries = PaymentOutboxManager.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.payload.tx_seq)).toEqual([1, 2]);
  });

  it('유효한 승인번호(authCode)가 있으면 기존 WAL_IN_FLIGHT를 PENDING_DLQ로 원자적 승격하고 중복 등록을 방지한다', () => {
    PaymentOutboxManager.recordWalInFlight({
      storeCd: 'S0001',
      terminalId: 'KIOSK-01',
      authCode: '99887766',
      amount: 30000,
      payload: { step: 'wal' },
    });

    const dlqKey1 = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S0001',
      terminalId: 'KIOSK-01',
      authCode: '99887766',
      amount: 30000,
      payload: { step: 'dlq1' },
    });
    const dlqKey2 = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'S0001',
      terminalId: 'KIOSK-01',
      authCode: '99887766',
      amount: 30000,
      payload: { step: 'dlq2' },
    });

    expect(dlqKey1).toBe('DLQ_S0001_99887766_30000');
    expect(dlqKey2).toBe(dlqKey1);
    const entries = PaymentOutboxManager.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('PENDING_DLQ');
    expect(entries[0].payload.step).toBe('dlq2');
  });
});
