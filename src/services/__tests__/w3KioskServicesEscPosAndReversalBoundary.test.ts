import { describe, it, expect, vi } from 'vitest';
import { sanitizeEscPosCode128Payload } from '../printer/escpos_printer';
import { KioskVanClient, sanitizeVcatPort } from '../van/van_client';
import { normalizeVanProvider, type CardApprovalResult } from '../van/van_types';
import { executeKioskAutoReversal } from '../van/kioskPaymentReversal';
import { kioskVanClient } from '../van/van_client';

describe('[W3-KSK-services] ESC/POS Code128 바코드 정화·VAN 포트/프로바이더 클램핑 및 망취소 NaN 경계값 검증', () => {
  it('sanitizeEscPosCode128Payload가 비ASCII/제어문자를 제거하고 중괄호({)를 이중 이스케이프하며 80자 상한을 보장한다', () => {
    expect(sanitizeEscPosCode128Payload('')).toEqual({ cleanText: '', payloadBytes: [] });
    expect(sanitizeEscPosCode128Payload('한글전용\n\r\t')).toEqual({ cleanText: '', payloadBytes: [] });

    const escaped = sanitizeEscPosCode128Payload('BAY-1-{A}\x1b@한글');
    expect(escaped.cleanText).toBe('BAY-1-{A}@');
    // Subset B 헤더(0x7b, 0x42) + '{' 이스케이프(0x7b, 0x7b) 검증
    expect(escaped.payloadBytes.slice(0, 2)).toEqual([0x7b, 0x42]);
    expect(escaped.payloadBytes.filter((b) => b === 0x7b).length).toBe(3);

    const overlong = sanitizeEscPosCode128Payload('X'.repeat(300));
    expect(overlong.cleanText.length).toBe(80);
    expect(overlong.payloadBytes.length).toBe(82);
  });

  it('normalizeVanProvider 및 sanitizeVcatPort가 공백·비정상 프로바이더·범위 이탈 포트를 안전하게 정규화한다', () => {
    expect(normalizeVanProvider('  nice_van  ')).toBe('NICE');
    expect(normalizeVanProvider('UNKNOWN_PG')).toBe('KCP');
    expect(sanitizeVcatPort('8090', 9099)).toBe(8090);
    expect(sanitizeVcatPort('0', 9099)).toBe(9099);
    expect(sanitizeVcatPort(70000, 9099)).toBe(9099);

    const client = new KioskVanClient({ vcatPort: 99999 });
    expect(client.getConfig().vcatPort).toBeGreaterThanOrEqual(1);
    expect(client.getConfig().vcatPort).toBeLessThanOrEqual(65535);
  });

  it('executeKioskAutoReversal이 NaN 금액 입력 시 VCAT 호출을 생략하고, 소수점 금액은 정수로 정규화하여 취소한다', async () => {
    const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCardPayment').mockResolvedValue({
      success: true,
      canceled_at: '2026-11-08T12:00:00+09:00',
      canceled_amount: 15000,
    });

    try {
      const sampleApproval: CardApprovalResult = {
        success: true,
        auth_code: '12345678',
        approved_at: '2026-11-08T12:00:00+09:00',
        card_no_masked: '9410-****-****-1234',
        issuer_name: '신한카드',
        acquirer_name: '신한카드',
        terminal_id: '88010003',
        amount: 15000,
        installment_months: 0,
      };

      const nanRes = await executeKioskAutoReversal({
        cardApproval: sampleApproval,
        payAmount: Number.NaN,
        reason: '테스트',
      });
      expect(nanRes.reversalAttempted).toBe(false);
      expect(cancelSpy).not.toHaveBeenCalled();

      const floatRes = await executeKioskAutoReversal({
        cardApproval: sampleApproval,
        payAmount: 15000.9,
        reason: '배정 충돌',
      });
      expect(floatRes.success).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 15000,
          orgAuthCode: '12345678',
        })
      );
    } finally {
      cancelSpy.mockRestore();
    }
  });
});
