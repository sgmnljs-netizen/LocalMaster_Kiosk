import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

interface EffectSlot {
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | void;
  effect: () => (() => void) | void;
  initialized: boolean;
}

const hookRuntime = {
  stateSlots: [] as unknown[],
  effectSlots: [] as EffectSlot[],
  stateCursor: 0,
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

const storageMap = new Map<string, string>();
const localStorageShim: Storage = {
  get length() {
    return storageMap.size;
  },
  clear() {
    storageMap.clear();
  },
  getItem(key: string) {
    return storageMap.has(key) ? (storageMap.get(key) ?? null) : null;
  },
  key(index: number) {
    return Array.from(storageMap.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageMap.delete(key);
  },
  setItem(key: string, value: string) {
    storageMap.set(key, String(value));
  },
};

const locationState = {
  protocol: 'http:',
  hostname: '127.0.0.1',
  port: '5179',
  origin: 'http://127.0.0.1:5179',
};

const windowShim = {
  location: locationState,
  localStorage: localStorageShim,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  configurable: true,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: windowShim,
  configurable: true,
  writable: true,
});

import {
  bootstrapLocalKioskSettings,
  clearKioskAdminSession,
  computeOwnerPinDigest,
  getKioskSettings,
  hydrateKioskDeviceSettingsFromServer,
  pushKioskDeviceSettingsToServer,
  saveKioskSettings,
  setKioskAdminSessionToken,
  verifyOfflineAdminOrEngineerPin,
} from '../kioskSettings';
import {
  getKioskHardwareHealth,
  setKioskHardwareHealth,
  setVcatStatus,
  useKioskHardwareHealthStore,
} from '../useKioskHardwareHealthStore';

function mountHealthHook(): {
  readonly renderCount: number;
  readonly current: ReturnType<typeof useKioskHardwareHealthStore>;
  unmount: () => void;
} {
  const localStateSlots: unknown[] = [];
  const localEffectSlots: EffectSlot[] = [];
  let latest!: ReturnType<typeof useKioskHardwareHealthStore>;
  let renders = 0;

  const flushEffects = () => {
    for (const slot of localEffectSlots) {
      if (!slot.initialized) {
        slot.initialized = true;
        slot.cleanup = slot.effect();
      }
    }
  };

  const runRender = () => {
    renders += 1;
    hookRuntime.stateSlots = localStateSlots;
    hookRuntime.effectSlots = localEffectSlots;
    hookRuntime.stateCursor = 0;
    hookRuntime.effectCursor = 0;
    hookRuntime.rerenderFn = () => runRender();
    latest = useKioskHardwareHealthStore();
    flushEffects();
  };

  runRender();

  return {
    get renderCount() {
      return renders;
    },
    get current() {
      return latest;
    },
    unmount: () => {
      for (const slot of localEffectSlots) {
        slot.cleanup?.();
      }
    },
  };
}

describe('Wave 3 Pass 2 — Stores LAN Auto-Rewrite, Offline PIN Isolation & Sync Resilience', () => {
  beforeEach(() => {
    storageMap.clear();
    clearKioskAdminSession();
    locationState.protocol = 'http:';
    locationState.hostname = '127.0.0.1';
    locationState.port = '5179';
    locationState.origin = 'http://127.0.0.1:5179';
    setKioskHardwareHealth({
      vcatStatus: 'ONLINE',
      printerStatus: 'ONLINE',
      vcatErrorMessage: null,
      printerErrorMessage: null,
      lastCheckedAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('auto-rewrites stale localhost apiUrl to LAN host on 2-Tier remote clients while preserving explicit LAN server IPs', () => {
    localStorageShim.setItem(
      'lm-kiosk-settings',
      JSON.stringify({
        apiUrl: 'http://127.0.0.1:8000',
        storeCode: 'H01-SE-009',
      })
    );
    locationState.hostname = '192.168.0.55';
    locationState.origin = 'http://192.168.0.55:5179';

    const rewritten = getKioskSettings();
    expect(rewritten.apiUrl).toBe('http://192.168.0.55:8000');
    expect(rewritten.storeCode).toBe('H01-SE-009');

    // 명시적인 별도 엣지 서버 IP(192.168.0.10)가 저장된 경우에는 강제 덮어쓰지 않고 보존해야 함
    localStorageShim.setItem(
      'lm-kiosk-settings',
      JSON.stringify({
        apiUrl: 'http://192.168.0.10:8000/',
        storeCode: 'H01-SE-009',
      })
    );
    expect(getKioskSettings().apiUrl).toBe('http://192.168.0.10:8000');
  });

  it('enforces offline Owner PIN digest isolation and blocks default digest fallback when hasCustomAdminPin is true', () => {
    const customDigest = computeOwnerPinDigest('2580');

    expect(verifyOfflineAdminOrEngineerPin('2580', undefined, true, customDigest)).toEqual({
      valid: true,
      role: 'OWNER',
    });
    expect(verifyOfflineAdminOrEngineerPin('9999', undefined, true, customDigest)).toEqual({
      valid: false,
    });

    // 서버에 커스텀 PIN이 설정(hasCustomAdminPin=true)되었는데 로컬 다이제스트가 없는 경우 초기 기본 PIN('0000'/'1234') 우회 차단
    expect(verifyOfflineAdminOrEngineerPin('0000', undefined, true, undefined)).toEqual({
      valid: false,
    });
    expect(verifyOfflineAdminOrEngineerPin('1234', undefined, true, undefined)).toEqual({
      valid: false,
    });

    // 4자리 숫자 외 비정상 입력 즉시 거부
    expect(verifyOfflineAdminOrEngineerPin('12ab', undefined, false, customDigest)).toEqual({
      valid: false,
    });
    expect(verifyOfflineAdminOrEngineerPin('', undefined, false, customDigest)).toEqual({
      valid: false,
    });
  });

  it('suppresses redundant notifications in useKioskHardwareHealthStore and safely notifies remaining subscribers on mid-notify unsubscribe', () => {
    const subA = mountHealthHook();
    const subB = mountHealthHook();
    const initialRendersA = subA.renderCount;
    const initialRendersB = subB.renderCount;

    // 동일 상태 재주입 시 불필요한 리렌더 차단
    setVcatStatus('ONLINE', null);
    expect(subA.renderCount).toBe(initialRendersA);
    expect(subB.renderCount).toBe(initialRendersB);

    // 상태 변경 시 모든 구독자에 정확히 전파되고 중간 구독 해제 후에도 나머지 구독자가 안전하게 유지됨
    subA.unmount();
    setVcatStatus('OFFLINE', 'VCAT_DOWN');
    expect(subA.renderCount).toBe(initialRendersA);
    expect(subB.renderCount).toBeGreaterThan(initialRendersB);
    expect(subB.current.vcatStatus).toBe('OFFLINE');
    expect(getKioskHardwareHealth().vcatErrorMessage).toBe('VCAT_DOWN');

    subB.unmount();
  });

  it('gracefully degrades pushKioskDeviceSettingsToServer, hydrateKioskDeviceSettingsFromServer, and unauthenticated LAN bootstrap on HTTP/network errors', async () => {
    const saved = saveKioskSettings(
      {
        storeCode: 'H01-SE-777',
        deviceId: 'dev-3',
        apiUrl: 'http://192.168.0.10:8000',
      },
      { syncRemote: false }
    );

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // 1. 비루프백 사설 LAN에서 관리자 인증 토큰 없이 부트스트랩 호출 시 네트워크 요청 없이 즉시 null 차단
    locationState.hostname = '192.168.0.55';
    const blockedBootstrap = await bootstrapLocalKioskSettings({ force: true });
    expect(blockedBootstrap).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // 2. 오프라인 PIN 검증 후 새 서버로 설정 푸시 시 토큰 자동 교환 성공 -> PUT 성공(true)
    setKioskAdminSessionToken(null, '2580');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, pin_session_token: 'tok-recovered-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

    const pushedOk = await pushKioskDeviceSettingsToServer(saved);
    expect(pushedOk).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const putInit = fetchMock.mock.calls[1][1] as { headers?: Record<string, string> };
    expect(putInit.headers?.['X-Kiosk-Admin-Token']).toBe('tok-recovered-1');

    // 3. 서버 500 장애 및 네트워크 단절 시 예외 전파 없이 false / null 폴백 + 기존 로컬 설정 보존
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await pushKioskDeviceSettingsToServer(saved)).toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await hydrateKioskDeviceSettingsFromServer()).toBeNull();
    expect(getKioskSettings().storeCode).toBe('H01-SE-777');
  });
});
