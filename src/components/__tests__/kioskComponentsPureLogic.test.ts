import { describe, it, expect } from 'vitest';
import {
  applyVirtualKeyAction,
  computeVirtualKeyboardTop,
  assembleHangul,
  Hangul,
} from '../VirtualKeyboard';
import { formatKioskLiveClock } from '../KioskLiveClock';
import { filterCompanionAssignableAssets } from '../CompanionSetupModal';
import { resolveIntroBannerImageUrl, resolveIntroSlides } from '../IntroScreen';
import { buildErrorModalTimerSessionKey } from '../ErrorMessageModal';
import { formatPhoneNumber, validateMemberRegisterForm } from '../MemberRegister';
import { MIN_INSTALLMENT_AMOUNT, INSTALLMENT_MONTH_OPTIONS } from '../PaymentTerminal';
import type { MemberAsset } from '../../services/api';

describe('W3-KSK-components: 키오스크 컴포넌트 순수 헬퍼 및 뷰모델 단위테스트', () => {
  describe('VirtualKeyboard: applyVirtualKeyAction & computeVirtualKeyboardTop & 한글 오토마타', () => {
    it('NUMERIC 모드에서는 숫자가 아닌 문자를 모두 제거하고 maxLength로 절삭한다', () => {
      const step1 = applyVirtualKeyAction('010', { type: 'CHAR', text: '-12a34' }, { mode: 'NUMERIC', maxLength: 8 });
      expect(step1).toBe('0101234');

      const step2 = applyVirtualKeyAction(step1, { type: 'CHAR', text: '5678' }, { mode: 'NUMERIC', maxLength: 8 });
      expect(step2).toBe('01012345');

      expect(applyVirtualKeyAction(step2, { type: 'BACKSPACE' }, { mode: 'NUMERIC' })).toBe('0101234');
      expect(applyVirtualKeyAction(step2, { type: 'CLEAR' }, { mode: 'NUMERIC' })).toBe('');
    });

    it('COUPON_CODE 모드 및 uppercase 옵션 시 소문자를 대문자로 강제 정규화한다', () => {
      const code = applyVirtualKeyAction('cpn-', { type: 'TOKEN', text: 'vip2026' }, { mode: 'COUPON_CODE', maxLength: 12 });
      expect(code).toBe('CPN-VIP2026');

      const ascii = applyVirtualKeyAction('http://', { type: 'TOKEN', text: '192.168.0.10:8000' }, { mode: 'ASCII_TEXT' });
      expect(ascii).toBe('http://192.168.0.10:8000');
    });

    it('computeVirtualKeyboardTop은 입력창 하단과 하단 네비게이션 예약 영역을 동시에 보호한다', () => {
      // 뷰포트가 충분할 때는 하단 네비게이션 바로 위 기본 위치 선택
      const normalTop = computeVirtualKeyboardTop({
        anchorBottomPx: 420,
        viewportHeightPx: 1920,
      });
      expect(normalTop).toBe(1920 - 124 - 395);

      // 입력창이 화면 하단에 가까울 때는 입력창 아래(anchorBottomPx + minGapPx)로 밀어 가림 방지
      const pushedTop = computeVirtualKeyboardTop({
        anchorBottomPx: 1500,
        viewportHeightPx: 1920,
        minGapPx: 20,
      });
      expect(pushedTop).toBe(1520);
    });

    it('assembleHangul 및 Hangul.disassemble이 겹받침 연음·이중모음·한영 혼합을 정확히 조합/분해한다', () => {
      // 홍길동
      const hong = ['ㅎ', 'ㅗ', 'ㅇ', 'ㄱ', 'ㅣ', 'ㄹ', 'ㄷ', 'ㅗ', 'ㅇ'];
      expect(assembleHangul(hong)).toBe('홍길동');
      expect(Hangul.disassemble('홍길동')).toEqual(hong);

      // 겹받침 + 모음 연음 분리: '닭' + 'ㅏ' => '달가', '값' + 'ㅓ' => '갑서'
      expect(assembleHangul(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ', 'ㅏ'])).toBe('달가');
      expect(assembleHangul(['ㄱ', 'ㅏ', 'ㅂ', 'ㅅ', 'ㅓ'])).toBe('갑서');
      expect(assembleHangul(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ'])).toBe('닭');
      expect(Hangul.disassemble('닭')).toEqual(['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ']);

      // 이중모음 조합 및 분해: '권' (ㄱ + ㅜ + ㅓ + ㄴ)
      expect(assembleHangul(['ㄱ', 'ㅜ', 'ㅓ', 'ㄴ'])).toBe('권');
      expect(Hangul.disassemble('권')).toEqual(['ㄱ', 'ㅜ', 'ㅓ', 'ㄴ']);

      // 영문 및 공백 혼용 시 상태 초기화 유지
      expect(assembleHangul(['김', ' ', 'A', 'ㅎ', 'ㅏ', 'ㄴ'])).toBe('김 A한');
    });
  });

  describe('KioskLiveClock: formatKioskLiveClock', () => {
    it('자정(00:00) 및 요일 다국어(KO/EN) 포맷을 24시간제로 정확히 반환한다', () => {
      // 2026-11-01 (일요일) 00:05
      const sunMidnight = new Date(2026, 10, 1, 0, 5, 0);
      const ko = formatKioskLiveClock(sunMidnight, 'KO');
      expect(ko).toEqual({
        dateLabel: '11.01 (일)',
        timeLabel: '00:05',
        hours: '00',
        minutes: '05',
      });

      const en = formatKioskLiveClock(sunMidnight, 'EN');
      expect(en.dateLabel).toBe('11.01 (Sun)');
      expect(en.timeLabel).toBe('00:05');
    });
  });

  describe('CompanionSetupModal: filterCompanionAssignableAssets', () => {
    const baseAssets: MemberAsset[] = [
      {
        member_item_id: 'A-PERIOD-OK',
        item_name: '전층 정기권',
        logic_type: 'PERIOD',
        start_date: '2026-11-01',
        remain_days: 25,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: 'A-FUTURE',
        item_name: '미래 개시 정기권',
        logic_type: 'PERIOD',
        start_date: '2026-12-01',
        remain_days: 30,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: 'A-ZERO-CNT',
        item_name: '소진된 횟수권',
        logic_type: 'COUNT',
        remain_cnt: 0,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: 'A-ZERO-TIME',
        item_name: '소진된 시간권',
        logic_type: 'TIME',
        remain_min: 0,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: 'A-FLOOR2-ONLY',
        item_name: '2층 전용 횟수권',
        logic_type: 'COUNT',
        remain_cnt: 5,
        allowed_floors: [2],
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: 'A-PAR3-ONLY',
        item_name: '파3 전용 쿠폰',
        logic_type: 'COUNT',
        remain_cnt: 3,
        allowed_categories: ['PAR3'],
      },
      {
        member_item_id: 'A-UNASSIGNABLE',
        item_name: '일일 한도 도달 회원권',
        logic_type: 'PERIOD',
        remain_days: 10,
        is_assignable: false,
      },
    ];

    it('만료·잔여 0·미래 개시·타 구역·비할당 이용권을 모두 제외하고 층수 조건을 정확히 필터링한다', () => {
      const floor1Bay = filterCompanionAssignableAssets(baseAssets, 'BAY', '2026-11-06', '1F');
      expect(floor1Bay.map((a) => a.member_item_id)).toEqual(['A-PERIOD-OK']);

      const floor2Bay = filterCompanionAssignableAssets(baseAssets, 'BAY', '2026-11-06', 2);
      expect(floor2Bay.map((a) => a.member_item_id)).toEqual(['A-PERIOD-OK', 'A-FLOOR2-ONLY']);

      const par3 = filterCompanionAssignableAssets(baseAssets, 'PAR3', '2026-11-06', null);
      expect(par3.map((a) => a.member_item_id)).toEqual(['A-PAR3-ONLY']);
    });
  });

  describe('IntroScreen & ErrorMessageModal 순수 뷰모델 헬퍼', () => {
    it('resolveIntroBannerImageUrl이 상대 경로·/api 접미사·절대 URL·data URI를 안전하게 정규화한다', () => {
      expect(resolveIntroBannerImageUrl('', 'http://127.0.0.1:8000/api')).toBe('');
      expect(resolveIntroBannerImageUrl('data:image/svg+xml;utf8,<svg/>', 'http://127.0.0.1:8000/api')).toBe(
        'data:image/svg+xml;utf8,<svg/>'
      );
      expect(resolveIntroBannerImageUrl('https://cdn.golfos.co.kr/b1.png', 'http://127.0.0.1:8000/api')).toBe(
        'https://cdn.golfos.co.kr/b1.png'
      );
      expect(resolveIntroBannerImageUrl('/static/banner.jpg', 'http://192.168.0.10:8000/api/')).toBe(
        'http://192.168.0.10:8000/static/banner.jpg'
      );
      expect(resolveIntroBannerImageUrl('uploads/ad.png', 'http://192.168.0.10:8000/api')).toBe(
        'http://192.168.0.10:8000/uploads/ad.png'
      );
    });

    it('resolveIntroSlides가 HQ 배너 -> 매장 대표사진 -> 기본 오프라인 배너 순으로 폴백한다', () => {
      const hq = [{ type: 'image' as const, url: 'https://img/1.jpg', title: 'HQ', subtitle: 'Sub' }];
      expect(resolveIntroSlides(hq, '/photo.jpg', '세그넷점')).toEqual(hq);

      const withPhoto = resolveIntroSlides([], 'https://img/store.jpg', '세그넷점');
      expect(withPhoto[0].url).toBe('https://img/store.jpg');
      expect(withPhoto[0].title).toBe('세그넷점');
      expect(withPhoto.length).toBeGreaterThanOrEqual(2);

      const fallback = resolveIntroSlides([], '   ');
      expect(fallback.length).toBeGreaterThanOrEqual(2);
      expect(fallback[0].url.startsWith('data:image/svg+xml')).toBe(true);
    });

    it('buildErrorModalTimerSessionKey는 비노출 상태에서 빈 문자열을 반환한다', () => {
      expect(buildErrorModalTimerSessionKey({ isVisible: false, title: '오류', message: '테스트' })).toBe('');
      expect(buildErrorModalTimerSessionKey({ isVisible: true, title: '결제 오류', message: '한도 초과' })).toBe(
        '결제 오류::한도 초과'
      );
    });
  });

  describe('MemberRegister & PaymentTerminal 입력 검증·할부 상수 경계값', () => {
    it('formatPhoneNumber 및 validateMemberRegisterForm이 빈값·미완성 한글·XSS 특수문자·약관 미동의를 차단한다', () => {
      expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
      expect(formatPhoneNumber('01012')).toBe('010-12');

      expect(validateMemberRegisterForm({ name: '   ', hp: '01012345678', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '김', hp: '01012345678', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '가'.repeat(51), hp: '01012345678', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '홍ㄱ동', hp: '01012345678', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '<script>alert(1)</script>', hp: '01012345678', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '홍길동', hp: '02-123-4567', privacyAgree: true }).isValid).toBe(false);
      expect(validateMemberRegisterForm({ name: '홍길동', hp: '010-1234-5678', privacyAgree: false }).isValid).toBe(false);

      const enFail = validateMemberRegisterForm({ name: '', hp: '01012345678', privacyAgree: true, lang: 'EN' });
      expect(enFail.isValid).toBe(false);
      expect(enFail.errorMsg).toContain('Please enter your name');

      const ok = validateMemberRegisterForm({ name: '  홍길동  ', hp: '010-1234-5678', privacyAgree: true });
      expect(ok).toEqual({
        isValid: true,
        cleanName: '홍길동',
        cleanHp: '01012345678',
      });
    });

    it('PaymentTerminal 할부 기준 금액(50,000원) 및 표준 할부 개월 옵션이 무결하게 유지된다', () => {
      expect(MIN_INSTALLMENT_AMOUNT).toBe(50000);
      expect(INSTALLMENT_MONTH_OPTIONS).toContain(0);
      expect(INSTALLMENT_MONTH_OPTIONS).toContain(3);
      expect(INSTALLMENT_MONTH_OPTIONS).toContain(12);
    });
  });
});
