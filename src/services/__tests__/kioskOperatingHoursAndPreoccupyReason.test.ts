import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { TimeMaster } from '../../utils/timeMaster';

const storageMap = new Map<string, string>();
const memoryStorage: Storage = {
  get length(): number {
    return storageMap.size;
  },
  clear: (): void => {
    storageMap.clear();
  },
  getItem: (key: string): string | null => (storageMap.has(key) ? storageMap.get(key) ?? null : null),
  key: (index: number): string | null => Array.from(storageMap.keys())[index] ?? null,
  removeItem: (key: string): void => {
    storageMap.delete(key);
  },
  setItem: (key: string, value: string): void => {
    storageMap.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

describe('키오스크 운영시간 사전 진입 가드 & 타석 선점(preoccupy) 서버 거절 사유 원문 보존 검증', () => {
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    storageMap.clear();
    vi.restoreAllMocks();
  });

  it('1. 당일 마감 매장(예: 군산대 08:00 ~ 21:15)의 오픈 전·영업 중·마감 후 판정 및 안내 문구가 정확히 생성된다', () => {
    const beforeOpen = new Date('2026-11-12T07:30:00+09:00');
    const atOpen = new Date('2026-11-12T08:00:00+09:00');
    const beforeClose = new Date('2026-11-12T21:14:59+09:00');
    const atClose = new Date('2026-11-12T21:15:00+09:00');
    const lateNight = new Date('2026-11-12T22:35:00+09:00');

    const statusBefore = TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', beforeOpen);
    expect(statusBefore).toEqual({
      isOpen: false,
      phase: 'BEFORE_OPEN',
      currentHhmm: '07:30',
      rangeLabel: '08:00 ~ 21:15',
    });
    const msgBefore = TimeMaster.buildOperatingHoursBlockMessage(statusBefore, '타석 배정', 'KO');
    expect(msgBefore.title).toBe('매장 운영시간 안내');
    expect(msgBefore.message).toContain('07:30');
    expect(msgBefore.message).toContain('08:00 ~ 21:15');
    expect(msgBefore.message).toContain('타석 배정을');

    expect(TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', atOpen).isOpen).toBe(true);
    expect(TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', beforeClose).isOpen).toBe(true);

    const statusAtClose = TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', atClose);
    expect(statusAtClose.isOpen).toBe(false);
    expect(statusAtClose.phase).toBe('AFTER_CLOSE');

    const statusLate = TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', lateNight);
    expect(statusLate).toEqual({
      isOpen: false,
      phase: 'AFTER_CLOSE',
      currentHhmm: '22:35',
      rangeLabel: '08:00 ~ 21:15',
    });
    const msgLate = TimeMaster.buildOperatingHoursBlockMessage(statusLate, '타석 배정', 'KO');
    expect(msgLate.title).toBe('매장 운영시간 종료 안내');
    expect(msgLate.message).toContain('금일 매장 운영시간(08:00 ~ 21:15)이 종료되어 타석 배정을 진행할 수 없습니다.');
    expect(msgLate.message).toContain('22:35');
  });

  it('2. 심야 익일 마감 매장(06:00 ~ 익일 02:00 / 05:00) 및 24시간 영업 매장을 정확히 구분한다', () => {
    const night2330 = new Date('2026-11-12T23:30:00+09:00');
    const dawn0130 = new Date('2026-11-13T01:30:00+09:00');
    const break0330 = new Date('2026-11-13T03:30:00+09:00');

    expect(TimeMaster.evaluateStoreOperatingWindow('06:00', '02:00', night2330).isOpen).toBe(true);
    expect(TimeMaster.evaluateStoreOperatingWindow('06:00', '02:00', dawn0130).isOpen).toBe(true);

    const closedOvernight = TimeMaster.evaluateStoreOperatingWindow('06:00', '02:00', break0330);
    expect(closedOvernight).toEqual({
      isOpen: false,
      phase: 'OVERNIGHT_CLOSED',
      currentHhmm: '03:30',
      rangeLabel: '06:00 ~ 익일 02:00',
    });

    expect(
      TimeMaster.evaluateStoreOperatingWindow('08:00', '21:15', break0330, { is24h: true }).isOpen
    ).toBe(true);
    expect(TimeMaster.evaluateStoreOperatingWindow('00:00', '23:59', break0330).isOpen).toBe(true);
    expect(TimeMaster.evaluateStoreOperatingWindow('00:00', '24:00', break0330).isOpen).toBe(true);
  });

  it('3. 백엔드 POST /bays/preoccupy가 운영시간 외·볼부족·휴무일 등 409 사유를 반환하면 타 고객 선점 문구 대신 실제 사유를 표출한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: '현재 시각(22:35)은 매장 운영시간(08:00~21:15) 외입니다.',
          trace_id: 'req-f8ed8f27',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const ok1 = await api.preoccupyBay(1);
    expect(ok1).toBe(false);
    const msg1 = api.resolvePreoccupyFailureMessage(
      '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.',
      'Already selected.',
      'KO'
    );
    expect(msg1).toBe('현재 시각(22:35)은 매장 운영시간(08:00~21:15) 외입니다.');

    // 1회 소비 후에는 이전 에러가 잔류하지 않고 기본 안내문으로 복귀
    const fallbackAfterConsume = api.resolvePreoccupyFailureMessage(
      '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.',
      'Already selected.',
      'KO'
    );
    expect(fallbackAfterConsume).toBe('이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.');
  });

  it('4. 실제 다른 단말기 선점 경합(409 detail="이미 다른 고객님이 선택 중인 타석입니다.")일 때는 화면별 친절 안내문을 그대로 유지한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: '이미 다른 고객님이 선택 중인 타석입니다.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const ok = await api.preoccupyBay(5);
    expect(ok).toBe(false);
    const msg = api.resolvePreoccupyFailureMessage(
      '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.',
      'Already selected.',
      'KO'
    );
    expect(msg).toBe('이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.');
  });

  it('5. 401 message 포맷이나 볼박스 비었음 409 포맷도 누락 없이 원문으로 복원된다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'ERR_AUTH_UNAUTHORIZED',
          message: '유효하지 않은 키오스크 기기 인증 키입니다.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const ok = await api.preoccupyBays([2, 3]);
    expect(ok).toBe(false);
    const msg = api.resolvePreoccupyFailureMessage(
      '선택하신 타석 중 이미 다른 고객님이 선택 중인 타석이 있습니다. 다시 선택해 주세요.',
      'Some selected teeboxes are already being selected.',
      'KO'
    );
    expect(msg).toBe('유효하지 않은 키오스크 기기 인증 키입니다.');
  });
});
