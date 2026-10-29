import { useState, useEffect } from 'react';

export type KioskAuthModeKey = 'SMART_TAG' | 'PHONE_KEYPAD' | 'QR_SCAN' | 'FACE';
export type KioskTopDashboardMode = 'AUTO' | 'COMPACT_1ROW' | 'HIDDEN';

export interface KioskAuthMethodsConfig {
  SMART_TAG: boolean;
  PHONE_KEYPAD: boolean;
  QR_SCAN: boolean;
  FACE: boolean;
}

export type KioskMenuVisibilityMap = Record<string, boolean>;

export interface KioskSettings {
  deviceId: string;
  deviceName: string;
  terminalId: string;
  vcatPort: string;
  providerType: string;
  apiUrl: string;
  storeCode: string;
  deviceKey: string;
  adminPin: string;
  isMaintenanceMode: boolean;
  autoPrintReceipt?: boolean;
  /** 기기별 메뉴 On/Off 로컬 오버라이드 (미지정 키는 파트너센터 설정 준수) */
  menuOverrides?: KioskMenuVisibilityMap;
  /** 기기별 회원인증 수단(4종) 활성화 여부 */
  authMethods?: KioskAuthMethodsConfig;
  /** 기기별 회원인증 진입 시 기본 시작 탭 */
  defaultAuthMode?: KioskAuthModeKey;
  /** 중간 빈타석 표시 기준 시간(분): 대기시간 제외 순수 이용 가능 시간 기준 (표준 기본값: 60분) */
  minGapMinutes?: number;
  /** 상단 실시간 타석 현황판 표시 모드: AUTO(타석수 감지 자동 1~2줄 대형화), COMPACT_1ROW(1줄 고정), HIDDEN(숨김) */
  topDashboardMode?: KioskTopDashboardMode;
}

export const DEFAULT_AUTH_METHODS: KioskAuthMethodsConfig = {
  SMART_TAG: true,
  PHONE_KEYPAD: true,
  QR_SCAN: true,
  FACE: true,
};

export function canonicalizeKioskMenuId(menuId: string): string {
  const upper = String(menuId || '').trim().toUpperCase();
  if (upper === 'ALLOCATION' || upper === 'ALLOCATE_MEMBERSHIP') return 'ALLOCATE_DAILY';
  if (upper === 'BOOK_PAR3' || upper === 'PAR3_ALLOCATION') return 'PAR3';
  if (upper === 'MEMBERSHIP' || upper === 'PRODUCTS') return 'PURCHASE_PRODUCT';
  if (upper === 'EXTEND_LOCKER' || upper === 'LOCKER_EXTEND') return 'LOCKER';
  if (upper === 'CHANGE_BAY') return 'MOVE_BAY';
  if (upper === 'REGISTER' || upper === 'REGISTER_MEMBER') return 'SIGNUP';
  if (upper === 'CHECKIN_RESERVATION') return 'CHECKIN';
  return upper;
}

export function isKioskMenuEnabled(
  menuId: string,
  overrides?: KioskMenuVisibilityMap,
  partnerActive: boolean = true
): boolean {
  if (overrides) {
    const rawKey = String(menuId || '').trim();
    const canonicalKey = canonicalizeKioskMenuId(rawKey);
    if (typeof overrides[rawKey] === 'boolean') {
      return overrides[rawKey];
    }
    if (typeof overrides[canonicalKey] === 'boolean') {
      return overrides[canonicalKey];
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === 'boolean' && canonicalizeKioskMenuId(k) === canonicalKey) {
        return v;
      }
    }
  }
  return partnerActive;
}

export function resolveEnabledAuthModes(
  authMethods?: Partial<KioskAuthMethodsConfig>,
  faceTerminalEnabled: boolean = true
): KioskAuthModeKey[] {
  const merged: KioskAuthMethodsConfig = {
    ...DEFAULT_AUTH_METHODS,
    ...(authMethods || {}),
  };
  const ordered: KioskAuthModeKey[] = ['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'];
  const enabled = ordered.filter((mode) => {
    if (mode === 'FACE') {
      return merged.FACE !== false && faceTerminalEnabled !== false;
    }
    return merged[mode] !== false;
  });
  return enabled.length > 0 ? enabled : ['PHONE_KEYPAD'];
}

export function resolveEffectiveAuthMode(
  requestedMode: KioskAuthModeKey | undefined,
  defaultAuthMode: KioskAuthModeKey | undefined,
  enabledModes: KioskAuthModeKey[]
): KioskAuthModeKey {
  const safeEnabled: KioskAuthModeKey[] = enabledModes.length > 0 ? enabledModes : ['PHONE_KEYPAD'];
  if (defaultAuthMode && safeEnabled.includes(defaultAuthMode)) {
    return defaultAuthMode;
  }
  if (requestedMode && safeEnabled.includes(requestedMode)) {
    return requestedMode;
  }
  return safeEnabled[0];
}

