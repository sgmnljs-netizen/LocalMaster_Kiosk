import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

const windowTarget = new EventTarget();
const mockWindow = {
  location: {
    hostname: '127.0.0.1',
    port: '5179',
    origin: 'http://127.0.0.1:5179',
    protocol: 'http:',
  },
  localStorage: mockLocalStorage,
  addEventListener: windowTarget.addEventListener.bind(windowTarget),
  removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
  dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
};

Object.defineProperty(globalThis, 'window', {
  value: mockWindow,
  configurable: true,
  writable: true,
});

import {
  DEFAULT_KIOSK_SETTINGS,
  bootstrapLocalKioskSettings,
  clearKioskAdminSession,
  getKioskAdminSessionToken,
  getKioskSettings,
  hydrateKioskDeviceSettingsFromServer,
  pushKioskDeviceSettingsToServer,
  saveKioskSettings,
  setKioskAdminSessionToken,
} from '../kioskSettings';

describe('[Wave 3][Kiosk/Stores] 스토리지 스키마 방어, 오프라인 PIN 토큰 교환 및 2-Tier LAN 부트스트랩 심층 검증', () => {
  beforeEach(() => {
    storageMap.clear();
    clearKioskAdminSession();
    mockWindow.location.hostname = '127.0.0.1';
    mockWindow.location.port = '5179';
    mockWindow.location.origin = 'http://127.0.0.1:5179';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('배열/문자열/null 등 비객체 JSON 및 Infinity/NaN minGapMinutes 입력을 차단하고 DEFAULT_KIOSK_SETTINGS 불변성을 보존한다', () => {
    storageMap.set('lm-kiosk-settings', JSON.stringify(['unexpected', 'array']));
    const fromArray = getKioskSettings() as unknown as Record<string, unknown>;
    expect(fromArray['0']).toBeUndefined();
    expect(fromArray.deviceId).toBe(DEFAULT_KIOSK_SETTINGS.deviceId);

    storageMap.set('lm-kiosk-settings', JSON.stringify('plain-string'));
    const fromString = getKioskSettings() as unknown as Record<string, unknown>;
    expect(fromString['0']).toBeUndefined();

    storageMap.set('lm-kiosk-settings', '{corrupt-json');
    const fromCorrupt = getKioskSettings();
    fromCorrupt.deviceName = '임시변이';
    expect(DEFAULT_KIOSK_SETTINGS.deviceName).toBe('입구 무인 키오스크 1호기');

    const savedInf = saveKioskSettings({ minGapMinutes: Number.POSITIVE_INFINITY });
    expect(savedInf.minGapMinutes).toBe(DEFAULT_KIOSK_SETTINGS.minGapMinutes);

    const savedLow = saveKioskSettings({ minGapMinutes: 3 });
    expect(savedLow.minGapMinutes).toBe(DEFAULT_KIOSK_SETTINGS.minGapMinutes);

    const savedValid = saveKioskSettings({ minGapMinutes: 45.8 });
    expect(savedValid.minGapMinutes).toBe(45);
  });

  it('pushKioskDeviceSettingsToServer는 오프라인 검증 PIN 보유 시 verify-admin-pin으로 세션 토큰을 자동 교환한 뒤 PUT 헤더에 주입한다', async () => {
    setKioskAdminSessionToken(null, '7391');
    const calls: Array<{ url: string; method: string; headers?: Record<string, string>; body?: string }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = String(init?.method || 'GET');
      const headers = (init?.headers as Record<string, string>) || {};
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, headers, body });

      if (url.endsWith('/api/v1/kiosk/verify-admin-pin')) {
        return new Response(JSON.stringify({ valid: true, pin_session_token: 'pin_tok_exchanged_01' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const settings = saveKioskSettings({
      apiUrl: 'http://192.168.0.10:8000',
      storeCode: 'S-LAN-01',
      deviceKey: 'dk_lan_01',
    });
    const pushed = await pushKioskDeviceSettingsToServer(settings, '8462');

    expect(pushed).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('http://192.168.0.10:8000/api/v1/kiosk/verify-admin-pin');
    expect(calls[1].url).toBe('http://192.168.0.10:8000/api/v1/kiosk/device-settings');
    expect(calls[1].headers['X-Kiosk-Admin-Token']).toBe('pin_tok_exchanged_01');
    expect(calls[1].headers['X-Device-Key']).toBe('dk_lan_01');
    expect(JSON.parse(calls[1].body || '{}').admin_pin).toBe('8462');
    expect(getKioskAdminSessionToken()).toBe('pin_tok_exchanged_01');
  });

  it('bootstrapLocalKioskSettings는 미인증 사설 LAN 호출을 차단하고 인증된 2-Tier LAN 호출 및 동시 호출 중복제거를 보장한다', async () => {
    mockWindow.location.hostname = '192.168.0.55';
    mockWindow.location.origin = 'http://192.168.0.55:5179';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/kiosk/verify-admin-pin')) {
        return new Response(JSON.stringify({ valid: true, pin_session_token: 'lan_boot_tok_99' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response(
        JSON.stringify({
          store_cd: 'S-REAL-777',
          device_key: 'dk_real_777',
          device_id: 'dev-4',
          device_name: '2층 키오스크',
          terminal_id: '88017777',
          vcat_port: '8089',
          provider_type: 'SMARTRO',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    // 1) 미인증 LAN 호출 차단
    const blocked = await bootstrapLocalKioskSettings({ force: true });
    expect(blocked).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2) 오프라인 PIN 검증 직후 allowAuthenticatedLan + force 부트스트랩 (기본 데모 store_cd 쿼리 제외 검증)
    storageMap.set('LM_STORE_CD', DEFAULT_KIOSK_SETTINGS.storeCode);
    setKioskAdminSessionToken(null, '7391');
    const booted = await bootstrapLocalKioskSettings({
      force: true,
      allowAuthenticatedLan: true,
      apiUrlOverride: 'http://192.168.0.10:8000/',
    });
    expect(booted?.storeCode).toBe('S-REAL-777');
    expect(booted?.providerType).toBe('SMARTRO_VAN');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.0.10:8000/api/v1/kiosk/local-bootstrap',
      expect.objectContaining({
        headers: { 'X-Kiosk-Admin-Token': 'lan_boot_tok_99' },
      })
    );

    // 3) 루프백 초기 기동 시 동시 호출 중복제거 (Single-flight bootstrapPromise)
    storageMap.clear();
    fetchSpy.mockClear();
    mockWindow.location.hostname = '127.0.0.1';
    const [r1, r2] = await Promise.all([bootstrapLocalKioskSettings(), bootstrapLocalKioskSettings()]);
    expect(r1?.storeCode).toBe('S-REAL-777');
    expect(r2?.storeCode).toBe('S-REAL-777');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('hydrateKioskDeviceSettingsFromServer는 서버 저장 설정을 역동기화하되 원격 재저장(PUT 루프)을 발생시키지 않는다', async () => {
    saveKioskSettings({ storeCode: 'S-HYDRATE-01', apiUrl: 'http://127.0.0.1:8000' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          has_saved_settings: true,
          settings: {
            deviceId: 'dev-5',
            providerType: 'nice',
            hasCustomAdminPin: true,
            minGapMinutes: 30,
            topDashboardMode: 'COMPACT_1ROW',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const hydrated = await hydrateKioskDeviceSettingsFromServer();
    expect(hydrated?.deviceId).toBe('dev-5');
    expect(hydrated?.providerType).toBe('NICE_VAN');
    expect(hydrated?.hasCustomAdminPin).toBe(true);
    expect(hydrated?.minGapMinutes).toBe(30);
    expect(hydrated?.topDashboardMode).toBe('COMPACT_1ROW');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
