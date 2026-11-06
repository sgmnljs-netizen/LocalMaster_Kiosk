import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kioskVanClient } from '../../services/van/van_client';
import type { CardApprovalResult, VanPaymentState } from '../../services/van/van_types';

/**
 * Node 환경에서 React Hook의 상태 슬롯, 의존성 배열 비교, useEffect 클린업 라이프사이클을
 * 실제 Fiber와 동일하게 시뮬레이션하는 경량 하네스
 */
interface EffectSlot {
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | void;
  effect: () => (() => void) | void;
  initialized: boolean;
}

interface CallbackSlot {
  deps: readonly unknown[] | undefined;
  fn: unknown;
}

const hookRuntime = {
  active: false,
  stateSlots: [] as unknown[],
  refSlots: [] as Array<{ current: unknown }>,
  callbackSlots: [] as CallbackSlot[],
  effectSlots: [] as EffectSlot[],
  stateCursor: 0,
  refCursor: 0,
  callbackCursor: 0,
  effectCursor: 0,
  rerenderFn: null as (() => void) | null,
};

function depsEqual(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined): boolean {
  if (!prev || !next || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (!Object.is(prev[i], next[i])) return false;
  }
  return true;
}

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)): [T, (updater: T | ((prev: T) => T)) => void] => {
      const idx = hookRuntime.stateCursor++;
      if (idx >= hookRuntime.stateSlots.length) {
        const initVal = typeof initial === 'function' ? (initial as () => T)() : initial;
        hookRuntime.stateSlots.push(initVal);
      }
      const setState = (updater: T | ((prev: T) => T)) => {
        const prev = hookRuntime.stateSlots[idx] as T;
        const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        if (!Object.is(prev, next)) {
          hookRuntime.stateSlots[idx] = next;
          hookRuntime.rerenderFn?.();
        }
      };
      return [hookRuntime.stateSlots[idx] as T, setState];
    },
    useRef: <T,>(initial: T): { current: T } => {
      const idx = hookRuntime.refCursor++;
      if (idx >= hookRuntime.refSlots.length) {
        hookRuntime.refSlots.push({ current: initial });
      }
      return hookRuntime.refSlots[idx] as { current: T };
    },
    useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps?: readonly unknown[]): T => {
      const idx = hookRuntime.callbackCursor++;
      const existing = hookRuntime.callbackSlots[idx];
      if (existing && depsEqual(existing.deps, deps)) {
        return existing.fn as T;
      }
      hookRuntime.callbackSlots[idx] = { deps, fn };
      return fn;
    },
    useEffect: (effect: () => (() => void) | void, deps?: readonly unknown[]): void => {
      const idx = hookRuntime.effectCursor++;
      const existing = hookRuntime.effectSlots[idx];
      if (!existing) {
        hookRuntime.effectSlots[idx] = {
          deps,
          cleanup: undefined,
          effect,
          initialized: false,
        };
      } else {
        existing.effect = effect;
        if (!depsEqual(existing.deps, deps)) {
          existing.cleanup?.();
          existing.deps = deps;
          existing.initialized = false;
        }
      }
    },
  };
});

function mountHook<T>(render: () => T): {
  readonly current: T;
  rerender: () => void;
  unmount: () => void;
} {
  hookRuntime.active = true;
  hookRuntime.stateSlots = [];
  hookRuntime.refSlots = [];
  hookRuntime.callbackSlots = [];
  hookRuntime.effectSlots = [];

  let latest!: T;

  const flushEffects = () => {
    for (const slot of hookRuntime.effectSlots) {
      if (!slot.initialized) {
        slot.initialized = true;
        slot.cleanup = slot.effect();
      }
    }
  };

  const executeRender = () => {
    hookRuntime.stateCursor = 0;
    hookRuntime.refCursor = 0;
    hookRuntime.callbackCursor = 0;
    hookRuntime.effectCursor = 0;
    latest = render();
    flushEffects();
  };

  hookRuntime.rerenderFn = executeRender;
  executeRender();

  return {
    get current() {
      return latest;
    },
    rerender: executeRender,
    unmount: () => {
      hookRuntime.rerenderFn = null;
      for (const slot of hookRuntime.effectSlots) {
        slot.cleanup?.();
        slot.cleanup = undefined;
      }
      hookRuntime.active = false;
    },
  };
}

