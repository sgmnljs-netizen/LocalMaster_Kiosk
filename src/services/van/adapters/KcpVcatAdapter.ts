/**
 * [키오스크 KCP VCAT 어댑터]
 */

import {
  BaseVanAdapter,
  KIOSK_VAN_APPROVAL_TIMEOUT_SEC,
  KIOSK_VAN_CANCEL_TIMEOUT_MS,
  KIOSK_VAN_RECOVERY_TIMEOUT_MS,
  formatKstIsoTimestamp,
} from './BaseVanAdapter';
import type {
  VanPaymentState,
  CardPaymentRequestParams,
  CardApprovalResult,
  CardCancelRequestParams,
  CardCancelResult,
  CashReceiptRequestParams,
  CashReceiptCancelParams,
  CashReceiptResult,
  TerminalHealthResult,
} from '../van_types';

function isAlreadyCancelledVanMessage(msg: string): boolean {
  const normalized = String(msg || '').replace(/\s+/g, '');
  return (
    normalized.includes('기취소') ||
    normalized.includes('이미취소') ||
    normalized.includes('취소된거래') ||
    normalized.includes('취소완료된')
  );
}

export class KcpVcatAdapter extends BaseVanAdapter {
  public readonly provider = 'KCP' as const;

  public async checkTerminalHealth(): Promise<TerminalHealthResult> {
    try {
      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return {
          isOnline: true,
          message: 'NHN KCP VCAT 단말기 연결 정상',
          provider: this.provider,
          statusCode: res.status,
        };
      }
      return {
        isOnline: false,
        message: `단말기 응답 없음 (HTTP ${res.status})`,
        provider: this.provider,
        statusCode: res.status,
      };
    } catch {
      return {
        isOnline: false,
        message: 'KCP VCAT 데몬 프로그램이 실행되지 않았습니다.',
        provider: this.provider,
      };
    }
  }

  public async requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const orderNo = params.orderId || `ORD-${Date.now()}`;
    const effectiveTerminalId = params.terminalId || this.config.terminalId;

    onStateChange?.('READY');

    try {
      onStateChange?.('WAITING_CARD');

      const vat = params.isTaxFree ? 0 : (params.vatAmount ?? Math.round(params.amount / 11));
      const timeoutSec = params.timeoutSeconds || this.config.timeoutSeconds || KIOSK_VAN_APPROVAL_TIMEOUT_SEC;
      const payload = {
        cmd: 'APPROVE',
        tran_type: 'D1',
        amount: params.amount,
        vat: vat,
        install_month: String(params.installmentMonths || 0).padStart(2, '0'),
        terminal_id: effectiveTerminalId,
        order_no: orderNo,
      };

      onStateChange?.('REQUESTING');

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(timeoutSec * 1000)]) : signal,
      });

      if (!res.ok) {
        onStateChange?.('ERROR');
        return this.createErrorResult('E_NETWORK_ERROR', `KCP VCAT 응답 오류 (HTTP ${res.status})`, params.amount);
      }

      const data = await res.json();

      if (data.res_cd === '0000' || data.response_code === '0000' || data.RESPONSE_CODE === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.auth_no || data.auth_code || data.AUTH_NO,
          approved_at: data.auth_date || data.AUTH_DATE || formatKstIsoTimestamp(),
          card_no_masked: data.card_no || data.CARD_NO || '****-****-****-****',
          issuer_code: data.issuer_cd || data.ISSUER_CD,
          issuer_name: data.issuer_nm || data.ISSUER_NM || '신용카드',
          acquirer_code: data.acquirer_cd || data.ACQUIRER_CD,
          acquirer_name: data.acquirer_nm || data.ACQUIRER_NM || '신용카드',
          terminal_id: data.terminal_id || effectiveTerminalId,
          merchant_no: data.merchant_no || data.MERCHANT_NO,
          amount: params.amount,
          installment_months: params.installmentMonths || 0,
          van_tr_no: data.van_tr_no || data.tr_no || data.TR_NO,
          raw_response: data,
        };
      } else {
        onStateChange?.('REJECTED');
        return this.createErrorResult(
          'E_UNKNOWN',
          data.res_msg || data.error_message || data.RES_MSG || '결제가 거절되었습니다.',
          params.amount,
          data
        );
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        onStateChange?.('CANCELLED');
        return this.createErrorResult('E_USER_CANCEL', '결제가 취소되었습니다.', params.amount);
      }

      // 🛡️ 소켓 단절/타임아웃 시 VCAT 브릿지 디스크 원장(Ledger) 직전 승인 내역 자동 복구
      try {
        const orderNoParam = encodeURIComponent(orderNo);
        const recoveryUrl = `${this.config.vcatHost}:${this.config.vcatPort}/vcat/last-approval?order_no=${orderNoParam}&amount=${params.amount}`;
        const recoveryRes = await fetch(recoveryUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(KIOSK_VAN_RECOVERY_TIMEOUT_MS),
        });
        if (recoveryRes.ok) {
          const recData = await recoveryRes.json();
          if (
            recData &&
            (recData.res_cd === '0000' || recData.RES_CD === '0000') &&
            (recData.auth_no || recData.AUTH_NO)
          ) {
            const recoveredAuthNo = String(recData.auth_no || recData.auth_code || recData.AUTH_NO || '');
            onStateChange?.('APPROVED');
            return {
              success: true,
              auth_code: recoveredAuthNo,
              approved_at: recData.auth_date || recData.AUTH_DATE || formatKstIsoTimestamp(),
              card_no_masked: recData.card_no || recData.CARD_NO || '****-****-****-****',
              issuer_code: recData.issuer_cd || recData.ISSUER_CD,
              issuer_name: recData.issuer_nm || recData.ISSUER_NM || '신용카드',
              acquirer_code: recData.acquirer_cd || recData.ACQUIRER_CD,
              acquirer_name: recData.acquirer_nm || recData.ACQUIRER_NM || '신용카드',
              terminal_id: recData.terminal_id || effectiveTerminalId,
              merchant_no: recData.merchant_no || recData.MERCHANT_NO,
              amount: params.amount,
              installment_months: params.installmentMonths || 0,
              van_tr_no: recData.van_tr_no || recData.tr_no || recData.TR_NO,
              raw_response: recData,
            };
          }
        }
      } catch {
        // 브릿지 복구 조회 실패 시 원래 타임아웃 에러 반환
      }

      onStateChange?.('ERROR');
      return this.createErrorResult(
        'E_TIMEOUT',
        err instanceof Error ? err.message : '단말기 통신 오류가 발생했습니다.',
        params.amount
      );
    }
  }

  private async recoverLastCancelFromBridge(
    orgAuthCode: string,
    amount: number
  ): Promise<Record<string, unknown> | null> {
    const cleanOrgAuth = String(orgAuthCode || '').trim();
    if (!cleanOrgAuth) return null;
    try {
      const recoveryUrl = `${this.config.vcatHost}:${this.config.vcatPort}/vcat/last-cancel?org_auth_no=${encodeURIComponent(cleanOrgAuth)}&amount=${amount}`;
      const recoveryRes = await fetch(recoveryUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(KIOSK_VAN_RECOVERY_TIMEOUT_MS),
      });
      if (recoveryRes.ok) {
        const recData = (await recoveryRes.json()) as Record<string, unknown>;
        if (recData && (recData.res_cd === '0000' || recData.RES_CD === '0000')) {
          return recData;
        }
      }
    } catch {
      // 브릿지 취소 원장 조회 실패 시 null 반환
    }
    return null;
  }

  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    try {
      const vat = params.isTaxFree ? 0 : (params.vat ?? Math.round(params.amount / 11));
      const installment = params.installmentMonths ?? 0;
      const payload = {
        cmd: 'CANCEL',
        tran_type: 'D2',
        amount: params.amount,
        vat,
        installment,
        install_month: String(installment).padStart(2, '0'),
        org_auth_no: params.orgAuthCode,
        org_auth_date: params.orgApprovedDate,
        terminal_id: params.terminalId || this.config.terminalId,
        van_tr_no: params.vanTrNo,
        reason: params.reason || '고객 요청 취소',
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(KIOSK_VAN_CANCEL_TIMEOUT_MS),
      });

      if (!res.ok) {
        return {
          success: false,
          canceled_amount: 0,
          canceled_at: formatKstIsoTimestamp(),
          error_code: 'E_NETWORK_ERROR',
          error_message: `KCP VCAT 취소 응답 오류 (HTTP ${res.status})`,
        };
      }

      const data = await res.json();
      if (data.res_cd === '0000' || data.response_code === '0000' || data.RESPONSE_CODE === '0000') {
        return {
          success: true,
          cancel_auth_code: data.auth_no || data.auth_code || data.AUTH_NO,
          canceled_at: data.auth_date || data.AUTH_DATE || formatKstIsoTimestamp(),
          canceled_amount: params.amount,
          raw_response: data,
        };
      } else {
        const errMsg = data.res_msg || data.error_message || data.RES_MSG || '취소 처리에 실패했습니다.';
        if (isAlreadyCancelledVanMessage(errMsg)) {
          const recCancel = await this.recoverLastCancelFromBridge(params.orgAuthCode, params.amount);
          if (recCancel) {
            return {
              success: true,
              cancel_auth_code: String(recCancel.auth_no || recCancel.auth_code || recCancel.AUTH_NO || params.orgAuthCode),
              canceled_at: String(recCancel.auth_date || recCancel.AUTH_DATE || formatKstIsoTimestamp()),
              canceled_amount: params.amount,
              raw_response: recCancel,
            };
          }
        }
        return {
          success: false,
          canceled_amount: 0,
          canceled_at: formatKstIsoTimestamp(),
          error_code: 'E_UNKNOWN',
          error_message: errMsg,
          raw_response: data,
        };
      }
    } catch (err: unknown) {
      const recCancel = await this.recoverLastCancelFromBridge(params.orgAuthCode, params.amount);
      if (recCancel) {
        return {
          success: true,
          cancel_auth_code: String(recCancel.auth_no || recCancel.auth_code || recCancel.AUTH_NO || params.orgAuthCode),
          canceled_at: String(recCancel.auth_date || recCancel.AUTH_DATE || formatKstIsoTimestamp()),
          canceled_amount: params.amount,
          raw_response: recCancel,
        };
      }
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: formatKstIsoTimestamp(),
        error_code: 'E_TIMEOUT',
        error_message: err instanceof Error ? err.message : '단말기 취소 통신 오류',
      };
    }
  }

  public async requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    onStateChange?.('WAITING_CARD');
    try {
      const payload = {
        cmd: 'CASH_APPROVE',
        tran_type: params.receiptType === 'PERSONAL' ? 'D3' : params.receiptType === 'BUSINESS' ? 'D4' : 'D3',
        amount: params.amount,
        vat: params.vatAmount ?? Math.round(params.amount / 11),
        identity_no: params.identityNo,
        terminal_id: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout((params.timeoutSeconds || 30) * 1000)]) : signal,
      });

      if (!res.ok) {
        throw new Error(`KCP VCAT 현금영수증 응답 오류 (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.res_cd === '0000' || data.response_code === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.auth_no || data.auth_code,
          approved_at: data.auth_date || formatKstIsoTimestamp(),
          receipt_type: params.receiptType,
          identity_no_masked: data.identity_no_masked || '010-****-****',
          amount: params.amount,
          terminal_id: data.terminal_id || this.config.terminalId,
          van_tr_no: data.van_tr_no,
          raw_response: data,
        };
      }
      onStateChange?.('REJECTED');
      return {
        success: false,
        auth_code: '',
        approved_at: formatKstIsoTimestamp(),
        receipt_type: params.receiptType,
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: data.res_msg || '현금영수증 발행 실패',
        raw_response: data,
      };
    } catch (err: unknown) {
      if (signal.aborted) {
        onStateChange?.('CANCELLED');
      } else {
        onStateChange?.('ERROR');
      }
      return {
        success: false,
        auth_code: '',
        approved_at: formatKstIsoTimestamp(),
        receipt_type: params.receiptType,
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_code: signal.aborted ? 'E_USER_CANCEL' : 'E_TIMEOUT',
        error_message: signal.aborted ? '현금영수증 발행이 취소되었습니다.' : (err instanceof Error ? err.message : '단말기 통신 오류'),
      };
    }
  }

  public async cancelCashReceipt(
    params: CashReceiptCancelParams
  ): Promise<CashReceiptResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    try {
      const payload = {
        cmd: 'CASH_CANCEL',
        tran_type: 'D5',
        amount: params.amount,
        org_auth_no: params.orgAuthCode,
        org_auth_date: params.orgApprovedDate,
        terminal_id: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : signal,
      });

      if (!res.ok) {
        throw new Error(`KCP VCAT 현금영수증 취소 응답 오류 (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.res_cd === '0000' || data.response_code === '0000') {
        return {
          success: true,
          auth_code: data.auth_no || data.auth_code,
          approved_at: data.auth_date || formatKstIsoTimestamp(),
          receipt_type: 'PERSONAL',
          identity_no_masked: '010-****-****',
          amount: params.amount,
          terminal_id: data.terminal_id || this.config.terminalId,
          raw_response: data,
        };
      }
      return {
        success: false,
        auth_code: '',
        approved_at: formatKstIsoTimestamp(),
        receipt_type: 'PERSONAL',
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: data.res_msg || '현금영수증 취소 실패',
        raw_response: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        auth_code: '',
        approved_at: formatKstIsoTimestamp(),
        receipt_type: 'PERSONAL',
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_code: signal.aborted ? 'E_USER_CANCEL' : 'E_TIMEOUT',
        error_message: signal.aborted ? '현금영수증 취소가 중단되었습니다.' : (err instanceof Error ? err.message : '단말기 통신 오류'),
      };
    }
  }
}
