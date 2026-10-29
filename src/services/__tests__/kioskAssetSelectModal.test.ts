import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AssetSelectModal } from '../../components/AssetSelectModal';
import { Member, Bay } from '../api';

describe('🏛️ 키오스크 보유 이용권 선택 모달 (AssetSelectModal) QA', () => {
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

  const mockBays: Bay[] = [
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

  it('AS-01: 940px 규격, 회원 프로필, 258px 신용카드 황금비 덱, IC 칩, 한글 유효기간 풀 표기가 렌더링되며 HOLDER 노이즈는 제거된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 6,
        bays: mockBays,
        lang: 'KO',
        selectedAssetId: null,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    // 940px Bento 시트 규격 확인
    expect(html).toContain('940px');
    expect(html).toContain('40px'); // borderRadius: 40px

    // 회원 이름 및 번호 표시 확인
    expect(html).toContain('홍길동');
    expect(html).toContain('M1001');
    expect(html).toContain('6번 타석');

    // 실제 신용카드 2열 덱 규격 및 IC 칩, 브랜드 확인 (GOLFOS 텍스트 미표출)
    expect(html).toContain('258px'); // 신용카드 황금비 높이
    expect(html).not.toContain('GOLFOS');
    expect(html).toContain('VIP PASS');

    // 노이즈(HOLDER / EXP) 제거 검증 및 한글 유효기간 검증
    expect(html).not.toContain('HOLDER:');
    expect(html).not.toContain('EXP:');
    expect(html).toContain('유효기간:');
    expect(html).toContain('2026-10-26 ~ 2026-11-30');

    // 카드 내부 상품명 및 1회 배정시간 시그니처 뱃지 & 혜택 라인 확인
    expect(html).toContain('1개월 정기 회원권');
    expect(html).toContain('1회 90분 배정');
    expect(html).toContain('33일');
    expect(html).toContain('매일');
    expect(html).toContain('종일');
    expect(html).toContain('1일 1회');

    expect(html).toContain('10회 쿠폰 이용권');
    expect(html).toContain('1회 60분 배정');
    expect(html).toContain('5회');
    expect(html).toContain('평일 전용(월~금)');

    // 미선택 시 하단 버튼 문구 확인
    expect(html).toContain('취소');
    expect(html).toContain('멤버십 카드를 먼저 선택해 주세요');
  });

  it('AS-02: 특정 멤버십 카드가 선택된 상태(selectedAssetId)에서는 2.5px 에메랄드 보더, [선택됨] 배지, 동적 하단 CTA가 활성화된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 6,
        bays: mockBays,
        lang: 'KO',
        selectedAssetId: 101,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    // 선택 완료 에메랄드 테두리 및 [선택됨] 확인
    expect(html).toContain('2.5px solid #059669');
    expect(html).toContain('선택됨');
    expect(html).toContain('[1개월 정기 회원권 · 90분] 선택 완료 — 배정하기');
  });

  it('AS-03: 타석 잔여 시간 제한이 있을 때 연쇄 예약 안내 바와 [다른 타석 선택] 버튼이 렌더링된다', () => {
    const rawHtml = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: mockMember,
        selectedBayNo: 6,
        bays: mockBays,
        lang: 'KO',
        selectedAssetId: null,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn()
      })
    );
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    expect(html).toContain('다음 예약(15:00) 전까지 최대 [60분] 이용 가능합니다');
    expect(html).toContain('다른 타석 선택');
  });
});
