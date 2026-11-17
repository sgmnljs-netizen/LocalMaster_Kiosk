import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KioskMainDashboard, {
  shouldAllowDashboardCardTap,
  sortKioskDashboardMenus,
} from '../MainPage/KioskMainDashboard';
import { normalizeApiUrl } from '../../stores/kioskSettings';
import type { Bay, KioskMenuConfig } from '../../services/api';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;

const baseProps = {
  lang: 'KO' as const,
  onPracticeTeebox: () => {},
  onPar3Allocation: () => {},
  onPurchaseMembership: () => {},
  onMoveBay: () => {},
  onLockerExtend: () => {},
  onSignUp: () => {},
};

describe('KioskMainDashboard UI 시각 위계 · 가용 집계 · 커스텀 메뉴 계약 검증', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  it('MD-01: 전광판 노출(onReturnToIntro 존재) 시 지점 Eyebrow를 중앙 표출하고 골포스/로컬마스터 접두어를 정규화하며 이모지를 배제한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        storeName: '골포스 국립군산대학교 골프학습장',
        onReturnToIntro: () => {},
        onCheckin: () => {},
      })
    );

    expect(html).toContain('국립군산대학교 골프학습장');
    expect(html).not.toContain('골포스 국립군산대학교');
    expect(html).toContain('decision-btn-emerald dashboard-hero-tactile-btn');
    expect(html).toContain('dashboard-hero-snow-btn');
    expect(html).toContain('dashboard-sub-cta');
    expect(html).toContain('dashboard-signup-cta');
    expect(html).toContain('라카 연장');
    expect(html).not.toContain('👤');
    expect(html).not.toContain('📌');
    expect(html).not.toContain('⚡');
    expect(html).not.toContain('⛳');
    expect(html).not.toContain('→');
  });

  it('MD-02: HIDDEN 모드(onReturnToIntro 미전달) 시 지점 배지를 중복 표출하지 않고, bays 기준 실시간 즉시 이용 석수(정지·레슨·공부족 제외)를 정확히 산출한다', () => {
    const bays: Bay[] = [
      { bay_no: 1, zone_code: 'BAY', status: 'AVAILABLE', is_active: true, ball_box_detected: true },
      { bay_no: 2, zone_code: 'BAY', status: 'AVAILABLE', is_active: true, is_paused: true, ball_box_detected: true },
      { bay_no: 3, zone_code: 'BAY', status: 'AVAILABLE', is_active: true, is_lesson_only: true, ball_box_detected: true },
      { bay_no: 4, zone_code: 'BAY', status: 'AVAILABLE', is_active: true, ball_box_status: 'EMPTY' },
      { bay_no: 5, zone_code: 'BAY', status: 'OCCUPIED', is_active: true, minutes_left: 20 },
      { bay_no: 99, zone_code: 'PAR3', status: 'AVAILABLE', is_active: true },
    ];

    const availableHtml = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        storeName: '로컬마스터 강남점',
        bays,
      })
    );

    expect(availableHtml).not.toContain('강남점');
    expect(availableHtml).toContain('즉시 이용 1석');

    const waitlistHtml = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        bays: [{ bay_no: 1, zone_code: 'BAY', status: 'OCCUPIED', is_active: true, minutes_left: 15 }],
      })
    );
    expect(waitlistHtml).toContain('대기 예약 가능');
  });

  it('MD-03: 커스텀 메뉴(CUSTOM_VIP)가 타석 이동(CHANGE_BAY) default 분기로 오염되지 않고 서비스 이용하기 CTA를 표출한다', () => {
    const menus: KioskMenuConfig[] = [
      {
        menu_id: 'ALLOCATE_DAILY',
        menu_name: '연습타석 배정',
        description: '바로 배정',
        zone_ids: [],
        is_active: true,
        sort_order: 1,
        icon_type: 'TARGET',
      },
      {
        menu_id: 'CUSTOM_VIP_LOUNGE',
        menu_name: 'VIP 라운지 안내',
        description: '프리미엄 회원 라운지 이용 안내',
        zone_ids: [],
        is_active: true,
        sort_order: 2,
        icon_type: 'COMPASS',
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        kioskMenuConfigs: menus,
      })
    );

    expect(html).toContain('VIP 라운지 안내');
    expect(html).toContain('맞춤 서비스');
    expect(html).toContain('서비스 이용하기');
    expect(html).not.toContain('타석 이동하기');
  });

  it('MD-04: sort_order=0 우선순위를 보존하고, 350ms 이내 카드 연타 차단 및 비HTTP API URL 폴백을 검증한다', () => {
    const sorted = sortKioskDashboardMenus([
      {
        menu_id: 'LOCKER',
        menu_name: '라카 연장',
        description: '',
        zone_ids: [],
        is_active: true,
        sort_order: 2,
        icon_type: 'LOCKER',
      },
      {
        menu_id: 'ALLOCATE_DAILY',
        menu_name: '연습타석 배정',
        description: '',
        zone_ids: [],
        is_active: true,
        sort_order: 0,
        icon_type: 'TARGET',
      },
    ]);
    expect(sorted.map((m) => m.menu_id)).toEqual(['ALLOCATE_DAILY', 'LOCKER']);

    expect(shouldAllowDashboardCardTap(0, 1000)).toBe(true);
    expect(shouldAllowDashboardCardTap(1000, 1200)).toBe(false);
    expect(shouldAllowDashboardCardTap(1000, 1350)).toBe(true);

    expect(normalizeApiUrl('javascript:alert(1)')).toBe('http://127.0.0.1:8000/api');
    expect(normalizeApiUrl('file:///C:/kiosk/index.html')).toBe('http://127.0.0.1:8000/api');
  });
});
