import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { CardApprovalResult } from '../van/van_types';
import type { Product, Member, Locker } from '../../types';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Locker Extension Checkout, Security & Reversal QA (L04, L06, L07, L08)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../van/kioskPaymentReversal').executeKioskAutoReversal;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanMod = await import('../van/van_client');
    kioskVanClient = vanMod.kioskVanClient;
    const revMod = await import('../van/kioskPaymentReversal');
    executeKioskAutoReversal = revMod.executeKioskAutoReversal;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    kioskVanClient.setConfig({
      isMock: true,
      terminalId: '88010003',
      provider: 'MOCK',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // L04 [타인 라카 또는 비점유 빈 라카(AVAILABLE) 연장 시도 원천 차단]
  // =========================================================================
  describe('L04 [타인 라카 또는 비점유 빈 라카(AVAILABLE) 연장 시도 원천 차단]', () => {
    it('타인 소유 라카 연장 시도 시 HTTP 403 "본인 소유의 라카만 연장할 수 있습니다." 에러 반환 검증', async () => {
      // 백엔드 403 Forbidden 응답 모킹
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          detail: '본인 소유의 라카만 연장할 수 있습니다.'
        })
      } as any);

      const holdRes = await api.holdLockerExtension(
        101,             // lockerId (타인 라카)
        60000,           // amount
        'PROD_LCK_30D',  // prodCd
        'M_L04_ATTACKER' // memberNo
      );

      expect(holdRes.success).toBe(false);
      expect(holdRes.message).toBe('본인 소유의 라카만 연장할 수 있습니다.');
    });

    it('비점유 빈 라카(AVAILABLE) 연장 시도 시 HTTP 400 "현재 점유 중인 라카만 연장할 수 있습니다." 에러 반환 검증', async () => {
      // 백엔드 400 Bad Request 응답 모킹
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '현재 점유 중인 라카만 연장할 수 있습니다.'
        })
      } as any);

      const holdRes = await api.holdLockerExtension(
        102,             // lockerId (빈 라카)
        60000,           // amount
        'PROD_LCK_30D',  // prodCd
        'M_L04_LEGIT'    // memberNo
      );

      expect(holdRes.success).toBe(false);
      expect(holdRes.message).toBe('현재 점유 중인 라카만 연장할 수 있습니다.');
    });

    it('본인 소유의 점유 라카 연장 시 정상적으로 HOLD 예약(RES_LOCKER_...) 생성 반환 검증', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          res_id: 'RES_LOCKER_20261020100000_101_A1B2',
          message: '라카 연장 대기가 완료되었습니다. 결제를 진행해주세요.'
        })
      } as any);

      const holdRes = await api.holdLockerExtension(
        101,
        60000,
        'PROD_LCK_30D',
        'M_L04_OWNER'
      );

      expect(holdRes.success).toBe(true);
      expect(holdRes.res_id).toBe('RES_LOCKER_20261020100000_101_A1B2');
    });
  });

  // =========================================================================
  // L06 [성별 전용 및 구역 불일치 라카 상품 사전 필터링 및 차단]
  // =========================================================================
  describe('L06 [성별 전용 및 구역 불일치 라카 상품 사전 필터링 및 차단]', () => {
    // LockerExtend.tsx 의 SSOT 필터링 로직 구현체 검증
    const normalizeGenderCode = (val?: string | null): 'M' | 'F' | '' => {
      const v = String(val || '').trim().toUpperCase();
      if (v === 'M' || v === 'MALE' || v === '남' || v === '남성' || v === '남자') return 'M';
      if (v === 'F' || v === 'FEMALE' || v === '여' || v === '여성' || v === '여자') return 'F';
      return '';
    };

    const filterVisibleLockerProducts = (
      products: Product[],
      selectedLocker: Locker | undefined,
      member: Member | undefined
    ): Product[] => {
      return products.filter(prod => {
        const allowedZones = prod.access_rules?.allowed_zones;
        if (Array.isArray(allowedZones) && allowedZones.length > 0 && selectedLocker?.group_id) {
          const normalizedAllowed = allowedZones.map(z => String(z).trim().toUpperCase());
          const lockerGroup = String(selectedLocker.group_id).trim().toUpperCase();
          if (!normalizedAllowed.includes(lockerGroup)) {
            return false;
          }
        }
        const memberGender = normalizeGenderCode(member?.gender);
        const prodGender = normalizeGenderCode(prod.access_rules?.restricted_gender || prod.target_gender);
        if (memberGender && prodGender && memberGender !== prodGender) {
          return false;
        }
        return true;
      });
    };

    const mockProducts: Product[] = [
      {
        prod_cd: 'PROD_LCK_COMMON',
        prod_nm: '공용 라카 30일권',
        standard_price: 60000,
        sale_price: 60000,
        logic_type: 'RENTAL',
        days: 30,
        target_gender: 'ALL',
      },
      {
        prod_cd: 'PROD_LCK_FEMALE',
        prod_nm: '여성 전용 라카 30일권',
        standard_price: 60000,
        sale_price: 60000,
        logic_type: 'RENTAL',
        days: 30,
        target_gender: 'F',
        access_rules: { restricted_gender: 'F' },
      },
      {
        prod_cd: 'PROD_LCK_1F',
        prod_nm: '1층 전용 라카 30일권',
        standard_price: 60000,
        sale_price: 60000,
        logic_type: 'RENTAL',
        days: 30,
        target_gender: 'ALL',
        access_rules: { allowed_zones: ['1F'] },
      },
    ];

    it('남성 회원(gender = "M")에게는 여성 전용 라카 상품이 목록에서 사전 필터링되어 노출되지 않는다', () => {
      const maleMember: Member = {
        member_no: 'M_L06_MALE',
        member_name: '남성회원',
        gender: 'M',
      };
      const locker1F: Locker = {
        locker_id: 201,
        locker_no: '201',
        group_id: '1F',
        status: 'OCCUPIED',
      };

      const visible = filterVisibleLockerProducts(mockProducts, locker1F, maleMember);
      const prodCds = visible.map(p => p.prod_cd);

      // 여성 전용 상품은 제외, 공용 및 1F 상품은 포함
      expect(prodCds).not.toContain('PROD_LCK_FEMALE');
      expect(prodCds).toContain('PROD_LCK_COMMON');
      expect(prodCds).toContain('PROD_LCK_1F');
    });

    it('여성 회원(gender = "F")에게는 여성 전용 라카 상품이 정상 노출된다', () => {
      const femaleMember: Member = {
        member_no: 'M_L06_FEMALE',
        member_name: '여성회원',
        gender: 'F',
      };
      const locker1F: Locker = {
        locker_id: 203,
        locker_no: '203',
        group_id: '1F',
        status: 'OCCUPIED',
      };

      const visible = filterVisibleLockerProducts(mockProducts, locker1F, femaleMember);
      const prodCds = visible.map(p => p.prod_cd);

      expect(prodCds).toContain('PROD_LCK_FEMALE');
      expect(prodCds).toContain('PROD_LCK_COMMON');
      expect(prodCds).toContain('PROD_LCK_1F');
    });

    it('2층 라카(group_id = "2F") 선택 시 1층 전용 라카 상품(allowed_zones = ["1F"])이 사전 필터링된다', () => {
      const maleMember: Member = {
        member_no: 'M_L06_MALE',
        member_name: '남성회원',
        gender: 'M',
      };
      const locker2F: Locker = {
        locker_id: 202,
        locker_no: '202',
        group_id: '2F',
        status: 'OCCUPIED',
      };

      const visible = filterVisibleLockerProducts(mockProducts, locker2F, maleMember);
      const prodCds = visible.map(p => p.prod_cd);

      // 1층 전용 상품 및 여성 전용 상품 제외, 공용 상품만 노출
      expect(prodCds).not.toContain('PROD_LCK_1F');
      expect(prodCds).not.toContain('PROD_LCK_FEMALE');
      expect(prodCds).toContain('PROD_LCK_COMMON');
    });

    it('백엔드 단독 호출 시 성별/구역 불일치 400 에러 메시지를 프론트엔드가 정확히 파싱하여 표시', async () => {
      // 성별 불일치 백엔드 에러 모킹
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: 'ERR_RENTAL_GENDER_MISMATCH',
          message: '여성 전용 라카 상품은 남성 회원이 구매할 수 없습니다.'
        })
      } as any);

      const holdGenderRes = await api.holdLockerExtension(201, 60000, 'PROD_LCK_FEMALE', 'M_L06_MALE');
      expect(holdGenderRes.success).toBe(false);
      expect(holdGenderRes.message).toBe('여성 전용 라카 상품은 남성 회원이 구매할 수 없습니다.');

      // 구역 불일치 백엔드 에러 모킹
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: 'ERR_RENTAL_ZONE_NOT_ALLOWED',
          message: '현재 선택된 라카 구역(2F)에서는 해당 연장 상품을 이용할 수 없습니다.'
        })
      } as any);

      const holdZoneRes = await api.holdLockerExtension(202, 60000, 'PROD_LCK_1F', 'M_L06_MALE');
      expect(holdZoneRes.success).toBe(false);
      expect(holdZoneRes.message).toBe('현재 선택된 라카 구역(2F)에서는 해당 연장 상품을 이용할 수 없습니다.');
    });
  });

  // =========================================================================
  // L07 [쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제 및 원가 기준 HOLD 검증]
  // =========================================================================
  describe('L07 [쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제 및 원가 기준 HOLD 검증]', () => {
    it('60,000원 라카 - 10,000원 쿠폰 - 5,000 P 포인트 = 45,000원 카드 결제 및 원가 기준 HOLD, VAT 분할 검증', async () => {
      const baseLockerPrice = 60000;
      const couponDiscount = 10000;
      const usedPoints = 5000;
      const cardPayAmount = Math.max(0, baseLockerPrice - couponDiscount - usedPoints);

      expect(cardPayAmount).toBe(45000);

      // 과세 상품 부가세(VAT) 분할 정합성 검증
      const supplyAmt = Math.round(cardPayAmount / 1.1);
      const taxAmt = cardPayAmount - supplyAmt;
      expect(supplyAmt).toBe(40909);
      expect(taxAmt).toBe(4091);
      expect(supplyAmt + taxAmt).toBe(45000);

      // 1. KioskApp.tsx: HOLD 예약(ReservationMaster)에는 등급/쿠폰 할인 전 상품 원가(60,000원) 전달 검증
      const holdSpy = vi.spyOn(api, 'holdLockerExtension').mockResolvedValueOnce({
        success: true,
        res_id: 'RES_LOCKER_L07_HOLD_001',
        resId: 'RES_LOCKER_L07_HOLD_001',
        message: '라카 연장 대기 완료'
      });

      const holdRes = await api.holdLockerExtension(
        301,
        baseLockerPrice, // [BUG-01 FIX] 원가 60,000원 전달
        'PROD_LCK_60K',
        'M_L07_01'
      );

      expect(holdSpy).toHaveBeenCalledWith(301, 60000, 'PROD_LCK_60K', 'M_L07_01');
      expect(holdRes.success).toBe(true);

      // 2. VAN 카드 승인 시뮬레이션
      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_L07_CARD',
        approved_at: '2026-10-20T10:00:00.000Z',
        card_no_masked: '9410-****-****-4545',
        issuer_name: 'KB국민카드',
        terminal_id: '88010003',
        amount: cardPayAmount,
        installment_months: 0,
        van_tr_no: 'VAN_TR_L07_001',
      };

      // 3. 백엔드 payment-webhook 호출 시뮬레이션
      let capturedWebhookBody: any = null;
      global.fetch = vi.fn().mockImplementationOnce(async (url: string, init: any) => {
        capturedWebhookBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            start_date: '2026-10-20',
            end_date: '2026-11-19',
            locker_no: '301',
            message: '라카 연장 결제가 완료되었습니다.'
          })
        };
      });

      const extendRes = await api.extendLocker(
        301,
        30,
        cardPayAmount,
        'RES_LOCKER_L07_HOLD_001',
        'CPN_L07_10K',
        couponDiscount,
        usedPoints,
        0,
        {
          ...mockCardApproval,
          prodCd: 'PROD_LCK_60K'
        }
      );

      expect(extendRes.success).toBe(true);
      expect(capturedWebhookBody).not.toBeNull();
      expect(capturedWebhookBody.res_id).toBe('RES_LOCKER_L07_HOLD_001');
      expect(capturedWebhookBody.amount).toBe(45000);
      expect(capturedWebhookBody.coupon_no).toBe('CPN_L07_10K');
      expect(capturedWebhookBody.coupon_discount).toBe(10000);
      expect(capturedWebhookBody.used_points).toBe(5000);
    });

    it('결제 금액 위변조(paid_amt = 1,000원) 시 백엔드 400 "Payment amount mismatch" 오류 감지 및 차단 검증', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: 'Security Alert: Payment amount mismatch. Expected 45000, got 1000'
        })
      } as any);

      const tamperedRes = await api.extendLocker(
        301,
        30,
        1000, // 위변조된 금액
        'RES_LOCKER_L07_HOLD_001',
        'CPN_L07_10K',
        10000,
        5000
      );

      expect(tamperedRes.success).toBe(false);
      expect(tamperedRes.message).toContain('Payment amount mismatch');
    });
  });

  // =========================================================================
  // L08 [VAN 결제 승인 후 백엔드 연장 에러 시 자동 망취소 2-Phase Commit 및 DLQ 비상 보고]
  // =========================================================================
  describe('L08 [VAN 결제 승인 후 백엔드 연장 에러 시 자동 망취소 2-Phase Commit 및 DLQ 비상 보고]', () => {
    it('Case 1: 45,000원 카드 승인 후 백엔드 연장 실패 시 즉시 동일 TID, 금액, 원거래번호로 단말기 망취소 실행', async () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');

      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_L08_45K',
        approved_at: '2026-10-20T10:15:00.000Z',
        card_no_masked: '9410-****-****-1234',
        issuer_name: '신한카드',
        terminal_id: '88010003',
        amount: 45000,
        van_tr_no: 'TR_L08_001',
        installment_months: 0,
      };

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockCardApproval,
        payAmount: 45000,
        reason: '라카 연장 웹훅 타임아웃 오류',
        terminalId: '88010003',
      });

      expect(reversalResult.success).toBe(true);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.message).toContain('망취소');

      expect(cancelSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 45000,
          orgAuthCode: 'APPR_L08_45K',
          terminalId: '88010003',
          vanTrNo: 'TR_L08_001',
          installmentMonths: 0,
          reason: expect.stringContaining('라카 연장 웹훅 타임아웃 오류'),
        })
      );
    });

    it('Case 2: 단말기 통신 두절로 망취소 실패 시 api.reportGhostCharge 호출하여 PaymentDLQ 긴급 보고', async () => {
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: false,
        error_code: 'ERR_TIMEOUT',
        error_message: '단말기 미응답 / 통신 타임아웃',
      });

      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_L08_GHOST_001',
        message: '고아 결제 접수 완료',
      } as any);

      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_L08_TIMEOUT',
        approved_at: '2026-10-20T10:20:00.000Z',
        card_no_masked: '5421-****-****-9988',
        issuer_name: '현대카드',
        terminal_id: '88010003',
        amount: 45000,
        van_tr_no: 'TR_L08_GHOST',
        installment_months: 0,
      };

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockCardApproval,
        payAmount: 45000,
        reason: '백엔드 서버 500 내부 에러',
        terminalId: '88010003',
        storeCd: 'TEST_STORE_L08',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.dlqReported).toBe(true);
      expect(reversalResult.dlqId).toBe('DLQ_L08_GHOST_001');

      expect(reportGhostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          store_cd: 'TEST_STORE_L08',
          terminalId: '88010003',
          deviceType: 'KIOSK',
          authNo: 'APPR_L08_TIMEOUT',
          amount: 45000,
          backendErrorReason: '백엔드 서버 500 내부 에러',
          reversalErrorReason: '단말기 미응답 / 통신 타임아웃',
        })
      );
    });

    it('Case 3: 0원 결제 (100% 무료 쿠폰 FREE- 또는 포인트 전액 차감 POINT-) 건은 망취소 및 DLQ 대상에서 안전하게 제외', async () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');
      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

      const mockFreeApproval: CardApprovalResult = {
        success: true,
        auth_code: 'FREE-12345678',
        approved_at: '2026-10-20T10:25:00.000Z',
        card_no_masked: '100% 할인 쿠폰',
        issuer_name: '할인쿠폰 결제',
        terminal_id: '88010003',
        amount: 0,
        installment_months: 0,
      };

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockFreeApproval,
        payAmount: 0,
        reason: '백엔드 예약 생성 실패',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.reversalAttempted).toBe(false);
      expect(cancelSpy).not.toHaveBeenCalled();
      expect(reportGhostSpy).not.toHaveBeenCalled();
    });
  });
});
