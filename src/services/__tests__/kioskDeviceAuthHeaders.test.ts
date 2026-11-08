import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const storageMap = new Map<string, string>();
if (!globalThis.localStorage) {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
    setItem: (k: string, v: string) => {
      storageMap.set(k, String(v));
    },
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    clear: () => {
      storageMap.clear();
    },
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    get length() {
      return storageMap.size;
    },
  };
}

if (!globalThis.window) {
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    location: {
      hostname: 'localhost',
      port: '5179',
      origin: 'http://localhost:5179',
    },
    localStorage: globalThis.localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { api } from '../api';
import {
  hydrateKioskDeviceSettingsFromServer,
  saveKioskSettings,
} from '../../stores/kioskSettings';

class MockAuthWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockAuthWebSocket[] = [];

  public url: string;
  public readyState = MockAuthWebSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onmessage: ((evt: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockAuthWebSocket.instances.push(this);
  }

  send = vi.fn();

  close() {
    this.readyState = MockAuthWebSocket.CLOSED;
  }
}

describe('[K-11] 키오스크 기기 인증키(X-Device-Key / device_key) REST·WebSocket 자동 주입 검증', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    MockAuthWebSocket.instances = [];
    globalThis.WebSocket = MockAuthWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it('deviceKey 미설정 시 기존 WS URL을 유지하고, deviceKey 설정 시 connectBayWebSocket 쿼리 및 getSecureHeaders에 즉시 반영된다', () => {
    localStorage.setItem('LM_STORE_CD', 'S-K11-TEST');
    saveKioskSettings({ storeCode: 'S-K11-TEST', deviceKey: '' });

    const unsub1 = api.connectBayWebSocket(() => {});
    expect(MockAuthWebSocket.instances.length).toBe(1);
    expect(MockAuthWebSocket.instances[0].url).toContain('store_cd=S-K11-TEST');
    expect(MockAuthWebSocket.instances[0].url).not.toContain('device_key=');
    expect(api.getSecureHeaders()['x-device-key']).toBeUndefined();
    unsub1();

    saveKioskSettings({ storeCode: 'S-K11-TEST', deviceKey: 'DK_SECRET_001' });
    expect(api.getSecureHeaders()['x-device-key']).toBe('DK_SECRET_001');

    const unsub2 = api.connectBayWebSocket(() => {});
    const latestWs = MockAuthWebSocket.instances[MockAuthWebSocket.instances.length - 1];
    expect(latestWs.url).toContain('device_key=DK_SECRET_001');
    unsub2();
  });

  it('hydrateKioskDeviceSettingsFromServer 호출 시 설정된 deviceKey를 X-Device-Key 헤더로 전달한다', async () => {
    localStorage.setItem('LM_STORE_CD', 'S-K11-HYDRATE');
    saveKioskSettings({
      storeCode: 'S-K11-HYDRATE',
      deviceId: 'DEV-01',
      deviceKey: 'DK_HYDRATE_777',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        has_saved_settings: true,
        settings: {
          deviceId: 'DEV-01',
          terminalId: '88017777',
          hasCustomAdminPin: true,
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const hydrated = await hydrateKioskDeviceSettingsFromServer();
    expect(hydrated?.terminalId).toBe('88017777');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, reqInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = reqInit.headers as Record<string, string>;
    expect(headers['X-Device-Key']).toBe('DK_HYDRATE_777');
    expect(headers['x-store-cd']).toBe('S-K11-HYDRATE');
  });
});
