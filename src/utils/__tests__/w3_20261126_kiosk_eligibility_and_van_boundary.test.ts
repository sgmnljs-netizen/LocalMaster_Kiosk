import { describe, expect, it } from 'vitest';
import {
  canAllocatePracticeBayImmediately,
  evaluateLockerRenewalWindow,
  isKioskLockerExtensionProduct,
  resolveLockerExtendDays,
} from '../kioskPurchaseEligibility';
import {
  sanitizeVanPort,
  sanitizeVanTimeoutSeconds,
} from '../../hooks/useKioskVanPayment';

describe('[W3-KSK-utils/hooks] 키오스크 상품 자격·라카 연장창 및 VAN 포트/타임아웃 경계 검증', () => {
  it('복합권(COMPLEX) 구매 시 라카/파3 전용 구성만 있으면 즉시 타석배정 CTA를 숨기고 타석권 포함 시 노출한다', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          itemId: 101,
          logicType: 'COMPLEX',
          productName: '올인원 패키지',
          startDate: '2026-11-26',
          bundleSummary: ['개인 라카 3개월', 'PAR3 5회'],
        },
        '20261126'
      )
    ).toBe(false);

    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          itemId: 102,
          logicType: 'COMPLEX',
          productName: '올인원 패키지',
          startDate: '2026-11-26',
          bundleSummary: ['종일 타석 3개월', '개인 라카 3개월'],
        },
        '20261126'
      )
    ).toBe(true);

    // 미래 개시일(연장 선구매) 상품은 당일 즉시 배정 차단
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          itemId: 103,
          logicType: 'PERIOD',
          productName: '종일 정기권',
          startDate: '2026-12-01',
        },
        '20261126'
      )
    ).toBe(false);
  });

  it('키오스크 사물함 연장 목록에서 주차권·보증금·자유가격 상품을 배제하고 연장일수/영문 배지를 정확히 계산한다', () => {
    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'PK_01',
        prod_nm: '월정기 주차권',
        logic_type: 'RENTAL',
        meta_data: { sub_type: 'PARKING', sales_channels: ['KIOSK'] },
      })
    ).toBe(false);

    expect(
      isKioskLockerExtensionProduct({
        prod_cd: 'LC_03',
        prod_nm: '개인 사물함 3개월',
        logic_type: 'RENTAL',
        meta_data: JSON.stringify({ sub_type: 'LOCKER', sales_channels: ['KIOSK'] }),
        access_rules: JSON.stringify({ period_type: 'MONTH', period_count: 3 }),
      })
    ).toBe(true);

    expect(
      resolveLockerExtendDays({
        days: 0,
        access_rules: { period_type: 'MONTH', period_count: 3 },
      })
    ).toBe(90);

    const blockedEn = evaluateLockerRenewalWindow(
      { access_rules: { renewal_available_days: '7' } },
      12,
      'en'
    );
    expect(blockedEn.canRenewNow).toBe(false);
    expect(blockedEn.badgeText).toContain('D-7');

    const overdueAllowed = evaluateLockerRenewalWindow(
      { access_rules: { renewal_available_days: 7 } },
      -3,
      'KO'
    );
    expect(overdueAllowed.canRenewNow).toBe(true);
  });

  it('VAN 로컬 포트(URL 형태 포함) 및 타임아웃 상한(180초)/비정상 입력 폴백을 방어한다', () => {
    expect(sanitizeVanPort('http://127.0.0.1:27098/', 9099)).toBe(27098);
    expect(sanitizeVanPort('65536', 9099)).toBe(9099);
    expect(sanitizeVanPort(true, 9099)).toBe(9099);

    expect(sanitizeVanTimeoutSeconds('45.8', 30)).toBe(45);
    expect(sanitizeVanTimeoutSeconds(999, 30)).toBe(180);
    expect(sanitizeVanTimeoutSeconds(0, 30)).toBe(30);
    expect(sanitizeVanTimeoutSeconds(false, 30)).toBe(30);
  });
});
