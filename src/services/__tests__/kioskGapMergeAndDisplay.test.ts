import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getKioskSettings, saveKioskSettings, DEFAULT_KIOSK_SETTINGS } from '../../stores/kioskSettings';
import type { Bay } from '../api';
import { TimeMaster } from '../../utils/timeMaster';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).localStorage = mockLocalStorage;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { search: '', pathname: '/', hostname: '127.0.0.1', port: '5179', origin: 'http://127.0.0.1:5179' },
  };
}

const MS_PER_MINUTE = 60 * 1000;

describe('Kiosk Smart Gap Merge, 2-Line Tile Display & Truncate Guard QA', () => {
  let api: typeof import('../api').api;
  let TeeboxTileCard: typeof import('../../components/TeeboxTileCard').TeeboxTileCard;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const tileMod = await import('../../components/TeeboxTileCard');
    TeeboxTileCard = tileMod.TeeboxTileCard;
  });

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('G01: kioskSettings minGapMinutes 기본값(60분) 및 기기 설정 변경 시 x-kiosk-min-gap 헤더가 자동 주입된다', () => {
    expect(DEFAULT_KIOSK_SETTINGS.minGapMinutes).toBe(60);
    const initial = getKioskSettings();
    expect(initial.minGapMinutes).toBe(60);
    expect(api.getSecureHeaders()['x-kiosk-min-gap']).toBe('60');

    saveKioskSettings({ minGapMinutes: 90 });
    const updated = getKioskSettings();
    expect(updated.minGapMinutes).toBe(90);
    expect(api.getSecureHeaders()['x-kiosk-min-gap']).toBe('90');
  });

  it('G02: TimeMaster.getTotalWaitMinutes 및 formatAvailableFromTime이 병합된 대기시간/빈타석 예정 시각을 100% 일치시킨다', () => {
    const baseMs = new Date('2026-10-20T13:00:00+09:00').getTime();
    TimeMaster.syncServerTime(baseMs);

    // 13:20 종료 타석 + 20분 틈새 + 13:40~14:40 후속 예약 -> 14:40 빈타석 예정 (100분 대기)
    const mergedBay: Bay = {
      bay_id: 1,
      bay_no: 5,
      floor_no: 1,
      type: 'RIGHT',
      status: 'OCCUPIED',
      end_time: '13:20',
      end_epoch_ms: baseMs + 20 * MS_PER_MINUTE,
      minutes_left: 20,
      waiting_res_count: 1,
      waiting_res_total_min: 80,
      total_wait_minutes: 100,
      available_from_time: '14:40',
      available_from_epoch_ms: baseMs + 100 * MS_PER_MINUTE,
      next_res_start_time: '13:40',
    };

    expect(TimeMaster.getTotalWaitMinutes(mergedBay, baseMs)).toBe(100);
    expect(TimeMaster.formatAvailableFromTime(mergedBay)).toBe('14:40');
  });

  it('G03: TeeboxTileCard 렌더링 시 3번째 줄 "대기예약 (HH:mm)" 문구가 제거되고 2줄(남은 시간 + 빈타석 예정 시각)만 명확히 표시된다', () => {
    const baseMs = new Date('2026-10-20T13:00:00+09:00').getTime();
    TimeMaster.syncServerTime(baseMs);

    const occupiedBay: Bay = {
      bay_id: 2,
      bay_no: 7,
      floor_no: 1,
      type: 'RIGHT',
      status: 'OCCUPIED',
      end_time: '13:20',
      minutes_left: 20,
      waiting_res_count: 2,
      waiting_res_total_min: 80,
      total_wait_minutes: 100,
      available_from_time: '14:40',
      next_res_start_time: '13:40',
    };

    const html = renderToStaticMarkup(
      React.createElement(TeeboxTileCard, {
        bay: occupiedBay,
        isSelected: false,
        onSelect: () => {},
        lang: 'KO',
      })
    );

    expect(html).toContain('100분 남음');
    expect(html).toContain('14:40 빈타석 예정');
    expect(html).not.toContain('대기예약');
  });

  it('G04: 중간 빈타석(60분 가용)에 90분 이용권 배정 요청 시 NEXT_RESERVATION_LIMIT 단축 확인 프롬프트를 반환한다', async () => {
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (!body.accept_closing_truncate && body.duration_min === 90) {
        return new Response(
          JSON.stringify({
            detail: JSON.stringify({
              code: 'CLOSING_TRUNCATE_PROMPT',
              reason: 'NEXT_RESERVATION_LIMIT',
              max_available_min: 60,
              total_gap_min: 63,
              prepare_min: 3,
              close_time: '14:23',
              message: '선택하신 타석은 다음 예약(14:23)으로 인해 최대 60분까지만 이용 가능합니다. 60분으로 단축하여 배정을 진행하시겠습니까?',
            }),
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          res_id: 'RES-TRUNC-60',
          duration_min: 60,
          start_time: '13:20',
          end_time: '14:23',
          hardware_success: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const firstRes = await api.allocateBay(
      8,
      90,
      'M1001',
      '김회원',
      '010-1234-5678',
      101,
      'TICKET',
      0,
      undefined,
      undefined,
      undefined,
      { acceptClosingTruncate: false }
    );

    expect(firstRes.success).toBe(false);
    expect(firstRes.closingPrompt).toBeDefined();
    expect(firstRes.closingPrompt?.code).toBe('CLOSING_TRUNCATE_PROMPT');
    expect(firstRes.closingPrompt?.reason).toBe('NEXT_RESERVATION_LIMIT');
    expect(firstRes.closingPrompt?.max_available_min).toBe(60);
    expect(firstRes.closingPrompt?.close_time).toBe('14:23');

    const secondRes = await api.allocateBay(
      8,
      firstRes.closingPrompt!.max_available_min,
      'M1001',
      '김회원',
      '010-1234-5678',
      101,
      'TICKET',
      0,
      undefined,
      undefined,
      undefined,
      { acceptClosingTruncate: true }
    );

    expect(secondRes.success).toBe(true);
    expect((secondRes as any).duration_min).toBe(60);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('G05: ProductShop에 maxAssignableMin(60분) 전달 시 60분 일일권은 활성화되고 90분 일일권은 비활성화(선택 불가) 처리된다', async () => {
    const { ProductShop } = await import('../../components/ProductShop');
    const html = renderToStaticMarkup(
      React.createElement(ProductShop, {
        purposeType: 'ALLOCATE_DAILY',
        maxAssignableMin: 60,
        nextLimitResStartTime: '15:00',
        initialProducts: [
          {
            prod_cd: 'DAILY_60',
            prod_nm: '일일 타석권 60분',
            logic_type: 'DAILY',
            duration_min: 60,
            standard_price: 20000,
            sale_price: 20000,
          } as any,
          {
            prod_cd: 'DAILY_90',
            prod_nm: '일일 타석권 90분',
            logic_type: 'DAILY',
            duration_min: 90,
            standard_price: 28000,
            sale_price: 28000,
          } as any,
        ],
        onProductSelected: () => {},
        onCancel: () => {},
      })
    );

    expect(html).toContain('선택하신 타석은 다음 예약(15:00) 전까지 최대 [60분] 이용 가능합니다.');
    expect(html).toContain('data-testid="product-card-DAILY_60" data-duration="60" data-disabled="false"');
    expect(html).toContain('20,000원 선택 및 결제');
    expect(html).toContain('data-testid="product-card-DAILY_90" data-duration="90" data-disabled="true"');
    expect(html).toContain('⚠️ 최대 60분 가능 (초과)');
    expect(html).toContain('다음 예약(15:00)으로 선택 불가 (최대 60분)');
  });
});
