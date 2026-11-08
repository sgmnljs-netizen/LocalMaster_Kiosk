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

  it('동시 중복 scanFace 호출 시 선행 요청을 즉시 abort하고, 응답 직후 abort된 경우 getMember 후속 조회 및 반환을 차단한다', async () => {
    const firstAborted = { value: false };
    let resolveSecondScan!: (res: Response) => void;
    const getMemberSpy = vi.spyOn(api, 'getMember').mockResolvedValue({
      member_no: 'M001',
      member_name: '홍길동',
      hp: '01012345678',
    } as Awaited<ReturnType<typeof api.getMember>>);

    let callIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      callIdx += 1;
      if (callIdx === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            firstAborted.value = true;
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return new Promise<Response>((resolve) => {
        resolveSecondScan = resolve;
      });
    });

    const p1 = api.scanFace('192.168.0.55');
    const ext2 = new AbortController();
    const p2 = api.scanFace('192.168.0.55', ext2.signal);

    // 두 번째 호출 즉시 첫 번째 인플라이트 스캔이 abort되어야 함
    expect(firstAborted.value).toBe(true);
    expect(await p1).toBeNull();

    // 두 번째 스캔이 HTTP 200 JSON을 반환하는 찰나 외부에서 취소(탭 전환/언마운트)된 경우 getMember를 호출하지 않고 null 반환
    resolveSecondScan({
      ok: true,
      json: async () => {
        ext2.abort();
        return { success: true, member_id: 'M001' };
      },
    } as Response);

    expect(await p2).toBeNull();
    expect(getMemberSpy).not.toHaveBeenCalled();
  });
});
