import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  AssetSelectModal,
  filterValidAssignableAssets,
  resolveDefaultSelectedAssetId,
} from '../../components/AssetSelectModal';
import { MemberAuth } from '../../components/MemberAuth';
import { PaymentTerminal } from '../../components/PaymentTerminal';
import { AllocationCompleteModal } from '../../components/AllocationCompleteModal';
import { TimeMaster } from '../../utils/timeMaster';
import { Member, Bay } from '../api';

describe('🏛️ 키오스크 타석 배정 퍼널 시인성·어포던스 & 즉시/대기 구분 QA', () => {
  const fixedNow = new Date('2026-11-14T12:00:00+09:00');

  const mockMember: Member = {
    member_no: 'M1001',
    member_name: '홍길동',
    hp: '010-1234-5678',
    member_grade: 'VIP',
    expiry_date: '2026-12-31',
    assets: [
      {
        member_item_id: '101',
        item_name: '1개월 정기 회원권',
        logic_type: 'PERIOD',
        duration_min: 90,
        start_date: '2026-10-26',
        expiry_date: '2026-11-30',
        remain_days: 33,
        available_days_label: '매일 이용',
        available_time_label: '전 시간(종일)',
        daily_limit_count: 1,
        is_assignable: true,
        allowed_categories: ['BAY']
      },
      {
        member_item_id: '102',
        item_name: '10회 쿠폰 이용권',
        logic_type: 'COUNT',
        remain_cnt: 5,
        total_count: 10,
        duration_min: 60,
        start_date: '2026-10-01',
        expiry_date: '2026-12-31',
        available_days_label: '평일 전용(월~금)',
        available_time_label: '06:00~15:00',
        daily_limit_count: 2,
        is_assignable: true,
        allowed_categories: ['BAY']
      }
    ]
  };

  const mockBaysWithLimit: Bay[] = [
    {
      bay_no: 6,
      bay_name: '6번 타석',
      store_cd: 'S0531',
      floor: '1F',
      zone_code: 'BAY',
      status: 'AVAILABLE',
      max_assignable_min: 60,
      next_limit_res_start_time: '15:00'
    }
  ];

  const mockOpenKunsanBay: Bay[] = [
    {
      bay_no: 7,
      bay_name: '7번 타석',
      store_cd: 'S0531',
      floor: '1F',
      zone_code: 'BAY',
      status: 'PRE_OCCUPIED', // 본 단말기 빈 타석 선점 상태도 즉시 배정으로 유지되어야 함
    }
  ];

  const mockWaitlistKunsanBay: Bay[] = [
    {
      bay_no: 7,
      bay_name: '7번 타석',
      store_cd: 'S0531',
      floor: '2F',
      zone_code: 'BAY',
      status: 'OCCUPIED',
      available_from_time: '12:25',
      total_wait_minutes: 25,
    }
  ];

  it('AS-01: 1008px 시트, 2열 1.6:1 카드 비율(286px), LESSON 레슨권 제외, 테두리 펄스 힌트, 미선택 시 차분한 108px CTA가 렌더링된다', () => {
    const lessonAndPeriodMember: Member = {
      ...mockMember,
      assets: [
        {
          member_item_id: '103',
          item_name: '레슨 10회권(이연서)',
          logic_type: 'LESSON',
          remain_cnt: 10,
          total_count: 10,
          duration_min: 30,
          start_date: '2026-11-13',
          expiry_date: '2027-02-10',
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
        ...(mockMember.assets || []),
      ],
    };

    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: lessonAndPeriodMember,
        selectedBayNo: 6,
        bays: mockBaysWithLimit,
        lang: 'KO',
        selectedAssetId: null,
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    // 1008px 시트, 2열 카드 그리드(286px = 1.6:1), 46px 헤드라인, 108px 하단 초대형 버튼, 카드 펄스 힌트 클래스 확인
    expect(html).toContain('1008px');
    expect(html).toContain('repeat(2, minmax(0, 1fr))');
    expect(html).toContain('286px');
    expect(html).toContain('46px');
    expect(html).toContain('108px');
    expect(html).toContain('사용할 보유 이용권을 선택하세요');
    expect(html).toContain('asset-card-pulse-hint');
    expect(html).not.toContain('asset-cta-ready');
    expect(html).toContain('터치 선택');

    // 불필요한 텍스트 / 노이즈 / AI 배지 완벽 제거 검증
    expect(html).not.toContain('GOLFOS');
    expect(html).not.toContain('VIP PASS');
    expect(html).not.toContain('인증 성공');
    expect(html).not.toContain('회원번호:');
    expect(html).not.toContain('1단계');
    expect(html).not.toContain('HOLDER:');
    expect(html).not.toContain('EXP:');

    // 회원명, 층·타석 및 즉시배정 배지 확인
    expect(html).toContain('홍길동');
    expect(html).toContain('1F · 6번 타석');
    expect(html).toContain('>즉시 배정<');
    expect(html).not.toContain('⚡ 즉시 배정');

    // 레슨권(LESSON)은 키오스크 무인 타석 셀프 배정 목록에서 자동 제외(오차감 방지)
    expect(html).not.toContain('레슨 10회권(이연서)');

    // 정기권/쿠폰권 정형화된 타입 라벨·상품명·잔여·유효기간 확인
    expect(html).toContain('정기 회원권');
    expect(html).toContain('1개월 정기 회원권');
    expect(html).toContain('1회 90분');
    expect(html).toContain('잔여 33일');
    expect(html).toContain('회수 이용권');
    expect(html).toContain('10회 쿠폰 이용권');
    expect(html).toContain('1회 60분');
    expect(html).toContain('잔여 5회 / 10회');
    expect(html).toContain('평일 전용(월~금)');
    expect(html).toContain('유효기간 2026-10-26 ~ 2026-11-30');

    // 미선택 시 하단 초대형 버튼 안내 문구 확인
    expect(html).toContain('취소');
    expect(html).toContain('위 보유 이용권을 눌러주세요');
  });

  it('AS-02: 이용권 선택 시(PRE_OCCUPIED 빈타석 선점 포함) 3px 에메랄드 보더, 최종 확인 독(12:00 ~ 13:32), 108px 즉시 배정 CTA가 활성화된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 7,
        bays: mockOpenKunsanBay,
        lang: 'KO',
        selectedAssetId: 101,
        prepareMin: 2, // 국립군산대(S0531) 준비시간 2분: 90분 + 2분 = 13:32 종료
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    expect(html).toContain('3px solid #059669');
    expect(html).toContain('선택됨');
    expect(html).not.toContain('asset-card-pulse-hint');
    expect(html).toContain('asset-cta-ready');
    expect(html).toContain('asset-cta-sheen-clip');
    expect(html).toContain('asset-cta-arrow');
    expect(html).toContain('asset-final-confirmation-dock');
    expect(html).toContain('>즉시 배정<');
    expect(html).toContain('12:00 ~ 13:32');
    expect(html).toContain('(90분 + 준비 2분)');
    expect(html).toContain('07번 타석 · 12:00 ~ 13:32 즉시 배정');
  });

  it('AS-03: 타석 잔여 시간 제한(max_assignable_min=60)이 있을 때 안내 바 및 단축된 종료 시각(12:00 ~ 13:02)이 정확히 표시된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 6,
        bays: mockBaysWithLimit,
        lang: 'KO',
        selectedAssetId: 101, // 90분 권이지만 60분 한도 타석
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    expect(html).toContain('다음 예약(15:00) 전까지 최대 [60분] 이용 가능');
    expect(html).toContain('다른 타석 선택');
    expect(html).toContain('12:00 ~ 13:02');
    expect(html).toContain('최대 60분 단축');
  });

  it('AS-04: 사용 중인 타석(OCCUPIED) 선택 시 전 영역이 고대비 [대기 예약] 모드와 대기 시작~종료 예정 시각(12:25 ~ 13:57) 및 앰버 CTA 비콘으로 전환된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 7,
        bays: mockWaitlistKunsanBay,
        lang: 'KO',
        selectedAssetId: 101,
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    expect(html).toContain('대기 예약 · 약 25분 대기');
    expect(html).toContain('12:25 ~ 13:57');
    expect(html).toContain('asset-cta-ready-amber');
    expect(html).toContain('07번 타석 · 12:25 ~ 13:57 대기 예약');
  });

  it('AS-05: 단일 유효 이용권(1장) 보유 시에도 자동 선택되지 않고 1.6:1 직사각형(480x296) 유리 광택 카드로 시작하며, 카드 선택 즉시 하단 배정 버튼 비콘(asset-cta-ready)으로 시선이 전환된다', () => {
    const singlePassMember: Member = {
      ...mockMember,
      assets: [mockMember.assets![0]],
    };

    // 1장 보유 시에도 자동 선택하지 않고 null 반환 (2단 시선 릴레이 일관성 보장)
    expect(
      resolveDefaultSelectedAssetId(singlePassMember, mockOpenKunsanBay[0], {
        qrCouponOnlyMode: true,
        todayDigits: '20261114',
      })
    ).toBeNull();

    // 2건 보유 시에도 동일하게 null
    expect(
      resolveDefaultSelectedAssetId(mockMember, mockOpenKunsanBay[0], {
        qrCouponOnlyMode: true,
        todayDigits: '20261114',
      })
    ).toBeNull();

    // QR 인증 + 정기권 단독 보유 시에도 null
    expect(
      resolveDefaultSelectedAssetId(
        { ...singlePassMember, auth_channel: 'QR' },
        mockOpenKunsanBay[0],
        { qrCouponOnlyMode: true, todayDigits: '20261114' }
      )
    ).toBeNull();

    // 1단계: 단일 이용권 미선택 진입 시 480x296(1.62:1) 카드 반짝임 활성 + 하단 CTA 비활성 대기
    const singleUnselectedHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: singlePassMember,
        selectedBayNo: 7,
        bays: mockOpenKunsanBay,
        lang: 'KO',
        selectedAssetId: null,
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    ).replace(/<!--.*?-->/g, '');

    expect(singleUnselectedHtml).toContain('minmax(0, 480px)');
    expect(singleUnselectedHtml).toContain('296px');
    expect(singleUnselectedHtml).toContain('asset-card-pulse-hint');
    expect(singleUnselectedHtml).toContain('터치 선택');
    expect(singleUnselectedHtml).toContain('위 보유 이용권을 눌러주세요');
    expect(singleUnselectedHtml).not.toContain('자동 선택됨');
    expect(singleUnselectedHtml).not.toContain('asset-cta-ready');

    // 2단계: 카드 터치 선택 시 카드 반짝임 정지('선택됨') -> 하단 108px 확정 CTA 비콘 즉시 점등
    const singleSelectedHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: singlePassMember,
        selectedBayNo: 7,
        bays: mockOpenKunsanBay,
        lang: 'KO',
        selectedAssetId: 101,
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    ).replace(/<!--.*?-->/g, '');

    expect(singleSelectedHtml).not.toContain('asset-card-pulse-hint');
    expect(singleSelectedHtml).not.toContain('자동 선택됨');
    expect(singleSelectedHtml).toContain('선택됨');
    expect(singleSelectedHtml).toContain('asset-cta-ready');
    expect(singleSelectedHtml).toContain('asset-cta-sheen-clip');
    expect(singleSelectedHtml).toContain('07번 타석 · 12:00 ~ 13:32 즉시 배정');
  });

  it('AS-06: MemberAuth·PaymentTerminal·AllocationCompleteModal에서도 즉시 배정 vs 대기 예약 및 타석·시간 정보가 일관되게 렌더링된다', () => {
    const memberAuthWaitlistHtml = renderToString(
      React.createElement(MemberAuth, {
        selectedBayNo: 7,
        selectedBay: mockWaitlistKunsanBay[0],
        bays: mockWaitlistKunsanBay,
        prepareMin: 2,
        now: fixedNow,
        onAuthSuccess: vi.fn(),
        onCancel: vi.fn(),
      })
    ).replace(/<!--.*?-->/g, '');

    expect(memberAuthWaitlistHtml).toContain('member-auth-allocation-banner');
    expect(memberAuthWaitlistHtml).toContain('대기 예약 · 약 25분 대기');
    expect(memberAuthWaitlistHtml).toContain('2F · 07번 타석');
    expect(memberAuthWaitlistHtml).toContain('12:25 대기 시작');

    const paymentWaitlistHtml = renderToString(
      React.createElement(PaymentTerminal, {
        productName: '일일회원(1회)',
        productSpecSummary: '당일 1회 · 1회 90분',
        amount: 15000,
        assignedBayNo: 7,
        selectedBay: mockWaitlistKunsanBay[0],
        bays: mockWaitlistKunsanBay,
        selectedDurationMin: 90,
        prepareMin: 2,
        now: fixedNow,
        onPaymentSuccess: vi.fn(),
        onCancel: vi.fn(),
      })
    ).replace(/<!--.*?-->/g, '');

    expect(paymentWaitlistHtml).toContain('payment-allocation-mode-badge');
    expect(paymentWaitlistHtml).toContain('⏳ 대기 예약 · 약 25분 대기');
    expect(paymentWaitlistHtml).toContain('2F · 07번 타석');
    expect(paymentWaitlistHtml).toContain('이용 예정 12:25 ~ 13:57');
    expect(paymentWaitlistHtml).not.toContain('즉시 배정 · 타석 이용권');

    const waitlistSlipHtml = renderToString(
      React.createElement(AllocationCompleteModal, {
        bayNo: 7,
        floor: 2,
        durationMin: 90,
        startTime: '12:25',
        endTime: '13:57',
        checkinMode: 'WAITLIST_ASSIGNED',
        noticeMessage: '현재 이용 중인 타석의 [대기 예약]이 완료되었습니다. 앞 세션 종료 후 [12:25]부터 입장해 주세요.',
        onClose: vi.fn(),
      })
    ).replace(/<!--.*?-->/g, '');

    expect(waitlistSlipHtml).toContain('대기 예약 완료');
    expect(waitlistSlipHtml).toContain('타석 대기 예약 확인표');
    expect(waitlistSlipHtml).not.toContain('⏳');
    expect(waitlistSlipHtml).toContain('2F');
    expect(waitlistSlipHtml).toContain('920px');
    expect(waitlistSlipHtml).toContain('앞 세션 종료 후 [12:25]부터 입장해 주세요');

    const preview = TimeMaster.buildBayAllocationPreview({
      bay: mockOpenKunsanBay[0],
      durationMin: 90,
      prepareMin: 2,
      now: fixedNow,
    });
    expect(preview.isWaitlist).toBe(false);
    expect(preview.startHhmm).toBe('12:00');
    expect(preview.endHhmm).toBe('13:32');
  });

  it('AS-07: 기소진 일일권/티켓(DAILY/TICKET rem_count=0)은 활성 목록에서 차단되며, 무제한 정기권(remain_days 미지정, rem_count=0)에 허위 "잔여 0회"가 노출되지 않고 문자열 층("1F")도 배정표에 정상 출력된다', () => {
    const mixedMember: Member = {
      ...mockMember,
      assets: [
        {
          member_item_id: '201',
          item_name: '일일타석 60분',
          logic_type: 'DAILY',
          rem_count: 0,
          total_count: 1,
          remain_days: 120,
          duration_min: 60,
          start_date: '2026-07-09',
          expiry_date: '2027-03-10',
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
        {
          member_item_id: '202',
          item_name: '일일타석 미사용권',
          logic_type: 'DAILY',
          rem_count: 1,
          total_count: 1,
          duration_min: 60,
          start_date: '2026-11-14',
          expiry_date: '2026-11-14',
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
        {
          member_item_id: '203',
          item_name: '평생 정기 회원권',
          logic_type: 'PERIOD',
          rem_count: 0,
          total_count: 0,
          duration_min: 60,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
      ],
    };

    const filtered = filterValidAssignableAssets(mixedMember, mockOpenKunsanBay[0], {
      qrCouponOnlyMode: true,
      todayDigits: '20261114',
    });
    expect(filtered.map((a) => a.member_item_id)).toEqual(['202', '203']);

    const modalHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mixedMember,
        selectedBayNo: 7,
        bays: mockOpenKunsanBay,
        lang: 'KO',
        selectedAssetId: null,
        prepareMin: 2,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn(),
      })
    ).replace(/<!--.*?-->/g, '');

    expect(modalHtml).not.toContain('일일타석 60분');
    expect(modalHtml).not.toContain('잔여 0회');
    expect(modalHtml).toContain('일일 이용권');
    expect(modalHtml).toContain('잔여 1회 / 1회');
    expect(modalHtml).toContain('평생 정기 회원권');

    const instantSlipWithStrFloor = renderToString(
      React.createElement(AllocationCompleteModal, {
        bayNo: 3,
        floor: '1F',
        durationMin: 60,
        startTime: '14:30',
        endTime: '15:32',
        onClose: vi.fn(),
      })
    ).replace(/<!--.*?-->/g, '');

    expect(instantSlipWithStrFloor).toContain('1F');
    expect(instantSlipWithStrFloor).toContain('03');
    expect(instantSlipWithStrFloor).not.toContain('영수증 재출력');
  });
});
