import { describe, it, expect } from 'vitest';
import { maskHp, maskName } from '../masking';
import { encodeCode128B, normalizeCode128Text } from '../code128Barcode';
import {
  formatKioskHhMm,
  buildKioskBayAllocationSlipPayload,
  buildKioskLockerSlipPayload,
} from '../kioskSlipPrinter';

const STORE_INFO = {
  store_nm: '골포스 테스트점',
  biz_no: '111-22-33333',
  ceo_nm: '대표자',
  tel: '1566-8705',
  addr: '서울특별시 강남구',
};

describe('W3-KSK-utils: 개인정보 마스킹·Code128B 폴백·전표 시각/바코드 정화 경계 테스트', () => {
  it('maskName과 maskHp는 공백/이모지/국제번호(+82)/안심번호(0505)/서울번호(02)에서도 평문 노출을 차단한다', () => {
    expect(maskName('   ')).toBe('비회원');
    expect(maskName('홍😀동')).toBe('홍*동');

    expect(maskHp('   ')).toBe('010-****-****');
    expect(maskHp('+82-10-1234-5678')).toBe('010-****-5678');
    expect(maskHp('0505-1234-9876')).toBe('0505-****-9876');
    expect(maskHp('02-345-6789')).toBe('02-***-6789');
    expect(maskHp('02-3456-7890')).toBe('02-****-7890');
    expect(maskHp('1566-8705')).toBe('1566-8705');
  });

  it('normalizeCode128Text와 encodeCode128B는 비ASCII/빈 fallback 전달 시에도 크래시 없이 GOLFOS 심볼을 생성한다', () => {
    expect(normalizeCode128Text('한글전용', '')).toBe('GOLFOS');
    expect(normalizeCode128Text('한글전용', '폴백한글')).toBe('GOLFOS');

    const encoded = encodeCode128B('한글전용');
    expect(encoded.normalizedText).toBe('GOLFOS');
    expect(encoded.bars.length).toBeGreaterThan(0);
    expect(encoded.checksum).toBeGreaterThanOrEqual(0);
    expect(encoded.checksum).toBeLessThan(103);
  });

  it('formatKioskHhMm 및 전표 빌더는 단자리 시각("9:05", "905"), 공백 타석번호, 한글 라카번호 바코드를 안전 정화한다', () => {
    expect(formatKioskHhMm('905')).toBe('09:05');
    expect(formatKioskHhMm('9:05')).toBe('09:05');
    expect(formatKioskHhMm('9:05:30')).toBe('09:05');

    const baySlip = buildKioskBayAllocationSlipPayload({
      bayNo: ' 5 ',
      oldBayNo: '   ',
      checkinMode: 'MOVE_BAY',
      startTime: '9:05',
      endTime: '10:05',
      storeInfo: STORE_INFO,
      tradeDt: '2026.11.08 09:05:00',
    });
    expect(baySlip.slip_meta?.badge_text).toBe('05번 타석');
    expect(baySlip.slip_meta?.time_range).toBe('09:05 ~ 10:05');

    const emptyBaySlip = buildKioskBayAllocationSlipPayload({
      bayNo: '   ',
      storeInfo: STORE_INFO,
      tradeDt: '2026.11.08 09:05:00',
    });
    expect(emptyBaySlip.slip_meta?.badge_text).toBe('미지정 타석');

    const lockerSlip = buildKioskLockerSlipPayload({
      lockerNo: '여성A-108번',
      storeInfo: STORE_INFO,
      tradeDt: '2026.11.08 09:10:00',
    });
    expect(lockerSlip.slip_meta?.badge_text).toBe('라카 NO. 여성A-108번');
    expect(lockerSlip.barcode_text).toBe('LCK-A-108');
  });
});
