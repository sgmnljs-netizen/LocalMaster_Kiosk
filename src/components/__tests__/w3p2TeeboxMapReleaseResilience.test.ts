import { describe, expect, it, vi } from 'vitest';
import { safeReleaseSelectedBay } from '../TeeboxMap';

describe('[W3P2] TeeboxMap safeReleaseSelectedBay 예외 복원력 검증', () => {
  it('정상 해제 시 releaseFn을 호출하고 onCleaned 콜백을 실행한 뒤 true를 반환한다', async () => {
    const releaseFn = vi.fn().mockResolvedValue(undefined);
    const onCleaned = vi.fn();

    const ok = await safeReleaseSelectedBay(7, releaseFn, onCleaned);

    expect(ok).toBe(true);
    expect(releaseFn).toHaveBeenCalledWith(7);
    expect(onCleaned).toHaveBeenCalledTimes(1);
  });

  it('네트워크 장애나 서버 만료(HTTP 404/500)로 releaseFn이 reject되어도 예외를 삼키고 onCleaned를 반드시 실행한다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const releaseFn = vi.fn().mockRejectedValue(new Error('HTTP 500 Internal Error'));
    const onCleaned = vi.fn();

    const ok = await safeReleaseSelectedBay(12, releaseFn, onCleaned);

    expect(ok).toBe(false);
    expect(releaseFn).toHaveBeenCalledWith(12);
    expect(onCleaned).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('null, 0 이하, NaN 타석 번호 전달 시 불필요한 API 호출이나 상태 변이를 일으키지 않는다', async () => {
    const releaseFn = vi.fn();
    const onCleaned = vi.fn();

    expect(await safeReleaseSelectedBay(null, releaseFn, onCleaned)).toBe(false);
    expect(await safeReleaseSelectedBay(0, releaseFn, onCleaned)).toBe(false);
    expect(await safeReleaseSelectedBay(-3, releaseFn, onCleaned)).toBe(false);
    expect(await safeReleaseSelectedBay(Number.NaN, releaseFn, onCleaned)).toBe(false);

    expect(releaseFn).not.toHaveBeenCalled();
    expect(onCleaned).not.toHaveBeenCalled();
  });
});
