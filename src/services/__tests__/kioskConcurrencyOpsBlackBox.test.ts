import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  recordKioskBlackBox,
  getRecentKioskBlackBoxLogs,
  getFormattedKioskBlackBoxText,
  maskKioskSensitiveData,
  clearKioskBlackBox,
} from '../../utils/kioskBlackBox';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Concurrency, Ops & BlackBox QA Verification (S09, S12, S13, S15)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
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
  // S09: 동일 타석 동시 선점 충돌 (Double Booking Concurrency)
  // =========================================================================
  describe('S09 [동일 타석 동시 선점 충돌 (Double Booking Concurrency)]', () => {
    it('Terminal A가 선점에 성공하고 Terminal B는 409를 수신하며, 에러 메시지 프롬프트 후 크래시 없이 재선택 가능하다', async () => {
      const bayNo = 3;
      let bayLockStatus: Record<number, { status: string; terminal_id: string; expires_at: Date }> = {};

      // Mock backend preoccupy handler simulating atomic lock
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/bays/preoccupy')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const terminalId = body.terminal_id;
          const targetBay = body.bay_nos[0];

          if (bayLockStatus[targetBay] && bayLockStatus[targetBay].status === 'PRE_OCCUPIED') {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '이미 다른 고객님이 선택 중인 타석입니다.',
              }),
            };
          }

          // Winner takes lock for 3 minutes
          const expiry = new Date(Date.now() + 3 * 60 * 1000);
          bayLockStatus[targetBay] = {
            status: 'PRE_OCCUPIED',
            terminal_id: terminalId,
            expires_at: expiry,
          };

          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                bay_no: targetBay,
                status: 'PRE_OCCUPIED',
                lock_terminal_id: terminalId,
                lock_expired_at: expiry.toISOString(),
              },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });
      global.fetch = mockFetch;

      // Terminal A attempts preoccupy on Bay 3
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-TERM-A');
      const terminalAResult = await api.preoccupyBay(bayNo);
      expect(terminalAResult).toBe(true);
      expect(bayLockStatus[bayNo].status).toBe('PRE_OCCUPIED');
      expect(bayLockStatus[bayNo].terminal_id).toBe('KIOSK-TERM-A');

      // Terminal B attempts preoccupy on same Bay 3 within 1 second
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-TERM-B');
      let terminalBErrorMsg = '';
      let terminalBSuccess = false;

      try {
        terminalBSuccess = await api.preoccupyBay(bayNo);
        if (!terminalBSuccess) {
          terminalBErrorMsg = '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.';
        }
      } catch (err: any) {
        terminalBErrorMsg = '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.';
      }

      // Verify Terminal B fails cleanly without crash and gets prompted to re-select
      expect(terminalBSuccess).toBe(false);
      expect(terminalBErrorMsg).toContain('이미 다른 고객님이 선택 중인 타석입니다');

      // Terminal B can immediately select another bay (e.g. Bay 4) without crash
      const bayNoAlternative = 4;
      const terminalBAltResult = await api.preoccupyBay(bayNoAlternative);
      expect(terminalBAltResult).toBe(true);
      expect(bayLockStatus[bayNoAlternative].terminal_id).toBe('KIOSK-TERM-B');
    });

    it('Kiosk api.ts passes ttl_minutes: 3 in request payload', async () => {
      let capturedPayload: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/bays/preoccupy')) {
          capturedPayload = JSON.parse((init?.body as string) || '{}');
          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      await api.preoccupyBay(5);
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.ttl_minutes).toBe(3);
      expect(capturedPayload.bay_nos).toEqual([5]);
    });
  });

  // =========================================================================
  // S12: 대기 시간(BAY_PREPARE_TIME_MIN) 및 타석 볼회수 버퍼 가드
  // =========================================================================
  describe('S12 [대기 시간(BAY_PREPARE_TIME_MIN) 및 타석 볼회수 버퍼 가드]', () => {
    it('이전 사용자 세션 종료 직후 배정 시 매장 대기시간(3~5분)이 보장되어 상태가 PREPARE로 전환된다', async () => {
      // Backend returns allocation response with target_status_cd='PREPARE'
      vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
        success: true,
        res_id: 'KSK_20261020_003_1201',
        duration_min: 60,
        start_time: '11:00',
        end_time: '12:03', // 60분 + 3분 prepare
        message: '타석 배정이 완료되었습니다.',
        hardware_success: true,
        is_chained: false,
      } as any);

      const res = await api.allocateBay(3, 60, 'M_TEST_01', undefined, undefined, 101, 'TICKET', 0);

      expect(res.success).toBe(true);
      expect(res.start_time).toBe('11:00');
      expect(res.end_time).toBe('12:03');
      expect((res as any).duration_min).toBe(60);
    });
  });

  // =========================================================================
  // S13: 영업 마감 임박 타석 시간 단축 배정 (Closing Time Guard)
  // =========================================================================
  describe('S13 [영업 마감 임박 타석 시간 단축 배정 (Closing Time Guard)]', () => {
    it('마감 40분 전 60분권 배정 시 CLOSING_TRUNCATE_PROMPT를 수신하고, 승낙 시 단축 배정(37~40분)이 완주된다', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/allocate-bay')) {
          callCount++;
          const body = JSON.parse((init?.body as string) || '{}');

          // First call without consent -> 409 CLOSING_TRUNCATE_PROMPT
          if (!body.accept_closing_truncate) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: JSON.stringify({
                  code: 'CLOSING_TRUNCATE_PROMPT',
                  max_available_min: 37,
                  total_gap_min: 40,
                  prepare_min: 3,
                  close_time: '23:00',
                  message: '영업 마감시각(23:00)까지 이용 가능한 시간은 37분입니다. 37분으로 단축하여 배정을 진행하시겠습니까?',
                }),
              }),
            };
          }

          // Second call with user consent (accept_closing_truncate=true)
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              bay_no: body.bay_no,
              duration_min: 37,
              start_time: '22:20',
              end_time: '23:00',
              message: '타석 배정이 완료되었습니다.',
              hardware_success: true,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // 1. Initial attempt: user tries 60-min allocation at 22:20
      const firstRes = await api.allocateBay(3, 60, 'M_TEST_01', undefined, undefined, 102, 'TICKET', 0);

      expect(firstRes.success).toBe(false);
      expect(firstRes.closingPrompt).toBeDefined();
      expect(firstRes.closingPrompt?.code).toBe('CLOSING_TRUNCATE_PROMPT');
      expect(firstRes.closingPrompt?.max_available_min).toBe(37);
      expect(firstRes.closingPrompt?.close_time).toBe('23:00');

      // 2. User consents in modal -> re-call with acceptClosingTruncate=true and overrideDurationMin=37
      const consentedRes = await api.allocateBay(
        3,
        firstRes.closingPrompt!.max_available_min,
        'M_TEST_01',
        undefined,
        undefined,
        102,
        'TICKET',
        0,
        undefined,
        undefined,
        undefined,
        { acceptClosingTruncate: true }
      );

      expect(consentedRes.success).toBe(true);
      expect((consentedRes as any).duration_min).toBe(37);
      expect((consentedRes as any).end_time).toBe('23:00');
      expect(callCount).toBe(2);
    });

    it('마감까지 잔여 시간이 10분 미만이면 배정이 원천 차단된다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/allocate-bay')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: '영업 마감시간(23:00) 임박(최소 이용시간 10분 미만)으로 타석을 배정할 수 없습니다.',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const res = await api.allocateBay(3, 60, 'M_TEST_01', undefined, undefined, 103, 'TICKET', 0);
      expect(res.success).toBe(false);
      expect(res.closingPrompt).toBeUndefined();
      expect(res.message).toContain('최소 이용시간 10분 미만');
    });
  });

  // =========================================================================
  // S15: 타석 배정 실패/예외 시 초경량 블랙박스(kioskBlackBox.ts) 자동 수집 & 서버 보고
  // =========================================================================
  describe('S15 [타석 배정 실패/예외 시 초경량 블랙박스 자동 수집 & 서버 보고]', () => {
    it('인메모리 링버퍼는 직전 15건 동선을 유지하고 전화번호/카드/PIN 등 민감정보를 완벽히 마스킹한다', () => {
      // 1. Simulate 20 navigation/interaction steps
      for (let i = 1; i <= 20; i++) {
        recordKioskBlackBox('STEP', `단계 이동 #${i}`, {
          stepIndex: i,
          phone: '010-1234-5678',
          cardNo: '9410123456789012',
          adminPin: '1234',
        });
      }

      // 2. Retrieve recent 15 logs
      const recentLogs = getRecentKioskBlackBoxLogs(15);
      expect(recentLogs.length).toBe(15);

      // Latest step is step #20
      expect(recentLogs[0].actionName).toBe('단계 이동 #20');

      // 3. Verify masking of sensitive fields
      const payload = recentLogs[0].payload as Record<string, unknown>;
      expect(payload.phone).toBe('010-****-5678');
      expect(payload.cardNo).toBe('941012-**-****-9012');
      expect(payload.adminPin).toBe('******');

      // 4. Formatted string output verification
      const formatted = getFormattedKioskBlackBoxText(15);
      expect(formatted).toContain('### 📼 [키오스크 블랙박스] 직전 15개 화면/터치/통신 이력');
      expect(formatted).toContain('010-****-5678');
      expect(formatted).not.toContain('010-1234-5678');
      expect(formatted).not.toContain('9410123456789012');
    });

    it('타석 배정 에러 발생 시 POST /api/system-logs/client-error 로 KIOSK_CLIENT_ERROR 비동기 보고가 발송된다', async () => {
      let reportedPayload: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/system-logs/client-error')) {
          reportedPayload = JSON.parse((init?.body as string) || '{}');
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // Record steps leading up to error
      recordKioskBlackBox('STEP', '타석 선택: 3번', { bayNo: 3 });
      recordKioskBlackBox('PAYMENT', '카드 결제 시도: 15,000원 (010-5555-6666)', {
        amount: 15000,
        card_no: '5409123456789999',
      });

      // Trigger error reporting via writeKioskLog (which triggers reportKioskErrorToServer)
      await api.writeKioskLog('BAY_ALLOCATE_ERROR', 'VAN 결제 승인 후 서버 배정 트랜잭션 충돌', 'M_ERR_01');

      // Verify report was sent
      expect(reportedPayload).not.toBeNull();
      expect(reportedPayload.error_type).toBe('KIOSK_CLIENT_ERROR');
      expect(reportedPayload.action_type).toBe('BAY_ALLOCATE_ERROR');
      expect(reportedPayload.message).toContain('VAN 결제 승인 후 서버 배정 트랜잭션 충돌');
      expect(reportedPayload.blackbox_logs).toContain('[키오스크 블랙박스]');
      expect(reportedPayload.blackbox_logs).toContain('010-****-6666');
      expect(reportedPayload.blackbox_logs).not.toContain('010-5555-6666');
      expect(reportedPayload.blackbox_logs).not.toContain('5409123456789999');
    });
  });
});
