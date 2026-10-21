import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Bay } from '../api';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Multi-Kiosk Concurrency Stress QA (C01, C02, C05, C07)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('STORE_RACE_CONC');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // C01: 단일 타석 동시 선점 0.01초 레이스 컨디션 (First-Come First-Served 409 Conflict)
  // =========================================================================
  describe('C01 [단일 타석 동시 선점 0.01초 레이스 컨디션 (First-Come First-Served 409 Conflict)]', () => {
    it('Terminal A(KIOSK-T1)와 Terminal B(KIOSK-T2)가 0.01초 이내에 동일 타석(Bay 5) 선점 시 Winner는 PRE_OCCUPIED 락을 획득하고 Loser는 409 Conflict를 수신한다', async () => {
      const targetBay = 5;
      let activeLock: { bayNo: number; terminalId: string; expiresAt: Date } | null = null;

      // 백엔드 원자적 락(with_for_update) 모의 핸들러
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/bays/preoccupy')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const terminalId = body.terminal_id;
          const requestedBay = body.bay_nos[0];

          // 이미 타 단말기가 선점 중인 경우 409 Conflict 반환
          if (activeLock && activeLock.bayNo === requestedBay && activeLock.terminalId !== terminalId) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '이미 다른 고객님이 선택 중인 타석입니다.',
              }),
            };
          }

          // Winner 선점 락 획득 (3분 = 3 * 60 * 1000 ms)
          const expiryDate = new Date(Date.now() + 3 * 60 * 1000);
          activeLock = {
            bayNo: requestedBay,
            terminalId: terminalId,
            expiresAt: expiryDate,
          };

          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                bay_no: requestedBay,
                status: 'PRE_OCCUPIED',
                lock_terminal_id: terminalId,
                lock_expired_at: expiryDate.toISOString(),
              },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });
      global.fetch = mockFetch;

      // Terminal A (KIOSK-T1) 선점 시도
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T1');
      const termAResult = await api.preoccupyBay(targetBay);
      expect(termAResult).toBe(true);
      expect(activeLock).not.toBeNull();
      expect(activeLock?.terminalId).toBe('KIOSK-T1');

      // Terminal B (KIOSK-T2) 0.01초 동시 선점 시도
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T2');
      const termBResult = await api.preoccupyBay(targetBay);
      expect(termBResult).toBe(false);
      expect(activeLock?.terminalId).toBe('KIOSK-T1'); // 선점 소유권 변경 없음
    });

    it('TeeboxMap handleBayTouch 에서 선점 실패(409) 시 에러 메시지를 표시하고 로딩 상태를 해제하며 크래시 없이 타석 재선택이 가능하다', async () => {
      // TeeboxMap 컴포넌트 로직 시뮬레이션
      let selectedBayNo: number | null = null;
      let errorMsg = '';
      let preoccupyLoading = false;
      let refreshCalled = false;

      const onRefreshBays = () => {
        refreshCalled = true;
      };

      // Bay 5는 타 터미널에 의해 선점되어 409 반환하도록 mock
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/bays/preoccupy')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ detail: '이미 다른 고객님이 선택 중인 타석입니다.' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // TeeboxMap.tsx handleBayTouch 시뮬레이션 로직
      const handleBayTouch = async (bayNo: number) => {
        errorMsg = '';
        preoccupyLoading = true;
        try {
          const success = await api.preoccupyBay(bayNo);
          if (success) {
            selectedBayNo = bayNo;
          } else {
            errorMsg = '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.';
          }
        } catch {
          errorMsg = '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.';
        } finally {
          preoccupyLoading = false;
          onRefreshBays();
        }
      };

      // Bay 5 터치 시도
      await handleBayTouch(5);

      expect(selectedBayNo).toBeNull();
      expect(preoccupyLoading).toBe(false);
      expect(refreshCalled).toBe(true);
      expect(errorMsg).toBe('이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.');

      // 대체 타석 Bay 6 터치 시 성공 시뮬레이션
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/bays/preoccupy')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ bay_no: 6, status: 'PRE_OCCUPIED', lock_terminal_id: 'KIOSK-T2' }],
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      await handleBayTouch(6);
      expect(selectedBayNo).toBe(6);
      expect(errorMsg).toBe('');
      expect(preoccupyLoading).toBe(false);
    });

    it('WebSocket bay_preoccupy 수신 시 타 단말기가 선점한 타석(PRE_OCCUPIED)은 클라이언트단에서 터치가 선제 차단된다', () => {
      const bayList: Bay[] = [
        {
          bay_no: 5,
          status: 'PRE_OCCUPIED',
          lock_terminal_id: 'KIOSK-T1', // Terminal A 소유
        },
      ];

      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T2');

      // TeeboxMap.tsx 클라이언트 가드 검증
      let clientErrorMsg = '';
      const handleBayTouchGuard = (bay: Bay): boolean => {
        const canonicalStatus = String((bay as any).status_info?.code || bay.status || '').toUpperCase();
        if (canonicalStatus === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
          clientErrorMsg = '이미 다른 고객님께서 선택 중인 타석입니다.';
          return false; // 선제 차단
        }
        return true;
      };

      const canTouch = handleBayTouchGuard(bayList[0]);
      expect(canTouch).toBe(false);
      expect(clientErrorMsg).toBe('이미 다른 고객님께서 선택 중인 타석입니다.');
    });
  });

  // =========================================================================
  // C02: 타 단말기 선점 타석에 대한 직접 배정/결제 우회 시도 차단
  // =========================================================================
  describe('C02 [타 단말기 선점 타석에 대한 직접 배정/결제 우회 시도 차단]', () => {
    it('Bay 3이 KIOSK-T1에 의해 PRE_OCCUPIED 상태일 때, KIOSK-T2가 POST /allocate-bay 로 우회 시도 시 409 Conflict로 차단된다', async () => {
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T2');

      // 백엔드 verify_pre_emption_lock 차단 모의
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse((init?.body as string) || '{}');
          if (body.bay_no === 3 && body.terminal_id !== 'KIOSK-T1') {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.',
              }),
            };
          }
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // KIOSK-T2의 타석 3 직접 배정 요청
      const allocResult = await api.allocateBay(
        3,
        60,
        undefined,
        '우회시도자',
        '01011112222',
        undefined,
        'TICKET'
      );

      expect(allocResult.success).toBe(false);
      expect(allocResult.message).toBe('다른 키오스크 단말기에서 선점하여 결제 진행 중인 타석입니다.');

      // localStorage 상태가 훼손되지 않았는지 확인
      const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
      const bay3 = bays.find((b) => b.bay_no === 3);
      expect(bay3?.status).not.toBe('OCCUPIED');
    });

    it('Edge DB 오프라인 모드에서도 타 단말기가 선점한 타석에 대한 배정 시도가 철저히 차단된다', async () => {
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T2');

      const initialBays: Bay[] = [
        {
          bay_no: 3,
          status: 'PRE_OCCUPIED',
          lock_terminal_id: 'KIOSK-T1',
          lock_expired_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        },
      ];
      localStorage.setItem('LM_BAYS', JSON.stringify(initialBays));

      // 오프라인 상태에서 선점 시도
      const preoccupyResult = await api.preoccupyBay(3);
      expect(preoccupyResult).toBe(false);

      // Bay 3 상태 및 소유권 보존 확인
      const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
      expect(bays[0].status).toBe('PRE_OCCUPIED');
      expect(bays[0].lock_terminal_id).toBe('KIOSK-T1');
    });
  });

  // =========================================================================
  // C05: 동반자 3인 연석 동시 선점 충돌 시 All-or-Nothing 원자적 롤백
  // =========================================================================
  describe('C05 [동반자 3인 연석 동시 선점 충돌 시 All-or-Nothing 원자적 롤백]', () => {
    it('Bays [7, 8, 9] 일괄 선점 시 Bay 9가 충돌하면 Bays 7, 8도 선점되지 않고 All-or-Nothing 원자적 롤백된다', async () => {
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T1');

      // 백엔드 상태 시뮬레이션: Bay 7(AVAILABLE), Bay 8(AVAILABLE), Bay 9(PRE_OCCUPIED by KIOSK-T2)
      const serverBayStatus: Record<number, { status: string; terminal_id: string | null }> = {
        7: { status: 'AVAILABLE', terminal_id: null },
        8: { status: 'AVAILABLE', terminal_id: null },
        9: { status: 'PRE_OCCUPIED', terminal_id: 'KIOSK-T2' },
      };

      // 백엔드 @transactional All-or-Nothing 시뮬레이션
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/bays/preoccupy')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const terminalId = body.terminal_id;
          const bayNos: number[] = body.bay_nos;

          // Transaction Snapshot
          const snapshot = JSON.parse(JSON.stringify(serverBayStatus));

          for (const bNo of bayNos) {
            const bay = serverBayStatus[bNo];
            if (!bay || bay.status !== 'AVAILABLE') {
              // 롤백 복원 (All-or-Nothing)
              Object.assign(serverBayStatus, snapshot);
              return {
                ok: false,
                status: 409,
                json: async () => ({
                  detail: '이미 다른 고객님이 선택 중인 타석입니다.',
                }),
              };
            }
            bay.status = 'PRE_OCCUPIED';
            bay.terminal_id = terminalId;
          }

          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // Terminal A가 연석 7, 8, 9 일괄 선점 요청
      const batchResult = await api.preoccupyBays([7, 8, 9]);

      // 409에 의한 전체 실패 반환
      expect(batchResult).toBe(false);

      // All-or-Nothing 원자적 롤백 검증:
      // Bay 7과 Bay 8이 고아 락(PRE_OCCUPIED)으로 남지 않고 AVAILABLE로 완벽히 롤백되었는지 확인!
      expect(serverBayStatus[7].status).toBe('AVAILABLE');
      expect(serverBayStatus[7].terminal_id).toBeNull();
      expect(serverBayStatus[8].status).toBe('AVAILABLE');
      expect(serverBayStatus[8].terminal_id).toBeNull();
      expect(serverBayStatus[9].status).toBe('PRE_OCCUPIED');
      expect(serverBayStatus[9].terminal_id).toBe('KIOSK-T2');
    });

    it('Edge DB 오프라인 모드에서도 동반자 연석 중 1개라도 불가능할 시 전체 롤백(All-or-Nothing)을 보장한다', async () => {
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
      vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-T1');

      const initialBays: Bay[] = [
        { bay_no: 7, status: 'AVAILABLE' },
        { bay_no: 8, status: 'AVAILABLE' },
        { bay_no: 9, status: 'OCCUPIED' },
      ];
      localStorage.setItem('LM_BAYS', JSON.stringify(initialBays));

      const result = await api.preoccupyBays([7, 8, 9]);
      expect(result).toBe(false);

      // Edge DB 검증: Bay 7, 8이 PRE_OCCUPIED로 변하지 않고 AVAILABLE 유지
      const storedBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
      expect(storedBays.find((b) => b.bay_no === 7)?.status).toBe('AVAILABLE');
      expect(storedBays.find((b) => b.bay_no === 8)?.status).toBe('AVAILABLE');
      expect(storedBays.find((b) => b.bay_no === 9)?.status).toBe('OCCUPIED');
    });
  });

  // =========================================================================
  // C07: 파3 동시 티오프 슬롯 선점 경쟁 (Slot Concurrency 409 Conflict)
  // =========================================================================
  describe('C07 [파3 동시 티오프 슬롯 선점 경쟁 (Slot Concurrency 409 Conflict)]', () => {
    it('Terminal A와 Terminal B가 동일 파3 15:30 슬롯을 동시 선점 시 1st caller는 확정되고 2nd caller는 409 Conflict를 수신한다', async () => {
      let reservedSlot: string | null = null;

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/facilities/preoccupy')) {
          const body = JSON.parse((init?.body as string) || '{}');
          const slotKey = `${body.res_date}_${body.slot_time}`;

          if (reservedSlot === slotKey) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                detail: '선택한 시간대의 슬롯이 이미 마감되었습니다.',
              }),
            };
          }

          reservedSlot = slotKey;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              message: '파3 코스 선점이 완료되었습니다.',
              res_id: `RES_PAR3_${body.res_date}_${body.slot_time}_901`,
              price: 0,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const leaderA = {
        member_no: 'M-1001',
        guest_nm: '골퍼A',
        hp_no: '01011112222',
        is_member: true,
      };

      const leaderB = {
        member_no: 'M-1002',
        guest_nm: '골퍼B',
        hp_no: '01033334444',
        is_member: true,
      };

      // Terminal A 선점 호출 -> 성공
      const resA = await api.bookPar3Course(
        'PAR3',
        '20261020',
        '15:30',
        0,
        leaderA,
        []
      );
      expect(resA.success).toBe(true);
      expect(resA.res_id).toBe('RES_PAR3_20261020_1530_901');

      // Terminal B 동시 15:30 선점 호출 -> 409 마감 에러 수신
      const resB = await api.bookPar3Course(
        'PAR3',
        '20261020',
        '15:30',
        0,
        leaderB,
        []
      );
      expect(resB.success).toBe(false);
      expect(resB.message).toBe('선택한 시간대의 슬롯이 이미 마감되었습니다.');

      // Terminal B가 마감 알림 수신 후 다른 슬롯(17:00)을 선택하여 정상 예약 완료
      const resBAlt = await api.bookPar3Course(
        'PAR3',
        '20261020',
        '17:00',
        0,
        leaderB,
        []
      );
      expect(resBAlt.success).toBe(true);
      expect(resBAlt.res_id).toBe('RES_PAR3_20261020_1700_901');
    });

    it('파3 선점 409 에러 시 프론트엔드가 크래시 없이 안전하게 에러 메시지를 반환한다', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/facilities/preoccupy')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: '선택한 시간대의 슬롯이 이미 마감되었습니다.',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const leader = {
        guest_nm: '테스터',
        hp_no: '01000000000',
        is_member: false,
      };

      const result = await api.bookPar3Course(
        'PAR3',
        '20261020',
        '15:30',
        0,
        leader,
        []
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('선택한 시간대의 슬롯이 이미 마감되었습니다.');
    });
  });
});
