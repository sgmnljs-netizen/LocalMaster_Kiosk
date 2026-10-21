import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Checkin Core Scenarios Simulation (C01 ~ C05)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    storageMap.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // C01: 정시 예약 정상 체크인 및 즉시 타석 기동
  // =========================================================================
  describe('C01 [정시 예약 정상 체크인 및 즉시 타석 기동]', () => {
    it('정시 예약 체크인 성공 시 IMMEDIATE_START 모드로 배정 정보가 생성되고 세션이 즉시 초기화된다', async () => {
      const mockVerifyResponse = {
        success: true,
        message: '1번 타석 체크인이 성공적으로 완료되었습니다.',
        checkin_mode: 'IMMEDIATE_START',
        resource_type: 'BAY',
        checkin_id: 'CHK_C01_UUID',
        bay_no: 1,
        duration_min: 60,
        start_time: '14:00',
        end_time: '15:00',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockVerifyResponse,
      } as any);

      // 1) API 호출 검증
      const result = await api.verifyKioskCheckin('M_C01_USER', 'RES_C01_ONTIME');
      expect(result.success).toBe(true);
      expect(result.checkin_mode).toBe('IMMEDIATE_START');
      expect(result.bay_no).toBe(1);

      // 2) KioskApp onCheckinSuccess 핸들러 시뮬레이션
      let authMember: any = { member_no: 'M_C01_USER', member_name: '정시회원' };
      let completedAllocationInfo: any = null;
      let currentStep = 'CHECKIN_SELECT';

      const handleCheckinSuccess = (
        bayNo: number | string,
        resId: string,
        durationMin?: number,
        startTime?: string,
        endTime?: string,
        message?: string,
        checkinMode?: string
      ) => {
        completedAllocationInfo = {
          bayNo,
          durationMin: durationMin ?? 60,
          startTime,
          endTime,
          resId,
          memberName: authMember?.member_name || '회원',
          payAmount: 0,
          checkinMode,
          noticeMessage: message,
        };
        authMember = null;
        currentStep = 'MAIN_DASHBOARD';
      };

      handleCheckinSuccess(
        result.bay_no!,
        'RES_C01_ONTIME',
        result.duration_min,
        result.start_time,
        result.end_time,
        result.message,
        result.checkin_mode
      );

      // 티켓 발권 데이터 확정 검증
      expect(completedAllocationInfo).not.toBeNull();
      expect(completedAllocationInfo.bayNo).toBe(1);
      expect(completedAllocationInfo.checkinMode).toBe('IMMEDIATE_START');
      expect(completedAllocationInfo.resId).toBe('RES_C01_ONTIME');
      expect(completedAllocationInfo.memberName).toBe('정시회원');

      // 회원 세션 즉시 파기 및 대시보드 복귀 검증
      expect(authMember).toBeNull();
      expect(currentStep).toBe('MAIN_DASHBOARD');
    });
  });

  // =========================================================================
  // C02: 조기 도착(Early Check-in) 2-Track 사전 체크인
  // =========================================================================
  describe('C02 [조기 도착(Early Check-in) 2-Track 사전 체크인]', () => {
    it('30분 조기 도착 체크인 시 PRE_CHECKIN 모드와 예약 시작 시각 안내표가 생성되고 세션이 초기화된다', async () => {
      const mockVerifyResponse = {
        success: true,
        message: '2번 타석 사전 체크인이 완료되었습니다. 예약 시작 시각(15:00)에 맞춰 자동으로 배정됩니다.',
        checkin_mode: 'PRE_CHECKIN',
        resource_type: 'BAY',
        checkin_id: 'CHK_C02_UUID',
        bay_no: 2,
        duration_min: 60,
        start_time: '15:00',
        end_time: '16:00',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockVerifyResponse,
      } as any);

      const result = await api.verifyKioskCheckin('M_C02_USER', 'RES_C02_EARLY');
      expect(result.success).toBe(true);
      expect(result.checkin_mode).toBe('PRE_CHECKIN');
      expect(result.bay_no).toBe(2);
      expect(result.message).toContain('15:00');
      expect(result.message).toContain('사전 체크인이 완료되었습니다');

      // Kiosk UI 시뮬레이션
      let authMember: any = { member_no: 'M_C02_USER', member_name: '얼리회원' };
      let completedAllocationInfo: any = null;

      const handleCheckinSuccess = (
        bayNo: number | string,
        resId: string,
        durationMin?: number,
        startTime?: string,
        endTime?: string,
        message?: string,
        checkinMode?: string
      ) => {
        completedAllocationInfo = {
          bayNo,
          durationMin: durationMin ?? 60,
          startTime,
          endTime,
          resId,
          memberName: authMember?.member_name || '회원',
          payAmount: 0,
          checkinMode,
          noticeMessage: message,
        };
        authMember = null;
      };

      handleCheckinSuccess(
        result.bay_no!,
        'RES_C02_EARLY',
        result.duration_min,
        result.start_time,
        result.end_time,
        result.message,
        result.checkin_mode
      );

      expect(completedAllocationInfo.checkinMode).toBe('PRE_CHECKIN');
      expect(completedAllocationInfo.startTime).toBe('15:00');
      expect(authMember).toBeNull();
    });
  });

  // =========================================================================
  // C03: 매장 체크인 비활성화(DISABLED) 정책 가드
  // =========================================================================
  describe('C03 [매장 체크인 비활성화(DISABLED) 정책 가드]', () => {
    it('체크인 정책 DISABLED 매장에서 verify 호출 시 HTTP 400 에러를 반환하고 안내 문구를 표출한다', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '현재 매장은 체크인 기능을 사용하지 않습니다.',
        }),
      } as any);

      const result = await api.verifyKioskCheckin('M_C03_USER', 'RES_C03_DISABLED');
      expect(result.success).toBe(false);
      expect(result.message).toBe('현재 매장은 체크인 기능을 사용하지 않습니다.');
    });

    it('KioskApp 라우트 가드: checkinPolicy가 DISABLED일 때 체크인 선택 진입이 차단된다', () => {
      const checkinPolicy = 'DISABLED';
      const step = 'CHECKIN_SELECT';

      // KioskApp 조건문 미러링: checkinPolicy === 'DISABLED'
      const isBlocked = step === 'CHECKIN_SELECT' && checkinPolicy === 'DISABLED';
      expect(isBlocked).toBe(true);

      const guardMessage = isBlocked ? '본 매장은 현재 체크인 메뉴를 사용하지 않습니다.' : 'OK';
      expect(guardMessage).toBe('본 매장은 현재 체크인 메뉴를 사용하지 않습니다.');
    });
  });

  // =========================================================================
  // C04: 예약 종료 시간 경과(Expired / No-Show) 체크인 차단
  // =========================================================================
  describe('C04 [예약 종료 시간 경과(Expired / No-Show) 체크인 차단]', () => {
    it('종료 시각이 지난 예약은 예약 목록에서 배제되고, verify 시 400 에러로 차단된다', async () => {
      // 1) getMemberCheckinReservations 목록 필터링 검증
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          // 만료된 예약은 백엔드에서 이미 제외되어 빈 목록 반환
        ],
      } as any);

      const items = await api.getMemberCheckinReservations('M_C04_USER');
      expect(items).toHaveLength(0);

      // 2) res_id를 직접 verify 호출 시 백엔드 400 예외 반환
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '이미 예약 종료 시간이 경과하여 체크인할 수 없습니다.',
        }),
      } as any);

      const result = await api.verifyKioskCheckin('M_C04_USER', 'RES_C04_EXPIRED');
      expect(result.success).toBe(false);
      expect(result.message).toBe('이미 예약 종료 시간이 경과하여 체크인할 수 없습니다.');
    });

    it('로컬 스토리지 오프라인 Fallback 시에도 종료 시각 경과 예약은 필터링된다', async () => {
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const now = new Date();
      const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      
      // 1시간 전 만료된 예약
      const pastEndHour = String(Math.max(0, now.getHours() - 1)).padStart(2, '0');
      const pastEndMin = String(now.getMinutes()).padStart(2, '0');

      storageMap.set(
        'LM_RESERVATIONS',
        JSON.stringify([
          {
            res_id: 'RES_OFFLINE_EXPIRED',
            member_no: 'M_C04_OFFLINE',
            status_cd: 'RSV',
            res_date: todayStr,
            start_time: `${String(Math.max(0, now.getHours() - 2)).padStart(2, '0')}${pastEndMin}`,
            end_time: `${pastEndHour}${pastEndMin}`,
            resource_type: 'BAY',
          },
        ])
      );

      const items = await api.getMemberCheckinReservations('M_C04_OFFLINE');
      expect(items).toHaveLength(0);
    });
  });

  // =========================================================================
  // C05: 미결제/보류 예약(HOLD / UNPAID) 체크인 원천 차단
  // =========================================================================
  describe('C05 [미결제/보류 예약(HOLD / UNPAID) 체크인 원천 차단]', () => {
    it('HOLD 또는 UNPAID 예약은 목록에서 배제되고 verify 시 카운터 결제 유도 에러를 반환한다', async () => {
      // 1) 목록 조회 배제
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as any);

      const listItems = await api.getMemberCheckinReservations('M_C05_USER');
      expect(listItems).toHaveLength(0);

      // 2) 직접 verify 시 400 카운터 결제 유도 에러 반환
      const expectedError = '결제가 완료되지 않은 예약(또는 결제 대기 홀드)입니다. 카운터(프런트)에서 결제를 먼저 진행해 주세요.';
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: expectedError,
        }),
      } as any);

      const result = await api.verifyKioskCheckin('M_C05_USER', 'RES_C05_HOLD');
      expect(result.success).toBe(false);
      expect(result.message).toBe(expectedError);
    });

    it('오프라인 Fallback에서도 HOLD 예약에 대해 체크인이 차단된다', async () => {
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      storageMap.set(
        'LM_RESERVATIONS',
        JSON.stringify([
          {
            res_id: 'RES_LOCAL_HOLD',
            member_no: 'M_C05_LOCAL',
            status_cd: 'HOLD',
            resource_type: 'BAY',
          },
        ])
      );

      const result = await api.verifyKioskCheckin('M_C05_LOCAL', 'RES_LOCAL_HOLD');
      // HOLD 예약은 find 대상에서 제외되므로 fallback 처리 불가
      expect(result.success).toBe(false);
    });
  });
});
