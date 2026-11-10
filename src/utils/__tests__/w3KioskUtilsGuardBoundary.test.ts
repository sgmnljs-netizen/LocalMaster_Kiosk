import { describe, it, expect } from 'vitest';
import {
  evaluateBayHardwareState,
  isBayOwnedWithActiveSession,
  isBayTrulyAvailableForKiosk,
  isNonEmptyHardwareErrorCode,
  runWithAllocationMutex,
} from '../bayStatusGuard';
import { formatFloorDisplayLabel } from '../floorUtils';
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

  it('isBayOwnedWithActiveSession은 이용 중 타석이 ERROR/MAINTENANCE로 전환되어도 res_id 또는 minutes_left가 있으면 자가 자리이동(고장 타석 탈출)을 허용한다', () => {
    expect(
      isBayOwnedWithActiveSession(
        {
          ...baseBay,
          status: 'ERROR',
          member_no: 'M-ESCAPE-01',
          res_id: 'RES-999',
          minutes_left: 0,
        },
        'M-ESCAPE-01'
      )
    ).toBe(true);
    expect(
      isBayOwnedWithActiveSession(
        {
          ...baseBay,
          status: 'ERROR',
          member_no: 'M-ESCAPE-01',
          res_id: null,
          minutes_left: 0,
        },
        'M-ESCAPE-01'
      )
    ).toBe(false);
  });

  it('runWithAllocationMutex는 연타(따닥) 동시 진입을 차단하고 예외 발생 후에도 잠금을 안전하게 해제한다', async () => {
    const lockRef = { current: false };
    let entered = 0;
    const [first, second] = await Promise.all([
      runWithAllocationMutex(lockRef, async () => {
        entered++;
        await new Promise((r) => setTimeout(r, 10));
        return 'OK';
      }),
      runWithAllocationMutex(lockRef, async () => {
        entered++;
        return 'DUPLICATE';
      }),
    ]);
    expect(entered).toBe(1);
    expect(first).toEqual({ executed: true, value: 'OK' });
    expect(second).toEqual({ executed: false });

    await expect(
      runWithAllocationMutex(lockRef, async () => {
        throw new Error('ALLOC_FAIL');
      })
    ).rejects.toThrow('ALLOC_FAIL');
    expect(lockRef.current).toBe(false);

    const recovered = await runWithAllocationMutex(lockRef, async () => 'RECOVERED');
    expect(recovered).toEqual({ executed: true, value: 'RECOVERED' });
  });

  it('formatFloorDisplayLabel은 빈 문자열·공백·0·NaN·null 입력 시 "F"나 "NANF" 대신 기본 "1F"로 안전 폴백한다', () => {
    expect(formatFloorDisplayLabel('')).toBe('1F');
    expect(formatFloorDisplayLabel('   ')).toBe('1F');
    expect(formatFloorDisplayLabel(0)).toBe('1F');
    expect(formatFloorDisplayLabel(Number.NaN)).toBe('1F');
    expect(formatFloorDisplayLabel(null)).toBe('1F');
    expect(formatFloorDisplayLabel(undefined)).toBe('1F');
    expect(formatFloorDisplayLabel('0F')).toBe('1F');
    expect(formatFloorDisplayLabel('B2')).toBe('B2F');
    expect(formatFloorDisplayLabel('3')).toBe('3F');
  });
});
