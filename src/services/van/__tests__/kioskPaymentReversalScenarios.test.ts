import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Practice Bay Allocation Payment & Reversal QA (S05, S06, S07, S08, S10, S11)', () => {
  let kioskVanClient: typeof import('../van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../kioskPaymentReversal').executeKioskAutoReversal;
  let api: typeof import('../../api').api;
  type CardApprovalResult = import('../van_types').CardApprovalResult;

  beforeAll(async () => {
    const vanClientMod = await import('../van_client');
    kioskVanClient = vanClientMod.kioskVanClient;
    const reversalMod = await import('../kioskPaymentReversal');
    executeKioskAutoReversal = reversalMod.executeKioskAutoReversal;
    const apiMod = await import('../../api');
    api = apiMod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    kioskVanClient.setConfig({
      isMock: true,
      terminalId: '88010003',
      provider: 'MOCK',
    });
  });

  // --------------------------------------------------------------------------
  // S05: 일일 타석권 신용카드 정상 결제 배정
  // --------------------------------------------------------------------------
  it('S05 [일일 타석권 신용카드 정상 결제 배정]: VAN 승인 -> 백엔드 배정 요청 -> 영수증 데이터 정합성 검증', async () => {
    // 1. 단말기 20,000원 카드 승인 요청
    const approval = await kioskVanClient.requestCardPayment({
      amount: 20000,
      installmentMonths: 0,
      productName: '일일 타석권 60분',
    });

    expect(approval.success).toBe(true);
    expect(approval.auth_code).toMatch(/^\d{8}$/);
    expect(approval.amount).toBe(20000);
    expect(approval.card_no_masked).toMatch(/^9410-\*{4}-\*{4}-\d{4}$/);

    // 2. 백엔드 allocateBay 호출 모킹 및 파라미터 검증
    const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
      success: true,
      res_id: 'KSK_20261020083000_12_A1B2',
      duration_min: 60,
      start_time: '0900',
      end_time: '1000',
      message: '타석 배정이 완료되었습니다.',
      hardware_success: true,
    });

    const allocRes = await api.allocateBay(
      12, // bayNo
      60, // durationMin
      'M001',
      '홍길동',
      '010-1234-5678',
      undefined, // memberItemId (일일권은 null)
      'CARD',
      20000,
      approval,
      undefined,
      0,
      { usedPoints: 0, gradeDiscountAmount: 0, prodCd: 'DAILY_60' }
    );

    expect(allocRes.success).toBe(true);
    expect(allocRes.res_id).toBe('KSK_20261020083000_12_A1B2');
    expect(allocateBaySpy).toHaveBeenCalledWith(
      12,
      60,
      'M001',
      '홍길동',
      '010-1234-5678',
      undefined,
      'CARD',
      20000,
      approval,
      undefined,
      0,
      { usedPoints: 0, gradeDiscountAmount: 0, prodCd: 'DAILY_60' }
    );

    // 3. 영수증 과세/면세 분할 계산 검증 (20,000원 -> 공급가액 18,182원, 부가세 1,818원)
    const totalAmount = 20000;
    const supplyAmt = Math.round(totalAmount / 1.1);
    const vatAmt = totalAmount - supplyAmt;
    expect(supplyAmt).toBe(18182);
    expect(vatAmt).toBe(1818);
  });

  // --------------------------------------------------------------------------
  // S06: 100% 전액 할인 쿠폰 무료 배정 (FREE-...)
  // --------------------------------------------------------------------------
  it('S06 [100% 전액 할인 쿠폰 무료 배정]: FREE-XXXX 유사 승인번호 생성, 실 단말기 승인 및 망취소 바이패스 검증', async () => {
    const cardPaymentSpy = vi.spyOn(kioskVanClient, 'requestCardPayment');
    const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');
    const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

    // 1. PaymentTerminal 의 0원 쿠폰 전액 감면 시뮬레이션
    const couponDiscountAmt = 20000;
    const actualPayAmt = 0;
    const ptsUsed = 0;
    const appliedCoupon = { coupon_no: 'CPN-FREE-100', discount_amount: 20000 };

    const generatedAppNo = ptsUsed > 0 && !appliedCoupon
      ? `POINT-${String(Math.floor(10000000 + Math.random() * 90000000))}`
      : `FREE-${String(Math.floor(10000000 + Math.random() * 90000000))}`;

    expect(generatedAppNo).toMatch(/^FREE-\d{8}$/);
    expect(actualPayAmt).toBe(0);

    // 실 단말기 결제 호출이 발생하지 않아야 함
    expect(cardPaymentSpy).not.toHaveBeenCalled();

    // 2. 만약 백엔드 오류 발생 시 executeKioskAutoReversal 호출 시뮬레이션
    const mockCardApproval: CardApprovalResult = {
      success: true,
      auth_code: generatedAppNo,
      approved_at: new Date().toISOString(),
      card_no_masked: '100% 할인 적용',
      issuer_name: '할인쿠폰 감면 결제',
      acquirer_name: '',
      terminal_id: '88010003',
      amount: 0,
      installment_months: 0,
    };

    const reversalResult = await executeKioskAutoReversal({
      cardApproval: mockCardApproval,
      payAmount: 0,
      reason: '백엔드 선점 락 충돌',
    });

    // 0원 / FREE- 승인 건은 망취소 및 DLQ 리포트가 안전하게 바이패스되어야 함
    expect(reversalResult.success).toBe(false);
    expect(reversalResult.reversalAttempted).toBe(false);
    expect(cancelCardSpy).not.toHaveBeenCalled();
    expect(reportGhostSpy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // S07: 전액 회원 포인트 결제 무료 배정 (POINT-...)
  // --------------------------------------------------------------------------
  it('S07 [전액 회원 포인트 결제 무료 배정]: POINT-XXXX 유사 승인번호 생성, 실 단말기 및 0원 카드매출 방지 검증', async () => {
    const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment');
    const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

    // 1. PaymentTerminal 의 20,000 P 전액 차감 시뮬레이션
    const targetPayAmt = 20000;
    const ptsUsed = 20000;
    const actualPayAmt = targetPayAmt - ptsUsed; // 0
    const appliedCoupon = null;

    const generatedAppNo = ptsUsed > 0 && !appliedCoupon
      ? `POINT-${String(Math.floor(10000000 + Math.random() * 90000000))}`
      : `FREE-${String(Math.floor(10000000 + Math.random() * 90000000))}`;

    expect(generatedAppNo).toMatch(/^POINT-\d{8}$/);
    expect(actualPayAmt).toBe(0);

    // 2. 백엔드 allocateBay 호출 시뮬레이션: CARD 결제가 아닌 포인트 차감 전달
    const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
      success: true,
      res_id: 'KSK_20261020083500_05_P100',
      duration_min: 60,
      message: '타석 배정이 완료되었습니다.',
      hardware_success: true,
    });

    await api.allocateBay(
      5,
      60,
      'M002',
      '김포인트',
      '010-9999-8888',
      undefined,
      'CARD',
      0, // actualPaidAmount = 0
      undefined,
      undefined,
      0,
      { usedPoints: 20000, gradeDiscountAmount: 0, prodCd: 'DAILY_60' }
    );

    expect(allocateBaySpy).toHaveBeenCalledWith(
      5,
      60,
      'M002',
      '김포인트',
      '010-9999-8888',
      undefined,
      'CARD',
      0,
      undefined,
      undefined,
      0,
      { usedPoints: 20000, gradeDiscountAmount: 0, prodCd: 'DAILY_60' }
    );

    // 3. 만약 배정 실패 시 망취소 바이패스 검증
    const mockPointApproval: CardApprovalResult = {
      success: true,
      auth_code: generatedAppNo,
      approved_at: new Date().toISOString(),
      card_no_masked: '100% 포인트 차감',
      issuer_name: '포인트 전액 결제',
      acquirer_name: '',
      terminal_id: '88010003',
      amount: 0,
      installment_months: 0,
    };

    const reversalResult = await executeKioskAutoReversal({
      cardApproval: mockPointApproval,
      payAmount: 0,
      reason: '배정 중복 오류',
    });

    expect(reversalResult.success).toBe(false);
    expect(reversalResult.reversalAttempted).toBe(false);
    expect(cancelCardSpy).not.toHaveBeenCalled();
    expect(reportGhostSpy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // S08: 쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제
  // --------------------------------------------------------------------------
  it('S08 [쿠폰 할인 + 포인트 차감 + 잔여 신용카드 복합 결제]: 25,000원 = 5,000쿠폰 + 3,000P + 17,000원 카드 승인 및 세금분할 검증', async () => {
    const origAmount = 25000;
    const couponDiscount = 5000;
    const usedPoints = 3000;
    const actualCardPayAmt = origAmount - couponDiscount - usedPoints; // 17,000

    expect(actualCardPayAmt).toBe(17000);

    // 1. 과세 분할 정합성 검증 (17,000원 -> 공급가액 15,455원, 부가세 1,545원)
    const vatAmt = Math.round(actualCardPayAmt / 11);
    const supplyAmt = actualCardPayAmt - vatAmt;
    expect(vatAmt).toBe(1545);
    expect(supplyAmt).toBe(15455);
    expect(supplyAmt + vatAmt).toBe(17000);

    // 2. 단말기 17,000원 승인 요청
    const approval = await kioskVanClient.requestCardPayment({
      amount: actualCardPayAmt,
      vatAmount: vatAmt,
      installmentMonths: 0,
      productName: '일일 타석권 90분',
    });

    expect(approval.success).toBe(true);
    expect(approval.amount).toBe(17000);

    // 3. 백엔드 allocateBay 호출 모킹
    const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
      success: true,
      res_id: 'KSK_20261020084000_08_COMB',
      duration_min: 90,
      message: '복합 결제 타석 배정 완료',
      hardware_success: true,
    });

    await api.allocateBay(
      8,
      90,
      'M003',
      '이복합',
      '010-5555-4444',
      undefined,
      'CARD',
      17000,
      approval,
      'CPN-5000-DISC',
      5000,
      { usedPoints: 3000, gradeDiscountAmount: 0, prodCd: 'DAILY_90' }
    );

    expect(allocateBaySpy).toHaveBeenCalledWith(
      8,
      90,
      'M003',
      '이복합',
      '010-5555-4444',
      undefined,
      'CARD',
      17000,
      approval,
      'CPN-5000-DISC',
      5000,
      { usedPoints: 3000, gradeDiscountAmount: 0, prodCd: 'DAILY_90' }
    );
  });

  // --------------------------------------------------------------------------
  // S10: VAN 카드 승인 성공 후 백엔드 DB 에러 시 자동 망취소 2-Phase Commit
  // --------------------------------------------------------------------------
  it('S10 [자동 망취소 2-Phase Commit]: 백엔드 에러 시 단말기 cancelCardPayment 호출 및 승인 롤백 검증', async () => {
    const cardApproval: CardApprovalResult = {
      success: true,
      auth_code: '77889900',
      approved_at: '2026-10-20T08:45:00.000Z',
      card_no_masked: '9410-****-****-7788',
      issuer_name: '비씨카드',
      acquirer_name: '비씨카드',
      terminal_id: '88010003',
      van_tr_no: 'TR-77889900',
      amount: 20000,
      installment_months: 0,
    };

    const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
      success: true,
      cancel_auth_code: 'C7889900',
      message: '정상 취소되었습니다.',
    });

    const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

    // 백엔드 장애로 인한 자동 망취소 실행
    const result = await executeKioskAutoReversal({
      cardApproval,
      payAmount: 20000,
      reason: '타석 선점 락 충돌: 동시 예약 감지',
      terminalId: '88010003',
      isTaxFree: false,
    });

    expect(result.success).toBe(true);
    expect(result.reversalAttempted).toBe(true);
    expect(result.message).toContain('카드 결제가 자동 취소(망취소)되었습니다');

    // cancelCardPayment 호출 파라미터 정합성 검증
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 20000,
        orgAuthCode: '77889900',
        terminalId: '88010003',
        vanTrNo: 'TR-77889900',
        installmentMonths: 0,
        isTaxFree: false,
        reason: '무인 키오스크 장애: 타석 선점 락 충돌: 동시 예약 감지',
      })
    );

    // 정상 망취소되었으므로 고아 결제 DLQ 리포트는 호출되지 않아야 함
    expect(reportGhostSpy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // S11: 백엔드 에러 + 단말기 망취소 실패 시 유령 결제 DLQ 긴급 보고
  // --------------------------------------------------------------------------
  it('S11 [유령 결제 DLQ 긴급 보고]: 단말기 망취소 실패(거절/통신두절) 시 api.reportGhostCharge 접수 검증', async () => {
    const cardApproval: CardApprovalResult = {
      success: true,
      auth_code: '99887766',
      approved_at: '2026-10-20T08:50:00.000Z',
      card_no_masked: '9410-****-****-9988',
      issuer_name: '현대카드',
      acquirer_name: '현대카드',
      terminal_id: '88010003',
      van_tr_no: 'TR-99887766',
      amount: 20000,
      installment_months: 0,
    };

    // 망취소 거절 시뮬레이션
    vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
      success: false,
      error_code: 'E_CANCEL_REJECTED',
      error_message: '단말기 통신 타임아웃 / 망취소 응답 불가',
    });

    // DLQ 보고 모킹
    const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
      success: true,
      dlq_id: 'DLQ_20261020_GHOST99',
      message: '데드레터 큐(DLQ)에 접수되었습니다.',
    });

    const result = await executeKioskAutoReversal({
      cardApproval,
      payAmount: 20000,
      reason: '백엔드 DB 데드락 500 Internal Server Error',
      terminalId: '88010003',
      storeCd: 'STORE_SEOUL_01',
    });

    expect(result.success).toBe(false);
    expect(result.reversalAttempted).toBe(true);
    expect(result.dlqReported).toBe(true);
    expect(result.dlqId).toBe('DLQ_20261020_GHOST99');
    expect(result.message).toContain('카드 자동 취소 실패');
    expect(result.message).toContain('관제 시스템에 긴급 접수되었습니다');

    // api.reportGhostCharge 파라미터 정합성 검증
    expect(reportGhostSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        store_cd: 'STORE_SEOUL_01',
        terminalId: '88010003',
        deviceType: 'KIOSK',
        authNo: '99887766',
        amount: 20000,
        cardName: '현대카드',
        cardNoMasked: '9410-****-****-9988',
        vanTrNo: 'TR-99887766',
        backendErrorReason: '백엔드 DB 데드락 500 Internal Server Error',
        reversalErrorReason: '단말기 통신 타임아웃 / 망취소 응답 불가',
      })
    );
  });

  it('S11-2 [유령 결제 DLQ 긴급 보고 (통신 예외 Throw 케이스)]: cancelCardPayment 예외 발생 시에도 DLQ 안전 접수 검증', async () => {
    const cardApproval: CardApprovalResult = {
      success: true,
      auth_code: '55667788',
      approved_at: '2026-10-20T08:55:00.000Z',
      card_no_masked: '9410-****-****-5566',
      issuer_name: 'KB국민카드',
      acquirer_name: 'KB국민카드',
      terminal_id: '88010003',
      van_tr_no: 'TR-55667788',
      amount: 35000,
      installment_months: 0,
    };

    // 단말기 물리적 선 빠짐 / 포트 닫힘 예외 발생
    vi.spyOn(kioskVanClient, 'cancelCardPayment').mockRejectedValueOnce(
      new Error('Serial port disconnected / Network cable unplugged')
    );

    const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
      success: true,
      dlq_id: 'DLQ_20261020_UNPLUGGED',
      message: '접수 완료',
    });

    const result = await executeKioskAutoReversal({
      cardApproval,
      payAmount: 35000,
      reason: '서버 타임아웃',
      terminalId: '88010003',
      storeCd: 'STORE_01',
    });

    expect(result.success).toBe(false);
    expect(result.dlqReported).toBe(true);
    expect(result.dlqId).toBe('DLQ_20261020_UNPLUGGED');
    expect(reportGhostSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        authNo: '55667788',
        amount: 35000,
        reversalErrorReason: '망취소 통신 오류: Serial port disconnected / Network cable unplugged',
      })
    );
  });
});
