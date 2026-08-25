/**
 * [키오스크 NICE 단말기 어댑터]
 */

import { BaseVanAdapter } from './BaseVanAdapter';
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

export class NiceVanAdapter extends BaseVanAdapter {
  public readonly provider = 'NICE' as const;

  public async checkTerminalHealth(): Promise<TerminalHealthResult> {
    try {
      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8088}/nice/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return {
          isOnline: true,
          message: 'NICE 단말기 데몬 연결 정상',
          provider: this.provider,
          statusCode: res.status,
        };
      }
      return {
        isOnline: false,
        message: `NICE 단말기 응답 없음 (HTTP ${res.status})`,
        provider: this.provider,
        statusCode: res.status,
      };
    } catch {
      return {
        isOnline: false,
        message: 'NICE 단말기 데몬 프로그램이 실행되지 않았습니다.',
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

    onStateChange?.('READY');

    try {
      onStateChange?.('WAITING_CARD');

      const vat = params.vatAmount ?? Math.round(params.amount / 11);
      const payload = {
        TRAN_TYPE: 'CREDIT_APPROVE',
        TOTAL_AMOUNT: params.amount,
        TAX_AMOUNT: vat,
        INSTALLMENT: params.installmentMonths || 0,
        TERMINAL_ID: this.config.terminalId,
        ORDER_NO: params.orderId || `ORD-${Date.now()}`,
      };

      onStateChange?.('REQUESTING');

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8088}/nice/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout((params.timeoutSeconds || 30) * 1000)]) : signal,
      });

      if (!res.ok) {
        onStateChange?.('ERROR');
        return this.createErrorResult('E_NETWORK_ERROR', `NICE 응답 오류 (HTTP ${res.status})`, params.amount);
      }

      const data = await res.json();

      if (data.RESPONSE_CODE === '0000' || data.res_cd === '0000' || data.response_code === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.AUTH_NO || data.auth_no || data.auth_code,
          approved_at: data.AUTH_DATE || data.auth_date || new Date().toISOString(),
          card_no_masked: data.CARD_NO || data.card_no || '****-****-****-****',
          issuer_code: data.ISSUER_CD || data.issuer_cd,
          issuer_name: data.ISSUER_NM || data.issuer_nm || '신용카드',
          acquirer_code: data.ACQUIRER_CD || data.acquirer_cd,
          acquirer_name: data.ACQUIRER_NM || data.acquirer_nm || '신용카드',
          terminal_id: data.TERMINAL_ID || this.config.terminalId,
          merchant_no: data.MERCHANT_NO || data.merchant_no,
          amount: params.amount,
          installment_months: params.installmentMonths || 0,
          van_tr_no: data.TR_NO || data.van_tr_no,
          raw_response: data,
        };
      } else {
        onStateChange?.('REJECTED');
        return this.createErrorResult(
          'E_UNKNOWN',
          data.RES_MSG || data.res_msg || 'NICE 결제가 거절되었습니다.',
          params.amount,
          data
        );
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        onStateChange?.('CANCELLED');
        return this.createErrorResult('E_USER_CANCEL', '결제가 취소되었습니다.', params.amount);
      }
      onStateChange?.('ERROR');
      return this.createErrorResult(
        'E_TIMEOUT',
        err instanceof Error ? err.message : 'NICE 단말기 통신 오류',
        params.amount
      );
    }
  }

  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    try {
      const payload = {
        TRAN_TYPE: 'CREDIT_CANCEL',
        TOTAL_AMOUNT: params.amount,
        ORG_AUTH_NO: params.orgAuthCode,
        ORG_AUTH_DATE: params.orgApprovedDate,
        TERMINAL_ID: params.terminalId || this.config.terminalId,
        REASON: params.reason || '고객 요청 취소',
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8088}/nice/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return {
          success: false,
          canceled_amount: 0,
          canceled_at: new Date().toISOString(),
          error_code: 'E_NETWORK_ERROR',
          error_message: `NICE 취소 응답 오류 (HTTP ${res.status})`,
        };
      }

      const data = await res.json();
      if (data.RESPONSE_CODE === '0000' || data.res_cd === '0000') {
        return {
          success: true,
          cancel_auth_code: data.AUTH_NO || data.auth_no,
          canceled_at: data.AUTH_DATE || new Date().toISOString(),
          canceled_amount: params.amount,
          raw_response: data,
        };
      }
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_UNKNOWN',
        error_message: data.RES_MSG || data.res_msg || 'NICE 취소 실패',
        raw_response: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_TIMEOUT',
        error_message: err instanceof Error ? err.message : 'NICE 단말기 통신 오류',
      };
    }
  }

  public async requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    onStateChange?.('WAITING_CARD');
    try {
      const payload = {
        TRAN_TYPE: 'CASH_APPROVE',
        RECEIPT_TYPE: params.receiptType,
        TOTAL_AMOUNT: params.amount,
        IDENTITY_NO: params.identityNo,
        TERMINAL_ID: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8088}/nice/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((params.timeoutSeconds || 30) * 1000),
      });

      const data = await res.json();
      if (data.RESPONSE_CODE === '0000' || data.res_cd === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.AUTH_NO || data.auth_no,
          approved_at: data.AUTH_DATE || new Date().toISOString(),
          receipt_type: params.receiptType,
          identity_no_masked: data.IDENTITY_NO_MASKED || '010-****-****',
          amount: params.amount,
          terminal_id: data.TERMINAL_ID || this.config.terminalId,
          raw_response: data,
        };
      }
      onStateChange?.('REJECTED');
      return {
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        receipt_type: params.receiptType,
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: data.RES_MSG || 'NICE 현금영수증 발행 실패',
      };
    } catch (err: unknown) {
      onStateChange?.('ERROR');
      return {
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        receipt_type: params.receiptType,
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: err instanceof Error ? err.message : 'NICE 단말기 통신 오류',
      };
    }
  }

  public async cancelCashReceipt(
    params: CashReceiptCancelParams
  ): Promise<CashReceiptResult> {
    try {
      const payload = {
        TRAN_TYPE: 'CASH_CANCEL',
        TOTAL_AMOUNT: params.amount,
        ORG_AUTH_NO: params.orgAuthCode,
        ORG_AUTH_DATE: params.orgApprovedDate,
        TERMINAL_ID: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8088}/nice/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();
      if (data.RESPONSE_CODE === '0000' || data.res_cd === '0000') {
        return {
          success: true,
          auth_code: data.AUTH_NO || data.auth_no,
          approved_at: data.AUTH_DATE || new Date().toISOString(),
          receipt_type: 'PERSONAL',
          identity_no_masked: '010-****-****',
          amount: params.amount,
          terminal_id: data.TERMINAL_ID || this.config.terminalId,
          raw_response: data,
        };
      }
      return {
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        receipt_type: 'PERSONAL',
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: data.RES_MSG || 'NICE 현금영수증 취소 실패',
      };
    } catch (err: unknown) {
      return {
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        receipt_type: 'PERSONAL',
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_message: err instanceof Error ? err.message : 'NICE 단말기 통신 오류',
      };
    }
  }
}
