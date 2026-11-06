import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

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
      search: '',
    },
    localStorage: mockLocalStorage,
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
  },
  configurable: true,
  writable: true,
});

import { api } from '../api';
import { PaymentOutboxManager } from '../paymentResilience';
import { saveKioskSettings } from '../../stores/kioskSettings';

describe('[Wave 3][Kiosk/Services] 그룹배정 워터폴 차감, apprNo WAL 대칭성, 서브사업자 Fail-Fast 및 안면단말기 라우팅 검증', () => {
  beforeEach(() => {
    storageMap.clear();
    saveKioskSettings({
      storeCode: 'S-W3-SVC',
      apiUrl: 'http://127.0.0.1:8000',
      terminalId: '88010003',
      providerType: 'KCP_VAN',
      vcatPort: '9099',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allocateGroupBays는 등급할인->쿠폰할인->포인트 순으로 유료 슬롯을 워터폴 차감하고 apprNo 별칭 WAL 기록/해제를 수행한다', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let inFlightWalCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/kiosk/allocate-group')) {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        inFlightWalCount = PaymentOutboxManager.getEntries().length;
        return new Response(
          JSON.stringify({
            success: true,
            message: '그룹 배정 완료',
            results: [{ bay_no: 1, res_id: 'R-1' }, { bay_no: 2, res_id: 'R-2' }, { bay_no: 3, res_id: 'R-3' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const res = await api.allocateGroupBays(
      [
        { bayNo: 1, durationMin: 70, memberNo: 'M001', paymentMethod: 'TICKET', amount: 0 },
        { bayNo: 2, durationMin: 70, memberName: '동반A', paymentMethod: 'CARD', amount: 15000 },
        { bayNo: 3, durationMin: 70, memberName: '동반B', paymentMethod: 'CARD', amount: 15000 },
      ],
      {
        auth_code: '',
        apprNo: '77665544',
        raw_response: { trace: 'RAW_OK' },
      },
      {
        couponNo: 'CPN-5000',
        gradeDiscountAmount: 3000,
        discountAmount: 14000,
        usedPoints: 5000,
      }
    );

    expect(res.success).toBe(true);
    // 요청 전송 시점에 apprNo 별칭으로도 WAL_IN_FLIGHT가 반드시 선기록되어야 함
    expect(inFlightWalCount).toBe(1);
    // 응답 성공 후 Outbox에서 완전히 정리되어야 함
    expect(PaymentOutboxManager.getEntries()).toHaveLength(0);

    const items = (capturedBody?.items || []) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);

    // 슬롯 1 (TICKET 0원): 차감 없음
    expect(items[0].amount).toBe(0);
    expect(items[0].coupon_no).toBeNull();

    // 슬롯 2 (첫 유료 15,000원): 등급할인 3,000 + 쿠폰 12,000 = 순결제 0원 (포인트 소진 없음, 카드승인번호 null, 쿠폰번호 귀속)
    expect(items[1].grade_discount_amount).toBe(3000);
    expect(items[1].discount_amount).toBe(12000);
    expect(items[1].used_points).toBe(0);
    expect(items[1].amount).toBe(0);
    expect(items[1].coupon_no).toBe('CPN-5000');
    expect(items[1].approval_no).toBeNull();

    // 슬롯 3 (두 번째 유료 15,000원): 잔여 쿠폰 2,000 + 포인트 5,000 = 순결제 8,000원 (apprNo '77665544' 전파)
    expect(items[2].grade_discount_amount).toBe(0);
    expect(items[2].discount_amount).toBe(2000);
    expect(items[2].used_points).toBe(5000);
    expect(items[2].amount).toBe(8000);
    expect(items[2].approval_no).toBe('77665544');
    expect(capturedBody?.total_card_amount).toBe(8000);
    expect(capturedBody?.approval_no).toBe('77665544');
  });

  it('allocateGroupBays는 HTTP 409 CLOSING_TRUNCATE_PROMPT가 문자열 JSON과 객체로 전달될 때 모두 closingPrompt를 파싱한다', async () => {
    const promptPayload = {
      code: 'CLOSING_TRUNCATE_PROMPT',
      max_available_min: 45,
      close_time: '23:00',
      message: '마감 임박으로 45분만 이용 가능합니다.',
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: JSON.stringify(promptPayload) }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: promptPayload }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const r1 = await api.allocateGroupBays([{ bayNo: 4, durationMin: 70, paymentMethod: 'TICKET', amount: 0 }]);
    const r2 = await api.allocateGroupBays([{ bayNo: 4, durationMin: 70, paymentMethod: 'TICKET', amount: 0 }]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(r1.success).toBe(false);
    expect(r1.closingPrompt?.max_available_min).toBe(45);
    expect(r2.closingPrompt?.close_time).toBe('23:00');
  });

  it('extendLocker는 extraPaymentInfo.apprNo만 전달된 경우에도 WAL_IN_FLIGHT 선기록 및 성공 후 제거를 보장한다', async () => {
    let walDuringWebhook = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/v1/kiosk/payment-webhook')) {
        walDuringWebhook = PaymentOutboxManager.getEntries().length;
        return new Response(
          JSON.stringify({ success: true, start_date: '2026-11-06', end_date: '2026-12-05', locker_no: 12 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const result = await api.extendLocker('RES-LCK-01', 12, 30, 30000, undefined, 0, {
      apprNo: '88776655',
      prodCd: 'PROD_LCK_30D',
    });

    expect(result.success).toBe(true);
    expect(walDuringWebhook).toBe(1);
    expect(PaymentOutboxManager.getEntries()).toHaveLength(0);
  });

  it('resolveTerminalRoute는 서브 사업자(PRO/LESSON/FNB) 오류 시 결제를 Fail-Fast 차단하고 MAIN 사업자는 로컬 TID로 안전 폴백한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const proRoute = await api.resolveTerminalRoute('dev-3', 'MERCH_PRO_01', 'LESSON', 'PRO_101');
    expect(proRoute.error).toBe(true);
    expect(proRoute.terminal_id).toBe('');
    expect(proRoute.status).toBe(503);

    const mainRoute = await api.resolveTerminalRoute('dev-3', 'MAIN', 'PRACTICE', null);
    expect(mainRoute.error).toBeUndefined();
    expect(mainRoute.terminal_id).toBe('88010003');
  });

  it('verifyAdminPin(429 잠금 vs 502 오프라인 폴백) 및 resolveKioskFaceTerminalIp(멀티 단말기 KIOSK 우선)가 정확히 동작한다', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: '5회 이상 오류로 5분간 잠금되었습니다.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    const lockedRes = await api.verifyAdminPin('0000');
    expect(lockedRes.valid).toBe(false);
    expect(lockedRes.locked).toBe(true);
    expect(lockedRes.offline).toBeUndefined();

    const gatewayRes = await api.verifyAdminPin('0000');
    expect(gatewayRes.valid).toBe(false);
    expect(gatewayRes.offline).toBe(true);

    const ip = api.resolveKioskFaceTerminalIp({
      integration: {
        face_terminals: [
          { id: 'ft-pos-1', name: '프론트 데스크 단말기', role: 'POS', ip: '192.168.0.201', is_active: true },
          { id: 'ft-kiosk-1', name: '입구 무인키오스크 안면기', role: 'KIOSK', ip: '192.168.0.202', is_active: true },
        ],
      },
    });
    expect(ip).toBe('192.168.0.202');
    expect(storageMap.get('face_terminal_ip')).toBe('192.168.0.202');
  });
});
