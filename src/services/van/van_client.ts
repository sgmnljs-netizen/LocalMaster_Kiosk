/**
 * [무인 키오스크 NHN KCP / KOCES / NICE VAN (VCAT) 통신 클라이언트]
 * - Mac 개발 환경: 가상 단말기 시뮬레이터(Mock) 자동 구동
 * - Windows 배포 환경: VCAT 로컬 에이전트 데몬(http://127.0.0.1:9099) HTTP/JSON 통신
 */

import type {
  CardPaymentRequestParams,
  CardApprovalResult,
  CardCancelRequestParams,
  CardCancelResult,
  VanConfig,
  VanPaymentState,
  VanErrorCode,
} from './van_types';
import { getKioskSettings } from '../../stores/kioskSettings';

const initialSettings = getKioskSettings();

const DEFAULT_CONFIG: VanConfig = {
  vcatHost: 'http://127.0.0.1',
  vcatPort: parseInt(initialSettings.vcatPort, 10) || 9099,
  terminalId: initialSettings.terminalId || '88010003',
  isMock: typeof window !== 'undefined' && (!window.navigator.userAgent.includes('Windows') || localStorage.getItem('VAN_MOCK') !== 'false'),
  timeoutSeconds: 30,
};

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

export class KioskVanClient {
  private config: VanConfig;
  private abortController: AbortController | null = null;

