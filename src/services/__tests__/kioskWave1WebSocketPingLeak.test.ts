import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storageMap = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return storageMap.size;
  },
  clear: () => storageMap.clear(),
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  removeItem: (k: string) => {
    storageMap.delete(k);
  },
  setItem: (k: string, v: string) => {
    storageMap.set(k, String(v));
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

class MockKioskWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockKioskWebSocket[] = [];

  public url: string;
  public readyState: number = MockKioskWebSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onmessage: ((evt: { data: string }) => void) | null = null;
  public onclose: ((evt: { code: number }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public send = vi.fn();
  public close = vi.fn(() => {
    this.readyState = MockKioskWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockKioskWebSocket.instances.push(this);
  }

  triggerOpen() {
    this.readyState = MockKioskWebSocket.OPEN;
    this.onopen?.();
  }

  triggerClose(code = 1006) {
    this.readyState = MockKioskWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

describe('Wave 1 [W1-2]: connectBayWebSocket 재연결 시 30초 pingInterval 중복 누수 차단', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'S_PING_TEST');
    MockKioskWebSocket.instances = [];
    globalThis.WebSocket = MockKioskWebSocket as unknown as typeof WebSocket;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('4회 연속 끊김/재연결이 발생해도 30초 경과 시 활성 소켓에 정확히 1회의 PING만 전송하며 구독 해제 시 타이머가 완전히 종료된다', async () => {
    const { api } = await import('../api');
    const listener = vi.fn();
    const unsubscribe = api.connectBayWebSocket(listener);

    expect(MockKioskWebSocket.instances.length).toBe(1);
    MockKioskWebSocket.instances[0].triggerOpen();

    // 4회 연속 네트워크 단절 -> 3초 후 재연결 반복
    for (let i = 0; i < 4; i++) {
      const current = MockKioskWebSocket.instances[MockKioskWebSocket.instances.length - 1];
      current.triggerClose(1006);
      await vi.advanceTimersByTimeAsync(3000);
      const next = MockKioskWebSocket.instances[MockKioskWebSocket.instances.length - 1];
      next.triggerOpen();
    }

    expect(MockKioskWebSocket.instances.length).toBe(5);
    const activeSocket = MockKioskWebSocket.instances[4];
    expect(activeSocket.send).not.toHaveBeenCalled();

    // 30초 경과: 이전 4개 소켓의 pingInterval이 누수되었다면 5번 호출되지만, 정리되었으므로 정확히 1번만 호출되어야 함
    await vi.advanceTimersByTimeAsync(30000);
    expect(activeSocket.send).toHaveBeenCalledTimes(1);
    expect(activeSocket.send).toHaveBeenCalledWith('PING');

    // 구독 해제 후 추가 60초 경과 시 더 이상 PING이 발생하지 않아야 함
    unsubscribe();
    activeSocket.send.mockClear();
    await vi.advanceTimersByTimeAsync(60000);
    expect(activeSocket.send).not.toHaveBeenCalled();
  });
});
