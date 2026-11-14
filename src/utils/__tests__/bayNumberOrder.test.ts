import { describe, it, expect, beforeEach } from 'vitest';
import {
  sortFloorsDescending,
  sortBaysByNumber,
  normalizeBayNumberOrder,
  extractBayNumberOrderFromMeta,
} from '../floorUtils';
import { getKioskSettings, saveKioskSettings } from '../../stores/kioskSettings';

const memoryStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, val: string) => {
    memoryStorage.set(key, String(val));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    configurable: true,
  });
}
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: storageMock,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  });
}

describe('Kiosk bayNumberOrder SSOT (군산대 S0531 등 층별 타석 가로 배열 정방향/역방향)', () => {
  beforeEach(() => {
    storageMock.clear();
  });

  it('K01: normalizeBayNumberOrder 및 extractBayNumberOrderFromMeta 정규화 검증', () => {
    expect(normalizeBayNumberOrder(undefined)).toBe('ASC');
    expect(normalizeBayNumberOrder('invalid')).toBe('ASC');
    expect(normalizeBayNumberOrder('desc')).toBe('DESC');
    expect(normalizeBayNumberOrder('DESC')).toBe('DESC');

    expect(extractBayNumberOrderFromMeta(null)).toBeUndefined();
    expect(
      extractBayNumberOrderFromMeta(
        JSON.stringify({ operation: { bay_number_order: 'DESC' } })
      )
    ).toBe('DESC');
    expect(
      extractBayNumberOrderFromMeta({
        operation: { bay_number_order: 'asc' },
      })
    ).toBe('ASC');
  });

  it('K02: 군산대학교(S0531, 3개 층 33타석) DESC 설정 시 층 순서는 3F➔2F➔1F 유지, 층 내 타석 가로 순서만 33➔23 / 22➔12 / 11➔1 역순 정렬된다', () => {
    const bays1F = Array.from({ length: 11 }, (_, idx) => ({ bay_no: idx + 1 }));
    const bays2F = Array.from({ length: 11 }, (_, idx) => ({ bay_no: idx + 12 }));
    const bays3F = Array.from({ length: 11 }, (_, idx) => ({ bay_no: idx + 23 }));

    expect(sortFloorsDescending(['1F', '2F', '3F'])).toEqual(['3F', '2F', '1F']);

    // 역방향(DESC): 좌->우 33~23, 22~12, 11~1
    expect(sortBaysByNumber(bays3F, 'DESC').map((b) => b.bay_no)).toEqual([
      33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23,
    ]);
    expect(sortBaysByNumber(bays2F, 'DESC').map((b) => b.bay_no)).toEqual([
      22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12,
    ]);
    expect(sortBaysByNumber(bays1F, 'DESC').map((b) => b.bay_no)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);

    // 원본 불변 및 기본값(ASC) 호환성 검증
    expect(bays1F.map((b) => b.bay_no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(sortBaysByNumber(bays1F).map((b) => b.bay_no)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('K03: kioskSettings 로컬 영속화에서 bayNumberOrder가 안전하게 저장·복원된다', () => {
    expect(getKioskSettings().bayNumberOrder).toBe('ASC');
    saveKioskSettings({ bayNumberOrder: 'DESC' }, { syncRemote: false });
    expect(getKioskSettings().bayNumberOrder).toBe('DESC');
  });
});
