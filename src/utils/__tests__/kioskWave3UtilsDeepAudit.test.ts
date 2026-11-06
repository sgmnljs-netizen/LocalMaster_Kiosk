import { execFileSync } from 'node:child_process';
import { describe, expect, it, beforeEach } from 'vitest';
import { TimeMaster } from '../timeMaster';
import {
  formatKioskHhMm,
  formatKioskYmd,
  buildKioskBayAllocationSlipPayload,
  buildKioskLockerSlipPayload,
} from '../kioskSlipPrinter';
import {
  clearKioskBlackBox,
  getFormattedKioskBlackBoxText,
  getRecentKioskBlackBoxLogs,
  maskKioskSensitiveData,
  recordKioskBlackBox,
} from '../kioskBlackBox';
import { encodeCode128B } from '../code128Barcode';

const DUMMY_STORE_INFO = {
  store_nm: '세그넷 테스트점',
  biz_no: '123-45-67890',
  ceo_nm: '홍길동',
  tel: '02-1566-0000',
  addr: '서울특별시 강남구',
};

describe('[Wave 3][Kiosk/Utils] KST 마감/종료 시각 산출, 전표 빌더 및 블랙박스 마스킹 심층 검증', () => {
  beforeEach(() => {
    clearKioskBlackBox();
  });

  it('TimeMaster.getMinutesUntilClose는 당일 마감, 자정(00:00/24:00), 심야 익일(02:00) 및 비정상 입력을 KST 기준으로 정밀 산출한다', () => {
    const kst2330 = new Date('2026-11-06T23:30:00+09:00');
    const kst0115 = new Date('2026-11-07T01:15:00+09:00');
    const kst0215 = new Date('2026-11-07T02:15:00+09:00');

    expect(TimeMaster.getMinutesUntilClose('24:00', kst2330)).toBe(30);
    expect(TimeMaster.getMinutesUntilClose('00:00', kst2330)).toBe(30);
    expect(TimeMaster.getMinutesUntilClose('23:00', kst2330)).toBe(-30);
    expect(TimeMaster.getMinutesUntilClose('02:00', kst2330)).toBe(150);
    expect(TimeMaster.getMinutesUntilClose('02:00', kst0115)).toBe(45);
    expect(TimeMaster.getMinutesUntilClose('02:00', kst0215)).toBe(-15);
    // 비정상 포맷은 24:00 마감으로 안전 폴백하여 NaN 전파를 차단한다
    expect(TimeMaster.getMinutesUntilClose('invalid', kst2330)).toBe(30);
    expect(TimeMaster.getMinutesUntilClose('25:99', kst2330)).toBe(30);
  });

  it('TimeMaster.parseSessionEnd는 4자리 HH:mm / HHmm 입력과 범위 외 시각(25:00, 24:30)을 안전하게 검증한다', () => {
    const kst2300 = new Date('2026-11-06T23:00:00+09:00');
    const parsedSameDay = TimeMaster.parseSessionEnd('23:30', kst2300);
    expect(parsedSameDay?.getTime()).toBe(Date.parse('2026-11-06T23:30:00+09:00'));

    const parsedCrossMidnight = TimeMaster.parseSessionEnd('00:30', kst2300);
    expect(parsedCrossMidnight?.getTime()).toBe(Date.parse('2026-11-07T00:30:00+09:00'));

    expect(TimeMaster.parseSessionEnd('25:00', kst2300)).toBeNull();
    expect(TimeMaster.parseSessionEnd('24:30', kst2300)).toBeNull();
  });

  it('TZ=UTC 서브프로세스 환경에서도 getMinutesUntilClose, parseSessionEnd, formatKioskHhMm이 KST(UTC+9)로 동작한다', () => {
    const probeEnvKey = 'KIOSK_W3_UTC_PROBE';
    if (process.env[probeEnvKey] === '1') {
      const utc1430 = new Date('2026-11-06T14:30:00.000Z'); // 23:30 KST
      expect(TimeMaster.getMinutesUntilClose('24:00', utc1430)).toBe(30);
      expect(TimeMaster.getMinutesUntilClose('02:00', utc1430)).toBe(150);
      expect(TimeMaster.parseSessionEnd('23:45', utc1430)?.getTime()).toBe(
        Date.parse('2026-11-06T14:45:00.000Z')
      );
      expect(formatKioskHhMm('2026-11-06T14:30:00Z')).toBe('23:30');
      expect(formatKioskHhMm('2026-11-06 23:40:00')).toBe('23:40');
      return;
    }

    const output = execFileSync(
      'npx',
      [
        'vitest',
        'run',
        '--reporter=basic',
        'src/utils/__tests__/kioskWave3UtilsDeepAudit.test.ts',
        '-t',
        'TZ=UTC 서브프로세스 환경에서도',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: 'true',
          TZ: 'UTC',
          [probeEnvKey]: '1',
        },
        encoding: 'utf8',
      }
    );
    expect(output).toContain('1 passed');
  });

  it('kioskSlipPrinter는 체크인 모드별 헤더/안내문구, 층/타석 배지 및 라카 확인증 페이로드를 정확히 조립한다', () => {
    expect(formatKioskHhMm('0930')).toBe('09:30');
    expect(formatKioskHhMm('18:45:12')).toBe('18:45');
    expect(formatKioskHhMm('2026-11-06T14:30:00Z')).toBe('23:30');
    expect(formatKioskYmd('20261106')).toBe('2026-11-06');
    expect(formatKioskYmd(null)).toBe('-');

    const moveSlip = buildKioskBayAllocationSlipPayload({
      bayNo: 5,
      oldBayNo: 2,
      floor: 2,
      resId: 'RES-990011',
      checkinMode: 'MOVE_BAY',
      startTime: '1900',
      endTime: '2010',
      durationMin: 70,
      storeInfo: DUMMY_STORE_INFO,
      tradeDt: '2026.11.06 19:00:00',
    });
    expect(moveSlip.header_message).toContain('타 석 이 동');
    expect(moveSlip.slip_meta?.badge_text).toBe('02번 → 05번 타석');
    expect(moveSlip.slip_meta?.time_range).toBe('19:00 ~ 20:10');
    expect(moveSlip.receipt_no).toBe('TICK-990011');

    const waitSlip = buildKioskBayAllocationSlipPayload({
      bayNo: 'VIP-1',
      floor: '3층',
      checkinMode: 'PENDING_WAIT',
      startTime: '20:00',
      durationMin: 0,
      storeInfo: DUMMY_STORE_INFO,
      tradeDt: '2026.11.06 19:50:00',
    });
    expect(waitSlip.header_message).toContain('체 크 인 대 기');
    expect(waitSlip.slip_meta?.badge_text).toBe('3층 - VIP-1');
    expect(waitSlip.slip_meta?.time_range).toBe('20:00 ~ 종료시');
    expect(waitSlip.slip_meta?.duration_label).toBe('');

    const lockerSlip = buildKioskLockerSlipPayload({
      lockerNo: '108번',
      startDate: '20261106',
      endDate: '20261205',
      days: 30,
      storeInfo: DUMMY_STORE_INFO,
      tradeDt: '2026.11.06 19:55:00',
    });
    expect(lockerSlip.slip_meta?.badge_text).toBe('라카 NO. 108번');
    expect(lockerSlip.slip_meta?.start_date).toBe('2026-11-06');
    expect(lockerSlip.slip_meta?.duration_label).toBe('30일');
    expect(lockerSlip.barcode_text).toBe('LCK-108');
  });

  it('kioskBlackBox는 PAN/휴대폰/시크릿/JSON 문자열을 마스킹하고 100건 링버퍼 상한을 강제한다', () => {
    const masked = maskKioskSensitiveData({
      admin_pin: '1234',
      cvv: '777',
      card_no: '9411-1234-5678-9012',
      memo: '고객 연락처 010-9876-5432 카드 5412 3456 7890 1234',
      rawJson: JSON.stringify({ device_key: 'SECRET-KEY', hp: '01012345678' }),
    }) as Record<string, string>;

    expect(masked.admin_pin).toBe('******');
    expect(masked.cvv).toBe('***');
    expect(masked.card_no).toBe('941112-**-****-9012');
    expect(masked.memo).toContain('010-****-5432');
    expect(masked.memo).toContain('541234-**-****-1234');
    expect(maskKioskSensitiveData('연속PAN 9410123456789012 및 하이픈 5412-3456-7890-1234')).toBe(
      '연속PAN 941012-**-****-9012 및 하이픈 541234-**-****-1234'
    );
    expect(JSON.parse(masked.rawJson).device_key).toBe('******');

    for (let idx = 1; idx <= 105; idx += 1) {
      recordKioskBlackBox('STEP', `ACTION_${idx}`);
    }
    const recentAll = getRecentKioskBlackBoxLogs(200);
    expect(recentAll).toHaveLength(100);
    expect(recentAll[0].actionName).toBe('ACTION_105');
    expect(recentAll[99].actionName).toBe('ACTION_6');
    expect(getFormattedKioskBlackBoxText(3)).toContain('ACTION_105');
  });

  it('encodeCode128B는 NaN quietZoneModules 입력에도 기본 Quiet Zone(10모듈)을 유지한다', () => {
    const normal = encodeCode128B('BAY-01-1930', 10);
    const nanQuiet = encodeCode128B('BAY-01-1930', Number.NaN);
    expect(nanQuiet.totalModules).toBe(normal.totalModules);
    expect(Number.isNaN(nanQuiet.totalModules)).toBe(false);
  });
});