  constructor(customConfig?: Partial<VanConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };
  }

  public setConfig(newConfig: Partial<VanConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): VanConfig {
    return { ...this.config };
  }

  public cancelCurrentRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * [신용카드 결제 승인 요청]
   */
  public async requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    if (this.config.isMock) {
      return this.executeMockPayment(params, signal, onStateChange);
    } else {
      return this.executeRealVcatPayment(params, signal, onStateChange);
    }
  }

  /**
   * [신용카드 결제 취소 요청]
   */
  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    if (this.config.isMock) {
      return this.executeMockCancel(params);
    } else {
      return this.executeRealVcatCancel(params);
    }
  }

  /**
   * [단말기 연결 상태 체크]
   */
  public async checkTerminalHealth(): Promise<{ isOnline: boolean; message: string }> {
    if (this.config.isMock) {
      return { isOnline: true, message: 'Mac 가상 단말기(Mock) 연결 정상' };
    }
    try {
      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return { isOnline: res.ok, message: res.ok ? 'VCAT 단말기 온라인' : '단말기 응답 이상' };
    } catch {
      return { isOnline: false, message: 'VCAT 데몬 미연결 (프로그램 실행 상태 확인 필요)' };
    }
  }

  // ==========================================
  // 🖥️ [Mac 가상 단말기 Mock 시뮬레이터 로직]
  // ==========================================
  private async executeMockPayment(
    params: CardPaymentRequestParams,
    signal: AbortSignal,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    onStateChange?.('READY');
    await this.delay(200);

    if (signal.aborted) {
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    if (params.amount === 77777) {
      onStateChange?.('ERROR');
      return this.createErrorResult(
        'E_DEVICE_NOT_FOUND',
        '카드 단말기에 연결할 수 없습니다. 단말기 전원 및 케이블을 확인해 주세요.',
        params.amount
      );
    }

    onStateChange?.('WAITING_CARD');
    await this.delay(600);

    if (signal.aborted) {
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    if (params.amount === 88888) {
      onStateChange?.('REQUESTING');
      await this.delay(2500);
      onStateChange?.('TIMEOUT');
      return this.createErrorResult(
        'E_TIMEOUT',
        '단말기 응답 시간이 초과되었습니다. 카드를 다시 삽입해 주세요.',
        params.amount
      );
    }

    if (params.amount === 99999) {
      onStateChange?.('REQUESTING');
      await this.delay(500);
      onStateChange?.('REJECTED');
      return this.createErrorResult(
        'E_INSUFFICIENT_FUNDS',
        '한도초과 또는 잔액이 부족합니다. (카드사 거절코드: 0051)',
        params.amount
      );
    }

    onStateChange?.('REQUESTING');
    await this.delay(500);

    if (signal.aborted) {
      return this.createErrorResult('E_USER_CANCEL', '사용자가 결제를 취소했습니다.', params.amount);
    }

    const issuer = MOCK_ISSUERS[Math.floor(Math.random() * MOCK_ISSUERS.length)];
    const authCode = String(Math.floor(10000000 + Math.random() * 90000000));
    const maskedCard = `9410-****-****-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const approvedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const vanTrNo = `MOCK-KIOSK-${now.getTime()}-${Math.floor(Math.random() * 1000)}`;

    onStateChange?.('APPROVED');

    return {
      success: true,
      auth_code: authCode,
      approved_at: approvedAt,
      card_no_masked: maskedCard,
      issuer_code: issuer.code,
      issuer_name: issuer.name,
      acquirer_code: issuer.code,
      acquirer_name: issuer.name,
      terminal_id: this.config.terminalId,
      merchant_no: 'KCP-M-398210',
      amount: params.amount,
      installment_months: params.installmentMonths || 0,
      van_tr_no: vanTrNo,
      raw_response: {
        mock: true,
        van: 'KIOSK_VAN',
        auth_code: authCode,
        card_no_masked: maskedCard,
        issuer_name: issuer.name,
      },
    };
  }

  private async executeMockCancel(
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
        van: 'KIOSK_VAN',
        type: 'CANCEL',
        org_auth_code: params.orgAuthCode,
        cancel_auth_code: cancelAuthCode,
      },
    };
  }

  // ==========================================
  // 🔌 [Windows 실제 VCAT 데몬 통신 로직]
  // ==========================================
  private async executeRealVcatPayment(
    params: CardPaymentRequestParams,
    signal: AbortSignal,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    onStateChange?.('READY');

    try {
      onStateChange?.('WAITING_CARD');

      const payload = {
        cmd: 'APPROVE',
        tran_type: 'D1',
        amount: params.amount,
        vat: params.vatAmount ?? Math.round(params.amount / 11),
        install_month: String(params.installmentMonths || 0).padStart(2, '0'),
        terminal_id: this.config.terminalId,
        order_no: params.orderId || `ORD-${Date.now()}`,
      };

      onStateChange?.('REQUESTING');

      const res = await fetch(`${this.config.vcatHost}:${this.config.vcatPort}/vcat/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: signal,
      });

      if (!res.ok) {
        onStateChange?.('ERROR');
        return this.createErrorResult('E_NETWORK_ERROR', `VCAT 응답 오류 (HTTP ${res.status})`, params.amount);
      }

      const data = await res.json();

      if (data.res_cd === '0000' || data.response_code === '0000') {
        onStateChange?.('APPROVED');
        return {
          success: true,
          auth_code: data.auth_no || data.auth_code,
          approved_at: data.auth_date || new Date().toISOString(),
          card_no_masked: data.card_no || '****-****-****-****',
          issuer_code: data.issuer_cd,
          issuer_name: data.issuer_nm || '신용카드',
          acquirer_code: data.acquirer_cd,
          acquirer_name: data.acquirer_nm || '신용카드',
          terminal_id: data.terminal_id || this.config.terminalId,
          merchant_no: data.merchant_no,
          amount: params.amount,
          installment_months: params.installmentMonths || 0,
          van_tr_no: data.van_tr_no || data.tr_no,
          raw_response: data,
        };
      } else {
        onStateChange?.('REJECTED');
        return this.createErrorResult(
          'E_UNKNOWN',
          data.res_msg || data.error_message || '결제가 거절되었습니다.',
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
        err instanceof Error ? err.message : '단말기 통신 오류가 발생했습니다.',
        params.amount
      );
    }
  }

  private async executeRealVcatCancel(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    try {
      const payload = {
        cmd: 'CANCEL',
        tran_type: 'D2',
        amount: params.amount,
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
      });

      if (!res.ok) {
        return {
          success: false,
          canceled_amount: 0,
          canceled_at: new Date().toISOString(),
          error_code: 'E_NETWORK_ERROR',
          error_message: `VCAT 취소 응답 오류 (HTTP ${res.status})`,
        };
      }

      const data = await res.json();
      if (data.res_cd === '0000' || data.response_code === '0000') {
        return {
          success: true,
          cancel_auth_code: data.cancel_auth_no || data.auth_no,
          canceled_at: data.cancel_date || new Date().toISOString(),
          canceled_amount: params.amount,
          raw_response: data,
        };
      } else {
        return {
          success: false,
          canceled_amount: 0,
          canceled_at: new Date().toISOString(),
          error_code: 'E_UNKNOWN',
          error_message: data.res_msg || data.error_message || '취소 요청이 거절되었습니다.',
          raw_response: data,
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        canceled_amount: 0,
        canceled_at: new Date().toISOString(),
        error_code: 'E_NETWORK_ERROR',
        error_message: err instanceof Error ? err.message : '단말기 취소 통신 중 오류가 발생했습니다.',
      };
    }
  }

  private createErrorResult(
    errorCode: VanErrorCode,
    errorMessage: string,
    amount: number,
    rawResponse?: Record<string, unknown>
  ): CardApprovalResult {
    return {
      success: false,
      auth_code: '',
      approved_at: new Date().toISOString(),
      card_no_masked: '',
      issuer_name: '',
      acquirer_name: '',
      terminal_id: this.config.terminalId,
      amount,
      installment_months: 0,
      error_code: errorCode,
      error_message: errorMessage,
      raw_response: rawResponse,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const kioskVanClient = new KioskVanClient();
