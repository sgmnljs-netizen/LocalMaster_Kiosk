import { describe, it, expect, beforeEach } from 'vitest';
import {
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
  resolveEnabledAuthModes,
  resolveEffectiveAuthMode,
  normalizeApiUrl,
  normalizeVanProviderType,
  resolveVanStatusEndpointPath,
  resolveDefaultVanPort,
  sha256Hex,
  computeOwnerPinDigest,
  verifyOfflineAdminOrEngineerPin,
  setKioskAdminSessionToken,
  getKioskAdminSessionToken,
  clearKioskAdminSession,
  getKioskSettings,
  saveKioskSettings,
} from '../kioskSettings';
import {
  getKioskHardwareHealth,
  setKioskHardwareHealth,
  setKioskHealthStatus,
  setVcatStatus,
  setPrinterStatus,
  setLastCheckedAt,
} from '../useKioskHardwareHealthStore';

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
Object.defineProperty(globalThis, 'window', {
  value: {
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
  },
  configurable: true,
  writable: true,
});

describe('W3-KSK-stores: 키오스크 설정 및 하드웨어 헬스 스토어 상태 전이 단위테스트', () => {
  beforeEach(() => {
    storageMap.clear();
    clearKioskAdminSession();
    setKioskHardwareHealth({
      vcatStatus: 'ONLINE',
      printerStatus: 'ONLINE',
      lastCheckedAt: null,
      vcatErrorMessage: null,
      printerErrorMessage: null,
    });
  });

  describe('kioskSettings: 메뉴 정규화·인증 수단 폴백·URL/VAN 정규화', () => {
    it('canonicalizeKioskMenuId 및 isKioskMenuEnabled가 레거시 별칭과 로컬 오버라이드를 일관되게 해석한다', () => {
      expect(canonicalizeKioskMenuId('allocation')).toBe('ALLOCATE_DAILY');
      expect(canonicalizeKioskMenuId('BOOK_PAR3')).toBe('PAR3');
      expect(canonicalizeKioskMenuId('products')).toBe('PURCHASE_PRODUCT');
      expect(canonicalizeKioskMenuId('extend_locker')).toBe('LOCKER');
      expect(canonicalizeKioskMenuId('change_bay')).toBe('MOVE_BAY');
      expect(canonicalizeKioskMenuId('register_member')).toBe('SIGNUP');
      expect(canonicalizeKioskMenuId('checkin_reservation')).toBe('CHECKIN');

      const overrides = { BOOK_PAR3: false, PURCHASE_PRODUCT: true };
      expect(isKioskMenuEnabled('PAR3', overrides, true)).toBe(false);
      expect(isKioskMenuEnabled('MEMBERSHIP', overrides, false)).toBe(true);
      expect(isKioskMenuEnabled('LOCKER', overrides, true)).toBe(true);
    });

    it('resolveEnabledAuthModes는 모든 수단이 꺼져도 최소 PHONE_KEYPAD를 보장하고 안면단말기 미사용 시 FACE를 제외한다', () => {
      const allOff = resolveEnabledAuthModes(
        { SMART_TAG: false, PHONE_KEYPAD: false, QR_SCAN: false, FACE: false },
        false
      );
      expect(allOff).toEqual(['PHONE_KEYPAD']);

      const noFaceHw = resolveEnabledAuthModes(
        { SMART_TAG: true, PHONE_KEYPAD: true, QR_SCAN: true, FACE: true },
        false
      );
      expect(noFaceHw).toEqual(['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN']);

      expect(resolveEffectiveAuthMode('FACE', 'FACE', noFaceHw)).toBe('SMART_TAG');
      expect(resolveEffectiveAuthMode('QR_SCAN', undefined, noFaceHw)).toBe('QR_SCAN');
    });

    it('normalizeApiUrl 및 멀티 VAN 포트/상태 엔드포인트 매핑이 정확하다', () => {
      expect(normalizeApiUrl('http://192.168.0.50:8000///')).toBe('http://192.168.0.50:8000/api');
      expect(normalizeApiUrl('http://192.168.0.50:8000/api/')).toBe('http://192.168.0.50:8000/api');

      expect(normalizeVanProviderType('nhn_kcp')).toBe('KCP_VAN');
      expect(normalizeVanProviderType('nice')).toBe('NICE_VAN');
      expect(normalizeVanProviderType('smartro')).toBe('SMARTRO_VAN');

      expect(resolveVanStatusEndpointPath('NICE')).toBe('/nice/status');
      expect(resolveVanStatusEndpointPath('SMARTRO_VAN')).toBe('/smartro/status');
      expect(resolveVanStatusEndpointPath('KCP')).toBe('/vcat/status');

      expect(resolveDefaultVanPort('NICE_VAN')).toBe('8088');
      expect(resolveDefaultVanPort('SMARTRO')).toBe('8089');
      expect(resolveDefaultVanPort('')).toBe('9099');
    });
  });

  describe('kioskSettings: 순수 SHA-256·오프라인 PIN 보안·세션 토큰 및 손상된 스토리지 방어', () => {
    it('sha256Hex가 표준 NIST 벡터(빈 문자열, abc, 64바이트 다중 블록)와 100% 일치한다', () => {
      expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
      );
    });

    it('saveKioskSettings는 평문 PIN을 localStorage에 절대 남기지 않고 다이제스트만 저장하며 오프라인 검증과 연동된다', () => {
      const saved = saveKioskSettings({ storeCode: 'S-TEST-01', terminalId: '88019999' }, { newAdminPin: '7391' });
      expect(saved.adminPin).toBe('');
      expect(saved.adminPinDigest).toBe(computeOwnerPinDigest('7391'));
      expect(saved.hasCustomAdminPin).toBe(true);

      const rawJson = storageMap.get('lm-kiosk-settings') || '';
      expect(rawJson).not.toContain('7391');
      expect(storageMap.get('LM_STORE_CD')).toBe('S-TEST-01');
      expect(storageMap.get('LM_KIOSK_TERMINAL_ID')).toBe('88019999');

      // 커스텀 PIN 설정 후 잘못된 PIN 및 비숫자 입력 차단
      expect(verifyOfflineAdminOrEngineerPin('12ab', undefined, true, saved.adminPinDigest).valid).toBe(false);
      expect(verifyOfflineAdminOrEngineerPin('0000', undefined, true, undefined).valid).toBe(false);
      expect(verifyOfflineAdminOrEngineerPin('7391', undefined, true, saved.adminPinDigest)).toEqual({
        valid: true,
        role: 'OWNER',
      });
    });

    it('손상된 JSON이나 비정상 minGapMinutes(<10) 저장 시에도 안전 기본값으로 자동 복구된다', () => {
      storageMap.set('lm-kiosk-settings', '{broken-json');
      const fallback = getKioskSettings();
      expect(fallback.deviceId).toBe('dev-3');

      storageMap.set('lm-kiosk-settings', JSON.stringify({ minGapMinutes: 3, storeCode: 'S-GAP' }));
      const sanitized = getKioskSettings();
      expect(sanitized.storeCode).toBe('S-GAP');
      expect(sanitized.minGapMinutes).toBeGreaterThanOrEqual(10);
    });

    it('인메모리 관리자 세션 토큰이 설정 및 초기화(clearKioskAdminSession) 시 대칭 정리된다', () => {
      expect(getKioskAdminSessionToken()).toBeNull();
      setKioskAdminSessionToken('tok_admin_123');
      expect(getKioskAdminSessionToken()).toBe('tok_admin_123');
      clearKioskAdminSession();
      expect(getKioskAdminSessionToken()).toBeNull();
    });
  });

  describe('useKioskHardwareHealthStore: 하드웨어 상태 전이', () => {
    it('VCAT 및 프린터 상태·오류 메시지·마지막 점검 시각이 정확히 갱신되고 불변 스냅샷을 반환한다', () => {
      setVcatStatus('OFFLINE', 'VCAT 포트 미응답');
      setPrinterStatus('OFFLINE', '커버 열림');
      setLastCheckedAt(1760000000000);

      const snap1 = getKioskHardwareHealth();
      expect(snap1).toEqual({
        vcatStatus: 'OFFLINE',
        printerStatus: 'OFFLINE',
        lastCheckedAt: 1760000000000,
        vcatErrorMessage: 'VCAT 포트 미응답',
        printerErrorMessage: '커버 열림',
      });

      // 반환된 객체 변이가 내부 스토어를 오염시키지 않는지 검증
      snap1.vcatStatus = 'ONLINE';
      expect(getKioskHardwareHealth().vcatStatus).toBe('OFFLINE');

      setKioskHealthStatus('ONLINE', 'ONLINE', null, null);
      const snap2 = getKioskHardwareHealth();
      expect(snap2.vcatStatus).toBe('ONLINE');
      expect(snap2.printerStatus).toBe('ONLINE');
      expect(snap2.vcatErrorMessage).toBeNull();
      expect(typeof snap2.lastCheckedAt).toBe('number');
    });
  });
});
