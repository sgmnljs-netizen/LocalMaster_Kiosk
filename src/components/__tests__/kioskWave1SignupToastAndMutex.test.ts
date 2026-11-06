import { describe, it, expect, vi } from 'vitest';

const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
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
  } satisfies Storage,
  configurable: true,
  writable: true,
});

import { resolveSignupToastSuccess } from '../MemberRegister';
import { runWithAllocationMutex } from '../../utils/bayStatusGuard';

describe('Wave 1 [W1-5]: 회원가입 토스트 반전 수정 및 0원 동반자 그룹배정 뮤텍스 검증', () => {
  it('resolveSignupToastSuccess는 일반 정상 가입 시 true(성공 녹색 토스트), 안면 등록 경고 포함 시 false(경고 토스트)를 반환한다', () => {
    expect(resolveSignupToastSuccess({ face_enroll_warning: undefined })).toBe(true);
    expect(resolveSignupToastSuccess({ face_enroll_warning: null })).toBe(true);
    expect(resolveSignupToastSuccess({ face_enroll_warning: '' })).toBe(true);
    expect(resolveSignupToastSuccess(undefined)).toBe(true);

    expect(resolveSignupToastSuccess({ face_enroll_warning: '안면 단말기 통신 지연으로 현장 등록이 생략되었습니다.' })).toBe(false);
    expect(resolveSignupToastSuccess({ face_enroll_warning: true })).toBe(false);
  });

  it('runWithAllocationMutex는 진행 중 더블탭 중복 요청을 차단하고 예외 발생 후에도 락을 안전하게 해제한다', async () => {
    const lockRef = { current: false };
    let resolveFirst!: (val: string) => void;
    const taskSpy = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const firstCall = runWithAllocationMutex(lockRef, taskSpy);
    expect(lockRef.current).toBe(true);

    // 진행 중 두 번째 더블탭은 실행되지 않고 즉시 무시됨
    const duplicateCall = await runWithAllocationMutex(lockRef, taskSpy);
    expect(duplicateCall).toEqual({ executed: false });
    expect(taskSpy).toHaveBeenCalledTimes(1);

    resolveFirst('GROUP_OK');
    const firstResult = await firstCall;
    expect(firstResult).toEqual({ executed: true, value: 'GROUP_OK' });
    expect(lockRef.current).toBe(false);

    // 예외 발생 시에도 finally에서 락이 반드시 복구되어야 함
    await expect(
      runWithAllocationMutex(lockRef, async () => {
        throw new Error('네트워크 오류');
      })
    ).rejects.toThrow('네트워크 오류');
    expect(lockRef.current).toBe(false);
  });
});
