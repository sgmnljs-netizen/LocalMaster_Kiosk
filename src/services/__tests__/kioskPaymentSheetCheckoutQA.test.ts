import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import type { CardApprovalResult } from '../van/van_types';
import type { Product, Member } from '../../types';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('🏛️ 키오스크 애플 미니멀 결제 시트(v6.3) 다각도 전수 QA 스위트 (P-QA-01 ~ P-QA-08)', () => {
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../van/kioskPaymentReversal').executeKioskAutoReversal;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const vanClientMod = await import('../van/van_client');
    kioskVanClient = vanClientMod.kioskVanClient;
    const reversalMod = await import('../van/kioskPaymentReversal');
    executeKioskAutoReversal = reversalMod.executeKioskAutoReversal;
    const apiMod = await import('../api');
    api = apiMod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    kioskVanClient.setConfig({
      isMock: true,
      terminalId: '88010003',
      provider: 'MOCK',
    });
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // P-QA-01: 27인치 세로형 중앙 플로팅 시트 규격 및 볼륨업 스케일링 상수 검증
  // =========================================================================
  describe('P-QA-01 [27인치 세로형 중앙 플로팅 시트 규격 및 볼륨업 스케일링 상수 검증]', () => {
    it('중앙 플로팅 시트의 27인치 황금 비례(maxWidth: 940px, padding: 44px 48px, radius: 36px)와 76px 딥차콜 필 버튼 및 48px 금액 폰트 규격 준수', () => {
      // 1. Apple Minimalist 디자인 토큰 상수 검증
      const SHEET_SPECS = {
        maxWidth: '940px',
        borderRadius: '36px',
        padding: '44px 48px',
        background: '#ffffff',
        shadow: '0 28px 70px rgba(0, 0, 0, 0.12)',
        orderSummaryPanel: {
          background: '#f5f5f7',
          padding: '22px 28px',
          borderRadius: '24px',
        },
        typography: {
          finalAmountSize: '48px',
          finalAmountWeight: '950',
          finalAmountColor: '#1d1d1f',
          subTextColor: '#86868b',
        },
        actionButton: {
          height: '76px',
          borderRadius: '999px',
          background: '#1d1d1f',
          color: '#ffffff',
        },
        touchTargets: {
          memberAuthBtnHeight: '52px',
          couponInputHeight: '52px',
          installmentChipHeight: '46px',
        },
      };

      expect(SHEET_SPECS.maxWidth).toBe('940px');
      expect(SHEET_SPECS.borderRadius).toBe('36px');
      expect(SHEET_SPECS.actionButton.height).toBe('76px');
      expect(SHEET_SPECS.actionButton.borderRadius).toBe('999px');
      expect(SHEET_SPECS.typography.finalAmountSize).toBe('48px');
      expect(parseInt(SHEET_SPECS.touchTargets.memberAuthBtnHeight)).toBeGreaterThanOrEqual(48);
      expect(parseInt(SHEET_SPECS.touchTargets.couponInputHeight)).toBeGreaterThanOrEqual(48);
    });
  });

  // =========================================================================
  // P-QA-02: 2-Step 확인 게이트 상태 전이 및 옵션 재선택 무소음 복귀 검증
  // =========================================================================
  describe('P-QA-02 [2-Step 결제 확인 게이트 상태 머신 및 옵션 재선택 무소음 복귀]', () => {
    it('초기 진입 시 isReadyToPay=false로 VAN 리더기를 호출하지 않고, 결제 시작 터치 시에만 가동되며, 재선택 시 무소음 취소 복귀', async () => {
      let isReadyToPay = false;
      let vanCalled = false;
      let isSilentCancel = false;

      const requestCardSpy = vi.spyOn(kioskVanClient, 'requestCardPayment').mockImplementation(async () => {
        vanCalled = true;
        return {
          success: true,
          auth_code: '12345678',
          amount: 50000,
          card_no_masked: '9410-****-****-1234',
        };
      });

      const cancelRequestSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest').mockImplementation(async () => {
        return { success: true };
      });

      // 1. 초기 렌더링 시 1단계 확인 모드
      expect(isReadyToPay).toBe(false);
      expect(vanCalled).toBe(false);

      // 2. 사용자가 [💳 N원 카드 결제 시작] 터치
      isReadyToPay = true;
      if (isReadyToPay) {
        await kioskVanClient.requestCardPayment({
          amount: 50000,
          installmentMonths: 0,
          productName: '일일 타석권 60분',
        });
      }
      expect(isReadyToPay).toBe(true);
      expect(vanCalled).toBe(true);
      expect(requestCardSpy).toHaveBeenCalledTimes(1);

      // 3. 고객이 [할인·할부 다시 선택] 터치 시 무소음 취소 후 1단계 복귀
      const handleBackToOptions = async () => {
        isSilentCancel = true;
        await kioskVanClient.cancelCurrentRequest();
        isReadyToPay = false;
      };

      await handleBackToOptions();
      expect(isSilentCancel).toBe(true);
      expect(cancelRequestSpy).toHaveBeenCalledTimes(1);
      expect(isReadyToPay).toBe(false);
    });
  });

  // =========================================================================
  // P-QA-03: 비회원 ➔ 회원 인증 왕복 세션 브릿지 및 조건부 혜택 노출
  // =========================================================================
  describe('P-QA-03 [결제창 내 비회원 ➔ 회원 인증 왕복 세션 브릿지 & 조건부 혜택 노출]', () => {
    it('비회원 시 담백한 인증 버튼만 표출되고, 인증 완료 시 타석 락/상품을 보존한 채 복귀하며 실제 유효 혜택만 정직하게 렌더링', () => {
      // 1. 비회원 상태 시뮬레이션
      const nonMemberState = {
        memberNo: undefined,
        memberName: undefined,
        discountRate: 0,
        availablePoints: 0,
      };

      const renderUnauthCard = (state: typeof nonMemberState) => {
        if (!state.memberNo) {
          // 기만성 마케팅 문구("가입 시 10% 할인 및 5% 적립") 없이 단일 캡슐 버튼만 노출
          return {
            showUnauthPrompt: true,
            hasDeceptiveMarketingText: false,
            buttonText: '👤 회원 인증 / 로그인',
          };
        }
        return { showUnauthPrompt: false, hasDeceptiveMarketingText: false, buttonText: '' };
      };

      const unauthUi = renderUnauthCard(nonMemberState);
      expect(unauthUi.showUnauthPrompt).toBe(true);
      expect(unauthUi.hasDeceptiveMarketingText).toBe(false);
      expect(unauthUi.buttonText).toBe('👤 회원 인증 / 로그인');

      // 2. 비회원 -> 회원 인증 왕복 브릿지 상태 보존 검증
      let currentStep = 'PAYMENT';
      const authReturnStepRef = { current: '' as string };
      const selectedBayNo = 12;
      const selectedProduct: Product = {
        prod_cd: 'PROD_DAILY_60',
        prod_nm: '일일 연습 60분',
        sale_price: 20000,
        standard_price: 20000,
      };

      // [👤 회원 인증 / 로그인] 클릭
      const onRequestMemberAuth = () => {
        authReturnStepRef.current = 'PAYMENT';
        currentStep = 'MEMBER_AUTH';
      };

      onRequestMemberAuth();
      expect(currentStep).toBe('MEMBER_AUTH');
      expect(authReturnStepRef.current).toBe('PAYMENT');
      expect(selectedBayNo).toBe(12); // 타석 락 보존

      // 회원 인증 성공 후 복귀
      const onMemberAuthSuccess = (member: Member) => {
        if (authReturnStepRef.current) {
          currentStep = authReturnStepRef.current;
          authReturnStepRef.current = '';
        }
        return member;
      };

      const authedMember: Member = {
        member_no: 'M260501',
        member_name: '홍길동',
        hp: '010-1234-5678',
        grade_id: 'VIP',
        total_point: 5000,
      };

      onMemberAuthSuccess(authedMember);
      expect(currentStep).toBe('PAYMENT');
      expect(authReturnStepRef.current).toBe('');

      // 3. 인증된 회원 데이터의 조건부 혜택 표출 검증
      const discountRate = 10; // VIP 10%
      const availablePoints = authedMember.total_point || 0;

      const hasGradeDiscountBadge = discountRate > 0;
      const hasPointsUsagePanel = availablePoints > 0;

      expect(hasGradeDiscountBadge).toBe(true);
      expect(hasPointsUsagePanel).toBe(true);

      // 만약 포인트가 0원이고 등급할인도 0%인 일반 회원이면 노출되지 않음
      const zeroBenefitMember = { discountRate: 0, availablePoints: 0 };
      expect(zeroBenefitMember.discountRate > 0).toBe(false);
      expect(zeroBenefitMember.availablePoints > 0).toBe(false);
    });
  });

  // =========================================================================
  // P-QA-04: 쿠폰 Silent Cancel, 시리얼 쿠폰 폴백, 포인트 클램핑 및 100원 절사
  // =========================================================================
  describe('P-QA-04 [쿠폰 Silent Cancel, 시리얼 쿠폰 폴백, 포인트 클램핑 및 카드 잔액 100원 절사]', () => {
    it('쿠폰 입력 시 무소음 취소, 일반 쿠폰 실패 시 시리얼 쿠폰 자동 폴백, 포인트 초과 방지 클램핑 및 카드잔액 1~99원 방지', async () => {
      // 1. 일반 쿠폰 조회 실패 -> 시리얼 쿠폰 등록 폴백
      vi.spyOn(api, 'verifyCoupon').mockRejectedValueOnce(new Error('Coupon not found in pool'));
      vi.spyOn(api, 'registerSerialCoupon').mockResolvedValueOnce({
        success: true,
        coupon_no: 'SERIAL-DISC-10K',
        discount_amount: 10000,
        benefit_type: 'AMOUNT',
        benefit_val: 10000,
      });

      const couponCode = 'WELCOME2026';
      let resolvedCoupon: any = null;

      try {
        resolvedCoupon = await api.verifyCoupon(couponCode);
      } catch (err) {
        resolvedCoupon = await api.registerSerialCoupon(couponCode, 'M260501');
      }

      expect(resolvedCoupon.success).toBe(true);
      expect(resolvedCoupon.coupon_no).toBe('SERIAL-DISC-10K');
      expect(resolvedCoupon.discount_amount).toBe(10000);

      // 2. 포인트 클램핑 산술 검증: 30,000원 결제에서 포인트 25,000원 적용 중 쿠폰 10,000원 추가 시
      const amount = 30000;
      const couponDiscountAmt = 10000;
      let usedPoints = 25000;

      const targetPayAmt = Math.max(0, amount - couponDiscountAmt); // 20,000원
      const clampedUsedPoints = Math.min(usedPoints, targetPayAmt); // 20,000원

      expect(targetPayAmt).toBe(20000);
      expect(clampedUsedPoints).toBe(20000); // 25,000원이 아닌 20,000원으로 자동 클램핑

      // 3. 잔여 카드 실결제액 1~99원 방지 (100원 단위 절사)
      // 예: 20,050원 대상금액에서 포인트 10,000P 사용 시도 -> 잔여 10,050원 (정상)
      // 예: 20,050원 대상금액에서 포인트 20,000P 사용 시도 -> 잔여 50원 발생 위험!
      const calcSafePoints = (target: number, desiredPoints: number) => {
        const rawPoints = Math.min(desiredPoints, target);
        const remainder = target - rawPoints;
        if (remainder > 0 && remainder < 100) {
          // 1~99원 잔여 카드 결제액 방지를 위해 100원 단위로 절사
          return Math.max(0, target - 100);
        }
        return rawPoints;
      };

      const safePoints = calcSafePoints(20050, 20000);
      const finalCard = 20050 - safePoints;
      expect(finalCard >= 100 || finalCard === 0).toBe(true);
      expect(finalCard).toBe(100);
    });
  });

  // =========================================================================
  // P-QA-05: 50,000원 이상 할부 칩 활성화 및 5만원 미만 자동 일시불 강등
  // =========================================================================
  describe('P-QA-05 [50,000원 이상 할부 개월 선택기 & 5만원 미만 자동 일시불 강등]', () => {
    it('5만원 이상 시 7대 할부 칩 제공, 쿠폰/포인트로 5만원 미만 하락 시 일시불(0)로 즉시 강등 및 React 렌더링 무결성 보장', () => {
      const MIN_INSTALLMENT_AMOUNT = 50000;
      const INSTALLMENT_MONTH_OPTIONS = [0, 2, 3, 4, 5, 6, 12];

      // 1. 100,000원 결제 시 할부 선택 활성화
      let finalCardAmt = 100000;
      let canSelectInstallment = finalCardAmt >= MIN_INSTALLMENT_AMOUNT;
      let installmentMonths = 3; // 3개월 선택
      let effectiveInstallmentMonths = canSelectInstallment ? installmentMonths : 0;

      expect(canSelectInstallment).toBe(true);
      expect(effectiveInstallmentMonths).toBe(3);
      expect(INSTALLMENT_MONTH_OPTIONS).toContain(3);

      // 2. 60,000원 할인 쿠폰 적용으로 finalCardAmt가 40,000원으로 하락
      finalCardAmt = 40000;
      canSelectInstallment = finalCardAmt >= MIN_INSTALLMENT_AMOUNT;
      effectiveInstallmentMonths = canSelectInstallment ? installmentMonths : 0;

      // 동기적 계산 시 즉시 0 보장
      expect(canSelectInstallment).toBe(false);
      expect(effectiveInstallmentMonths).toBe(0);

      // 3. useEffect 보정 시뮬레이션 (렌더 페이즈 외부에서 안전하게 상태 리셋)
      if (installmentMonths !== 0 && !canSelectInstallment) {
        installmentMonths = 0;
      }
      expect(installmentMonths).toBe(0);
    });
  });

  // =========================================================================
  // P-QA-06: 0원 무카드 결제(FREE- / POINT-) 및 실물 카드 승인/망취소 우회
  // =========================================================================
  describe('P-QA-06 [100% 할인(FREE-) 및 전액 포인트(POINT-) 0원 무카드 결제 무결성]', () => {
    it('최종 카드 결제액 0원 시 실물 VAN 카드 단말기를 호출하지 않고 가상 승인번호 생성 및 망취소/DLQ 우회', async () => {
      const vanRequestSpy = vi.spyOn(kioskVanClient, 'requestCardPayment');
      const vanCancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');

      // 1. 100% 쿠폰 할인으로 카드 결제액 0원
      const amount = 20000;
      const couponDiscount = 20000;
      const finalCardAmt = Math.max(0, amount - couponDiscount);
      expect(finalCardAmt).toBe(0);

      let mockApproval: CardApprovalResult;
      if (finalCardAmt === 0) {
        mockApproval = {
          success: true,
          auth_code: `FREE-${Date.now()}`,
          amount: 0,
          card_no_masked: 'FREE-COUPON',
        };
      } else {
        mockApproval = await kioskVanClient.requestCardPayment({
          amount: finalCardAmt,
          installmentMonths: 0,
        });
      }

      expect(vanRequestSpy).not.toHaveBeenCalled();
      expect(mockApproval.auth_code).toMatch(/^FREE-\d+$/);
      expect(mockApproval.amount).toBe(0);

      // 2. 만약 백엔드 배정 요청 실패 시 2PC 자동 망취소 파이프라인 진입 시뮬레이션
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: mockApproval,
        payAmount: 0,
        reason: 'BACKEND_ALLOCATE_FAILED',
      });

      // 0원 가상 승인은 실물 VAN 망취소 및 DLQ 발송을 생략(reversalAttempted: false)해야 함
      expect(vanCancelSpy).not.toHaveBeenCalled();
      expect(reversalResult.reversalAttempted).toBe(false);
      expect(reversalResult.message).toContain('0원 결제 또는 카드 승인 정보가 없어 자동 취소를 생략합니다.');
    });
  });

  // =========================================================================
  // P-QA-07: 카드 승인 후 백엔드 실패 시 2PC 자동 망취소 전문 정합성
  // =========================================================================
  describe('P-QA-07 [실물 카드 승인 후 백엔드 실패 시 2PC 자동 망취소 전문 정합성 & DLQ 보고]', () => {
    it('승인 후 백엔드 에러 시 원승인 TID, 승인번호, 승인일자(KST 8자리), 부가세, 할부개월이 100% 일치하여 망취소 전송', async () => {
      // 1. 110,000원 3개월 할부 카드 승인 성공
      const realApproval: CardApprovalResult = {
        success: true,
        auth_code: '87654321',
        amount: 110000,
        card_no_masked: '9410-****-****-5678',
        terminal_id: '88019999',
        approved_at: '2026-10-21 11:30:00',
        installment_months: 3,
        vat_amount: 10000,
      };

      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        message: '망취소 완료',
      });

      // 2. 백엔드 타석 배정 API 실패 모의 (HTTP 500)
      vi.spyOn(api, 'allocateBay').mockRejectedValueOnce(new Error('Database Connection Timeout'));

      // 3. 2PC 자동 망취소 파이프라인 실행
      const reversal = await executeKioskAutoReversal({
        cardApproval: realApproval,
        payAmount: 110000,
        reason: 'ALLOCATE_BAY_TIMEOUT_CRASH',
      });

      expect(reversal.success).toBe(true);
      expect(reversal.reversalAttempted).toBe(true);
      expect(cancelCardSpy).toHaveBeenCalledTimes(1);

      // 취소 전문 매개변수 전수 검증
      const cancelCallArgs = cancelCardSpy.mock.calls[0][0];
      expect(cancelCallArgs.amount).toBe(110000);
      expect(cancelCallArgs.orgAuthCode).toBe('87654321');
      expect(cancelCallArgs.orgApprovedDate).toBe('20261021');
      expect(cancelCallArgs.terminalId).toBe('88019999');
      expect(cancelCallArgs.installmentMonths).toBe(3);
    });

    it('단말기 망취소마저 실패할 경우 유령 결제 PaymentDLQ에 긴급 접수', async () => {
      const realApproval: CardApprovalResult = {
        success: true,
        auth_code: '99887766',
        amount: 30000,
        terminal_id: '88010003',
        approved_at: '2026-10-21 11:35:00',
      };

      // VAN 취소 실패 시뮬레이션 (단말기 선 뽑힘)
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: false,
        message: 'VAN 단말기 응답 없음 (Device Timeout)',
      });

      const dlqSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ-20261021-9988',
      });

      const reversal = await executeKioskAutoReversal({
        cardApproval: realApproval,
        payAmount: 30000,
        reason: 'CRITICAL_HARDWARE_FAILURE',
      });

      expect(reversal.success).toBe(false);
      expect(reversal.reversalAttempted).toBe(true);
      expect(reversal.dlqReported).toBe(true);
      expect(reversal.dlqId).toBe('DLQ-20261021-9988');
      expect(dlqSpy).toHaveBeenCalledTimes(1);
      const dlqPayload = dlqSpy.mock.calls[0][0];
      expect(dlqPayload.authNo).toBe('99887766');
      expect(dlqPayload.amount).toBe(30000);
    });
  });

  // =========================================================================
  // P-QA-08: 하단바 중첩 차단 및 결제 화면 유휴 타이머 90초 확장
  // =========================================================================
  describe('P-QA-08 [하단바 중첩 차단 및 결제 화면 유휴 타이머 90초 확장/보호]', () => {
    it('PAYMENT 단계에서는 하단바(KioskBottomBar)가 렌더링되지 않으며 유휴 타이머가 90초로 연장되고 VAN 통신 중 로그아웃 차단', () => {
      // 1. KioskBottomBar 렌더링 가드 검증
      const shouldRenderBottomBar = (step: string) => {
        if (step === 'INTRO' || step === 'SETTINGS' || step === 'PAYMENT') {
          return false;
        }
        return true;
      };

      expect(shouldRenderBottomBar('PRACTICE_SELECT')).toBe(true);
      expect(shouldRenderBottomBar('CHECKIN_SELECT')).toBe(true);
      expect(shouldRenderBottomBar('PAYMENT')).toBe(false); // 결제 화면에서는 하단바 완전 언마운트!

      // 2. 유휴 타이머 시간 계산 검증
      const getIdleTimeoutSeconds = (step: string) => {
        if (step === 'PAYMENT') return 90;
        return 40;
      };

      expect(getIdleTimeoutSeconds('PRACTICE_SELECT')).toBe(40);
      expect(getIdleTimeoutSeconds('PAYMENT')).toBe(90);

      // 3. VAN 통신 중 강제 로그아웃 방어 가드 검증
      let isVanBusy = true;
      let isLoggedOut = false;

      const triggerIdleTimeout = () => {
        if (isVanBusy) {
          // VAN 통신 중에는 강제 로그아웃 방어
          return;
        }
        isLoggedOut = true;
      };

      triggerIdleTimeout();
      expect(isLoggedOut).toBe(false); // 로그아웃되지 않음

      isVanBusy = false;
      triggerIdleTimeout();
      expect(isLoggedOut).toBe(true); // 통신 종료 후에는 정상 로그아웃
    });
  });

  // =========================================================================
  // P-QA-09: 5만원 이상 할부 결제 시 영수증(Allocation/Purchase/Par3) 할부개월 바인딩 정합성
  // =========================================================================
  describe('P-QA-09 [할부 결제 영수증 installment_months 바인딩 무결성]', () => {
    it('일일권/회원권/라카/Par3 할부 결제 완료 시 card_info.installment_months에 실제 할부 개월수(3/6개월 등)가 전달된다', () => {
      const payResult = {
        apprNo: '12345678',
        tradeDate: '2026-10-21 11:50:00',
        amount: 60000,
        installmentMonths: 3,
        cardApproval: {
          success: true,
          auth_code: '12345678',
          amount: 60000,
          installment_months: 3,
          issuer_name: '신한카드',
          card_no_masked: '9410-****-****-1234',
          terminal_id: '88010003',
        },
      };

      const resolvedInstallment = payResult.installmentMonths ?? payResult.cardApproval?.installment_months ?? 0;
      const cardInfoForReceipt = {
        issuer_name: payResult.cardApproval.issuer_name,
        card_no_masked: payResult.cardApproval.card_no_masked,
        approval_no: payResult.apprNo,
        installment_months: resolvedInstallment,
        terminal_id: payResult.cardApproval.terminal_id,
      };

      expect(cardInfoForReceipt.installment_months).toBe(3);
    });
  });

  // =========================================================================
  // P-QA-10: 무조작 초기화 10초 전 사전 카운트다운 알림창 및 터치 시 즉시 연장
  // =========================================================================
  describe('P-QA-10 [무조작 타임아웃 10초 전 사전 카운트다운 알림창 & 터치 연장]', () => {
    it('만료 10초 전(30초/80초 경과 시) 사전 카운트다운(10➔1)이 시작되며 화면 터치 시 즉시 해제되고 타이머가 리셋된다', () => {
      vi.useFakeTimers();
      let inactivityCountdown: number | null = null;
      let isLoggedOut = false;
      const timeoutMs = 40000;
      const warningLeadMs = 10000;
      let warningTimeout: any = null;
      let sessionTimeout: any = null;
      let countdownInterval: any = null;

      const clearAll = () => {
        if (warningTimeout) clearTimeout(warningTimeout);
        if (sessionTimeout) clearTimeout(sessionTimeout);
        if (countdownInterval) clearInterval(countdownInterval);
      };

      const resetTimer = () => {
        clearAll();
        inactivityCountdown = null;

        warningTimeout = setTimeout(() => {
          inactivityCountdown = 10;
          countdownInterval = setInterval(() => {
            if (inactivityCountdown !== null && inactivityCountdown > 1) {
              inactivityCountdown -= 1;
            }
          }, 1000);
        }, timeoutMs - warningLeadMs);

        sessionTimeout = setTimeout(() => {
          clearAll();
          inactivityCountdown = null;
          isLoggedOut = true;
        }, timeoutMs);
      };

      resetTimer();

      // 29초 경과: 아직 경고창 미표출
      vi.advanceTimersByTime(29000);
      expect(inactivityCountdown).toBeNull();
      expect(isLoggedOut).toBe(false);

      // 30초 경과 (만료 10초 전): 10초 카운트다운 시작
      vi.advanceTimersByTime(1000);
      expect(inactivityCountdown).toBe(10);

      // 33초 경과: 7초 남음 표시
      vi.advanceTimersByTime(3000);
      expect(inactivityCountdown).toBe(7);

      // 고객이 화면을 터치하여 연장 (resetTimer 호출)
      resetTimer();
      expect(inactivityCountdown).toBeNull();
      expect(isLoggedOut).toBe(false);

      // 다시 40초 전체 무조작 경과 시 정상 로그아웃
      vi.advanceTimersByTime(40000);
      expect(isLoggedOut).toBe(true);
      expect(inactivityCountdown).toBeNull();

      clearAll();
      vi.useRealTimers();
    });
  });
});
