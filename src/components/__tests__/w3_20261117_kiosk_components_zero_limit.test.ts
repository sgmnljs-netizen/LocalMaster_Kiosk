import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AssetSelectModal } from '../AssetSelectModal';
import type { Bay, Member } from '../../services/api';

describe('Wave 3 (20261117) Kiosk Components Zero-Limit & Guard Audit', () => {
  it('AssetSelectModal: max_assignable_min=0 타석 선택 시 경고 배너와 CTA 비활성화 안내가 정확히 렌더링된다', () => {
    const fixedNow = new Date('2026-11-17T14:00:00+09:00');
    const member: Member = {
      member_no: 'M-ZERO-01',
      member_name: '김테스트',
      hp: '010-1111-2222',
      member_grade: 'VIP',
      expiry_date: '2026-12-31',
      assets: [
        {
          member_item_id: '501',
          item_name: '정기 회원권 60분',
          logic_type: 'PERIOD',
          duration_min: 60,
          remain_days: 10,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
      ],
    };
    const zeroLimitBay: Bay = {
      bay_no: 4,
      bay_name: '4번 타석',
      store_cd: 'S0531',
      floor: '1F',
      zone_code: 'BAY',
      status: 'AVAILABLE',
      max_assignable_min: 0,
      next_limit_res_start_time: '14:02',
    };

    const html = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: member,
        selectedBayNo: 4,
        bays: [zeroLimitBay],
        lang: 'KO',
        selectedAssetId: 501,
        prepareMin: 3,
        now: fixedNow,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn(),
      })
    );

    expect(html).toContain('즉시 이용 불가(타석 변경 필요)');
    expect(html).toContain('이용 가능 시간 부족 (타석 변경 필요)');
    expect(html).toContain('disabled=""');
  });
});
