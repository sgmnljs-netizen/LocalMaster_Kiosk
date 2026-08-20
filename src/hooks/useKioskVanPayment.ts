/**
 * [무인 키오스크 VAN 결제 상태 머신 커스텀 훅]
 * 단말기 결제 라이프사이클(대기 ➔ 카드삽입 ➔ 승인 ➔ 완료/실패) 및 30초 카운트다운 타이머 관리
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { kioskVanClient } from '../services/van/van_client';
import type {
  CardPaymentRequestParams,
  CardApprovalResult,
  VanPaymentState,
} from '../services/van/van_types';
import { useKioskSettings } from '../stores/kioskSettings';

interface UseKioskVanPaymentReturn {
  state: VanPaymentState;
  isProcessing: boolean;
  remainingSeconds: number;
  error: string | null;
  result: CardApprovalResult | null;
  startPayment: (params: CardPaymentRequestParams) => Promise<CardApprovalResult>;
  cancelPayment: () => void;
  reset: () => void;
}

export function useKioskVanPayment(): UseKioskVanPaymentReturn {
  const { settings } = useKioskSettings();
  const [state, setState] = useState<VanPaymentState>('IDLE');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CardApprovalResult | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 키오스크 로컬 설정이 변경되면 vanClient 설정도 동기화
  useEffect(() => {
    kioskVanClient.setConfig({
      terminalId: settings.terminalId || '88010003',
      vcatPort: parseInt(settings.vcatPort, 10) || 9099,
    });
  }, [settings.terminalId, settings.vcatPort]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setState('IDLE');
    setRemainingSeconds(30);
    setError(null);
    setResult(null);
  }, [clearTimer]);

  const cancelPayment = useCallback(() => {
    kioskVanClient.cancelCurrentRequest();
    clearTimer();
    setState('CANCELLED');
    setError('결제가 취소되었습니다.');
  }, [clearTimer]);

  const startPayment = useCallback(
    async (params: CardPaymentRequestParams): Promise<CardApprovalResult> => {
      reset();
      const totalTimeout = params.timeoutSeconds || 30;
      setRemainingSeconds(totalTimeout);

      // 1초 단위 타이머 시작
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearTimer();
            kioskVanClient.cancelCurrentRequest();
            setState('CANCELLED');
            setError('결제 시간이 초과되어 취소되었습니다.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      try {
        const res = await kioskVanClient.requestCardPayment(params, (newState) => {
          setState(newState);
        });

        clearTimer();
        setResult(res);

        if (!res.success) {
          setError(res.error_message || '결제가 승인되지 않았습니다.');
        }

        return res;
      } catch (err: unknown) {
        clearTimer();
        setState('ERROR');
        const errMsg = err instanceof Error ? err.message : '단말기 통신 중 오류가 발생했습니다.';
        setError(errMsg);
        const failResult: CardApprovalResult = {
          success: false,
          auth_code: '',
          approved_at: new Date().toISOString(),
          card_no_masked: '',
          issuer_name: '',
          acquirer_name: '',
          terminal_id: kioskVanClient.getConfig().terminalId,
          amount: params.amount,
          installment_months: 0,
          error_code: 'E_UNKNOWN',
          error_message: errMsg,
        };
        setResult(failResult);
        return failResult;
      }
    },
    [reset, clearTimer]
  );

  const isProcessing = state === 'READY' || state === 'WAITING_CARD' || state === 'REQUESTING';

  useEffect(() => {
    return () => {
      if (isProcessing) {
        kioskVanClient.cancelCurrentRequest();
      }
      clearTimer();
    };
  }, [isProcessing, clearTimer]);

  return {
    state,
    isProcessing,
    remainingSeconds,
    error,
    result,
    startPayment,
    cancelPayment,
    reset,
  };
}
