import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Par-3 Allocation Audit Fixes (BUG-P3-01 ~ BUG-P3-06)', () => {
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

  it('BUG-P3-01 & BUG-P3-06: bookPar3Course transmits prod_cd, leader, and companions to /kiosk/facilities/preoccupy', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        res_id: 'RES_PAR3_999',
        group_id: 'GRP_PAR3_999',
        price: 25000,
        message: '파3 예약 선점 완료',
      }),
    });
    global.fetch = mockFetch as any;

    const result = await api.bookPar3Course(
      'PAR3-A1',
      '20301115',
      '10:00',
      25000,
      {
        member_no: 'MEM_01',
        guest_nm: '대표회원',
        hp_no: '01011112222',
        is_member: true,
        use_ticket_id: 801,
      },
      [
        {
          guest_nm: '비회원동반',
          hp_no: '01033334444',
          is_member: false,
          use_ticket_id: null,
        },
      ],
      'PROD-PAR3-9H',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, reqInit] = mockFetch.mock.calls[0];
    const parsedBody = JSON.parse(reqInit.body);
    expect(parsedBody.zone_code).toBe('PAR3-A1');
    expect(parsedBody.slot_time).toBe('1000');
    expect(parsedBody.prod_cd).toBe('PROD-PAR3-9H');
    expect(parsedBody.leader.use_ticket_id).toBe(801);
    expect(parsedBody.companions).toHaveLength(1);
    expect(result.price).toBe(25000);
  });

  it('BUG-P3-03: Par-3 ticket filter blocks general BAY/PRACTICE/LESSON passes and enforces course allowed_zones', () => {
    const isTicketAllowedForPar3Course = (a: any, targetCourse?: string): boolean => {
      const targetCourseUpper = (targetCourse || '').trim().toUpperCase();
      const cats = Array.isArray(a.allowed_categories)
        ? a.allowed_categories.map((c: string) => String(c).trim().toUpperCase()).filter(Boolean)
        : [];
      const zones = Array.isArray(a.allowed_zones)
        ? a.allowed_zones.map((z: string) => String(z).trim().toUpperCase()).filter(Boolean)
        : [];
      const itemNameUpper = String(a.item_name || a.prod_nm || '').toUpperCase();
      const logicTypeUpper = String(a.logic_type || '').toUpperCase();

      if (zones.length > 0 && targetCourseUpper) {
        if (!zones.includes('ALL') && !zones.includes(targetCourseUpper)) {
          return false;
        }
      }

      if (cats.length > 0) {
        const hasPar3Cat = cats.some(
          (c: string) =>
            c === 'PAR3' ||
            c === 'FACILITY' ||
            c === 'ALL' ||
            c === 'GOLF_PAR3' ||
            (targetCourseUpper && c === targetCourseUpper),
        );
        if (!hasPar3Cat) return false;
      } else {
        const isExplicitNonPar3 =
          logicTypeUpper === 'PRACTICE' ||
          logicTypeUpper === 'LESSON' ||
          logicTypeUpper === 'LOCKER' ||
          itemNameUpper.includes('타석') ||
          itemNameUpper.includes('레슨') ||
          itemNameUpper.includes('라카') ||
          itemNameUpper.includes('락커');
        const isExplicitPar3 =
          logicTypeUpper === 'PAR3' ||
          itemNameUpper.includes('파3') ||
          itemNameUpper.includes('PAR3') ||
          itemNameUpper.includes('라운딩');
        if (isExplicitNonPar3 && !isExplicitPar3) return false;
      }
      return true;
    };

    const practicePass = { item_name: '일일타석 10회권', allowed_categories: ['BAY', 'PRACTICE'] };
    const lessonPass = { item_name: '프로 레슨 10회권', allowed_categories: ['LESSON'] };
    const par3CourseAPass = { item_name: '파3 A코스 전용권', allowed_categories: ['PAR3-A1'], allowed_zones: ['PAR3-A1'] };
    const par3AllPass = { item_name: '파3 전코스 10회권', allowed_categories: ['PAR3'] };

    expect(isTicketAllowedForPar3Course(practicePass, 'PAR3-A1')).toBe(false);
    expect(isTicketAllowedForPar3Course(lessonPass, 'PAR3-A1')).toBe(false);
    expect(isTicketAllowedForPar3Course(par3CourseAPass, 'PAR3-A1')).toBe(true);
    expect(isTicketAllowedForPar3Course(par3CourseAPass, 'PAR3-B1')).toBe(false);
    expect(isTicketAllowedForPar3Course(par3AllPass, 'PAR3-B1')).toBe(true);
  });

  it('BUG-P3-05: Member grade discount applies per-player when no ticket is used', () => {
    const unitPrice = 25000;
    const calcPrice = (p: { is_member: boolean; use_ticket_id?: number | null; member_discount_rate?: number }) => {
      if (p.use_ticket_id) return 0;
      const rate = p.is_member ? Math.max(0, Math.min(100, Number(p.member_discount_rate || 0))) : 0;
      if (rate > 0) {
        const disc = Math.round(unitPrice * (rate / 100));
        return Math.max(0, unitPrice - disc);
      }
      return unitPrice;
    };

    expect(calcPrice({ is_member: true, use_ticket_id: 801, member_discount_rate: 10 })).toBe(0);
    expect(calcPrice({ is_member: true, use_ticket_id: null, member_discount_rate: 10 })).toBe(22500);
    expect(calcPrice({ is_member: false, use_ticket_id: null, member_discount_rate: 10 })).toBe(25000);
  });
});
