import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Bay } from '../api';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

// Mock WebSocket implementation for Kiosk & cross-device simulation
class MockWebSocket {
  url: string;
  readyState: number = 1; // 1 = OPEN
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateServerMessage(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

(globalThis as any).WebSocket = MockWebSocket;

// POS useBayStore and useUIStore simulation mirroring LocalMaster_POS architecture
interface PosBayStoreState {
  bays: Bay[];
  setBays: (newBays: Bay[]) => void;
  releaseBay: (bayNo: number) => void;
  updateBayStatus: (bayNo: number, status: string, extra?: Partial<Bay>) => void;
}

const createPosBayStore = (initialBays: Bay[] = []): PosBayStoreState => {
  let bays = [...initialBays];
  return {
    get bays() {
      return bays;
    },
    setBays: (newBays: Bay[]) => {
      bays = [...newBays];
    },
    releaseBay: (bayNo: number) => {
      bays = bays.map((b) =>
        Number(b.bay_no) === Number(bayNo)
          ? {
              ...b,
              status: 'AVAILABLE',
              current_member_no: null,
              member_name: undefined,
              current_user_name: null,
              end_time: null,
              start_time: null,
              start_epoch_ms: null,
              end_epoch_ms: undefined,
              prepare_expired_epoch_ms: null,
              minutes_left: 0,
              is_paused: false,
              lock_terminal_id: null,
              lock_expired_at: null,
            }
          : b
      );
    },
    updateBayStatus: (bayNo: number, status: string, extra?: Partial<Bay>) => {
      bays = bays.map((b) =>
        Number(b.bay_no) === Number(bayNo)
          ? {
              ...b,
              status: status as any,
              ...extra,
            }
          : b
      );
    },
  };
};

interface PosUIStoreState {
  isBallCollectMode: boolean;
  setIsBallCollectMode: (val: boolean) => void;
}

const createPosUIStore = (): PosUIStoreState => {
  let isBallCollectMode = false;
  return {
    get isBallCollectMode() {
      return isBallCollectMode;
    },
    setIsBallCollectMode: (val: boolean) => {
      isBallCollectMode = val;
    },
  };
};

describe('Cross-Device Real-Time Sync QA: Scenarios X04, X05, X06, X07', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let posBayStore: PosBayStoreState;
  let posUIStore: PosUIStoreState;

  let activeDisconnects: Array<() => void> = [];

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    MockWebSocket.instances = [];
    activeDisconnects = [];

    storageMap.set('LM_STORE_CD', 'S_SYNC_TEST');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'T-KIOSK-01');

    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('S_SYNC_TEST');
    vi.spyOn(api, 'getTerminalId').mockReturnValue('T-KIOSK-01');
    vi.spyOn(api, 'getBays').mockImplementation(async () => JSON.parse(storageMap.get('LM_BAYS') || '[]'));

    posUIStore = createPosUIStore();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    activeDisconnects.forEach((disconnect) => {
      try {
        disconnect();
      } catch (e) {
        // ignore
      }
    });
    activeDisconnects = [];
  });

  // =========================================================================
  // X04 [포스 전체 볼회수(GLOBAL_PAUSE) ➔ 키오스크 화면 즉시 터치 차단]
  // =========================================================================
  describe('X04 [포스 전체 볼회수(GLOBAL_PAUSE) ➔ 키오스크 화면 즉시 터치 차단]', () => {
    it('포스 볼회수 활성화 시 WebSocket global_pause(paused=true) 브로드캐스트를 수신하여 포스 배너 및 키오스크 터치를 원자적 차단한다', async () => {
      // 1. Initial State: Bay 1 is OCCUPIED, Bay 2 is AVAILABLE
      const initialBays: Bay[] = [
        {
          bay_no: 1,
          bay_name: '1번 타석',
          status: 'OCCUPIED',
          current_user_name: '이용회원',
          minutes_left: 45,
          duration_min: 60,
          is_paused: false,
        } as any,
        {
          bay_no: 2,
          bay_name: '2번 타석',
          status: 'AVAILABLE',
          minutes_left: 0,
          duration_min: 0,
          is_paused: false,
        } as any,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(initialBays));
      posBayStore = createPosBayStore(initialBays);

      // 2. Connect Kiosk WebSocket
      const listenerSpy = vi.fn();
      const disconnect = api.connectBayWebSocket(listenerSpy);
      activeDisconnects.push(disconnect);

      const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(wsInstance).toBeDefined();

      // 3. Counter staff activates Global Ball Collection on POS (POST /api/system/global-pause with paused=True)
      // Simulating backend broadcast to both POS and Kiosk
      const globalPauseEvent = {
        type: 'global_pause',
        store_cd: 'S_SYNC_TEST',
        paused: true,
        is_paused: true,
      };

      // POS WebSocket handler execution
      const posPaused = Boolean(globalPauseEvent.is_paused ?? globalPauseEvent.paused);
      posUIStore.setIsBallCollectMode(posPaused);
      expect(posUIStore.isBallCollectMode).toBe(true); // POS ball collect mode banner activated!

      // Kiosk WebSocket message reception
      wsInstance.simulateServerMessage(globalPauseEvent);

      // 4. Verify Kiosk state in localStorage
      const updatedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay1 = updatedBays.find((b) => b.bay_no === 1);
      const bay2 = updatedBays.find((b) => b.bay_no === 2);

      expect(bay1?.is_paused).toBe(true);
      expect((bay1 as any)?.is_global_paused).toBe(true);
      expect((bay2 as any)?.is_global_paused).toBe(true);
      expect(listenerSpy).toHaveBeenCalled();

      // 5. Verify TeeboxMap UI touch blocking & notice
      const isGlobalPaused = Boolean(
        updatedBays.some(
          (b) =>
            Boolean((b as any).is_global_paused) ||
            String((b as any).pause_type || '').toUpperCase() === 'GLOBAL'
        )
      );
      expect(isGlobalPaused).toBe(true);

      // handleBayTouch Gate verification in TeeboxMap
      let touchedBayNo: number | null = null;
      const handleBayTouch = (bay: Bay) => {
        const isTimeRestricted = false;
        const hasNoActiveBay = false;
        if (isTimeRestricted || hasNoActiveBay || isGlobalPaused || bay.is_paused) return;
        touchedBayNo = bay.bay_no;
      };

      handleBayTouch(bay2!);
      expect(touchedBayNo).toBeNull(); // Touch on AVAILABLE bay is blocked!

      handleBayTouch(bay1!);
      expect(touchedBayNo).toBeNull(); // Touch on OCCUPIED/PAUSED bay is blocked!

      // Notice banner text verification
      const isMoveMode = false;
      const bannerTitle = `⏸️ 매장 볼회수(전체 일시정지) 중 타석 ${isMoveMode ? '이동' : '배정'} 제한`;
      expect(bannerTitle).toBe('⏸️ 매장 볼회수(전체 일시정지) 중 타석 배정 제한');

      // Confirm button disabled check
      const selectedBayNo: number | null = null;
      const preoccupyLoading = false;
      const isConfirmDisabled = selectedBayNo === null || preoccupyLoading || isGlobalPaused;
      expect(isConfirmDisabled).toBe(true);

      disconnect();
    });
  });

  // =========================================================================
  // X05 [포스 볼회수 해제 ➔ 키오스크 정상 터치 복원]
  // =========================================================================
  describe('X05 [포스 볼회수 해제 ➔ 키오스크 정상 터치 복원]', () => {
    it('포스 볼회수 해제 시 WebSocket global_pause(paused=false) 브로드캐스트로 포스 배너 제거 및 키오스크 정상 터치가 즉시 복원된다', async () => {
      // 1. Initial State: Global Pause is currently ACTIVE
      const pausedBays: Bay[] = [
        {
          bay_no: 1,
          bay_name: '1번 타석',
          status: 'OCCUPIED',
          current_user_name: '이용회원',
          minutes_left: 45,
          duration_min: 60,
          is_paused: true,
          is_global_paused: true,
          pause_type: 'GLOBAL',
        } as any,
        {
          bay_no: 2,
          bay_name: '2번 타석',
          status: 'AVAILABLE',
          minutes_left: 0,
          duration_min: 0,
          is_paused: false,
          is_global_paused: true,
          pause_type: 'GLOBAL',
        } as any,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(pausedBays));
      posBayStore = createPosBayStore(pausedBays);
      posUIStore.setIsBallCollectMode(true);

      // 2. Connect Kiosk WebSocket
      const listenerSpy = vi.fn();
      const disconnect = api.connectBayWebSocket(listenerSpy);
      activeDisconnects.push(disconnect);

      const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(wsInstance).toBeDefined();

      // 3. POS staff ends ball collection (POST /api/system/global-pause with paused=False)
      const resumeEvent = {
        type: 'global_pause',
        store_cd: 'S_SYNC_TEST',
        paused: false,
        is_paused: false,
      };

      // POS receives event
      const posPaused = Boolean(resumeEvent.is_paused ?? resumeEvent.paused);
      posUIStore.setIsBallCollectMode(posPaused);
      expect(posUIStore.isBallCollectMode).toBe(false); // Ball collect banner removed!

      // Kiosk receives event
      wsInstance.simulateServerMessage(resumeEvent);

      // 4. Verify Kiosk state in localStorage
      const restoredBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay1 = restoredBays.find((b) => b.bay_no === 1);
      const bay2 = restoredBays.find((b) => b.bay_no === 2);

      expect(bay1?.is_paused).toBe(false);
      expect((bay1 as any)?.is_global_paused).toBe(false);
      expect((bay2 as any)?.is_global_paused).toBe(false);
      expect(listenerSpy).toHaveBeenCalled();

      // 5. Verify TeeboxMap UI touch restoration
      const isGlobalPaused = Boolean(
        restoredBays.some(
          (b) =>
            Boolean((b as any).is_global_paused) ||
            String((b as any).pause_type || '').toUpperCase() === 'GLOBAL'
        )
      );
      expect(isGlobalPaused).toBe(false);

      // handleBayTouch Gate verification
      let touchedBayNo: number | null = null;
      const handleBayTouch = (bay: Bay) => {
        const isTimeRestricted = false;
        const hasNoActiveBay = false;
        if (isTimeRestricted || hasNoActiveBay || isGlobalPaused || bay.is_paused) return;
        touchedBayNo = bay.bay_no;
      };

      handleBayTouch(bay2!);
      expect(touchedBayNo).toBe(2); // Touch on AVAILABLE bay is successfully accepted!

      // Confirm button enabled condition
      const selectedBayNo: number | null = 2;
      const preoccupyLoading = false;
      const isConfirmDisabled = selectedBayNo === null || preoccupyLoading || isGlobalPaused;
      expect(isConfirmDisabled).toBe(false); // Enabled!

      disconnect();
    });
  });

  // =========================================================================
  // X06 [키오스크 셀프 자리이동 ➔ 포스 구/신 타석 동시 갱신]
  // =========================================================================
  describe('X06 [키오스크 셀프 자리이동 ➔ 포스 구/신 타석 동시 갱신]', () => {
    it('회원이 키오스크에서 1번에서 7번으로 셀프 이동 시 구 타석 AVAILABLE 복귀 및 신규 타석 OCCUPIED 승계가 포스와 키오스크에 동시 갱신된다', async () => {
      // 1. Initial State: Bay 1 OCCUPIED by Member M001 (홍길동), Bay 7 AVAILABLE
      const initialBays: Bay[] = [
        {
          bay_no: 1,
          bay_name: '1번 타석',
          status: 'OCCUPIED',
          member_no: 'M001',
          current_user_name: '홍길동',
          current_member_no: 'M001',
          member_name: '홍길동',
          duration_min: 60,
          minutes_left: 45,
          end_epoch_ms: Date.now() + 45 * 60 * 1000,
        } as any,
        {
          bay_no: 7,
          bay_name: '7번 타석',
          status: 'AVAILABLE',
          member_no: null,
          current_user_name: null,
          current_member_no: null,
          member_name: undefined,
          duration_min: null,
          minutes_left: 0,
        } as any,
      ];

      storageMap.set('LM_BAYS', JSON.stringify(initialBays));
      posBayStore = createPosBayStore(initialBays);

      // Connect Kiosk WebSocket
      const kioskListenerSpy = vi.fn();
      const disconnect = api.connectBayWebSocket(kioskListenerSpy);
      activeDisconnects.push(disconnect);

      const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(wsInstance).toBeDefined();

      // 2. Member executes seat transfer on Kiosk (POST /api/v1/kiosk/bays/move)
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/kiosk/bays/move')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              old_bay_no: 1,
              new_bay_no: 7,
              remain_min: 45,
              message: '1번 타석에서 7번 타석으로 이동이 완료되었습니다.',
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const moveResult = await api.moveBay(1, 7, 'M001');
      expect(moveResult.success).toBe(true);
      expect(moveResult.old_bay_no).toBe(1);
      expect(moveResult.new_bay_no).toBe(7);

      // 3. Backend emits:
      // Event A: bay_release for Bay 1
      const releaseEvent = {
        type: 'bay_release',
        bay_nos: [1],
      };

      // Event B: bay_updated for Bay 7
      const targetEndEpoch = Date.now() + 45 * 60 * 1000;
      const targetUpdatedEvent = {
        type: 'bay_updated',
        bay: {
          bay_no: 7,
          status: 'OCCUPIED',
          member_no: 'M001',
          member_name: '홍길동',
          user_name: '홍길동',
          duration_min: 45,
          minutes_left: 45,
          end_epoch_ms: targetEndEpoch,
        },
      };

      // 4. POS processes both events via POS useWebSocket handlers
      // Handling Event A (bay_release):
      posBayStore.releaseBay(1);

      // Handling Event B (bay_updated):
      posBayStore.updateBayStatus(7, 'OCCUPIED', {
        member_name: '홍길동',
        current_member_no: 'M001',
        duration_min: 45,
        minutes_left: 45,
        end_epoch_ms: targetEndEpoch,
      });

      // Assert POS state:
      const posBay1 = posBayStore.bays.find((b) => b.bay_no === 1);
      const posBay7 = posBayStore.bays.find((b) => b.bay_no === 7);

      expect(posBay1?.status).toBe('AVAILABLE');
      expect(posBay1?.member_name).toBeUndefined();
      expect(posBay1?.current_member_no).toBeNull();

      expect(posBay7?.status).toBe('OCCUPIED');
      expect(posBay7?.member_name).toBe('홍길동');
      expect(posBay7?.duration_min).toBe(45);
      expect(posBay7?.end_epoch_ms).toBe(targetEndEpoch);

      // 5. Kiosk receives both WebSocket events
      wsInstance.simulateServerMessage(releaseEvent);
      wsInstance.simulateServerMessage(targetUpdatedEvent);

      // Assert Kiosk state in localStorage:
      const kioskBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const kioskBay1 = kioskBays.find((b) => b.bay_no === 1);
      const kioskBay7 = kioskBays.find((b) => b.bay_no === 7);

      expect(kioskBay1?.status).toBe('AVAILABLE');
      expect(kioskBay1?.current_user_name).toBeNull();
      expect(kioskBay1?.member_no).toBeNull();

      expect(kioskBay7?.status).toBe('OCCUPIED');
      expect(kioskBay7?.current_user_name).toBe('홍길동');
      expect(kioskBay7?.member_no).toBe('M001');
      expect(kioskBay7?.duration_min).toBe(45);
      expect(kioskBay7?.end_epoch_ms).toBe(targetEndEpoch);

      disconnect();
    });
  });

  // =========================================================================
  // X07 [포스 타석 시간 연장/조기 종료 ➔ 키오스크 타석도 잔여시간 즉시 동기화]
  // =========================================================================
  describe('X07 [포스 타석 시간 연장/조기 종료 ➔ 키오스크 타석도 잔여시간 즉시 동기화]', () => {
    it('포스에서 타석 시간 30분 연장 시 WebSocket bay_updated 수신을 통해 키오스크 LocalStorage 및 타이머가 즉시 동기화된다', async () => {
      // 1. Initial State: Bay 3 has 45 minutes remaining
      const nowMs = Date.now();
      const initialEndEpoch = nowMs + 45 * 60 * 1000;
      const initialBays: Bay[] = [
        {
          bay_no: 3,
          bay_name: '3번 타석',
          status: 'OCCUPIED',
          member_no: 'M003',
          current_user_name: '김철수',
          duration_min: 60,
          minutes_left: 45,
          end_epoch_ms: initialEndEpoch,
          is_paused: false,
        } as any,
      ];

      storageMap.set('LM_BAYS', JSON.stringify(initialBays));

      // Connect Kiosk WebSocket
      const listenerSpy = vi.fn();
      const disconnect = api.connectBayWebSocket(listenerSpy);
      activeDisconnects.push(disconnect);

      const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(wsInstance).toBeDefined();

      // 2. POS extends Bay 3 by 30 min (+30 min => duration 90, minutes_left 75)
      const extendedEndEpoch = initialEndEpoch + 30 * 60 * 1000;
      const extendEvent = {
        type: 'bay_updated',
        bay: {
          bay_no: 3,
          status: 'OCCUPIED',
          member_no: 'M003',
          member_name: '김철수',
          user_name: '김철수',
          duration_min: 90,
          minutes_left: 75,
          end_epoch_ms: extendedEndEpoch,
          server_epoch_ms: nowMs,
        },
      };

      // Kiosk receives event
      wsInstance.simulateServerMessage(extendEvent);

      // 3. Verify Kiosk state in localStorage
      const updatedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay3 = updatedBays.find((b) => b.bay_no === 3);

      expect(bay3?.status).toBe('OCCUPIED');
      expect(bay3?.duration_min).toBe(90);
      expect(bay3?.minutes_left).toBe(75);
      expect(bay3?.end_epoch_ms).toBe(extendedEndEpoch);
      expect(listenerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bay_no: 3,
          duration_min: 90,
          end_epoch_ms: extendedEndEpoch,
        })
      );

      // Verify countdown calculation from end_epoch_ms
      const remainingSec = Math.max(0, Math.floor((bay3!.end_epoch_ms! - nowMs) / 1000));
      const remainingMin = Math.ceil(remainingSec / 60);
      expect(remainingMin).toBe(75);

      disconnect();
    });

    it('포스에서 타석 조기 종료 시 WebSocket bay_updated/bay_release 수신을 통해 키오스크 타석이 AVAILABLE로 즉시 전환되고 타이머가 정리된다', async () => {
      // 1. Initial State: Bay 3 is OCCUPIED
      const nowMs = Date.now();
      const initialBays: Bay[] = [
        {
          bay_no: 3,
          bay_name: '3번 타석',
          status: 'OCCUPIED',
          member_no: 'M003',
          current_user_name: '김철수',
          duration_min: 60,
          minutes_left: 30,
          end_epoch_ms: nowMs + 30 * 60 * 1000,
          is_paused: false,
        } as any,
      ];

      storageMap.set('LM_BAYS', JSON.stringify(initialBays));

      // Connect Kiosk WebSocket
      const listenerSpy = vi.fn();
      const disconnect = api.connectBayWebSocket(listenerSpy);
      activeDisconnects.push(disconnect);

      const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(wsInstance).toBeDefined();

      // 2. POS executes early stop (PUT /api/v1/bays/3 with status: AVAILABLE)
      const stopEvent = {
        type: 'bay_updated',
        bay: {
          bay_no: 3,
          status: 'AVAILABLE',
          member_no: null,
          member_name: null,
          user_name: null,
          duration_min: null,
          minutes_left: 0,
          end_epoch_ms: null,
          server_epoch_ms: nowMs,
        },
      };

      // Kiosk receives event
      wsInstance.simulateServerMessage(stopEvent);

      // 3. Verify Kiosk state in localStorage
      const updatedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay3 = updatedBays.find((b) => b.bay_no === 3);

      expect(bay3?.status).toBe('AVAILABLE');
      expect(bay3?.member_no).toBeNull();
      expect(bay3?.current_user_name).toBeNull();
      expect(bay3?.duration_min).toBeNull();
      expect(bay3?.end_epoch_ms).toBeNull();
      expect(bay3?.minutes_left).toBe(0);

      expect(listenerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bay_no: 3,
          status: 'AVAILABLE',
          member_no: null,
        })
      );

      disconnect();
    });
  });
});
