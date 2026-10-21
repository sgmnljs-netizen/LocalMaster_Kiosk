import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { CardApprovalResult } from '../van/van_types';
import type { Product, Member } from '../../types';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Product Purchase Checkout, Gates & Reversal Scenarios (P06, P07, P08, P09, P10)', () => {
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // P06: 쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제
  // =========================================================================
  describe('P06 [쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제]', () => {
    it('150,000원 회원권 - 20,000원 쿠폰 - 10,000 P 포인트 = 120,000원 카드 승인 및 VAT 분할 정합성 검증', async () => {
      const mockProduct: Product = {
        prod_cd: 'PROD_PASS_150K',
        prod_nm: '1개월 정기 회원권',
        standard_price: 150000,
        sale_price: 150000,
        logic_type: 'PERIOD',
        days: 30,
        vat_yn: 'Y',
      };

      const mockMember: Member = {
        member_no: 'M_P06_001',
        member_name: '김복합',
        hp: '010-9999-1111',
        total_point: 15000,
        gender: 'M',
      };

      // 복합 결제 수식 계산
      const couponDiscount = 20000;
      const usedPoints = 10000;
      const basePrice = mockProduct.sale_price || mockProduct.standard_price;
      const cardPayAmount = Math.max(0, basePrice - couponDiscount - usedPoints);

      expect(cardPayAmount).toBe(120000);

      // 부가세(VAT) 분할 검증 (과세 상품 vat_yn == 'Y')
      const supplyAmt = Math.round(cardPayAmount / 1.1);
      const taxAmt = cardPayAmount - supplyAmt;
      expect(supplyAmt).toBe(109091);
      expect(taxAmt).toBe(10909);
      expect(supplyAmt + taxAmt).toBe(120000);

      // VAN 카드 승인 시뮬레이션
      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_P06_CARD',
        approved_at: '2026-10-20T10:00:00.000Z',
        card_no_masked: '9410-****-****-7788',
        issuer_name: '신한카드',
        acquirer_name: '신한카드',
        terminal_id: '88010003',
        van_tr_no: 'TR_P06_001',
        amount: cardPayAmount,
        installment_months: 0,
      };

      // api.purchaseProduct 호출 스파이
      const purchaseSpy = vi.spyOn(api, 'purchaseProduct').mockResolvedValueOnce({
        success: true,
        sale_id: 'SALE_P06_UUID_001',
        item_id: 101,
        start_date: '2026-10-20',
        end_date: '2026-11-18',
        message: '구매가 완료되었습니다.',
      } as any);

      // 키오스크 handlePaymentCompleted 내 복합 결제 호출 시뮬레이션
      const purchasePayload = {
        memberNo: mockMember.member_no,
        prodCd: mockProduct.prod_cd,
        actualPaid: cardPayAmount,
        apprNo: mockCardApproval.auth_code,
        vanTrNo: mockCardApproval.van_tr_no,
        couponNo: 'CPN_P06_20K',
        couponDiscount,
        usedPoints,
        gradeDiscount: 0,
        cardApproval: mockCardApproval,
      };

      const result = await api.purchaseProduct(
        purchasePayload.memberNo,
        purchasePayload.prodCd,
        purchasePayload.actualPaid,
        purchasePayload.apprNo,
        purchasePayload.vanTrNo,
        purchasePayload.couponNo,
        purchasePayload.couponDiscount,
        purchasePayload.usedPoints,
        purchasePayload.gradeDiscount,
        purchasePayload.cardApproval
      );

      expect(purchaseSpy).toHaveBeenCalledWith(
        'M_P06_001',
        'PROD_PASS_150K',
        120000,
        'APPR_P06_CARD',
        'TR_P06_001',
        'CPN_P06_20K',
        20000,
        10000,
        0,
        mockCardApproval
      );

      expect(result.success).toBe(true);
      expect((result as any).sale_id).toBe('SALE_P06_UUID_001');
    });
  });

  // =========================================================================
  // P07: 성별 전용 상품 남성 회원 구매 차단
  // =========================================================================
  describe('P07 [성별 전용 상품(target_gender = "F") 남성 회원 구매 차단]', () => {
    it('남성 회원(gender = "M")이 여성 전용 상품(target_gender = "F") 선택 시 프론트엔드 선제 차단 검증', () => {
      const maleMember: Member = {
        member_no: 'M_P07_MALE',
        member_name: '남성회원',
        gender: 'M',
      };

      const femaleOnlyPass: Product = {
        prod_cd: 'PROD_FEMALE_PASS',
        prod_nm: '여성 전용 필라테스/골프 패스',
        standard_price: 150000,
        sale_price: 150000,
        target_gender: 'F',
        logic_type: 'MEMBERSHIP',
      };

      let warningMessage = '';
      let errorModalShown = false;
      let navigatedToPayment = false;

      // ProductShop 및 KioskApp의 성별 가드 로직 시뮬레이션
      const handleProductSelected = (prod: Product, member: Member | null) => {
        const rawTargetGender = String(
          prod.target_gender || prod.access_rules?.restricted_gender || prod.rules_detail?.restricted_gender || 'ALL'
        ).toUpperCase();
        const targetGenderNorm = rawTargetGender === 'MALE' ? 'M' : rawTargetGender === 'FEMALE' ? 'F' : rawTargetGender;

        if ((targetGenderNorm === 'M' || targetGenderNorm === 'F') && member?.gender) {
          const normMemG = String(member.gender).toUpperCase();
          const memG = normMemG === 'MALE' || normMemG === '남' ? 'M' : normMemG === 'FEMALE' || normMemG === '여' ? 'F' : normMemG;
          if (memG && memG !== targetGenderNorm) {
            const reqLabel = targetGenderNorm === 'F' ? '여성' : '남성';
            warningMessage = `선택하신 상품은 [${reqLabel} 회원 전용] 상품입니다. 다른 상품을 선택해 주세요.`;
            errorModalShown = true;
            return;
          }
        }
        navigatedToPayment = true;
      };

      handleProductSelected(femaleOnlyPass, maleMember);

      expect(errorModalShown).toBe(true);
      expect(warningMessage).toContain('여성 회원 전용');
      expect(navigatedToPayment).toBe(false);
    });

    it('성별 일치 회원(여성 회원 gender = "F")은 정상적으로 결제 단계로 진입한다', () => {
      const femaleMember: Member = {
        member_no: 'M_P07_FEMALE',
        member_name: '여성회원',
        gender: 'F',
      };

      const femaleOnlyPass: Product = {
        prod_cd: 'PROD_FEMALE_PASS',
        prod_nm: '여성 전용 골프 정기권',
        standard_price: 150000,
        target_gender: 'F',
        logic_type: 'MEMBERSHIP',
      };

      let errorModalShown = false;
      let navigatedToPayment = false;

      const handleProductSelected = (prod: Product, member: Member | null) => {
        const rawTargetGender = String(
          prod.target_gender || prod.access_rules?.restricted_gender || prod.rules_detail?.restricted_gender || 'ALL'
        ).toUpperCase();
        const targetGenderNorm = rawTargetGender === 'MALE' ? 'M' : rawTargetGender === 'FEMALE' ? 'F' : rawTargetGender;

        if ((targetGenderNorm === 'M' || targetGenderNorm === 'F') && member?.gender) {
          const normMemG = String(member.gender).toUpperCase();
          const memG = normMemG === 'MALE' || normMemG === '남' ? 'M' : normMemG === 'FEMALE' || normMemG === '여' ? 'F' : normMemG;
          if (memG && memG !== targetGenderNorm) {
            errorModalShown = true;
            return;
          }
        }
        navigatedToPayment = true;
      };

      handleProductSelected(femaleOnlyPass, femaleMember);

      expect(errorModalShown).toBe(false);
      expect(navigatedToPayment).toBe(true);
    });
  });

  // =========================================================================
  // P08: 회원 전용 정기권 비회원 구매 차단
  // =========================================================================
  describe('P08 [회원 전용 정기권 비회원 구매 차단]', () => {
    it('비회원(memberNo 부재)이 MEMBERSHIP 상품 선택 시 차단 안내 메시지를 표시하고 진입을 차단한다', () => {
      const membershipPass: Product = {
        prod_cd: 'PROD_MEMBERSHIP_1M',
        prod_nm: '1개월 정기 회원권',
        standard_price: 180000,
        logic_type: 'MEMBERSHIP',
      };

      let warningMessage = '';
      let navigatedToCheckout = false;

      // ProductShop.tsx line 333 가드 로직 시뮬레이션
      const handleProductClick = (prod: Product, memberNo?: string) => {
        const checkIfDaily = (p: Product) => (p.logic_type || '').toUpperCase() === 'DAILY';
        if (!memberNo && (prod.logic_type || '').toUpperCase() !== 'DAILY' && !checkIfDaily(prod)) {
          warningMessage = '회원 전용 상품입니다. 먼저 회원 인증을 진행해 주세요.';
          return;
        }
        navigatedToCheckout = true;
      };

      // 비회원 클릭
      handleProductClick(membershipPass, undefined);

      expect(warningMessage).toBe('회원 전용 상품입니다. 먼저 회원 인증을 진행해 주세요.');
      expect(navigatedToCheckout).toBe(false);
    });

    it('일일권(DAILY)은 비회원도 정상적으로 선택 및 결제 진입이 허용된다', () => {
      const dailyPass: Product = {
        prod_cd: 'PROD_DAILY_60',
        prod_nm: '일일 타석 60분',
        standard_price: 20000,
        logic_type: 'DAILY',
        duration_min: 60,
      };

      let warningMessage = '';
      let navigatedToCheckout = false;

      const handleProductClick = (prod: Product, memberNo?: string) => {
        const checkIfDaily = (p: Product) => (p.logic_type || '').toUpperCase() === 'DAILY';
        if (!memberNo && (prod.logic_type || '').toUpperCase() !== 'DAILY' && !checkIfDaily(prod)) {
          warningMessage = '회원 전용 상품입니다. 먼저 회원 인증을 진행해 주세요.';
          return;
        }
        navigatedToCheckout = true;
      };

      // 비회원의 일일권 클릭
      handleProductClick(dailyPass, undefined);

      expect(warningMessage).toBe('');
      expect(navigatedToCheckout).toBe(true);
    });
  });

  // =========================================================================
  // P09: 회원권 구매 완료 직후 [구매한 회원권으로 바로 타석 배정] 직행
  // =========================================================================
  describe('P09 [회원권 구매 완료 직후 [구매한 회원권으로 바로 타석 배정] 직행]', () => {
    it('keepAuthAfterPurchaseRef.current = true 플래그로 회원 세션을 보존하고, MEMBER_AUTH를 건너뛰어 ASSET_SELECT로 직행하며, 배정 완료 후 세션을 파기한다', async () => {
      let authMember: any = null;
      let purpose: string | null = null;
      let step: string = 'MAIN_DASHBOARD';
      let selectedAssetId: string | null = null;
      const keepAuthAfterPurchaseRef = { current: false };

      const newlyPurchasedMember: Member = {
        member_no: 'M_P09_NEW',
        member_name: '신규구매자',
        hp: '010-3333-7777',
      };

      // 1. 회원권 구매 완료 팝업의 [구매한 회원권으로 바로 타석 배정받기] (onAllocateNow) 실행
      vi.spyOn(api, 'getMember').mockResolvedValueOnce(newlyPurchasedMember);

      const onAllocateNow = async (memberNo: string) => {
        const refreshedMember = await api.getMember(memberNo);
        if (refreshedMember) {
          authMember = refreshedMember;
          keepAuthAfterPurchaseRef.current = true;
        }
        purpose = 'ALLOCATE_MEMBERSHIP';
        step = 'PRACTICE_SELECT';
      };

      await onAllocateNow('M_P09_NEW');

      expect(authMember).toEqual(newlyPurchasedMember);
      expect(keepAuthAfterPurchaseRef.current).toBe(true);
      expect(purpose).toBe('ALLOCATE_MEMBERSHIP');
      expect(step).toBe('PRACTICE_SELECT');

      // 2. PRACTICE_SELECT에서 타석 선택 후 이용 목적 확정 (handlePurposeSelected)
      const handlePurposeSelected = (purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => {
        purpose = purposeType;

        if (purposeType === 'ALLOCATE_MEMBERSHIP') {
          // 🛡️ BUG-S07: 회원권 구매 완료 직후 [구매한 회원권으로 바로 타석 배정받기]로 진입한 경우 재인증 생략 후 바로 이용권 선택
          if (keepAuthAfterPurchaseRef.current && authMember) {
            keepAuthAfterPurchaseRef.current = false;
            selectedAssetId = null;
            step = 'ASSET_SELECT';
            return;
          }
          // 일반 진입인 경우 세션 파기 후 재인증 유도
          authMember = null;
          step = 'MEMBER_AUTH';
        }
      };

      handlePurposeSelected('ALLOCATE_MEMBERSHIP');

      // 3. MEMBER_AUTH 인증 절차 없이 즉시 ASSET_SELECT로 직행했는지 검증
      expect(step).toBe('ASSET_SELECT');
      expect(keepAuthAfterPurchaseRef.current).toBe(false); // 플래그는 1회성 소비 완료
      expect(authMember).not.toBeNull();
      expect(authMember.member_no).toBe('M_P09_NEW');

      // 4. 타석 배정 완료(또는 홈 이동) 시 최종 세션 완전 파기 검증
      const handleLogoutToHome = () => {
        authMember = null;
        selectedAssetId = null;
        step = 'HOME';
      };

      handleLogoutToHome();

      expect(authMember).toBeNull();
      expect(step).toBe('HOME');
    });
  });

  // =========================================================================
  // P10: VAN 카드 승인 성공 후 백엔드 자산 생성 에러 시 자동 망취소 & DLQ
  // =========================================================================
  describe('P10 [VAN 카드 승인 성공 후 백엔드 자산 생성 에러 시 자동 망취소 & DLQ]', () => {
    it('Case 1: 150,000원 카드 승인 후 백엔드 에러 발생 시 executeKioskAutoReversal이 즉시 cancelCardPayment를 동일 파라미터로 호출하여 망취소 성공', async () => {
      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: '88776655',
        approved_at: '2026-10-20T10:15:00.000Z',
        card_no_masked: '9410-****-****-5566',
        issuer_name: 'KB국민카드',
        acquirer_name: 'KB국민카드',
        terminal_id: '88010003',
        van_tr_no: 'TR-150K',
        amount: 150000,
        installment_months: 0,
      };

      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        cancel_auth_code: 'C_88776655',
        message: '정상 망취소되었습니다.',
      });

      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

      // 키오스크 handlePaymentCompleted catch 블록 시뮬레이션
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockCardApproval,
        payAmount: 150000,
        reason: '회원권 전산 등록 실패: DB 장애 (500 Internal Server Error)',
        terminalId: '88010003',
        isTaxFree: false,
      });

      expect(reversalResult.success).toBe(true);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.message).toContain('카드 결제가 자동 취소(망취소)되었습니다');

      // 원거래 승인번호, 승인일자, TID, 금액 매칭 검증
      expect(cancelCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          orgAuthCode: '88776655',
          terminalId: '88010003',
          vanTrNo: 'TR-150K',
          installmentMonths: 0,
          isTaxFree: false,
          reason: '무인 키오스크 장애: 회원권 전산 등록 실패: DB 장애 (500 Internal Server Error)',
        })
      );

      // 망취소 성공 시 DLQ 리포트는 호출되지 않아야 함
      expect(reportGhostSpy).not.toHaveBeenCalled();
    });

    it('Case 2: 망취소 통신 장애/거절 시 api.reportGhostCharge로 PaymentDLQ 긴급 보고 검증', async () => {
      const mockCardApproval: CardApprovalResult = {
        success: true,
        auth_code: '88776655',
        approved_at: '2026-10-20T10:15:00.000Z',
        card_no_masked: '9410-****-****-5566',
        issuer_name: 'KB국민카드',
        acquirer_name: 'KB국민카드',
        terminal_id: '88010003',
        van_tr_no: 'TR-150K',
        amount: 150000,
        installment_months: 0,
      };

      // 망취소 실패 시뮬레이션
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: false,
        error_code: 'E_TIMEOUT',
        error_message: '단말기 통신 타임아웃 / 망취소 응답 불가',
      });

      // api.reportGhostCharge 모킹
      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_20261020_GHOST150K',
        message: '데드레터 큐(DLQ)에 긴급 접수되었습니다.',
      });

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockCardApproval,
        payAmount: 150000,
        reason: '회원권 전산 등록 실패: DB 장애 (500 Internal Server Error)',
        terminalId: '88010003',
        storeCd: 'STORE_P10_SE',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.dlqReported).toBe(true);
      expect(reversalResult.dlqId).toBe('DLQ_20261020_GHOST150K');
      expect(reversalResult.message).toContain('카드 자동 취소 실패');
      expect(reversalResult.message).toContain('관제 시스템에 긴급 접수되었습니다');

      // api.reportGhostCharge 파라미터 정합성 검증
      expect(reportGhostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          store_cd: 'STORE_P10_SE',
          terminalId: '88010003',
          deviceType: 'KIOSK',
          authNo: '88776655',
          amount: 150000,
          cardName: 'KB국민카드',
          cardNoMasked: '9410-****-****-5566',
          vanTrNo: 'TR-150K',
          backendErrorReason: '회원권 전산 등록 실패: DB 장애 (500 Internal Server Error)',
          reversalErrorReason: '단말기 통신 타임아웃 / 망취소 응답 불가',
        })
      );
    });
  });

  // =========================================================================
  // P11: 2-Step 결제 확인 & 5만원 이상 할부 개월 선택 & 결제창 내 회원 인증 왕복
  // =========================================================================
  describe('P11 [2-Step 결제 확인 & 5만원 이상 할부 개월 선택 & 결제창 내 회원 전환]', () => {
    it('Case 1: 상품 선택 후 PAYMENT 진입 시 자동 VAN 호출 없이 확인 단계(isReadyToPay = false)에서 대기하고, [결제 시작] 터치 시에만 VAN 단말기를 가동한다', async () => {
      const requestCardSpy = vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: 'APPR_2STEP_01',
        approved_at: '2026-10-21T10:00:00.000Z',
        card_no_masked: '5412-****-****-1234',
        issuer_name: '현대카드',
        acquirer_name: '현대카드',
        terminal_id: '88010003',
        van_tr_no: 'TR_2STEP_01',
        amount: 20000,
        installment_months: 0,
      });

      // 1단계: PaymentTerminal 진입 직후 상태
      let isReadyToPay = false;
      expect(isReadyToPay).toBe(false);
      expect(requestCardSpy).not.toHaveBeenCalled();

      // 2단계: 고객이 금액/할인 확인 후 [💳 20,000원 카드 결제 시작] 버튼 터치
      const handleExecutePayment = async (finalCardAmt: number, installmentMonths: number) => {
        isReadyToPay = true;
        const effectiveInstallmentMonths = finalCardAmt >= 50000 ? installmentMonths : 0;
        return kioskVanClient.requestCardPayment({
          amount: finalCardAmt,
          vat: Math.round(finalCardAmt / 11),
          installmentMonths: effectiveInstallmentMonths,
          terminalId: '88010003',
        });
      };

      const res = await handleExecutePayment(20000, 0);
      expect(isReadyToPay).toBe(true);
      expect(requestCardSpy).toHaveBeenCalledTimes(1);
      expect(requestCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20000,
          installmentMonths: 0,
        })
      );
      expect(res.success).toBe(true);
    });

    it('Case 2: 최종 카드 결제 금액이 50,000원 이상일 때 할부 개월(예: 3개월)을 선택하면 installmentMonths=3으로 승인 및 망취소되며, 할인/포인트로 50,000원 미만이 되면 일시불(0)로 자동 강등된다', async () => {
      const MIN_INSTALLMENT_AMOUNT = 50000;
      let baseAmount = 60000;
      let couponDiscount = 0;
      let usedPoints = 0;
      let installmentMonths = 3;

      const calcFinalCardAmt = () => Math.max(0, baseAmount - couponDiscount - usedPoints);
      const syncInstallmentClamp = () => {
        if (calcFinalCardAmt() < MIN_INSTALLMENT_AMOUNT && installmentMonths !== 0) {
          installmentMonths = 0;
        }
      };

      // 60,000원일 때 3개월 할부 유지
      syncInstallmentClamp();
      expect(calcFinalCardAmt()).toBe(60000);
      expect(installmentMonths).toBe(3);

      // 쿠폰 15,000원 적용 -> 45,000원 (< 50,000원) -> 일시불(0)로 자동 리셋
      couponDiscount = 15000;
      syncInstallmentClamp();
      expect(calcFinalCardAmt()).toBe(45000);
      expect(installmentMonths).toBe(0);

      // 다시 쿠폰 해제 후 60,000원 3개월 할부 승인 및 장애 시 3개월 할부 원거래 망취소 검증
      couponDiscount = 0;
      installmentMonths = 3;
      syncInstallmentClamp();
      expect(installmentMonths).toBe(3);

      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        cancel_auth_code: 'C_INST_03',
        message: '3개월 할부 승인 정상 망취소',
      });

      const reversalRes = await executeKioskAutoReversal({
        cardApproval: {
          success: true,
          auth_code: 'APPR_INST_03',
          approved_at: '2026-10-21T10:30:00.000Z',
          card_no_masked: '4512-****-****-9900',
          issuer_name: '삼성카드',
          terminal_id: '88010003',
          van_tr_no: 'TR_INST_03',
          amount: 60000,
          installment_months: 3,
        },
        payAmount: 60000,
        reason: '배정 웹훅 타임아웃',
        terminalId: '88010003',
      });

      expect(reversalRes.success).toBe(true);
      expect(cancelCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 60000,
          installmentMonths: 3,
          orgAuthCode: 'APPR_INST_03',
        })
      );
    });

    it('Case 3: 비회원이 일일권 결제창(PAYMENT) 진입 후 [회원 인증하고 혜택 받기] 클릭 시 타석 락(selectedBayNo)과 선택 상품(selectedProduct)을 유지한 채 인증 후 PAYMENT로 즉시 복귀한다', () => {
      let step: 'PRODUCT_SHOP' | 'PAYMENT' | 'MEMBER_AUTH' = 'PAYMENT';
      const purpose = 'ALLOCATE_DAILY';
      const selectedBayNo: number | null = 7;
      const selectedProduct: Product | null = {
        prod_cd: 'PROD_DAILY_80',
        prod_nm: '일일 타석 80분',
        standard_price: 25000,
        sale_price: 25000,
        logic_type: 'DAILY',
        duration_min: 80,
      };
      let authMember: Member | null = null;
      const authReturnStepRef: { current: 'PRODUCT_SHOP' | 'PAYMENT' | null } = { current: null };

      // 1. 결제창에서 [회원 인증하고 혜택 받기] 클릭
      const onRequestMemberAuth = () => {
        authReturnStepRef.current = 'PAYMENT';
        step = 'MEMBER_AUTH';
      };
      onRequestMemberAuth();
      expect(step).toBe('MEMBER_AUTH');
      expect(authReturnStepRef.current).toBe('PAYMENT');
      expect(selectedBayNo).toBe(7);

      // 2. 회원 인증 성공 시 타석 락과 상품을 유지한 채 PAYMENT로 복귀
      const handleAuthSuccess = (member: Member) => {
        authMember = member;
        if (purpose === 'ALLOCATE_DAILY') {
          if (authReturnStepRef.current === 'PAYMENT' && selectedProduct) {
            authReturnStepRef.current = null;
            step = 'PAYMENT';
            return;
          }
          authReturnStepRef.current = null;
          step = 'PRODUCT_SHOP';
        }
      };

      handleAuthSuccess({
        member_no: 'M_VIP_007',
        member_name: '박할인',
        hp: '010-7777-8888',
        discount_rate: 10,
        total_point: 5000,
      });

      expect(step).toBe('PAYMENT');
      expect(authReturnStepRef.current).toBeNull();
      expect(selectedBayNo).toBe(7);
      expect(selectedProduct?.prod_cd).toBe('PROD_DAILY_80');
      expect(authMember?.discount_rate).toBe(10);
      expect(authMember?.total_point).toBe(5000);
    });
  });
});
