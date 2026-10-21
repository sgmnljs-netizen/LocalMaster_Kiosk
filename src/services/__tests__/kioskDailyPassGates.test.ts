import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Daily Pass Gates, Concurrency & Reversal QA (D05, D06, D07, D08)', () => {
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../van/kioskPaymentReversal').executeKioskAutoReversal;
  let TimeMaster: typeof import('../../utils/timeMaster').TimeMaster;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanClientMod = await import('../van/van_client');
    kioskVanClient = vanClientMod.kioskVanClient;
    const reversalMod = await import('../van/kioskPaymentReversal');
    executeKioskAutoReversal = reversalMod.executeKioskAutoReversal;
    const timeMod = await import('../../utils/timeMaster');
    TimeMaster = timeMod.TimeMaster;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    kioskVanClient.setConfig({
      isMock: true,
      terminalId: 'KIOSK-T1',
      provider: 'MOCK',
    });
  });

  // =========================================================================
  // D05: 클라이언트 결제 금액 위변조 변조 요청 차단 (Price Tamper Guard)
  // =========================================================================
  describe('D05 [클라이언트 결제 금액 위변조 변조 요청 차단 (Price Tamper Guard)]', () => {
    it('20,000원 일일 타석권에 대해 1,000원으로 변조된 결제 요청 시 HTTP 400 Bad Request 차단', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const paidAmount = body.amount ?? 0;
          const expectedPrice = 20000;

          if (paidAmount !== expectedPrice) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                detail: `Security Alert: Payment amount mismatch. 결제 금액 수식 불일치: 상품 가격(${expectedPrice.toLocaleString()}원)과 결제 요청 합계(${paidAmount.toLocaleString()}원)가 일치하지 않습니다.`,
              }),
            };
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'KSK_20261020_001_D05',
              bay_no: body.bay_no,
              duration_min: body.duration_min,
              message: '타석 배정이 완료되었습니다.',
              hardware_success: true,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // 1. 위변조 결제 시도: 20,000원 상품에 1,000원 전송
      const tamperedRes = await api.allocateBay(
        1,
        60,
        undefined,
        '해커고객',
        '010-9999-8888',
        undefined,
        'CARD',
        1000, // 🚨 위변조된 금액
        {
          auth_code: '99881122',
          card_no_masked: '9410-****-****-1111',
          issuer_name: '신한카드',
          terminal_id: 'KIOSK-T1',
        },
        undefined,
        0,
        { prodCd: 'PROD-DAILY-60' }
      );

      expect(tamperedRes.success).toBe(false);
      expect(tamperedRes.message).toContain('Security Alert: Payment amount mismatch');
      expect(tamperedRes.message).toContain('20,000원');
      expect(tamperedRes.message).toContain('1,000원');

      // 2. 정상 정가(20,000원) 결제 요청 -> 성공
      const validRes = await api.allocateBay(
        1,
        60,
        undefined,
        '정상고객',
        '010-1234-5678',
        undefined,
        'CARD',
        20000,
        {
          auth_code: '99881122',
          card_no_masked: '9410-****-****-1111',
          issuer_name: '신한카드',
          terminal_id: 'KIOSK-T1',
        },
        undefined,
        0,
        { prodCd: 'PROD-DAILY-60' }
      );

      expect(validRes.success).toBe(true);
      expect(validRes.res_id).toBe('KSK_20261020_001_D05');
    });
  });

  // =========================================================================
  // D06: 영업 마감 임박 타석 시간 단축 배정 (Closing Time Truncation Guard)
  // =========================================================================
  describe('D06 [영업 마감 임박 타석 시간 단축 배정 (Closing Time Truncation Guard)]', () => {
    it('마감 40분 전 2분 버퍼 차감(38분) 안내 후 승낙 시 38분 배정 완주 및 10분 미만 임박 시 차단', async () => {
      // 1. TimeMaster 기준 22:20 기준 23:00 마감까지 잔여시간 및 버퍼 계산 검증
      const storeCloseTime = '23:00';
      const simulatedNow = new Date('2026-10-20T22:20:00+09:00');
      const diffMin = TimeMaster.getMinutesUntilClose(storeCloseTime, simulatedNow);
      expect(diffMin).toBe(40);

      const PAYMENT_BUFFER_MIN = 2;
      const prepareMin = 0; // 대기 없는 즉시 타석 기준
      const maxUserMin = Math.max(0, diffMin - (prepareMin + PAYMENT_BUFFER_MIN));
      expect(maxUserMin).toBe(38);

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/allocate-bay')) {
          callCount++;
          const body = JSON.parse((init?.body as string) || '{}');

          // Case C: 순수 가용 시간 10분 미만 (마감 8분 전)
          if (body.bay_no === 99) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: `영업 마감시간(${storeCloseTime}) 임박(최소 이용시간 10분 미만)으로 타석을 배정할 수 없습니다.`,
              }),
            };
          }

          // Case A: 사용자 승낙 전 (accept_closing_truncate=false)
          if (!body.accept_closing_truncate) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: JSON.stringify({
                  code: 'CLOSING_TRUNCATE_PROMPT',
                  max_available_min: 38,
                  total_gap_min: 40,
                  prepare_min: 2,
                  close_time: storeCloseTime,
                  message: `영업 마감시각(${storeCloseTime})까지 이용 가능한 시간은 38분입니다. 38분으로 단축하여 배정을 진행하시겠습니까?`,
                }),
              }),
            };
          }

          // Case B: 사용자 승낙 후 (accept_closing_truncate=true)
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'KSK_20261020_002_D06',
              bay_no: body.bay_no,
              duration_min: 38,
              start_time: '22:20',
              end_time: '23:00',
              message: '타석 배정이 완료되었습니다.',
              hardware_success: true,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // Step 1: 60분 일일권 요청 (단축 미승낙) -> CLOSING_TRUNCATE_PROMPT 수신
      const promptRes = await api.allocateBay(
        2,
        60,
        undefined,
        '마감임박고객A',
        '010-1111-2222',
        undefined,
        'CARD',
        20000,
        undefined,
        undefined,
        0,
        { acceptClosingTruncate: false }
      );

      expect(promptRes.success).toBe(false);
      expect(promptRes.closingPrompt).toBeDefined();
      expect(promptRes.closingPrompt?.code).toBe('CLOSING_TRUNCATE_PROMPT');
      expect(promptRes.closingPrompt?.max_available_min).toBe(38);
      expect(promptRes.closingPrompt?.close_time).toBe('23:00');

      // Step 2: 사용자 단축 모달 동의 -> acceptClosingTruncate = true로 38분 단축 배정 완주
      const confirmedRes = await api.allocateBay(
        2,
        promptRes.closingPrompt!.max_available_min,
        undefined,
        '마감임박고객A',
        '010-1111-2222',
        undefined,
        'CARD',
        20000,
        undefined,
        undefined,
        0,
        { acceptClosingTruncate: true }
      );

      expect(confirmedRes.success).toBe(true);
      expect(confirmedRes.duration_min).toBe(38);
      expect(confirmedRes.res_id).toBe('KSK_20261020_002_D06');

      // Step 3: 순수 가용 시간 10분 미만 케이스 -> 즉시 차단
      const lateRes = await api.allocateBay(
        99,
        60,
        undefined,
        '심야고객C',
        '010-3333-4444',
        undefined,
        'CARD',
        20000,
        undefined,
        undefined,
        0,
        { acceptClosingTruncate: true }
      );

      expect(lateRes.success).toBe(false);
      expect(lateRes.message).toContain('최소 이용시간 10분 미만');
    });
  });

  // =========================================================================
  // D07: 타 단말기 선점 타석(PRE_OCCUPIED) 결제 시도 시 409 Conflict 차단
  // =========================================================================
  describe('D07 [타 단말기 선점 타석(PRE_OCCUPIED) 결제 시도 시 409 Conflict 차단]', () => {
    it('Terminal A가 선점한 3번 타석에 Terminal B가 배정 요청 시 409 Conflict 차단', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const terminalId = body.terminal_id;
          const bayNo = body.bay_no;

          // 3번 타석은 KIOSK-T1이 선점(PRE_OCCUPIED) 중인 상황 시뮬레이션
          if (bayNo === 3 && terminalId !== 'KIOSK-T1') {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.',
              }),
            };
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'KSK_20261020_003_D07',
              bay_no: bayNo,
              duration_min: 60,
              message: '타석 배정이 완료되었습니다.',
              hardware_success: true,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // 1. 타 단말기 (KIOSK-T2)에서 3번 타석 배정 시도 -> 409 Conflict 거절
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T2');
      const conflictRes = await api.allocateBay(
        3,
        60,
        undefined,
        '단말기B고객',
        '010-2222-3333',
        undefined,
        'CARD',
        20000,
        undefined,
        undefined,
        0
      );

      expect(conflictRes.success).toBe(false);
      expect(conflictRes.message).toBe('다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.');

      // 2. 정당한 선점 단말기 (KIOSK-T1)에서 3번 타석 배정 시도 -> 정상 성공
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T1');
      const legitRes = await api.allocateBay(
        3,
        60,
        undefined,
        '정상선점고객A',
        '010-1111-2222',
        undefined,
        'CARD',
        20000,
        undefined,
        undefined,
        0
      );

      expect(legitRes.success).toBe(true);
      expect(legitRes.res_id).toBe('KSK_20261020_003_D07');
    });
  });

  // =========================================================================
  // D08: VAN 카드 승인 성공 후 배정 API 실패 시 자동 망취소 2-Phase Commit 및 DLQ 비상 보고
  // =========================================================================
  describe('D08 [VAN 카드 승인 성공 후 배정 API 실패 시 자동 망취소 2-Phase Commit 및 DLQ 비상 보고]', () => {
    it('Case A: 카드 승인 후 백엔드 배정 실패 시 단말기 cancelCardPayment 자동 망취소 즉시 성공', async () => {
      // 1. 20,000원 카드 결제 승인 완료
      const approval = await kioskVanClient.requestCardPayment({
        amount: 20000,
        installmentMonths: 0,
        productName: '일일 타석권 60분',
      });
      expect(approval.success).toBe(true);
      expect(approval.amount).toBe(20000);

      // 2. 단말기 망취소 스파이 설정
      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: approval.auth_code,
        cancelled_at: '2026-10-20 10:45:00',
        amount: 20000,
      });

      // 3. 백엔드 타석 배정 실패 시뮬레이션 후 executeKioskAutoReversal 호출
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approval,
        payAmount: 20000,
        reason: '백엔드 서버 500 내부 에러 / DB 락 타임아웃',
        terminalId: 'KIOSK-T1',
      });

      expect(reversalResult.success).toBe(true);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.message).toContain('망취소');

      // 단말기 취소 호출 파라미터 정합성 검증 (TID, 금액, 승인번호 일치)
      expect(cancelCardSpy).toHaveBeenCalledTimes(1);
      const cancelArgs = cancelCardSpy.mock.calls[0][0];
      expect(cancelArgs.amount).toBe(20000);
      expect(cancelArgs.orgAuthCode).toBe(approval.auth_code);
      expect(cancelArgs.terminalId).toBe('KIOSK-T1');
      expect(cancelArgs.reason).toContain('무인 키오스크 장애');
    });

    it('Case B: 망취소 실패(단말기 통신두절) 시 api.reportGhostCharge 호출로 PaymentDLQ 긴급 보고', async () => {
      // 1. 카드 승인 완료
      const approval = await kioskVanClient.requestCardPayment({
        amount: 20000,
        installmentMonths: 0,
        productName: '일일 타석권 60분',
      });

      // 2. 단말기 망취소 거절 또는 통신 두절 발생
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: false,
        error_code: 'VAN_TIMEOUT',
        error_message: '단말기 통신 타임아웃 / 망취소 응답 없음',
      });

      // 3. DLQ 보고 API 스파이 설정
      const dlqSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_20261020_001_D08',
      });

      // 4. 자동 망취소 실행 -> DLQ 보고 격상
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approval,
        payAmount: 20000,
        reason: '백엔드 타석 배정 실패: 동시 예약 충돌',
        terminalId: 'KIOSK-T1',
        storeCd: 'TEST-STORE-D08',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.dlqReported).toBe(true);
      expect(reversalResult.dlqId).toBe('DLQ_20261020_001_D08');
      expect(reversalResult.message).toContain('관제 시스템에 긴급 접수되었습니다');

      // DLQ 보고 페이로드 정합성 검증
      expect(dlqSpy).toHaveBeenCalledTimes(1);
      const dlqArgs = dlqSpy.mock.calls[0][0];
      expect(dlqArgs.amount).toBe(20000);
      expect(dlqArgs.authNo).toBe(approval.auth_code);
      expect(dlqArgs.terminalId).toBe('KIOSK-T1');
      expect(dlqArgs.deviceType).toBe('KIOSK');
      expect(dlqArgs.backendErrorReason).toContain('동시 예약 충돌');
      expect(dlqArgs.reversalErrorReason).toContain('단말기 통신 타임아웃');
    });

    it('Case C: 망취소 통신 예외(throw) 발생 시에도 안전하게 DLQ에 접수', async () => {
      const approval = await kioskVanClient.requestCardPayment({
        amount: 20000,
        installmentMonths: 0,
        productName: '일일 타석권 60분',
      });

      // 단말기 연결 완전 두절로 예외 Throw
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockRejectedValueOnce(
        new Error('Socket disconnected abruptly')
      );

      const dlqSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_20261020_SOCKET_ERR',
      });

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approval,
        payAmount: 20000,
        reason: '서버 타임아웃',
        terminalId: 'KIOSK-T1',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.dlqReported).toBe(true);
      expect(reversalResult.dlqId).toBe('DLQ_20261020_SOCKET_ERR');
      expect(dlqSpy).toHaveBeenCalledTimes(1);
      expect(dlqSpy.mock.calls[0][0].reversalErrorReason).toContain('Socket disconnected abruptly');
    });
  });
});