export const KIOSK_DEVICE_OPTIONS = [
  { id: 'dev-3', name: '입구 무인 키오스크 1호기', terminalId: '88010003', vcatPort: '9099', providerType: 'KCP_VAN' },
  { id: 'dev-4', name: '2층 무인 키오스크 2호기', terminalId: '88010004', vcatPort: '9099', providerType: 'KCP_VAN' },
  { id: 'dev-5', name: '야외 연습장 키오스크 3호기', terminalId: '88010005', vcatPort: '9099', providerType: 'KOCES_VAN' },
  { id: 'custom', name: '⚙️ 직접 입력 (커스텀 설정)', terminalId: '', vcatPort: '9099', providerType: 'KCP_VAN' },
];

export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  deviceId: 'dev-3',
  deviceName: '입구 무인 키오스크 1호기',
  terminalId: '88010003',
  vcatPort: '9099',
  providerType: 'KCP_VAN',
  apiUrl: 'http://127.0.0.1:8000',
  storeCode: 'H01-SE-001',
  deviceKey: '',
  adminPin: '0000',
  isMaintenanceMode: false,
  menuOverrides: {},
  authMethods: { ...DEFAULT_AUTH_METHODS },
  defaultAuthMode: 'SMART_TAG',
  minGapMinutes: 60,
  topDashboardMode: 'AUTO',
};

const STORAGE_KEY = 'lm-kiosk-settings';

export function getDefaultApiUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:8000`;
    }
  }
  return 'http://127.0.0.1:8000';
}

export function normalizeApiUrl(rawUrl?: string): string {
  let base = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!base) {
    base = getDefaultApiUrl();
  }
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function getKioskSettings(): KioskSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_KIOSK_SETTINGS;
    }
    const defaultApi = getDefaultApiUrl();
    const raw = localStorage.getItem(STORAGE_KEY);
    const fallbackStoreCd = localStorage.getItem('LM_STORE_CD') || DEFAULT_KIOSK_SETTINGS.storeCode;
    if (!raw) {
      return {
        ...DEFAULT_KIOSK_SETTINGS,
        apiUrl: defaultApi,
        storeCode: fallbackStoreCd,
        menuOverrides: {},
        authMethods: { ...DEFAULT_AUTH_METHODS },
      };
    }
    const parsed = JSON.parse(raw);
    const parsedApi = (parsed.apiUrl || defaultApi).trim().replace(/\/+$/, '');
    const isLocalhostTarget = parsedApi.includes('127.0.0.1') || parsedApi.includes('localhost');
    const isRemoteClient = typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const effectiveApi = isLocalhostTarget && isRemoteClient ? defaultApi : parsedApi;
    return {
      ...DEFAULT_KIOSK_SETTINGS,
      ...parsed,
      storeCode: parsed.storeCode || fallbackStoreCd,
      apiUrl: effectiveApi,
      menuOverrides: parsed.menuOverrides && typeof parsed.menuOverrides === 'object' ? parsed.menuOverrides : {},
      authMethods: {
        ...DEFAULT_AUTH_METHODS,
        ...(parsed.authMethods && typeof parsed.authMethods === 'object' ? parsed.authMethods : {}),
      },
      defaultAuthMode: parsed.defaultAuthMode || DEFAULT_KIOSK_SETTINGS.defaultAuthMode,
      minGapMinutes: typeof parsed.minGapMinutes === 'number' && parsed.minGapMinutes >= 10
        ? parsed.minGapMinutes
        : 60,
    };
  } catch {
    return DEFAULT_KIOSK_SETTINGS;
  }
}

export function saveKioskSettings(
  settings: Partial<KioskSettings>,
  options?: { syncRemote?: boolean }
): KioskSettings {
  const current = getKioskSettings();
  const next: KioskSettings = {
    ...current,
    ...settings,
    apiUrl: (settings.apiUrl ?? current.apiUrl ?? DEFAULT_KIOSK_SETTINGS.apiUrl).trim().replace(/\/+$/, ''),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (next.storeCode) {
    localStorage.setItem('LM_STORE_CD', next.storeCode);
  }
  if (next.terminalId) {
    localStorage.setItem('LM_KIOSK_TERMINAL_ID', next.terminalId);
  }
  window.dispatchEvent(new Event('kiosk-settings-changed'));

  if (options?.syncRemote) {
    void pushKioskDeviceSettingsToServer(next);
  }

  return next;
}

export async function pushKioskDeviceSettingsToServer(settings: KioskSettings): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const baseUrl = (settings.apiUrl || getDefaultApiUrl()).trim().replace(/\/+$/, '');
    const storeCd = (settings.storeCode || localStorage.getItem('LM_STORE_CD') || '').trim();
    if (!storeCd) return false;
    const res = await fetch(`${baseUrl}/api/v1/kiosk/device-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store_cd: storeCd,
        device_id: settings.deviceId,
        device_name: settings.deviceName,
        terminal_id: settings.terminalId,
        vcat_port: settings.vcatPort,
        provider_type: settings.providerType,
        admin_pin: settings.adminPin,
        is_maintenance_mode: settings.isMaintenanceMode,
        menu_overrides: settings.menuOverrides || {},
        auth_methods: settings.authMethods || DEFAULT_AUTH_METHODS,
        default_auth_mode: settings.defaultAuthMode || 'SMART_TAG',
        min_gap_minutes: settings.minGapMinutes ?? 60,
        top_dashboard_mode: settings.topDashboardMode || 'AUTO',
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[kioskSettings] Failed to push device settings to server:', err);
    return false;
  }
}

