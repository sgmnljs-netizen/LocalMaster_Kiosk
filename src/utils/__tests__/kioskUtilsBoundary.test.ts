import { describe, expect, it } from 'vitest';
import {
  CODE128_PATTERNS,
  encodeCode128B,
  normalizeCode128Text,
} from '../code128Barcode';
import {
  formatFloorDisplayLabel,
  parseFloorNumber,
  sortBaysByNumber,
  sortFloorsAscending,
  sortFloorsDescending,
} from '../floorUtils';
import { maskHp, maskName } from '../masking';
import {
  canAllocatePracticeBayImmediately,
  evaluateLockerRenewalWindow,
  isKioskChannelProduct,
  isKioskLockerExtensionProduct,
  normalizeYmdDigits,
  resolveLockerExtendDays,
} from '../kioskPurchaseEligibility';
import { TimeMaster, isBayAvailable, isBayBlocked, isBayOccupied } from '../timeMaster';

describe('W3-KSK-utils: 바코드·층수·마스킹·자격판별·시간마스터 경계값 단위테스트', () => {
  describe('code128Barcode (ISO/IEC 15417 Code 128B)', () => {
    it('빈 문자열·공백·제어문자·한글만 있는 입력은 fallback("GOLFOS")으로 정규화하고 32자 초과분은 절삭한다', () => {
      expect(normalizeCode128Text('')).toBe('GOLFOS');
      expect(normalizeCode128Text('   \t\n\r  ')).toBe('GOLFOS');
      expect(normalizeCode128Text('한글바코드전용')).toBe('GOLFOS');
      expect(normalizeCode128Text('', 'EMPTY-CODE')).toBe('EMPTY-CODE');

      const over32 = 'BAY-01-ABCDEFGHIJKLMNOPQRSTUVWXYZ-9999';
      const normalized = normalizeCode128Text(over32);
      expect(normalized.length).toBe(32);
      expect(normalized).toBe(over32.slice(0, 32));
    });

    it('START_B(104), Modulo-103 체크섬, STOP(106, 13모듈) 시퀀스와 최소 Quiet Zone(>=10)을 정확히 계산한다', () => {
      // 'A'(ASCII 65 -> val 33), 'B'(ASCII 66 -> val 34)
      // weightedSum = 104 + 33*1 + 34*2 = 205 -> 205 % 103 = 102
      const res = encodeCode128B('AB', 3); // quietZone < 10 -> 10으로 클램핑
      expect(res.normalizedText).toBe('AB');
      expect(res.checksum).toBe(102);
      expect(res.symbolValues).toEqual([104, 33, 34, 102, 106]);
      expect(CODE128_PATTERNS[106]).toBe('2331112');
      // 4개 일반 심볼(4 * 11 = 44) + STOP(13) + 좌우 Quiet Zone(10 + 10) = 77 모듈
      expect(res.totalModules).toBe(77);
      expect(res.bars[0]?.x).toBe(10);
      expect(res.bars.length).toBeGreaterThan(0);
    });
  });

  describe('floorUtils (층수 파싱 및 원본 불변 정렬)', () => {
    it('null/빈값/지하층(B1F, B2)/지상층(3F)/옥상(ROOF) 경계값을 정확히 파싱한다', () => {
      expect(parseFloorNumber(null)).toBe(1);
      expect(parseFloorNumber(undefined)).toBe(1);
      expect(parseFloorNumber('')).toBe(1);
      expect(parseFloorNumber('B1F')).toBe(-1);
      expect(parseFloorNumber('b2')).toBe(-2);
      expect(parseFloorNumber('B')).toBe(-1);
      expect(parseFloorNumber('3F')).toBe(3);
      expect(parseFloorNumber('ROOF')).toBe(0);
      expect(formatFloorDisplayLabel(2)).toBe('2F');
      expect(formatFloorDisplayLabel('b1f')).toBe('B1F');
    });

    it('sortFloorsDescending / sortFloorsAscending / sortBaysByNumber는 원본 배열을 절대 변이시키지 않는다', () => {
      const originalFloors = ['1F', 'B2F', '3F', 'B1F', '2F'];
      const snapshotFloors = [...originalFloors];

      const desc = sortFloorsDescending(originalFloors);
      const asc = sortFloorsAscending(originalFloors);

      expect(originalFloors).toEqual(snapshotFloors);
      expect(desc).toEqual(['3F', '2F', '1F', 'B1F', 'B2F']);
      expect(asc).toEqual(['B2F', 'B1F', '1F', '2F', '3F']);

      const originalBays = [{ bay_no: 12 }, { bay_no: null }, { bay_no: '3' }, { bay_no: 1 }];
      const snapshotBays = originalBays.map((b) => ({ ...b }));
      const sortedBays = sortBaysByNumber(originalBays);

      expect(originalBays).toEqual(snapshotBays);
      expect(sortedBays.map((b) => b.bay_no)).toEqual([null, 1, '3', 12]);
    });
  });

  describe('masking (개인정보 비식별화 경계값)', () => {
    it('이름 길이에 따른 마스킹(null/빈값/1글자/2글자/3글자/4글자)을 처리한다', () => {
      expect(maskName(null)).toBe('비회원');
      expect(maskName('')).toBe('비회원');
      expect(maskName('김')).toBe('김');
      expect(maskName('김철')).toBe('김*');
      expect(maskName('홍길동')).toBe('홍*동');
      expect(maskName('남궁민수')).toBe('남**수');
    });

    it('전화번호 포맷(null/11자리/10자리/비표준 내선번호) 경계값을 처리한다', () => {
      expect(maskHp(null)).toBe('010-****-****');
      expect(maskHp('01012345678')).toBe('010-****-5678');
      expect(maskHp('010-9876-5432')).toBe('010-****-5432');
      expect(maskHp('011-234-5678')).toBe('011-***-5678');
      expect(maskHp('1566-8705')).toBe('1566-8705');
    });
  });

  describe('kioskPurchaseEligibility (0원 보증금·음수 만료일·미래 개시일 경계값)', () => {
    it('0원 보증금 전용 항목은 사물함 연장 대상에서 제외하고 정상 대여 상품은 허용한다', () => {
      expect(isKioskLockerExtensionProduct(null)).toBe(false);
      expect(
        isKioskLockerExtensionProduct({
          prod_cd: 'LC-DEP',
          prod_nm: '사물함 보증금',
          logic_type: 'RENTAL',
          sale_price: 0,
          days: 0,
          meta_data: { deposit_amount: 10000 },
        })
      ).toBe(false);
      expect(
        isKioskLockerExtensionProduct({
          prod_cd: 'LC-30',
          prod_nm: '개인 라카 1개월',
          logic_type: 'RENTAL',
          sale_price: 30000,
          days: 30,
          meta_data: { sales_channels: ['KIOSK', 'POS'] },
        })
      ).toBe(true);
    });

    it('이미 만료된 사물함(음수 잔여일)은 사전 연장 제한일(renewal_available_days)과 무관하게 즉시 연장을 허용한다', () => {
      const prodWithWindow = { access_rules: { renewal_available_days: 7 } };
      expect(evaluateLockerRenewalWindow(prodWithWindow, -5, 'KO').canRenewNow).toBe(true);
      expect(evaluateLockerRenewalWindow(prodWithWindow, 7, 'KO').canRenewNow).toBe(true);

      const blockedKo = evaluateLockerRenewalWindow(prodWithWindow, 15, 'KO');
      expect(blockedKo.canRenewNow).toBe(false);
      expect(blockedKo.renewalAvailableDays).toBe(7);

      const blockedEn = evaluateLockerRenewalWindow(prodWithWindow, 15, 'EN');
      expect(blockedEn.canRenewNow).toBe(false);
      expect(blockedEn.badgeText).toContain('D-7');
    });

    it('미래 개시일(startDate > today) 회원권이나 비타석 전용 상품은 즉시 타석 배정을 차단한다', () => {
      expect(normalizeYmdDigits('2026-11-06T09:00:00')).toBe('20261106');
      expect(normalizeYmdDigits('2026-11')).toBe('');

      expect(
        canAllocatePracticeBayImmediately(
          {
            purchaseType: 'MEMBERSHIP',
            memberNo: 'M001',
            logicType: 'PERIOD',
            productName: '전일 기간권 1개월',
            startDate: '2026-11-07',
          },
          '2026-11-06'
        )
      ).toBe(false);

      expect(
        canAllocatePracticeBayImmediately(
          {
            purchaseType: 'MEMBERSHIP',
            memberNo: 'M001',
            logicType: 'PERIOD',
            productName: '전일 기간권 1개월',
            startDate: '2026-11-06',
          },
          '2026-11-06'
        )
      ).toBe(true);

      expect(isKioskChannelProduct({ is_stock_managed: true, current_stock: 0 })).toBe(false);
      expect(isKioskChannelProduct({ meta_data: { is_price_open: true } })).toBe(false);
      expect(resolveLockerExtendDays({ days: 0, access_rules: { period_count: 3, period_type: 'MONTH' } })).toBe(90);
    });
  });

  describe('TimeMaster (자정 경과 보정·음수 클램핑·상태 헬퍼)', () => {
    it('23:50 기준 00:30 종료 세션을 익일(+24h)로 보정하고 과거 만료 시각은 0분으로 클램핑한다', () => {
      const lateNightNow = new Date(2026, 10, 6, 23, 50, 0, 0);
      const parsedNextDay = TimeMaster.parseSessionEnd('00:30', lateNightNow);
      expect(parsedNextDay).not.toBeNull();
      expect(TimeMaster.getRemainingMinutes('00:30', lateNightNow)).toBe(40);

      // 이미 종료된 시각(예: 현재보다 30분 과거)은 음수가 아닌 0분 반환
      const pastEpochMs = lateNightNow.getTime() - 30 * 60 * 1000;
      expect(TimeMaster.getRemainingMinutes(null, lateNightNow, pastEpochMs)).toBe(0);

      // duration_min 상한 캡 검증
      const futureEpochMs = lateNightNow.getTime() + 120 * 60 * 1000;
      expect(
        TimeMaster.getRemainingMinutes(
          { end_epoch_ms: futureEpochMs, duration_min: 55 },
          lateNightNow
        )
      ).toBe(55);
    });

    it('매장 심야 마감(02:00 / 24:00) 남은 분 계산과 타석 가용/사용/차단 상태 헬퍼를 검증한다', () => {
      const evening = new Date(2026, 10, 6, 23, 0, 0, 0);
      expect(TimeMaster.getMinutesUntilClose('02:00', evening)).toBe(180);
      expect(TimeMaster.getMinutesUntilClose('00:00', evening)).toBe(60);

      expect(isBayAvailable({ status: 'AVAILABLE', is_active: true })).toBe(true);
      expect(isBayAvailable({ status: 'AVAILABLE', is_active: false })).toBe(false);
      expect(isBayOccupied({ status: 'PREPARE' })).toBe(true);
      expect(isBayBlocked({ status: 'MAINTENANCE' })).toBe(true);
      expect(isBayBlocked(null)).toBe(true);
    });
  });
});