import { useHiddenAdminTrigger } from '../useHiddenAdminTrigger';
import { useKioskVanPayment } from '../useKioskVanPayment';
import { probeKioskHardwareHealthOnce, useKioskHardwareHeartbeat } from '../useKioskHardwareHeartbeat';
import { getKioskHardwareHealth, setKioskHardwareHealth } from '../../stores/useKioskHardwareHealthStore';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

const windowTarget = new EventTarget();
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      hostname: '127.0.0.1',
      port: '5179',
      origin: 'http://127.0.0.1:5179',
      protocol: 'http:',
      pathname: '/',
      search: '',
    },
    navigator: {
      userAgent: 'Windows NT 10.0',
      platform: 'Win32',
      webdriver: false,
    },
    localStorage: mockLocalStorage,
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
  },
  configurable: true,
  writable: true,
});

describe('W3-KSK-hooks: 키오스크 커스텀 훅 타이머·상태머신·언마운트 클린업 단위테스트', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    storageMap.clear();
    storageMap.set('HARDWARE_MOCK', 'false');
    setKioskHardwareHealth({
      vcatStatus: 'ONLINE',
      printerStatus: 'ONLINE',
      vcatErrorMessage: null,
      printerErrorMessage: null,
      lastCheckedAt: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  describe('useHiddenAdminTrigger', () => {
    it('언마운트 시 대기 중인 탭 리셋 타이머(setTimeout)를 즉시 해제하여 타이머 누수를 방지한다', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const onTrigger = vi.fn();
      const hook = mountHook(() => useHiddenAdminTrigger(5, 3000));

      hook.current.handleTap(onTrigger);
      hook.current.handleTap(onTrigger);
      expect(onTrigger).not.toHaveBeenCalled();

      hook.unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('useKioskVanPayment', () => {
    it('WAITING_CARD 상태 진입 후에도 1초 카운트다운이 중단되지 않고 만료 시 TIMEOUT으로 단말기 요청을 취소한다', async () => {
      let stateCallback: ((st: VanPaymentState) => void) | undefined;
      let resolveVan!: (res: CardApprovalResult) => void;

      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest').mockImplementation(() => {
        stateCallback?.('CANCELLED');
        resolveVan({
          success: false,
          auth_code: '',
          approved_at: '2026-11-06T14:00:00+09:00',
          card_no_masked: '',
          issuer_name: '',
          acquirer_name: '',
          terminal_id: '88010003',
          amount: 20000,
          installment_months: 0,
          error_code: 'E_USER_CANCEL',
          error_message: '사용자 취소',
        });
      });

      vi.spyOn(kioskVanClient, 'requestCardPayment').mockImplementation((_params, onStateChange) => {
        stateCallback = onStateChange;
        onStateChange?.('WAITING_CARD');
        return new Promise<CardApprovalResult>((resolve) => {
          resolveVan = resolve;
        });
      });

      const hook = mountHook(() => useKioskVanPayment());
      const paymentPromise = hook.current.startPayment({ amount: 20000, timeoutSeconds: 5 });

      expect(hook.current.state).toBe('WAITING_CARD');
      expect(hook.current.isProcessing).toBe(true);
      expect(hook.current.remainingSeconds).toBe(5);
      // 상태 전환만으로 cancelCurrentRequest가 오호출되면 절대 안 됨
      expect(cancelSpy).not.toHaveBeenCalled();

      // 3초 경과 -> remainingSeconds가 정확히 2초로 감소해야 함 (기존 clearTimer 조기 호출 버그 회귀 검증)
      vi.advanceTimersByTime(3000);
      expect(hook.current.remainingSeconds).toBe(2);
      expect(cancelSpy).not.toHaveBeenCalled();

      // 추가 2초 경과 -> 타임아웃 도달로 cancelCurrentRequest 호출 및 E_TIMEOUT 정규화
      vi.advanceTimersByTime(2000);
      const res = await paymentPromise;
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(hook.current.state).toBe('TIMEOUT');
      expect(res.error_code).toBe('E_TIMEOUT');

      hook.unmount();
    });

    it('이미 VAN 승인 통신 중(REQUESTING)일 때는 카운트다운이 0이 되어도 소켓을 강제 절단하지 않는다', async () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest').mockImplementation(() => {});
      let resolveVan!: (res: CardApprovalResult) => void;

      vi.spyOn(kioskVanClient, 'requestCardPayment').mockImplementation((_params, onStateChange) => {
        onStateChange?.('REQUESTING');
        return new Promise<CardApprovalResult>((resolve) => {
          resolveVan = resolve;
        });
      });

      const hook = mountHook(() => useKioskVanPayment());
      const paymentPromise = hook.current.startPayment({ amount: 30000, timeoutSeconds: 2 });

      vi.advanceTimersByTime(3000);
      expect(hook.current.remainingSeconds).toBe(0);
      expect(cancelSpy).not.toHaveBeenCalled();

      resolveVan({
        success: true,
        auth_code: '99887766',
        approved_at: '2026-11-06T14:05:00+09:00',
        card_no_masked: '1234-56**-****-7890',
        issuer_name: '신한카드',
        acquirer_name: '신한카드',
        terminal_id: '88010003',
        amount: 30000,
        installment_months: 0,
      });

      const finalRes = await paymentPromise;
      expect(finalRes.success).toBe(true);
      // 정상 승인 완료 시에도 cancelCurrentRequest가 오호출되지 않아야 함
      expect(cancelSpy).not.toHaveBeenCalled();

      hook.unmount();
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it('결제 진행 중 컴포넌트가 실제로 언마운트될 때만 단말기 요청 취소(cancelCurrentRequest)를 호출한다', () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest').mockImplementation(() => {});
      vi.spyOn(kioskVanClient, 'requestCardPayment').mockImplementation((_params, onStateChange) => {
        onStateChange?.('WAITING_CARD');
        return new Promise<CardApprovalResult>(() => {});
      });

      const hook = mountHook(() => useKioskVanPayment());
      void hook.current.startPayment({ amount: 15000, timeoutSeconds: 10 });
      expect(hook.current.isProcessing).toBe(true);
      expect(cancelSpy).not.toHaveBeenCalled();

      hook.unmount();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('useKioskHardwareHeartbeat & probeKioskHardwareHealthOnce', () => {
    it('VCAT 오프라인 응답 및 프린터 브릿지 DEGRADED 상태를 감지하여 헬스 스토어에 반영하고 언마운트 시 인터벌을 정리한다', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/vcat/status')) {
          return new Response(JSON.stringify({ isOnline: false, message: '리더기 USB 분리됨' }), { status: 200 });
        }
        if (url.includes(':18080/health')) {
          return new Response(JSON.stringify({ status: 'DEGRADED', printer_status: 'PAPER_OUT', message: '영수증 용지 부족' }), {
            status: 200,
          });
        }
        return new Response('{}', { status: 200 });
      });

      const probe = await probeKioskHardwareHealthOnce();
      expect(probe).toEqual({
        nextVcat: 'OFFLINE',
        nextVcatReason: '리더기 USB 분리됨',
        nextPrinter: 'OFFLINE',
        nextPrinterReason: '영수증 용지 부족',
      });

      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      const hb = mountHook(() => useKioskHardwareHeartbeat());
      await hb.current.checkHealth();

      const storeState = getKioskHardwareHealth();
      expect(storeState.vcatStatus).toBe('OFFLINE');
      expect(storeState.printerStatus).toBe('OFFLINE');
      expect(storeState.printerErrorMessage).toBe('영수증 용지 부족');

      hb.unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
