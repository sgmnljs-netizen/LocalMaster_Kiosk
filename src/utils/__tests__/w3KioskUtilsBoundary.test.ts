import { describe, it, expect } from 'vitest';
import { TimeMaster } from '../timeMaster';
import { buildKioskProductSpecSummary } from '../kioskProductSpecSummary';
import { getRecentKioskBlackBoxLogs, recordKioskBlackBox } from '../kioskBlackBox';
import { parseBayConfigJson, isNonEmptyHardwareErrorCode } from '../bayStatusGuard';
import { parseFloorNumber, sortFloorsAscending } from '../floorUtils';
import type { Bay, Product } from '../../services/api';

describe('[W3-KSK-utils] 키오스크 유틸리티 수치/JSON/층수 경계값 하드닝', () => {
  it('TimeMaster는 NaN/음수 에포크 및 음수 잔여시간 입력을 안전하게 무시·0 보정한다', () => {
    const beforeMs = TimeMaster.getSyncedNowMs();
    TimeMaster.syncServerTime(Number.NaN);
    TimeMaster.syncServerTime(-5000);
    TimeMaster.syncServerTime(0);
    expect(Math.abs(TimeMaster.getSyncedNowMs() - beforeMs)).toBeLessThan(1000);

    expect(TimeMaster.getPrepareRemainingSec({ prepare_remaining_sec: -15 })).toBe(0);
    expect(TimeMaster.getPrepareRemainingSec({ prepare_remaining_sec: Number.NaN })).toBe(0);
    expect(TimeMaster.getRemainingMinutes({ minutes_left: -8 })).toBe(0);
    expect(TimeMaster.getRemainingMinutes({ minutes_left: Number.NaN })).toBe(0);
  });

  it('buildKioskProductSpecSummary는 비정상 문자열/NaN 횟수·일수를 0으로 정규화하여 NaN 표출을 차단한다', () => {
    const malformedProd = {
      id: 'prod-nan',
      prod_cd: 'P_NAN',
      prod_nm: '경계값 테스트권',
      logic_type: 'COUNT',
      sale_price: 50000,
      standard_price: 50000,
      access_rules: { total_count: 'invalid', days: 'NaN', daily_limit_count: '-3' },
    } as unknown as Product;

    const spec = buildKioskProductSpecSummary(malformedProd);
    expect(JSON.stringify(spec).includes('NaN')).toBe(false);

    const numericDaysProd = {
      ...malformedProd,
      access_rules: { days: '30', total_count: 10 },
    } as unknown as Product;
    const numericDaysSpec = buildKioskProductSpecSummary(numericDaysProd);
    expect(numericDaysSpec.restrictionChips.some((c) => c.key === 'days')).toBe(false);
  });

  it('kioskBlackBox는 음수/NaN 조회 건수에 대해 빈 배열을 반환하고 슬라이스 역전을 차단한다', () => {
    recordKioskBlackBox('UI_ACTION', '테스트_액션', { step: 1 });
    expect(getRecentKioskBlackBoxLogs(-5)).toEqual([]);
    expect(Array.isArray(getRecentKioskBlackBoxLogs(Number.NaN))).toBe(true);
  });

  it('bayStatusGuard는 배열형 config_json과 0.0/-1 하드웨어 정상 코드를 오탐 없이 처리한다', () => {
    const arrBay = { bay_no: 1, status: 'AVAILABLE', config_json: '[1,2,3]' } as unknown as Bay;
    expect(parseBayConfigJson(arrBay)).toEqual({});
    expect(isNonEmptyHardwareErrorCode('0.0')).toBe(false);
    expect(isNonEmptyHardwareErrorCode('-1')).toBe(false);
    expect(isNonEmptyHardwareErrorCode(-1)).toBe(false);
    expect(isNonEmptyHardwareErrorCode(0)).toBe(false);
    expect(isNonEmptyHardwareErrorCode('E02')).toBe(true);
  });

  it('floorUtils는 지하층 표기(-1, 지하1층, B1F)를 오름차순(B2F < B1F < 1F < 2F)으로 일관 정렬한다', () => {
    expect(parseFloorNumber('-1')).toBe(-1);
    expect(parseFloorNumber('지하1층')).toBe(-1);
    expect(sortFloorsAscending(['2F', '1F', '지하1층', 'B2F'])).toEqual(['B2F', '지하1층', '1F', '2F']);
  });
});
