/**
 * [무인 키오스크 VAN 결제 상태 머신 커스텀 훅]
 * 단말기 결제 라이프사이클(대기 ➔ 카드삽입 ➔ 승인 ➔ 완료/실패) 및 30초 카운트다운 타이머 관리
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { kioskVanClient } from '../services/van/van_client';
import { KIOSK_VAN_APPROVAL_TIMEOUT_SEC } from '../services/van/adapters/BaseVanAdapter';
import {
  normalizeVanProvider,
  type CardPaymentRequestParams,
  type CardApprovalResult,
  type VanPaymentState,
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

export function sanitizeVanPort(rawPort: unknown, defaultPort = 9099): number {
  const fallback =
    Number.isInteger(defaultPort) && defaultPort >= 1 && defaultPort <= 65535
      ? defaultPort
      : 9099;
  const parsed = Number.parseInt(String(rawPort ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

export function useKioskVanPayment(): UseKioskVanPaymentReturn {
  const { settings } = useKioskSettings();
  const [state, setState] = useState<VanPaymentState>('IDLE');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(KIOSK_VAN_APPROVAL_TIMEOUT_SEC);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CardApprovalResult | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTimeoutRef = useRef<boolean>(false);
  const stateRef = useRef<VanPaymentState>('IDLE');
  const inFlightRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const updateVanState = useCallback((next: VanPaymentState) => {
    stateRef.current = next;
    if (isMountedRef.current) {
      setState(next);
    }
  }, []);

  // 키오스크 로컬 설정이 변경되면 vanClient 설정도 동기화
  useEffect(() => {
    kioskVanClient.setConfig({
      provider: normalizeVanProvider(settings.providerType),
      terminalId: settings.terminalId || '88010003',
      vcatPort: sanitizeVanPort(settings.vcatPort, 9099),
    });
  }, [settings.terminalId, settings.vcatPort, settings.providerType]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    isTimeoutRef.current = false;
    inFlightRef.current = false;
    updateVanState('IDLE');
    setRemainingSeconds(KIOSK_VAN_APPROVAL_TIMEOUT_SEC);
    setError(null);
    setResult(null);
  }, [clearTimer, updateVanState]);

  const cancelPayment = useCallback(() => {
    isTimeoutRef.current = false;
    inFlightRef.current = false;
    kioskVanClient.cancelCurrentRequest();
    clearTimer();
    updateVanState('CANCELLED');
    setError('결제가 취소되었습니다.');
  }, [clearTimer, updateVanState]);

  const startPayment = useCallback(
    async (params: CardPaymentRequestParams): Promise<CardApprovalResult> => {
      if (inFlightRef.current) {
        return {
          success: false,
          auth_code: '',
          approved_at: new Date().toISOString(),
          card_no_masked: '',
          issuer_name: '',
          acquirer_name: '',
          terminal_id: kioskVanClient.getConfig().terminalId,
          amount: params.amount,
          installment_months: params.installmentMonths ?? 0,
          error_code: 'E_BUSY',
          error_message: '이미 결제가 진행 중입니다.',
        };
      }
      reset();
      inFlightRef.current = true;
      isTimeoutRef.current = false;
      const totalTimeout = params.timeoutSeconds || KIOSK_VAN_APPROVAL_TIMEOUT_SEC;
      setRemainingSeconds(totalTimeout);

      // 1초 단위 타이머 시작 (이미 VAN사 승인 통신 중['REQUESTING']일 때는 소켓 절단 금지 — 어댑터 원장 복구 보장)
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearTimer();
            if (stateRef.current === 'REQUESTING') {
              return 0;
            }
            isTimeoutRef.current = true;
            kioskVanClient.cancelCurrentRequest();
            updateVanState('TIMEOUT');
            setError('결제 시간이 초과되어 취소되었습니다.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      try {
        const res = await kioskVanClient.requestCardPayment(params, (newState) => {
          if (!isMountedRef.current) return;
          if (newState === 'CANCELLED' && isTimeoutRef.current) {
            updateVanState('TIMEOUT');
          } else {
            updateVanState(newState);
          }
        });

        clearTimer();
        if (!isMountedRef.current) {
          return res;
        }

        if (res.success) {
          updateVanState('APPROVED');
          setError(null);
        } else {
          if (res.error_code === 'E_USER_CANCEL' || res.errorCode === 'E_USER_CANCEL') {
            if (isTimeoutRef.current) {
              updateVanState('TIMEOUT');
              setError('결제 시간이 초과되어 취소되었습니다.');
              res.error_code = 'E_TIMEOUT';
            } else {
              updateVanState('CANCELLED');
              setError(res.error_message || '결제가 취소되었습니다.');
            }
          } else {
            if (
              stateRef.current === 'READY' ||
              stateRef.current === 'WAITING_CARD' ||
              stateRef.current === 'REQUESTING'
            ) {
              updateVanState(res.error_code === 'E_TIMEOUT' ? 'TIMEOUT' : 'REJECTED');
            }
            setError(res.error_message || '결제가 승인되지 않았습니다.');
          }
        }

        setResult(res);
        return res;
      } catch (err: unknown) {
        clearTimer();
        const errMsg = err instanceof Error ? err.message : '단말기 통신 중 오류가 발생했습니다.';
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
        if (isMountedRef.current) {
          updateVanState('ERROR');
          setError(errMsg);
          setResult(failResult);
        }
        return failResult;
      } finally {
        inFlightRef.current = false;
      }
    },
    [reset, clearTimer, updateVanState]
  );

  const isProcessing = state === 'READY' || state === 'WAITING_CARD' || state === 'REQUESTING';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      inFlightRef.current = false;
      const current = stateRef.current;
      if (current === 'READY' || current === 'WAITING_CARD' || current === 'REQUESTING') {
        kioskVanClient.cancelCurrentRequest();
      }
      clearTimer();
    };
  }, [clearTimer]);

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
