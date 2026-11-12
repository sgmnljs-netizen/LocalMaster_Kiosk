import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  isQrDisallowedForPurpose,
  resolveEnabledAuthModesForPurpose,
  saveKioskSettings,
  getKioskSettings,
} from '../../stores/kioskSettings';
import {
  applyQrCouponOnlyMemberFilter,
  isPeriodMembershipAsset,
  type Member,
  type Bay,
} from '../api';
import { AssetSelectModal } from '../../components/AssetSelectModal';
import { getAssignableAssets as getCompanionAssignableAssets } from '../../components/CompanionSetupModal';

describe('🛡️ 키오스크 QR 쿠폰 전용 인증 & 목적별 QR 메뉴 완전 비노출 가드 QA', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
    };
    vi.stubGlobal('localStorage', memoryStorage);
  });

  it('1. 라카(EXTEND_LOCKER), 회원권구매(PURCHASE_PRODUCT), 일일권구매(ALLOCATE_DAILY)에서는 QR_SCAN이 활성화되어도 완전 비노출된다', () => {
    const allEnabled = {
      FACE: true,
      SMART_TAG: true,
      QR_SCAN: true,
      PHONE_KEYPAD: true,
    };

    expect(isQrDisallowedForPurpose('EXTEND_LOCKER')).toBe(true);
    expect(isQrDisallowedForPurpose('PURCHASE_PRODUCT')).toBe(true);
    expect(isQrDisallowedForPurpose('ALLOCATE_DAILY')).toBe(true);
    expect(isQrDisallowedForPurpose('ALLOCATE_MEMBERSHIP')).toBe(false);
    expect(isQrDisallowedForPurpose('BOOK_PAR3')).toBe(false);
    expect(isQrDisallowedForPurpose('CHECKIN_RESERVATION')).toBe(false);
    expect(isQrDisallowedForPurpose('MOVE_BAY')).toBe(false);

    for (const blockedPurpose of ['EXTEND_LOCKER', 'PURCHASE_PRODUCT', 'ALLOCATE_DAILY']) {
      const modes = resolveEnabledAuthModesForPurpose(allEnabled, true, blockedPurpose);
      expect(modes).not.toContain('QR_SCAN');
      expect(modes).toEqual(['SMART_TAG', 'PHONE_KEYPAD', 'FACE']);
    }

    for (const allowedPurpose of ['ALLOCATE_MEMBERSHIP', 'BOOK_PAR3', 'CHECKIN_RESERVATION', 'MOVE_BAY']) {
      const modes = resolveEnabledAuthModesForPurpose(allEnabled, true, allowedPurpose);
      expect(modes).toContain('QR_SCAN');
    }
  });

  it('2. applyQrCouponOnlyMemberFilter: qrCouponOnlyMode=true일 때 일반 정기권(PERIOD)·포인트·등급할인·라카정보를 제거하고 쿠폰(COUNT/TIME)만 남긴다', () => {
    const rawMember: Member = {
      member_no: 'M_GUNSAN_100',
      member_name: '정쿠폰',
      hp: '010-1234-5678',
      total_point: 25000,
      discount_rate: 15,
      locker_info: {
        locker_id: 12,
        locker_no: '12',
        zone_name: '1층 남성',
        end_date: '2026-12-31',
        remain_days: 30,
      },
      assets: [
        {
          member_item_id: '201',
          item_name: '군산대 3개월 종일 정기권',
          logic_type: 'PERIOD',
          remain_days: 60,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
        {
          member_item_id: '202',
          item_name: '군산대 20회 쿠폰 이용권',
          logic_type: 'COUNT',
          remain_cnt: 14,
          total_count: 20,
          duration_min: 60,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
      ],
    };

    expect(isPeriodMembershipAsset(rawMember.assets![0])).toBe(true);
    expect(isPeriodMembershipAsset(rawMember.assets![1])).toBe(false);

    const filtered = applyQrCouponOnlyMemberFilter(rawMember, 'QR', true);
    expect(filtered.auth_channel).toBe('QR');
    expect(filtered.qr_restricted_period_count).toBe(1);
    expect(filtered.assets).toHaveLength(1);
    expect(filtered.assets![0].member_item_id).toBe('202');
    expect(filtered.total_point).toBe(0);
    expect(filtered.discount_rate).toBe(0);
    expect(filtered.locker_info).toBeNull();

    // qrCouponOnlyMode=false 로 해제하면 정기권도 정상 유지
    const unfiltered = applyQrCouponOnlyMemberFilter(rawMember, 'QR', false);
    expect(unfiltered.assets).toHaveLength(2);
    expect(unfiltered.total_point).toBe(25000);
    expect(unfiltered.discount_rate).toBe(15);

    // BLE 스마트 체크인은 qrCouponOnlyMode=true 여도 정기권·포인트 유지
    const bleMember = applyQrCouponOnlyMemberFilter(rawMember, 'BLE', true);
    expect(bleMember.assets).toHaveLength(2);
    expect(bleMember.total_point).toBe(25000);
  });

  it('3. 정기권만 보유한 회원이 QR 인증으로 진입한 경우 AssetSelectModal이 쿠폰 전용 안내 배너를 렌더링한다', () => {
    saveKioskSettings({ qrCouponOnlyMode: true }, { syncRemote: false });
    expect(getKioskSettings().qrCouponOnlyMode).toBe(true);

    const qrPeriodOnlyMember: Member = {
      member_no: 'M_PER_ONLY',
      member_name: '김정기',
      hp: '010-2222-3333',
      auth_channel: 'QR',
      qr_restricted_period_count: 1,
      assets: [],
    };
    const bays: Bay[] = [
      { bay_id: 1, bay_no: 1, floor_no: 1, type: 'RIGHT', status: 'PRE_OCCUPIED', zone_code: 'BAY' },
    ];

    const html = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: qrPeriodOnlyMember,
        selectedBayNo: 1,
        bays,
        lang: 'KO',
        selectedAssetId: null,
        onSelectAsset: vi.fn(),
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onSwitchToDaily: vi.fn(),
        onChangeBay: vi.fn(),
      })
    );

    expect(html).toContain('qr-period-pass-restricted-banner');
    expect(html).toContain('QR 인증은 쿠폰(횟수권·시간권) 전용입니다.');
    expect(html).toContain('AI 안면인식');
  });

  it('4. 동반자 다중 타석 설정(CompanionSetupModal)에서도 대표자가 QR 인증 세션이면 동반자 휴대폰 조회 슬롯의 정기권(PERIOD) 사용을 차단하고 쿠폰만 허용한다', () => {
    saveKioskSettings({ qrCouponOnlyMode: true }, { syncRemote: false });

    const phoneSearchedCompanion: Member = {
      member_no: 'M_COMP_01',
      member_name: '동반정기회원',
      hp: '010-5555-6666',
      auth_channel: 'PHONE',
      assets: [
        {
          member_item_id: '301',
          item_name: '동반자 1개월 정기권',
          logic_type: 'PERIOD',
          remain_days: 20,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
        {
          member_item_id: '302',
          item_name: '동반자 10회 쿠폰권',
          logic_type: 'COUNT',
          remain_cnt: 5,
          is_assignable: true,
          allowed_categories: ['BAY'],
        },
      ],
    };
    const bay: Bay = { bay_id: 2, bay_no: 2, floor_no: 1, type: 'RIGHT', status: 'PRE_OCCUPIED', zone_code: 'BAY' };

    // 대표자가 QR 인증 세션(isQrSessionRestricted=true)일 때: 동반자 슬롯도 정기권 제외, 쿠폰권만 노출
    const qrSessionCompanionAssets = getCompanionAssignableAssets(phoneSearchedCompanion, bay, true);
    expect(qrSessionCompanionAssets).toHaveLength(1);
    expect(qrSessionCompanionAssets[0].member_item_id).toBe('302');

    // 대표자가 안면/스마트 인증 세션(isQrSessionRestricted=false)일 때: 기존대로 정기권+쿠폰권 모두 노출
    const normalSessionCompanionAssets = getCompanionAssignableAssets(phoneSearchedCompanion, bay, false);
    expect(normalSessionCompanionAssets).toHaveLength(2);
  });
});
