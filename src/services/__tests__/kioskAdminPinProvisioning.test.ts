import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHiddenAdminTrigger } from '../../hooks/useHiddenAdminTrigger';
import {
  bootstrapLocalKioskSettings,
  getKioskSettings,
  saveKioskSettings,
} from '../../stores/kioskSettings';

// Mock React useRef and useCallback to test hooks in node
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (init: any) => ({ current: init }),
    useCallback: (fn: any) => fn,
    useState: (init: any) => [typeof init === 'function' ? init() : init, vi.fn()],
    useEffect: vi.fn(),
  };
});

// Node localStorage polyfill
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).localStorage = mockLocalStorage;

// Window polyfill
if (!globalThis.window) {
  (globalThis as any).window = {
    location: {
      hostname: 'localhost',
      port: '5179',
      origin: 'http://localhost:5179',
    },
    localStorage: mockLocalStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
} else {
  (window as any).localStorage = mockLocalStorage;
  if (!window.location) {
    (window as any).location = {
      hostname: 'localhost',
      port: '5179',
      origin: 'http://localhost:5179',
    };
  }
}

/**
 * State Engine mirroring AdminPinModal.tsx state transitions and keypad guards
 */
class AdminPinModalSimulator {
  public pin: string = '';
  public errorMsg: string = '';
  public failCount: number = 0;
  public lockoutUntil: number | null = null;
  private intervalTimer: any = null;
  public adminPin: string;
  public onSuccess: () => void;
  public onClose: () => void;

  constructor(options: { adminPin?: string; onSuccess: () => void; onClose: () => void }) {
    this.adminPin = options.adminPin || '0000';
    this.onSuccess = options.onSuccess;
    this.onClose = options.onClose;
    this.startCountdown();
  }

  private startCountdown() {
    this.intervalTimer = setInterval(() => {
      if (!this.lockoutUntil) return;
      const rem = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        this.lockoutUntil = null;
        this.failCount = 0;
        this.errorMsg = '';
      } else {
        this.errorMsg = `PIN 5회 오류로 잠금되었습니다. (${rem}초 후 재시도)`;
      }
    }, 500);
  }

  public handleNumClick(num: string) {
    if (this.lockoutUntil && Date.now() < this.lockoutUntil) {
      const rem = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
      this.errorMsg = `PIN 5회 오류로 잠금되었습니다. (${rem}초 후 재시도)`;
      return;
    }
    if (this.pin.length >= 4) return;
    const nextPin = this.pin + num;
    this.pin = nextPin;
    this.errorMsg = '';

    if (nextPin.length === 4) {
      const correctPin = this.adminPin;
      if (nextPin === correctPin) {
        setTimeout(() => {
          this.pin = '';
          this.errorMsg = '';
          this.failCount = 0;
          this.lockoutUntil = null;
          this.onSuccess();
        }, 150);
      } else {
        const nextFail = this.failCount + 1;
        this.failCount = nextFail;
        setTimeout(() => {
          if (nextFail >= 5) {
            const until = Date.now() + 30000;
            this.lockoutUntil = until;
            this.errorMsg = 'PIN 5회 오류로 잠금되었습니다. (30초 후 재시도)';
          } else {
            this.errorMsg = `관리자 PIN 번호가 일치하지 않습니다. (${nextFail}/5)`;
          }
          this.pin = '';
        }, 200);
      }
    }
  }

  public handleDelete() {
    if (this.lockoutUntil && Date.now() < this.lockoutUntil) return;
    this.pin = this.pin.slice(0, -1);
    this.errorMsg = '';
  }

  public handleClear() {
    this.pin = '';
    if (!this.lockoutUntil || Date.now() >= this.lockoutUntil) {
      this.errorMsg = '';
    }
  }

  public destroy() {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }
}

