import { describe, expect, it } from 'vitest';
import type { Product } from '../../services/api';
import { evaluateDailyPassEligibility } from '../kioskProductSpecSummary';
import { TimeMaster } from '../timeMaster';

describe('[Wave 1][Kiosk/운영정책] 24시간 무제한 판정, 휴무일·영업시간 실시간 가드 및 is_usable_now 검증', () => {
  it('TimeMaster.getMinutesUntilClose는 24시간 영업(is24h 또는 00:00~23:59) 매장에서 23:30 심야 단축 오판을 발생시키지 않는다', () => {
    const kst2330 = new Date('2026-11-08T23:30:00+09:00');
    expect(TimeMaster.getMinutesUntilClose('23:59', kst2330, { is24h: true })).toBe(1440);
    expect(
      TimeMaster.getMinutesUntilClose('23:59', kst2330, { storeOpenTime: '00:00' })
    ).toBe(1440);
    expect(
      TimeMaster.getMinutesUntilClose('23:00', kst2330, { is24h: false, storeOpenTime: '06:00' })
    ).toBe(-30);
  });

  it('evaluateDailyPassEligibility는 실시간 매장 휴무일(isStoreClosed) 및 매장 영업시간 외(storeOpenTime~storeCloseTime)를 즉시 차단한다', () => {
    const baseDaily: Product = {
      prod_cd: 'DAILY_ALL_60',
      prod_nm: '일일 타석권 60분',
      logic_type: 'DAILY',
      duration_min: 60,
      standard_price: 20000,
      sale_price: 20000,
    };

    const closedRes = evaluateDailyPassEligibility(baseDaily, {
      now: new Date('2026-11-08T14:00:00+09:00'),
      isStoreClosed: true,
      storeClosedReason: '시설 정기 점검',
    });
    expect(closedRes.eligible).toBe(false);
    expect(closedRes.reasonCode).toBe('SCHEDULE_MISMATCH');
    expect(closedRes.modalMessage).toContain('시설 정기 점검');

    const beforeOpenRes = evaluateDailyPassEligibility(baseDaily, {
      now: new Date('2026-11-08T05:30:00+09:00'),
      storeOpenTime: '06:00',
      storeCloseTime: '23:00',
      isStore24h: false,
    });
    expect(beforeOpenRes.eligible).toBe(false);
    expect(beforeOpenRes.reasonCode).toBe('SCHEDULE_MISMATCH');
    expect(beforeOpenRes.badgeLabel).toContain('06:00~23:00');

    const in24hStoreRes = evaluateDailyPassEligibility(baseDaily, {
      now: new Date('2026-11-08T03:15:00+09:00'),
      storeOpenTime: '00:00',
      storeCloseTime: '23:59',
      isStore24h: true,
    });
    expect(in24hStoreRes.eligible).toBe(true);
  });
});
