import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

describe('Wave 1 [W1-1]: api.scanFace externalSignal + 15초 타임아웃 결합 보장', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('externalSignal이 전달된 상태에서도 백엔드 응답이 15초 이상 지연되면 타임아웃으로 즉시 abort하여 null을 반환한다', async () => {
    const externalController = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
          return;
        }
        sig?.addEventListener('abort', () => {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    let settled = false;
    const promise = api.scanFace('192.168.0.55', externalController.signal).then((res) => {
      settled = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(14999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    const result = await promise;
    expect(settled).toBe(true);
    expect(result).toBeNull();
  });

  it('이미 aborted 상태인 externalSignal로 호출하면 네트워크 요청 없이 즉시 null을 반환한다', async () => {
    const externalController = new AbortController();
    externalController.abort();
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await api.scanFace('192.168.0.55', externalController.signal);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('진행 중 externalSignal.abort() 호출 시 즉시 fetch를 취소하고 리스너를 정리한다', async () => {
    const externalController = new AbortController();
    const removeSpy = vi.spyOn(externalController.signal, 'removeEventListener');

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    const promise = api.scanFace('192.168.0.55', externalController.signal);
    externalController.abort();
    const result = await promise;
    expect(result).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
