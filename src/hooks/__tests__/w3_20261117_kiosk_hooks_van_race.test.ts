import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const stateSlots: unknown[] = [];
const refSlots: Array<{ current: unknown }> = [];
let stateIdx = 0;
let refIdx = 0;

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(init: T | (() => T)) => {
      const idx = stateIdx++;
      if (idx >= stateSlots.length) {
        stateSlots.push(typeof init === 'function' ? (init as () => T)() : init);
      }
      const setState = (u: T | ((prev: T) => T)) => {
        const prev = stateSlots[idx] as T;
        stateSlots[idx] = typeof u === 'function' ? (u as (p: T) => T)(prev) : u;
      };
      return [stateSlots[idx] as T, setState] as const;
    },
    useRef: <T,>(init: T) => {
      const idx = refIdx++;
      if (idx >= refSlots.length) {
        refSlots.push({ current: init });
      }
      return refSlots[idx] as { current: T };
    },
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useEffect: () => {},
  };
});

import { useKioskVanPayment } from '../useKioskVanPayment';
import { kioskVanClient } from '../../services/van/van_client';

describe('Wave 3 (20261117) Kiosk Hooks VAN Amount & Cancel-Reentry Race Audit', () => {
  beforeEach(() => {
    stateSlots.length = 0;
    refSlots.length = 0;
    stateIdx = 0;
    refIdx = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useKioskVanPayment: 0원/음수/NaN 결제 금액 시 단말기 요청 없이 E_INVALID_AMOUNT를 반환한다', async () => {
    const reqSpy = vi.spyOn(kioskVanClient, 'requestCardPayment');
    const hook = useKioskVanPayment();

    const rZero = await hook.startPayment({ amount: 0 });
    const rNeg = await hook.startPayment({ amount: -1000 });
    const rNan = await hook.startPayment({ amount: Number.NaN });

    expect(rZero.success).toBe(false);
    expect(rZero.error_code).toBe('E_INVALID_AMOUNT');
    expect(rNeg.error_code).toBe('E_INVALID_AMOUNT');
    expect(rNan.error_code).toBe('E_INVALID_AMOUNT');
    expect(reqSpy).not.toHaveBeenCalled();
  });
});
