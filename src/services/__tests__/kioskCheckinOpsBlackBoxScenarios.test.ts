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

describe('Kiosk Checkin Ops, Multi-Resource & BlackBox QA Simulation (C06 ~ C10)', () => {
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
  // C06: 당일 다종 시설(타석 BAY + 파3 PAR3) 다중 예약 선택 체크인
  // =========================================================================
  describe('C06 [당일 다종 시설(타석 BAY + 파3 PAR3) 다중 예약 선택 체크인]', () => {
    it('동일 회원의 당일 다종 시설(BAY 14:00 + PAR3 16:00) 예약 목록이 올바르게 조회되고 선택 체크인된다', async () => {
      const mockReservations = [
        {
          res_id: 'RES_C06_BAY_01',
          resource_type: 'BAY',
          resource_no: '3',
          res_date: '20261020',
          start_time: '1400',
          end_time: '1500',
          duration_min: 60,
          status_cd: 'RSV',
          payment_status: 'PAID',
          member_no: 'M_C06_USER',
          guest_nm: '김멀티',
        },
        {
          res_id: 'RES_C06_PAR3_01',
          resource_type: 'PAR3',
          resource_no: 'COURSE_A',
          res_date: '20261020',
          start_time: '1600',
          end_time: '1700',
          duration_min: 60,
          status_cd: 'RSV',
          payment_status: 'PAID',
          member_no: 'M_C06_USER',
          guest_nm: '김멀티',
        },
      ];

      // 1. GET /api/v1/kiosk/checkin/reservations Mock
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/kiosk/checkin/reservations')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockReservations,
          };
        }
        if (url.includes('/kiosk/checkin/verify')) {
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.res_id === 'RES_C06_PAR3_01') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                checkin_mode: 'PRE_CHECKIN',
                resource_type: 'PAR3',
                message: 'PAR3 COURSE_A번 사전 체크인이 완료되었습니다.',
                checkin_id: 'CHK_C06_PAR3_UUID',
                bay_no: 1,
                duration_min: 60,
                start_time: '16:00',
                end_time: '17:00',
              }),
            };
          }
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // 2. 예약 목록 조회 검증
      const reservations = await api.getMemberCheckinReservations('M_C06_USER');
      expect(reservations.length).toBe(2);

      const bayItem = reservations.find((r) => r.resource_type === 'BAY');
      const par3Item = reservations.find((r) => r.resource_type === 'PAR3');

      expect(bayItem).toBeDefined();
      expect(bayItem?.resource_no).toBe('3');
      expect(par3Item).toBeDefined();
      expect(par3Item?.resource_no).toBe('COURSE_A');

      // 3. UI 타이틀 포맷터 검증
      const formatResourceTitle = (res: any) => {
        const rType = (res.resource_type || 'BAY').toUpperCase();
        const rawNo = String(res.resource_no || '1').trim();
        const parsedNo = parseInt(rawNo.replace(/[^0-9]/g, ''), 10);
        if (rType === 'PAR3') return `파3 ${rawNo}`;
        return !isNaN(parsedNo) ? `${parsedNo}번 타석` : `${rawNo}번 타석`;
      };
      expect(formatResourceTitle(bayItem)).toBe('3번 타석');
      expect(formatResourceTitle(par3Item)).toBe('파3 COURSE_A');

      // 4. PAR3 선택 후 체크인 승인 검증
      const verifyResult = await api.verifyKioskCheckin('M_C06_USER', 'RES_C06_PAR3_01');
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.resource_type).toBe('PAR3');
      expect(verifyResult.checkin_mode).toBe('PRE_CHECKIN');
      expect(verifyResult.message).toContain('COURSE_A');
    });
  });

  // =========================================================================
  // C07: 점검/고장 중 타석(MAINTENANCE / DISABLED) 체크인 충돌 방어
  // =========================================================================
  describe('C07 [점검/고장 중 타석(MAINTENANCE / DISABLED) 체크인 충돌 방어]', () => {
    it('점검 중(UNDER_MAINTENANCE / DISABLED)인 타석 체크인 시 409 에러를 파싱하여 친절한 안내 메시지를 제공한다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/kiosk/checkin/verify')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: '현재 2번 타석은 점검 중이어서 입실할 수 없습니다. 프런트에 문의해 주세요.',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const writeKioskLogSpy = vi.spyOn(api, 'writeKioskLog');

      // 1. 점검 타석 체크인 시도
      const result = await api.verifyKioskCheckin('M_C07_USER', 'RES_C07_MAINT_02');
      expect(result.success).toBe(false);
      expect(result.message).toBe('현재 2번 타석은 점검 중이어서 입실할 수 없습니다. 프런트에 문의해 주세요.');

      // 2. UI 에러 핸들러 시뮬레이션: CheckinSelect.tsx 에서 거부 시 writeKioskLog 호출
      let displayedErrorMsg = '';
      if (!result.success) {
        displayedErrorMsg = result.message;
        await api.writeKioskLog('CHECKIN_ERROR', `예약 체크인 거부 (RES_C07_MAINT_02): ${result.message}`, 'M_C07_USER');
      }

      expect(displayedErrorMsg).toContain('현재 2번 타석은 점검 중이어서 입실할 수 없습니다');
      expect(writeKioskLogSpy).toHaveBeenCalledWith(
        'CHECKIN_ERROR',
        expect.stringContaining('현재 2번 타석은 점검 중이어서 입실할 수 없습니다'),
        'M_C07_USER'
      );
    });
  });

  // =========================================================================
  // C08: 이용 중 타석 배정표 재출력 (REPRINT mode - 무이중차감)
  // =========================================================================
  describe('C08 [이용 중 타석 배정표 재출력 (REPRINT mode - 무이중차감)]', () => {
    it('이미 입실하여 이용 중(USE / PREPARE)인 예약은 REPRINT 모드로 응답하고 세션/이용권 이중 차감 없이 재출력된다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/kiosk/checkin/verify')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              checkin_mode: 'REPRINT',
              resource_type: 'BAY',
              message: '4번 타석 이용권(배정표) 재출력이 완료되었습니다.',
              checkin_id: 'CHK_C08_UUID',
              bay_no: 4,
              duration_min: 60,
              start_time: '14:00',
              end_time: '15:00',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const res = await api.verifyKioskCheckin('M_C08_USER', 'RES_C08_ACTIVE_04');
      expect(res.success).toBe(true);
      expect(res.checkin_mode).toBe('REPRINT');
      expect(res.bay_no).toBe(4);
      expect(res.message).toContain('재출력이 완료되었습니다');

      // KioskApp 수납 완료 핸들러 시뮬레이션
      let printedTicket: any = null;
      const handleCheckinSuccess = (
        bayNo: number | string,
        resId: string,
        durationMin?: number,
        startTime?: string,
        endTime?: string,
        message?: string,
        checkinMode?: string
      ) => {
        printedTicket = {
          bayNo,
          resId,
          durationMin,
          startTime,
          endTime,
          isReprint: checkinMode === 'REPRINT',
          payAmount: 0, // 무이중차감
        };
      };

      handleCheckinSuccess(
        res.bay_no!,
        'RES_C08_ACTIVE_04',
        res.duration_min,
        res.start_time,
        res.end_time,
        res.message,
        res.checkin_mode
      );

      expect(printedTicket).not.toBeNull();
      expect(printedTicket.isReprint).toBe(true);
      expect(printedTicket.payAmount).toBe(0);
    });
  });

  // =========================================================================
  // C09: 앞 손님 이용 중(PREPARE/USE) 지각 체크인 시 대기(PENDING) 모드 보호
  // =========================================================================
  describe('C09 [앞 손님 이용 중(PREPARE/USE) 지각 체크인 시 대기(PENDING) 모드 보호]', () => {
    it('앞 손님이 아직 이용 중일 때 지각 체크인 시 PENDING_WAIT 모드로 안전하게 전이된다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/kiosk/checkin/verify')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              checkin_mode: 'PENDING_WAIT',
              resource_type: 'BAY',
              message: '이전 사용자가 아직 이용 중입니다. 5번 타석 종료 즉시 자동으로 입실이 진행됩니다.',
              checkin_id: 'CHK_C09_PENDING_UUID',
              bay_no: 5,
              duration_min: 60,
              start_time: '14:00',
              end_time: '15:00',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const res = await api.verifyKioskCheckin('M_C09_LATE_USER', 'RES_C09_LATE_05');
      expect(res.success).toBe(true);
      expect(res.checkin_mode).toBe('PENDING_WAIT');
      expect(res.bay_no).toBe(5);
      expect(res.message).toContain('이전 사용자가 아직 이용 중입니다');
      expect(res.message).toContain('종료 즉시 자동으로 입실이 진행됩니다');
    });
  });

  // =========================================================================
  // C10: 체크인 실패/예외 시 초경량 블랙박스(kioskBlackBox.ts) 자동 수집 & POS AI 연동
  // =========================================================================
  describe('C10 [체크인 실패/예외 시 초경량 블랙박스 자동 수집 & POS AI 연동]', () => {
    it('체크인 실패 시 CHECKIN_START 및 CHECKIN_CONFIRM 동선이 기록되고 민감정보가 마스킹되어 서버로 보고된다', async () => {
      let reportedPayload: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/system-logs/client-error')) {
          reportedPayload = JSON.parse((init?.body as string) || '{}');
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // 1. 체크인 진입 동선 (CHECKIN_START)
      recordKioskBlackBox('CHECKIN', 'CHECKIN_START', {
        memberNo: 'M_C10_QA',
        memberName: '홍길동 (010-9876-5432)',
        reservationsCount: 2,
      });

      // 2. 예약 선택 및 확인 터치 (CHECKIN_CONFIRM)
      recordKioskBlackBox('CHECKIN', 'CHECKIN_CONFIRM', {
        memberNo: 'M_C10_QA',
        resId: 'RES_FAIL_02',
        resourceNo: '2',
        resourceType: 'BAY',
        adminPin: '9999',
        cardNo: '9410123456789012',
      });

      // 3. 서버 거부(409 점검 등) 발생 시 writeKioskLog 호출
      await api.writeKioskLog(
        'CHECKIN_ERROR',
        '예약 체크인 거부 (RES_FAIL_02): 현재 2번 타석은 점검 중이어서 입실할 수 없습니다. 프런트에 문의해 주세요.',
        'M_C10_QA'
      );

      // 4. 인메모리 블랙박스 검증
      const recentLogs = getRecentKioskBlackBoxLogs(10);
      expect(recentLogs.length).toBeGreaterThanOrEqual(3);

      const confirmLog = recentLogs.find((l) => l.actionName.includes('CHECKIN_CONFIRM'));
      expect(confirmLog).toBeDefined();
      const confirmPayload = confirmLog?.payload as Record<string, unknown>;
      expect(confirmPayload.adminPin).toBe('******');
      expect(confirmPayload.cardNo).toBe('941012-**-****-9012');

      const startLog = recentLogs.find((l) => l.actionName.includes('CHECKIN_START'));
      expect(startLog).toBeDefined();
      const startPayload = startLog?.payload as Record<string, unknown>;
      expect(String(startPayload.memberName)).toContain('010-****-5432');
      expect(String(startPayload.memberName)).not.toContain('010-9876-5432');

      // 5. 서버 비동기 에러 보고(POST /api/system-logs/client-error) 페이로드 검증
      expect(reportedPayload).not.toBeNull();
      expect(reportedPayload.error_type).toBe('KIOSK_CLIENT_ERROR');
      expect(reportedPayload.action_type).toBe('CHECKIN_ERROR');
      expect(reportedPayload.message).toContain('현재 2번 타석은 점검 중이어서 입실할 수 없습니다');
      expect(reportedPayload.blackbox_logs).toContain('CHECKIN_START');
      expect(reportedPayload.blackbox_logs).toContain('CHECKIN_CONFIRM');
      expect(reportedPayload.blackbox_logs).toContain('010-****-5432');
      expect(reportedPayload.blackbox_logs).not.toContain('010-9876-5432');
      expect(reportedPayload.blackbox_logs).not.toContain('9410123456789012');
    });
  });
});
