/**
 * [키오스크 SMARTRO 단말기 어댑터]
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

export class SmartroVanAdapter extends BaseVanAdapter {
  public readonly provider = 'SMARTRO' as const;

  public async checkTerminalHealth(): Promise<TerminalHealthResult> {
    try {
      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8089}/smartro/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return {
          isOnline: true,
          message: 'SMARTRO 단말기 데몬 연결 정상',
          provider: this.provider,
          statusCode: res.status,
        };
      }
      return {
        isOnline: false,
        message: `SMARTRO 단말기 응답 없음 (HTTP ${res.status})`,
        provider: this.provider,
        statusCode: res.status,
      };
    } catch {
      return {
        isOnline: false,
        message: 'SMARTRO 단말기 데몬 프로그램이 실행되지 않았습니다.',
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
        service: 'CREDIT_APPROVAL',
        total_amount: params.amount,
        tax: vat,
        installment: String(params.installmentMonths || 0).padStart(2, '0'),
        cat_id: this.config.terminalId,
        order_id: params.orderId || `ORD-${Date.now()}`,
      };

      onStateChange?.('REQUESTING');

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8089}/smartro/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout((params.timeoutSeconds || 30) * 1000)]) : signal,
      });

      if (!res.ok) {
        onStateChange?.('ERROR');
        return this.createErrorResult('E_NETWORK_ERROR', `SMARTRO 응답 오류 (HTTP ${res.status})`, params.amount);
      }

      const data = await res.json();

      if (data.reply_code === '0000' || data.res_cd === '0000' || data.response_code === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.auth_no || data.approval_no || data.auth_code,
          approved_at: data.auth_date || data.trans_date || new Date().toISOString(),
          card_no_masked: data.card_no || '****-****-****-****',
          issuer_code: data.issuer_code || data.card_code,
          issuer_name: data.issuer_name || data.card_name || '신용카드',
          acquirer_code: data.acquirer_code || data.purchase_code,
          acquirer_name: data.acquirer_name || data.purchase_name || '신용카드',
          terminal_id: data.cat_id || this.config.terminalId,
          merchant_no: data.merchant_no,
          amount: params.amount,
          installment_months: params.installmentMonths || 0,
          van_tr_no: data.trade_no || data.van_tr_no,
          raw_response: data,
        };
      } else {
        onStateChange?.('REJECTED');
        return this.createErrorResult(
          'E_UNKNOWN',
          data.reply_msg || data.error_message || 'SMARTRO 결제가 거절되었습니다.',
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
        err instanceof Error ? err.message : 'SMARTRO 단말기 통신 오류',
        params.amount
      );
    }
  }

  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    try {
      const payload = {
        service: 'CREDIT_CANCEL',
        total_amount: params.amount,
        org_auth_no: params.orgAuthCode,
        org_auth_date: params.orgApprovedDate,
        cat_id: params.terminalId || this.config.terminalId,
        cancel_reason: params.reason || '고객 요청 취소',
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8089}/smartro/request`, {
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
          error_message: `SMARTRO 취소 응답 오류 (HTTP ${res.status})`,
        };
      }

      const data = await res.json();
      if (data.reply_code === '0000' || data.res_cd === '0000') {
        return {
          success: true,
          cancel_auth_code: data.auth_no || data.approval_no,
          canceled_at: data.auth_date || new Date().toISOString(),
          canceled_amount: params.amount,
          raw_response: data,
        };
      }
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_UNKNOWN',
        error_message: data.reply_msg || 'SMARTRO 취소 실패',
        raw_response: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_TIMEOUT',
        error_message: err instanceof Error ? err.message : 'SMARTRO 단말기 통신 오류',
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
        service: 'CASH_APPROVAL',
        receipt_type: params.receiptType,
        total_amount: params.amount,
        identity_no: params.identityNo,
        cat_id: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8089}/smartro/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((params.timeoutSeconds || 30) * 1000),
      });

      const data = await res.json();
      if (data.reply_code === '0000' || data.res_cd === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.auth_no || data.approval_no,
          approved_at: data.auth_date || new Date().toISOString(),
          receipt_type: params.receiptType,
          identity_no_masked: data.identity_no_masked || '010-****-****',
          amount: params.amount,
          terminal_id: data.cat_id || this.config.terminalId,
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
        error_message: data.reply_msg || 'SMARTRO 현금영수증 발행 실패',
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
        error_message: err instanceof Error ? err.message : 'SMARTRO 단말기 통신 오류',
      };
    }
  }

  public async cancelCashReceipt(
    params: CashReceiptCancelParams
  ): Promise<CashReceiptResult> {
    try {
      const payload = {
        service: 'CASH_CANCEL',
        total_amount: params.amount,
        org_auth_no: params.orgAuthCode,
        org_auth_date: params.orgApprovedDate,
        cat_id: params.terminalId || this.config.terminalId,
      };

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort || 8089}/smartro/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();
      if (data.reply_code === '0000' || data.res_cd === '0000') {
        return {
          success: true,
          auth_code: data.auth_no || data.approval_no,
          approved_at: data.auth_date || new Date().toISOString(),
          receipt_type: 'PERSONAL',
          identity_no_masked: '010-****-****',
          amount: params.amount,
          terminal_id: data.cat_id || this.config.terminalId,
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
        error_message: data.reply_msg || 'SMARTRO 현금영수증 취소 실패',
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
        error_message: err instanceof Error ? err.message : 'SMARTRO 단말기 통신 오류',
      };
    }
  }
}
