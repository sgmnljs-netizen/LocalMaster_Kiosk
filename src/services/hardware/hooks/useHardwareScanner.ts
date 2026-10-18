/**
 * [키오스크 전역 바코드 / 2D QR 스캐너 리스너 커스텀 훅]
 */

import { useEffect, useRef } from 'react';
import { kioskHardwareBridge } from '../services/HardwareBridgeClient';

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minBarcodeLength?: number;
  maxKeystrokeIntervalMs?: number;
}

function resolveScannerChar(e: KeyboardEvent, isInputFocused: boolean): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;

  // 일반 ASCII 단일 문자 (영문/숫자/기호)
  if (e.key && e.key.length === 1 && /^[\x20-\x7E]$/.test(e.key)) {
    return e.key;
  }

  // 입력창 포커스 상태에서 한글 조합 중(229)이면 일반 타이핑이므로 스캐너 버퍼에 넣지 않음
  if (isInputFocused && (e.isComposing || e.keyCode === 229)) {
    return null;
  }

  // 윈도우 키오스크가 '한글(IME)' 모드로 전환된 상태에서 USB HID 스캐너가 영문/기호 바코드를 스캔할 때 e.code 기반 ASCII 복원
  if (e.code && e.code.startsWith('Key') && e.code.length === 4) {
    const letter = e.code.slice(3);
    return e.shiftKey ? letter.toUpperCase() : letter.toLowerCase();
  }
  if (e.code && e.code.startsWith('Digit') && e.code.length === 6) {
    return e.code.slice(5);
  }
  if (e.code && e.code.startsWith('Numpad') && e.code.length === 7) {
    const num = e.code.slice(6);
    if (/^[0-9]$/.test(num)) return num;
  }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    return e.shiftKey ? '_' : '-';
  }
  if (e.code === 'Semicolon' && e.shiftKey) {
    return ':';
  }
  if (e.code === 'Slash' || e.code === 'NumpadDivide') {
    return '/';
  }
  if (e.code === 'Period' || e.code === 'NumpadDecimal') {
    return '.';
  }

  return null;
}

export function useHardwareScanner({
  onScan,
  enabled = true,
  minBarcodeLength = 3,
  maxKeystrokeIntervalMs = 50,
}: UseHardwareScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      return;
    }

    const unsubscribeDaemon = kioskHardwareBridge.subscribeScanner((barcode) => {
      if (barcode && barcode.length >= minBarcodeLength) {
        onScanRef.current(barcode);
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift 단독 키 이벤트는 타임스탬프 및 버퍼에 영향을 주지 않도록 무시
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'CapsLock') {
        return;
      }

      const target = e.target as HTMLElement;
      const isInputFocused = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      );

      if (isInputFocused && (e.isComposing || e.keyCode === 229)) return;

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;

      if (isInputFocused && interval > maxKeystrokeIntervalMs) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        lastKeyTimeRef.current = now;
        if (bufferRef.current.length >= minBarcodeLength && interval <= maxKeystrokeIntervalMs * 3) {
          const scannedCode = bufferRef.current;
          bufferRef.current = '';
          onScanRef.current(scannedCode);

          if (isInputFocused) {
            e.preventDefault();
            e.stopPropagation();
          }
        } else {
          bufferRef.current = '';
        }
        return;
      }

      const resolvedChar = resolveScannerChar(e, isInputFocused);
      if (resolvedChar !== null) {
        if (interval > maxKeystrokeIntervalMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }
        lastKeyTimeRef.current = now;
        bufferRef.current += resolvedChar;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      unsubscribeDaemon();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, minBarcodeLength, maxKeystrokeIntervalMs]);
}
