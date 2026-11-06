import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storageMap = new Map<string, string>();
const memoryStorage: Storage = {
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
};
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

import { executeKioskAutoReversal } from '../kioskPaymentReversal';
import { kioskVanClient } from '../van_client';
import { api } from '../../api';
import { PaymentOutboxManager } from '../../paymentResilience';
import type { CardApprovalResult } from '../van_types';

describe('Wave 1 [W1-3]: executeKioskAutoReversal apprNo 별칭 정규화(apprStr) 일관성 검증', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildApprNoOnlyApproval = (): CardApprovalResult => ({
    success: true,
    provider: 'KIS',
    amount: 25000,
    vat: 2273,
    installment_months: 3,
    auth_code: '',
    apprNo: '  88991122  ',
    card_no_masked: '9411-****-****-1234',
    issuer_name: '신한카드',
    van_tr_no: 'TR-APPR-01',
    terminal_id: 'TID-001',
    approved_at: '2026-11-06T18:30:00+09:00',
  });

  it('auth_code가 비어있고 apprNo만 존재하는 승인 객체도 망취소 성공 시 orgAuthCode와 Outbox 정리에 정규화된 승인번호를 전달한다', async () => {
    const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValue({
      success: true,
      provider: 'KIS',
      amount: 25000,
      vat: 2273,
      installment_months: 3,
      auth_code: '88991122',
      card_no_masked: '9411-****-****-1234',
      issuer_name: '신한카드',
      approved_at: '2026-11-06T18:30:05+09:00',
    });
    const removeSpy = vi.spyOn(PaymentOutboxManager, 'removeByAuthCode');

    const res = await executeKioskAutoReversal({
      cardApproval: buildApprNoOnlyApproval(),
      payAmount: 25000,
      reason: '타석 배정 충돌 (409)',
    });

    expect(res.success).toBe(true);
    expect(res.reversalAttempted).toBe(true);
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orgAuthCode: '88991122',
        installmentMonths: 3,
      })
    );
    expect(removeSpy).toHaveBeenCalledWith('88991122');
  });

  it('단말기 망취소 거절 및 통신 예외 발생 시 모두 DLQ(reportGhostCharge)의 authNo에 빈 문자열이 아닌 apprStr을 기록한다', async () => {
    vi.spyOn(kioskVanClient, 'cancelCardPayment')
      .mockResolvedValueOnce({
        success: false,
        provider: 'KIS',
        amount: 25000,
        vat: 2273,
        installment_months: 3,
        auth_code: '',
        card_no_masked: '',
        issuer_name: '',
        approved_at: '',
        error_message: '단말기 응답 거절',
      })
      .mockRejectedValueOnce(new Error('VCAT 연결 거부'));

    const dlqSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValue({
      success: true,
      dlq_id: 'DLQ-901',
    });

    const rejectedRes = await executeKioskAutoReversal({
      cardApproval: buildApprNoOnlyApproval(),
      payAmount: 25000,
      reason: '백엔드 타임아웃',
      storeCd: 'S001',
    });
    expect(rejectedRes.success).toBe(false);
    expect(rejectedRes.dlqReported).toBe(true);
    expect(dlqSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        authNo: '88991122',
      })
    );

    const thrownRes = await executeKioskAutoReversal({
      cardApproval: buildApprNoOnlyApproval(),
      payAmount: 25000,
      reason: '백엔드 500 오류',
      storeCd: 'S001',
    });
    expect(thrownRes.success).toBe(false);
    expect(thrownRes.dlqReported).toBe(true);
    expect(dlqSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        authNo: '88991122',
      })
    );
  });
});
