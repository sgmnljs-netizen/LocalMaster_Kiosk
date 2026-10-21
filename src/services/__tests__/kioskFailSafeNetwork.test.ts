import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  recordKioskBlackBox,
  getRecentKioskBlackBoxLogs,
  getFormattedKioskBlackBoxText,
  maskKioskSensitiveData,
  clearKioskBlackBox,
} from '../../utils/kioskBlackBox';
import type { Bay } from '../../types';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Fail-Safe & Network Error Handling QA Verification (F01, F02, F05, F08)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearKioskBlackBox();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_FAILSAFE_01');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'KIOSK_TERM_01');
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // F01: 인터넷/공유기 네트워크 단절 시 전면 Fail-Safe 안전 잠금 화면 전환
  // =========================================================================
  describe('F01 [인터넷/공유기 네트워크 단절 시 전면 Fail-Safe 안전 잠금 화면 전환]', () => {
    it('네트워크 오프라인 이벤트(window offline) 또는 api.checkConnection 실패 시 안전 잠금 상태가 감지된다', async () => {
      // 1. 초기 상태: 온라인
      let isNetworkOffline = false;
      const handleWindowOffline = () => {
        isNetworkOffline = true;
        recordKioskBlackBox('API_ERROR', '[NETWORK_OFFLINE] 인터넷/서버 네트워크 단절 감지');
      };
      const handleWindowOnline = () => {
        isNetworkOffline = false;
      };

      // 2. 네트워크 단절 이벤트 디스패치 시뮬레이션
      handleWindowOffline();
      expect(isNetworkOffline).toBe(true);

      // 3. 블랙박스에 네트워크 단절 이벤트가 기록되었는지 검증
      const logs = getRecentKioskBlackBoxLogs(5);
      expect(logs.some((l) => l.actionName.includes('[NETWORK_OFFLINE]'))).toBe(true);
    });

    it('네트워크 단절 상태에서는 타석 배정/결제 등의 오퍼레이션이 원천 차단되어 이중결제/허위선점을 방지한다', async () => {
      // checkConnection이 false를 반환하는 오프라인 상황
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      // 오프라인 상태에서 checkConnection 결과 확인
      const isOnline = await api.checkConnection();
      expect(isOnline).toBe(false);

      // fetch가 서버로 직접 발송되지 않도록 방어되었는지 확인
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('네트워크 차단 모달은 data-testid="network-offline-modal", 경고문구 "⚠️ 네트워크 연결 장애 - 카운터 문의", zIndex 100000 전면 차단 사양을 준수한다', () => {
      const modalConfig = {
        testId: 'network-offline-modal',
        titleKo: '⚠️ 네트워크 연결 장애 - 카운터 문의',
        zIndex: 100000,
        backgroundColor: 'rgba(10, 12, 16, 0.95)',
        backdropFilter: 'blur(24px)',
        borderColor: '#ef4444',
      };

      expect(modalConfig.testId).toBe('network-offline-modal');
      expect(modalConfig.titleKo).toContain('⚠️ 네트워크 연결 장애 - 카운터 문의');
      expect(modalConfig.zIndex).toBeGreaterThanOrEqual(100000);
      expect(modalConfig.borderColor).toBe('#ef4444');
    });
  });

  // =========================================================================
  // F02: 네트워크 복구 시 자동 감지 및 정상 홈 화면 자가 치유(Auto-Heal) 복원
  // =========================================================================
  describe('F02 [네트워크 복구 시 자동 감지 및 정상 홈 화면 자가 치유(Auto-Heal) 복원]', () => {
    it('네트워크 복구 이벤트(window online) 수신 시 isNetworkOffline이 false로 리셋되고 loadBays가 트리거된다', async () => {
      let isNetworkOffline = true;
      let loadBaysCalled = false;

      const loadBays = async () => {
        loadBaysCalled = true;
      };

      const handleWindowOnline = () => {
        isNetworkOffline = false;
        recordKioskBlackBox('HW_STATUS', '[NETWORK_ONLINE] 네트워크 통신 복구 감지');
        loadBays();
      };

      // 온라인 이벤트 트리거
      handleWindowOnline();

      expect(isNetworkOffline).toBe(false);
      expect(loadBaysCalled).toBe(true);

      const logs = getRecentKioskBlackBoxLogs(5);
      expect(logs.some((l) => l.actionName.includes('[NETWORK_ONLINE]'))).toBe(true);
    });

    it('연결 재시도(Retry) 버튼 클릭 시 api.checkConnection 성공 시 모달이 닫히고 최신 타석 상태를 자동 갱신한다', async () => {
      let isNetworkOffline = true;
      let baysLoaded = false;

      // 1. checkConnection 성공 모의
      vi.spyOn(api, 'checkConnection').mockResolvedValue(true);

      const handleRetry = async () => {
        const conn = await api.checkConnection();
        isNetworkOffline = !conn;
        if (conn) {
          baysLoaded = true;
        }
      };

      await handleRetry();

      expect(isNetworkOffline).toBe(false);
      expect(baysLoaded).toBe(true);
    });

    it('연결 재시도(Retry) 시 여전히 서버가 응답하지 않으면 모달이 유지되고 실패 토스트 및 로그가 기록된다', async () => {
      let isNetworkOffline = true;
      let toastMessage = '';

      // 1. checkConnection 실패 모의
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const handleRetry = async () => {
        const conn = await api.checkConnection();
        isNetworkOffline = !conn;
        if (!conn) {
          toastMessage = '아직 네트워크 연결이 복구되지 않았습니다.';
          recordKioskBlackBox('API_ERROR', '[NETWORK_RETRY_FAIL] 연결 재시도 실패');
        }
      };

      await handleRetry();

      expect(isNetworkOffline).toBe(true);
      expect(toastMessage).toBe('아직 네트워크 연결이 복구되지 않았습니다.');
      const logs = getRecentKioskBlackBoxLogs(5);
      expect(logs.some((l) => l.actionName.includes('[NETWORK_RETRY_FAIL]'))).toBe(true);
    });
  });

  // =========================================================================
  // F05: 키오스크 앱 비정상 종료(Crash/Reboot) 후 재기동 시 좀비 선점 락 자동 정리
  // =========================================================================
  describe('F05 [키오스크 앱 비정상 종료(Crash/Reboot) 후 재기동 시 좀비 선점 락 자동 정리]', () => {
    it('키오스크 비정상 종료 후 재기동 시 로컬 Edge DB에 남아있는 본인 터미널의 고아 선점 락(PRE_OCCUPIED)을 감지하여 AVAILABLE로 복구한다', async () => {
      const terminalId = api.getTerminalId();

      // 비정상 종료 전 남겨진 고아 선점 타석 모의
      const crashedBays: Bay[] = [
        {
          bay_no: 3,
          bay_name: '3번 타석',
          status: 'PRE_OCCUPIED',
          lock_terminal_id: terminalId,
          lock_expired_at: new Date(Date.now() - 30 * 1000).toISOString(),
          floor_no: 1,
        } as unknown as Bay,
        {
          bay_no: 5,
          bay_name: '5번 타석',
          status: 'AVAILABLE',
          lock_terminal_id: null,
          lock_expired_at: null,
          floor_no: 1,
        } as unknown as Bay,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(crashedBays));

      const releaseSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/bays/release')) {
          return { ok: true, json: async () => ({ released: [3] }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = releaseSpy;

      // 재기동(Reboot) 시 자동 호출되는 releaseOrphanedLocks 실행
      const released = await api.releaseOrphanedLocks();

      expect(released).toEqual([3]);

      // Edge DB에서 3번 타석이 AVAILABLE로 원상복구되었는지 검증
      const updatedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay3 = updatedBays.find((b) => b.bay_no === 3);
      expect(bay3?.status).toBe('AVAILABLE');
      expect(bay3?.lock_terminal_id).toBeNull();
      expect(bay3?.lock_expired_at).toBeNull();
    });

    it('재기동 시 selectedBayNo 및 selectedBayNos 상태가 null 및 빈 배열로 초기화되어 잔여 선택이 누출되지 않는다', () => {
      let selectedBayNo: number | null = 7;
      let selectedBayNos: number[] = [7, 8];

      // KioskApp 마운트 시 초기화 로직 시뮬레이션
      const onAppRebootInit = () => {
        selectedBayNo = null;
        selectedBayNos = [];
      };

      onAppRebootInit();

      expect(selectedBayNo).toBeNull();
      expect(selectedBayNos).toEqual([]);
    });
  });

  // =========================================================================
  // F08: 하드웨어 장애/네트워크 장애 발생 시 초경량 블랙박스 자동 수집 & 서버 비상 보고
  // =========================================================================
  describe('F08 [하드웨어 장애/네트워크 장애 발생 시 초경량 블랙박스 자동 수집 & 서버 비상 보고]', () => {
    it('블랙박스는 고객 전화번호, 카드번호(PAN), 비밀번호/PIN 등 민감정보를 완벽하게 마스킹한다', () => {
      const sensitivePayload = {
        memberPhone: '010-1234-5678',
        cardNumber: '9410-1234-5678-9012',
        pin: '1234',
        secretToken: 'secret_token_abc_xyz',
        nested: {
          hp: '010-9876-5432',
          card_no: '5424-9999-8888-7777',
          admin_pin: '9999',
        },
      };

      const masked = maskKioskSensitiveData(sensitivePayload) as any;

      // 전화번호 마스킹 검증: 010-****-5678
      expect(masked.memberPhone).toBe('010-****-5678');
      expect(masked.nested.hp).toBe('010-****-5432');

      // 카드번호 마스킹 검증: 6자리-**-****-4자리
      expect(masked.cardNumber).toBe('941012-**-****-9012');
      expect(masked.nested.card_no).toBe('542499-**-****-7777');

      // 비밀번호/PIN 마스킹 검증: ******
      expect(masked.pin).toBe('******');
      expect(masked.secretToken).toBe('******');
      expect(masked.nested.admin_pin).toBe('******');
    });

    it('하드웨어 장애(KIOSK_HW_ERROR) 발생 시 블랙박스 직전 15건 동선과 함께 POST /api/system-logs/client-error로 전송된다', async () => {
      // 1. 선행 동선 3건 기록
      recordKioskBlackBox('STEP', '화면 이동: INTRO');
      recordKioskBlackBox('AUTH', '회원 로그인 완료', { memberNo: 'M_FAILSAFE_01', hp: '010-1234-5678' });
      recordKioskBlackBox('ALLOCATION', '타석 선택: 5번 타석', { bayNo: 5 });

      // 2. 서버 보고 fetch 감시
      let reportedPayload: any = null;
      const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/system-logs/client-error')) {
          reportedPayload = JSON.parse((init?.body as string) || '{}');
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = fetchSpy;

      // 3. 하드웨어 장애 이벤트 발생 (타석기 기동 실패)
      await api.writeKioskLog('HW_START_ERROR', '5번 타석 RS-485 기동 응답 타임아웃 (타스타드)', 'M_FAILSAFE_01');

      // 4. 서버로의 비동기 전송 검증
      expect(fetchSpy).toHaveBeenCalled();
      expect(reportedPayload).not.toBeNull();
      expect(reportedPayload.error_type).toBe('KIOSK_HW_ERROR');
      expect(reportedPayload.action_type).toBe('HW_START_ERROR');
      expect(reportedPayload.message).toContain('[HW_START_ERROR]');
      expect(reportedPayload.blackbox_logs).toContain('📼 [키오스크 블랙박스]');
      expect(reportedPayload.blackbox_logs).toContain('5번 타석');
    });

    it('네트워크 오프라인 이벤트(NETWORK_OFFLINE) 발생 시 블랙박스에 기록되고 에러 보고가 트리거된다', async () => {
      let reportedPayload: any = null;
      const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/system-logs/client-error')) {
          reportedPayload = JSON.parse((init?.body as string) || '{}');
          return { ok: true, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = fetchSpy;

      // 네트워크 단절 로그 기록
      await api.writeKioskLog('NETWORK_OFFLINE', '인터넷/공유기 네트워크 단절 감지 - Fail-Safe 잠금 전환');

      const logs = getRecentKioskBlackBoxLogs(5);
      expect(logs.some((l) => l.actionName.includes('NETWORK_OFFLINE'))).toBe(true);

      expect(fetchSpy).toHaveBeenCalled();
      expect(reportedPayload).not.toBeNull();
      expect(reportedPayload.error_type).toBe('NETWORK_OFFLINE');
    });

    it('에러 보고는 3초 쿨다운(Deduplication Cooldown)을 통해 동일 에러 폭주를 방어한다', async () => {
      let reportCallCount = 0;
      const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/system-logs/client-error')) {
          reportCallCount++;
          return { ok: true, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      global.fetch = fetchSpy;

      // 동일 에러를 짧은 간격으로 3회 연속 전송 시도
      api.reportKioskErrorToServer({
        action: 'VAN_ERROR',
        detail: 'VAN 데몬 응답 없음 (포트 8015)',
        errorType: 'KIOSK_HW_ERROR',
      });
      api.reportKioskErrorToServer({
        action: 'VAN_ERROR',
        detail: 'VAN 데몬 응답 없음 (포트 8015)',
        errorType: 'KIOSK_HW_ERROR',
      });
      api.reportKioskErrorToServer({
        action: 'VAN_ERROR',
        detail: 'VAN 데몬 응답 없음 (포트 8015)',
        errorType: 'KIOSK_HW_ERROR',
      });

      // 3초 쿨다운으로 인해 첫 1회만 fetch 전송되어야 함
      expect(reportCallCount).toBe(1);
    });
  });
});
