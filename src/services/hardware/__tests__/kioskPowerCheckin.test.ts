import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runKioskPowerNetworkCheckin,
  resetKioskPowerCheckinState,
} from '../kioskPowerCheckin';

vi.mock('../../../stores/kioskSettings', () => ({
  getKioskSettings: vi.fn(() => ({
    storeCode: 'S0531',
    deviceId: 'DEV_S0531_KIOSK_01',
    terminalId: '1003994912',
  })),
}));

vi.mock('../../api', () => ({
  api: {
    getStoreCd: vi.fn(() => 'S0531'),
    getBaseUrl: vi.fn(() => 'http://192.168.0.89:8000/api'),
    getSecureHeaders: vi.fn((extra: Record<string, string> = {}) => ({
      'X-Store-Cd': 'S0531',
      ...extra,
    })),
  },
}));

describe('kioskPowerCheckin', () => {
  beforeEach(() => {
    resetKioskPowerCheckinState();
    vi.restoreAllMocks();
  });

  it('collects wired MAC/LAN IP from local bridge, checks in, and registers power_control_key once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ONLINE',
          network: { mac_address: '00:E0:4C:F7:01:C9', lan_ip: '192.168.0.221' },
          power_key_configured: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          matched_device_id: 'DEV_S0531_KIOSK_01',
          power_control_key: 'gpk_1234567890abcdef1234567890abcdef',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const ok1 = await runKioskPowerNetworkCheckin();
    expect(ok1).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:18080/health');
    expect(fetchMock.mock.calls[1][0]).toBe('http://192.168.0.89:8000/api/v1/terminals/wol-checkin');
    expect(fetchMock.mock.calls[2][0]).toBe('http://127.0.0.1:18080/api/v1/system/register-power-key');

    // 동일 매장 2회차 호출은 세션 중복 방지 가드로 스킵
    const ok2 = await runKioskPowerNetworkCheckin();
    expect(ok2).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails silently without throwing when local bridge is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const ok = await runKioskPowerNetworkCheckin();
    expect(ok).toBe(false);
  });
});
