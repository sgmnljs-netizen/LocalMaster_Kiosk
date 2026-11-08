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

import {
  shouldAcceptFaceScanResolution,
  shouldAcceptSmartTagTrigger,
  confirmDetectedMemberOnce,
} from '../MemberAuth';

describe('Wave 1 [Focus 2]: Kiosk MemberAuth 안면인식·교차채널 중복 이벤트 및 확인 연타 방어', () => {
  it('shouldAcceptFaceScanResolution은 abort·구세대 컨트롤러·언마운트·선행 확인모달 오픈 시 후착 안면 결과를 차단한다', () => {
    const base = {
      aborted: false,
      isCurrentController: true,
      isMounted: true,
      hasDetectedMember: false,
      hasDuplicateCandidates: false,
      isAuthConfirmed: false,
    };
    expect(shouldAcceptFaceScanResolution(base)).toBe(true);
    expect(shouldAcceptFaceScanResolution({ ...base, aborted: true })).toBe(false);
    expect(shouldAcceptFaceScanResolution({ ...base, isCurrentController: false })).toBe(false);
    expect(shouldAcceptFaceScanResolution({ ...base, isMounted: false })).toBe(false);
    expect(shouldAcceptFaceScanResolution({ ...base, hasDetectedMember: true })).toBe(false);
    expect(shouldAcceptFaceScanResolution({ ...base, hasDuplicateCandidates: true })).toBe(false);
    expect(shouldAcceptFaceScanResolution({ ...base, isAuthConfirmed: true })).toBe(false);
  });

  it('shouldAcceptSmartTagTrigger는 조회 중이거나 본인 확인/동번 후보 모달 오픈 중 중복 태그 유입을 차단한다', () => {
    expect(
      shouldAcceptSmartTagTrigger({
        isSearching: false,
        hasDetectedMember: false,
        hasDuplicateCandidates: false,
        isAuthConfirmed: false,
      })
    ).toBe(true);
    expect(
      shouldAcceptSmartTagTrigger({
        isSearching: true,
        hasDetectedMember: false,
        hasDuplicateCandidates: false,
        isAuthConfirmed: false,
      })
    ).toBe(false);
    expect(
      shouldAcceptSmartTagTrigger({
        isSearching: false,
        hasDetectedMember: true,
        hasDuplicateCandidates: false,
        isAuthConfirmed: false,
      })
    ).toBe(false);
  });

  it('confirmDetectedMemberOnce는 터치스크린 더블탭 시 onAuthSuccess가 단 1회만 호출되도록 동기식 락을 보장한다', () => {
    const lockRef = { current: false };
    const onAuthSuccess = vi.fn();
    const member = { member_no: '10187', member_name: '홍길동' };

    expect(confirmDetectedMemberOnce(lockRef, member, onAuthSuccess)).toBe(true);
    expect(confirmDetectedMemberOnce(lockRef, member, onAuthSuccess)).toBe(false);
    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
    expect(onAuthSuccess).toHaveBeenCalledWith(member);
  });
});