export async function hydrateKioskDeviceSettingsFromServer(): Promise<KioskSettings | null> {
  if (typeof window === 'undefined') return null;
  try {
    const current = getKioskSettings();
    const baseUrl = (
      window.location.port === '8000'
        ? window.location.origin
        : current.apiUrl || getDefaultApiUrl()
    )
      .trim()
      .replace(/\/+$/, '');
    const storeCd = (localStorage.getItem('LM_STORE_CD') || current.storeCode || '').trim();
    if (!storeCd) return null;

    const res = await fetch(
      `${baseUrl}/api/v1/kiosk/device-settings?store_cd=${encodeURIComponent(storeCd)}&device_id=${encodeURIComponent(current.deviceId || '')}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.has_saved_settings || !data?.settings || typeof data.settings !== 'object') {
      return null;
    }
    const srv = data.settings;
    const patch: Partial<KioskSettings> = {};
    if (srv.deviceId) patch.deviceId = srv.deviceId;
    if (srv.deviceName) patch.deviceName = srv.deviceName;
    if (srv.terminalId) patch.terminalId = srv.terminalId;
    if (srv.vcatPort) patch.vcatPort = String(srv.vcatPort);
    if (srv.providerType) patch.providerType = srv.providerType;
    if (srv.adminPin) patch.adminPin = srv.adminPin;
    if (typeof srv.isMaintenanceMode === 'boolean') patch.isMaintenanceMode = srv.isMaintenanceMode;
    if (srv.menuOverrides && typeof srv.menuOverrides === 'object') {
      patch.menuOverrides = srv.menuOverrides;
    }
    if (srv.authMethods && typeof srv.authMethods === 'object') {
      patch.authMethods = {
        ...DEFAULT_AUTH_METHODS,
        ...srv.authMethods,
      };
    }
    if (srv.defaultAuthMode) {
      patch.defaultAuthMode = srv.defaultAuthMode;
    }
    if (typeof srv.minGapMinutes === 'number' && srv.minGapMinutes >= 10) {
      patch.minGapMinutes = srv.minGapMinutes;
    }
    if (srv.topDashboardMode) {
      patch.topDashboardMode = srv.topDashboardMode;
    }

    return saveKioskSettings(patch, { syncRemote: false });
  } catch {
    return null;
  }
}

let bootstrapPromise: Promise<KioskSettings | null> | null = null;

export async function bootstrapLocalKioskSettings(): Promise<KioskSettings | null> {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const isLoopback = host === '127.0.0.1' || host === 'localhost';
  if (!isLoopback) return null;

  const current = getKioskSettings();
  const hasExplicitSettings = Boolean(localStorage.getItem(STORAGE_KEY) && current.deviceKey);
  if (hasExplicitSettings) {
    return current;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const baseUrl = (
        window.location.port === '8000'
          ? window.location.origin
          : current.apiUrl || getDefaultApiUrl()
      )
        .trim()
        .replace(/\/+$/, '');
      const existingStoreCd = localStorage.getItem('LM_STORE_CD') || '';
      const query = existingStoreCd ? `?store_cd=${encodeURIComponent(existingStoreCd)}` : '';

      const res = await fetch(`${baseUrl}/api/v1/kiosk/local-bootstrap${query}`);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data?.store_cd) return null;

      return saveKioskSettings(
        {
          apiUrl: baseUrl,
          storeCode: existingStoreCd || data.store_cd,
          deviceKey: data.device_key || current.deviceKey,
          deviceId: data.device_id || current.deviceId,
          deviceName: data.device_name || current.deviceName,
          terminalId: data.terminal_id || current.terminalId,
          vcatPort: data.vcat_port || current.vcatPort,
          providerType: data.provider_type || current.providerType,
        },
        { syncRemote: false }
      );
    } catch {
      return null;
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

export function useKioskSettings() {
  const [settings, setSettings] = useState<KioskSettings>(getKioskSettings());

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getKioskSettings());
    };
    window.addEventListener('kiosk-settings-changed', handleUpdate);
    void bootstrapLocalKioskSettings();
    return () => window.removeEventListener('kiosk-settings-changed', handleUpdate);
  }, []);

  const updateSettings = (newSettings: Partial<KioskSettings>, options?: { syncRemote?: boolean }) => {
    const updated = saveKioskSettings(newSettings, options);
    setSettings(updated);
  };

  return { settings, updateSettings };
}
