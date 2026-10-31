import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Bay, Product } from '../api';
import {
  buildKioskProductSpecSummary,
  evaluateDailyPassEligibility,
} from '../../utils/kioskProductSpecSummary';

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
    navigator: { userAgent: 'Vitest', platform: 'MacIntel', webdriver: true },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { search: '', pathname: '/', hostname: '127.0.0.1', port: '5179', origin: 'http://127.0.0.1:5179' },
  };
} else if (!(globalThis as any).window.navigator) {
  (globalThis as any).window.navigator = { userAgent: 'Vitest', platform: 'MacIntel', webdriver: true };
}

describe('Kiosk Product Options & Restrictions Smart Display (Exception-Only)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('OPT-01: 무제한(올패스) 기본 정기권·쿠폰권·일일권은 예외 제한 칩이 0개(빈 배열)로 반환되어 카드가 깔끔하게 유지된다', () => {
    const standardPeriod: Product = {
      prod_cd: 'MEM_ALL_90',
      prod_nm: '정기 회원권 3개월',
      logic_type: 'PERIOD',
      days: 90,
      duration_min: 70,
      standard_price: 450000,
      sale_price: 450000,
      access_rules: {
        allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        time_slots: '00:00~23:59',
        allowed_zones: ['1F', '2F'],
        allowed_scheduler_categories: ['BAY'],
      },
    };

    const summary = buildKioskProductSpecSummary(standardPeriod, {
      allStoreFloors: ['1F', '2F'],
    });
    expect(summary.restrictionChips).toEqual([]);
    expect(summary.benefitTokens.some((t) => t.label.includes('전일·종일 자유 이용'))).toBe(true);
    expect(summary.checkoutSummaryLine).toBe('유효기간 90일 · 1회 70분');

    const standardCoupon: Product = {
      prod_cd: 'CPN_10',
      prod_nm: '타석 쿠폰 10회권',
      logic_type: 'COUNT',
      total_count: 10,
      days: 180,
      duration_min: 60,
      standard_price: 180000,
      sale_price: 180000,
    };
    const couponSummary = buildKioskProductSpecSummary(standardCoupon);
    expect(couponSummary.restrictionChips).toEqual([]);
    expect(couponSummary.checkoutSummaryLine).toBe('총 10회 · 유효기간 180일 · 1회 60분');
  });

  it('OPT-02: 요일·시간대·1일 횟수·특정 층 제한이 설정된 정기권은 허위 "무제한" 문구가 제거되고 해당 제한 칩만 유동 표시된다', () => {
    const weekdayDaytimePeriod: Product = {
      prod_cd: 'MEM_WK_DAY',
      prod_nm: '평일 주간 회원권 1개월',
      logic_type: 'PERIOD',
      days: 30,
      duration_min: 60,
      standard_price: 220000,
      sale_price: 190000,
      target_gender: 'FEMALE',
      access_rules: {
        weekly_schedule: {
          mon: '06:00-17:00',
          tue: '06:00-17:00',
          wed: '06:00-17:00',
          thu: '06:00-17:00',
          fri: '06:00-17:00',
        },
        holiday_schedule: 'CLOSED',
        daily_limit_count: 1,
        allowed_zones: ['1F'],
      },
    };

    const summary = buildKioskProductSpecSummary(weekdayDaytimePeriod, {
      allStoreFloors: ['1F', '2F'],
    });

    const chipLabels = summary.restrictionChips.map((c) => `${c.icon} ${c.label}`);
    expect(chipLabels).toEqual([
      '📆 평일 전용(공휴일 제외)',
      '⏰ 06:00~17:00',
      '🔄 1일 1회 제한',
      '📍 1F 전용',
    ]);
    // 허위 '무제한' 또는 '전일·종일 자유 이용' 문구가 절대 포함되지 않아야 함
    const allBenefitText = summary.benefitTokens
      .map((t) => `${t.label}${t.highlight ?? ''}${t.suffix ?? ''}`)
      .join(' ');
    expect(allBenefitText).not.toContain('무제한');
    expect(allBenefitText).not.toContain('전일·종일');

    expect(summary.checkoutSummaryLine).toBe(
      '유효기간 30일 · 1회 60분 · 여성 전용 · 평일(월~금·공휴일 제외) · 06:00~17:00 · 1일 1회 제한 · 1F 전용'
    );
  });

  it('OPT-03: COMPLEX 복합 패키지 상품은 하위 구성품(bundle_summary) 칩과 결제 요약 문구를 정확히 생성한다', () => {
    const bundleProd: Product = {
      prod_cd: 'PKG_VIP_01',
      prod_nm: 'VIP 올인원 패키지',
      logic_type: 'COMPLEX',
      days: 90,
      duration_min: 70,
      standard_price: 800000,
      sale_price: 720000,
      bundle_summary: ['정기권 3개월', '프로 레슨 10회'],
    };

    const summary = buildKioskProductSpecSummary(bundleProd);
    expect(summary.resolvedLogicType).toBe('COMPLEX');
    expect(summary.headerTypeBadge).toBe('PACKAGE PASS');
    expect(summary.restrictionChips).toEqual([
      {
        key: 'bundle',
        icon: '📦',
        label: '구성: 정기권 3개월 + 프로 레슨 10회',
        tone: 'emerald',
      },
    ]);
    expect(summary.checkoutSummaryLine).toBe('정기권 3개월 + 프로 레슨 10회 · 유효기간 90일');
  });

  it('OPT-04: ProductShop SSR — PURCHASE_PRODUCT(이용권 구매) 모드에서는 일요일 야간에도 평일 주간권을 사전 구매할 수 있도록 활성 유지하되 조건 칩을 표시한다', async () => {
    const { ProductShop } = await import('../../components/ProductShop');
    const sundayNightKst = new Date('2026-11-01T20:30:00+09:00'); // 일요일 20:30 KST

    const html = renderToStaticMarkup(
      React.createElement(ProductShop, {
        purposeType: 'PURCHASE_PRODUCT',
        nowOverride: sundayNightKst,
        allStoreFloors: ['1F', '2F'],
        initialProducts: [
          {
            prod_cd: 'MEM_ALL',
            prod_nm: '올패스 정기권 3개월',
            logic_type: 'PERIOD',
            days: 90,
            duration_min: 60,
            standard_price: 400000,
            sale_price: 400000,
          },
          {
            prod_cd: 'MEM_WK_AM',
            prod_nm: '평일 오전 회원권 1개월',
            logic_type: 'PERIOD',
            days: 30,
            duration_min: 60,
            standard_price: 180000,
            sale_price: 150000,
            is_usable_now: false,
            unusable_now_reason: '평일(월~금) 전용 상품입니다.',
            access_rules: {
              allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
              time_slots: '06:00~12:00',
              daily_limit_count: 1,
            },
          },
        ],
        onProductSelected: () => {},
        onCancel: () => {},
      })
    );

    // 1. 무제한 기본권은 restriction-chips 영역 자체가 렌더링되지 않음 (Exception-Only)
    expect(html).not.toContain('data-testid="product-restriction-chips-MEM_ALL"');
    expect(html).toContain('data-testid="product-card-MEM_ALL" data-duration="60" data-disabled="false"');

    // 2. 평일 오전권은 제한 칩이 표시되면서도 사전 구매는 정상 활성(data-disabled="false") 유지
    expect(html).toContain('data-testid="product-restriction-chips-MEM_WK_AM"');
    expect(html).toContain('평일 전용');
    expect(html).toContain('06:00~12:00');
    expect(html).toContain('1일 1회 제한');
    expect(html).toContain('data-testid="product-card-MEM_WK_AM" data-duration="60" data-disabled="false"');
    expect(html).not.toContain('무제한 · 결제 즉시 가동');
  });

  it('OPT-05: ProductShop SSR — ALLOCATE_DAILY(일일권 즉시 배정) 모드에서는 시간대 이탈·공휴일 제한·층 불일치 일일권을 VAN 진입 전 즉시 비활성화한다', async () => {
    const { ProductShop } = await import('../../components/ProductShop');
    const wednesdayNightKst = new Date('2026-10-28T19:30:00+09:00'); // 수요일 19:30 KST
    const selected2FBay: Bay = {
      bay_id: 21,
      bay_no: 21,
      floor_no: 2,
      floor: '2F',
      zone_code: 'BAY',
      type: 'RIGHT',
      status: 'AVAILABLE',
    };

    const html = renderToStaticMarkup(
      React.createElement(ProductShop, {
        purposeType: 'ALLOCATE_DAILY',
        selectedBay: selected2FBay,
        allStoreFloors: ['1F', '2F'],
        nowOverride: wednesdayNightKst,
        initialProducts: [
          {
            prod_cd: 'DAILY_MORNING',
            prod_nm: '조조 할인 일일권 60분',
            logic_type: 'DAILY',
            duration_min: 60,
            standard_price: 15000,
            sale_price: 12000,
            access_rules: {
              time_slots: '06:00~10:00',
            },
          },
          {
            prod_cd: 'DAILY_1F_ONLY',
            prod_nm: '1층 전용 일일권 60분',
            logic_type: 'DAILY',
            duration_min: 60,
            standard_price: 18000,
            sale_price: 18000,
            access_rules: {
              allowed_zones: ['1F'],
            },
          },
          {
            prod_cd: 'DAILY_NORMAL',
            prod_nm: '일반 일일권 60분',
            logic_type: 'DAILY',
            duration_min: 60,
            standard_price: 22000,
            sale_price: 22000,
          },
        ],
        onProductSelected: () => {},
        onCancel: () => {},
      })
    );

    // 조조권: 19:30이므로 비활성화
    expect(html).toContain('data-testid="product-card-DAILY_MORNING" data-duration="60" data-disabled="true"');
    expect(html).toContain('현재 이용 불가 (06:00~10:00)');

    // 1층 전용권: 2층 21번 타석 선택 중이므로 비활성화
    expect(html).toContain('data-testid="product-card-DAILY_1F_ONLY" data-duration="60" data-disabled="true"');
    expect(html).toContain('선택 타석 이용 불가 (1F 전용)');

    // 일반 일일권: 정상 선택 가능 + 불필요한 제한 칩 미노출
    expect(html).toContain('data-testid="product-card-DAILY_NORMAL" data-duration="60" data-disabled="false"');
    expect(html).not.toContain('data-testid="product-restriction-chips-DAILY_NORMAL"');

    // 법정 공휴일(PUBLIC_HOLIDAY) 평일 전용 일일권 차단 검증
    const holidayCheck = evaluateDailyPassEligibility(
      {
        prod_cd: 'DAILY_WK_ONLY',
        prod_nm: '평일 특가 일일권',
        logic_type: 'DAILY',
        duration_min: 60,
        standard_price: 16000,
        sale_price: 16000,
        today_day_type: 'PUBLIC_HOLIDAY',
        access_rules: {
          allowed_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        },
      },
      { now: new Date('2026-10-09T11:00:00+09:00') } // 금요일이지만 한글날(PUBLIC_HOLIDAY)
    );
    expect(holidayCheck.eligible).toBe(false);
    expect(holidayCheck.reasonCode).toBe('SCHEDULE_MISMATCH');
  });

  it('OPT-06: PaymentTerminal SSR — 고정 "정규 이용권" 문구 대신 동적 productSpecSummary가 주문 요약 영역에 렌더링된다', async () => {
    const { PaymentTerminal } = await import('../../components/PaymentTerminal');
    const html = renderToStaticMarkup(
      React.createElement(PaymentTerminal, {
        productName: '평일 주간 회원권 1개월',
        productSpecSummary: '유효기간 30일 · 1회 60분 · 평일(월~금) · 06:00~17:00 · 1일 1회 제한',
        amount: 190000,
        productCategory: 'PERIOD',
        memberName: '홍길동',
        memberNo: 'M001',
        onPaymentSuccess: () => {},
        onCancel: () => {},
      })
    );

    expect(html).toContain('data-testid="payment-product-spec-summary"');
    expect(html).toContain('유효기간 30일 · 1회 60분 · 평일(월~금) · 06:00~17:00 · 1일 1회 제한');
    expect(html).not.toContain('정규 이용권');
  });

  it('OPT-07: TIME(분 차감 시간권)·RETAIL(현장 물품)·exception_schedule(시간대별 우대 배정) 및 커스텀 zone_labels가 왜곡 없이 표출된다', async () => {
    const timePass: Product = {
      prod_cd: 'TM_600',
      prod_nm: '자유 시간권 600분',
      logic_type: 'TIME',
      total_count: 600,
      days: 90,
      duration_min: 60,
      standard_price: 200000,
      sale_price: 180000,
      zone_labels: { Z_LEFT: '1층 좌타존' },
      access_rules: {
        allowed_zones: ['Z_LEFT'],
        exception_schedule: [
          {
            days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
            start_time: '06:00',
            end_time: '16:00',
            duration_min: 80,
          },
        ],
      },
    };

    const timeSummary = buildKioskProductSpecSummary(timePass);
    expect(timeSummary.resolvedLogicType).toBe('TIME');
    expect(timeSummary.headerTypeBadge).toBe('TIME PASS');
    // TIME 상품의 total_count(600)가 '600회'가 아닌 '600분'으로 표출되는지 검증
    const benefitJoined = timeSummary.benefitTokens
      .map((t) => `${t.label}${t.highlight ?? ''}${t.suffix ?? ''}`)
      .join(' ');
    expect(benefitJoined).toContain('총 600분 제공');
    expect(benefitJoined).not.toContain('600회');
    expect(timeSummary.restrictionChips.map((c) => `${c.icon} ${c.label}`)).toEqual([
      '✨ 평일 06:00~16:00 80분 배정',
      '📍 1층 좌타존 전용',
    ]);
    expect(timeSummary.checkoutSummaryLine).toBe(
      '총 600분 · 유효기간 90일 · 1회 60분 · 평일 06:00~16:00 80분 배정 · 1층 좌타존 전용'
    );

    // RETAIL 물품 상품은 ProductShop에서 '1회 N분 배정' 배지를 숨기는지 검증
    const { ProductShop } = await import('../../components/ProductShop');
    const retailHtml = renderToStaticMarkup(
      React.createElement(ProductShop, {
        purposeType: 'PURCHASE_PRODUCT',
        initialProducts: [
          {
            prod_cd: 'GD_GLOVE',
            prod_nm: '투어 프로 양피 장갑',
            logic_type: 'GOODS',
            standard_price: 25000,
            sale_price: 22000,
          },
        ],
        onProductSelected: () => {},
        onCancel: () => {},
      })
    );
    expect(retailHtml).toContain('STORE ITEM');
    expect(retailHtml).toContain('매장 현장 구매 상품');
    expect(retailHtml).not.toContain('1회 60분 배정');
  });

  it('OPT-08: 자정 경과 및 오프라인 전일자 EdgeDB 캐시(evaluated_ymd 불일치)의 stale is_usable_now/today_day_type 오염을 차단한다', () => {
    const staleCachedWeekdayDaily: Product = {
      prod_cd: 'DAILY_WK_STALE',
      prod_nm: '평일 일일권 60분',
      logic_type: 'DAILY',
      duration_min: 60,
      standard_price: 18000,
      sale_price: 18000,
      // 전일(일요일 2026-11-01)에 캐싱된 값: 주말이라 불가로 평가되었음
      evaluated_ymd: '20261101',
      today_day_type: 'WEEKEND',
      is_usable_now: false,
      unusable_now_reason: '평일(월~금) 전용 상품입니다.',
      zone_labels: { Z_LEFT: '1층 좌타존' },
      access_rules: {
        allowed_days: ['weekday'],
        allowed_zones: ['Z_LEFT'],
      },
    };

    const mondayMorningKst = new Date('2026-11-02T09:30:00+09:00'); // 익일 월요일 09:30 KST
    const leftBay: Bay = {
      bay_id: 3,
      bay_no: 3,
      floor_no: 1,
      floor: '1F',
      zone_code: 'Z_LEFT',
      type: 'LEFT',
      status: 'AVAILABLE',
    };
    const rightBay: Bay = {
      bay_id: 4,
      bay_no: 4,
      floor_no: 1,
      floor: '1F',
      zone_code: 'Z_RIGHT',
      type: 'RIGHT',
      status: 'AVAILABLE',
    };

    // 1. 월요일 아침 + 일치 구역(Z_LEFT) 타석: 전일 캐시(WEEKEND/false)를 무시하고 정상 적격(eligible: true) 판정
    const mondayOk = evaluateDailyPassEligibility(staleCachedWeekdayDaily, {
      now: mondayMorningKst,
      selectedBay: leftBay,
    });
    expect(mondayOk.eligible).toBe(true);
    expect(mondayOk.reasonCode).toBe('OK');

    // 2. 불일치 구역(Z_RIGHT) 타석 선택 시: 코드('Z_LEFT') 대신 현장 명칭('1층 좌타존 전용')으로 안내
    const zoneBlocked = evaluateDailyPassEligibility(staleCachedWeekdayDaily, {
      now: mondayMorningKst,
      selectedBay: rightBay,
    });
    expect(zoneBlocked.eligible).toBe(false);
    expect(zoneBlocked.reasonCode).toBe('ZONE_MISMATCH');
    expect(zoneBlocked.badgeLabel).toBe('📍 1층 좌타존 전용');
  });
});
