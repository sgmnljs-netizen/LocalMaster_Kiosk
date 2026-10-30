import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  fetchWithPaymentRetry,
  PaymentOutboxManager,
  subscribePaymentRetryStatus,
  isRetryableHttpStatus,
} from '../services/paymentResilience';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('🛡️ 5-Layer Payment Resilience Engine (순단·지연·장비 OFF 방어)', () => {
  let api: typeof import('../services/api').api;

  beforeAll(async () => {
    const mod = await import('../services/api');
    api = mod.api;
  });
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. isRetryableHttpStatus: 5xx/408/429는 재시도 대상이고 4xx 비즈니스 거절은 즉시 반환 대상이다', () => {
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(504)).toBe(true);
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);

    expect(isRetryableHttpStatus(200)).toBe(false);
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(409)).toBe(false);
    expect(isRetryableHttpStatus(422)).toBe(false);
  });

  it('2. 인터넷 순단(1~2회 네트워크 실패 후 3회차 성공) 시 망취소 없이 재시도하여 정상 성공 응답을 반환한다', async () => {
    const statusHistory: Array<{ active: boolean; attempt: number }> = [];
    const unsubscribe = subscribePaymentRetryStatus((st) => {
      statusHistory.push({ active: st.active, attempt: st.attempt });
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch (순단 1회)'))
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, res_id: 'KSK_OK_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const res = await fetchWithPaymentRetry(
      'http://localhost:8000/api/v1/kiosk/allocate-bay',
      { method: 'POST' },
      { label: '타석 배정 테스트', retryDelaysMs: [5, 10, 15], idempotencyKey: 'TR-12345' }
    );

    unsubscribe();

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.res_id).toBe('KSK_OK_1');
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 재시도 중 상태 알림이 발생했다가 완료 시 해제되었는지 확인
    expect(statusHistory.some((s) => s.active && s.attempt === 1)).toBe(true);
    expect(statusHistory.some((s) => s.active && s.attempt === 2)).toBe(true);
    expect(statusHistory[statusHistory.length - 1].active).toBe(false);
  });

  it('3. 409 Conflict 등 비즈니스 거절(4xx) 응답 시에는 불필요한 재시도 없이 단 1회 호출 후 즉시 반환한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: '이미 사용 중인 타석입니다.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await fetchWithPaymentRetry(
      'http://localhost:8000/api/v1/kiosk/allocate-bay',
      { method: 'POST' },
      { retryDelaysMs: [5, 10, 15] }
    );

    expect(res.status).toBe(409);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('4. 서버 완전 단절 상태에서 reportGhostCharge(DLQ) 호출 실패 시 로컬 Outbox에 영구 백업되고, 네트워크 복구 시 자동 Flush된다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network completely offline'));

    const dlqRes = await api.reportGhostCharge({
      store_cd: '1000',
      terminal_id: '7468917000',
      auth_code: 'APPR9988',
      van_tr_no: 'TR9988',
      amount: 20000,
      issuer_name: '신한카드',
      card_no_masked: '9410-****-****-1234',
      backendErrorReason: 'Network timeout',
      reversalErrorReason: 'Card already removed',
    });

    expect(dlqRes.success).toBe(false);
    const entries = PaymentOutboxManager.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('PENDING_DLQ');
    expect(entries[0].authCode).toBe('APPR9988');

    // 이제 네트워크가 복구되어 200 OK를 반환한다고 가정
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, dlq_id: 'DLQ-001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const flushResult = await api.flushPendingPaymentOutbox();
    expect(flushResult.flushed).toBe(1);
    expect(flushResult.remaining).toBe(0);
    expect(PaymentOutboxManager.getEntries().length).toBe(0);
  });

  it('5. Pre-Flight Gate (verifyBackendReadyForPayment): 1차 헬스체크가 순단되어도 2차 재시도로 통과하며, 연속 실패 시 사전 차단 메시지를 반환한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Transient packet drop'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ store_cd: '1000' }), { status: 200 }));

    const okResult = await api.verifyBackendReadyForPayment();
    expect(okResult.ready).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new TypeError('Backend completely down'));
    const blockedResult = await api.verifyBackendReadyForPayment();
    expect(blockedResult.ready).toBe(false);
    expect(blockedResult.message).toContain('통신이 원활하지 않아');
  });

  it('6. 장비 OFF / 정전 복구 방어: 카드 승인 직후 미확정 상태로 60초 이상 방치된 WAL_IN_FLIGHT는 재기동 시 DLQ로 자동 복구 전송된다', async () => {
    PaymentOutboxManager.recordWalInFlight({
      storeCd: '1000',
      terminalId: '7468917000',
      authCode: 'CRASH7777',
      vanTrNo: 'TR-CRASH-7777',
      amount: 30000,
      purpose: 'CARD_APPROVED_PENDING_COMMIT',
      payload: {
        issuer_name: '현대카드',
        card_no_masked: '4000-****-****-7777',
        approved_at: '20261029220000',
      },
    });

    // 강제로 생성 시각을 2분 전으로 변경 (정전 후 재부팅 시뮬레이션)
    const raw = JSON.parse(localStorage.getItem('LM_PAYMENT_OUTBOX') || '[]');
    raw[0].createdAt = new Date(Date.now() - 120_000).toISOString();
    localStorage.setItem('LM_PAYMENT_OUTBOX', JSON.stringify(raw));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, dlq_id: 'DLQ-CRASH-1' }), { status: 200 })
    );

    const flushRes = await api.flushPendingPaymentOutbox();
    expect(flushRes.flushed).toBe(1);
    expect(flushRes.remaining).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(PaymentOutboxManager.getEntries().length).toBe(0);
  });

  it('7. 회원권(0원 TICKET) 단건 타석 배정: 인터넷 순단 시 지수 백오프 재시도로 복구하며, 완전 단절 시 운영 환경 가짜 EdgeDB(R-XXXX) 폴백을 원천 차단한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Transient network drop on TICKET allocate'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            res_id: 'RES_TICKET_OK_01',
            bay_no: 3,
            duration_min: 70,
            hardware_success: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const res = await api.allocateBay(3, 70, 'M260101', '홍길동', '010-1234-5678', 101, 'TICKET', 0);
    expect(res.success).toBe(true);
    expect(res.res_id).toBe('RES_TICKET_OK_01');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 완전 단절(4회 전수 실패) 시에도 운영 환경에서는 가짜 EdgeDB(R-XXXXXXX) 영수증을 절대 발급하지 않음
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new TypeError('Complete network outage'));
    const failRes = await api.allocateBay(3, 70, 'M260101', '홍길동', '010-1234-5678', 101, 'TICKET', 0);
    expect(failRes.success).toBe(false);
    expect(failRes.res_id).toBeUndefined();
    expect(localStorage.getItem('LM_RESERVATIONS')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('8. 회원권(0원 TICKET) 동반자 그룹 배정: 순단 시 /v1/kiosk/allocate-group을 재시도하여 원자적 성공을 보장한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            group_id: 'GRP_TICKET_01',
            results: [
              { success: true, res_id: 'RES_G1', bay_no: 1, duration_min: 60 },
              { success: true, res_id: 'RES_G2', bay_no: 2, duration_min: 60 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const grpRes = await api.allocateGroupBays([
      { bayNo: 1, durationMin: 60, memberNo: 'M001', memberName: '리더', memberItemId: 11, paymentMethod: 'TICKET', amount: 0 },
      { bayNo: 2, durationMin: 60, memberNo: 'M002', memberName: '동반', memberItemId: 12, paymentMethod: 'TICKET', amount: 0 },
    ]);
    expect(grpRes.success).toBe(true);
    expect(grpRes.allocatedBayNos).toEqual([1, 2]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('9. 예약 체크인(verifyKioskCheckin) 및 셀프 타석 이동(moveBay): 순단 발생 시 자동 재시도로 정상 처리한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Checkin transient drop'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            checkin_mode: 'IMMEDIATE_START',
            bay_no: 5,
            duration_min: 60,
            message: '5번 타석 체크인이 완료되었습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const chkRes = await api.verifyKioskCheckin('M260101', 'RES_CHK_01');
    expect(chkRes.success).toBe(true);
    expect(chkRes.bay_no).toBe(5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockReset();
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Move bay transient drop'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            old_bay_no: 5,
            new_bay_no: 6,
            remain_min: 45,
            message: '5번 타석에서 6번 타석으로 이동이 완료되었습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const moveRes = await api.moveBay('M260101', 6, 5);
    expect(moveRes.success).toBe(true);
    expect(moveRes.new_bay_no).toBe(6);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('10. 파3 슬롯 선점(bookPar3Course) 및 결제 확정 웹훅(confirmKioskPaymentWebhook): 순단 시 자동 재시도하고 WAL을 기록·정리한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Par3 preoccupy network glitch'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            res_id: 'RES_PAR3_01',
            price: 25000,
            message: '파3 예약 선점이 완료되었습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const bookRes = await api.bookPar3Course(
      'PAR3_A',
      '20261030',
      '14:00',
      25000,
      { member_no: 'M001', guest_nm: '홍길동', hp_no: '01012345678', is_member: true },
      []
    );
    expect(bookRes.success).toBe(true);
    expect(bookRes.res_id).toBe('RES_PAR3_01');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const webhookOk = await api.confirmKioskPaymentWebhook('RES_PAR3_01', 25000, 'CARD', {
      auth_code: 'P3APPR01',
      van_tr_no: 'P3TR01',
      card_no_masked: '1234-****-****-5678',
      issuer_name: '국민카드',
    });
    expect(webhookOk).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(PaymentOutboxManager.getEntries().length).toBe(0);
  });

  it('11. 타석 선점(preoccupyBays) 및 라카 연장 홀드(holdLockerExtension) 시 일시적 네트워크 순단을 극복하고, 전수 실패 시 가짜 로컬 선점으로 추락하지 않는다', async () => {
    localStorage.setItem('VITE_DEMO_MODE', 'false');
    localStorage.setItem(
      'LM_BAYS',
      JSON.stringify([
        { bay_no: 11, status: 'AVAILABLE', lock_terminal_id: null, lock_expired_at: null },
        { bay_no: 12, status: 'AVAILABLE', lock_terminal_id: null, lock_expired_at: null },
      ])
    );

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // 11-1. preoccupyBays: 1차 타임아웃 -> 2차 200 OK 복구 및 로컬 캐시(Bay 11) 동기화 검증
    fetchSpy
      .mockRejectedValueOnce(new Error('Network blip during preoccupy'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ bay_no: 11, status: 'PRE_OCCUPIED' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const preoccupyOk = await api.preoccupyBays([11]);
    expect(preoccupyOk).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 11-2. preoccupyBays: 프로덕션 4회 전수 실패 시 Bay 12가 가짜 LM_BAYS 선점으로 변하지 않고 false 반환
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error('Persistent network outage'));
    const preoccupyFail = await api.preoccupyBays([12]);
    expect(preoccupyFail).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const localBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
    expect(localBays.find((b: any) => b.bay_no === 11)?.status).toBe('PRE_OCCUPIED');
    expect(localBays.find((b: any) => b.bay_no === 12)?.status).toBe('AVAILABLE');

    // 7-3. holdLockerExtension: 1차 502 에러 -> 2차 200 OK 복구
    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            res_id: 'RES_LOCKER_20261030_105_ABCD',
            message: '라카 연장 대기 완료',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const holdOk = await api.holdLockerExtension(105, 30000, 'PROD_LCK_30D', 'M_105', '105', 'KIOSK-01');
    expect(holdOk.success).toBe(true);
    expect(holdOk.res_id).toBe('RES_LOCKER_20261030_105_ABCD');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('12. 사전예약 체크인(verifyKioskCheckin) 시 :5001 기기 가동 지연(hardware_success=false) 플래그를 손실 없이 전달한다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            checkin_mode: 'IMMEDIATE_START',
            resource_type: 'BAY',
            bay_no: 7,
            duration_min: 60,
            start_time: '1600',
            end_time: '1700',
            hardware_success: false,
            message: '7번 타석 체크인이 성공적으로 완료되었습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const chkRes = await api.verifyKioskCheckin('M260101', 'RES_CHK_HW_DELAY');
    expect(chkRes.success).toBe(true);
    expect(chkRes.bay_no).toBe(7);
    expect(chkRes.hardware_success).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
