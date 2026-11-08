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
  adminPinDigest?: string;
  hasCustomAdminPin?: boolean;
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
  { id: 'dev-5', name: '야외 연습장 키오스크 3호기', terminalId: '88010005', vcatPort: '8089', providerType: 'SMARTRO_VAN' },
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
  adminPin: '',
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

function cloneDefaultKioskSettings(overrides?: Partial<KioskSettings>): KioskSettings {
  return {
    ...DEFAULT_KIOSK_SETTINGS,
    menuOverrides: {},
    authMethods: { ...DEFAULT_AUTH_METHODS },
    ...overrides,
  };
}

export function sanitizeMinGapMinutes(
  raw: unknown,
  fallback = DEFAULT_KIOSK_SETTINGS.minGapMinutes ?? 60
): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 10
      ? Math.min(1440, Math.floor(fallback))
      : 60;
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim())
        : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 10) {
    return Math.min(1440, Math.floor(parsed));
  }
  return safeFallback;
}

export function getKioskSettings(): KioskSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return cloneDefaultKioskSettings();
    }
    const defaultApi = getDefaultApiUrl();
    const raw = localStorage.getItem(STORAGE_KEY);
    const fallbackStoreCd = localStorage.getItem('LM_STORE_CD') || DEFAULT_KIOSK_SETTINGS.storeCode;
    if (!raw) {
      return cloneDefaultKioskSettings({
        apiUrl: defaultApi,
        storeCode: fallbackStoreCd,
      });
    }
    const parsedRaw: unknown = JSON.parse(raw);
    if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
      return cloneDefaultKioskSettings({
        apiUrl: defaultApi,
        storeCode: fallbackStoreCd,
      });
    }
    const parsed = parsedRaw as Partial<KioskSettings> & Record<string, unknown>;
    const parsedApi = String(parsed.apiUrl || defaultApi).trim().replace(/\/+$/, '');
    const isLocalhostTarget = parsedApi.includes('127.0.0.1') || parsedApi.includes('localhost');
    const isRemoteClient = typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const effectiveApi = isLocalhostTarget && isRemoteClient ? defaultApi : parsedApi;
    const legacyPlainPin = typeof parsed.adminPin === 'string' && /^\d{4}$/.test(parsed.adminPin.trim())
      ? parsed.adminPin.trim()
      : '';
    const resolvedDigest = typeof parsed.adminPinDigest === 'string' && /^[0-9a-f]{64}$/i.test(parsed.adminPinDigest)
      ? parsed.adminPinDigest.toLowerCase()
      : (legacyPlainPin ? computeOwnerPinDigest(legacyPlainPin) : undefined);
    const safeMenuOverrides =
      parsed.menuOverrides && typeof parsed.menuOverrides === 'object' && !Array.isArray(parsed.menuOverrides)
        ? parsed.menuOverrides
        : {};
    const safeAuthMethods =
      parsed.authMethods && typeof parsed.authMethods === 'object' && !Array.isArray(parsed.authMethods)
        ? parsed.authMethods
        : {};
    return {
      ...DEFAULT_KIOSK_SETTINGS,
      ...parsed,
      adminPin: '',
      adminPinDigest: resolvedDigest,
      storeCode: typeof parsed.storeCode === 'string' && parsed.storeCode ? parsed.storeCode : fallbackStoreCd,
      apiUrl: effectiveApi,
      menuOverrides: safeMenuOverrides,
      authMethods: {
        ...DEFAULT_AUTH_METHODS,
        ...safeAuthMethods,
      },
      defaultAuthMode: parsed.defaultAuthMode || DEFAULT_KIOSK_SETTINGS.defaultAuthMode,
      minGapMinutes: sanitizeMinGapMinutes(parsed.minGapMinutes),
    };
  } catch {
    return cloneDefaultKioskSettings();
  }
}

export function normalizeVanProviderType(raw?: string): string {
  const upper = String(raw || '').trim().toUpperCase();
  if (!upper) return 'KCP_VAN';
  if (upper === 'KCP' || upper === 'NHN_KCP') return 'KCP_VAN';
  if (upper === 'KOCES') return 'KOCES_VAN';
  if (upper === 'NICE') return 'NICE_VAN';
  if (upper === 'SMARTRO') return 'SMARTRO_VAN';
  return upper.endsWith('_VAN') ? upper : `${upper}_VAN`;
}

