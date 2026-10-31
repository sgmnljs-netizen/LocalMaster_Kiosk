import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

const storageMap = new Map<string, string>();
const eventTarget = new EventTarget();
const mockLocalStorage: Storage = {
  get length() {
    return storageMap.size;
  },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => {
    storageMap.set(k, String(v));
  },
  removeItem: (k: string) => {
    storageMap.delete(k);
  },
  clear: () => {
    storageMap.clear();
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      localStorage: mockLocalStorage,
      location: {
        hostname: '127.0.0.1',
        port: '8000',
        origin: 'http://127.0.0.1:8000',
        pathname: '/',
        search: '',
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        webdriver: false,
      },
    },
    configurable: true,
    writable: true,
  });
}

import { api, isStrictOnlineStoreRuntime, type Member, type Bay } from '../api';
import { TimeMaster } from '../../utils/timeMaster';
import {
  CompanionSetupModal,
  filterCompanionAssignableAssets,
} from '../../components/CompanionSetupModal';
import {
  ErrorMessageModal,
  buildErrorModalTimerSessionKey,
} from '../../components/ErrorMessageModal';

describe('Kiosk P2 Allocation, Membership Asset, Locker & Session Integrity Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    storageMap.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    storageMap.delete('LM_FORCE_STRICT_ONLINE');
  });

  it('[P2-1] CompanionSetupModal allows PERIOD membership pass with rem_count=0 while blocking exhausted COUNT/TIME passes', () => {
    const assets: Member['assets'] = [
      {
        member_item_id: '501',
        item_name: '1개월 무제한 정기권',
        logic_type: 'PERIOD',
        rem_count: 0,
        remain_cnt: 0,
        remain_days: 28,
        duration_min: 70,
        start_date: '2026-10-01',
        is_assignable: true,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: '502',
        item_name: '소진된 횟수권',
        logic_type: 'COUNT',
        rem_count: 0,
        remain_cnt: 0,
        remain_days: 60,
        duration_min: 60,
        is_assignable: true,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: '503',
        item_name: '소진된 시간권',
        logic_type: 'TIME',
        remain_min: 0,
        rem_count: 0,
        remain_days: 30,
        is_assignable: true,
        allowed_categories: ['BAY'],
      },
      {
        member_item_id: '504',
        item_name: '만료된 정기권',
        logic_type: 'PERIOD',
        rem_count: 0,
        remain_days: -1,
        is_assignable: true,
        allowed_categories: ['BAY'],
      },
    ];

    const assignable = filterCompanionAssignableAssets(assets, 'BAY', '2026-10-31');
    expect(assignable).toHaveLength(1);
    expect(assignable[0].member_item_id).toBe('501');

    const leader: Member = {
      member_no: 'M_PERIOD_01',
      member_name: '정기권리더',
      hp: '010-1234-5678',
      email: '',
      member_grade: 'VIP',
      status_cd: '10',
      assets,
    };
    const bays: Bay[] = [
      { bay_id: 1, bay_no: 1, floor_no: 1, zone_code: 'BAY', type: 'RIGHT', status: 'AVAILABLE' } as Bay,
      { bay_id: 2, bay_no: 2, floor_no: 1, zone_code: 'BAY', type: 'RIGHT', status: 'AVAILABLE' } as Bay,
    ];

    const html = renderToString(
      React.createElement(CompanionSetupModal, {
        selectedBayNos: [1, 2],
        bays,
        leaderMember: leader,
        lang: 'KO',
        selectedDurationMin: 60,
        defaultDailyPrice: 18000,
        onConfirm: () => {},
        onCancel: () => {},
      })
    );

    // 대표자 슬롯이 정기권(0원)으로 정상 지정되어 동반자 1명분(18,000원)만 합산됨 (구형 버그 시 36,000원 부과)
    expect(html).toContain('1개월 무제한 정기권');
    expect(html).toContain('18,000');
    expect(html).not.toContain('36,000');
  });

  it('[P2-2] TimeMaster.getMinutesUntilClose handles 00:00 midnight close in early morning without breaking 02:00 overnight stores', () => {
    const earlyMorning = new Date(2026, 9, 31, 5, 30, 0); // 2026-10-31 05:30 local
    expect(TimeMaster.getMinutesUntilClose('00:00', earlyMorning)).toBe(1110);

    const lateEvening = new Date(2026, 9, 31, 23, 15, 0); // 2026-10-31 23:15 local
    expect(TimeMaster.getMinutesUntilClose('00:00', lateEvening)).toBe(45);

    const afterMidnightOvernight = new Date(2026, 9, 31, 0, 30, 0); // 2026-10-31 00:30 local
    expect(TimeMaster.getMinutesUntilClose('02:00', afterMidnightOvernight)).toBe(90);

    const pastDaytimeClose = new Date(2026, 9, 31, 23, 10, 0); // 2026-10-31 23:10 local
    expect(TimeMaster.getMinutesUntilClose('23:00', pastDaytimeClose)).toBe(-10);
  });

  it('[P2-4] Non-demo store runtime blocks offline fake member/hold generation and blocks stale LM_MEMBERS fallback in strict online mode', async () => {
    vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
    global.fetch = vi.fn().mockRejectedValue(new Error('Network temporary drop')) as any;

    storageMap.set('LM_MEMBERS', JSON.stringify([]));
    storageMap.set('LM_BAYS', JSON.stringify([{ bay_no: 3, status: 'AVAILABLE' }]));
    storageMap.set('LM_HOLD_RESERVATIONS', JSON.stringify([]));

    const regRes = await api.registerMember('김실매장', '010-7777-8888', '', false, null, 'M', false, null, true);
    expect(regRes.success).toBe(false);
    expect(JSON.parse(storageMap.get('LM_MEMBERS') || '[]')).toHaveLength(0);

    const holdRes = await api.createHoldReservation(3, 60, 'M1001', '김실매장', '01077778888');
    expect(holdRes.success).toBe(false);
    expect(holdRes.res_id).toBeUndefined();
    expect(JSON.parse(storageMap.get('LM_HOLD_RESERVATIONS') || '[]')).toHaveLength(0);

    // Strict online store runtime (프로덕션 실매장 런타임 시뮬레이션)
    storageMap.set('LM_FORCE_STRICT_ONLINE', 'true');
    expect(isStrictOnlineStoreRuntime()).toBe(true);
    storageMap.set(
      'LM_MEMBERS',
      JSON.stringify([
        {
          member_no: 'M_STALE_01',
          member_name: '구형캐시회원',
          hp: '010-7777-8888',
          status_cd: '10',
          assets: [{ member_item_id: '999', item_name: '구형잔여권', logic_type: 'COUNT', rem_count: 5 }],
        },
      ])
    );

    await expect(api.getMember('01077778888')).rejects.toMatchObject({
      status: 503,
      networkError: true,
    });
  });

  it('[P2-5] ErrorMessageModal timer session key remains stable across inline onClose prop changes during 5-second background polling', () => {
    const keyRender1 = buildErrorModalTimerSessionKey({
      isVisible: true,
      title: '카드 승인 거절',
      message: '잔액이 부족합니다.',
    });
    const keyRender2 = buildErrorModalTimerSessionKey({
      isVisible: true,
      title: '카드 승인 거절',
      message: '잔액이 부족합니다.',
    });
    expect(keyRender1).toBe(keyRender2);
    expect(keyRender1).toBe('카드 승인 거절::잔액이 부족합니다.');

    const hiddenKey = buildErrorModalTimerSessionKey({
      isVisible: false,
      title: '카드 승인 거절',
      message: '잔액이 부족합니다.',
    });
    expect(hiddenKey).toBe('');

    const html = renderToString(
      React.createElement(ErrorMessageModal, {
        data: {
          isVisible: true,
          title: '통신 지연 안내',
          message: '잠시 후 자동으로 홈으로 돌아갑니다.',
        },
        onClose: () => {},
      })
    );
    expect(html).toContain('통신 지연 안내');
    expect(html.replace(/<!--\s*-->/g, '')).toContain('12초 후 닫힘');
  });
});
