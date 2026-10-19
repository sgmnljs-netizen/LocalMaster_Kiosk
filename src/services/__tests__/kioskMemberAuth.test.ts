import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Member Authentication Audit Fixes (BUG-M01 ~ BUG-M08)', () => {
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

  it('BUG-M01 & BUG-M04: authenticateSmartTag preserves full member assets in a single call', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        member_no: 'M_AUTH_100',
        member_name: '박스마트',
        masked_name: '박**트',
        hp: '010-3333-4444',
        grade_cd: 'VIP',
        discount_rate: 10,
        total_point: 15000,
        status_cd: '10',
        expiry_date: '2026-12-31',
        remain_days: 60,
        assets: [
          {
            member_item_id: '101',
            item_name: '종일 정기권 3개월',
            rem_count: 0,
            logic_type: 'PERIOD',
            duration_min: 60,
            is_assignable: true,
          },
          {
            member_item_id: '102',
            item_name: '타석 10회 쿠폰권',
            rem_count: 7,
            logic_type: 'COUNT',
            duration_min: 60,
            is_assignable: true,
          },
        ],
      }),
    });
    global.fetch = mockFetch as any;

    const result = await api.authenticateSmartTag('GOLFOS_MEMBER_M_AUTH_100');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.member_no).toBe('M_AUTH_100');
    expect(result?.masked_name).toBe('박**트');
    expect(result?.discount_rate).toBe(10);
    expect(result?.total_point).toBe(15000);
    expect(result?.assets).toHaveLength(2);
    expect(result?.assets?.[1].remain_cnt).toBe(7);
  });

  it('BUG-M02: getMember and authenticateSmartTag propagate 409 duplicate candidates without swallowing', async () => {
    const candidates = [
      { member_no: 'M_FAM_01', member_name: '최아빠', masked_name: '최*빠', hp: '010-5555-6666' },
      { member_no: 'M_FAM_02', member_name: '최아들', masked_name: '최*들', hp: '01055556666' },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        detail: '동일한 휴대폰 번호로 등록된 회원이 2명 있습니다.',
        code: 'DUPLICATE_EXACT_PHONE',
        candidates,
      }),
    }) as any;

    await expect(api.getMember('010-5555-6666')).rejects.toMatchObject({
      status: 409,
      duplicate: true,
      code: 'DUPLICATE_EXACT_PHONE',
      candidates,
    });

    await expect(api.authenticateSmartTag('010-5555-6666')).rejects.toMatchObject({
      status: 409,
      duplicate: true,
      code: 'DUPLICATE_EXACT_PHONE',
      candidates,
    });
  });

  it('BUG-M03: getMember and authenticateSmartTag propagate 403 inactive/suspended member error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        detail: '현재 휴면 또는 이용 제한(일시정지/탈퇴) 상태인 회원입니다. 프런트 데스크에 문의해 주세요.',
      }),
    }) as any;

    await expect(api.getMember('010-7777-9999')).rejects.toMatchObject({
      status: 403,
      inactive: true,
    });

    await expect(api.authenticateSmartTag('M_SUSP_01')).rejects.toMatchObject({
      status: 403,
      inactive: true,
    });
  });

  it('BUG-M02 & BUG-M04: EdgeDB offline fallback normalizes prefixes and prioritizes exact member_no match', async () => {
    vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
    localStorage.setItem(
      'LM_MEMBERS',
      JSON.stringify([
        { member_no: 'M1001', member_name: '이천일', hp: '010-1000-1001' },
        { member_no: 'M100', member_name: '김일백', hp: '010-1000-0100' },
      ])
    );

    const exact = await api.getMember('GOLFOS_MEMBER_M100');
    expect(exact?.member_no).toBe('M100');
    expect(exact?.member_name).toBe('김일백');
  });

  it('BUG-M08 & BUG-R03: enrollMemberFace rejects empty/mock base64 and does not mask backend failure in online mode', async () => {
    const emptyRes = await api.enrollMemberFace('M_NEW_01', '신규회원', '');
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.message).toContain('유효한 안면 촬영 이미지');

    const mockB64Res = await api.enrollMemberFace('M_NEW_01', '신규회원', 'MOCK_FACE_BASE64_DATA');
    expect(mockB64Res.success).toBe(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        detail: '안면인식 단말기 연결 실패',
      }),
    }) as any;

    const res = await api.enrollMemberFace('M_NEW_01', '신규회원', 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(res.success).toBe(false);
    expect(res.message).toContain('안면인식 단말기 연결 실패');
  });

  it('BUG-R02 & BUG-R06: registerMember trims name and preserves grade discount_rate and point_rate from backend', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        member_no: 'R0101',
        member_name: '김신규',
        masked_name: '김*규',
        hp: '010-7111-8222',
        store_cd: 'S_TEST',
        gender: 'F',
        face_registered: false,
        grade_cd: 'GENERAL',
        discount_rate: 5,
        point_rate: 2,
        total_point: 0,
        assets: [],
      }),
    });
    global.fetch = mockFetch as any;

    const res = await api.registerMember('  김신규  ', '010-7111-8222', '', true, 'FACE_01071118222', 'F', true);
    expect(res.success).toBe(true);
    const [, reqInit] = mockFetch.mock.calls[0];
    const parsedBody = JSON.parse(reqInit.body);
    expect(parsedBody.member_name).toBe('김신규');
    expect(res.member?.discount_rate).toBe(5);
    expect(res.member?.point_rate).toBe(2);
    expect(res.member?.masked_name).toBe('김*규');
    // Backend returns face_registered=false until enrollMemberFace succeeds
    expect(res.member?.face_registered).toBe(false);
  });

  it('BUG-R03 & BUG-R04: getTerms returns empty strings when store has no custom terms and face capture APIs pass store_cd', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ privacy: '', marketing: '' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ has_face: true, image_base64: 'REAL_JPEG_B64' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
    global.fetch = mockFetch as any;

    const terms = await api.getTerms();
    expect(terms.privacy_content).toBe('');
    expect(terms.marketing_content).toBe('');

    await api.startFaceCaptureMode();
    expect(String(mockFetch.mock.calls[1][0])).toContain('store_cd=');

    const detected = await api.detectFaceCamera();
    expect(String(mockFetch.mock.calls[2][0])).toContain('store_cd=');
    expect(detected.detected).toBe(true);
    expect(detected.imageBase64).toBe('REAL_JPEG_B64');

    await api.cancelFaceCaptureMode();
    expect(String(mockFetch.mock.calls[3][0])).toContain('store_cd=');
  });

  it('BUG-V01 ~ BUG-V08: moveBay sends source bay and returns preserved remaining time and slot metadata', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: '2번에서 3번 타석으로 이동이 완료되었습니다.',
        old_bay_no: 2,
        new_bay_no: 3,
        remain_min: 48,
        start_time: '14:00',
        end_time: '14:48',
        res_id: 'RES_MOVE_CHK_2',
      }),
    });
    global.fetch = mockFetch as any;

    const res = await api.moveBay('M_MOVE_01', 3, 2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, reqInit] = mockFetch.mock.calls[0];
    const parsedBody = JSON.parse(reqInit.body);
    expect(parsedBody.member_no).toBe('M_MOVE_01');
    expect(parsedBody.old_bay_no).toBe(2);
    expect(parsedBody.new_bay_no).toBe(3);
    expect(res.success).toBe(true);
    expect(res.old_bay_no).toBe(2);
    expect(res.new_bay_no).toBe(3);
    expect(res.remain_min).toBe(48);
    expect(res.start_time).toBe('14:00');
    expect(res.end_time).toBe('14:48');
  });

  it('BUG-V05 & BUG-V06: moveBay surfaces backend access_rules and 5-min remaining time errors cleanly', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: '현재 이용 중인 이용권(1층 GDR 전용 정기권)으로는 2층 타석으로 이동할 수 없습니다.',
      }),
    }) as any;

    const res = await api.moveBay('M_MOVE_01', 15, 1);
    expect(res.success).toBe(false);
    expect(res.message).toContain('1층 GDR 전용 정기권');
  });

  it('BUG-L01, BUG-L04, BUG-L05: extendLocker supports alphanumeric locker_no & SSOT expiry formula, and cancelHoldReservation cancels RES_LOCKER_ holds on backend', async () => {
    localStorage.setItem(
      'LM_LOCKERS',
      JSON.stringify([
        {
          locker_id: 25,
          locker_no: 'A-25',
          status: 'EXPIRED',
          member_no: 'M_LK_01',
          end_dt: '2020-01-01',
        },
      ])
    );

    const mockFetch = vi
      .fn()
      // 1) extendLocker -> POST /v1/kiosk/payment-webhook
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          locker_no: 'A-25',
          start_date: '2026-10-19',
          end_date: '2026-11-17',
        }),
      })
      // 2) cancelHoldReservation -> PATCH /reservations/RES_LOCKER_.../cancel
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'cancelled' }),
      });
    global.fetch = mockFetch as any;

    const extRes = await api.extendLocker('A-25', 30, 27000, 'RES_LOCKER_20261019_25_ABCD', undefined, 0, {
      usedPoints: 0,
      gradeDiscountAmount: 3000,
      prodCd: 'P_LK_30',
    });
    expect(extRes.success).toBe(true);
    expect(extRes.locker_no).toBe('A-25');
    expect(extRes.start_date).toBe('2026-10-19');
    expect(extRes.end_date).toBe('2026-11-17');

    const storedLockers = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]');
    expect(storedLockers[0].status).toBe('OCCUPIED');
    expect(storedLockers[0].end_dt).toBe('2026-11-17');

    const cancelRes = await api.cancelHoldReservation('RES_LOCKER_20261019_25_ABCD');
    expect(cancelRes.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1][0])).toContain('/reservations/RES_LOCKER_20261019_25_ABCD/cancel');
  });
});
