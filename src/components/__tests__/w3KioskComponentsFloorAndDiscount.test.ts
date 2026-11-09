import { describe, it, expect } from 'vitest';
import { computeKioskDiscountBreakdown } from '../PaymentTerminal';
import { formatFloorDisplayLabel, normalizeFloorZoneToken, parseNullableFloorNumber } from '../../utils/floorUtils';
import type { KioskCouponItem } from '../../services/api';

describe('[W3-KSK-components] 지하층 표시 정규화 및 결제 터미널 음수·과다 할인 방어 검증', () => {
  it('지하층(-1, B1, 지하1층)을 -1층/1층으로 오표기하지 않고 B1F로 정규화한다', () => {
    expect(parseNullableFloorNumber(-1)).toBe(-1);
    expect(parseNullableFloorNumber('지하1층')).toBe(-1);
    expect(normalizeFloorZoneToken(-1)).toBe('B1F');
    expect(formatFloorDisplayLabel(-1)).toBe('B1F');
    expect(formatFloorDisplayLabel('B1')).toBe('B1F');
  });

  it('computeKioskDiscountBreakdown은 음수/NaN 쿠폰 혜택값이나 100% 초과 할인율에도 결제금액이 원가를 초과하거나 음수가 되지 않도록 방어한다', () => {
    const negativeCoupon = {
      coupon_no: 'CPN-NEG',
      coupon_nm: '비정상 음수 쿠폰',
      benefit_type: 'AMOUNT',
      benefit_val: -5000,
    } as unknown as KioskCouponItem;

    const negResult = computeKioskDiscountBreakdown({
      amount: 20000,
      discountRate: -15,
      appliedCoupon: negativeCoupon,
    });
    expect(negResult.gradeDiscountAmt).toBe(0);
    expect(negResult.couponDiscountAmt).toBe(0);
    expect(negResult.targetPayAmt).toBe(20000);

    const overCapCoupon = {
      coupon_no: 'CPN-OVER',
      coupon_nm: '과다 할인율 쿠폰',
      benefit_type: 'RATE',
      benefit_val: 150,
    } as unknown as KioskCouponItem;

    const overResult = computeKioskDiscountBreakdown({
      amount: 20000,
      discountRate: 30,
      appliedCoupon: overCapCoupon,
    });
    expect(overResult.gradeDiscountAmt).toBe(6000);
    expect(overResult.couponDiscountAmt).toBe(14000);
    expect(overResult.targetPayAmt).toBe(0);
  });
});
