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
    if (!enabled) return;

    const unsubscribeDaemon = kioskHardwareBridge.subscribeScanner((barcode) => {
      if (barcode && barcode.length >= minBarcodeLength) {
        onScanRef.current(barcode);
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minBarcodeLength) {
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

      if (e.key.length === 1) {
        if (interval > maxKeystrokeIntervalMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      unsubscribeDaemon();
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, minBarcodeLength, maxKeystrokeIntervalMs]);
}
