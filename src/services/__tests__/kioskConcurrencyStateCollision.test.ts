import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  recordKioskBlackBox,
  getRecentKioskBlackBoxLogs,
  maskKioskSensitiveData,
  clearKioskBlackBox,
} from '../../utils/kioskBlackBox';
import type { CardApprovalResult } from '../van/van_types';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Cross-Device State Collision & Asset Double-Deduct QA Verification (C03, C04, C06, C08)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../van/kioskPaymentReversal').executeKioskAutoReversal;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanClientMod = await import('../van/van_client');
    kioskVanClient = vanClientMod.kioskVanClient;
    const reversalMod = await import('../van/kioskPaymentReversal');
    executeKioskAutoReversal = reversalMod.executeKioskAutoReversal;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearKioskBlackBox();
    storageMap.clear();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // C03: 키오스크 결제 승인 중 포스 관리자 강제 점검(MAINTENANCE) 전환 충돌 ➔ 2PC 자동 망취소
  // =========================================================================
  describe('C03 [키오스크 결제 승인 중 포스 관리자 강제 점검(MAINTENANCE) 전환 충돌 ➔ 2PC 자동 망취소 & DLQ]', () => {
    it('고객 결제 승인(20,000원) 후 서버 배정 트랜잭션 충돌(점검중 HTTP 409) 시 즉시 VAN 자동 망취소(2PC)를 수행한다', async () => {
      const bayNo = 2;
      const approvalData: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_C03_20000',
        amount: 20000,
        issuer_name: '현대카드',
        acquirer_name: '비씨카드',
        card_no_masked: '5424-****-****-1234',
        van_tr_no: 'VAN-TR-C03-001',
        terminal_id: 'KIOSK-A',
        approved_at: '20261020120000',
        installment_months: 0,
        merchant_reg_no: '123-45-67890',
      };

      // Mock backend allocate-bay returning HTTP 409 (점검 중 전환 충돌)
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/v1/kiosk/allocate-bay')) {
          recordKioskBlackBox('BAY_ALLOCATE_CONFLICT', {
            bay_no: bayNo,
            reason: '점검 중이거나 배정할 수 없는 상태의 타석입니다.',
          });
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: '점검 중이거나 배정할 수 없는 상태의 타석입니다.',
              code: 'ERR_BAY_MAINTENANCE_CONFLICT',
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // 단말기 망취소 Spy 등록 (정상 성공 모의)
      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: 'APPR_C03_20000',
        error_message: '',
        raw_response: { code: '0000', msg: '망취소 정상 승인' },
      });

      // 1. 키오스크 allocateBay 호출 -> 실패(409)
      const allocResult = await api.allocateBay(
        bayNo,
        60,
        'GUEST',
        '홍길동',
        '010-1234-5678',
        undefined,
        'CARD',
        20000,
        approvalData
      );

      expect(allocResult.success).toBe(false);
      expect(allocResult.message).toContain('점검 중이거나 배정할 수 없는 상태의 타석입니다.');

      // 2. Kiosk UI의 2-Phase Commit 보상 트랜잭션 (자동 망취소) 트리거
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approvalData,
        payAmount: 20000,
        reason: allocResult.message,
        terminalId: 'KIOSK-A',
        storeCd: 'STORE_QA',
      });

      // 3. 검증: 단말기 자동 망취소가 정확한 파라미터로 즉시 호출되고 성공
      expect(reversalResult.success).toBe(true);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(cancelCardSpy).toHaveBeenCalledTimes(1);
      expect(cancelCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20000,
          orgAuthCode: 'APPR_C03_20000',
          orgApprovedDate: '20261020',
          terminalId: 'KIOSK-A',
          vanTrNo: 'VAN-TR-C03-001',
        })
      );
    });

    it('망취소 통신 두절/거절 시 api.reportGhostCharge를 호출하여 PaymentDLQ에 텔레그램 긴급 사이렌을 접수한다', async () => {
      const bayNo = 2;
      const approvalData: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_GHOST_C03',
        amount: 20000,
        issuer_name: '신한카드',
        card_no_masked: '9410-****-****-9999',
        van_tr_no: 'VAN-TR-GHOST-01',
        terminal_id: 'KIOSK-A',
        approved_at: '20261020120500',
        installment_months: 0,
      };

      // Mock backend: allocate-bay 409, report-ghost-charge 201 Created
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/v1/kiosk/allocate-bay')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ detail: '점검 중이거나 배정할 수 없는 상태의 타석입니다.' }),
          };
        }
        if (url.includes('/sales/dlq/report-ghost-charge')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              dlq_id: 'DLQ_20261020_ABCD1234',
              telegram_sent: true,
              message: '고아 결제(Ghost Charge) 긴급 접수 완료',
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // 단말기 망취소 통신 장애(네트워크 에러) 모의
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockRejectedValueOnce(
        new Error('VAN 단말기 직렬 포트 응답 없음 (Timeout 5000ms)')
      );

      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

      // 1. 배정 시도 -> 409
      const allocResult = await api.allocateBay(
        bayNo,
        60,
        'GUEST',
        '김고아',
        '010-9999-8888',
        undefined,
        'CARD',
        20000,
        approvalData
      );
      expect(allocResult.success).toBe(false);

      // 2. 2PC 망취소 시도 -> 단말기 에러 -> DLQ 긴급 에스컬레이션
      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approvalData,
        payAmount: 20000,
        reason: allocResult.message,
        terminalId: 'KIOSK-A',
        storeCd: 'STORE_QA',
      });

      expect(reversalResult.success).toBe(false);
      expect(reversalResult.reversalAttempted).toBe(true);
      expect(reversalResult.dlqReported).toBe(true);
      expect(reversalResult.dlqId).toBe('DLQ_20261020_ABCD1234');
      expect(reportGhostSpy).toHaveBeenCalledTimes(1);
      expect(reportGhostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          authNo: 'APPR_GHOST_C03',
          amount: 20000,
          cardName: '신한카드',
        })
      );
    });
  });

  // =========================================================================
  // C04: 동일 회원의 다중 단말기 동시 인증/중복 이용권 차감 차단 (Atomic SELECT FOR UPDATE)
  // =========================================================================
  describe('C04 [동일 회원의 다중 단말기 동시 인증/중복 이용권 차감 차단 (Atomic SELECT FOR UPDATE)]', () => {
    it('잔여 1회권 보유 회원이 단말기 A, B에서 동시 차감 클릭 시 1st는 성공하고 2nd는 400 Bad Request로 차단되어 음수 전락을 방지한다', async () => {
      let memberPassRemaining = 1; // 원자적 자산 상태

      // Mock backend allocate-bay simulating SELECT FOR UPDATE
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/v1/kiosk/allocate-bay')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const terminalId = body.terminal_id;

          // 원자적 잔여 횟수 평가
          if (memberPassRemaining < 1) {
            recordKioskBlackBox('ALLOCATION', 'TICKET_DEDUCT_EXHAUSTED', {
              member_no: body.member_no,
              item_id: body.member_item_id,
              terminal_id: terminalId,
              rem_count: memberPassRemaining,
            });
            return {
              ok: false,
              status: 400,
              json: async () => ({
                detail: `이용 가능한 잔여 횟수가 부족합니다. (이용권 ID: ${body.member_item_id})`,
                code: 'ERR_TICKET_EXHAUSTED',
              }),
            };
          }

          // 1st caller 차감
          memberPassRemaining -= 1;
          recordKioskBlackBox('ALLOCATION', 'TICKET_DEDUCTED_SUCCESS', {
            member_no: body.member_no,
            item_id: body.member_item_id,
            terminal_id: terminalId,
            rem_count_after: memberPassRemaining,
          });

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: `RES_TICKET_${Date.now()}_${terminalId}`,
              bay_no: body.bay_no,
              is_chained: false,
              message: '타석 배정이 완료되었습니다.',
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // Terminal A & Terminal B 동시 호출 시뮬레이션
      const [callA, callB] = await Promise.all([
        api.allocateBay(10, 60, 'M_C04', '정동시', '010-7777-8888', 9401, 'TICKET', 0),
        api.allocateBay(11, 60, 'M_C04', '정동시', '010-7777-8888', 9401, 'TICKET', 0),
      ]);

      // 하나는 성공하고 다른 하나는 실패
      const successCall = callA.success ? callA : callB;
      const failedCall = !callA.success ? callA : callB;

      expect(successCall.success).toBe(true);
      expect(failedCall.success).toBe(false);
      expect(failedCall.message).toContain('이용 가능한 잔여 횟수가 부족합니다.');

      // 잔여 횟수가 절대 음수(-1)로 떨어지지 않고 정확히 0으로 유지됨을 검증
      expect(memberPassRemaining).toBe(0);

      // 블랙박스 감사 로그에 자산 고갈 이벤트가 안전하게 마스킹 기록되었는지 확인
      const logs = getRecentKioskBlackBoxLogs();
      const exhaustedLog = logs.find(l => l.actionName === 'TICKET_DEDUCT_EXHAUSTED');
      expect(exhaustedLog).toBeDefined();
    });
  });

  // =========================================================================
  // C06: 키오스크 타석 선점 만료 직전 카운터 포스 실시간 배정 경쟁
  // =========================================================================
  describe('C06 [키오스크 타석 선점 만료 직전 카운터 포스 실시간 배정 경쟁]', () => {
    it('선점 TTL(3분) 만료 직후 포스가 타석을 OCCUPIED로 선점한 경우, 키오스크의 배정 시도는 409로 거절되고 자동 망취소 롤백된다', async () => {
      const bayNo = 4;
      let bayStatus = 'AVAILABLE';
      let lockTerminalId: string | null = null;
      let lockExpiresAt: number = 0;

      // 1. 키오스크 A 선점 락 획득 (3분 = 3 * 60 * 1000 ms)
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/bays/preoccupy')) {
          bayStatus = 'PRE_OCCUPIED';
          lockTerminalId = 'KIOSK-A';
          lockExpiresAt = Date.now() + 3 * 60 * 1000;
          return {
            ok: true,
            status: 200,
            json: async () => [{ bay_no: bayNo, status: 'PRE_OCCUPIED', lock_terminal_id: 'KIOSK-A' }],
          };
        }
        if (url.includes('/v1/kiosk/allocate-bay')) {
          // 백엔드에서 락 만료 및 포스 점유 충돌 검증
          if (bayStatus === 'OCCUPIED' && lockTerminalId !== 'KIOSK-A') {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '선택하신 타석의 선점 시간이 만료되어 다른 고객에게 배정되었습니다. (결제는 자동 환불됩니다)',
                code: 'ERR_LOCK_EXPIRED_COLLISION',
              }),
            };
          }
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = mockFetch;

      const preRes = await api.preoccupyBay(bayNo);
      expect(preRes).toBe(true);
      expect(bayStatus).toBe('PRE_OCCUPIED');

      // 2. 시간 경과 시뮬레이션: 3분 초과 (만료) 및 카운터 포스에서 현장 워크인 손님에게 배정 확정
      lockExpiresAt = Date.now() - 1000; // 만료됨
      bayStatus = 'OCCUPIED';
      lockTerminalId = null; // 포스에 의해 클리어됨

      // 3. 결제 승인 후 키오스크 A에서 최종 배정 요청 시도
      const approvalData: CardApprovalResult = {
        success: true,
        auth_code: 'APPR_C06_EXP',
        amount: 20000,
        issuer_name: '신한카드',
        card_no_masked: '9410-****-****-4321',
        van_tr_no: 'VAN-TR-C06-001',
        terminal_id: 'KIOSK-A',
        approved_at: '20261020121000',
        installment_months: 0,
      };

      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: 'APPR_C06_EXP',
        error_message: '',
      });

      const allocResult = await api.allocateBay(
        bayNo,
        60,
        'GUEST',
        '키오스크지연고객',
        '010-4444-5555',
        undefined,
        'CARD',
        20000,
        approvalData
      );

      // 4. 백엔드에서 409 Conflict 수신 및 자동 망취소 트리거 검증
      expect(allocResult.success).toBe(false);
      expect(allocResult.message).toContain('선점 시간이 만료되어 다른 고객에게 배정되었습니다');

      const reversalResult = await executeKioskAutoReversal({
        cardApproval: approvalData,
        payAmount: 20000,
        reason: allocResult.message,
        terminalId: 'KIOSK-A',
        storeCd: 'STORE_QA',
      });

      expect(reversalResult.success).toBe(true);
      expect(cancelCardSpy).toHaveBeenCalledTimes(1);
      expect(cancelCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20000,
          orgAuthCode: 'APPR_C06_EXP',
        })
      );
    });
  });

  // =========================================================================
  // C08: 라카 연장 동일 라카 동시 결제 시도 원천 차단 (Locker Double Extension Guard)
  // =========================================================================
  describe('C08 [라카 연장 동일 라카 동시 결제 시도 원천 차단 (Locker Double Extension Guard)]', () => {
    it('Kiosk A와 Kiosk B가 동일 Locker #105 연장을 동시 시도 시 1st는 HOLD 획득, 2nd는 409 Conflict로 차단되어 이중 결제를 방지한다', async () => {
      const lockerId = 105;
      let activeHoldTerminal: string | null = null;
      let holdExpiresAt: number = 0;

      // Mock backend holdLockerExtension simulating active HOLD guard
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/v1/kiosk/lockers/extend/hold')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const headers = (init?.headers as Record<string, string>) || {};
          const terminalId = body.terminal_id || headers['x-terminal-id'] || 'UNKNOWN';

          const now = Date.now();
          const isActiveHold = activeHoldTerminal !== null && now < holdExpiresAt;

          if (isActiveHold && activeHoldTerminal !== terminalId) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '이미 연장 결제가 진행 중인 라카입니다.',
                code: 'ERR_LOCKER_ALREADY_HOLD',
              }),
            };
          }

          // 락 획득 (3분 = 3 * 60 * 1000 ms)
          activeHoldTerminal = terminalId;
          holdExpiresAt = now + 3 * 60 * 1000;

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: `RES_LOCKER_${now}_${lockerId}`,
              message: '라카 연장 대기가 완료되었습니다. 결제를 진행해주세요.',
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // 1. Kiosk A가 먼저 Locker #105 연장 홀드 요청 -> 성공
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-A');
      const holdA = await api.holdLockerExtension(lockerId, 30000, 'PROD_LOCKER_30D', 'M_01', 105);

      expect(holdA.success).toBe(true);
      expect(holdA.res_id).toContain('RES_LOCKER_');
      expect(activeHoldTerminal).toBe('KIOSK-A');

      // 2. Kiosk B가 동일 Locker #105 연장 홀드 동시 요청 -> 409 Conflict 차단
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-B');
      const holdB = await api.holdLockerExtension(lockerId, 30000, 'PROD_LOCKER_30D', 'M_01', 105);

      expect(holdB.success).toBe(false);
      expect(holdB.message).toBe('이미 연장 결제가 진행 중인 라카입니다.');

      // 3. Kiosk B는 결제(VAN)를 시도조차 하지 않으므로 이중 결제가 원천 방어됨
      expect(activeHoldTerminal).toBe('KIOSK-A');

      // 4. [동일 단말기 재시도 허용] Kiosk A가 상품 변경 등으로 다시 요청하면 성공
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-A');
      const holdARetry = await api.holdLockerExtension(lockerId, 50000, 'PROD_LOCKER_60D', 'M_01', 105);
      expect(holdARetry.success).toBe(true);
    });
  });
});
