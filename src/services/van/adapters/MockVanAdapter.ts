/**
 * [키오스크 가상 단말기 시뮬레이터 (MockVanAdapter)]
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

const MOCK_ISSUERS = [
  { code: '01', name: '비씨카드' },
  { code: '02', name: 'KB국민카드' },
  { code: '04', name: '삼성카드' },
  { code: '06', name: '신한카드' },
  { code: '07', name: '현대카드' },
  { code: '08', name: '롯데카드' },
  { code: '11', name: '하나카드' },
  { code: '12', name: 'NH농협카드' },
];

export class MockVanAdapter extends BaseVanAdapter {
  public readonly provider = 'MOCK' as const;

  public async checkTerminalHealth(): Promise<TerminalHealthResult> {
    return {
      isOnline: true,
      message: '키오스크 가상 단말기(Mock) 연결 정상',
      provider: this.provider,
      statusCode: 200,
    };
  }

  public async requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    onStateChange?.('READY');
    await this.delay(300);
    if (signal.aborted) {
      onStateChange?.('CANCELLED');
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    onStateChange?.('WAITING_CARD');
    await this.delay(800);
    if (signal.aborted) {
      onStateChange?.('CANCELLED');
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    // 🧪 특수 테스트 금액 핸들링
    if (params.amount === 77777) {
      onStateChange?.('ERROR');
      return this.createErrorResult('E_DEVICE_NOT_FOUND', '카드 단말기에 연결할 수 없습니다. 단말기 전원 및 케이블을 확인해 주세요.', params.amount);
    }
    if (params.amount === 88888) {
      await this.delay(1000);
      onStateChange?.('TIMEOUT');
      return this.createErrorResult('E_TIMEOUT', '단말기 응답 시간이 초과되었습니다. 카드를 다시 삽입해 주세요.', params.amount);
    }
    if (params.amount === 99999) {
      onStateChange?.('REJECTED');
      return this.createErrorResult('E_INSUFFICIENT_FUNDS', '한도초과 또는 잔액이 부족합니다. (카드사 거절코드: 0051)', params.amount);
    }

    onStateChange?.('REQUESTING');
    await this.delay(600);
    if (signal.aborted) {
      onStateChange?.('CANCELLED');
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    const issuer = MOCK_ISSUERS[Math.floor(Math.random() * MOCK_ISSUERS.length)];
    const authCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    const maskedCard = `9410-****-****-${Math.floor(1000 + Math.random() * 9000)}`;

    onStateChange?.('APPROVED');

    return {
      success: true,
      auth_code: authCode,
      approved_at: new Date().toISOString(),
      card_no_masked: maskedCard,
      issuer_code: issuer.code,
      issuer_name: issuer.name,
      acquirer_code: issuer.code,
      acquirer_name: issuer.name,
      terminal_id: this.config.terminalId,
      merchant_no: 'M99999999',
      amount: params.amount,
      installment_months: params.installmentMonths || 0,
      van_tr_no: `MOCK_TR_${Date.now()}`,
      raw_response: {
        mock: true,
        van: 'MOCK',
        auth_code: authCode,
        card_no_masked: maskedCard,
        issuer_name: issuer.name,
      },
    };
  }

  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    await this.delay(500);

    if (!params.orgAuthCode || params.orgAuthCode.trim() === '') {
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_INVALID_AUTH_NO',
        error_message: '원거래 승인번호가 유효하지 않습니다.',
      };
    }

    const cancelAuthCode = `C${params.orgAuthCode.slice(-7)}`;
    return {
      success: true,
      cancel_auth_code: cancelAuthCode,
      canceled_at: new Date().toISOString(),
      canceled_amount: params.amount,
      raw_response: {
        mock: true,
        van: 'MOCK',
        type: 'CANCEL',
        org_auth_code: params.orgAuthCode,
        cancel_auth_code: cancelAuthCode,
      },
    };
  }

  public async requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    onStateChange?.('WAITING_CARD');
    await this.delay(800);
    if (signal.aborted) {
      return {
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        receipt_type: params.receiptType,
        identity_no_masked: '',
        amount: params.amount,
        terminal_id: this.config.terminalId,
        error_code: 'E_USER_CANCEL',
        error_message: '사용자 취소',
      };
    }

    onStateChange?.('REQUESTING');
    await this.delay(500);
    const authCode = Math.floor(100000000 + Math.random() * 900000000).toString();
    const rawId = params.identityNo ? params.identityNo.replace(/[^0-9]/g, '') : '';
    const idMasked = rawId === '0100001234'
      ? '010-000-1234'
      : rawId.length >= 10
      ? rawId.replace(/(\d{3})\d{4}(\d{4})/, '$1-****-$2')
      : '010-****-5678';

    onStateChange?.('APPROVED');
    return {
      success: true,
      auth_code: authCode,
      approved_at: new Date().toISOString(),
      receipt_type: params.receiptType,
      identity_no_masked: idMasked,
      amount: params.amount,
      terminal_id: this.config.terminalId,
      van_tr_no: `CASH_TR_${Date.now()}`,
      raw_response: { mock: true, van: 'MOCK', auth_code: authCode },
    };
  }

  public async cancelCashReceipt(
    params: CashReceiptCancelParams
  ): Promise<CashReceiptResult> {
    await this.delay(500);
    return {
      success: true,
      auth_code: `CC${params.orgAuthCode.slice(-7)}`,
      approved_at: new Date().toISOString(),
      receipt_type: 'PERSONAL',
      identity_no_masked: '010-****-****',
      amount: params.amount,
      terminal_id: params.terminalId || this.config.terminalId,
      raw_response: { mock: true, type: 'CASH_CANCEL', org_auth_code: params.orgAuthCode },
    };
  }
}
