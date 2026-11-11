import { describe, it, expect, beforeEach } from 'vitest';
import { computeKioskDiscountBreakdown } from '../components/PaymentTerminal';
import {
  PaymentOutboxManager,
  PAYMENT_RESILIENCE_CONFIG,
  isRetryableHttpStatus,
} from '../services/paymentResilience';
import {
  canAllocatePracticeBayImmediately,
  isKioskChannelProduct,
} from '../utils/kioskPurchaseEligibility';
import { sanitizeVanPort, sanitizeVanTimeoutSeconds } from '../hooks/useKioskVanPayment';
import {
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
  resolveEffectiveAuthMode,
  resolveEnabledAuthModes,
  sanitizeMinGapMinutes,
} from '../stores/kioskSettings';

const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  },
});

describe('[W3-20261112] 키오스크 5대 도메인(components/services/utils/hooks/stores) 경계값 검증', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. [services] PaymentOutboxManager: 손상된 배열 원소(null/문자열/id누락)가 섞여 있어도 WAL 기록·승격·삭제 시 크래시하지 않는다', () => {
    localStorage.setItem(
      PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY,
      JSON.stringify([
        null,
        'corrupt-entry',
        { broken: true },
        {
          id: 'WAL_H01-SE-001_99887766',
          kind: 'WAL_IN_FLIGHT',
          createdAt: '2026-11-12T00:00:00.000Z',
          updatedAt: '2026-11-12T00:00:00.000Z',
          retryCount: 0,
          storeCd: 'H01-SE-001',
          terminalId: '88010003',
          authCode: '99887766',
          amount: 30000,
          payload: {},
        },
      ])
    );

    expect(PaymentOutboxManager.getEntries()).toHaveLength(1);

    const dlqId = PaymentOutboxManager.enqueuePendingDlq({
      storeCd: 'H01-SE-001',
      terminalId: '88010003',
      authCode: '99887766',
      amount: 30000,
      payload: { reason: 'timeout' },
    });
    const afterPromote = PaymentOutboxManager.getEntries();
    expect(afterPromote).toHaveLength(1);
    expect(afterPromote[0]?.id).toBe(dlqId);
    expect(afterPromote[0]?.kind).toBe('PENDING_DLQ');

    PaymentOutboxManager.removeByAuthCode('99887766', 'H01-SE-001');
    expect(PaymentOutboxManager.getEntries()).toHaveLength(0);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(409)).toBe(false);
  });

  it('2. [components] computeKioskDiscountBreakdown: 음수/NaN 원금액·할인율·정률쿠폰 한도 초과 시 음수 결제금액을 원천 차단한다', () => {
    const res = computeKioskDiscountBreakdown({
      amount: 25000,
      discountableAmount: 20000,
      discountRate: 10,
      appliedCoupon: {
        coupon_no: 'CPN-50',
        coupon_nm: '50% 할인 (최대 5천원)',
        benefit_type: 'RATE',
        benefit_val: 50,
        max_discount_amt: 5000,
      },
    });
    expect(res.gradeDiscountAmt).toBe(2000);
    expect(res.couponDiscountAmt).toBe(5000);
    expect(res.targetPayAmt).toBe(18000);

    const zeroGuard = computeKioskDiscountBreakdown({
      amount: Number.NaN,
      discountRate: 150,
      appliedCoupon: null,
    });
    expect(zeroGuard.targetPayAmt).toBe(0);
  });

  it('3. [hooks] sanitizeVanPort & sanitizeVanTimeoutSeconds: 음수(-1)·포트 상한 초과(99999)·불리언 입력을 기본값/상한으로 안전 보정한다', () => {
    expect(sanitizeVanPort('-1', 9099)).toBe(9099);
    expect(sanitizeVanPort('99999', 9099)).toBe(9099);
    expect(sanitizeVanPort('8089', 9099)).toBe(8089);

    expect(sanitizeVanTimeoutSeconds(-5, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(true, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(999, 30)).toBe(180);
  });

  it('4. [utils] canAllocatePracticeBayImmediately & isKioskChannelProduct: 미래 개시일·파3/라카·자유가격·품절 상품을 차단한다', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M-100',
          logicType: 'PERIOD',
          productName: '전일 1개월권',
          startDate: '2026-11-20',
          allowedCategories: ['BAY'],
        },
        '20261112'
      )
    ).toBe(false);

    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M-100',
          logicType: 'PERIOD',
          productName: '전일 1개월권',
          startDate: '2026-11-12',
          allowedCategories: ['BAY'],
        },
        '20261112'
      )
    ).toBe(true);

    expect(isKioskChannelProduct({ meta_data: { is_price_open: true, sales_channels: ['KIOSK'] } })).toBe(false);
    expect(isKioskChannelProduct({ is_stock_managed: true, current_stock: 0, meta_data: { sales_channels: ['KIOSK'] } })).toBe(false);
    expect(isKioskChannelProduct({ meta_data: { sales_channels: ['POS', 'KIOSK'] } })).toBe(true);
  });

  it('5. [stores] kioskSettings: 레거시 메뉴 키 정규화·안면인식 단말 미연동 시 인증 수단 폴백·최소 빈타석 분 보정이 정확하다', () => {
    expect(canonicalizeKioskMenuId('change_bay')).toBe('MOVE_BAY');
    expect(isKioskMenuEnabled('MOVE_BAY', { change_bay: false }, true)).toBe(false);

    const enabledNoFace = resolveEnabledAuthModes(
      { SMART_TAG: false, PHONE_KEYPAD: false, QR_SCAN: false, FACE: true },
      false
    );
    expect(enabledNoFace).toEqual(['PHONE_KEYPAD']);
    expect(resolveEffectiveAuthMode('FACE', 'FACE', enabledNoFace)).toBe('PHONE_KEYPAD');
    expect(sanitizeMinGapMinutes('5', 60)).toBe(60);
    expect(sanitizeMinGapMinutes('90', 60)).toBe(90);
  });
});
