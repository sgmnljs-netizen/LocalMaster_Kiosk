import { useCallback, useEffect, useRef } from 'react';

export function sanitizeHiddenAdminTriggerConfig(
  requiredTaps: unknown = 5,
  timeoutMs: unknown = 3000
): { safeRequiredTaps: number; safeTimeoutMs: number } {
  const numTaps = typeof requiredTaps === 'boolean' ? Number.NaN : Number(requiredTaps);
  const safeRequiredTaps =
    Number.isFinite(numTaps) && numTaps >= 1 ? Math.min(20, Math.floor(numTaps)) : 5;

  const numTimeout = typeof timeoutMs === 'boolean' ? Number.NaN : Number(timeoutMs);
  const safeTimeoutMs =
    Number.isFinite(numTimeout) && numTimeout >= 100 ? Math.min(60000, Math.floor(numTimeout)) : 3000;

  return { safeRequiredTaps, safeTimeoutMs };
}

export function useHiddenAdminTrigger(requiredTaps: number = 5, timeoutMs: number = 3000) {
  const tapCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { safeRequiredTaps, safeTimeoutMs } = sanitizeHiddenAdminTriggerConfig(requiredTaps, timeoutMs);

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
