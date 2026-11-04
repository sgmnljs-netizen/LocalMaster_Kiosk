import { describe, it, expect } from 'vitest';
import { evaluateBayHardwareState, isBayTrulyAvailableForKiosk } from '../bayStatusGuard';
import { sortFloorsDescending, sortFloorsAscending, sortBaysByNumber, formatFloorDisplayLabel } from '../floorUtils';
import type { Bay } from '../../services/api';

describe('evaluateBayHardwareState - Kiosk Hardware Error & Ball Shortage Guard', () => {
  const baseBay: Bay = {
    bay_id: 1,
    bay_no: 1,
    floor_no: 1,
    type: 'RIGHT',
    status: 'AVAILABLE',
    is_active: true,
  };

  it('B01: 정상 가동 타석은 isBlocked = false, isBallEmpty = false, isHwError = false 이다', () => {
    const res = evaluateBayHardwareState({
      ...baseBay,
      hardware_status: 'ONLINE',
      config_json: JSON.stringify({ has_error: false, status: 'normal', ball_box_detected: true, ball_box_status: 'NORMAL' }),
    });

    expect(res.isBlocked).toBe(false);
    expect(res.isBallEmpty).toBe(false);
    expect(res.isHwError).toBe(false);
  });

  it('B02: status 가 ERROR / MAINTENANCE / REPAIR 이거나 is_active = false 이면 차단된다', () => {
    const resError = evaluateBayHardwareState({ ...baseBay, status: 'ERROR' });
    expect(resError.isBlocked).toBe(true);
    expect(resError.shortLabel).toBe('점검중');

    const resInactive = evaluateBayHardwareState({ ...baseBay, is_active: false });
    expect(resInactive.isBlocked).toBe(true);

    const resMaint = evaluateBayHardwareState({ ...baseBay, status: 'MAINTENANCE' });
    expect(resMaint.isBlocked).toBe(true);
  });

  it('B03: hardware_status = ERROR 이면 타석 상태가 AVAILABLE이어도 차단된다', () => {
    const res = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      hardware_status: 'ERROR',
    });

    expect(res.isBlocked).toBe(true);
    expect(res.isHwError).toBe(true);
  });

  it('B04: config_json 내 has_error = true 또는 status = communication_error 이면 차단된다', () => {
    const resComm = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      config_json: JSON.stringify({ status: 'communication_error' }),
    });

    expect(resComm.isBlocked).toBe(true);
    expect(resComm.isHwError).toBe(true);
    expect(resComm.shortLabel).toBe('통신오류');

    const resHasErr = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      config_json: JSON.stringify({ has_error: true, error_code: 'E02', error_short_label: '모터과열' }),
    });

    expect(resHasErr.isBlocked).toBe(true);
    expect(resHasErr.isHwError).toBe(true);
    expect(resHasErr.shortLabel).toBe('모터과열');
  });

  it('B05: 볼박스 감지 실패(ball_box_detected = false 또는 EMPTY 또는 E01) 시 공부족으로 식별된다', () => {
    // Case 1: ball_box_detected === false
    const resDetectedFalse = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      ball_box_detected: false,
    });
    expect(resDetectedFalse.isBlocked).toBe(true);
    expect(resDetectedFalse.isBallEmpty).toBe(true);
    expect(resDetectedFalse.shortLabel).toBe('공부족');

    // Case 2: config_json 내 ball_box_status === 'EMPTY'
    const resConfigEmpty = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      config_json: JSON.stringify({ ball_box_status: 'EMPTY' }),
    });
    expect(resConfigEmpty.isBlocked).toBe(true);
    expect(resConfigEmpty.isBallEmpty).toBe(true);
    expect(resConfigEmpty.shortLabel).toBe('공부족');

    // Case 3: 줌테크 E01 (볼 공급 불량)
    const resE01 = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      config_json: JSON.stringify({ has_error: true, error_code: 'E01', error_short_label: '볼부족' }),
    });
    expect(resE01.isBlocked).toBe(true);
    expect(resE01.isBallEmpty).toBe(true);
    expect(resE01.shortLabel).toBe('공부족');
  });

  it('B06: 프런트포스와 1:1 동일하게 세로 층수 배치는 내림차순(3F ➔ 2F ➔ 1F ➔ B1F)이고 타석 번호는 오름차순으로 정렬되며 단일화된 층 라벨(1F/2F/3F)을 생성한다', () => {
    expect(sortFloorsDescending(['1F', '3F', '2F', 'B1F'])).toEqual(['3F', '2F', '1F', 'B1F']);
    expect(sortFloorsAscending(['3F', '1F', 'B1F', '2F'])).toEqual(['B1F', '1F', '2F', '3F']);
    expect(sortBaysByNumber([{ bay_no: 11 }, { bay_no: 2 }, { bay_no: 1 }]).map(b => b.bay_no)).toEqual([1, 2, 11]);
    expect(formatFloorDisplayLabel('1F')).toBe('1F');
    expect(formatFloorDisplayLabel('B1F')).toBe('B1F');
    expect(formatFloorDisplayLabel(2)).toBe('2F');
  });

  it('B07: isBayTrulyAvailableForKiosk 는 status가 AVAILABLE이어도 점검중(통신오류/공부족/ERROR)·레슨전용·일시정지 타석을 즉시 제외한다', () => {
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, status: 'AVAILABLE' })).toBe(true);
    expect(
      isBayTrulyAvailableForKiosk({
        ...baseBay,
        status: 'AVAILABLE',
        config_json: JSON.stringify({ has_error: true, error_code: 'E02' }),
      })
    ).toBe(false);
    expect(
      isBayTrulyAvailableForKiosk({
        ...baseBay,
        status: 'AVAILABLE',
        hardware_status: 'ERROR',
      })
    ).toBe(false);
    expect(
      isBayTrulyAvailableForKiosk({
        ...baseBay,
        status: 'AVAILABLE',
        is_lesson_only: true,
      })
    ).toBe(false);
    expect(
      isBayTrulyAvailableForKiosk({
        ...baseBay,
        status: 'AVAILABLE',
        is_paused: true,
      })
    ).toBe(false);
  });
});
