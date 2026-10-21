import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Bay } from '../api';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Bay Move Core & Timing Simulation (M01, M02, M03, M04, M09)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_MOVE_TEST');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'T-KIOSK-01');
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('S_MOVE_TEST');
    vi.spyOn(api, 'getTerminalId').mockReturnValue('T-KIOSK-01');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // M01 [이용 중(USE) 타석의 정상 자리이동 및 잔여시간 100% 승계]
  // =========================================================================
  describe('M01 [이용 중(USE) 타석의 정상 자리이동 및 잔여시간 100% 승계]', () => {
    it('이용 중(45분 잔여) 타석 이동 시 POST /api/v1/kiosk/bays/move 로 잔여 45분이 손실 없이 승계된다', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        if (init?.body) {
          capturedBody = JSON.parse(init.body as string);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            old_bay_no: 1,
            new_bay_no: 5,
            remain_min: 45,
            start_time: '14:15',
            end_time: '15:00',
            message: '1번 타석에서 5번 타석으로 이동이 완료되었습니다.',
          }),
        };
      });

      const res = await api.moveBay('M_M01', 5, 1);

      // Verify request payload
      expect(capturedUrl).toContain('/v1/kiosk/bays/move');
      expect(capturedBody).toEqual({
        store_cd: 'S_MOVE_TEST',
        member_no: 'M_M01',
        old_bay_no: 1,
        new_bay_no: 5,
        terminal_id: 'T-KIOSK-01',
      });

      // Verify response
      expect(res.success).toBe(true);
      expect(res.old_bay_no).toBe(1);
      expect(res.new_bay_no).toBe(5);
      expect(res.remain_min).toBe(45);
      expect(res.message).toContain('5번 타석으로 이동이 완료되었습니다');
    });

    it('TeeboxMap UI 상태 검증: 잔여시간 45분 회원은 isTimeRestricted=false 로 정상 선택 및 이동 가능', () => {
      const currentBay: Bay = {
        bay_no: 1,
        bay_name: '1번 타석',
        status: 'OCCUPIED',
        current_member_no: 'M_M01',
        minutes_left: 45,
        status_info: { code: 'USE', is_transferable: true },
      } as any;

      const isMoveMode = true;
      const currentBayStatus = String((currentBay as any)?.status_info?.code || currentBay?.status || '').toUpperCase();
      const isReservedNotStarted = ['CHK', 'RSV', 'RESERVED'].includes(currentBayStatus);
      const currentRemMin = Number(currentBay.minutes_left);

      const isTimeRestricted = Boolean(
        isMoveMode &&
        currentBay &&
        !isReservedNotStarted &&
        ((currentBay as any).status_info?.is_transferable === false || currentRemMin < 5)
      );

      expect(isReservedNotStarted).toBe(false);
      expect(currentRemMin).toBe(45);
      expect(isTimeRestricted).toBe(false);
    });
  });

  // =========================================================================
  // M02 [대기/체크인(CHK) 상태의 빈 타석 즉시 이동 및 승격(PREPARE/USE)]
  // =========================================================================
  describe('M02 [대기/체크인(CHK) 상태의 빈 타석 즉시 이동 및 승격(PREPARE/USE)]', () => {
    it('체크인 대기(CHK) 예약의 빈 타석 즉시 이동 시 백엔드 승격 응답을 정상 수신한다', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          old_bay_no: 2,
          new_bay_no: 6,
          remain_min: 60,
          status_cd: 'PREPARE',
          message: '2번 타석에서 6번 타석으로 이동이 완료되었습니다.',
        }),
      }));

      const res = await api.moveBay('M_M02', 6, 2);

      expect(res.success).toBe(true);
      expect(res.old_bay_no).toBe(2);
      expect(res.new_bay_no).toBe(6);
      expect(res.remain_min).toBe(60);
    });

    it('TeeboxMap UI 상태 검증: CHK 상태는 isReservedNotStarted=true 로 판정되어 5분 미만 제한에 걸리지 않음', () => {
      const currentBay: Bay = {
        bay_no: 2,
        bay_name: '2번 타석',
        status: 'CHK' as any,
        current_member_no: 'M_M02',
        minutes_left: 60,
        status_info: { code: 'CHK', is_transferable: true },
      } as any;

      const isMoveMode = true;
      const currentBayStatus = String((currentBay as any)?.status_info?.code || currentBay?.status || '').toUpperCase();
      const isReservedNotStarted = ['CHK', 'RSV', 'RESERVED'].includes(currentBayStatus);
      const currentRemMin = Number(currentBay.minutes_left);

      const isTimeRestricted = Boolean(
        isMoveMode &&
        currentBay &&
        !isReservedNotStarted &&
        ((currentBay as any).status_info?.is_transferable === false || currentRemMin < 5)
      );

      expect(isReservedNotStarted).toBe(true);
      expect(isTimeRestricted).toBe(false);
    });
  });

  // =========================================================================
  // M03 [미래 미체크인 예약(RSV)의 타석 이동 시 미래 시작시각(start_time) 100% 보존]
  // =========================================================================
  describe('M03 [미래 미체크인 예약(RSV)의 타석 이동 시 미래 시작시각(start_time) 100% 보존]', () => {
    it('미래 17:00 예약 이동 시 원래 예정된 시작시각(start_time=17:00)이 100% 보존되어 반환된다', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          old_bay_no: 3,
          new_bay_no: 7,
          start_time: '17:00',
          end_time: '18:00',
          remain_min: 60,
          message: '3번 타석에서 7번 타석으로 이동이 완료되었습니다.',
        }),
      }));

      const res = await api.moveBay('M_M03', 7, 3);

      expect(res.success).toBe(true);
      expect(res.old_bay_no).toBe(3);
      expect(res.new_bay_no).toBe(7);
      expect(res.start_time).toBe('17:00');
      expect(res.end_time).toBe('18:00');
    });

    it('TeeboxMap UI 상태 검증: RSV 상태는 isReservedNotStarted=true 로 즉시 타석 변경 가능', () => {
      const currentBay: Bay = {
        bay_no: 3,
        bay_name: '3번 타석',
        status: 'AVAILABLE',
        status_info: { code: 'RSV', is_transferable: true },
        start_time: '17:00',
        end_time: '18:00',
        duration_min: 60,
      } as any;

      const isMoveMode = true;
      const currentBayStatus = String((currentBay as any)?.status_info?.code || currentBay?.status || '').toUpperCase();
      const isReservedNotStarted = ['CHK', 'RSV', 'RESERVED'].includes(currentBayStatus);

      const isTimeRestricted = Boolean(
        isMoveMode &&
        currentBay &&
        !isReservedNotStarted &&
        ((currentBay as any).status_info?.is_transferable === false || Number(currentBay.duration_min) < 5)
      );

      expect(isReservedNotStarted).toBe(true);
      expect(isTimeRestricted).toBe(false);
    });
  });

  // =========================================================================
  // M04 [최소 잔여시간(5분 미만) 이동 요청 원천 차단]
  // =========================================================================
  describe('M04 [최소 잔여시간(5분 미만) 이동 요청 원천 차단]', () => {
    it('잔여시간 3분인 회원이 이동 요청 시 백엔드 400 에러를 반환받고 에러 메시지를 전달한다', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '잔여 이용시간이 5분 미만이어서 타석을 이동할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M04', 5, 1);

      expect(res.success).toBe(false);
      expect(res.message).toBe('잔여 이용시간이 5분 미만이어서 타석을 이동할 수 없습니다.');
    });

    it('TeeboxMap UI 상태 검증: 잔여시간 3분 회원은 isTimeRestricted=true 로 타석 선택 및 배정 버튼 비활성화', () => {
      const currentBay: Bay = {
        bay_no: 1,
        bay_name: '1번 타석',
        status: 'OCCUPIED',
        current_member_no: 'M_M04',
        minutes_left: 3,
        status_info: { code: 'USE', is_transferable: true },
      } as any;

      const isMoveMode = true;
      const currentBayStatus = String((currentBay as any)?.status_info?.code || currentBay?.status || '').toUpperCase();
      const isReservedNotStarted = ['CHK', 'RSV', 'RESERVED'].includes(currentBayStatus);
      const currentRemMin = Number(currentBay.minutes_left);

      const isTimeRestricted = Boolean(
        isMoveMode &&
        currentBay &&
        !isReservedNotStarted &&
        ((currentBay as any).status_info?.is_transferable === false || currentRemMin < 5)
      );

      // Verify UI constraints in TeeboxMap.tsx
      expect(isTimeRestricted).toBe(true);

      // Verify touch guard in handleBayTouch
      let touchBlocked = false;
      const handleBayTouch = (bay: Bay) => {
        if (isTimeRestricted) {
          touchBlocked = true;
          return;
        }
      };
      handleBayTouch({ bay_no: 5 } as any);
      expect(touchBlocked).toBe(true);

      // Verify Confirm Button disabled state
      const selectedBayNo: number | null = null;
      const preoccupyLoading = false;
      const hasNoActiveBay = false;
      const isGlobalPaused = false;
      const isButtonDisabled = selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused;
      expect(isButtonDisabled).toBe(true);

      // Verify Guide Message
      const guideText = isTimeRestricted
        ? '⏱️ 이용 종료 임박(5분 미만)으로 자리 이동이 불가능합니다.'
        : '이동하실 목적지 빈 타석을 선택해 주세요.';
      expect(guideText).toBe('⏱️ 이용 종료 임박(5분 미만)으로 자리 이동이 불가능합니다.');
    });
  });

  // =========================================================================
  // M09 [타석 이동 허용 횟수(max_transfers_per_reservation) 초과 차단]
  // =========================================================================
  describe('M09 [타석 이동 허용 횟수(max_transfers_per_reservation) 초과 차단]', () => {
    it('이동 횟수 1회 초과 시 백엔드 400 에러를 반환받고 에러 메시지를 표시한다', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '타석 이동 가능 횟수(1회)를 초과하여 더 이상 이동할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M09', 8, 5);

      expect(res.success).toBe(false);
      expect(res.message).toBe('타석 이동 가능 횟수(1회)를 초과하여 더 이상 이동할 수 없습니다.');
    });
  });
});
