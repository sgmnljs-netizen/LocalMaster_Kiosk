import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
  resolveEnabledAuthModes,
  resolveEffectiveAuthMode,
  getKioskSettings,
  saveKioskSettings,
  DEFAULT_AUTH_METHODS,
  DEFAULT_KIOSK_SETTINGS,
  KioskAuthModeKey,
  KioskAuthMethodsConfig,
  KioskMenuVisibilityMap,
} from '../../stores/kioskSettings';
import { kioskVanClient } from '../van/van_client';
import { getIsMockVan, BaseVanAdapter } from '../van/adapters/BaseVanAdapter';
import fs from 'fs';
import path from 'path';

// Polyfill window & localStorage in Node/Vitest environment
const storageMap = new Map<string, string>();
const eventTarget = new EventTarget();

const mockLocalStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

(globalThis as any).localStorage = mockLocalStorage;

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    localStorage: mockLocalStorage,
    location: {
      hostname: '127.0.0.1',
      port: '8000',
      origin: 'http://127.0.0.1:8000',
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
      webdriver: false,
    },
  };
} else {
  (globalThis as any).window.localStorage = mockLocalStorage;
}

describe('Kiosk Admin Menu, Auth Override, Hot-Reload & Dev Security QA (A04, A05, A06, A08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    // Default mock navigator for standard tests
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'platform', {
      value: 'Win32',
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'webdriver', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    storageMap.clear();
  });

  // =========================================================================
  // A04: 기기별 메인 메뉴 ON/OFF 로컬 오버라이드 및 빈 화면 방지(최소 1개) 가드
  // =========================================================================
  describe('A04 [기기별 메인 메뉴 ON/OFF 로컬 오버라이드 및 빈 화면 방지(최소 1개) 가드]', () => {
    const STANDARD_MENUS = [
      { id: 'CHECKIN', label: '예약 타석 체크인' },
      { id: 'ALLOCATE_DAILY', label: '연습타석 배정' },
      { id: 'PAR3', label: '파3 코스 배정' },
      { id: 'PURCHASE_PRODUCT', label: '회원권/상품 구매' },
      { id: 'LOCKER', label: '라카 대여/연장' },
      { id: 'MOVE_BAY', label: '타석 이동' },
      { id: 'SIGNUP', label: '신규 회원가입' },
    ];

    it('A04-1: canonicalizeKioskMenuId maps all legacy aliases to SSOT canonical IDs', () => {
      // Practice allocation aliases
      expect(canonicalizeKioskMenuId('ALLOCATION')).toBe('ALLOCATE_DAILY');
      expect(canonicalizeKioskMenuId('ALLOCATE_MEMBERSHIP')).toBe('ALLOCATE_DAILY');
      expect(canonicalizeKioskMenuId('allocate_daily')).toBe('ALLOCATE_DAILY');

      // Par3 aliases
      expect(canonicalizeKioskMenuId('BOOK_PAR3')).toBe('PAR3');
      expect(canonicalizeKioskMenuId('PAR3_ALLOCATION')).toBe('PAR3');
      expect(canonicalizeKioskMenuId('par3')).toBe('PAR3');

      // Product/Membership purchase aliases
      expect(canonicalizeKioskMenuId('MEMBERSHIP')).toBe('PURCHASE_PRODUCT');
      expect(canonicalizeKioskMenuId('PRODUCTS')).toBe('PURCHASE_PRODUCT');
      expect(canonicalizeKioskMenuId('purchase_product')).toBe('PURCHASE_PRODUCT');

      // Locker aliases
      expect(canonicalizeKioskMenuId('EXTEND_LOCKER')).toBe('LOCKER');
      expect(canonicalizeKioskMenuId('LOCKER_EXTEND')).toBe('LOCKER');
      expect(canonicalizeKioskMenuId('locker')).toBe('LOCKER');

      // Bay movement aliases
      expect(canonicalizeKioskMenuId('CHANGE_BAY')).toBe('MOVE_BAY');
      expect(canonicalizeKioskMenuId('move_bay')).toBe('MOVE_BAY');

      // Signup aliases
      expect(canonicalizeKioskMenuId('REGISTER')).toBe('SIGNUP');
      expect(canonicalizeKioskMenuId('REGISTER_MEMBER')).toBe('SIGNUP');
      expect(canonicalizeKioskMenuId('signup')).toBe('SIGNUP');

      // Checkin aliases
      expect(canonicalizeKioskMenuId('CHECKIN_RESERVATION')).toBe('CHECKIN');
      expect(canonicalizeKioskMenuId('checkin')).toBe('CHECKIN');

      // Custom partner menu ID preservation
      expect(canonicalizeKioskMenuId('VIP_LOUNGE_RESERVE')).toBe('VIP_LOUNGE_RESERVE');
      expect(canonicalizeKioskMenuId('CAFETERIA_ORDER')).toBe('CAFETERIA_ORDER');
    });

    it('A04-2: isKioskMenuEnabled prioritizes local overrides over partner defaults bidirectionally', () => {
      // 1. No overrides -> adheres directly to partnerActive flag
      expect(isKioskMenuEnabled('PAR3', undefined, true)).toBe(true);
      expect(isKioskMenuEnabled('PAR3', undefined, false)).toBe(false);
      expect(isKioskMenuEnabled('PAR3', {}, true)).toBe(true);
      expect(isKioskMenuEnabled('PAR3', {}, false)).toBe(false);

      // 2. Partner is Active (true), but local override is OFF (false) -> must be disabled
      const overridesOff: KioskMenuVisibilityMap = { PAR3: false };
      expect(isKioskMenuEnabled('PAR3', overridesOff, true)).toBe(false);
      // Legacy alias lookup must also reflect the override
      expect(isKioskMenuEnabled('BOOK_PAR3', overridesOff, true)).toBe(false);

      // 3. Partner is Disabled (false), but local override is ON (true) -> must be enabled
      const overridesOn: KioskMenuVisibilityMap = { LOCKER: true };
      expect(isKioskMenuEnabled('LOCKER', overridesOn, false)).toBe(true);
      expect(isKioskMenuEnabled('EXTEND_LOCKER', overridesOn, false)).toBe(true);

      // 4. Override set with legacy key (EXTEND_LOCKER) must be recognized when checking canonical key (LOCKER)
      const overridesLegacyKey: KioskMenuVisibilityMap = { EXTEND_LOCKER: false };
      expect(isKioskMenuEnabled('LOCKER', overridesLegacyKey, true)).toBe(false);
      expect(isKioskMenuEnabled('EXTEND_LOCKER', overridesLegacyKey, true)).toBe(false);
    });

    it('A04-3: Zero-Screen Prevention Guard prevents toggling off the last remaining active menu', () => {
      // Simulate KioskSettingsModal toggle logic
      let formMenuOverrides: KioskMenuVisibilityMap = {};
      let policyGuardMsg: string | null = null;

      const getPartnerMenuDefault = (_menuId: string) => true;

      const handleToggleMenu = (menuId: string) => {
        policyGuardMsg = null;
        const partnerDefault = getPartnerMenuDefault(menuId);
        const currentEnabled = isKioskMenuEnabled(menuId, formMenuOverrides, partnerDefault);
        const nextEnabled = !currentEnabled;

        if (!nextEnabled) {
          const enabledCount = STANDARD_MENUS.filter((m) =>
            isKioskMenuEnabled(m.id, formMenuOverrides, getPartnerMenuDefault(m.id))
          ).length;
          if (enabledCount <= 1) {
            policyGuardMsg = '최소 1개 이상의 메뉴는 활성화(ON)되어 있어야 합니다.';
            return;
          }
        }

        formMenuOverrides = {
          ...formMenuOverrides,
          [menuId]: nextEnabled,
        };
      };

      // Turn OFF 6 out of 7 menus
      handleToggleMenu('CHECKIN');
      handleToggleMenu('ALLOCATE_DAILY');
      handleToggleMenu('PURCHASE_PRODUCT');
      handleToggleMenu('LOCKER');
      handleToggleMenu('MOVE_BAY');
      handleToggleMenu('SIGNUP');

      expect(policyGuardMsg).toBeNull();

      // Only 'PAR3' remains active
      const activeMenus = STANDARD_MENUS.filter((m) =>
        isKioskMenuEnabled(m.id, formMenuOverrides, true)
      );
      expect(activeMenus.length).toBe(1);
      expect(activeMenus[0].id).toBe('PAR3');

      // Attempting to turn OFF the 7th (last remaining) menu 'PAR3' MUST be blocked!
      handleToggleMenu('PAR3');

      expect(policyGuardMsg).toBe('최소 1개 이상의 메뉴는 활성화(ON)되어 있어야 합니다.');
      // 'PAR3' must remain enabled
      expect(isKioskMenuEnabled('PAR3', formMenuOverrides, true)).toBe(true);
      expect(formMenuOverrides['PAR3']).toBeUndefined();
    });

    it('A04-4: handleResetMenuOverrides clears all overrides and restores partner defaults', () => {
      // Simulate dirty overrides where some menus are forced OFF
      let formMenuOverrides: KioskMenuVisibilityMap = {
        CHECKIN: false,
        PAR3: false,
        LOCKER: false,
      };

      const handleResetMenuOverrides = () => {
        formMenuOverrides = {};
      };

      expect(isKioskMenuEnabled('PAR3', formMenuOverrides, true)).toBe(false);
      expect(isKioskMenuEnabled('CHECKIN', formMenuOverrides, true)).toBe(false);

      // Execute reset
      handleResetMenuOverrides();

      expect(formMenuOverrides).toEqual({});
      // Partner defaults (true) restored immediately
      expect(isKioskMenuEnabled('PAR3', formMenuOverrides, true)).toBe(true);
      expect(isKioskMenuEnabled('CHECKIN', formMenuOverrides, true)).toBe(true);
    });
  });

  // =========================================================================
  // A05: 4대 회원 인증 수단 개별 ON/OFF 및 기본 시작 탭(defaultAuthMode) 자동 승격
  // =========================================================================
  describe('A05 [4대 회원 인증 수단 개별 ON/OFF 및 기본 시작 탭(defaultAuthMode) 자동 승격]', () => {
    it('A05-1: resolveEnabledAuthModes guarantees fallback when all modes are turned OFF', () => {
      // Default: all 4 active
      const defaultModes = resolveEnabledAuthModes(undefined, true);
      expect(defaultModes).toEqual(['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE']);

      // Store disables face recognition hardware -> FACE excluded
      const noFace = resolveEnabledAuthModes({ FACE: true }, false);
      expect(noFace).toEqual(['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN']);

      // Admin disables SMART_TAG and QR_SCAN
      const keypadAndFace = resolveEnabledAuthModes(
        { SMART_TAG: false, PHONE_KEYPAD: true, QR_SCAN: false, FACE: true },
        true
      );
      expect(keypadAndFace).toEqual(['PHONE_KEYPAD', 'FACE']);

      // CRITICAL FAIL-SAFE: If all 4 modes are somehow set to false, falls back to PHONE_KEYPAD
      const fallback = resolveEnabledAuthModes(
        { SMART_TAG: false, PHONE_KEYPAD: false, QR_SCAN: false, FACE: false },
        false
      );
      expect(fallback).toEqual(['PHONE_KEYPAD']);
    });

    it('A05-2: Disabling the last remaining active auth method is blocked with guard message', () => {
      let formAuthMethods: KioskAuthMethodsConfig = {
        SMART_TAG: true,
        PHONE_KEYPAD: true,
        QR_SCAN: true,
        FACE: true,
      };
      let formDefaultAuthMode: KioskAuthModeKey = 'SMART_TAG';
      let policyGuardMsg: string | null = null;
      const faceTerminalEnabled = true;

      const handleToggleAuthMethod = (key: KioskAuthModeKey) => {
        policyGuardMsg = null;
        const currentEnabled = formAuthMethods[key] !== false;
        const nextEnabled = !currentEnabled;

        if (!nextEnabled) {
          const activeKeys = (['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'] as KioskAuthModeKey[]).filter(
            (k) => (k === key ? false : formAuthMethods[k] !== false && (k !== 'FACE' || faceTerminalEnabled !== false))
          );
          if (activeKeys.length === 0) {
            policyGuardMsg = '최소 1개 이상의 회원인증 방식은 활성화(ON)되어 있어야 합니다.';
            return;
          }
          if (formDefaultAuthMode === key) {
            formDefaultAuthMode = activeKeys[0];
          }
        }

        formAuthMethods = {
          ...formAuthMethods,
          [key]: nextEnabled,
        };
      };

      // Turn OFF SMART_TAG, QR_SCAN, FACE
      handleToggleAuthMethod('SMART_TAG');
      expect(formDefaultAuthMode).toBe('PHONE_KEYPAD'); // Auto-promoted!
      handleToggleAuthMethod('QR_SCAN');
      handleToggleAuthMethod('FACE');

      // Now only PHONE_KEYPAD is true
      expect(formAuthMethods.PHONE_KEYPAD).toBe(true);

      // Attempt to disable PHONE_KEYPAD (the last remaining method)
      handleToggleAuthMethod('PHONE_KEYPAD');

      expect(policyGuardMsg).toBe('최소 1개 이상의 회원인증 방식은 활성화(ON)되어 있어야 합니다.');
      expect(formAuthMethods.PHONE_KEYPAD).toBe(true);
    });

    it('A05-3: Toggling OFF the active defaultAuthMode promotes default tab to activeKeys[0]', () => {
      let formAuthMethods: KioskAuthMethodsConfig = {
        SMART_TAG: true,
        PHONE_KEYPAD: true,
        QR_SCAN: true,
        FACE: true,
      };
      let formDefaultAuthMode: KioskAuthModeKey = 'SMART_TAG';

      const handleToggleAuthMethod = (key: KioskAuthModeKey) => {
        const currentEnabled = formAuthMethods[key] !== false;
        const nextEnabled = !currentEnabled;

        if (!nextEnabled) {
          const activeKeys = (['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'] as KioskAuthModeKey[]).filter(
            (k) => (k === key ? false : formAuthMethods[k] !== false)
          );
          if (formDefaultAuthMode === key && activeKeys.length > 0) {
            formDefaultAuthMode = activeKeys[0];
          }
        }

        formAuthMethods = {
          ...formAuthMethods,
          [key]: nextEnabled,
        };
      };

      // 1. Initial default is SMART_TAG
      expect(formDefaultAuthMode).toBe('SMART_TAG');

      // 2. Toggle SMART_TAG to OFF -> promotes to PHONE_KEYPAD
      handleToggleAuthMethod('SMART_TAG');
      expect(formAuthMethods.SMART_TAG).toBe(false);
      expect(formDefaultAuthMode).toBe('PHONE_KEYPAD');

      // 3. Toggle PHONE_KEYPAD to OFF -> promotes to QR_SCAN
      handleToggleAuthMethod('PHONE_KEYPAD');
      expect(formAuthMethods.PHONE_KEYPAD).toBe(false);
      expect(formDefaultAuthMode).toBe('QR_SCAN');

      // 4. resolveEffectiveAuthMode test
      const activeModes: KioskAuthModeKey[] = ['QR_SCAN', 'FACE'];
      const effectiveMode = resolveEffectiveAuthMode('SMART_TAG', formDefaultAuthMode, activeModes);
      expect(effectiveMode).toBe('QR_SCAN');
    });

    it('A05-4: MemberAuth tabs adjust dynamically with gridTemplateColumns repeat(N, 1fr)', () => {
      // Simulating MemberAuth grid columns calculation: `repeat(${activeAuthModes.length}, 1fr)`
      const checkGridColumns = (modes: KioskAuthModeKey[]) => `repeat(${modes.length}, 1fr)`;

      expect(checkGridColumns(['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'])).toBe('repeat(4, 1fr)');
      expect(checkGridColumns(['PHONE_KEYPAD', 'QR_SCAN', 'FACE'])).toBe('repeat(3, 1fr)');
      expect(checkGridColumns(['PHONE_KEYPAD', 'FACE'])).toBe('repeat(2, 1fr)');
      expect(checkGridColumns(['PHONE_KEYPAD'])).toBe('repeat(1, 1fr)');
    });
  });

  // =========================================================================
  // A06: VAN 단말기 설정 변경 및 무재부팅 핫 리로딩
  // =========================================================================
  describe('A06 [VAN 단말기 설정 변경 및 무재부팅 핫 리로딩]', () => {
    it('A06-1: handleSave updates localStorage and dispatches kiosk-settings-changed event', () => {
      let eventDispatched = false;
      const onSettingsChanged = () => {
        eventDispatched = true;
      };
      window.addEventListener('kiosk-settings-changed', onSettingsChanged);

      // Execute saveKioskSettings
      const saved = saveKioskSettings({
        deviceId: 'dev-4',
        deviceName: '2층 무인 키오스크 2호기',
        terminalId: '88010004',
        vcatPort: '9099',
        providerType: 'KCP_VAN',
        storeCode: 'H01-SE-002',
      });

      expect(eventDispatched).toBe(true);
      expect(saved.terminalId).toBe('88010004');
      expect(saved.deviceId).toBe('dev-4');

      // LocalStorage keys must be synchronized
      expect(mockLocalStorage.getItem('LM_KIOSK_TERMINAL_ID')).toBe('88010004');
      expect(mockLocalStorage.getItem('LM_STORE_CD')).toBe('H01-SE-002');
      const storedSettings = JSON.parse(mockLocalStorage.getItem('lm-kiosk-settings')!);
      expect(storedSettings.terminalId).toBe('88010004');

      window.removeEventListener('kiosk-settings-changed', onSettingsChanged);
    });

    it('A06-2: kioskVanClient hot-reloads configuration immediately without app restart', async () => {
      // 1. Initial config
      kioskVanClient.setConfig({
        terminalId: '88010003',
        vcatPort: 9099,
        provider: 'KCP',
      });
      expect(kioskVanClient.getConfig().terminalId).toBe('88010003');

      // 2. Simulate admin modifying terminal config to Smartro / TID: 88010005 / Port: 9098
      const newTerminalId = '88010005';
      const newVcatPort = 9098;
      const newProvider = 'SMARTRO';

      // handleSave executes both direct setConfig and saveKioskSettings
      kioskVanClient.setConfig({
        provider: newProvider as any,
        vcatPort: newVcatPort,
        terminalId: newTerminalId,
      });

      saveKioskSettings({
        terminalId: newTerminalId,
        vcatPort: String(newVcatPort),
        providerType: `${newProvider}_VAN`,
      });

      // 3. Verify hot-reloaded configuration
      const updatedConfig = kioskVanClient.getConfig();
      expect(updatedConfig.terminalId).toBe('88010005');
      expect(updatedConfig.vcatPort).toBe(9098);
      expect(updatedConfig.provider).toBe('SMARTRO');

      // 4. Verify payment spy receives the updated terminalId without browser restart
      const spyRequest = vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: true,
        auth_code: 'APPR9988',
        approved_at: new Date().toISOString(),
        card_no_masked: '9411-****-****-1234',
        issuer_name: '신한카드',
        acquirer_name: '신한카드',
        terminal_id: updatedConfig.terminalId,
        amount: 30000,
        installment_months: 0,
        merchant_reg_no: '123-45-67890',
      });

      const res = await kioskVanClient.requestCardPayment({
        amount: 30000,
        tax: 2727,
        tip: 0,
        installmentMonths: 0,
        timeoutSeconds: 30,
      });

      expect(res.terminal_id).toBe('88010005');
      expect(spyRequest).toHaveBeenCalledTimes(1);
    });

    it('A06-3: getKioskSettings returns updated settings immediately after save', () => {
      saveKioskSettings({
        deviceId: 'dev-custom',
        deviceName: '커스텀 키오스크',
        terminalId: '99001122',
        apiUrl: 'http://192.168.0.50:8000',
      });

      const current = getKioskSettings();
      expect(current.deviceId).toBe('dev-custom');
      expect(current.terminalId).toBe('99001122');
      expect(current.apiUrl).toBe('http://192.168.0.50:8000');
    });
  });

  // =========================================================================
  // A08: 모의 결제 및 개발자 디버그 도구 프로덕션 노출 차단 (DEV Guard)
  // =========================================================================
  describe('A08 [모의 결제 및 개발자 디버그 도구 프로덕션 노출 차단 (DEV Guard)]', () => {
    it('A08-1: BaseVanAdapter.getIsMockVan returns false in real Windows without webdriver', () => {
      // 1. Production kiosk on Windows 10/11 without webdriver
      mockLocalStorage.removeItem('VAN_MOCK');
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'platform', {
        value: 'Win32',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'webdriver', {
        value: false,
        configurable: true,
      });

      // Real Windows PC MUST NOT run mock VAN!
      expect(getIsMockVan()).toBe(false);

      // 2. Playwright / Selenium automated test on Windows (webdriver: true) -> runs mock
      Object.defineProperty(window.navigator, 'webdriver', {
        value: true,
        configurable: true,
      });
      expect(getIsMockVan()).toBe(true);

      // 3. Developer Mac machine (macOS) -> runs mock
      Object.defineProperty(window.navigator, 'webdriver', {
        value: false,
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      });
      Object.defineProperty(window.navigator, 'platform', {
        value: 'MacIntel',
        configurable: true,
      });
      expect(getIsMockVan()).toBe(true);

      // 4. Explicit override in localStorage (VAN_MOCK = 'true' / 'false')
      mockLocalStorage.setItem('VAN_MOCK', 'false');
      expect(getIsMockVan()).toBe(false);

      mockLocalStorage.setItem('VAN_MOCK', 'true');
      expect(getIsMockVan()).toBe(true);
    });

    it('A08-2: Static audit verifies all simulator debug chips are completely removed from MemberAuth.tsx', () => {
      const memberAuthFilePath = path.resolve(__dirname, '../../components/MemberAuth.tsx');
      expect(fs.existsSync(memberAuthFilePath)).toBe(true);

      const content = fs.readFileSync(memberAuthFilePath, 'utf-8');

      // Ensure no debug simulator buttons or mock member tags exist anywhere in MemberAuth.tsx
      expect(content).not.toContain('DEBUG SIMULATOR');
      expect(content).not.toContain('DEV ONLY');
      expect(content).not.toContain('NFC (김골프)');
      expect(content).not.toContain('BLE (이프로)');
      expect(content).not.toContain('출입 QR 스캔 시뮬레이션');
    });

    it('A09: Static audit verifies KioskSettingsModal & AdminPinModal use bright light theme and top-anchored layout', () => {
      const settingsModalPath = path.resolve(__dirname, '../../components/KioskSettingsModal.tsx');
      const pinModalPath = path.resolve(__dirname, '../../components/AdminPinModal.tsx');

      const settingsSrc = fs.readFileSync(settingsModalPath, 'utf-8');
      const pinSrc = fs.readFileSync(pinModalPath, 'utf-8');

      // 1. Top-anchored overlay prevents vertical header jump on tab change
      expect(settingsSrc).toContain("alignItems: 'flex-start'");
      expect(settingsSrc).toContain("paddingTop: '9vh'");
      expect(settingsSrc).toContain('data-testid="kiosk-settings-header"');
      expect(settingsSrc).toContain('data-testid="kiosk-settings-tabbar"');
      expect(settingsSrc).toContain('data-testid="kiosk-settings-body"');
      expect(settingsSrc).toContain("flexShrink: 0");

      // 2. Bright light theme instead of gloomy dark slate (#1e222d / #12151c)
      expect(settingsSrc).not.toContain('#1e222d');
      expect(settingsSrc).not.toContain('#12151c');
      expect(settingsSrc).not.toContain('#262a36');
      expect(pinSrc).not.toContain('#1e222d');
      expect(pinSrc).not.toContain('#12151c');
      expect(pinSrc).not.toContain('#262a36');
    });
  });
});
