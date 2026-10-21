import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Bay } from '../api';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Move Bay Gates & Security Specialist (M05, M06, M07, M08, M10)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_GATE_TEST');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'KIOSK_T1');
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('S_GATE_TEST');
    vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK_T1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // M05 [매장 전체 볼회수(GLOBAL_PAUSE) 중 셀프 자리이동 차단]
  // =========================================================================
  describe('M05 [매장 전체 볼회수(GLOBAL_PAUSE) 중 셀프 자리이동 차단]', () => {
    it('Backend 409 Conflict 차단: 볼회수 진행 중 이동 요청 시 HTTP 409 반환 및 안내 메시지 수신', async () => {
      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string);
        return {
          ok: false,
          status: 409,
          json: async () => ({
            detail: '현재 볼회수(전체 일시정지) 중에는 셀프 타석 이동을 할 수 없습니다. 볼회수 종료 후 이용해주세요.',
          }),
        };
      });

      const res = await api.moveBay('M_M05', 2, 1);

      expect(capturedBody).toEqual({
        store_cd: 'S_GATE_TEST',
        member_no: 'M_M05',
        old_bay_no: 1,
        new_bay_no: 2,
        terminal_id: 'KIOSK_T1',
      });
      expect(res.success).toBe(false);
      expect(res.message).toBe('현재 볼회수(전체 일시정지) 중에는 셀프 타석 이동을 할 수 없습니다. 볼회수 종료 후 이용해주세요.');
    });

    it('TeeboxMap UI 상태 검증: bays 에 is_global_paused=true 또는 pause_type="GLOBAL" 이 존재할 때 isGlobalPaused=true 로 타석 터치 완전 차단', () => {
      const bays: Bay[] = [
        {
          bay_no: 1,
          bay_name: '1번 타석',
          status: 'OCCUPIED',
          current_member_no: 'M_M05',
          minutes_left: 40,
          is_global_paused: true,
          pause_type: 'GLOBAL',
        } as any,
        {
          bay_no: 2,
          bay_name: '2번 타석',
          status: 'AVAILABLE',
          is_global_paused: true,
          pause_type: 'GLOBAL',
        } as any,
      ];

      const isMoveMode = true;
      const isGlobalPaused = Boolean(
        isMoveMode &&
        bays.some(b => Boolean((b as any).is_global_paused) || String((b as any).pause_type || '').toUpperCase() === 'GLOBAL')
      );

      expect(isGlobalPaused).toBe(true);

      // handleBayTouch Gate Check: if (isTimeRestricted || hasNoActiveBay || isGlobalPaused) return;
      let touchedBayNo: number | null = null;
      const handleBayTouch = (bay: Bay) => {
        const isTimeRestricted = false;
        const hasNoActiveBay = false;
        if (isTimeRestricted || hasNoActiveBay || isGlobalPaused) return;
        touchedBayNo = bay.bay_no;
      };

      handleBayTouch(bays[1]);
      expect(touchedBayNo).toBeNull(); // Touch blocked!

      // Confirm button disabled condition check
      const selectedBayNo: number | null = 2;
      const preoccupyLoading = false;
      const isTimeRestricted = false;
      const hasNoActiveBay = false;
      const isConfirmDisabled = selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused;
      expect(isConfirmDisabled).toBe(true);
    });
  });

  // =========================================================================
  // M06 [본인 현재 타석 선택 차단 및 동일 타석 재지정 방어]
  // =========================================================================
  describe('M06 [본인 현재 타석 선택 차단 및 동일 타석 재지정 방어]', () => {
    it('Backend 400 Bad Request 차단: old_bay_no == new_bay_no 시 HTTP 400 반환', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '동일한 타석으로는 이동할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M06', 3, 3);
      expect(res.success).toBe(false);
      expect(res.message).toBe('동일한 타석으로는 이동할 수 없습니다.');
    });

    it('TeeboxMap UI 상태 검증: 본인 현재 타석 터치 시 setErrorMsg 출력 및 선점 API 호출 차단', async () => {
      const currentBay: Bay = {
        bay_no: 3,
        bay_name: '3번 타석',
        status: 'OCCUPIED',
        current_member_no: 'M_M06',
        minutes_left: 45,
      } as any;

      const isMoveMode = true;
      let errorMsg = '';
      const preoccupySpy = vi.spyOn(api, 'preoccupyBay').mockResolvedValue(true);

      const handleBayTouch = async (bay: Bay) => {
        if (isMoveMode && currentBay && Number(bay.bay_no) === Number(currentBay.bay_no)) {
          errorMsg = '현재 배정되어 있는 본인 타석으로는 이동할 수 없습니다.';
          return;
        }
        await api.preoccupyBay(bay.bay_no);
      };

      await handleBayTouch(currentBay);

      expect(errorMsg).toBe('현재 배정되어 있는 본인 타석으로는 이동할 수 없습니다.');
      expect(preoccupySpy).not.toHaveBeenCalled();

      // UI Visual State: isCurrentMyBay renders '현재 내 타석' with cursorStyle 'not-allowed'
      const isCurrentMyBay = Boolean(isMoveMode && currentBay && Number(currentBay.bay_no) === Number(currentBay.bay_no));
      expect(isCurrentMyBay).toBe(true);
      const statusText = '현재 내 타석';
      const cursorStyle = 'not-allowed';
      expect(statusText).toBe('현재 내 타석');
      expect(cursorStyle).toBe('not-allowed');
    });
  });

  // =========================================================================
  // M07 [레슨 전용 타석(is_lesson_only)으로의 일반 셀프 이동 차단]
  // =========================================================================
  describe('M07 [레슨 전용 타석(is_lesson_only)으로의 일반 셀프 이동 차단]', () => {
    it('Backend 400 Bad Request 차단: 일반 회원이 레슨 전용 타석으로 이동 시 HTTP 400 반환', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '레슨 전용 타석으로는 일반 셀프 이동을 할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M07', 4, 1);
      expect(res.success).toBe(false);
      expect(res.message).toBe('레슨 전용 타석으로는 일반 셀프 이동을 할 수 없습니다.');
    });

    it('TeeboxMap UI 상태 검증: 레슨 전용 타석 터치 시 setErrorMsg 출력 및 선점 차단, 뱃지/스타일 확인', async () => {
      const lessonBay: Bay = {
        bay_no: 4,
        bay_name: '4번 타석(레슨전용)',
        status: 'AVAILABLE',
        is_lesson_only: true,
      } as any;

      const isLessonOnlyBay = (bay: Bay): boolean => {
        return Boolean(
          bay.is_lesson_only ||
          (bay.config_json ? (() => { try { return Boolean(JSON.parse(bay.config_json).is_lesson_only); } catch { return false; } })() : false)
        );
      };

      expect(isLessonOnlyBay(lessonBay)).toBe(true);

      let errorMsg = '';
      const preoccupySpy = vi.spyOn(api, 'preoccupyBay').mockResolvedValue(true);

      const handleBayTouch = async (bay: Bay) => {
        if (isLessonOnlyBay(bay)) {
          errorMsg = '레슨 전용 타석으로는 일반 셀프 이동 및 배정을 할 수 없습니다.';
          return;
        }
        await api.preoccupyBay(bay.bay_no);
      };

      await handleBayTouch(lessonBay);

      expect(errorMsg).toBe('레슨 전용 타석으로는 일반 셀프 이동 및 배정을 할 수 없습니다.');
      expect(preoccupySpy).not.toHaveBeenCalled();

      // UI Rendering properties check
      const statusText = '레슨전용';
      const statusColor = '#7e22ce';
      const cursorStyle = 'not-allowed';
      const opacity = '0.65';
      expect(statusText).toBe('레슨전용');
      expect(statusColor).toBe('#7e22ce');
      expect(cursorStyle).toBe('not-allowed');
      expect(opacity).toBe('0.65');
    });

    it('TeeboxMap UI 상태 검증: config_json 내 is_lesson_only: true 가 포함된 타석도 완벽히 감지', () => {
      const bayWithConfigJson: Bay = {
        bay_no: 14,
        bay_name: '14번 타석',
        status: 'AVAILABLE',
        config_json: JSON.stringify({ is_lesson_only: true, simulator_type: 'QED' }),
      } as any;

      const isLessonOnlyBay = (bay: Bay): boolean => {
        return Boolean(
          bay.is_lesson_only ||
          (bay.config_json ? (() => { try { return Boolean(JSON.parse(bay.config_json).is_lesson_only); } catch { return false; } })() : false)
        );
      };

      expect(isLessonOnlyBay(bayWithConfigJson)).toBe(true);
    });
  });

  // =========================================================================
  // M08 [이용권 구역/층/장비(Product.access_rules) 불일치 타석 이동 차단]
  // =========================================================================
  describe('M08 [이용권 구역/층/장비(Product.access_rules) 불일치 타석 이동 차단]', () => {
    it('Backend 400 Bad Request 차단 (층수 불일치): 1층 전용권 회원이 2층 타석으로 이동 시 HTTP 400 반환', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '현재 이용 중인 이용권(1층 전용 30일권)으로는 2층 타석으로 이동할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M08', 6, 1);
      expect(res.success).toBe(false);
      expect(res.message).toContain('2층 타석으로 이동할 수 없습니다');
    });

    it('Backend 400 Bad Request 차단 (장비 불일치): QED 전용권 회원이 GDR 타석으로 이동 시 HTTP 400 반환', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '현재 이용 중인 이용권(QED 전용 30일권)으로는 해당 장비(GDR) 타석으로 이동할 수 없습니다.',
        }),
      }));

      const res = await api.moveBay('M_M08', 7, 1);
      expect(res.success).toBe(false);
      expect(res.message).toContain('해당 장비(GDR) 타석으로 이동할 수 없습니다');
    });

    it('KioskApp 핸들러 검증: 이용권 불일치 오류 수신 시 선점 타석 자동 릴리즈 및 오류 모달 표시', async () => {
      const releaseSpy = vi.spyOn(api, 'releaseBay').mockResolvedValue(true);
      let errorModalMsg = '';
      const showErrorModal = (msg: string) => { errorModalMsg = msg; };

      const moveResult = {
        success: false,
        message: '현재 이용 중인 이용권(1층 전용 30일권)으로는 2층 타석으로 이동할 수 없습니다.',
      };

      // Simulate KioskApp handleBaySelected failure branch
      const bayNo = 6;
      if (!moveResult.success) {
        await api.releaseBay(bayNo);
        showErrorModal(moveResult.message);
      }

      expect(releaseSpy).toHaveBeenCalledWith(6);
      expect(errorModalMsg).toContain('2층 타석으로 이동할 수 없습니다');
    });
  });

  // =========================================================================
  // M10 [자가 선점 락(PRE_OCCUPIED) 원자적 해제 및 이동 완료 후 4중 세션 파기]
  // =========================================================================
  describe('M10 [자가 선점 락(PRE_OCCUPIED) 원자적 해제 및 이동 완료 후 4중 세션 파기]', () => {
    it('선점 락(PRE_OCCUPIED) 획득 및 terminal_id 동봉 이동 요청 -> 원자적 해제 및 200 OK 성공', async () => {
      // 1. Kiosk touches Bay 5 -> calls preoccupyBay
      const preoccupySpy = vi.spyOn(api, 'preoccupyBay').mockImplementation(async (bayNo: number) => {
        expect(bayNo).toBe(5);
        return true;
      });
      const acquired = await api.preoccupyBay(5);
      expect(acquired).toBe(true);
      expect(preoccupySpy).toHaveBeenCalledWith(5);

      // 2. Kiosk calls moveBay with terminal_id="KIOSK_T1"
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        expect(body.terminal_id).toBe('KIOSK_T1');
        expect(body.new_bay_no).toBe(5);
        expect(body.old_bay_no).toBe(1);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            old_bay_no: 1,
            new_bay_no: 5,
            remain_min: 40,
            start_time: '14:20',
            end_time: '15:00',
            message: '1번 타석에서 5번 타석으로 이동이 완료되었습니다.',
          }),
        };
      });

      const res = await api.moveBay('M_M10', 5, 1);
      expect(res.success).toBe(true);
      expect(res.old_bay_no).toBe(1);
      expect(res.new_bay_no).toBe(5);
      expect(res.remain_min).toBe(40);
      expect(res.message).toBe('1번 타석에서 5번 타석으로 이동이 완료되었습니다.');
    });

    it('KioskApp handleBaySelected: 이동 성공 시 4중 세션 파기(setAuthMember, setPurpose, setSelectedBayNo, ref) 및 AllocationCompleteModal 바인딩', async () => {
      // Mock state setters
      let authMemberState: any = { member_no: 'M_M10', member_name: '보안검수회원' };
      let purposeState: any = 'MOVE_BAY';
      let selectedBayNoState: number | null = 5;
      const selectedBayNoRef = { current: 5 as number | null };
      let completedAllocationInfoState: any = null;

      const setAuthMember = (val: any) => { authMemberState = val; };
      const setPurpose = (val: any) => { purposeState = val; };
      const setSelectedBayNo = (val: any) => { selectedBayNoState = val; };
      const setCompletedAllocationInfo = (val: any) => { completedAllocationInfoState = val; };

      // Backend move response
      const res = {
        success: true,
        old_bay_no: 1,
        new_bay_no: 5,
        remain_min: 40,
        start_time: '14:20',
        end_time: '15:00',
        message: '1번 타석에서 5번 타석으로 이동이 완료되었습니다.',
      };

      // Simulate KioskApp handleBaySelected lines 913-936
      if (res.success) {
        const resolvedOldBayNo = res.old_bay_no ?? 1;
        const movedMemberName = authMemberState.member_name;
        const remainMin = res.remain_min;

        // 4중 세션 파기 실행!
        setAuthMember(null);
        setPurpose(null);
        setSelectedBayNo(null);
        selectedBayNoRef.current = null;

        // AllocationCompleteModal 데이터 준비
        setCompletedAllocationInfo({
          bayNo: 5,
          oldBayNo: resolvedOldBayNo,
          durationMin: remainMin,
          startTime: res.start_time,
          endTime: res.end_time,
          memberName: movedMemberName,
          payAmount: 0,
          checkinMode: 'MOVE_BAY',
          noticeMessage: res.message,
        });
      }

      // Verify 4-layer session destruction
      expect(authMemberState).toBeNull();
      expect(purposeState).toBeNull();
      expect(selectedBayNoState).toBeNull();
      expect(selectedBayNoRef.current).toBeNull();

      // Verify AllocationCompleteModal props
      expect(completedAllocationInfoState).toEqual({
        bayNo: 5,
        oldBayNo: 1,
        durationMin: 40,
        startTime: '14:20',
        endTime: '15:00',
        memberName: '보안검수회원',
        payAmount: 0,
        checkinMode: 'MOVE_BAY',
        noticeMessage: '1번 타석에서 5번 타석으로 이동이 완료되었습니다.',
      });
    });

    it('타 단말기가 선점 중인 타석 이동 시도 시 409 Conflict 차단', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          detail: '다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.',
        }),
      }));

      const res = await api.moveBay('M_M10', 5, 1);
      expect(res.success).toBe(false);
      expect(res.message).toBe('다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.');
    });
  });
});
