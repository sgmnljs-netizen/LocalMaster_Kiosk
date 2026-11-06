import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string): string | null => (storageMap.has(key) ? storageMap.get(key)! : null),
  setItem: (key: string, value: string): void => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string): void => {
    storageMap.delete(key);
  },
  clear: (): void => {
    storageMap.clear();
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

const windowTarget = new EventTarget();
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      hostname: '127.0.0.1',
      port: '5179',
      origin: 'http://127.0.0.1:5179',
      protocol: 'http:',
      pathname: '/',
      search: '',
    },
    localStorage: mockLocalStorage,
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
  },
  configurable: true,
  writable: true,
});

import {
  api,
  safeParseStorageArray,
  safeParseStorageObject,
} from '../api';
import {
  PAYMENT_RESILIENCE_CONFIG,
  PaymentOutboxManager,
  isRetryableHttpStatus,
} from '../paymentResilience';
import { kioskEscPosPrinter, formatRow, formatTwoCol, getTextLength } from '../printer/escpos_printer';
import { extractKstYyyyMmDd } from '../van/adapters/BaseVanAdapter';
import { executeKioskAutoReversal } from '../van/kioskPaymentReversal';
import { kioskVanClient } from '../van/van_client';
import type { CardApprovalResult } from '../van/van_types';

function makeApproval(overrides: Partial<CardApprovalResult> = {}): CardApprovalResult {
  return {
    success: true,
    provider: 'KCP_VCAT',
    amount: 22000,
    vat: 2000,
    installment_months: 0,
    auth_code: 'APPR8877',
    apprNo: 'APPR8877',
    van_tr_no: 'TR202611060001',
    card_no_masked: '9411-****-****-1234',
    issuer_name: '신한카드',
    approved_at: '2026-10-30T15:30:00.000Z', // KST: 2026-10-31 00:30:00
    terminal_id: 'K9Z0001',
    ...overrides,
  };
}

