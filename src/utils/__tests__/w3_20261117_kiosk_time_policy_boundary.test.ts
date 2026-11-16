import { describe, expect, it } from 'vitest';
import {
  buildBayAllocationPreview,
  DEFAULT_BAY_PREPARE_TIME_MIN,
  INTER_RESERVATION_GAP_MIN,
  TimeMaster,
} from '../timeMaster';
import type { BayMaster } from '../../types';

describe('Wave 3 (20261117) Kiosk TimeMaster 11/16 3m(0m preserved)/+1m Queue Boundary Audit', () => {
  it('DEFAULT_BAY_PREPARE_TIME_MIN=3, INTER_RESERVATION_GAP_MIN=1 상수 및 prepareMin=0 보존을 검증한다', () => {
    expect(DEFAULT_BAY_PREPARE_TIME_MIN).toBe(3);
    expect(INTER_RESERVATION_GAP_MIN).toBe(1);

    const refNow = TimeMaster.parseIsoAsKstDate('2026-11-17T14:00:00+09:00');
    const preview = buildBayAllocationPreview({
      bay: { bay_no: 1, status: 'AVAILABLE' } as BayMaster,
      durationMin: 60,
      prepareMin: 0,
      now: refNow,
    });
    expect(preview.prepareMin).toBe(0);
    expect(preview.startHhmm).toBe('14:00');
    expect(preview.endHhmm).toBe('15:00');
  });

  it('max_assignable_min=0 및 마감 임박(closeAvailMin=0) 시 무제한(60분) 누락 없이 0분 단축(isTruncated=true)으로 계산한다', () => {
    const refNow = TimeMaster.parseIsoAsKstDate('2026-11-17T14:00:00+09:00');

    const zeroNextRes = buildBayAllocationPreview({
      bay: {
        bay_no: 2,
        status: 'AVAILABLE',
        max_assignable_min: 0,
        next_limit_res_start_time: '14:02',
      } as BayMaster,
      durationMin: 60,
      prepareMin: 3,
      now: refNow,
    });
    expect(zeroNextRes.effectiveDurationMin).toBe(0);
    expect(zeroNextRes.isTruncated).toBe(true);
    expect(zeroNextRes.truncateReason).toBe('NEXT_RESERVATION');
    expect(zeroNextRes.endHhmm).toBeNull();

    const nearClose = buildBayAllocationPreview({
      bay: { bay_no: 3, status: 'AVAILABLE' } as BayMaster,
      durationMin: 60,
      prepareMin: 3,
      storeOpenTime: '06:00',
      storeCloseTime: '14:02',
      isStore24h: false,
      now: refNow,
    });
    expect(nearClose.effectiveDurationMin).toBe(0);
    expect(nearClose.isTruncated).toBe(true);
    expect(nearClose.truncateReason).toBe('STORE_CLOSE');
    expect(nearClose.endHhmm).toBeNull();
  });

  it('NaN inter_gap_min 방어 및 BAY(+1m) vs TIME_SLOT(0m) 줄서기 시작시각 정합성을 검증한다', () => {
    const bayNanGap = {
      bay_no: 4,
      status: 'OCCUPIED',
      available_from_time: '14:20',
      inter_gap_min: Number.NaN,
    } as unknown as BayMaster;
    expect(TimeMaster.formatNextQueueStartTime(bayNanGap)).toBe('14:21');

    const par3Bay = {
      bay_no: 1001,
      facility_type: 'PAR3',
      booking_mode: 'TIME_SLOT',
      status: 'OCCUPIED',
      available_from_time: '14:20',
      inter_gap_min: 1,
    } as unknown as BayMaster;
    expect(TimeMaster.formatNextQueueStartTime(par3Bay)).toBe('14:20');
  });
});