describe('Kiosk Admin Trigger, PIN Security & Local Provisioning QA (A01, A02, A03, A07)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    storageMap.clear();
    (window as any).location.hostname = 'localhost';
    (window as any).location.port = '5179';
    (window as any).location.origin = 'http://localhost:5179';
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  // =========================================================================
  // A01 [5-Tap 제스처 기반 관리자 진입 및 3초 윈도우/탭 카운트 리셋]
  // =========================================================================
  describe('A01 [5-Tap 제스처 기반 관리자 진입 및 3초 윈도우/탭 카운트 리셋]', () => {
    it('A01-1: 3000ms 내에 5회 탭 시 onTrigger 콜백이 정확히 1회 호출되고 탭 카운트가 리셋된다', () => {
      const onTrigger = vi.fn();
      const { handleTap } = useHiddenAdminTrigger(5, 3000);

      // 4 taps with 200ms interval
      for (let i = 0; i < 4; i++) {
        handleTap(onTrigger);
        vi.advanceTimersByTime(200);
      }
      expect(onTrigger).not.toHaveBeenCalled();

      // 5th tap at 800ms
      handleTap(onTrigger);
      expect(onTrigger).toHaveBeenCalledTimes(1);

      // 6th tap immediately after should start a new count (count=1), not trigger duplicate
      handleTap(onTrigger);
      expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it('A01-2: 탭 간격이 3000ms를 초과하면(예: 4회 탭 후 3100ms 대기 후 1회 탭) 카운트가 0으로 리셋되어 onTrigger가 호출되지 않는다', () => {
      const onTrigger = vi.fn();
      const { handleTap } = useHiddenAdminTrigger(5, 3000);

      // 4 taps
      for (let i = 0; i < 4; i++) {
        handleTap(onTrigger);
        vi.advanceTimersByTime(200);
      }
      expect(onTrigger).not.toHaveBeenCalled();

      // Wait 3100ms (timeout exceeds 3000ms) -> timer resets count to 0
      vi.advanceTimersByTime(3100);

      // 5th tap (which is now effectively tap #1 of a new cycle)
      handleTap(onTrigger);
      expect(onTrigger).not.toHaveBeenCalled();

      // Next 3 taps (total 4 in new cycle)
      for (let i = 0; i < 3; i++) {
        handleTap(onTrigger);
        vi.advanceTimersByTime(200);
      }
      expect(onTrigger).not.toHaveBeenCalled();

      // 5th tap in new cycle
      handleTap(onTrigger);
      expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it('A01-3: 빠른 연속 탭(10회) 시 5번째 탭과 10번째 탭에서 각각 1회씩만 트리거되어 중복/오작동을 방지한다', () => {
      const onTrigger = vi.fn();
      const { handleTap } = useHiddenAdminTrigger(5, 3000);

      // 10 rapid taps
      for (let i = 1; i <= 10; i++) {
        handleTap(onTrigger);
        if (i < 5) {
          expect(onTrigger).toHaveBeenCalledTimes(0);
        } else if (i === 5) {
          expect(onTrigger).toHaveBeenCalledTimes(1);
        } else if (i < 10) {
          expect(onTrigger).toHaveBeenCalledTimes(1);
        } else {
          expect(onTrigger).toHaveBeenCalledTimes(2);
        }
        vi.advanceTimersByTime(100);
      }
    });

    it('A01-4: 커스텀 requiredTaps(3회) 및 timeoutMs(1500ms) 파라미터가 정확히 적용된다', () => {
      const onTrigger = vi.fn();
      const { handleTap } = useHiddenAdminTrigger(3, 1500);

      handleTap(onTrigger);
      vi.advanceTimersByTime(200);
      handleTap(onTrigger);
      vi.advanceTimersByTime(200);
      expect(onTrigger).toHaveBeenCalledTimes(0);

      handleTap(onTrigger);
      expect(onTrigger).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // A02 [관리자 PIN 번호 인증 및 5회 연속 오류 시 락다운(Lockout) 가드]
  // =========================================================================
  describe('A02 [관리자 PIN 번호 인증 및 5회 연속 오류 시 락다운(Lockout) 가드]', () => {
    it('A02-1: 기본 PIN("0000") 입력 시 150ms 후 onSuccess 콜백이 호출되고 상태가 초기화된다', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '', onSuccess, onClose });

      modal.handleNumClick('0');
      modal.handleNumClick('0');
      modal.handleNumClick('0');
      modal.handleNumClick('0');

      expect(modal.pin).toBe('0000');
      expect(onSuccess).not.toHaveBeenCalled();

      // 150ms timeout in AdminPinModal.tsx
      vi.advanceTimersByTime(150);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(modal.pin).toBe('');
      expect(modal.errorMsg).toBe('');
      expect(modal.failCount).toBe(0);
      expect(modal.lockoutUntil).toBeNull();
      modal.destroy();
    });

    it('A02-2: 커스텀 PIN("9876") 설정 시 정상 인증되어 onSuccess가 호출된다', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '9876', onSuccess, onClose });

      ['9', '8', '7', '6'].forEach((n) => modal.handleNumClick(n));
      expect(modal.pin).toBe('9876');

      vi.advanceTimersByTime(150);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(modal.pin).toBe('');
      modal.destroy();
    });

    it('A02-3: 1~4회 PIN 오입력 시 실패 안내 문구(N/5)가 표시되고 PIN이 리셋되며 onSuccess는 호출되지 않는다', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '1234', onSuccess, onClose });

      for (let attempt = 1; attempt <= 4; attempt++) {
        ['9', '9', '9', '9'].forEach((n) => modal.handleNumClick(n));
        expect(modal.pin).toBe('9999');

        // 200ms failure timeout in AdminPinModal.tsx
        vi.advanceTimersByTime(200);

        expect(modal.failCount).toBe(attempt);
        expect(modal.errorMsg).toBe(`관리자 PIN 번호가 일치하지 않습니다. (${attempt}/5)`);
        expect(modal.pin).toBe('');
        expect(onSuccess).not.toHaveBeenCalled();
        expect(modal.lockoutUntil).toBeNull();
      }
      modal.destroy();
    });

    it('A02-4: 5회 연속 PIN 오입력 시 30초 락다운(lockoutUntil)이 발동하고 키패드 터치와 삭제가 차단된다', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '1234', onSuccess, onClose });

      // 4 failures
      for (let i = 1; i <= 4; i++) {
        ['0', '0', '0', '0'].forEach((n) => modal.handleNumClick(n));
        vi.advanceTimersByTime(200);
      }
      expect(modal.failCount).toBe(4);

      // 5th failure
      ['0', '0', '0', '0'].forEach((n) => modal.handleNumClick(n));
      vi.advanceTimersByTime(200);

      expect(modal.failCount).toBe(5);
      expect(modal.lockoutUntil).not.toBeNull();
      expect(modal.errorMsg).toContain('PIN 5회 오류로 잠금되었습니다. (30초 후 재시도)');

      // Keypad touches during lockout are blocked and show remaining seconds
      modal.handleNumClick('1');
      expect(modal.pin).toBe(''); // blocked!
      expect(modal.errorMsg).toContain('PIN 5회 오류로 잠금되었습니다.');

      // Delete during lockout is blocked
      modal.handleDelete();
      expect(modal.pin).toBe('');

      modal.destroy();
    });

    it('A02-5: 30초 락다운 경과 후 락다운이 해제되고 failCount가 리셋되어 정상 재시도가 가능하다', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '1234', onSuccess, onClose });

      // Trigger 5 failures
      for (let i = 1; i <= 5; i++) {
        ['9', '9', '9', '9'].forEach((n) => modal.handleNumClick(n));
        vi.advanceTimersByTime(200);
      }
      expect(modal.lockoutUntil).not.toBeNull();

      // Advance 15 seconds: still locked out
      vi.advanceTimersByTime(15000);
      expect(modal.lockoutUntil).not.toBeNull();
      expect(modal.errorMsg).toContain('15초 후 재시도');

      // Advance remaining 15 seconds (total 30 seconds)
      vi.advanceTimersByTime(15500);

      // Countdown expired: interval resets state
      expect(modal.lockoutUntil).toBeNull();
      expect(modal.failCount).toBe(0);
      expect(modal.errorMsg).toBe('');

      // Now enter correct PIN '1234'
      ['1', '2', '3', '4'].forEach((n) => modal.handleNumClick(n));
      vi.advanceTimersByTime(150);

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(modal.pin).toBe('');
      modal.destroy();
    });

    it('A02-6: handleClear 및 handleDelete 정상 동작 검증', () => {
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const modal = new AdminPinModalSimulator({ adminPin: '0000', onSuccess, onClose });

      modal.handleNumClick('1');
      modal.handleNumClick('2');
      expect(modal.pin).toBe('12');

      modal.handleDelete();
      expect(modal.pin).toBe('1');

      modal.handleNumClick('5');
      expect(modal.pin).toBe('15');

      modal.handleClear();
      expect(modal.pin).toBe('');
      expect(modal.errorMsg).toBe('');
      modal.destroy();
    });
  });

  // =========================================================================
  // A03 [관리자 모드 활성화 중 전역 유휴(Idle) 자동 로그아웃 일시 정지]
  // =========================================================================
  describe('A03 [관리자 모드 활성화 중 전역 유휴(Idle) 자동 로그아웃 일시 정지]', () => {
    /**
     * KioskApp.tsx idle session watcher logic harness (lines 506-532)
     */
    function createIdleWatcherSimulator() {
      const handleLogout = vi.fn();
      const showToast = vi.fn();
      const isAdminPinOpenRef = { current: false };
      const isSettingsOpenRef = { current: false };
      const isAllocatingRef = { current: false };
      const isVanBusyRef = { current: false };

      const timeoutMs = 40000;
      let sessionTimeout: any = null;

      const resetTimer = () => {
        if (sessionTimeout) clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => {
          if (
            isAllocatingRef.current ||
            isVanBusyRef.current ||
            isAdminPinOpenRef.current ||
            isSettingsOpenRef.current
          ) {
            resetTimer();
            return;
          }
          handleLogout();
          showToast('일정 시간 조작이 없어 광고 화면으로 복귀합니다.', false);
        }, timeoutMs);
      };

      resetTimer();

      const stop = () => {
        if (sessionTimeout) clearTimeout(sessionTimeout);
      };

      return {
        handleLogout,
        showToast,
        isAdminPinOpenRef,
        isSettingsOpenRef,
        isAllocatingRef,
        isVanBusyRef,
        resetTimer,
        stop,
      };
    }

    it('A03-1: 일반 유휴 상태에서 40초 동안 조작이 없으면 자동으로 handleLogout이 실행된다', () => {
      const watcher = createIdleWatcherSimulator();

      // 39.9 seconds: not logged out yet
      vi.advanceTimersByTime(39900);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      // 40.0 seconds: logged out
      vi.advanceTimersByTime(100);
      expect(watcher.handleLogout).toHaveBeenCalledTimes(1);
      expect(watcher.showToast).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it('A03-2: 관리자 PIN 모달 활성화(isAdminPinOpen = true) 중에는 40초가 지나도 로그아웃되지 않고 타이머가 자동 연장된다', () => {
      const watcher = createIdleWatcherSimulator();
      watcher.isAdminPinOpenRef.current = true;

      // 40 seconds pass
      vi.advanceTimersByTime(40000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      // Another 40 seconds pass (total 80s)
      vi.advanceTimersByTime(40000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      // Another 40 seconds pass (total 120s)
      vi.advanceTimersByTime(40000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      watcher.stop();
    });

    it('A03-3: 관리자 설정 모달 활성화(isSettingsOpen = true) 중에도 유휴 로그아웃이 완전 차단된다', () => {
      const watcher = createIdleWatcherSimulator();
      watcher.isSettingsOpenRef.current = true;

      // 100 seconds pass
      vi.advanceTimersByTime(100000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      watcher.stop();
    });

    it('A03-4: 관리자 모드 종료 후(isAdminPinOpen=false, isSettingsOpen=false) 다시 40초 유휴 시 정상 로그아웃된다', () => {
      const watcher = createIdleWatcherSimulator();
      watcher.isAdminPinOpenRef.current = true;

      // Admin active for 60 seconds
      vi.advanceTimersByTime(60000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      // Admin exits modal by touching close button (triggers resetTimer via window listener)
      watcher.isAdminPinOpenRef.current = false;
      watcher.resetTimer();

      // 39 seconds after exit: still active
      vi.advanceTimersByTime(39000);
      expect(watcher.handleLogout).not.toHaveBeenCalled();

      // 40 seconds after exit: logged out
      vi.advanceTimersByTime(1000);
      expect(watcher.handleLogout).toHaveBeenCalledTimes(1);

      watcher.stop();
    });
  });

  // =========================================================================
  // A07 [루프백 Zero-Config 로컬 프로비저닝 (Frontend bootstrapLocalKioskSettings)]
  // =========================================================================
  describe('A07 [루프백 Zero-Config 로컬 프로비저닝 (Frontend bootstrapLocalKioskSettings)]', () => {
    it('A07-1: 비 루프백 호스트(kiosk.segnet.co.kr)에서는 네트워크 요청 없이 null을 즉시 반환한다', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      (window as any).location.hostname = 'kiosk.segnet.co.kr';
      (window as any).location.port = '';
      (window as any).location.origin = 'https://kiosk.segnet.co.kr';

      const result = await bootstrapLocalKioskSettings();
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('A07-2: 루프백 호스트(localhost)라도 이미 명시적 deviceKey가 설정되어 있으면 네트워크 요청 없이 기존 설정을 반환한다', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      (window as any).location.hostname = 'localhost';
      (window as any).location.port = '5179';
      (window as any).location.origin = 'http://localhost:5179';

      // Existing explicit settings in localStorage
      saveKioskSettings({
        storeCode: 'EXISTING_STORE',
        deviceKey: 'DK_MANUAL_KEY_999',
      });

      const result = await bootstrapLocalKioskSettings();
      expect(result).not.toBeNull();
      expect(result?.deviceKey).toBe('DK_MANUAL_KEY_999');
      expect(result?.storeCode).toBe('EXISTING_STORE');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('A07-3: 루프백 호스트(127.0.0.1)에서 설정이 없으면 /api/v1/kiosk/local-bootstrap을 호출하여 자동 프로비저닝하고 localStorage에 저장한다', async () => {
      (window as any).location.hostname = '127.0.0.1';
      (window as any).location.port = '5179';
      (window as any).location.origin = 'http://127.0.0.1:5179';

      // Set existing store_cd to verify query parameter propagation
      storageMap.set('LM_STORE_CD', 'AUTO_BOOT_STORE');

      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            store_cd: 'AUTO_BOOT_STORE',
            store_nm: '루프백 자동 개통 매장',
            device_key: 'DK_BOOTSTRAP_7777',
            device_id: 'kiosk-01',
            device_name: '무인 발권기 1호',
            terminal_id: '88019999',
            vcat_port: '9099',
            provider_type: 'KCP_VAN',
            prepare_time_min: 3,
          }),
        };
      });

      const result = await bootstrapLocalKioskSettings();

      expect(capturedUrl).toContain('/api/v1/kiosk/local-bootstrap?store_cd=AUTO_BOOT_STORE');
      expect(result).not.toBeNull();
      expect(result?.storeCode).toBe('AUTO_BOOT_STORE');
      expect(result?.deviceKey).toBe('DK_BOOTSTRAP_7777');
      expect(result?.terminalId).toBe('88019999');
      expect(result?.vcatPort).toBe('9099');
      expect(result?.providerType).toBe('KCP_VAN');

      // Verify localStorage persistence
      const savedSettings = getKioskSettings();
      expect(savedSettings.deviceKey).toBe('DK_BOOTSTRAP_7777');
      expect(storageMap.get('LM_STORE_CD')).toBe('AUTO_BOOT_STORE');
      expect(storageMap.get('LM_KIOSK_TERMINAL_ID')).toBe('88019999');
    });

    it('A07-4: 백엔드 500 에러나 통신 실패 발생 시 예외를 던지지 않고 안전하게 null을 반환한다', async () => {
      (window as any).location.hostname = '127.0.0.1';
      (window as any).location.port = '5179';
      (window as any).location.origin = 'http://127.0.0.1:5179';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal Server Error' }),
      });

      const result = await bootstrapLocalKioskSettings();
      expect(result).toBeNull();

      // Network throw simulation
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const resultNetworkError = await bootstrapLocalKioskSettings();
      expect(resultNetworkError).toBeNull();
    });
  });
});
