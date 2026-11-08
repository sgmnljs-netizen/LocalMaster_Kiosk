import { describe, it, expect } from 'vitest';
import {
  evaluateBayHardwareState,
  isBayTrulyAvailableForKiosk,
  isNonEmptyHardwareErrorCode,
} from '../bayStatusGuard';
import type { Bay } from '../../services/api';

describe('W3-KSK-utils: bayStatusGuard 정상 에러코드 별칭(00/NONE/NORMAL) 오탐 방지 검증', () => {
  const baseBay: Bay = {
    bay_id: 10,
    bay_no: 10,
    floor_no: 1,
    type: 'RIGHT',
    status: 'AVAILABLE',
    is_active: true,
  };

  it('isNonEmptyHardwareErrorCode는 공백·00·NONE·NORMAL·OK·NULL을 정상(false)으로 판정하고 실제 장애코드만 true로 판정한다', () => {
    for (const benign of [null, undefined, false, '', '   ', '0', 0, '00', 'NONE', 'normal', ' ok ', 'null']) {
      expect(isNonEmptyHardwareErrorCode(benign)).toBe(false);
    }
    for (const fault of ['E01', ' e02 ', 'COMM_TIMEOUT', 500]) {
      expect(isNonEmptyHardwareErrorCode(fault)).toBe(true);
    }
  });

  it('미들웨어가 error_code로 "00", "NONE", "NORMAL", "   "를 보고한 정상 AVAILABLE 타석은 배정 차단되지 않는다', () => {
    for (const benignCode of ['00', 'NONE', 'NORMAL', 'OK', '   ']) {
      const state = evaluateBayHardwareState({
        ...baseBay,
        error_code: benignCode,
      });
      expect(state.isHwError).toBe(false);
      expect(state.isBlocked).toBe(false);
      expect(isBayTrulyAvailableForKiosk({ ...baseBay, error_code: benignCode })).toBe(true);
    }
  });

  it('소문자/공백 섞인 " e01 " 에러코드는 공부족(isBallEmpty=true)으로 정확히 차단한다', () => {
    const state = evaluateBayHardwareState({
      ...baseBay,
      config_json: JSON.stringify({ error_code: ' e01 ' }),
    });
    expect(state.isBallEmpty).toBe(true);
    expect(state.isBlocked).toBe(true);
    expect(state.shortLabel).toBe('공부족');
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, error_code: ' e01 ' })).toBe(false);
  });
});