describe('W3-KSK-services: API 오프라인 폴백·결제 망취소·Outbox·서멀프린터 경계값 단위테스트', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('kioskPaymentReversal & extractKstYyyyMmDd (0원·음수·KST 자정 경계 및 DLQ 폴백)', () => {
    it('UTC 자정 직후(15:30Z -> KST 익일 00:30) 원거래 일자를 KST YYYYMMDD로 정확히 변환한다', () => {
      expect(extractKstYyyyMmDd('2026-10-30T15:30:00.000Z')).toBe('20261031');
      expect(extractKstYyyyMmDd('2026-11-06 14:20:00')).toBe('20261106');
      expect(extractKstYyyyMmDd('261106142000')).toBe('20261106');
    });

    it('0원 결제·음수 금액·무료쿠폰(FREE-)·포인트(POINT-)·회원권(MEMBERSHIP)·승인정보 없음은 VAN 망취소를 호출하지 않는다', async () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');

      const zeroRes = await executeKioskAutoReversal({
        cardApproval: makeApproval({ amount: 0 }),
        payAmount: 0,
        reason: '타석 선점 충돌',
      });
      expect(zeroRes.reversalAttempted).toBe(false);

      const negativeRes = await executeKioskAutoReversal({
        cardApproval: makeApproval({ amount: -5000 }),
        payAmount: -5000,
        reason: '음수 금액 방어',
      });
      expect(negativeRes.reversalAttempted).toBe(false);

      for (const specialAuth of ['FREE-COUPON-1', 'POINT-100', 'MEMBERSHIP']) {
        const skipped = await executeKioskAutoReversal({
          cardApproval: makeApproval({ auth_code: specialAuth, apprNo: specialAuth }),
          payAmount: 20000,
          reason: '비카드 결제수단',
        });
        expect(skipped.reversalAttempted).toBe(false);
      }

      const undefinedApproval = await executeKioskAutoReversal({
        cardApproval: undefined,
        payAmount: 20000,
        reason: '승인 객체 누락',
      });
      expect(undefinedApproval.reversalAttempted).toBe(false);
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it('정상 카드 승인 건 장애 시 KST 원거래일자로 망취소하고, 단말기 거절 시 Ghost Charge DLQ로 긴급 보고한다', async () => {
      PaymentOutboxManager.recordWalInFlight({
        storeCd: 'S001',
        terminalId: 'K9Z0001',
        authCode: 'APPR8877',
        amount: 22000,
        payload: { test: true },
      });

      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        provider: 'KCP_VCAT',
        canceled_amount: 22000,
        org_auth_code: 'APPR8877',
        canceled_at: '2026-10-31T00:31:00+09:00',
      });

      const okRes = await executeKioskAutoReversal({
        cardApproval: makeApproval(),
        payAmount: 22000,
        reason: '백엔드 500 오류',
        storeCd: 'S001',
      });
      expect(okRes.success).toBe(true);
      expect(okRes.reversalAttempted).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 22000,
          orgAuthCode: 'APPR8877',
          orgApprovedDate: '20261031',
          vat: 2000,
        })
      );
      expect(PaymentOutboxManager.getEntries()).toHaveLength(0);

      // 단말기 거절 시 DLQ 보고 검증
      cancelSpy.mockResolvedValueOnce({
        success: false,
        provider: 'KCP_VCAT',
        canceled_amount: 0,
        org_auth_code: 'APPR9999',
        error_message: '카드 회수 후 망취소 불가',
      });
      const dlqSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ-20261106-01',
      });

      const failRes = await executeKioskAutoReversal({
        cardApproval: makeApproval({ auth_code: 'APPR9999', apprNo: 'APPR9999' }),
        payAmount: 22000,
        reason: '타석 배정 충돌',
        storeCd: 'S001',
      });
      expect(failRes.success).toBe(false);
      expect(failRes.reversalAttempted).toBe(true);
      expect(failRes.dlqReported).toBe(true);
      expect(failRes.dlqId).toBe('DLQ-20261106-01');
      expect(dlqSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('paymentResilience (HTTP 재시도 판별 및 Outbox 손상 JSON·Stale WAL 복구)', () => {
    it('408/429/5xx는 재시도 대상(true), 400/401/404/409/422 비즈니스 거절은 즉시 반환(false)한다', () => {
      expect(isRetryableHttpStatus(408)).toBe(true);
      expect(isRetryableHttpStatus(429)).toBe(true);
      expect(isRetryableHttpStatus(500)).toBe(true);
      expect(isRetryableHttpStatus(503)).toBe(true);

      expect(isRetryableHttpStatus(400)).toBe(false);
      expect(isRetryableHttpStatus(404)).toBe(false);
      expect(isRetryableHttpStatus(409)).toBe(false);
      expect(isRetryableHttpStatus(422)).toBe(false);
    });

    it('LM_PAYMENT_OUTBOX가 깨진 JSON이어도 빈 배열로 복구하며, 60초 경과 Stale WAL만 DLQ로 자동 플러시한다', async () => {
      localStorage.setItem(PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY, '{broken_json');
      expect(PaymentOutboxManager.getEntries()).toEqual([]);

      const nowMs = Date.now();
      const staleIso = new Date(nowMs - PAYMENT_RESILIENCE_CONFIG.STALE_WAL_MS - 5000).toISOString();
      const freshIso = new Date(nowMs - 5000).toISOString();

      localStorage.setItem(
        PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY,
        JSON.stringify([
          {
            id: 'WAL_S001_STALE01',
            kind: 'WAL_IN_FLIGHT',
            createdAt: staleIso,
            updatedAt: staleIso,
            retryCount: 0,
            storeCd: 'S001',
            terminalId: 'KIOSK-01',
            authCode: 'STALE01',
            amount: 15000,
            payload: { issuer_name: '국민카드' },
          },
          {
            id: 'WAL_S001_FRESH01',
            kind: 'WAL_IN_FLIGHT',
            createdAt: freshIso,
            updatedAt: freshIso,
            retryCount: 0,
            storeCd: 'S001',
            terminalId: 'KIOSK-01',
            authCode: 'FRESH01',
            amount: 15000,
            payload: { issuer_name: '현대카드' },
          },
        ])
      );

      const flushedPayloads: Array<Record<string, unknown>> = [];
      const result = await PaymentOutboxManager.flushPendingDlq(async (payload) => {
        flushedPayloads.push(payload);
        return true;
      });

      expect(result).toEqual({ flushed: 1, remaining: 1 });
      expect(flushedPayloads).toHaveLength(1);
      expect(flushedPayloads[0]?.auth_no).toBe('STALE01');
      expect(PaymentOutboxManager.getEntries()[0]?.authCode).toBe('FRESH01');
    });
  });

  describe('api 오프라인 Edge DB 손상 스토리지 방어 및 ESC/POS 서멀 프린터 경계값', () => {
    it('localStorage에 깨진 문자열이나 "null"이 저장되어 있어도 getStoreInfo / getKioskMasterData가 예외 없이 폴백한다', async () => {
      localStorage.setItem('LM_STORE_INFO', '{corrupted-json');
      localStorage.setItem('LM_BAYS', 'null');
      localStorage.setItem('LM_PRODUCTS', '"not-an-array"');

      expect(safeParseStorageArray('LM_BAYS')).toEqual([]);
      expect(safeParseStorageArray('LM_PRODUCTS')).toEqual([]);
      expect(safeParseStorageObject('LM_STORE_INFO')).toEqual({});

      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const storeInfo = await api.getStoreInfo();
      expect(storeInfo.store_nm).toBeTruthy();
      expect(storeInfo.tel).toBe('1566-8705');

      const master = await api.getKioskMasterData();
      expect(Array.isArray(master.bays)).toBe(true);
      expect(Array.isArray(master.products)).toBe(true);
      expect(master.products).toEqual([]);
    });

    it('ESC/POS 프린터는 한글 2폭 계산·배정표 전용 바코드 삽입·매출전표 바코드 미삽입 및 타임아웃 폴백을 보장한다', async () => {
      expect(getTextLength('ABC')).toBe(3);
      expect(getTextLength('가나다')).toBe(6);
      expect(getTextLength('1번 타석')).toBe(8);
      expect(formatTwoCol('합계', '0원', 12)).toBe('합계     0원');
      expect(
        formatRow([
          { text: '타석', width: 6, align: 'left' },
          { text: '10', width: 4, align: 'right' },
        ])
      ).toBe('타석    10');

      const slipBuf = kioskEscPosPrinter.buildReceiptBuffer({
        storeName: '골포스 강남점',
        receiptNo: 'RCPT-20261106-0001',
        tradeDate: '2026-11-06 14:30:00',
        payMethod: 'ALLOCATION_SLIP',
        bayNo: 7,
        payAmount: 0,
      });
      const slipText = new TextDecoder().decode(slipBuf);
      expect(slipText).toContain('[게이트출입]');

      const cardReceiptBuf = kioskEscPosPrinter.buildReceiptBuffer({
        storeName: '골포스 강남점',
        receiptNo: 'RCPT-20261106-0002',
        tradeDate: '2026-11-06 14:30:00',
        payMethod: 'CARD',
        payAmount: 0,
      });
      const cardReceiptText = new TextDecoder().decode(cardReceiptBuf);
      expect(cardReceiptText).not.toContain('[게이트출입]');
      expect(cardReceiptText).toContain('0원');

      const timeoutErr = new Error('Timed out');
      timeoutErr.name = 'TimeoutError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(timeoutErr);

      const printRes = await kioskEscPosPrinter.printReceipt({
        storeName: '골포스 강남점',
        receiptNo: 'RCPT-20261106-0003',
        tradeDate: '2026-11-06 14:30:00',
        payAmount: 10000,
      });
      expect(printRes.success).toBe(false);
      expect(printRes.message).toContain('시간 초과');
    });
  });
});
