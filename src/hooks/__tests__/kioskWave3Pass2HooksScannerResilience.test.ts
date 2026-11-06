import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

interface EffectSlot {
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | void;
  effect: () => (() => void) | void;
  initialized: boolean;
}

const hookRuntime = {
  refSlots: [] as Array<{ current: unknown }>,
  effectSlots: [] as EffectSlot[],
  refCursor: 0,
  effectCursor: 0,
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
    useRef: <T,>(initial: T): { current: T } => {
      const idx = hookRuntime.refCursor++;
      if (idx >= hookRuntime.refSlots.length) {
        hookRuntime.refSlots.push({ current: initial });
      }
      return hookRuntime.refSlots[idx] as { current: T };
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

const keydownListeners = new Set<(e: KeyboardEvent) => void>();

const windowShim = {
  location: {
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: '5179',
    origin: 'http://127.0.0.1:5179',
  },
  addEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
    if (type === 'keydown') {
      keydownListeners.add(handler);
    }
  }),
  removeEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
    if (type === 'keydown') {
      keydownListeners.delete(handler);
    }
  }),
  dispatchEvent: vi.fn(),
};

Object.defineProperty(globalThis, 'window', {
  value: windowShim,
  configurable: true,
  writable: true,
});

import { resolveScannerChar, useHardwareScanner } from '../../services/hardware/hooks/useHardwareScanner';
import { kioskHardwareBridge } from '../../services/hardware/services/HardwareBridgeClient';

function mountHook(render: () => void): { rerender: () => void; unmount: () => void } {
  hookRuntime.refSlots = [];
  hookRuntime.effectSlots = [];

  const flushEffects = () => {
    for (const slot of hookRuntime.effectSlots) {
      if (!slot.initialized) {
        slot.initialized = true;
        slot.cleanup = slot.effect();
      }
    }
  };

  const runRender = () => {
    hookRuntime.refCursor = 0;
    hookRuntime.effectCursor = 0;
    render();
    flushEffects();
  };

  runRender();

  return {
    rerender: () => runRender(),
    unmount: () => {
      for (const slot of hookRuntime.effectSlots) {
        slot.cleanup?.();
      }
    },
  };
}

function makeKeyEvent(overrides: Partial<KeyboardEvent> & { tagName?: string } = {}): KeyboardEvent {
  const { tagName = 'DIV', ...rest } = overrides;
  return {
    key: '',
    code: '',
    keyCode: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    target: { tagName, isContentEditable: false } as unknown as EventTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...rest,
  } as unknown as KeyboardEvent;
}

function emitKey(e: KeyboardEvent): void {
  for (const listener of Array.from(keydownListeners)) {
    listener(e);
  }
}

describe('Wave 3 Pass 2 — Hooks Korean IME Barcode Scanner & Input Focus Isolation', () => {
  beforeEach(() => {
    keydownListeners.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolveScannerChar reconstructs ASCII under Korean IME (key=Process, keyCode=229) when unfocused and blocks IME inside inputs', () => {
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'KeyC', shiftKey: true }), false)).toBe('C');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'KeyP', shiftKey: false }), false)).toBe('p');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Digit9' }), false)).toBe('9');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Numpad3' }), false)).toBe('3');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Minus', shiftKey: false }), false)).toBe('-');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Minus', shiftKey: true }), false)).toBe('_');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Semicolon', shiftKey: true }), false)).toBe(':');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Slash' }), false)).toBe('/');
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'Period' }), false)).toBe('.');

    // 입력창 포커스 중 한글 조합(229 / isComposing)은 스캐너 버퍼 유입 원천 차단
    expect(resolveScannerChar(makeKeyEvent({ key: 'Process', keyCode: 229, code: 'KeyC' }), true)).toBeNull();
    expect(resolveScannerChar(makeKeyEvent({ key: 'ㅎ', isComposing: true, code: 'KeyG' }), true)).toBeNull();

    // 단축키(Ctrl/Alt/Meta)는 스캐너 문자로 취급하지 않음
    expect(resolveScannerChar(makeKeyEvent({ key: 'v', code: 'KeyV', ctrlKey: true }), false)).toBeNull();
    expect(resolveScannerChar(makeKeyEvent({ key: 'r', code: 'KeyR', metaKey: true }), false)).toBeNull();
  });

  it('useHardwareScanner assembles high-speed HID bursts, suppresses Enter inside focused inputs, ignores slow human typing, and cleans up on unmount', () => {
    let daemonCallback: ((barcode: string) => void) | null = null;
    const unsubscribeDaemon = vi.fn();
    vi.spyOn(kioskHardwareBridge, 'subscribeScanner').mockImplementation((cb) => {
      daemonCallback = cb;
      return unsubscribeDaemon;
    });

    const scanned: string[] = [];
    const mounted = mountHook(() => {
      useHardwareScanner({
        onScan: (code) => scanned.push(code),
        enabled: true,
        minBarcodeLength: 4,
        maxKeystrokeIntervalMs: 50,
      });
    });

    expect(keydownListeners.size).toBe(1);

    // 1. 한글 IME 상태에서도 고속 USB HID 스캔('CPN_9') 시 정상 복원 발화
    const burstSequence: Array<Partial<KeyboardEvent> & { tagName?: string }> = [
      { key: 'Shift', code: 'ShiftLeft', shiftKey: true },
      { key: 'Process', keyCode: 229, code: 'KeyC', shiftKey: true },
      { key: 'Process', keyCode: 229, code: 'KeyP', shiftKey: true },
      { key: 'Process', keyCode: 229, code: 'KeyN', shiftKey: true },
      { key: 'Process', keyCode: 229, code: 'Minus', shiftKey: true },
      { key: '9', code: 'Digit9', shiftKey: false },
    ];
    for (const item of burstSequence) {
      vi.advanceTimersByTime(8);
      emitKey(makeKeyEvent(item));
    }
    vi.advanceTimersByTime(10);
    const enterOnInput = makeKeyEvent({ key: 'Enter', code: 'Enter', tagName: 'INPUT' });
    emitKey(enterOnInput);

    expect(scanned).toEqual(['CPN_9']);
    expect(enterOnInput.preventDefault).toHaveBeenCalledTimes(1);
    expect(enterOnInput.stopPropagation).toHaveBeenCalledTimes(1);

    // 2. 느린 사람 타이핑(키 간격 180ms > 50ms) 후 Enter 입력 시 오작동 스캔 차단
    for (const ch of ['0', '1', '0', '9', '9']) {
      vi.advanceTimersByTime(180);
      emitKey(makeKeyEvent({ key: ch, code: `Digit${ch}`, tagName: 'INPUT' }));
    }
    vi.advanceTimersByTime(180);
    emitKey(makeKeyEvent({ key: 'Enter', code: 'Enter', tagName: 'INPUT' }));
    expect(scanned).toEqual(['CPN_9']);

    // 3. 하드웨어 데몬 WebSocket 스캔 수신 시 최소 길이 이상만 전달
    daemonCallback?.('AB');
    daemonCallback?.('QR-MEMBER-7788');
    expect(scanned).toEqual(['CPN_9', 'QR-MEMBER-7788']);

    // 4. 언마운트 시 keydown 리스너 및 데몬 구독 완벽 해제
    mounted.unmount();
    expect(unsubscribeDaemon).toHaveBeenCalledTimes(1);
    expect(keydownListeners.size).toBe(0);
  });
});
