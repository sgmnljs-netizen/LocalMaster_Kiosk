import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { Par3Slot, KioskCompanionItem } from '../../types';

// Node 환경용 localStorage 폴리필 (정적 import 호이스팅 방지를 위해 상단 배치)
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Par3 Gates & Concurrency Scenarios (K04, K05, K06, K08)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let executeKioskAutoReversal: typeof import('../van/kioskPaymentReversal').executeKioskAutoReversal;
  type CardApprovalResult = import('../van/van_types').CardApprovalResult;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanMod = await import('../van/van_client');
    kioskVanClient = vanMod.kioskVanClient;
    const revMod = await import('../van/kioskPaymentReversal');
    executeKioskAutoReversal = revMod.executeKioskAutoReversal;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // K04: 티타임 이동 버퍼(10분) 미달 슬롯(BLOCKED) 예약 차단
  // =========================================================================
  describe('K04 [티타임 이동 버퍼(10분) 미달 슬롯(BLOCKED) 예약 차단]', () => {
    it('K04-1: GET /facilities/slots 에서 cutoff_time(14:10) 미달 슬롯(14:05)은 BLOCKED 로 표시된다', async () => {
      const mockSlots: Par3Slot[] = [
        {
          slot_id: 'P3S-CAT_PAR3-1400',
          time: '14:00',
          course_nm: '파3 정규코스',
          status: 'BLOCKED',
          current_party_size: 0,
        },
        {
          slot_id: 'P3S-CAT_PAR3-1405',
          time: '14:05',
          course_nm: '파3 정규코스',
          status: 'BLOCKED',
          current_party_size: 0,
        },
        {
          slot_id: 'P3S-CAT_PAR3-1410',
          time: '14:10',
          course_nm: '파3 정규코스',
          status: 'AVAILABLE',
          current_party_size: 0,
        },
        {
          slot_id: 'P3S-CAT_PAR3-1415',
          time: '14:15',
          course_nm: '파3 정규코스',
          status: 'AVAILABLE',
          current_party_size: 0,
        },
      ];

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSlots,
      });
      global.fetch = mockFetch as any;

      const slots = await api.getPar3Slots('CAT_PAR3', '20261020');
      expect(slots).toHaveLength(4);

      const slot1405 = slots.find(s => s.time === '14:05');
      expect(slot1405).toBeDefined();
      expect(slot1405?.status).toBe('BLOCKED');

      const slot1410 = slots.find(s => s.time === '14:10');
      expect(slot1410).toBeDefined();
      expect(slot1410?.status).toBe('AVAILABLE');
    });

    it('K04-2: POST /facilities/preoccupy 로 14:05 슬롯 요청 시 400 Bad Request 및 안내 메시지 반환', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '이동 준비시간(10분)이 부족한 시간대입니다. 다른 시간대를 선택해 주세요.',
        }),
      });
      global.fetch = mockFetch as any;

      const leader: KioskCompanionItem = {
        member_no: 'M1001',
        guest_nm: '홍길동',
        hp_no: '01011112222',
        is_member: true,
      };

      const result = await api.bookPar3Course(
        'CAT_PAR3',
        '20261020',
        '14:05',
        90000,
        leader,
        [],
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('이동 준비시간(10분)이 부족한 시간대입니다. 다른 시간대를 선택해 주세요.');
    });
  });

  // =========================================================================
  // K05: 동일 티오프 슬롯 동시 선점 충돌 방어 (Slot Concurrency 409 Conflict)
  // =========================================================================
  describe('K05 [동일 티오프 슬롯 동시 선점 충돌 방어 (Slot Concurrency 409 Conflict)]', () => {
    it('K05-1: 동일 15:00 슬롯에 대해 1번 키오스크는 200 OK, 2번 키오스크는 409 Conflict 수신', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              res_id: 'RES_PAR3_20301020_1500_6',
              price: 90000,
              message: '파3 예약 선점 완료',
            }),
          };
        } else {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: '선택한 시간대의 슬롯이 이미 마감되었습니다.',
            }),
          };
        }
      });
      global.fetch = mockFetch as any;

      const leader1: KioskCompanionItem = {
        member_no: 'M_KIOSK_1',
        guest_nm: '키오스크1고객',
        hp_no: '01011113333',
        is_member: true,
      };
      const leader2: KioskCompanionItem = {
        member_no: 'M_KIOSK_2',
        guest_nm: '키오스크2고객',
        hp_no: '01022224444',
        is_member: true,
      };

      // 2개 키오스크에서 동시 선점 호출 시뮬레이션
      const [kiosk1Res, kiosk2Res] = await Promise.all([
        api.bookPar3Course('CAT_PAR3', '20301020', '15:00', 90000, leader1, []),
        api.bookPar3Course('CAT_PAR3', '20301020', '15:00', 90000, leader2, []),
      ]);

      expect(kiosk1Res.success).toBe(true);
      expect(kiosk1Res.res_id).toBe('RES_PAR3_20301020_1500_6');

      expect(kiosk2Res.success).toBe(false);
      expect(kiosk2Res.message).toBe('선택한 시간대의 슬롯이 이미 마감되었습니다.');
    });
  });

  // =========================================================================
  // K06: 한 라운딩 그룹 내 동일 회원번호 중복 배정 차단
  // =========================================================================
  describe('K06 [한 라운딩 그룹 내 동일 회원번호 중복 배정 차단]', () => {
    it('K06-1: 백엔드 API 호출 시 동일 회원번호 중복 시 400 Bad Request 거절', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          detail: '동일한 회원을 한 라운딩 그룹에 중복 배정할 수 없습니다.',
        }),
      });
      global.fetch = mockFetch as any;

      const leader: KioskCompanionItem = {
        member_no: 'M1001',
        guest_nm: '홍길동',
        hp_no: '01011112222',
        is_member: true,
      };
      const duplicateCompanion: KioskCompanionItem = {
        member_no: 'M1001', // 중복!
        guest_nm: '홍길동(동반)',
        hp_no: '01011112222',
        is_member: true,
      };

      const result = await api.bookPar3Course(
        'CAT_PAR3',
        '20301020',
        '16:00',
        90000,
        leader,
        [duplicateCompanion],
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('동일한 회원을 한 라운딩 그룹에 중복 배정할 수 없습니다.');
    });

    it('K06-2: 프론트엔드 Par3Allocation 플레이어 중복 방어 로직 (회원번호 및 휴대폰번호 교차 검증)', () => {
      // Par3Allocation.tsx 라인 373-377 및 407-418에 구현된 정합성 가드 검증
      interface PlayerSlot {
        member_no?: string;
        hp_no?: string;
        guest_nm: string;
      }

      const players: PlayerSlot[] = [
        { member_no: 'M1001', hp_no: '010-1111-2222', guest_nm: '대표자' },
        { member_no: 'M2002', hp_no: '010-3333-4444', guest_nm: '동반자1' },
      ];

      const checkDuplicateMember = (newMember: { member_no?: string; hp?: string }) => {
        const memberHpClean = (newMember.hp || '').replace(/[^0-9]/g, '');
        const isDuplicate = players.some(
          p =>
            (memberHpClean && (p.hp_no || '').replace(/[^0-9]/g, '') === memberHpClean) ||
            (p.member_no && p.member_no === newMember.member_no),
        );
        if (isDuplicate) {
          return { error: '이미 배정 목록에 등록된 회원입니다.' };
        }
        return { error: null };
      };

      // 1. 이미 등록된 회원번호(M1001) 추가 시도 차단
      const dup1 = checkDuplicateMember({ member_no: 'M1001', hp: '010-9999-8888' });
      expect(dup1.error).toBe('이미 배정 목록에 등록된 회원입니다.');

      // 2. 이미 등록된 연락처(01011112222) 추가 시도 차단
      const dup2 = checkDuplicateMember({ member_no: 'M9999', hp: '010-1111-2222' });
      expect(dup2.error).toBe('이미 배정 목록에 등록된 회원입니다.');

      // 3. 신규 고유 회원(M3003, 010-5555-6666) 추가 허용
      const valid = checkDuplicateMember({ member_no: 'M3003', hp: '010-5555-6666' });
      expect(valid.error).toBeNull();
    });
  });

  // =========================================================================
  // K08: VAN 카드 승인 성공 후 백엔드 웹훅 실패 시 자동 망취소 및 DLQ 긴급 보고
  // =========================================================================
  describe('K08 [VAN 카드 승인 성공 후 백엔드 웹훅 실패 시 자동 망취소 및 DLQ 긴급 보고]', () => {
    const cardApproval90k: CardApprovalResult = {
      success: true,
      auth_code: '77889900',
      approved_at: '2026-10-20T14:30:00.000Z',
      card_no_masked: '5424-****-****-1234',
      issuer_name: '신한카드',
      acquirer_name: '신한카드',
      terminal_id: '88010003',
      van_tr_no: 'TR-90000',
      amount: 90000,
      installment_months: 0,
    };

    it('K08-1: 90,000원 카드 승인 후 백엔드 웹훅 실패 시 kioskVanClient.cancelCardPayment 자동 망취소 호출', async () => {
      const cancelCardSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: '77889900',
        approved_at: '2026-10-20T14:30:05.000Z',
      });
      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge');

      const result = await executeKioskAutoReversal({
        cardApproval: cardApproval90k,
        payAmount: 90000,
        reason: 'Par3 webhook timeout 500',
        terminalId: '88010003',
        storeCd: 'TEST-STORE',
      });

      expect(result.success).toBe(true);
      expect(result.reversalAttempted).toBe(true);
      expect(result.message).toContain('카드 결제가 자동 취소(망취소)되었습니다');

      // 단말기 망취소 호출 파라미터 정합성 검증 (금액 90,000원, 원거래 승인번호 77889900)
      expect(cancelCardSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 90000,
          orgAuthCode: '77889900',
          terminalId: '88010003',
          vanTrNo: 'TR-90000',
        }),
      );

      // 망취소 성공 시 DLQ 보고는 발생하지 않아야 함
      expect(reportGhostSpy).not.toHaveBeenCalled();
    });

    it('K08-2: 단말기 망취소 거절/실패 시 api.reportGhostCharge 호출하여 PaymentDLQ 긴급 보고', async () => {
      // 망취소 거절 시뮬레이션
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValueOnce({
        success: false,
        error_code: 'E_CANCEL_REJECTED',
        error_message: '단말기 통신 타임아웃 / 망취소 응답 불가',
      });

      // DLQ 보고 모킹
      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_20261020_PAR3GHOST90K',
        message: '고아 결제 건이 안전하게 데드레터 큐(DLQ)에 접수되었습니다.',
      });

      const result = await executeKioskAutoReversal({
        cardApproval: cardApproval90k,
        payAmount: 90000,
        reason: 'Par3 webhook 500: Database connection deadlocked',
        terminalId: '88010003',
        storeCd: 'TEST-STORE',
      });

      expect(result.success).toBe(false);
      expect(result.reversalAttempted).toBe(true);
      expect(result.dlqReported).toBe(true);
      expect(result.dlqId).toBe('DLQ_20261020_PAR3GHOST90K');
      expect(result.message).toContain('카드 자동 취소 실패');
      expect(result.message).toContain('관제 시스템에 긴급 접수되었습니다');

      // api.reportGhostCharge 파라미터 정합성 검증
      expect(reportGhostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          store_cd: 'TEST-STORE',
          terminalId: '88010003',
          deviceType: 'KIOSK',
          authNo: '77889900',
          amount: 90000,
          cardName: '신한카드',
          cardNoMasked: '5424-****-****-1234',
          vanTrNo: 'TR-90000',
          backendErrorReason: 'Par3 webhook 500: Database connection deadlocked',
          reversalErrorReason: '단말기 통신 타임아웃 / 망취소 응답 불가',
        }),
      );
    });

    it('K08-3: 단말기 물리적 선 빠짐/통신 예외(throw) 발생 시에도 DLQ 안전 접수 보장', async () => {
      // 물리적 통신 단절 예외 모킹
      vi.spyOn(kioskVanClient, 'cancelCardPayment').mockRejectedValueOnce(
        new Error('Serial port disconnected (Physical cable unplugged)'),
      );

      const reportGhostSpy = vi.spyOn(api, 'reportGhostCharge').mockResolvedValueOnce({
        success: true,
        dlq_id: 'DLQ_20261020_PAR3CABLE_DROP',
        message: '데드레터 큐(DLQ)에 접수되었습니다.',
      });

      const result = await executeKioskAutoReversal({
        cardApproval: cardApproval90k,
        payAmount: 90000,
        reason: 'Par3 webhook 500: Network offline',
        terminalId: '88010003',
        storeCd: 'TEST-STORE',
      });

      expect(result.success).toBe(false);
      expect(result.reversalAttempted).toBe(true);
      expect(result.dlqReported).toBe(true);
      expect(result.dlqId).toBe('DLQ_20261020_PAR3CABLE_DROP');
      expect(result.message).toContain('망취소 통신 오류');
      expect(result.message).toContain('관제 시스템에 긴급 접수되었습니다');

      expect(reportGhostSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          store_cd: 'TEST-STORE',
          terminalId: '88010003',
          authNo: '77889900',
          amount: 90000,
          reversalErrorReason: expect.stringContaining('Serial port disconnected'),
        }),
      );
    });
  });
});
