import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { TimeMaster } from '../../utils/timeMaster';
import {
  applyQrCouponOnlyMemberFilter,
  isPeriodMembershipAsset,
  type Member,
} from '../api';
import { isQrDisallowedForPurpose } from '../../stores/kioskSettings';

const storageMap = new Map<string, string>();
const memoryStorage: Storage = {
  get length(): number {
    return storageMap.size;
  },
  clear: (): void => {
    storageMap.clear();
  },
  getItem: (key: string): string | null => (storageMap.has(key) ? storageMap.get(key) ?? null : null),
  key: (index: number): string | null => Array.from(storageMap.keys())[index] ?? null,
  removeItem: (key: string): void => {
    storageMap.delete(key);
  },
  setItem: (key: string, value: string): void => {
    storageMap.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

describe('Wave 3 Domain 1 — 키오스크 운영시간·선점 거절 사유·QR 쿠폰전용 경계값 심층 검증', () => {
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    storageMap.clear();
    vi.restoreAllMocks();
  });

  it('1. 압축 HHMM("0800"/"2115"), 초 포함("08:00:00"), 00:00~00:00, 영문 익일 마감 안내 문구 경계값을 정확히 처리한다', () => {
    const dawn0330 = new Date('2026-11-13T03:30:00+09:00');
    const open0800 = new Date('2026-11-13T08:00:00+09:00');
    const close2115 = new Date('2026-11-13T21:15:00+09:00');

    expect(TimeMaster.evaluateStoreOperatingWindow('0800', '2115', open0800)).toEqual({
      isOpen: true,
      phase: 'OPEN',
      currentHhmm: '08:00',
      rangeLabel: '08:00 ~ 21:15',
    });
    expect(TimeMaster.evaluateStoreOperatingWindow('08:00:00', '21:15:00', close2115).phase).toBe(
      'AFTER_CLOSE'
    );
    expect(TimeMaster.evaluateStoreOperatingWindow('00:00', '00:00', dawn0330).isOpen).toBe(true);
    expect(TimeMaster.evaluateStoreOperatingWindow('24:00', '24:00', dawn0330).isOpen).toBe(true);

    const overnightClosed = TimeMaster.evaluateStoreOperatingWindow('06:00', '02:00', dawn0330);
    const enMsg = TimeMaster.buildOperatingHoursBlockMessage(overnightClosed, 'Seat Selection', 'EN');
    expect(enMsg.title).toBe('Outside Operating Hours');
    expect(enMsg.message).toContain('06:00 ~ next day 02:00');
    expect(enMsg.message).not.toContain('익일');

    // 한국어 받침 유무에 따른 목적격 조사(을/를) 경계값
    const koBatchim = TimeMaster.buildOperatingHoursBlockMessage(overnightClosed, '예약 체크인', 'KO');
    const koNoBatchim = TimeMaster.buildOperatingHoursBlockMessage(overnightClosed, '회원권 구매', 'KO');
    expect(koBatchim.message).toContain('예약 체크인을');
    expect(koNoBatchim.message).toContain('회원권 구매를');
  });

  it('2. preoccupy 중첩 에러 스키마(detail.detail, detail[0].msg, error.message)를 원문 보존하고 존칭 경합 문구는 fallback 처리한다', async () => {
    // 2-1) FastAPI 중첩 객체 { detail: { code, detail } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: {
            code: 'ERR_BAY_MAINTENANCE',
            detail: '해당 타석은 현재 오토티업기 점검 중입니다.',
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );
    expect(await api.preoccupyBay(4)).toBe(false);
    expect(api.resolvePreoccupyFailureMessage('기본 안내', 'Fallback EN', 'KO')).toBe(
      '해당 타석은 현재 오토티업기 점검 중입니다.'
    );

    // 2-2) 422 배열 검증 에러 { detail: [{ msg }] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: [{ loc: ['body', 'bay_nos'], msg: '유효하지 않은 타석 번호입니다.' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    );
    expect(await api.preoccupyBay(99)).toBe(false);
    expect(api.resolvePreoccupyFailureMessage('기본 안내', 'Fallback EN', 'KO')).toBe(
      '유효하지 않은 타석 번호입니다.'
    );

    // 2-3) 존칭 경합('고객님께서') + EN 언어 모드 시 EN fallback 반환
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: '이미 다른 고객님께서 선택 중인 타석입니다.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );
    expect(await api.preoccupyBay(2)).toBe(false);
    expect(api.resolvePreoccupyFailureMessage('기본 안내', 'Already selected by another guest.', 'EN')).toBe(
      'Already selected by another guest.'
    );
  });

  it('3. QR 쿠폰 전용 필터는 횟수제 상품이 PERIOD로 잘못 태깅된 경우에도 쿠폰으로 보존하고, 비허용 목적의 QR을 차단한다', () => {
    expect(isQrDisallowedForPurpose('EXTEND_LOCKER')).toBe(true);
    expect(isQrDisallowedForPurpose('PURCHASE_PRODUCT')).toBe(true);
    expect(isQrDisallowedForPurpose('ALLOCATE_DAILY')).toBe(true);
    expect(isQrDisallowedForPurpose('ALLOCATE_MEMBER')).toBe(false);

    const disguisedCountCoupon = {
      item_id: 701,
      product_id: 'CPN-10',
      product_nm: '10회 타석 쿠폰',
      sub_type: 'PERIOD',
      total_count: 10,
      remain_cnt: 7,
      status: 'ACTIVE',
    };
    const purePeriodPass = {
      item_id: 702,
      product_id: 'MEM-3M',
      product_nm: '종일 3개월 정기권',
      sub_type: 'PERIOD',
      total_count: 0,
      remain_cnt: 0,
      end_dt: '2026-12-31',
      status: 'ACTIVE',
    };
    expect(isPeriodMembershipAsset(disguisedCountCoupon as never)).toBe(false);
    expect(isPeriodMembershipAsset(purePeriodPass as never)).toBe(true);

    const rawMember = {
      member_no: 'M700',
      member_name: '박검증',
      hp: '010-1234-5678',
      total_point: 15000,
      discount_rate: 10,
      auth_channel: 'QR',
      assets: [disguisedCountCoupon as never, purePeriodPass as never],
    } as unknown as Member;

    const filtered = applyQrCouponOnlyMemberFilter(rawMember, 'QR', true);
    expect(filtered.total_point).toBe(0);
    expect(filtered.discount_rate).toBe(0);
    expect(filtered.qr_restricted_period_count).toBe(1);
    expect(filtered.assets).toHaveLength(1);
    expect(filtered.assets?.[0]?.item_id).toBe(701);
  });
});
