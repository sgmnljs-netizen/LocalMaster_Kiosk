import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyVirtualKeyAction, assembleHangul } from '../../components/VirtualKeyboard';
import {
  bootstrapLocalKioskSettings,
  clearKioskAdminSession,
  getKioskSettings,
  setKioskAdminSessionToken,
} from '../../stores/kioskSettings';

const KIOSK_ROOT = path.resolve(__dirname, '../../../');

const storageMap = new Map<string, string>();
const sessionMap = new Map<string, string>();
const createStoragePolyfill = (backing: Map<string, string>) => ({
  getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
  setItem: (k: string, v: string) => backing.set(k, String(v)),
  removeItem: (k: string) => backing.delete(k),
  clear: () => backing.clear(),
});
const localStoragePolyfill = createStoragePolyfill(storageMap);
const sessionStoragePolyfill = createStoragePolyfill(sessionMap);

(globalThis as unknown as Record<string, unknown>).localStorage = localStoragePolyfill;
(globalThis as unknown as Record<string, unknown>).sessionStorage = sessionStoragePolyfill;
if (typeof (globalThis as unknown as Record<string, unknown>).window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = {
    location: {
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '5179',
      pathname: '/',
      search: '',
      origin: 'http://127.0.0.1:5179',
    },
    localStorage: localStoragePolyfill,
    sessionStorage: sessionStoragePolyfill,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('Kiosk Phase 2 Hardening — Electron Shell ([C-5]) & Touch VirtualKeyboard ([H-1])', () => {
  const originalLocation = window.location;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearKioskAdminSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    globalThis.fetch = originalFetch;
  });

  describe('[C-5] Electron Shell & Windows Launcher 2-Tier PNA / Auto-Recovery Guards', () => {
    it('configures PNA bypass, dynamic insecure-origin allowlist, win32 High-DPI, and crash/boot auto-recovery in electron/main.cjs', () => {
      const mainCjs = fs.readFileSync(path.join(KIOSK_ROOT, 'electron/main.cjs'), 'utf8');

      // 1. PNA & dynamic origin switches
      expect(mainCjs).toContain('BlockInsecurePrivateNetworkRequests');
      expect(mainCjs).toContain('PrivateNetworkAccessSendPreflights');
      expect(mainCjs).toContain('PrivateNetworkAccessRespectPreflightResults');
      expect(mainCjs).toContain('PrivateNetworkAccessPermissionPrompt');
      expect(mainCjs).toContain("app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure'");

      // 2. Windows-only High-DPI guard (protects macOS Retina)
      expect(mainCjs).toContain("if (process.platform === 'win32')");
      expect(mainCjs).toContain("app.commandLine.appendSwitch('force-device-scale-factor', '1')");

      // 3. Kiosk menu bar removal & touch context-menu / F5 / Alt+Arrow blocks
      expect(mainCjs).toContain('Menu.setApplicationMenu(null)');
      expect(mainCjs).toContain("mainWindow.webContents.on('context-menu'");
      expect(mainCjs).toContain("key === 'f5' || key === 'browserback' || key === 'browserforward'");
      expect(mainCjs).toContain("key === 'arrowleft' || key === 'arrowright' || key === 'home'");

      // 4. Power-on did-fail-load retry splash & render-process-gone crash auto-reload
      expect(mainCjs).toContain("mainWindow.webContents.on('did-fail-load'");
      expect(mainCjs).toContain('const retryDelayMs = loadRetryCount <= 2 ? 3000 : 5000');
      expect(mainCjs).toContain("mainWindow.webContents.on('render-process-gone'");
    });

    it('synchronizes PNA bypass, dynamic KIOSK_ORIGIN, and --kiosk-printing in run_kiosk_app.bat fallback', () => {
      const batContent = fs.readFileSync(
        path.join(KIOSK_ROOT, 'scripts/windows/run_kiosk_app.bat'),
        'utf8'
      );

      expect(batContent).toContain('BlockInsecurePrivateNetworkRequests');
      expect(batContent).toContain('--unsafely-treat-insecure-origin-as-secure=');
      expect(batContent).toContain('--kiosk-printing');
      expect(batContent).toContain('--force-device-scale-factor=1');
    });
  });

  describe('[C-5] Delayed Boot Recovery & 2-Tier Authenticated LAN Bootstrap', () => {
    it('recovers deviceKey automatically on retry when backend finishes booting after initial failure', async () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          hostname: '127.0.0.1',
          port: '8000',
          origin: 'http://127.0.0.1:8000',
        },
      });

      const fetchMock = vi
        .fn()
        // 1st attempt: backend not ready yet
        .mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'))
        // 2nd attempt (from KioskApp loadSettings / online recovery): backend ready
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'ok',
            store_cd: 'S-DELAY-01',
            store_nm: '지연부팅 복구매장',
            device_key: 'DK_RECOVERED_AFTER_BOOT',
            device_id: 'DEV-KIOSK-01',
            device_name: '1층 키오스크',
            terminal_id: '88017777',
            vcat_port: '9099',
            provider_type: 'KCP_VAN',
          }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const first = await bootstrapLocalKioskSettings();
      expect(first).toBeNull();
      expect(getKioskSettings().deviceKey).toBe('');

      const second = await bootstrapLocalKioskSettings();
      expect(second).not.toBeNull();
      expect(second?.storeCode).toBe('S-DELAY-01');
      expect(second?.deviceKey).toBe('DK_RECOVERED_AFTER_BOOT');
      expect(second?.terminalId).toBe('88017777');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('blocks unauthenticated 2-Tier LAN bootstrap on client, but allows force bootstrap with X-Kiosk-Admin-Token and strips default demo store_cd', async () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          hostname: '192.168.0.10',
          port: '8000',
          origin: 'http://192.168.0.10:8000',
        },
      });
      localStorage.setItem('LM_STORE_CD', 'H01-SE-001');

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          store_cd: 'S-2TIER-LAN',
          store_nm: '2-Tier 분리형 매장',
          device_key: 'DK_2TIER_PROVISIONED',
          device_id: 'DEV-KIOSK-2T',
          device_name: '로비 키오스크',
          terminal_id: '88015555',
          vcat_port: '9099',
          provider_type: 'SMARTRO_VAN',
        }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Unauthenticated LAN call must short-circuit without hitting network
      const unauthResult = await bootstrapLocalKioskSettings();
      expect(unauthResult).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      // 2. Engineer/Owner PIN verified -> session token issued -> 1-click force bootstrap
      setKioskAdminSessionToken('HMAC_ADMIN_SESSION_TOKEN');
      const authResult = await bootstrapLocalKioskSettings({
        force: true,
        allowAuthenticatedLan: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0];
      // Must NOT append ?store_cd=H01-SE-001 so server discovers real seeded store S-2TIER-LAN
      expect(calledUrl).toBe('http://192.168.0.10:8000/api/v1/kiosk/local-bootstrap');
      expect((calledInit as RequestInit).headers).toMatchObject({
        'X-Kiosk-Admin-Token': 'HMAC_ADMIN_SESSION_TOKEN',
      });
      expect(authResult?.storeCode).toBe('S-2TIER-LAN');
      expect(authResult?.deviceKey).toBe('DK_2TIER_PROVISIONED');
      expect(authResult?.apiUrl).toBe('http://192.168.0.10:8000');
      expect(authResult?.providerType).toBe('SMARTRO_VAN');
    });

    it('exchanges pending offline-verified engineer PIN automatically when bootstrapping against a newly entered apiUrlOverride', async () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          hostname: '192.168.0.25',
          port: '5179',
          origin: 'http://192.168.0.25:5179',
        },
      });
      localStorage.setItem('LM_STORE_CD', 'H01-SE-001');

      // Engineer unlocked AdminPinModal while old apiUrl was offline -> token is null, offlinePinFallback stored
      setKioskAdminSessionToken(null, '2186');

      const fetchMock = vi
        .fn()
        // 1st call: automatic POST /verify-admin-pin against newly typed apiUrlOverride
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            valid: true,
            role: 'ENGINEER',
            pin_session_token: 'EXCHANGED_2TIER_TOKEN',
          }),
        })
        // 2nd call: GET /local-bootstrap with exchanged X-Kiosk-Admin-Token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'ok',
            store_cd: 'S-NEW-2TIER',
            store_nm: '신규 연결 2-Tier 매장',
            device_key: 'DK_EXCHANGED_KEY_77',
            device_id: 'DEV-KIOSK-77',
            device_name: '신규 키오스크',
            terminal_id: '88019090',
            vcat_port: '9099',
            provider_type: 'KCP_VAN',
          }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await bootstrapLocalKioskSettings({
        force: true,
        allowAuthenticatedLan: true,
        apiUrlOverride: 'http://192.168.0.10:8000/',
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://192.168.0.10:8000/api/v1/kiosk/verify-admin-pin'
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        'http://192.168.0.10:8000/api/v1/kiosk/local-bootstrap'
      );
      expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
        'X-Kiosk-Admin-Token': 'EXCHANGED_2TIER_TOKEN',
      });
      expect(result?.storeCode).toBe('S-NEW-2TIER');
      expect(result?.deviceKey).toBe('DK_EXCHANGED_KEY_77');
      expect(result?.apiUrl).toBe('http://192.168.0.10:8000');
    });
  });

  describe('[H-1] Multi-Mode VirtualKeyboard & Touch Lock Wiring', () => {
    it('handles COUPON_CODE uppercase normalization, symbol chips, backspace, clear, and maxLength', () => {
      let val = '';
      val = applyVirtualKeyAction(val, { type: 'CHAR', text: 'vip' }, { mode: 'COUPON_CODE' });
      val = applyVirtualKeyAction(val, { type: 'TOKEN', text: '-' }, { mode: 'COUPON_CODE' });
      val = applyVirtualKeyAction(
        val,
        { type: 'CHAR', text: '2026golf' },
        { mode: 'COUPON_CODE', maxLength: 10 }
      );
      expect(val).toBe('VIP-2026GO');

      val = applyVirtualKeyAction(val, { type: 'BACKSPACE' }, { mode: 'COUPON_CODE' });
      expect(val).toBe('VIP-2026G');

      val = applyVirtualKeyAction(val, { type: 'CLEAR' }, { mode: 'COUPON_CODE' });
      expect(val).toBe('');
    });

    it('handles ASCII_TEXT URL quick tokens (case-preserving for apiUrl/deviceKey, optional uppercase for storeCode)', () => {
      let url = '';
      url = applyVirtualKeyAction(url, { type: 'TOKEN', text: 'http://' }, { mode: 'ASCII_TEXT' });
      url = applyVirtualKeyAction(url, { type: 'TOKEN', text: '192.168.' }, { mode: 'ASCII_TEXT' });
      url = applyVirtualKeyAction(url, { type: 'CHAR', text: '0.10' }, { mode: 'ASCII_TEXT' });
      url = applyVirtualKeyAction(url, { type: 'TOKEN', text: ':8000' }, { mode: 'ASCII_TEXT' });
      expect(url).toBe('http://192.168.0.10:8000');

      const deviceKey = applyVirtualKeyAction(
        'dk_Live_',
        { type: 'CHAR', text: 'Key99' },
        { mode: 'ASCII_TEXT' }
      );
      expect(deviceKey).toBe('dk_Live_Key99');

      const storeCd = applyVirtualKeyAction(
        'h01-',
        { type: 'CHAR', text: 'gn-002' },
        { mode: 'ASCII_TEXT', uppercase: true }
      );
      expect(storeCd).toBe('H01-GN-002');
    });

    it('handles NUMERIC mode digit filtering and maxLength enforcement for vcatPort and adminPin', () => {
      const pin = applyVirtualKeyAction(
        '21',
        { type: 'CHAR', text: '86abc99' },
        { mode: 'NUMERIC', maxLength: 4 }
      );
      expect(pin).toBe('2186');

      const port = applyVirtualKeyAction(
        '',
        { type: 'CHAR', text: '290009' },
        { mode: 'NUMERIC', maxLength: 5 }
      );
      expect(port).toBe('29000');
    });

    it('preserves 100% backward-compatible 2-beolsik Hangul assembly for MemberRegister', () => {
      expect(assembleHangul(['ㅎ', 'ㅗ', 'ㅇ', 'ㄱ', 'ㅣ', 'ㄹ', 'ㄷ', 'ㅗ', 'ㅇ'])).toBe('홍길동');
      expect(assembleHangul(['ㄱ', 'ㅏ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅓ', 'ㅊ', 'ㅣ'])).toBe('값어치');
    });

    it('verifies IME-safe Enter guard in PaymentTerminal, 6-field VirtualKeyboard in KioskSettingsModal, and touch callout lock in CSS', () => {
      const paymentSrc = fs.readFileSync(
        path.join(KIOSK_ROOT, 'src/components/PaymentTerminal.tsx'),
        'utf8'
      );
      const settingsSrc = fs.readFileSync(
        path.join(KIOSK_ROOT, 'src/components/KioskSettingsModal.tsx'),
        'utf8'
      );
      const cssSrc = fs.readFileSync(
        path.join(KIOSK_ROOT, 'src/styles/kiosk_design_system.css'),
        'utf8'
      );

      // IME-safe Enter guard + coupon VirtualKeyboard
      expect(paymentSrc).toContain('e.nativeEvent.isComposing || e.keyCode === 229');
      expect(paymentSrc).toContain('mode="COUPON_CODE"');

      // 6 fields + 1-click auto bootstrap button in KioskSettingsModal
      expect(settingsSrc).toContain('data-testid="settings-auto-bootstrap-btn"');
      for (const field of ['terminalId', 'vcatPort', 'apiUrl', 'storeCode', 'deviceKey', 'adminPin']) {
        expect(settingsSrc).toContain(`setActiveKeyboardField('${field}')`);
      }

      // Touch callout disabled globally while preserving text cursor inside inputs
      expect(cssSrc).toContain('-webkit-touch-callout: none');
      expect(cssSrc).toContain('user-select: text');
    });
  });
});
