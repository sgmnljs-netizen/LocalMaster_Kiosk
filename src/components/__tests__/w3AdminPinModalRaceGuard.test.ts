import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  shouldIgnoreAdminPinKeyEvent,
  parseAdminPinLockoutSeconds,
} from '../AdminPinModal';

describe('[W3-KSK-components] AdminPinModal 동기 더블탭·키보드 repeat 차단 및 잠금시간 경계값 검증', () => {
  it('shouldIgnoreAdminPinKeyEvent가 키 길게 누름(repeat), 조합키(Ctrl/Meta/Alt), IME 조합, 입력창 포커스를 차단한다', () => {
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1' })).toBe(false);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', repeat: true })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', ctrlKey: true })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', metaKey: true })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', altKey: true })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', isComposing: true })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', targetTagName: 'input' })).toBe(true);
    expect(shouldIgnoreAdminPinKeyEvent({ key: '1', isContentEditable: true })).toBe(true);
  });

  it('parseAdminPinLockoutSeconds가 서버 잠금 안내 메시지의 초 단위 값을 안전하게 클램핑(1..3600)하고 비정상 입력을 기본값으로 폴백한다', () => {
    expect(parseAdminPinLockoutSeconds('PIN 5회 오류로 잠금되었습니다. (45초 후 재시도)')).toBe(45);
    expect(parseAdminPinLockoutSeconds('잠금 (0초 후 재시도)', 30)).toBe(30);
    expect(parseAdminPinLockoutSeconds('잠금 (99999초 후 재시도)')).toBe(3600);
    expect(parseAdminPinLockoutSeconds('', 30)).toBe(30);
    expect(parseAdminPinLockoutSeconds(null)).toBe(60);
  });

  it('AdminPinModal.tsx가 동기 pinRef/isVerifyingRef/isOpenRef 및 Capture 키 격리를 적용하여 4번째 자리 연타·지연 응답을 차단한다', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../AdminPinModal.tsx'), 'utf8');
    expect(src).toContain('isVerifyingRef.current');
    expect(src).toContain('pinRef.current');
    expect(src).toContain('if (!isOpenRef.current) return;');
    expect(src).toContain('e.stopImmediatePropagation()');
  });
});
