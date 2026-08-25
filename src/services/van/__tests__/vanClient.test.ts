import { describe, it, expect, beforeEach } from 'vitest';
import { KioskVanClient, VanAdapterFactory } from '../van_client';
import { MockVanAdapter } from '../adapters/MockVanAdapter';
import { KcpVcatAdapter } from '../adapters/KcpVcatAdapter';
import { NiceVanAdapter } from '../adapters/NiceVanAdapter';
import { SmartroVanAdapter } from '../adapters/SmartroVanAdapter';

describe('KioskVanClient & VanAdapterFactory (Kiosk Multi-VAN Strategy)', () => {
  let client: KioskVanClient;

  beforeEach(() => {
    VanAdapterFactory.clearInstances();
    client = new KioskVanClient({ isMock: true });
  });

  describe('Kiosk Adapter Resolution', () => {
    it('isMock=true 일 때 MockVanAdapter를 반환해야 한다', () => {
      const adapter = VanAdapterFactory.getAdapter({ isMock: true, provider: 'KCP' });
      expect(adapter).toBeInstanceOf(MockVanAdapter);
      expect(adapter.provider).toBe('MOCK');
    });

    it('providerType에 _VAN 접미사가 붙어 있어도 정규화되어 올바른 어댑터를 생성해야 한다', () => {
      const kcpAdapter = VanAdapterFactory.getAdapter({ isMock: false, provider: 'KCP_VAN' as any });
      expect(kcpAdapter).toBeInstanceOf(KcpVcatAdapter);

      const niceAdapter = VanAdapterFactory.getAdapter({ isMock: false, provider: 'NICE_VAN' as any });
      expect(niceAdapter).toBeInstanceOf(NiceVanAdapter);

      const smartroAdapter = VanAdapterFactory.getAdapter({ isMock: false, provider: 'SMARTRO_VAN' as any });
      expect(smartroAdapter).toBeInstanceOf(SmartroVanAdapter);
    });
  });

  describe('Kiosk Card Payment & Special Test Cases', () => {
    it('키오스크 일반 타석 결제 승인이 정상 완료되어야 한다', async () => {
      const states: string[] = [];
      const result = await client.requestCardPayment(
        {
          amount: 20000,
          installmentMonths: 0,
          productName: '타석 60분 이용권',
        },
        (state) => states.push(state)
      );

      expect(result.success).toBe(true);
      expect(result.auth_code).toMatch(/^\d{8}$/);
      expect(result.card_no_masked).toMatch(/^9410-\*{4}-\*{4}-\d{4}$/);
      expect(states).toContain('WAITING_CARD');
      expect(states).toContain('APPROVED');
    });

    it('77,777원 시뮬레이션 시 단말기 미연결(E_DEVICE_NOT_FOUND)로 실패해야 한다', async () => {
      const result = await client.requestCardPayment({ amount: 77777 });
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('E_DEVICE_NOT_FOUND');
    });

    it('88,888원 시뮬레이션 시 타임아웃(E_TIMEOUT)으로 실패해야 한다', async () => {
      const result = await client.requestCardPayment({ amount: 88888 });
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('E_TIMEOUT');
    });

    it('99,999원 시뮬레이션 시 한도초과/잔액부족(E_INSUFFICIENT_FUNDS)으로 실패해야 한다', async () => {
      const result = await client.requestCardPayment({ amount: 99999 });
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('E_INSUFFICIENT_FUNDS');
    });

    it('키오스크 타석 배정 실패 시 카드 승인 취소(망취소)가 정상 처리되어야 한다', async () => {
      const cancelResult = await client.cancelCardPayment({
        amount: 20000,
        orgAuthCode: '87654321',
        orgApprovedDate: '20260825',
        reason: '배정 실패 자동 망취소',
      });

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.cancel_auth_code).toBe('C7654321');
    });
  });
});
