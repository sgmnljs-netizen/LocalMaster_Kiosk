import { useCallback, useEffect, useRef } from 'react';

export function useHiddenAdminTrigger(requiredTaps: number = 5, timeoutMs: number = 3000) {
  const tapCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeRequiredTaps = Number.isFinite(requiredTaps) ? Math.max(1, Math.floor(requiredTaps)) : 5;
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(100, Math.floor(timeoutMs)) : 3000;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleTap = useCallback((onTrigger: () => void) => {
    tapCountRef.current += 1;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (tapCountRef.current >= safeRequiredTaps) {
      tapCountRef.current = 0;
      onTrigger();
      return;
    }

    timerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
      timerRef.current = null;
    }, safeTimeoutMs);
  }, [safeRequiredTaps, safeTimeoutMs]);

  return { handleTap };
}
