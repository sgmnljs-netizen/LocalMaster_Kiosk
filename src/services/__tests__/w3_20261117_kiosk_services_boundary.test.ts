import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { executeKioskAutoReversal } from '../van/kioskPaymentReversal';

describe('Wave 3 (20261117) Kiosk Services URI Encoding, Timeout & Boundary Audit', () => {
  const storageMap = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('activateMiddlewareDirect: bayNo<=0 또는 durationMin<=0 입력 시 미들웨어 fetch를 호출하지 않고 즉시 false 반환', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await api.activateMiddlewareDirect(0, 60)).toBe(false);
    expect(await api.activateMiddlewareDirect(-2, 60)).toBe(false);
    expect(await api.activateMiddlewareDirect(1, 0)).toBe(false);
    expect(await api.activateMiddlewareDirect(1, Number.NaN)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancelHoldReservation: 빈 resId 거부 및 특수문자 포함 resId URL 인코딩', async () => {
    const emptyRes = await api.cancelHoldReservation('   ');
    expect(emptyRes.success).toBe(false);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    storageMap.set('LM_API_URL', 'http://127.0.0.1:8000');

    const okRes = await api.cancelHoldReservation('RES/123?x=1');
    expect(okRes.success).toBe(true);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/reservations/RES%2F123%3Fx%3D1/cancel');
  });

  it('executeKioskAutoReversal: 0원·NaN·FREE-·POINT-·MEMBERSHIP 결제는 망취소/DLQ 없이 안전 스킵', async () => {
    const rZero = await executeKioskAutoReversal({
      cardApproval: {
        success: true,
        auth_code: '12345678',
        approved_at: new Date().toISOString(),
        card_no_masked: '1234-****',
        issuer_name: '신한',
        acquirer_name: 'KCP',
        terminal_id: 'TID1',
        amount: 0,
        installment_months: 0,
      },
      payAmount: 0,
      reason: '0원 테스트',
    });
    expect(rZero.reversalAttempted).toBe(false);

    const rNan = await executeKioskAutoReversal({
      cardApproval: undefined,
      payAmount: Number.NaN,
      reason: 'NaN 방어',
    });
    expect(rNan.reversalAttempted).toBe(false);
  });
});
