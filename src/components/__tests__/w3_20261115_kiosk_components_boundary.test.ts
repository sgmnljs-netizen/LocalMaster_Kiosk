import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssetSelectModal,
  filterValidAssignableAssets,
  isZoneCompatibleWithAllowedCategories,
  resolveDefaultSelectedAssetId,
} from '../AssetSelectModal';
import { resolveAllocationDisplayTimeRange } from '../AllocationCompleteModal';
import { saveKioskSettings } from '../../stores/kioskSettings';
import { TimeMaster } from '../../utils/timeMaster';
import type { Bay, Member } from '../../services/api';

describe('Wave 3 (20261115) Kiosk Components Boundary Audit', () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', {
      location: {
        hostname: '127.0.0.1',
        port: '5179',
        origin: 'http://127.0.0.1:5179',
        protocol: 'http:',
      },
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AssetSelectModal: BAY ↔ BAT 구역 코드 상호 호환 및 ALL 와일드카드 매칭, PAR3 오매칭 차단', () => {
    expect(isZoneCompatibleWithAllowedCategories('BAY', ['BAT'])).toBe(true);
    expect(isZoneCompatibleWithAllowedCategories('BAT', ['BAY'])).toBe(true);
    expect(isZoneCompatibleWithAllowedCategories('PAR3', ['ALL'])).toBe(true);
    expect(isZoneCompatibleWithAllowedCategories('PAR3', ['BAT'])).toBe(false);

    const member: Pick<Member, 'assets' | 'auth_channel'> = {
      auth_channel: 'PHONE',
      assets: [
        {
          member_item_id: '101',
          item_name: '연습타석 10회권',
          logic_type: 'COUNT',
          remain_cnt: 5,
          allowed_categories: ['BAT'],
        },
      ],
    };

    const validOnBay = filterValidAssignableAssets(
      member,
      { zone_code: 'BAY', floor_no: 1 },
      { todayDigits: '20261115' }
    );
    expect(validOnBay.map((a) => a.member_item_id)).toEqual(['101']);

    const validOnPar3 = filterValidAssignableAssets(
      member,
      { zone_code: 'PAR3', floor_no: 1 },
      { todayDigits: '20261115' }
    );
    expect(validOnPar3).toEqual([]);
    expect(resolveDefaultSelectedAssetId(member, { zone_code: 'BAY', floor_no: 1 })).toBeNull();
  });

  it('AssetSelectModal: QR 쿠폰 전용 모드(qrCouponOnlyMode=true)에서 층 불일치/일일한도 초과 개인 정기권이 불가 목록에 노출되지 않는다', () => {
    saveKioskSettings({ storeCode: 'S0531', qrCouponOnlyMode: true }, { syncRemote: false });

    const qrMember: Member = {
      member_no: 'M-QR-01',
      member_name: '김보안',
      hp: '010-1234-5678',
      email: '',
      member_grade: 'VIP',
      status_cd: 'ACTIVE',
      auth_channel: 'QR',
      assets: [
        {
          member_item_id: '201',
          item_name: '비공개 VIP 1년 정기권',
          logic_type: 'PERIOD',
          allowed_floors: [2],
          remain_days: 180,
        },
        {
          member_item_id: '202',
          item_name: '비공개 3개월 회원권(금일소진)',
          logic_type: 'MEMBERSHIP',
          is_assignable: false,
          unassignable_reason: '금일 이용 한도를 모두 사용했습니다.',
        },
        {
          member_item_id: '203',
          item_name: '공용 쿠폰 10회권',
          logic_type: 'COUPON',
          remain_cnt: 4,
        },
      ],
    };

    const bays: Bay[] = [
      {
        bay_no: 1,
        status: 'AVAILABLE',
        floor: '1F',
        floor_no: 1,
        zone_code: 'BAY',
      } as Bay,
    ];

    const html = renderToString(
      React.createElement(AssetSelectModal, {
        authMember: qrMember,
        selectedBayNo: 1,
        bays,
        selectedAssetId: null,
        now: TimeMaster.parseIsoAsKstDate('2026-11-15T14:00:00+09:00'),
        onSelectAsset: () => {},
        onConfirm: () => {},
        onCancel: () => {},
        onSwitchToDaily: () => {},
        onChangeBay: () => {},
      })
    );

    expect(html).toContain('공용 쿠폰 10회권');
    expect(html).not.toContain('비공개 VIP 1년 정기권');
    expect(html).not.toContain('비공개 3개월 회원권');
  });

  it('AllocationCompleteModal resolveAllocationDisplayTimeRange: endTime 미지정 시 종료시로 표시하고 UTC ISO를 KST 시각으로 변환한다', () => {
    const refNow = TimeMaster.parseIsoAsKstDate('2026-11-15T14:05:00+09:00');
    const openEnded = resolveAllocationDisplayTimeRange('14:05', undefined, 'KO', refNow);
    expect(openEnded).toEqual({ startDisplay: '14:05', endDisplay: '종료시' });

    const openEndedEn = resolveAllocationDisplayTimeRange(undefined, '', 'EN', refNow);
    expect(openEndedEn).toEqual({ startDisplay: '14:05', endDisplay: 'Until Exit' });

    const utcIso = resolveAllocationDisplayTimeRange(
      '2026-11-15T05:00:00Z',
      '2026-11-15T06:30:00Z',
      'KO',
      refNow
    );
    expect(utcIso).toEqual({ startDisplay: '14:00', endDisplay: '15:30' });
  });
});
