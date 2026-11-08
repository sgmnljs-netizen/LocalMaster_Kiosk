import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMap = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return storageMap.size;
  },
  clear() {
    storageMap.clear();
  },
  getItem(key: string) {
    return storageMap.has(key) ? (storageMap.get(key) as string) : null;
  },
  key(index: number) {
    return Array.from(storageMap.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageMap.delete(key);
  },
  setItem(key: string, value: string) {
    storageMap.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: memoryStorage,
      location: { hostname: '127.0.0.1', protocol: 'http:' },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    configurable: true,
    writable: true,
  });
}

import { api } from '../api';
import { getKioskSettings, saveKioskSettings } from '../../stores/kioskSettings';

describe('[Wave 1][Kiosk/멀티매장격리] checkConnection 덮어쓰기 차단, 지점 변경 캐시 파기 및 WS store_cd 격리', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storageMap.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('설정 완료된 키오스크는 checkConnection 호출 시 store_cd 쿼리·헤더를 전달하며 타 매장 응답으로 덮어쓰지 않는다', async () => {
    saveKioskSettings(
      {
        storeCode: 'S-MULTI-202',
        apiUrl: 'http://127.0.0.1:8000',
        terminalId: 'KSK-202',
      },
      { syncRemote: false }
    );

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({ store_cd: 'S-DEFAULT-1000', store_nm: '기본점' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const ok = await api.checkConnection();
    expect(ok).toBe(true);
    expect(capturedUrl).toContain('store_cd=S-MULTI-202');
    expect(capturedHeaders['x-store-cd']).toBe('S-MULTI-202');
    expect(getKioskSettings().storeCode).toBe('S-MULTI-202');
    expect(localStorage.getItem('LM_STORE_CD')).toBe('S-MULTI-202');
  });

  it('미설정 신규 키오스크는 최초 checkConnection 시 서버 store_cd를 정상 자동 프로비저닝한다', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ store_cd: 'S-EDGE-001', store_nm: '엣지1호점' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const ok = await api.checkConnection();
    expect(ok).toBe(true);
    expect(localStorage.getItem('LM_STORE_CD')).toBe('S-EDGE-001');
    expect(getKioskSettings().storeCode).toBe('S-EDGE-001');
  });

  it('saveKioskSettings에서 storeCode 변경 시 이전 지점의 LM_* 로컬 캐시를 즉시 파기한다', () => {
    saveKioskSettings({ storeCode: 'S-OLD-01' }, { syncRemote: false });
    localStorage.setItem('LM_BAYS', JSON.stringify([{ bay_no: 1, status: 'OCCUPIED' }]));
    localStorage.setItem('LM_PRODUCTS', JSON.stringify([{ prod_cd: 'P_OLD' }]));
    localStorage.setItem('LM_MEMBERS', JSON.stringify([{ member_no: 'M_OLD' }]));
    localStorage.setItem('LM_STORE_INFO', JSON.stringify({ store_nm: '구지점' }));

    saveKioskSettings({ storeCode: 'S-NEW-02' }, { syncRemote: false });

    expect(localStorage.getItem('LM_STORE_CD')).toBe('S-NEW-02');
    expect(localStorage.getItem('LM_BAYS')).toBeNull();
    expect(localStorage.getItem('LM_PRODUCTS')).toBeNull();
    expect(localStorage.getItem('LM_MEMBERS')).toBeNull();
    expect(localStorage.getItem('LM_STORE_INFO')).toBeNull();
  });
});