export function resolveVanStatusEndpointPath(providerType?: string): string {
  const norm = normalizeVanProviderType(providerType);
  if (norm === 'NICE_VAN') return '/nice/status';
  if (norm === 'SMARTRO_VAN') return '/smartro/status';
  return '/vcat/status';
}

export function resolveDefaultVanPort(providerType?: string): string {
  const norm = normalizeVanProviderType(providerType);
  if (norm === 'NICE_VAN') return '8088';
  if (norm === 'SMARTRO_VAN') return '8089';
  return '9099';
}

/**
 * 비보안 컨텍스트(LAN HTTP `http://192.168.x.x`)에서도 `crypto.subtle` 없이 동기 동작하는 순수 SHA-256 다이제스트
 */
export function sha256Hex(ascii: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(ascii);
  const bitLen = bytes.length * 8;
  const totalBytes = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(totalBytes);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(totalBytes - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalBytes - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const W = new Uint32Array(64);

  for (let offset = 0; offset < totalBytes; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

// 오프라인 점주/엔지니어 비상 복구용 솔트 다이제스트 (localStorage 및 번들 내 평문 PIN 노출 원천 차단)
const OFFLINE_INITIAL_DEFAULT_PIN_DIGEST = '55e313ea8b2eca6b73031c35ca5750514de6fdb89b1c819e2d382b6f448c56e0';
const OFFLINE_ENGINEER_PIN_SALT = 'GOLFOS_KIOSK_ENG_V1:';
const OFFLINE_ENGINEER_PIN_DIGEST = 'c52376307bee86b7419358cd5dd77834f44b188c02bf493ea680352bf6252cec';

export function computeOwnerPinDigest(pin: string): string {
  return sha256Hex(`GOLFOS_KIOSK_OWN_V1:${String(pin || '').trim()}`);
}

export function verifyOfflineAdminOrEngineerPin(
  inputPin: string,
  localSavedPinOrDigest?: string,
  hasCustomAdminPin?: boolean,
  localOwnerPinDigest?: string
): { valid: boolean; role?: 'OWNER' | 'ENGINEER' } {
  const clean = String(inputPin || '').trim();
  if (!/^\d{4}$/.test(clean)) return { valid: false };

  const inputOwnerDigest = computeOwnerPinDigest(clean);
  let effectiveOwnerDigest = OFFLINE_INITIAL_DEFAULT_PIN_DIGEST;
  if (localOwnerPinDigest && /^[0-9a-f]{64}$/i.test(localOwnerPinDigest)) {
    effectiveOwnerDigest = localOwnerPinDigest.toLowerCase();
  } else if (localSavedPinOrDigest && /^[0-9a-f]{64}$/i.test(localSavedPinOrDigest)) {
    effectiveOwnerDigest = localSavedPinOrDigest.toLowerCase();
  } else if (localSavedPinOrDigest && /^\d{4}$/.test(localSavedPinOrDigest)) {
    effectiveOwnerDigest = computeOwnerPinDigest(localSavedPinOrDigest);
  }

  // 서버에서 이미 커스텀 PIN 설정 사실이 동기화되었는데 로컬 다이제스트가 초기값인 경우 더미 통과 차단
  const allowLocalOwnerMatch = !(
    hasCustomAdminPin === true && effectiveOwnerDigest === OFFLINE_INITIAL_DEFAULT_PIN_DIGEST
  );
  if (allowLocalOwnerMatch && inputOwnerDigest === effectiveOwnerDigest) {
    return { valid: true, role: 'OWNER' };
  }

  if (sha256Hex(`${OFFLINE_ENGINEER_PIN_SALT}${clean}`) === OFFLINE_ENGINEER_PIN_DIGEST) {
    return { valid: true, role: 'ENGINEER' };
  }

  return { valid: false };
}

// 인메모리 관리자 세션 토큰 (절대 localStorage에 영구 기록하지 않음)
let kioskAdminSessionToken: string | null = null;
let pendingOfflineVerifiedPin: string | null = null;

export function setKioskAdminSessionToken(token: string | null, offlinePinFallback?: string | null): void {
  kioskAdminSessionToken = token;
  pendingOfflineVerifiedPin = offlinePinFallback ?? null;
}

export function getKioskAdminSessionToken(): string | null {
  return kioskAdminSessionToken;
}

export function clearKioskAdminSession(): void {
  kioskAdminSessionToken = null;
  pendingOfflineVerifiedPin = null;
}

export interface SaveKioskSettingsOptions {
  syncRemote?: boolean;
  /** 새 관리자 PIN 4자리를 명시적으로 변경할 때만 전달 (미전달 시 서버 기존 PIN 보존) */
  newAdminPin?: string;
}

export function saveKioskSettings(
  settings: Partial<KioskSettings>,
  options?: SaveKioskSettingsOptions
): KioskSettings {
  const current = getKioskSettings();
  const explicitNewPin =
    options?.newAdminPin && /^\d{4}$/.test(options.newAdminPin.trim())
      ? options.newAdminPin.trim()
      : undefined;
  const incomingPlainPin =
    explicitNewPin ??
    (settings.adminPin && /^\d{4}$/.test(settings.adminPin.trim())
      ? settings.adminPin.trim()
      : undefined);
  const resolvedDigest = incomingPlainPin
    ? computeOwnerPinDigest(incomingPlainPin)
    : (settings.adminPinDigest ?? current.adminPinDigest);
  const normalizedStoreCode =
    settings.storeCode !== undefined
      ? String(settings.storeCode).trim()
      : String(current.storeCode || '').trim();
  const next: KioskSettings = {
    ...current,
    ...settings,
    storeCode: normalizedStoreCode,
    providerType: normalizeVanProviderType(settings.providerType ?? current.providerType),
    adminPin: '',
    adminPinDigest: resolvedDigest,
    hasCustomAdminPin:
      incomingPlainPin !== undefined
        ? computeOwnerPinDigest(incomingPlainPin) !== OFFLINE_INITIAL_DEFAULT_PIN_DIGEST
        : (settings.hasCustomAdminPin ?? current.hasCustomAdminPin),
    apiUrl: (settings.apiUrl ?? current.apiUrl ?? DEFAULT_KIOSK_SETTINGS.apiUrl).trim().replace(/\/+$/, ''),
    minGapMinutes:
      settings.minGapMinutes !== undefined
        ? sanitizeMinGapMinutes(settings.minGapMinutes, current.minGapMinutes)
        : sanitizeMinGapMinutes(current.minGapMinutes),
  };
  if (typeof localStorage !== 'undefined') {
    const prevLmStore = (localStorage.getItem('LM_STORE_CD') || '').trim();
    const hadSettingsEntry = localStorage.getItem(STORAGE_KEY) !== null;
    const previousPersistedStore = (prevLmStore || (hadSettingsEntry ? current.storeCode : '')).trim();
    if (previousPersistedStore && next.storeCode && previousPersistedStore !== next.storeCode) {
      for (const cacheKey of [
        'LM_STORE_INFO',
        'LM_BAYS',
        'LM_LOCKERS',
        'LM_PRODUCTS',
        'LM_MEMBERS',
        'LM_PAR3_SLOTS',
        'LM_ZONES',
      ]) {
        localStorage.removeItem(cacheKey);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (next.storeCode) {
      localStorage.setItem('LM_STORE_CD', next.storeCode);
    }
    if (next.terminalId) {
      localStorage.setItem('LM_KIOSK_TERMINAL_ID', next.terminalId);
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('kiosk-settings-changed'));
  }

  if (options?.syncRemote) {
    void pushKioskDeviceSettingsToServer(next, explicitNewPin);
  }

  return next;
}

export async function pushKioskDeviceSettingsToServer(
  settings: KioskSettings,
  newAdminPin?: string
): Promise<boolean> {
  // 모달 닫힘(clearKioskAdminSession)보다 먼저 동기적으로 세션 토큰 스냅샷 캡처
  let sessionToken = kioskAdminSessionToken;
  const capturedOfflinePin = pendingOfflineVerifiedPin;
  if (typeof window === 'undefined') return false;
  try {
    const baseUrl = (settings.apiUrl || getDefaultApiUrl()).trim().replace(/\/+$/, '');
    const storeCd = (settings.storeCode || localStorage.getItem('LM_STORE_CD') || '').trim();
    if (!storeCd) return false;

    // 오프라인(잘못된 apiUrl) 상태에서 PIN 인증 후 새 apiUrl로 수정 저장하는 현장 시나리오 자동 토큰 교환
    if (!sessionToken && capturedOfflinePin) {
      try {
        const verifyRes = await fetch(`${baseUrl}/api/v1/kiosk/verify-admin-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_cd: storeCd,
            device_id: settings.deviceId,
            pin: capturedOfflinePin,
          }),
          signal: AbortSignal.timeout(2500),
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData?.valid && verifyData?.pin_session_token) {
            sessionToken = String(verifyData.pin_session_token);
            if (pendingOfflineVerifiedPin === capturedOfflinePin && pendingOfflineVerifiedPin !== null) {
              kioskAdminSessionToken = sessionToken;
              pendingOfflineVerifiedPin = null;
            }
          }
        }
      } catch {
        // 무시 후 deviceKey 등 폴백 헤더 시도
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['X-Kiosk-Admin-Token'] = sessionToken;
    }
    if (settings.deviceKey) {
      headers['X-Device-Key'] = settings.deviceKey;
    }

    const payloadBody: Record<string, unknown> = {
      store_cd: storeCd,
      device_id: settings.deviceId,
      device_name: settings.deviceName,
      terminal_id: settings.terminalId,
      vcat_port: settings.vcatPort,
      provider_type: normalizeVanProviderType(settings.providerType),
      is_maintenance_mode: settings.isMaintenanceMode,
      menu_overrides: settings.menuOverrides || {},
      auth_methods: settings.authMethods || DEFAULT_AUTH_METHODS,
      default_auth_mode: settings.defaultAuthMode || 'SMART_TAG',
      min_gap_minutes: settings.minGapMinutes ?? 60,
      top_dashboard_mode: settings.topDashboardMode || 'AUTO',
    };
    if (newAdminPin && /^\d{4}$/.test(newAdminPin)) {
      payloadBody.admin_pin = newAdminPin;
    }

    const res = await fetch(`${baseUrl}/api/v1/kiosk/device-settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payloadBody),
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
    const latestStoreCd = (localStorage.getItem('LM_STORE_CD') || getKioskSettings().storeCode || '').trim();
    if (latestStoreCd && latestStoreCd !== storeCd) {
      return null;
    }
    if (!data?.has_saved_settings || !data?.settings || typeof data.settings !== 'object') {
      return null;
    }
    const srv = data.settings;
    const patch: Partial<KioskSettings> = {};
    if (srv.deviceId) patch.deviceId = srv.deviceId;
    if (srv.deviceName) patch.deviceName = srv.deviceName;
    if (srv.terminalId) patch.terminalId = srv.terminalId;
    if (srv.vcatPort) patch.vcatPort = String(srv.vcatPort);
    if (srv.providerType) patch.providerType = normalizeVanProviderType(srv.providerType);
    if (typeof srv.hasCustomAdminPin === 'boolean') {
      patch.hasCustomAdminPin = srv.hasCustomAdminPin;
    }
    if (srv.adminPin && /^\d{4}$/.test(String(srv.adminPin))) {
      patch.adminPin = String(srv.adminPin);
    }
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
    if (srv.minGapMinutes !== undefined && srv.minGapMinutes !== null) {
      patch.minGapMinutes = sanitizeMinGapMinutes(srv.minGapMinutes, current.minGapMinutes);
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

export interface BootstrapKioskOptions {
  /** 기존 설정 유무와 무관하게 서버 최신 부트스트랩 강제 실행 */
  force?: boolean;
  /** 관리자/엔지니어 PIN 인증 세션 토큰(X-Kiosk-Admin-Token) 또는 오프라인 검증 PIN 보유 시 2-Tier 사설 LAN에서도 실행 허용 */
  allowAuthenticatedLan?: boolean;
  /** 설정창에서 입력 중인 새 API 서버 주소를 우선 지정하여 부트스트랩 수행 */
  apiUrlOverride?: string;
}

export async function bootstrapLocalKioskSettings(
  options?: BootstrapKioskOptions
): Promise<KioskSettings | null> {
  if (typeof window === 'undefined') return null;
  const host = window.location?.hostname || '';
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  let sessionToken = getKioskAdminSessionToken();
  const canAttemptLanBootstrap = Boolean(
    options?.allowAuthenticatedLan && (sessionToken || pendingOfflineVerifiedPin)
  );

  if (!isLoopback && !canAttemptLanBootstrap) return null;

  const current = getKioskSettings();
  const hasExplicitSettings = Boolean(localStorage.getItem(STORAGE_KEY) && current.deviceKey);
  if (hasExplicitSettings && !options?.force) {
    return current;
  }

  if (bootstrapPromise && !options?.force) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const explicitOverride = (options?.apiUrlOverride || '').trim().replace(/\/+$/, '');
      const baseUrl = (
        explicitOverride
          ? explicitOverride
          : window.location?.port === '8000'
            ? window.location.origin
            : current.apiUrl || getDefaultApiUrl()
      )
        .trim()
        .replace(/\/+$/, '');
      const existingStoreCd = localStorage.getItem('LM_STORE_CD') || '';
      // 강제 부트스트랩(2-Tier 초기 셋업 등) 시 기본 데모 코드('H01-SE-001')는 서버 자동 매장 탐색을 막지 않도록 제외
      const effectiveQueryStoreCd =
        options?.force && existingStoreCd === DEFAULT_KIOSK_SETTINGS.storeCode
          ? ''
          : existingStoreCd;
      const query = effectiveQueryStoreCd ? `?store_cd=${encodeURIComponent(effectiveQueryStoreCd)}` : '';

      // 초기 잘못된 apiUrl로 인해 오프라인 폴백으로 PIN 인증한 직후 새 2-Tier 서버 주소로 부트스트랩할 때 세션 토큰 자동 교환
      if (!sessionToken && pendingOfflineVerifiedPin && options?.allowAuthenticatedLan) {
        try {
          const verifyRes = await fetch(`${baseUrl}/api/v1/kiosk/verify-admin-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_cd: effectiveQueryStoreCd || DEFAULT_KIOSK_SETTINGS.storeCode,
              device_id: current.deviceId,
              pin: pendingOfflineVerifiedPin,
            }),
            signal: AbortSignal.timeout(2500),
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData?.valid && verifyData?.pin_session_token) {
              sessionToken = String(verifyData.pin_session_token);
              kioskAdminSessionToken = sessionToken;
              pendingOfflineVerifiedPin = null;
            }
          }
        } catch {
          // 무시 후 루프백인 경우 무인증 부트스트랩 시도
        }
      }

      if (!isLoopback && !(options?.allowAuthenticatedLan && sessionToken)) {
        return null;
      }

      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers['X-Kiosk-Admin-Token'] = sessionToken;
      }

      const res = await fetch(`${baseUrl}/api/v1/kiosk/local-bootstrap${query}`, { headers });
      if (!res.ok) return null;

      const data = await res.json();
      if (!data?.store_cd) return null;

      return saveKioskSettings(
        {
          apiUrl: baseUrl,
          storeCode: data.store_cd || effectiveQueryStoreCd || current.storeCode,
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
  const [settings, setSettings] = useState<KioskSettings>(() => getKioskSettings());

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getKioskSettings());
    };
    window.addEventListener('kiosk-settings-changed', handleUpdate);
    handleUpdate();
    void bootstrapLocalKioskSettings();
    return () => window.removeEventListener('kiosk-settings-changed', handleUpdate);
  }, []);

  const updateSettings = (newSettings: Partial<KioskSettings>, options?: SaveKioskSettingsOptions) => {
    const updated = saveKioskSettings(newSettings, options);
    setSettings(updated);
  };

  return { settings, updateSettings };
}
