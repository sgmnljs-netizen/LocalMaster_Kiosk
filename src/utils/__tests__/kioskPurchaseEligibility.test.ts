import { describe, expect, it } from 'vitest';
import {
  canAllocatePracticeBayImmediately,
  evaluateLockerRenewalWindow,
  extractProductAllowedCategories,
  isKioskChannelProduct,
  isKioskLockerExtensionProduct,
  resolveLockerExtendDays,
} from '../kioskPurchaseEligibility';

describe('isKioskChannelProduct (P0 sales_channels & display_channel SSOT)', () => {
  it('blocks soft-deleted or inactive products', () => {
    expect(isKioskChannelProduct(null)).toBe(false);
    expect(
      isKioskChannelProduct({
        use_yn: 'Y',
        deleted_at: 1710000000,
        meta_data: { sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);
    expect(
      isKioskChannelProduct({
        use_yn: 'N',
        deleted_at: 0,
        meta_data: { sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);
  });

  it('respects meta_data.sales_channels array and comma-separated string', () => {
    expect(
      isKioskChannelProduct({
        meta_data: { sales_channels: ['POS', 'MOBILE'] },
      })
    ).toBe(false);
    expect(
      isKioskChannelProduct({
        meta_data: '{"sales_channels": "POS, MOBILE"}',
      })
    ).toBe(false);
    expect(
      isKioskChannelProduct({
        meta_data: { sales_channels: ['POS', 'KIOSK'] },
        access_rules: { display_channel: ['POS'] },
      })
    ).toBe(true);
  });

  it('falls back to access_rules.display_channel when meta_data.sales_channels is absent', () => {
    expect(
      isKioskChannelProduct({
        meta_data: {},
        access_rules: { display_channel: ['POS'] },
      })
    ).toBe(false);
    expect(
      isKioskChannelProduct({
        meta_data: {},
        access_rules: { display_channel: ['POS', 'KIOSK'] },
      })
    ).toBe(true);
  });

  it('treats Admin UI metadata without sales_channels as POS-only (matching Admin UI default)', () => {
    expect(
      isKioskChannelProduct({
        meta_data: { pos_button: { color: '#3b82f6' }, short_nm: '쿠폰10회' },
        access_rules: {},
      })
    ).toBe(false);
  });

  it('allows plain test/legacy products with no channel metadata', () => {
    expect(isKioskChannelProduct({ use_yn: 'Y' })).toBe(true);
  });

  it('blocks open-price (is_price_open=true), out-of-stock (is_stock_managed), and closed group lessons (OPT-2 / OPT-3)', () => {
    expect(
      isKioskChannelProduct({
        use_yn: 'Y',
        meta_data: { sales_channels: ['POS', 'KIOSK'], is_price_open: true },
      })
    ).toBe(false);

    expect(
      isKioskChannelProduct({
        use_yn: 'Y',
        is_stock_managed: true,
        is_bundle: false,
        current_stock: 0,
        meta_data: { sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskChannelProduct({
        use_yn: 'Y',
        logic_type: 'LESSON',
        group_status: 'CLOSED',
        meta_data: { sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);
  });
});

describe('canAllocatePracticeBayImmediately', () => {
  it('allows active practice bay membership starting today', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'PERIOD',
          productName: '타석 정기권 1개월',
          startDate: '2026-11-05',
          allowedCategories: extractProductAllowedCategories({
            prod_nm: '타석 정기권 1개월',
            logic_type: 'PERIOD',
            access_rules: { allowed_zones: ['ZONE_1F'] },
          }),
        },
        '20261105'
      )
    ).toBe(true);
  });

  it('allows COMPLEX bundle containing practice bay asset and blocks locker-only or retail/future-dated items (BUG-M5)', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          itemId: 101,
          logicType: 'COMPLEX',
          productName: 'VIP 타석+레슨 패키지',
          startDate: '2026-11-05',
          bundleSummary: ['타석 3개월권', '개인레슨 10회'],
        },
        '20261105'
      )
    ).toBe(true);

    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          itemId: null,
          logicType: 'COMPLEX',
          productName: '물품 패키지',
          startDate: '2026-11-05',
        },
        '20261105'
      )
    ).toBe(false);

    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'PERIOD',
          productName: '타석 정기권 1개월 (연장)',
          startDate: '2026-12-01',
        },
        '20261105'
      )
    ).toBe(false);
  });
});

describe('P1-3 Kiosk Locker Extension Eligibility & Early Renewal Window', () => {
  it('excludes PARKING, STORAGE, DEPOSIT, and is_deposit RENTAL products while preserving legacy LOCKER products', () => {
    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-LOCKER-1M',
        prod_nm: '라카 1개월',
        logic_type: 'RENTAL',
        meta_data: null,
      })
    ).toBe(true);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-LOCKER-3M',
        prod_nm: '사물함 3개월',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'LOCKER', sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(true);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-PARK-1M',
        prod_nm: '정기 주차권 1개월',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'PARKING', sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-STOR-1M',
        prod_nm: '골프백 보관함 1개월',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'STORAGE', sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-DEP-01',
        prod_nm: '라카 보증금',
        logic_type: 'RENTAL',
        meta_data: { is_deposit: true, sales_channels: ['POS', 'KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'RNT-LEGACY-PARK',
        prod_nm: '월 정기주차 등록권',
        logic_type: 'RENTAL',
        meta_data: null,
      })
    ).toBe(false);
  });

  it('resolves locker extension days from days or access_rules.period_count/period_type fallback', () => {
    expect(resolveLockerExtendDays({ days: 90 })).toBe(90);
    expect(
      resolveLockerExtendDays({
        days: null,
        access_rules: { period_type: 'MONTH', period_count: 3 },
      })
    ).toBe(90);
    expect(
      resolveLockerExtendDays({
        days: 0,
        access_rules: '{"period_type":"DAY","period_count":45}',
      })
    ).toBe(45);
    expect(resolveLockerExtendDays({})).toBe(30);
  });

  it('evaluates early renewal window (access_rules.renewal_available_days) for active and expired lockers', () => {
    const prodWith15DayWindow = {
      prod_cd: 'LC-1M',
      prod_nm: '라카 1개월 연장',
      access_rules: { renewal_available_days: 15 },
    };

    // D-25 (> 15): blocked with badge and reason message
    const d25 = evaluateLockerRenewalWindow(prodWith15DayWindow, 25, 'ko');
    expect(d25.canRenewNow).toBe(false);
    expect(d25.renewalAvailableDays).toBe(15);
    expect(d25.badgeText).toContain('만료 15일 전부터 연장 가능');
    expect(d25.reasonMessage).toContain('잔여: 25일');

    // D-5 (<= 15): allowed
    const d5 = evaluateLockerRenewalWindow(prodWith15DayWindow, 5, 'ko');
    expect(d5.canRenewNow).toBe(true);
    expect(d5.renewalAvailableDays).toBe(15);
    expect(d5.badgeText).toBeNull();

    // Expired in grace period (D-(-2)): allowed
    const expiredGrace = evaluateLockerRenewalWindow(prodWith15DayWindow, -2, 'ko');
    expect(expiredGrace.canRenewNow).toBe(true);
  });
});
