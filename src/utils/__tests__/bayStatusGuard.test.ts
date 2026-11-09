import { describe, it, expect } from 'vitest';
import {
  evaluateBayHardwareState,
  isBayOwnedWithActiveSession,
  isBayTrulyAvailableForKiosk,
  resolveCanonicalBayStatus,
} from '../bayStatusGuard';
import { isBayAvailable, isBayBlocked } from '../timeMaster';
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

  it('B08: [Wave 1] has_hardware_control=false(스크린전용) 타석은 볼센서 미감지·장비에러에서 면제되지만 수동 점검 상태(MAINTENANCE)는 차단된다', () => {
    const screenBay = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      has_hardware_control: false,
      hardware_status: 'ERROR',
      ball_box_detected: false,
      config_json: JSON.stringify({ has_error: true, error_code: 'E01', ball_box_status: 'EMPTY' }),
    });
    expect(screenBay.isBallEmpty).toBe(false);
    expect(screenBay.isHwError).toBe(false);
    expect(screenBay.isBlocked).toBe(false);
    expect(
      isBayTrulyAvailableForKiosk({
        ...baseBay,
        status: 'AVAILABLE',
        has_hardware_control: false,
        hardware_status: 'ERROR',
        ball_box_detected: false,
      })
    ).toBe(true);

    const screenMaint = evaluateBayHardwareState({
      ...baseBay,
      status: 'MAINTENANCE',
      has_hardware_control: false,
    });
    expect(screenMaint.isStatusBlocked).toBe(true);
    expect(screenMaint.isBlocked).toBe(true);
  });

  it('B09: [Wave 1] status_info.code === "UNKNOWN" 폴백 마스킹 방지, RESERVED 오탐 제외 및 config_json.error_code("E02") 단독 감지 검증', () => {
    const unknownInfoAvailable: Bay = {
      ...baseBay,
      status: 'OPEN',
      status_info: { code: 'UNKNOWN', label: '알 수 없음' },
    };
    expect(resolveCanonicalBayStatus(unknownInfoAvailable)).toBe('OPEN');
    expect(isBayTrulyAvailableForKiosk(unknownInfoAvailable)).toBe(true);
    expect(isBayAvailable(unknownInfoAvailable)).toBe(true);

    const unknownInfoFault: Bay = {
      ...baseBay,
      status: 'FAULT',
      status_info: { code: 'UNKNOWN', label: '알 수 없음' },
    };
    expect(evaluateBayHardwareState(unknownInfoFault).isStatusBlocked).toBe(true);
    expect(isBayBlocked(unknownInfoFault)).toBe(true);

    const reservedBay: Bay = {
      ...baseBay,
      status: 'RESERVED',
    };
    expect(evaluateBayHardwareState(reservedBay).isStatusBlocked).toBe(false);
    expect(isBayBlocked(reservedBay)).toBe(false);

    const cfgOnlyErr = evaluateBayHardwareState({
      ...baseBay,
      status: 'AVAILABLE',
      config_json: JSON.stringify({ error_code: 'E02' }),
    });
    expect(cfgOnlyErr.isHwError).toBe(true);
    expect(cfgOnlyErr.isBlocked).toBe(true);
  });

  it('B10: [Wave 1] 이용 중 고장(ERROR/FAULT/MAINTENANCE)으로 전환된 출발 타석에서도 본인 활성 세션이면 셀프 이동 탈출이 허용된다', () => {
    const brokenActiveBay: Bay = {
      ...baseBay,
      bay_no: 5,
      status: 'ERROR',
      current_member_no: 'M202601',
      current_user_name: '홍길동',
      res_id: 'RES-999',
      minutes_left: 42,
    };
    expect(isBayOwnedWithActiveSession(brokenActiveBay, 'M202601', '홍길동')).toBe(true);
    // 동명이인(타 member_no) 절대 배제
    expect(isBayOwnedWithActiveSession(brokenActiveBay, 'M999999', '홍길동')).toBe(false);
    // 세션 증거 없는 유휴 고장 타석은 소유 타석이 아님
    expect(
      isBayOwnedWithActiveSession({ ...baseBay, bay_no: 6, status: 'ERROR' }, 'M202601', '홍길동')
    ).toBe(false);
  });
});
