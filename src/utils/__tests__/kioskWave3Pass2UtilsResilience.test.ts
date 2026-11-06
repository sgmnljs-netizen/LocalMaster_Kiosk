import { describe, expect, it } from 'vitest';
import {
  formatFloorDisplayLabel,
  normalizeFloorZoneToken,
  parseNullableFloorNumber,
} from '../floorUtils';
import { evaluateDailyPassEligibility } from '../kioskProductSpecSummary';
import {
  canAllocatePracticeBayImmediately,
  evaluateLockerRenewalWindow,
  isKioskChannelProduct,
  isKioskLockerExtensionProduct,
  resolveLockerExtendDays,
} from '../kioskPurchaseEligibility';
import type { Bay, Product } from '../../services/api';

describe('[Wave 3 Pass 2][Kiosk/Utils] 지하층(B1F/-1) 구역 호환성, 일일권 스케줄 판정 및 라카 연장 자격 심층 검증', () => {
  it('parseNullableFloorNumber 및 normalizeFloorZoneToken이 지하층(B1F/B1/-1/지하1층)과 비숫자 구역명을 정밀 구분한다', () => {
    expect(parseNullableFloorNumber('B1F')).toBe(-1);
    expect(parseNullableFloorNumber('b2')).toBe(-2);
    expect(parseNullableFloorNumber('지하1층')).toBe(-1);
    expect(parseNullableFloorNumber(-1)).toBe(-1);
    expect(parseNullableFloorNumber('2층')).toBe(2);
    expect(parseNullableFloorNumber('')).toBeNull();
    expect(parseNullableFloorNumber('VIP')).toBeNull();

    expect(normalizeFloorZoneToken(-1)).toBe('B1F');
    expect(normalizeFloorZoneToken('B1')).toBe('B1F');
    expect(normalizeFloorZoneToken('3층')).toBe('3F');
    expect(formatFloorDisplayLabel(-1)).toBe('B1F');
  });

  it('evaluateDailyPassEligibility는 B1/B1F/floor_no:-1 타석 호환성과 공휴일·휴무일·잔여시간 우선순위를 정확히 판정한다', () => {
    const b1DailyProd: Product = {
      prod_cd: 'PRD_DAILY_B1',
      prod_nm: '지하1층 일일 70분',
      logic_type: 'DAILY',
      duration_min: 70,
      sale_price: 20000,
      access_rules: { allowed_zones: ['B1'] },
    };

    const b1BayByNo: Bay = { bay_no: 101, status: 'AVAILABLE', floor_no: -1 };
    const f1Bay: Bay = { bay_no: 1, status: 'AVAILABLE', floor: '1F' };

    expect(evaluateDailyPassEligibility(b1DailyProd, { selectedBay: b1BayByNo }).eligible).toBe(true);
    expect(evaluateDailyPassEligibility(b1DailyProd, { selectedBay: f1Bay }).reasonCode).toBe('ZONE_MISMATCH');

    // maxAssignableMin 초과는 ZONE_MISMATCH보다 우선하여 DURATION_EXCEEDED를 반환해야 함
    expect(
      evaluateDailyPassEligibility(b1DailyProd, {
        selectedBay: f1Bay,
        maxAssignableMin: 45,
        nextLimitResStartTime: '20:00',
      }).reasonCode
    ).toBe('DURATION_EXCEEDED');

    // 매장 휴무일(STORE_CLOSED) 및 공휴일(PUBLIC_HOLIDAY) 평일 전용 상품 차단
    const holidayProd: Product = {
      prod_cd: 'PRD_WKDAY_ONLY',
      prod_nm: '평일 전용 일일권',
      logic_type: 'DAILY',
      duration_min: 70,
      sale_price: 18000,
      today_day_type: 'PUBLIC_HOLIDAY',
      evaluated_ymd: '2026-11-06',
      access_rules: { allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    };
    const kstFri = new Date('2026-11-06T13:00:00+09:00');
    expect(evaluateDailyPassEligibility(holidayProd, { now: kstFri }).reasonCode).toBe('SCHEDULE_MISMATCH');

    const closedProd: Product = {
      ...holidayProd,
      today_day_type: 'STORE_CLOSED',
    };
    expect(evaluateDailyPassEligibility(closedProd, { now: kstFri }).badgeLabel).toContain('휴무일');
  });

  it('kioskPurchaseEligibility는 키오스크 노출 채널, 주차/보증금 배제, 라카 연장 일수 및 D-N 갱신 제한을 정확히 검증한다', () => {
    expect(isKioskChannelProduct({ meta_data: { pos_button: true } })).toBe(false);
    expect(isKioskChannelProduct({ meta_data: { is_price_open: true, sales_channels: ['KIOSK'] } })).toBe(false);
    expect(isKioskChannelProduct({ is_stock_managed: true, current_stock: 0, meta_data: { sales_channels: ['KIOSK'] } })).toBe(false);
    expect(isKioskChannelProduct({ meta_data: { sales_channels: 'POS, KIOSK' } })).toBe(true);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT_PARK_01',
        prod_nm: '월정기 주차권',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'PARKING', sales_channels: ['KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'LC_90D',
        prod_nm: '개인 사물함 3개월',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'LOCKER', sales_channels: ['KIOSK'] },
        access_rules: { period_type: 'MONTH', period_count: 3 },
      })
    ).toBe(true);

    expect(resolveLockerExtendDays({ access_rules: { period_type: 'MONTH', period_count: 3 } })).toBe(90);

    const blockedKo = evaluateLockerRenewalWindow({ access_rules: { renewal_available_days: 7 } }, 15, 'KO');
    expect(blockedKo.canRenewNow).toBe(false);
    expect(blockedKo.badgeText).toContain('D-15');

    const blockedEn = evaluateLockerRenewalWindow({ access_rules: { renewal_available_days: 7 } }, 12, 'EN');
    expect(blockedEn.canRenewNow).toBe(false);
    expect(blockedEn.badgeText).toContain('Renewable within D-7');

    // 만료 경과(음수 잔여일) 라카는 즉시 연장 허용
    expect(evaluateLockerRenewalWindow({ access_rules: { renewal_available_days: 7 } }, -2, 'KO').canRenewNow).toBe(true);

    // 미래 개시일 정기권은 즉시 타석 배정 CTA 비노출
    expect(
      canAllocatePracticeBayImmediately(
        { purchaseType: 'MEMBERSHIP', memberNo: 'M001', logicType: 'PERIOD', startDate: '2026-11-10' },
        '2026-11-06'
      )
    ).toBe(false);
  });
});
