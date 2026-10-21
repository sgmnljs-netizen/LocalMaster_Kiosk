import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordKioskBlackBox,
  getRecentKioskBlackBoxLogs,
  getFormattedKioskBlackBoxText,
  maskKioskSensitiveData,
  clearKioskBlackBox,
} from '../kioskBlackBox';

describe('KioskBlackBox utility', () => {
  beforeEach(() => {
    clearKioskBlackBox();
  });

  it('masks sensitive PINs, card PANs, and phone numbers in kiosk logs', () => {
    const masked = maskKioskSensitiveData({
      admin_pin: '8888',
      device_key: 'secret-device-key',
      card_no: '9410123456789012',
      detail: '홍길동 회원 인증 성공 (010-1234-5678)',
    }) as Record<string, unknown>;

    expect(masked.admin_pin).toBe('******');
    expect(masked.device_key).toBe('******');
    expect(masked.card_no).toBe('941012-**-****-9012');
    expect(masked.detail).toBe('홍길동 회원 인증 성공 (010-****-5678)');
  });

  it('maintains ring buffer cap of 100 items and formats recent steps', () => {
    for (let i = 1; i <= 115; i++) {
      recordKioskBlackBox('STEP', `화면 이동 #${i} (010-9988-7766)`, { bayNo: i });
    }

    const recent100 = getRecentKioskBlackBoxLogs(150);
    expect(recent100.length).toBe(100);
    expect(recent100[0].actionName).toContain('화면 이동 #115 (010-****-7766)');

    const formatted = getFormattedKioskBlackBoxText(5);
    expect(formatted).toContain('[키오스크 블랙박스] 직전 5개 화면/터치/통신 이력');
    expect(formatted).toContain('010-****-7766');
    expect(formatted).not.toContain('010-9988-7766');
  });
});
