import { describe, it, expect } from 'vitest';
import { filterCompanionAssignableAssets } from '../CompanionSetupModal';
import type { MemberAsset } from '../../services/api';

describe('[W3][Kiosk][components] 동반자 보유 이용권 필터링 경계 검증', () => {
  const baseAsset = (overrides: Partial<MemberAsset>): MemberAsset => ({
    member_item_id: 'ITEM-1',
    item_name: '타석 정기권',
    logic_type: 'PERIOD',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_assignable: true,
    ...overrides,
  });

  it('일시정지(PAUSED)·만료일 경과(end_date < today) 이용권은 remain_days 누락 시에도 배정 대상에서 제외한다', () => {
    const assets: MemberAsset[] = [
      baseAsset({
        member_item_id: 'PAUSED-1',
        status_cd: 'PAUSED',
      }),
      baseAsset({
        member_item_id: 'EXPIRED-END-DT',
        end_date: '2026-11-07',
        remain_days: undefined,
      }),
      baseAsset({
        member_item_id: 'ACTIVE-TODAY',
        status_cd: 'ACTIVE',
        end_date: '2026-11-08',
        remain_days: undefined,
      }),
    ];

    const result = filterCompanionAssignableAssets(assets, 'BAY', '2026-11-08', 1);
    expect(result.map((a) => a.member_item_id)).toEqual(['ACTIVE-TODAY']);
  });

  it('allowed_categories 미지정 레거시 자산이라도 락카·레슨·대여·파3 전용권은 일반 타석(BAY) 자동 선택에서 차단한다', () => {
    const assets: MemberAsset[] = [
      baseAsset({
        member_item_id: 'LOCKER-1',
        item_name: '개인 락카 3개월',
        pass_type: 'LOCKER',
        allowed_categories: [],
      }),
      baseAsset({
        member_item_id: 'LESSON-1',
        item_name: '프로 원포인트 레슨 10회',
        logic_type: 'COUNT',
        pass_type: 'LESSON',
        remain_cnt: 5,
        allowed_categories: undefined,
      }),
      baseAsset({
        member_item_id: 'RENTAL-1',
        item_name: '클럽 대여권',
        allowed_categories: [],
      }),
      baseAsset({
        member_item_id: 'BAY-PASS-1',
        item_name: '종일 타석 3개월권',
        pass_type: 'PERIOD',
        allowed_categories: [],
      }),
    ];

    const result = filterCompanionAssignableAssets(assets, 'BAY', '2026-11-08', 2);
    expect(result.map((a) => a.member_item_id)).toEqual(['BAY-PASS-1']);
  });

  it('층 제한(allowed_floors)이 설정된 이용권은 허용된 층 타석에서만 배정 가능하다', () => {
    const assets: MemberAsset[] = [
      baseAsset({
        member_item_id: 'FLOOR-1F-ONLY',
        allowed_floors: [1],
      }),
      baseAsset({
        member_item_id: 'FLOOR-ALL',
        allowed_floors: [],
      }),
    ];

    const floor2 = filterCompanionAssignableAssets(assets, 'BAY', '2026-11-08', '2F');
    expect(floor2.map((a) => a.member_item_id)).toEqual(['FLOOR-ALL']);

    const floor1 = filterCompanionAssignableAssets(assets, 'BAY', '2026-11-08', '1F');
    expect(floor1.map((a) => a.member_item_id)).toEqual(['FLOOR-1F-ONLY', 'FLOOR-ALL']);
  });
});
