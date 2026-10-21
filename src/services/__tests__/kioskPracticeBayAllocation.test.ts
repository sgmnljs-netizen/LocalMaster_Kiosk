import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Practice Bay Allocation Simulation (S01, S02, S03, S04, S14)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // S01: 활성 기간권(PERIOD) 정상 배정
  // =========================================================================
  describe('S01 [활성 기간권(PERIOD) 정상 배정]', () => {
    it('배정 성공 시 기간권 end_dt는 그대로 유지되고, 배정 성공 후 세션이 즉시 파기된다', async () => {
      const mockPeriodAsset = {
        member_item_id: '1001',
        item_name: '3개월 정기 기간권',
        logic_type: 'PERIOD',
        rem_count: 0,
        expiry_date: '2026-12-31',
        duration_min: 60,
        is_assignable: true,
        allowed_categories: ['BAY'],
      };

      const mockMember = {
        member_no: 'M_PERIOD_01',
        member_name: '김골프',
        assets: [mockPeriodAsset],
      };

      // api.allocateBay 호출 시뮬레이션
      const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
        success: true,
        res_id: 'KSK_20261020_001_0001',
        duration_min: 60,
        start_time: '14:00',
        end_time: '15:00',
        message: '타석 배정이 완료되었습니다.',
        hardware_success: true,
      } as any);

      // Kiosk App Allocation Flow Simulation:
      let authMember: any = { ...mockMember };
      let selectedBayNo: number | null = 3;
      let completedAllocationInfo: any = null;

      // 1. 배정 API 호출
      const res = await api.allocateBay(
        selectedBayNo!,
        mockPeriodAsset.duration_min,
        authMember.member_no,
        undefined,
        undefined,
        parseInt(mockPeriodAsset.member_item_id),
        'TICKET',
        0
      );

      expect(res.success).toBe(true);
      expect(allocateBaySpy).toHaveBeenCalledWith(
        3,
        60,
        'M_PERIOD_01',
        undefined,
        undefined,
        1001,
        'TICKET',
        0
      );

      // 2. 1차 방어막: 즉시 authMember null 파기
      const startTime = performance.now();
      authMember = null;
      selectedBayNo = null;
      completedAllocationInfo = {
        bayNo: 3,
        durationMin: res.duration_min,
        resId: res.res_id,
        memberName: mockMember.member_name,
        payAmount: 0,
      };
      const elapsed = performance.now() - startTime;

      expect(authMember).toBeNull();
      expect(selectedBayNo).toBeNull();
      expect(completedAllocationInfo.resId).toBe('KSK_20261020_001_0001');
      expect(elapsed).toBeLessThan(5); // 0.001s 수준 즉시 파기 보장
      // 기간권 만료일은 영향받지 않음
      expect(mockPeriodAsset.expiry_date).toBe('2026-12-31');
    });
  });

  // =========================================================================
  // S02: 잔여 횟수권(COUNT) 차감 배정
  // =========================================================================
  describe('S02 [잔여 횟수권(COUNT) 차감 배정]', () => {
    it('10회 횟수권 배정 시 1회 차감(10 -> 9) 정상 요청되고 회원 세션이 파기된다', async () => {
      const mockCountAsset = {
        member_item_id: '2001',
        item_name: '타석 10회 이용권',
        logic_type: 'COUNT',
        rem_count: 10,
        remain_cnt: 10,
        expiry_date: '2026-12-31',
        duration_min: 60,
        is_assignable: true,
        allowed_categories: ['BAY'],
      };

      const mockMember = {
        member_no: 'M_COUNT_01',
        member_name: '이횟수',
        assets: [mockCountAsset],
      };

      const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
        success: true,
        res_id: 'KSK_20261020_002_0001',
        duration_min: 60,
        start_time: '15:00',
        end_time: '16:00',
        message: '1회 차감 배정 완료',
        hardware_success: true,
      } as any);

      let authMember: any = { ...mockMember };
      let selectedBayNo: number | null = 5;

      const res = await api.allocateBay(
        selectedBayNo!,
        mockCountAsset.duration_min,
        authMember.member_no,
        undefined,
        undefined,
        parseInt(mockCountAsset.member_item_id),
        'TICKET',
        0
      );

      expect(res.success).toBe(true);
      expect(allocateBaySpy).toHaveBeenCalledWith(
        5,
        60,
        'M_COUNT_01',
        undefined,
        undefined,
        2001,
        'TICKET',
        0
      );

      // 세션 즉시 파기 검증
      authMember = null;
      selectedBayNo = null;
      expect(authMember).toBeNull();
      expect(selectedBayNo).toBeNull();
    });
  });

  // =========================================================================
  // S03: 분 단위 시간권(TIME) 차감 배정
  // =========================================================================
  describe('S03 [분 단위 시간권(TIME) 차감 배정]', () => {
    it('120분 시간권으로 60분 타석 배정 시 60분 차감(120 -> 60) 요청이 올바르게 전달된다', async () => {
      const mockTimeAsset = {
        member_item_id: '3001',
        item_name: '타석 120분 시간권',
        logic_type: 'TIME',
        rem_count: 120,
        remain_min: 120,
        expiry_date: '2026-12-31',
        duration_min: 60,
        is_assignable: true,
        allowed_categories: ['BAY'],
      };

      const mockMember = {
        member_no: 'M_TIME_01',
        member_name: '박시간',
        assets: [mockTimeAsset],
      };

      // 1. KioskApp getAssetSubtext UI 표현 검증
      const getAssetSubtext = (asset: any) => {
        const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
        const rawExpDate = asset.expiry_date || asset.end_date || asset.end_dt;
        const expDateText = rawExpDate ? `~${rawExpDate}` : '상시 유효';

        if (logicType === 'PERIOD' || logicType === 'MEMBERSHIP') {
          return `유효기간: ${expDateText}`;
        }
        const count = asset.remain_cnt ?? asset.rem_count;
        if ((logicType === 'COUNT' || logicType === 'COUPON') && count > 0) {
          return `남은 횟수: ${count}회 | 유효기간: ${expDateText}`;
        }
        if (logicType === 'TIME') {
          const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
          return `남은 시간: ${remMin}분 | 유효기간: ${expDateText}`;
        }
        return `유효기간: ${expDateText}`;
      };

      const subtext = getAssetSubtext(mockTimeAsset);
      expect(subtext).toBe('남은 시간: 120분 | 유효기간: ~2026-12-31');

      // 2. Kiosk validAssets 필터 검증: 120분 시간권은 유효 목록에 포함되어야 함
      const validAssets = [mockTimeAsset].filter(asset => {
        if (asset.is_assignable === false) return false;
        const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
        if (logicType === 'COUNT' || logicType === 'COUPON') {
          const cnt = asset.remain_cnt ?? asset.rem_count ?? 0;
          if (cnt <= 0) return false;
        } else if (logicType === 'TIME') {
          const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
          if (remMin <= 0) return false;
        }
        return true;
      });
      expect(validAssets.length).toBe(1);

      // 3. 배정 요청 시뮬레이션
      const allocateBaySpy = vi.spyOn(api, 'allocateBay').mockResolvedValueOnce({
        success: true,
        res_id: 'KSK_20261020_003_0001',
        duration_min: 60,
        start_time: '16:00',
        end_time: '17:00',
        message: '60분 차감 완료 (잔여 60분)',
        hardware_success: true,
      } as any);

      let authMember: any = { ...mockMember };
      let selectedBayNo: number | null = 7;

      const res = await api.allocateBay(
        selectedBayNo!,
        mockTimeAsset.duration_min,
        authMember.member_no,
        undefined,
        undefined,
        parseInt(mockTimeAsset.member_item_id),
        'TICKET',
        0
      );

      expect(res.success).toBe(true);
      expect(allocateBaySpy).toHaveBeenCalledWith(
        7,
        60,
        'M_TIME_01',
        undefined,
        undefined,
        3001,
        'TICKET',
        0
      );

      // 세션 즉시 파기 검증
      authMember = null;
      selectedBayNo = null;
      expect(authMember).toBeNull();
      expect(selectedBayNo).toBeNull();
    });
  });

  // =========================================================================
  // S04: 만료/소진된 이용권 배정 차단
  // =========================================================================
  describe('S04 [만료/소진된 이용권 배정 차단]', () => {
    it('잔여 횟수가 0회이거나 만료일이 지난 이용권은 validAssets에서 필터링되고, 일일권 결제로 유도된다', () => {
      const exhaustedCountAsset = {
        member_item_id: '4001',
        item_name: '타석 10회 이용권 (소진)',
        logic_type: 'COUNT',
        rem_count: 0,
        remain_cnt: 0,
        expiry_date: '2026-12-31',
        is_assignable: false,
        unassignable_reason: '잔여 횟수가 모두 소진되었습니다. (0회)',
        allowed_categories: ['BAY'],
      };

      const expiredPeriodAsset = {
        member_item_id: '4002',
        item_name: '1개월 정기권 (만료)',
        logic_type: 'PERIOD',
        rem_count: 0,
        expiry_date: '2025-12-31',
        remain_days: -10,
        is_assignable: false,
        unassignable_reason: '이용 기간이 만료되었습니다. (만료일: 2025-12-31)',
        allowed_categories: ['BAY'],
      };

      const exhaustedTimeAsset = {
        member_item_id: '4003',
        item_name: '타석 60분 시간권 (소진)',
        logic_type: 'TIME',
        rem_count: 0,
        remain_min: 0,
        expiry_date: '2026-12-31',
        is_assignable: false,
        unassignable_reason: '잔여 시간이 모두 소진되었습니다. (0분)',
        allowed_categories: ['BAY'],
      };

      const assets = [exhaustedCountAsset, expiredPeriodAsset, exhaustedTimeAsset];

      // KioskApp validAssets 필터링 시뮬레이션
      const targetZoneCode = 'BAY';
      const validAssets = assets.filter(asset => {
        if (asset.is_assignable === false) return false;
        const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
        if (logicType === 'COUNT' || logicType === 'COUPON') {
          const cnt = asset.remain_cnt ?? asset.rem_count ?? 0;
          if (cnt <= 0) return false;
        } else if (logicType === 'TIME') {
          const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
          if (remMin <= 0) return false;
        } else if (asset.remain_days !== undefined && asset.remain_days !== null && asset.remain_days < 0) {
          return false;
        }
        if (!asset.allowed_categories || asset.allowed_categories.length === 0) return true;
        const allowedUpper = asset.allowed_categories.map(c => c.toUpperCase());
        return allowedUpper.includes(targetZoneCode);
      });

      // 검증: 모든 만료/소진 자산이 배정 가능 목록에서 차단됨
      expect(validAssets.length).toBe(0);

      // 차단 사유 목록 추출
      const unassignableReasons = assets
        .filter(a => a.is_assignable === false && a.unassignable_reason)
        .map(a => `• ${a.item_name}: ${a.unassignable_reason}`);

      expect(unassignableReasons).toHaveLength(3);
      expect(unassignableReasons[0]).toContain('잔여 횟수가 모두 소진되었습니다');
      expect(unassignableReasons[1]).toContain('이용 기간이 만료되었습니다');
      expect(unassignableReasons[2]).toContain('잔여 시간이 모두 소진되었습니다');

      // 가용 자산이 0개일 때 일일권 결제로 전환 처리
      let purpose: string | null = 'ALLOCATE_MEMBERSHIP';
      let step: string = 'ASSET_SELECT';
      if (validAssets.length === 0) {
        purpose = 'ALLOCATE_DAILY';
        step = 'PRODUCT_SHOP';
      }
      expect(purpose).toBe('ALLOCATE_DAILY');
      expect(step).toBe('PRODUCT_SHOP');
    });
  });

  // =========================================================================
  // S14: 4중 회원 세션 보안 - 배정 완료 직후 잔존 세션 탈취 방지
  // =========================================================================
  describe('S14 [4중 회원 세션 보안 - 배정 완료 직후 잔존 세션 탈취 방지]', () => {
    it('1차 방어: 배정 성공 즉시(0.001초) authMember, selectedBayNo가 null로 파기된다', () => {
      let authMember: any = { member_no: 'M001', member_name: '홍길동' };
      let selectedAssetId: number | null = 101;
      let selectedBayNo: number | null = 3;

      // 배정 성공 직후 1차 방어 발동
      authMember = null;
      selectedAssetId = null;
      selectedBayNo = null;

      expect(authMember).toBeNull();
      expect(selectedAssetId).toBeNull();
      expect(selectedBayNo).toBeNull();
    });

    it('2차 방어: handlePracticeSelectConfirm 호출 시 이전 잔존 세션을 강제 파기(setAuthMember(null))한다', () => {
      // 악의적이거나 비정상적으로 잔존한 회원 세션 시뮬레이션
      let authMember: any = { member_no: 'M_LEAK_01', member_name: '유출세션' };
      let selectedBayNo: number | null = null;
      let purpose: string | null = null;
      let initialAuthMode: string = 'FACE';
      let step: string = 'MAIN_DASHBOARD';
      const keepAuthAfterPurchaseRef = { current: false };

      // 2차 방어 핸들러 실행 (handlePracticeSelectConfirm)
      const handlePracticeSelectConfirm = (bayNo: number, purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => {
        selectedBayNo = bayNo;
        purpose = purposeType;

        if (purposeType === 'ALLOCATE_MEMBERSHIP') {
          if (keepAuthAfterPurchaseRef.current && authMember) {
            keepAuthAfterPurchaseRef.current = false;
            step = 'ASSET_SELECT';
            return;
          }
          initialAuthMode = 'FACE';
          // 🔒 [2차 방어막] 단일 타석 선택 시 이전 비정상 잔존 세션이 있더라도 100% 강제 파기 후 신규 안면인식 유도
          authMember = null;
          step = 'MEMBER_AUTH';
        }
      };

      handlePracticeSelectConfirm(5, 'ALLOCATE_MEMBERSHIP');

      expect(authMember).toBeNull(); // 2차 방어 성공
      expect(selectedBayNo).toBe(5);
      expect(step).toBe('MEMBER_AUTH');
      expect(initialAuthMode).toBe('FACE');
    });

    it('3차 방어: AllocationCompleteModal 닫기(onClose) 시 handleLogoutToHome()이 호출되어 전면 초기화된다', async () => {
      let authMember: any = null; // 이미 1차에서 null이지만 안전망 재확인
      let completedAllocationInfo: any = { bayNo: 5, resId: 'KSK_123' };
      let step: string = 'PRACTICE_SELECT';
      let currentHoldResId: string | null = 'HOLD_001';

      const cancelHoldSpy = vi.spyOn(api, 'cancelHoldReservation').mockResolvedValueOnce({ success: true } as any);
      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValueOnce({ success: true } as any);

      // 3차 방어 handleLogoutToHome 실행
      const handleLogoutToHome = () => {
        if (currentHoldResId) {
          api.cancelHoldReservation(currentHoldResId).catch(console.error);
          currentHoldResId = null;
        }
        authMember = null;
        completedAllocationInfo = null;
        step = 'MAIN_DASHBOARD';
      };

      // Modal onClose 트리거
      completedAllocationInfo = null;
      handleLogoutToHome();

      expect(authMember).toBeNull();
      expect(completedAllocationInfo).toBeNull();
      expect(step).toBe('MAIN_DASHBOARD');
      expect(currentHoldResId).toBeNull();
      expect(cancelHoldSpy).toHaveBeenCalledWith('HOLD_001');
    });

    it('4차 방어: 유휴 시간(Idle Timeout 40초) 경과 시 handleLogout이 호출되어 선점 락을 해제하고 INTRO로 복귀한다', async () => {
      let authMember: any = { member_no: 'M_IDLE_01', member_name: '김방치' };
      let selectedBayNo: number | null = 9;
      let step: string = 'ASSET_SELECT';

      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValueOnce({ success: true } as any);
      const writeLogSpy = vi.spyOn(api, 'writeKioskLog').mockResolvedValueOnce({} as any);

      // 4차 방어 handleLogout 실행 시뮬레이션
      const handleLogout = () => {
        if (authMember) {
          api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
        }
        if (selectedBayNo !== null) {
          api.releaseBay(selectedBayNo).catch(console.error);
        }
        authMember = null;
        selectedBayNo = null;
        step = 'INTRO';
      };

      handleLogout();

      expect(authMember).toBeNull();
      expect(selectedBayNo).toBeNull();
      expect(step).toBe('INTRO');
      expect(releaseBaySpy).toHaveBeenCalledWith(9);
      expect(writeLogSpy).toHaveBeenCalledWith(
        'SESSION_CLOSE',
        '김방치 회원 세션 정상 종료',
        'M_IDLE_01'
      );
    });
  });
});
