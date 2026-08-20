import { useCallback, useRef } from 'react';

export function useHiddenAdminTrigger(requiredTaps: number = 5, timeoutMs: number = 3000) {
  const tapCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback((onTrigger: () => void) => {
    tapCountRef.current += 1;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (tapCountRef.current >= requiredTaps) {
      tapCountRef.current = 0;
      onTrigger();
      return;
    }

    timerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, timeoutMs);
  }, [requiredTaps, timeoutMs]);

  return { handleTap };
}
