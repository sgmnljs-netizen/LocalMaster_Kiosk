import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  sha256Hex,
  computeOwnerPinDigest,
  verifyOfflineAdminOrEngineerPin,
  normalizeVanProviderType,
  resolveVanStatusEndpointPath,
  setKioskAdminSessionToken,
  clearKioskAdminSession,
  saveKioskSettings,
  getKioskSettings,
  pushKioskDeviceSettingsToServer,
  DEFAULT_KIOSK_SETTINGS,
} from '../../stores/kioskSettings';

const storageMap = new Map<string, string>();
const localStoragePolyfill = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).localStorage = localStoragePolyfill;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: {
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '5179',
      pathname: '/',
      search: '',
      origin: 'http://127.0.0.1:5179',
    },
    localStorage: localStoragePolyfill,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('Tier 1 Critical Hardening Guards ([C-1] ~ [C-4])', () => {
  let api: typeof import('../api').api;
  let isDemoEnvironment: typeof import('../api').isDemoEnvironment;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
    isDemoEnvironment = mod.isDemoEnvironment;
  });

  beforeEach(() => {
    localStorage.clear();
    clearKioskAdminSession();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearKioskAdminSession();
    vi.restoreAllMocks();
  });

  describe('[C-1] Production Demo Isolation & Dynamic Store Code', () => {
    it('keeps isDemoEnvironment() false for real store codes and returns dynamic getStoreCd()', () => {
      localStorage.setItem('LM_STORE_CD', 'S_REAL_901');
      localStorage.setItem(
        'lm-kiosk-settings',
        JSON.stringify({
          ...DEFAULT_KIOSK_SETTINGS,
          storeCode: 'S_REAL_901',
        })
      );

      expect(isDemoEnvironment()).toBe(false);
      expect(api.getStoreCd()).toBe('S_REAL_901');
    });

    it('never fabricates 50 fake demo bays in non-demo production when offline', async () => {
      localStorage.setItem('LM_STORE_CD', 'S_REAL_902');
      localStorage.setItem('LM_BAYS', JSON.stringify([]));
      localStorage.setItem(
        'lm-kiosk-settings',
        JSON.stringify({
          ...DEFAULT_KIOSK_SETTINGS,
          storeCode: 'S_REAL_902',
        })
      );
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const bays = await api.getBays();
      expect(bays).toEqual([]);
      expect(bays.length).not.toBe(50);
    });
  });

  describe('[C-3] Option A Admin PIN Security & VAN Provider Normalization', () => {
    it('computes pure-JS SHA-256 hex digest without requiring WebCrypto SecureContext', () => {
      expect(sha256Hex('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
    });

    it('blocks dummy PINs (0000, 1111, 1234) once custom PIN is set while allowing Owner & Segnet Engineer PIN', () => {
      expect(verifyOfflineAdminOrEngineerPin('0000', '9876', true)).toEqual({ valid: false });
      expect(verifyOfflineAdminOrEngineerPin('1111', '9876', true)).toEqual({ valid: false });
      expect(verifyOfflineAdminOrEngineerPin('1234', '9876', true)).toEqual({ valid: false });

      expect(verifyOfflineAdminOrEngineerPin('9876', '9876', true)).toEqual({
        valid: true,
        role: 'OWNER',
      });

      const engPin = String(2100 + 86);
      expect(verifyOfflineAdminOrEngineerPin(engPin, '9876', true)).toEqual({
        valid: true,
        role: 'ENGINEER',
      });
    });

    it('blocks stale local 0000 if server flagged hasCustomAdminPin=true, while still allowing Engineer recovery', () => {
      expect(verifyOfflineAdminOrEngineerPin('0000', '0000', true)).toEqual({ valid: false });
      const engPin = String(2100 + 86);
      expect(verifyOfflineAdminOrEngineerPin(engPin, '0000', true)).toEqual({
        valid: true,
        role: 'ENGINEER',
      });
    });

    it('allows initial 0000 only when no custom PIN has been configured yet (rejecting 1111/1234)', () => {
      expect(verifyOfflineAdminOrEngineerPin('0000', '0000', false)).toEqual({
        valid: true,
        role: 'OWNER',
      });
      expect(verifyOfflineAdminOrEngineerPin('1111', '0000', false)).toEqual({ valid: false });
      expect(verifyOfflineAdminOrEngineerPin('1234', '0000', false)).toEqual({ valid: false });
    });

    it('normalizes VAN provider codes and maps daemon status paths accurately', () => {
      expect(normalizeVanProviderType('KCP')).toBe('KCP_VAN');
      expect(normalizeVanProviderType('SMARTRO')).toBe('SMARTRO_VAN');
      expect(normalizeVanProviderType('NICE')).toBe('NICE_VAN');
      expect(normalizeVanProviderType('KOCES')).toBe('KOCES_VAN');

      expect(resolveVanStatusEndpointPath('KCP_VAN')).toBe('/vcat/status');
      expect(resolveVanStatusEndpointPath('KOCES_VAN')).toBe('/vcat/status');
      expect(resolveVanStatusEndpointPath('NICE')).toBe('/nice/status');
      expect(resolveVanStatusEndpointPath('SMARTRO')).toBe('/smartro/status');
    });

    it('attaches X-Kiosk-Admin-Token and omits admin_pin when unchanged in pushKioskDeviceSettingsToServer', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ store_cd: 'S_PIN_TEST', has_saved_settings: true, settings: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      setKioskAdminSessionToken('tok_hmac_valid_123');
      const ok = await pushKioskDeviceSettingsToServer({
        ...DEFAULT_KIOSK_SETTINGS,
        storeCode: 'S_PIN_TEST',
        providerType: 'SMARTRO',
      });

      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, reqInit] = fetchMock.mock.calls[0];
      const headers = reqInit?.headers as Record<string, string>;
      const parsedBody = JSON.parse(String(reqInit?.body));

      expect(headers['X-Kiosk-Admin-Token']).toBe('tok_hmac_valid_123');
      expect(parsedBody.provider_type).toBe('SMARTRO_VAN');
      expect('admin_pin' in parsedBody).toBe(false);
    });

    it('never persists plaintext adminPin in localStorage and verifies offline owner PIN via salted SHA-256 digest', () => {
      const saved = saveKioskSettings(
        { storeCode: 'S_DIGEST_ONLY' },
        { syncRemote: false, newAdminPin: '7531' }
      );
      const rawStored = JSON.parse(localStorage.getItem('lm-kiosk-settings') || '{}');

      expect(saved.adminPin).toBe('');
      expect(rawStored.adminPin).toBe('');
      expect(rawStored.adminPinDigest).toBe(computeOwnerPinDigest('7531'));
      expect(JSON.stringify(rawStored)).not.toContain('7531');

      const reloaded = getKioskSettings();
      expect(
        verifyOfflineAdminOrEngineerPin('7531', reloaded.adminPin, reloaded.hasCustomAdminPin, reloaded.adminPinDigest)
      ).toEqual({ valid: true, role: 'OWNER' });
      expect(
        verifyOfflineAdminOrEngineerPin('0000', reloaded.adminPin, reloaded.hasCustomAdminPin, reloaded.adminPinDigest)
      ).toEqual({ valid: false });
    });
  });

  describe('[C-4] Sub-Merchant Terminal Routing 422 Fail-Fast Contract', () => {
    it('propagates HTTP 422 error=true when sub-merchant terminal routing fails', async () => {
      localStorage.setItem('LM_STORE_CD', 'S_PAR3_01');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ detail: '서브 사업자 전용 단말기(TID)가 매핑되지 않았습니다.' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const routeRes = await api.resolveTerminalRoute('dev-3', 'SUB_MERCH_01', 'SUB', null);
      expect(routeRes.error).toBe(true);
      expect(routeRes.status).toBe(422);
      expect(routeRes.terminal_id).toBe('');
      expect(routeRes.message).toContain('서브 사업자');
    });
  });
});
