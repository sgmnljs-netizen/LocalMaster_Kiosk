import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'module';
import KioskMainDashboard from '../MainPage/KioskMainDashboard';
import {
  DEFAULT_PARKING_CONFIG,
  isSafeParkingHttpUrl,
  sanitizeKioskParkingConfig,
  resolveEffectiveParkingConfig,
} from '../../stores/kioskSettings';

const require = createRequire(import.meta.url);
const electronMain = require('../../../electron/main.cjs') as {
  PARKING_PARTITION: string;
  PARKING_HEADER_HEIGHT_PX: number;
  DEFAULT_PARKING_IDLE_TIMEOUT_SEC: number;
  validateParkingPopupUrl: (rawUrl: unknown) => { valid: boolean; url: string; error: string | null };
  isParkingNavigationAllowed: (targetUrl: string, initialUrl: string) => boolean;
  sanitizeParkingPopupOptions: (raw: unknown) => {
    valid: boolean;
    url: string;
    title: string;
    idleTimeoutSec: number;
    widthPct: number;
    heightPct: number;
  };
  computeParkingPopupBounds: (
    parent: { x: number; y: number; width: number; height: number } | null,
    options?: { widthPct?: number; heightPct?: number }
  ) => { x: number; y: number; width: number; height: number };
};

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

describe('키오스크 공식 외부 주차할인 웹 팝업 보안·설정·UI 검증', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  it('PK-01: Electron URL 검증기는 http/https만 허용하고 javascript/file/data 등 위험 스킴을 원천 차단한다', () => {
    expect(electronMain.PARKING_PARTITION).toBe('persist:parking');
    expect(electronMain.validateParkingPopupUrl('http://218.156.35.126').valid).toBe(true);
    expect(electronMain.validateParkingPopupUrl('https://park.vendor.co.kr/login').valid).toBe(true);

    for (const bad of ['javascript:alert(1)', 'file:///C:/Windows/cmd.exe', 'data:text/html,hi', '', 'ftp://1.2.3.4']) {
      expect(electronMain.validateParkingPopupUrl(bad).valid).toBe(false);
      expect(isSafeParkingHttpUrl(bad)).toBe(false);
    }
  });

  it('PK-02: Electron 네비게이션 가드는 동일 호스트/주차업체 도메인 이동은 허용하고 외부 사이트 이탈은 차단한다', () => {
    // IP 기반(거목프라자 등)
    expect(electronMain.isParkingNavigationAllowed('http://218.156.35.126/discount', 'http://218.156.35.126')).toBe(true);
    expect(electronMain.isParkingNavigationAllowed('http://1.2.3.4/evil', 'http://218.156.35.126')).toBe(false);

    // 도메인 기반(서브도메인 로그인 리다이렉트 허용, 타 도메인 차단)
    expect(electronMain.isParkingNavigationAllowed('https://auth.parkingvendor.com/login', 'https://kiosk.parkingvendor.com')).toBe(true);
    expect(electronMain.isParkingNavigationAllowed('https://www.youtube.com', 'https://kiosk.parkingvendor.com')).toBe(false);
  });

  it('PK-03: Electron 팝업 옵션·좌표 계산은 경계값 클램핑 및 중앙 정렬을 보장한다', () => {
    const opts = electronMain.sanitizeParkingPopupOptions({
      url: 'http://218.156.35.126',
      title: '아주긴주차등록버튼이름테스트1234567890',
      idleTimeoutSec: 5,
      widthPct: 200,
      heightPct: 10,
    });
    expect(opts.valid).toBe(true);
    expect(opts.title.length).toBeLessThanOrEqual(20);
    expect(opts.idleTimeoutSec).toBe(15);
    expect(opts.widthPct).toBe(98);
    expect(opts.heightPct).toBe(45);

    const bounds = electronMain.computeParkingPopupBounds(
      { x: 0, y: 0, width: 1080, height: 1920 },
      { widthPct: 86, heightPct: 72 }
    );
    expect(bounds.width).toBe(Math.round(1080 * 0.86));
    expect(bounds.height).toBe(Math.round(1920 * 0.72));
    expect(bounds.x).toBe(Math.round((1080 - bounds.width) / 2));
    expect(bounds.y).toBe(Math.round((1920 - bounds.height) / 2));
  });

  it('PK-04: kioskSettings 주차 설정은 기본 OFF이며 서버 KioskConfig 폴백과 기기별 오버라이드를 정합 병합한다', () => {
    expect(DEFAULT_PARKING_CONFIG.enabled).toBe(false);

    const serverClean = sanitizeKioskParkingConfig({
      enabled: true,
      url: 'http://218.156.35.126',
      button_label: '주차 할인',
      idle_timeout_sec: 90,
      popup_width_pct: 90,
      popup_height_pct: 78,
    });
    expect(serverClean.enabled).toBe(true);
    expect(serverClean.buttonLabel).toBe('주차 할인');
    expect(serverClean.idleTimeoutSec).toBe(90);

    // 기기 미설정 시 매장 서버 설정 적용
    const fromServer = resolveEffectiveParkingConfig(DEFAULT_PARKING_CONFIG, {
      enabled: true,
      url: 'http://218.156.35.126',
      button_label: '주차권 입력',
    });
    expect(fromServer.enabled).toBe(true);
    expect(fromServer.url).toBe('http://218.156.35.126');
    expect(fromServer.buttonLabel).toBe('주차권 입력');

    // 기기별 명시 설정 우선
    const fromDevice = resolveEffectiveParkingConfig(
      {
        enabled: true,
        url: 'https://local-park.example.com',
        buttonLabel: '1층 주차등록',
        idleTimeoutSec: 120,
        popupWidthPct: 94,
        popupHeightPct: 82,
      },
      { enabled: false, url: '' }
    );
    expect(fromDevice.enabled).toBe(true);
    expect(fromDevice.url).toBe('https://local-park.example.com');
    expect(fromDevice.buttonLabel).toBe('1층 주차등록');
  });

  it('PK-05: KioskMainDashboard는 주차 설정 OFF일 때 버튼을 미노출하고 ON+유효 URL일 때만 노출한다', () => {
    const htmlOff = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        parkingConfig: DEFAULT_PARKING_CONFIG,
        onOpenParking: () => {},
      })
    );
    expect(htmlOff).not.toContain('kiosk-parking-btn');
    expect(htmlOff).not.toContain('주차권 입력');

    const htmlOn = renderToStaticMarkup(
      React.createElement(KioskMainDashboard, {
        ...baseProps,
        parkingConfig: {
          enabled: true,
          url: 'http://218.156.35.126',
          buttonLabel: '주차 할인 등록',
          idleTimeoutSec: 60,
          popupWidthPct: 86,
          popupHeightPct: 72,
        },
        onOpenParking: () => {},
      })
    );
    expect(htmlOn).toContain('kiosk-parking-btn');
    expect(htmlOn).toContain('주차 할인 등록');
    expect(htmlOn).toContain('주차권 입력');
  });
});
