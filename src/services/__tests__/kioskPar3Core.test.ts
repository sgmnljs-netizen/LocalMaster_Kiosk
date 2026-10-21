import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { KioskCompanionItem } from '../api';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

interface TestPlayerSlot {
  id: string;
  member_no?: string;
  guest_nm: string;
  hp_no: string;
  is_member: boolean;
  discount_rate?: number;
  use_ticket_id?: string;
  use_ticket_name?: string;
  ticket_allowed_categories?: string[];
}

describe('Kiosk Par3 Core Allocation & Pricing Scenarios (K01, K02, K03, K07)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;

  // Par3Allocation.tsx 내 핵심 요금 계산 로직 미러링
  const calculatePlayerPrice = (p: TestPlayerSlot, baseUnitPrice: number): number => {
    if (p.use_ticket_id) return 0;
    if (p.is_member && p.discount_rate && p.discount_rate > 0) {
      const rawRate = Number(p.discount_rate);
      const ratePct = rawRate > 0 && rawRate < 1 ? rawRate * 100 : rawRate;
      const clampedPct = Math.min(100, Math.max(0, ratePct));
      const discAmt = Math.floor((baseUnitPrice * clampedPct) / 100);
      return Math.max(0, baseUnitPrice - discAmt);
    }
    return baseUnitPrice;
  };

  const calculateTotalAmount = (players: TestPlayerSlot[], baseUnitPrice: number): number => {
    return players.reduce((sum, p) => sum + calculatePlayerPrice(p, baseUnitPrice), 0);
  };

  // Par3Allocation.tsx [BUG-P3-06] 코스 전환 시 전용권 호환성 가드 및 자동 해제 함수 미러링
  const applyCourseSwitchTicketGuard = (
    players: TestPlayerSlot[],
    targetCourse: string
  ): TestPlayerSlot[] => {
    if (!targetCourse) return players;
    const curZoneUpper = targetCourse.toUpperCase();
    return players.map(p => {
      if (!p.use_ticket_id || !p.ticket_allowed_categories || p.ticket_allowed_categories.length === 0) {
        return p;
      }
      const allowedUpper = p.ticket_allowed_categories.map(c => String(c).toUpperCase());
      const isCompatible =
        allowedUpper.includes('PAR3') ||
        allowedUpper.includes('ALL') ||
        allowedUpper.includes('FACILITY') ||
        allowedUpper.includes('GOLF_PAR3') ||
        allowedUpper.includes(curZoneUpper);
      if (!isCompatible) {
        return {
          ...p,
          use_ticket_id: undefined,
          use_ticket_name: undefined,
          ticket_allowed_categories: undefined,
        };
      }
      return p;
    });
  };

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanMod = await import('../van/van_client');
    kioskVanClient = vanMod.kioskVanClient;
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
  // Scenario K01: 1인 회원 파3 전용 이용권(TICKET) 0원 즉시 배정 및 1회 차감
  // =========================================================================
  describe('K01 [1인 회원 파3 전용 이용권(TICKET) 0원 즉시 배정 및 1회 차감]', () => {
    it('K01-1: 파3 이용권 보유 회원이 단독 배정 시 계산 요금 0원 및 카드 결제 바이패스 검증', async () => {
      const basePrice = 30000;
      const leaderSlot: TestPlayerSlot = {
        id: 'LEADER',
        member_no: 'MEM_01',
        guest_nm: '대표회원',
        hp_no: '01011112222',
        is_member: true,
        use_ticket_id: '1001',
        use_ticket_name: '파3 A코스 전용 10회권',
        ticket_allowed_categories: ['PAR3-A1'],
      };

      // 1. 프론트엔드 인원별/총액 계산 검증 (이용권 지정 시 0원)
      expect(calculatePlayerPrice(leaderSlot, basePrice)).toBe(0);
      expect(calculateTotalAmount([leaderSlot], basePrice)).toBe(0);

      // 2. 백엔드 선점 API 호출 모킹 (price = 0 반환)
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/facilities/preoccupy')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_PAR3_K01_LEADER',
              group_id: 'GRP_PAR3_K01',
              price: 0,
              message: '파3 예약 선점이 완료되었습니다.',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              message: 'Payment already processed and reservation confirmed',
            }),
          };
        }
        return { ok: false, status: 404 };
      });
      global.fetch = mockFetch as any;

      const leaderPayload: KioskCompanionItem = {
        member_no: leaderSlot.member_no,
        guest_nm: leaderSlot.guest_nm,
        hp_no: leaderSlot.hp_no,
        is_member: leaderSlot.is_member,
        use_ticket_id: leaderSlot.use_ticket_id,
      };

      const preoccupyRes = await api.bookPar3Course(
        'PAR3-A1',
        '20301115',
        '10:00',
        0,
        leaderPayload,
        [],
        'PROD-PAR3-BASE'
      );

      expect(preoccupyRes.success).toBe(true);
      expect(preoccupyRes.price).toBe(0);
      expect(preoccupyRes.res_id).toBe('RES_PAR3_K01_LEADER');

      // 3. 실물 VAN 카드 결제 단말기 호출 바이패스 검증 (금액 0원이므로 requestCardPayment 호출되지 않음)
      const approveSpy = vi.spyOn(kioskVanClient, 'requestCardPayment');

      // Par3Allocation runRealCardPayment 로직 시뮬레이션:
      // serverValidatedAmt === 0 이면 카드 리더기 생략하고 즉시 TICKET 웹훅 확정
      const serverAmt = preoccupyRes.price ?? 0;
      if (serverAmt === 0) {
        await api.confirmKioskPaymentWebhook(
          preoccupyRes.res_id!,
          0,
          'TICKET',
          {
            cardCompany: 'MEMBERSHIP_TICKET',
            authCode: 'MEMBERSHIP_TICKET',
            prodCd: 'PROD-PAR3-BASE',
          }
        );
      } else {
        await kioskVanClient.requestCardPayment({ amount: serverAmt, vat: 0 });
      }

      // VAN 승인 API가 절대 호출되지 않았음을 단언
      expect(approveSpy).not.toHaveBeenCalled();

      // 결제 웹훅이 0원, TICKET 결제수단으로 전달되었는지 단언
      const webhookCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/payment-webhook'));
      expect(webhookCall).toBeDefined();
      const webhookBody = JSON.parse(webhookCall![1].body);
      expect(webhookBody.res_id).toBe('RES_PAR3_K01_LEADER');
      expect(webhookBody.amount).toBe(0);
      expect(webhookBody.payment_method).toBe('TICKET');
    });
  });

  // =========================================================================
  // Scenario K02: 대표자(카드) + 동반자 2인(비회원) 총 3인 인원비례 과금 배정
  // =========================================================================
  describe('K02 [대표자(카드) + 동반자 2인(비회원) 총 3인 인원비례 과금 배정]', () => {
    it('K02-1: 3인 전원 카드 결제 시 1인당 30,000원 -> 총 90,000원 산출 및 결제 승인 연동 검증', async () => {
      const basePrice = 30000;
      const players: TestPlayerSlot[] = [
        {
          id: 'LEADER',
          member_no: 'MEM_01',
          guest_nm: '대표회원',
          hp_no: '01011112222',
          is_member: true,
          use_ticket_id: undefined,
        },
        {
          id: 'COMP_1',
          guest_nm: '비회원동반1',
          hp_no: '01033334444',
          is_member: false,
          use_ticket_id: undefined,
        },
        {
          id: 'COMP_2',
          guest_nm: '비회원동반2',
          hp_no: '01055556666',
          is_member: false,
          use_ticket_id: undefined,
        },
      ];

      // 1. 프론트엔드 인원비례 총액 계산: 3명 * 30,000원 = 90,000원
      const totalAmt = calculateTotalAmount(players, basePrice);
      expect(totalAmt).toBe(90000);

      // 공급가액 / 부가세 분리 검증 (일반 과세 상품: 10% VAT)
      const supplyAmt = Math.round(totalAmt / 1.1);
      const vatAmt = totalAmt - supplyAmt;
      expect(supplyAmt).toBe(81818);
      expect(vatAmt).toBe(8182);

      // 2. 백엔드 선점 API 호출 모킹
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/facilities/preoccupy')) {
          const body = JSON.parse(init?.body as string);
          expect(body.amount).toBe(90000);
          expect(body.companions).toHaveLength(2);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_PAR3_K02_LEADER',
              group_id: 'GRP_PAR3_K02_TEAM',
              price: 90000,
              message: '파3 예약 선점이 완료되었습니다.',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          const body = JSON.parse(init?.body as string);
          expect(body.amount).toBe(90000);
          expect(body.payment_method).toBe('CARD');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              message: 'Payment approved and reservations confirmed',
            }),
          };
        }
        return { ok: false, status: 404 };
      });
      global.fetch = mockFetch as any;

      const leader = players[0];
      const companions = players.slice(1).map(c => ({
        guest_nm: c.guest_nm,
        hp_no: c.hp_no,
        is_member: c.is_member,
        use_ticket_id: undefined,
      }));

      const bookRes = await api.bookPar3Course(
        'PAR3-A1',
        '20301115',
        '11:00',
        totalAmt,
        {
          member_no: leader.member_no,
          guest_nm: leader.guest_nm,
          hp_no: leader.hp_no,
          is_member: leader.is_member,
          use_ticket_id: undefined,
        },
        companions,
        'PROD-PAR3-BASE'
      );

      expect(bookRes.success).toBe(true);
      expect(bookRes.price).toBe(90000);
      expect(bookRes.res_id).toBe('RES_PAR3_K02_LEADER');

      // 3. 실물 VAN 카드 결제 90,000원 승인 연동
      const approveSpy = vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: '12345678',
        card_no_masked: '5424-****-****-1234',
        issuer_name: '국민카드',
        amount: 90000,
        approved_at: '20301115110500',
      });

      const vanResult = await kioskVanClient.requestCardPayment({
        amount: bookRes.price!,
        vat: vatAmt,
      });

      expect(approveSpy).toHaveBeenCalledWith({
        amount: 90000,
        vat: 8182,
      });
      expect(vanResult.success).toBe(true);

      // 4. 결제 웹훅 전송 및 예약 확정
      const confirmResult = await api.confirmKioskPaymentWebhook(
        bookRes.res_id!,
        bookRes.price!,
        'CARD',
        {
          authCode: vanResult.auth_code,
          cardNoMasked: vanResult.card_no_masked,
          issuerName: vanResult.issuer_name,
        }
      );

      expect(confirmResult).toBe(true);
    });
  });

  // =========================================================================
  // Scenario K03: 복합 라운딩: 회원 이용권 1인(0원) + 비회원 동반자 1인(카드 30,000원)
  // =========================================================================
  describe('K03 [복합 라운딩: 회원 이용권 1인(0원) + 비회원 동반자 1인(카드 30,000원)]', () => {
    it('K03-1: 대표회원 이용권(0원) + 동반 비회원(30,000원) 복합 결제 요금 산출 및 승인 검증', async () => {
      const basePrice = 30000;
      const players: TestPlayerSlot[] = [
        {
          id: 'LEADER',
          member_no: 'MEM_01',
          guest_nm: '대표회원',
          hp_no: '01011112222',
          is_member: true,
          use_ticket_id: '1001',
          use_ticket_name: '파3 A코스 전용 10회권',
          ticket_allowed_categories: ['PAR3-A1'],
        },
        {
          id: 'COMP_1',
          guest_nm: '비회원동반1',
          hp_no: '01077778888',
          is_member: false,
          use_ticket_id: undefined,
        },
      ];

      // 1. 개별 요금 및 총 결제금액 계산: 대표자 0원 + 동반자 30,000원 = 30,000원
      expect(calculatePlayerPrice(players[0], basePrice)).toBe(0);
      expect(calculatePlayerPrice(players[1], basePrice)).toBe(30000);
      const totalAmount = calculateTotalAmount(players, basePrice);
      expect(totalAmount).toBe(30000);

      // 2. 백엔드 선점 API 호출 모킹 (동반자 미결제 금액 30,000원 유지 반환)
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/facilities/preoccupy')) {
          const body = JSON.parse(init?.body as string);
          expect(body.leader.use_ticket_id).toBe('1001');
          expect(body.companions[0].use_ticket_id).toBeUndefined();
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_PAR3_K03_LEADER',
              group_id: 'GRP_PAR3_K03_MIXED',
              price: 30000,
              message: '파3 예약 선점이 완료되었습니다.',
            }),
          };
        }
        if (url.includes('/payment-webhook')) {
          const body = JSON.parse(init?.body as string);
          expect(body.amount).toBe(30000);
          expect(body.payment_method).toBe('CARD');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              message: 'Payment approved',
            }),
          };
        }
        return { ok: false, status: 404 };
      });
      global.fetch = mockFetch as any;

      const bookRes = await api.bookPar3Course(
        'PAR3-A1',
        '20301115',
        '12:00',
        totalAmount,
        {
          member_no: players[0].member_no,
          guest_nm: players[0].guest_nm,
          hp_no: players[0].hp_no,
          is_member: players[0].is_member,
          use_ticket_id: players[0].use_ticket_id,
        },
        [
          {
            guest_nm: players[1].guest_nm,
            hp_no: players[1].hp_no,
            is_member: players[1].is_member,
            use_ticket_id: undefined,
          },
        ],
        'PROD-PAR3-BASE'
      );

      expect(bookRes.success).toBe(true);
      expect(bookRes.price).toBe(30000);

      // 3. 미결제 동반자 요금 30,000원에 대해 실물 카드 결제 진행
      const approveSpy = vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: '87654321',
        card_no_masked: '4330-****-****-5678',
        issuer_name: '현대카드',
        amount: 30000,
        approved_at: '20301115120500',
      });

      const vatAmt = Math.round(bookRes.price! / 11);
      const vanResult = await kioskVanClient.requestCardPayment({
        amount: bookRes.price!,
        vat: vatAmt,
      });

      expect(approveSpy).toHaveBeenCalledWith({
        amount: 30000,
        vat: Math.round(30000 / 11),
      });
      expect(vanResult.success).toBe(true);

      // 4. 결제 웹훅 확정
      const confirmResult = await api.confirmKioskPaymentWebhook(
        bookRes.res_id!,
        30000,
        'CARD',
        {
          authCode: vanResult.auth_code,
          cardNoMasked: vanResult.card_no_masked,
          issuerName: vanResult.issuer_name,
        }
      );
      expect(confirmResult).toBe(true);
    });
  });

  // =========================================================================
  // Scenario K07: 코스 전용권의 타 코스 이용 차단 및 코스 변경 시 자동 해제 가드
  // =========================================================================
  describe('K07 [코스 전용권의 타 코스 이용 차단 및 코스 변경 시 자동 해제 가드]', () => {
    it('K07-1: A코스 전용권 등록 상태에서 B코스로 전환 시 이용권 자동 해제 및 일반 요금 복귀 검증', () => {
      const basePrice = 30000;
      const initialPlayers: TestPlayerSlot[] = [
        {
          id: 'LEADER',
          member_no: 'MEM_01',
          guest_nm: '대표회원',
          hp_no: '01011112222',
          is_member: true,
          use_ticket_id: '1001',
          use_ticket_name: '파3 A코스 전용 10회권',
          ticket_allowed_categories: ['PAR3-A1'],
        },
      ];

      // 1. A코스(PAR3-A1) 선택 상태: 전용권이 호환되므로 use_ticket_id 유지 및 0원 계산
      const courseAPlayers = applyCourseSwitchTicketGuard(initialPlayers, 'PAR3-A1');
      expect(courseAPlayers[0].use_ticket_id).toBe('1001');
      expect(calculatePlayerPrice(courseAPlayers[0], basePrice)).toBe(0);
      expect(calculateTotalAmount(courseAPlayers, basePrice)).toBe(0);

      // 2. 사용자가 화면에서 B코스(PAR3-B1)로 탭 전환 시:
      // applyCourseSwitchTicketGuard 가 동작하여 호환되지 않는 전용권 자동 해제 (use_ticket_id: undefined)
      const courseBPlayers = applyCourseSwitchTicketGuard(courseAPlayers, 'PAR3-B1');
      expect(courseBPlayers[0].use_ticket_id).toBeUndefined();
      expect(courseBPlayers[0].use_ticket_name).toBeUndefined();
      expect(courseBPlayers[0].ticket_allowed_categories).toBeUndefined();

      // 3. 이용권이 자동 해제되었으므로 일반 정가 30,000원으로 자동 재계산됨을 단언
      expect(calculatePlayerPrice(courseBPlayers[0], basePrice)).toBe(30000);
      expect(calculateTotalAmount(courseBPlayers, basePrice)).toBe(30000);
    });

    it('K07-2: 전코스 통합 이용권(PAR3 또는 ALL)은 코스 변경 시에도 해제되지 않고 0원 유지 검증', () => {
      const basePrice = 30000;
      const allCoursePlayers: TestPlayerSlot[] = [
        {
          id: 'LEADER',
          member_no: 'MEM_01',
          guest_nm: '대표회원',
          hp_no: '01011112222',
          is_member: true,
          use_ticket_id: '1002',
          use_ticket_name: '파3 전코스 10회권',
          ticket_allowed_categories: ['PAR3'],
        },
      ];

      // A코스에서 B코스로 전환
      const switchedToB = applyCourseSwitchTicketGuard(allCoursePlayers, 'PAR3-B1');
      expect(switchedToB[0].use_ticket_id).toBe('1002');
      expect(calculateTotalAmount(switchedToB, basePrice)).toBe(0);

      // B코스에서 A코스로 전환
      const switchedBackToA = applyCourseSwitchTicketGuard(switchedToB, 'PAR3-A1');
      expect(switchedBackToA[0].use_ticket_id).toBe('1002');
      expect(calculateTotalAmount(switchedBackToA, basePrice)).toBe(0);
    });

    it('K07-3: 이용권 선택 팝업 필터링 - B코스 선택 시 A코스 전용권은 노출 대상에서 제외됨 검증', () => {
      const isTicketAllowedForPar3Course = (a: any, targetCourse?: string): boolean => {
        const targetCourseUpper = (targetCourse || '').trim().toUpperCase();
        const cats = Array.isArray(a.allowed_categories)
          ? a.allowed_categories.map((c: string) => String(c).trim().toUpperCase()).filter(Boolean)
          : [];
        const zones = Array.isArray(a.allowed_zones)
          ? a.allowed_zones.map((z: string) => String(z).trim().toUpperCase()).filter(Boolean)
          : [];

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
              (targetCourseUpper && c === targetCourseUpper)
          );
          if (!hasPar3Cat) return false;
        }
        return true;
      };

      const ticketAOnly = {
        item_name: '파3 A코스 전용 10회권',
        allowed_categories: ['PAR3-A1'],
        allowed_zones: ['PAR3-A1'],
      };
      const ticketAll = {
        item_name: '파3 전코스 10회권',
        allowed_categories: ['PAR3'],
      };

      // A코스 화면: 둘 다 사용 가능
      expect(isTicketAllowedForPar3Course(ticketAOnly, 'PAR3-A1')).toBe(true);
      expect(isTicketAllowedForPar3Course(ticketAll, 'PAR3-A1')).toBe(true);

      // B코스 화면: A코스 전용권은 차단되고, 전코스 권만 허용됨
      expect(isTicketAllowedForPar3Course(ticketAOnly, 'PAR3-B1')).toBe(false);
      expect(isTicketAllowedForPar3Course(ticketAll, 'PAR3-B1')).toBe(true);
    });
  });
});
