import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
  resolveEnabledAuthModes,
  resolveEffectiveAuthMode,
} from '../../stores/kioskSettings';
import { api } from '../api';

describe('kioskSettings menu & auth resolver helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('canonicalizes legacy and standard menu IDs consistently', () => {
    expect(canonicalizeKioskMenuId('BOOK_PAR3')).toBe('PAR3');
    expect(canonicalizeKioskMenuId('PAR3')).toBe('PAR3');
    expect(canonicalizeKioskMenuId('EXTEND_LOCKER')).toBe('LOCKER');
    expect(canonicalizeKioskMenuId('REGISTER_MEMBER')).toBe('SIGNUP');
    expect(canonicalizeKioskMenuId('CHECKIN_RESERVATION')).toBe('CHECKIN');
    expect(canonicalizeKioskMenuId('ALLOCATE_MEMBERSHIP')).toBe('ALLOCATE_DAILY');
    expect(canonicalizeKioskMenuId('CUSTOM_SCREEN')).toBe('CUSTOM_SCREEN');
  });

  it('evaluates isKioskMenuEnabled with local override taking priority over partner default', () => {
    // 1. No override -> follows partnerDefault
    expect(isKioskMenuEnabled('PAR3', {}, true)).toBe(true);
    expect(isKioskMenuEnabled('PAR3', {}, false)).toBe(false);

    // 2. Local override OFF overrides partner ON (including alias BOOK_PAR3)
    expect(isKioskMenuEnabled('BOOK_PAR3', { PAR3: false }, true)).toBe(false);
    expect(isKioskMenuEnabled('PAR3', { BOOK_PAR3: false }, true)).toBe(false);

    // 3. Local override ON overrides partner OFF
    expect(isKioskMenuEnabled('CHECKIN', { CHECKIN: true }, false)).toBe(true);
  });

  it('resolves enabled auth modes and guarantees at least one fallback mode', () => {
    // Default: all 4 enabled when faceTerminalEnabled is true
    expect(resolveEnabledAuthModes(undefined, true)).toEqual([
      'SMART_TAG',
      'PHONE_KEYPAD',
      'QR_SCAN',
      'FACE',
    ]);

    // Store disables faceTerminalEnabled -> FACE excluded
    expect(resolveEnabledAuthModes({ FACE: true }, false)).toEqual([
      'SMART_TAG',
      'PHONE_KEYPAD',
      'QR_SCAN',
    ]);

    // Local admin disables SMART_TAG and QR_SCAN -> only PHONE_KEYPAD and FACE remain
    expect(
      resolveEnabledAuthModes(
        { SMART_TAG: false, PHONE_KEYPAD: true, QR_SCAN: false, FACE: true },
        true
      )
    ).toEqual(['PHONE_KEYPAD', 'FACE']);

    // Guardrail: if all are somehow marked false, falls back to ['PHONE_KEYPAD']
    expect(
      resolveEnabledAuthModes(
        { SMART_TAG: false, PHONE_KEYPAD: false, QR_SCAN: false, FACE: false },
        false
      )
    ).toEqual(['PHONE_KEYPAD']);
  });

  it('resolves effective initial auth mode respecting admin defaultAuthMode and enabled modes', () => {
    const enabled: ('SMART_TAG' | 'PHONE_KEYPAD' | 'QR_SCAN' | 'FACE')[] = [
      'PHONE_KEYPAD',
      'QR_SCAN',
    ];

    // Admin configured QR_SCAN as default -> opens on QR_SCAN even if caller passed FACE
    expect(resolveEffectiveAuthMode('FACE', 'QR_SCAN', enabled)).toBe('QR_SCAN');

    // Admin configured SMART_TAG as default, but SMART_TAG is disabled -> falls back to first enabled (PHONE_KEYPAD)
    expect(resolveEffectiveAuthMode('FACE', 'SMART_TAG', enabled)).toBe('PHONE_KEYPAD');
  });

  it('calls local hardware bridge (:18080) to EXIT or RESTART kiosk app and handles offline fallback gracefully', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          action: 'EXIT',
          message: '키오스크 프로그램을 종료하고 바탕화면으로 이동합니다.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const exitRes = await api.controlKioskApp('EXIT');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:18080/api/v1/system/kiosk-app-control',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'EXIT' }),
      })
    );
    expect(exitRes.success).toBe(true);
    expect(exitRes.bridgeHandled).toBe(true);
    expect(exitRes.action).toBe('EXIT');

    // When bridge is offline during RESTART, falls back cleanly without throwing
    fetchSpy.mockRejectedValueOnce(new Error('NetworkError'));
    const restartFallback = await api.controlKioskApp('RESTART');
    expect(restartFallback.success).toBe(true);
    expect(restartFallback.bridgeHandled).toBe(false);
    expect(restartFallback.action).toBe('RESTART');
  });
});
