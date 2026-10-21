import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { Locker, Product } from '../api';
import { TimeMaster } from '../../utils/timeMaster';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

// Helper: Mirror of LockerExtend.tsx helper functions for pure logic testing
const formatYmdDisplay = (raw?: string | null): string => {
  const cleaned = String(raw || '').trim();
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  return cleaned || '-';
};

const parseLocalYmd = (raw?: string | null): Date | null => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6)) - 1;
  const d = Number(digits.slice(6, 8));
  const dt = new Date(y, m, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const getLockerKey = (locker: Locker): string => {
  const idPart = (locker as any)?.locker_id;
  const noPart = (locker as any)?.display_no || locker.locker_no;
  return idPart !== undefined && idPart !== null ? `ID:${idPart}:NO:${noPart}` : `NO:${noPart}`;
};

const computeProjectedEndYmd = (
  locker: Locker | undefined,
  extendDays: number,
  referenceTodayDate: Date
): { currentYmd: string; nextYmd: string } => {
  const currentYmd = formatYmdDisplay(locker?.end_dt);
  const parsedEnd = parseLocalYmd(locker?.end_dt);
  const isUnexpired = Boolean(parsedEnd && parsedEnd.getTime() >= referenceTodayDate.getTime());
  const targetDate = new Date(referenceTodayDate);
  if (isUnexpired && parsedEnd) {
    targetDate.setTime(parsedEnd.getTime());
    targetDate.setDate(targetDate.getDate() + extendDays);
  } else {
    targetDate.setDate(targetDate.getDate() + Math.max(0, extendDays - 1));
  }
  return {
    currentYmd,
    nextYmd: TimeMaster.getKstYmd(targetDate)
  };
};

describe('Kiosk Locker Core & Timing Simulation (L01, L02, L03, L05)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_KIOSK_LOCKER');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'T-KIOSK-01');
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('S_KIOSK_LOCKER');
    vi.spyOn(api, 'getTerminalId').mockReturnValue('T-KIOSK-01');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // L01 [정상 이용 중(OCCUPIED) 라카 30일 연장 및 만료일 익일 연쇄 연장(Chaining)]
  // =========================================================================
  describe('L01 [정상 이용 중(OCCUPIED) 라카 30일 연장 및 만료일 익일 연쇄 연장(Chaining)]', () => {
    it('이용 중인 라카(만료일: 2026-11-15) 30일 연장 시 익일 연쇄 연장되어 2026-12-15로 0일 손실 없이 승계된다', async () => {
      const activeLocker: Locker = {
        locker_id: 101,
        locker_no: '101',
        group_id: 'GRP_A',
        zone_name: 'A구역 (1F)',
        status: 'OCCUPIED',
        member_no: 'M_ACTIVE_01',
        member_name: '김활성',
        end_dt: '2026-11-15',
      };
      localStorage.setItem('LM_LOCKERS', JSON.stringify([activeLocker]));

      // 1. 만료일 연쇄 연장(Chaining) 순수 로직 검증: 2026-11-15 + 30 days = 2026-12-15
      const mockToday = new Date(2026, 9, 20); // 2026-10-20
      mockToday.setHours(0, 0, 0, 0);
      const projected = computeProjectedEndYmd(activeLocker, 30, mockToday);
      expect(projected.currentYmd).toBe('2026-11-15');
      expect(projected.nextYmd).toBe('2026-12-15');

      // 2. holdLockerExtension API 호출 검증
      let holdPayloadCaptured: any = null;
      let webhookPayloadCaptured: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/lockers/extend/hold')) {
          holdPayloadCaptured = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_LOCKER_20261020090000_101_A1B2',
              message: '라카 연장 대기가 완료되었습니다. 결제를 진행해주세요.',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          webhookPayloadCaptured = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              message: '결제가 완료되었습니다.',
              locker_no: '101',
              start_date: '2026-11-15',
              end_date: '2026-12-15',
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const holdRes = await api.holdLockerExtension(101, 30000, 'PROD_LOCKER_30D', 'M_ACTIVE_01', '101');
      expect(holdRes.success).toBe(true);
      expect(holdRes.res_id).toBe('RES_LOCKER_20261020090000_101_A1B2');
      expect(holdPayloadCaptured).toEqual({
        locker_id: 101,
        locker_no: '101',
        member_no: 'M_ACTIVE_01',
        amount: 30000,
        prod_cd: 'PROD_LOCKER_30D',
      });

      // 3. extendLocker (Webhook) 결제 승인 호출 검증
      const extRes = await api.extendLocker('101', 30, 30000, holdRes.res_id, undefined, 0, {
        usedPoints: 0,
        gradeDiscountAmount: 0,
        prodCd: 'PROD_LOCKER_30D',
      });
      expect(extRes.success).toBe(true);
      expect(extRes.locker_no).toBe('101');
      expect(extRes.start_date).toBe('2026-11-15');
      expect(extRes.end_date).toBe('2026-12-15');
      expect(webhookPayloadCaptured.res_id).toBe('RES_LOCKER_20261020090000_101_A1B2');
      expect(webhookPayloadCaptured.amount).toBe(30000);

      // 4. 로컬 스토리지 라카 상태 반영 검증
      const updatedLockers = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]');
      expect(updatedLockers[0].status).toBe('OCCUPIED');
      expect(updatedLockers[0].end_dt).toBe('2026-12-15');
    });
  });

  // =========================================================================
  // L02 [만료 유예기간 내(EXPIRED, overdue <= grace_period) 라카 당일 기산 연장]
  // =========================================================================
  describe('L02 [만료 유예기간 내(EXPIRED, overdue <= grace_period) 라카 당일 기산 연장]', () => {
    it('3일 전 만료된 유예기간(7일) 내 라카는 EXPIRED로 조회되고, 30일 연장 시 당일 기산(today + 29일)으로 연장된다', async () => {
      const expiredLocker: Locker = {
        locker_id: 205,
        locker_no: '205',
        group_id: 'GRP_B',
        zone_name: 'B구역 (2F)',
        status: 'EXPIRED',
        member_no: 'M_EXPIRED_02',
        member_name: '이만료',
        end_dt: '2026-10-17', // 기준일(2026-10-20) 기준 3일 전 만료
      };
      localStorage.setItem('LM_LOCKERS', JSON.stringify([expiredLocker]));

      // 1. 당일 기산 연장 날짜 계산: 2026-10-20 + (30 - 1) = 2026-11-18 (당일 포함 30일)
      const mockToday = new Date(2026, 9, 20); // 2026-10-20
      mockToday.setHours(0, 0, 0, 0);
      const projected = computeProjectedEndYmd(expiredLocker, 30, mockToday);
      expect(projected.currentYmd).toBe('2026-10-17');
      expect(projected.nextYmd).toBe('2026-11-18');

      // 2. getMemberLockers 조회 시 EXPIRED 상태로 정상 포함 확인
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/members/M_EXPIRED_02/lockers')) {
          return {
            ok: true,
            status: 200,
            json: async () => [expiredLocker],
          };
        }
        if (url.includes('/lockers/extend/hold')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_LOCKER_20261020091000_205_B3C4',
              message: '라카 연장 대기 완료',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              locker_no: '205',
              start_date: '2026-10-20',
              end_date: '2026-11-18',
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const memberLockers = await api.getMemberLockers('M_EXPIRED_02');
      expect(memberLockers.length).toBe(1);
      expect(memberLockers[0].status).toBe('EXPIRED');
      expect(memberLockers[0].locker_no).toBe('205');

      // 3. HOLD 생성 및 연장 결제 처리
      const holdRes = await api.holdLockerExtension(205, 30000, 'PROD_LOCKER_30D', 'M_EXPIRED_02', '205');
      expect(holdRes.success).toBe(true);

      const extRes = await api.extendLocker('205', 30, 30000, holdRes.res_id, undefined, 0, {
        prodCd: 'PROD_LOCKER_30D',
      });
      expect(extRes.success).toBe(true);
      expect(extRes.end_date).toBe('2026-11-18');

      // 4. 로컬 스토리지의 status가 EXPIRED에서 OCCUPIED로 복구되었는지 검증
      const updatedLockers = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]');
      expect(updatedLockers[0].status).toBe('OCCUPIED');
      expect(updatedLockers[0].end_dt).toBe('2026-11-18');
    });
  });

  // =========================================================================
  // L03 [유예기간 초과(EXPIRED, overdue > grace_period) 라카 키오스크 조회 및 연장 차단]
  // =========================================================================
  describe('L03 [유예기간 초과(EXPIRED, overdue > grace_period) 라카 키오스크 조회 및 연장 차단]', () => {
    it('15일 연체된 라카는 키오스크 조회 시 배제되고 직접 연장 요청 시 400 Bad Request로 차단된다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        // 1. 유예기간 7일을 초과(15일 연체)한 라카는 백엔드 목록에서 제외되어 빈 배열 반환
        if (url.includes('/members/M_OVERDUE_03/lockers')) {
          return {
            ok: true,
            status: 200,
            json: async () => [],
          };
        }
        // 2. 직접 POST /lockers/extend/hold 요청 시 400 Bad Request 에러 반환
        if (url.includes('/lockers/extend/hold')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              code: 'ERR_RENTAL_GRACE_EXPIRED',
              message: '연체 유예기간이 경과하여 무인 연장할 수 없습니다. 카운터에 문의해 주세요. (유예 기한: 7일, 경과: 15일)',
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      // 키오스크 조회 시 연체 라카 목록 배제 검증
      const memberLockers = await api.getMemberLockers('M_OVERDUE_03');
      expect(memberLockers).toEqual([]);

      // 직접 HOLD 시도 시 HTTP 400 차단 및 안내 문구 반환 검증
      const holdRes = await api.holdLockerExtension(308, 30000, 'PROD_LOCKER_30D', 'M_OVERDUE_03', '308');
      expect(holdRes.success).toBe(false);
      expect(holdRes.message).toContain('연체 유예기간이 경과하여 무인 연장할 수 없습니다. 카운터에 문의해 주세요.');
    });
  });

  // =========================================================================
  // L05 [다중 라카 보유 회원의 선택 라카 타겟팅 및 알파뉴메릭 라카 번호(A-12) 지원]
  // =========================================================================
  describe('L05 [다중 라카 보유 회원의 선택 라카 타겟팅 및 알파뉴메릭 라카 번호(A-12) 지원]', () => {
    it('다중 라카(#101, #A-12) 보유 회원의 개별 키 생성 및 #A-12 타겟팅 연장이 #101과 충돌 없이 독립 처리된다', async () => {
      const locker101: Locker = {
        locker_id: 101,
        locker_no: '101',
        group_id: 'GRP_VIP',
        zone_name: 'VIP존',
        status: 'OCCUPIED',
        member_no: 'M_MULTI_05',
        member_name: '최다중',
        end_dt: '2026-11-10',
      };
      const lockerA12: Locker = {
        locker_id: 502,
        locker_no: 'A-12',
        group_id: 'GRP_VIP',
        zone_name: 'VIP존',
        status: 'OCCUPIED',
        member_no: 'M_MULTI_05',
        member_name: '최다중',
        end_dt: '2026-11-20',
        ...({ display_no: 'A-12' } as any),
      };

      localStorage.setItem('LM_LOCKERS', JSON.stringify([locker101, lockerA12]));

      // 1. getLockerKey 고유 키 생성 검증 (충돌 방지)
      const key101 = getLockerKey(locker101);
      const keyA12 = getLockerKey(lockerA12);
      expect(key101).toBe('ID:101:NO:101');
      expect(keyA12).toBe('ID:502:NO:A-12');
      expect(key101).not.toBe(keyA12);

      // 2. Mock Fetch 세팅
      let capturedHoldBody: any = null;
      let capturedWebhookBody: any = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/lockers/extend/hold')) {
          capturedHoldBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_LOCKER_20261020092000_502_A12E',
              message: '라카 연장 대기 완료',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          capturedWebhookBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              locker_no: 'A-12',
              start_date: '2026-11-20',
              end_date: '2026-12-20',
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      // 3. #A-12 선택 후 연장 HOLD 요청 -> payload에 locker_id 502 및 locker_no 'A-12' 정확히 전달
      const holdRes = await api.holdLockerExtension(502, 30000, 'PROD_LOCKER_30D', 'M_MULTI_05', 'A-12');
      expect(holdRes.success).toBe(true);
      expect(capturedHoldBody).toEqual({
        locker_id: 502,
        locker_no: 'A-12',
        member_no: 'M_MULTI_05',
        amount: 30000,
        prod_cd: 'PROD_LOCKER_30D',
      });

      // 4. #A-12 결제 확정 (Webhook) -> locker_no 'A-12' 전달
      const extRes = await api.extendLocker('A-12', 30, 30000, holdRes.res_id, undefined, 0, {
        prodCd: 'PROD_LOCKER_30D',
      });
      expect(extRes.success).toBe(true);
      expect(extRes.locker_no).toBe('A-12');
      expect(extRes.end_date).toBe('2026-12-20');
      expect(capturedWebhookBody.res_id).toBe('RES_LOCKER_20261020092000_502_A12E');

      // 5. 로컬스토리지 검증: #A-12만 2026-12-20으로 연장되고, #101은 2026-11-10 그대로 유지
      const stored = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]') as Locker[];
      const stored101 = stored.find(l => String(l.locker_no) === '101');
      const storedA12 = stored.find(l => String(l.locker_no) === 'A-12');

      expect(storedA12?.end_dt).toBe('2026-12-20');
      expect(stored101?.end_dt).toBe('2026-11-10');
    });
  });
});
