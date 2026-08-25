/**
 * [키오스크 다중 VAN 어댑터 추상 베이스 클래스]
 */

import type {
  IVanTerminalAdapter,
  VanConfig,
  VanProviderType,
  VanPaymentState,
  VanErrorCode,
  CardPaymentRequestParams,
  CardApprovalResult,
  CardCancelRequestParams,
  CardCancelResult,
  CashReceiptRequestParams,
  CashReceiptCancelParams,
  CashReceiptResult,
  TerminalHealthResult,
} from '../van_types';

export const DEFAULT_VAN_CONFIG: VanConfig = {
  provider: 'KCP',
  vcatHost: 'http://127.0.0.1',
  vcatPort: 9099,
  terminalId: '88010003',
  isMock: typeof window !== 'undefined' && (!window.navigator.userAgent.includes('Windows') || localStorage.getItem('VAN_MOCK') !== 'false'),
  timeoutSeconds: 30,
};

export abstract class BaseVanAdapter implements IVanTerminalAdapter {
  public abstract readonly provider: VanProviderType;
  protected config: VanConfig;
  protected abortController: AbortController | null = null;

  constructor(customConfig?: Partial<VanConfig>) {
    this.config = { ...DEFAULT_VAN_CONFIG, ...customConfig };
  }

  public setConfig(newConfig: Partial<VanConfig>): void {
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

  public async checkHealth(): Promise<boolean> {
    const res = await this.checkTerminalHealth();
    return res.isOnline;
  }

  public abstract checkTerminalHealth(): Promise<TerminalHealthResult>;

  public abstract requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult>;

  public abstract cancelCardPayment(params: CardCancelRequestParams): Promise<CardCancelResult>;

  public abstract requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult>;

  public async issueCashReceiptAuto(
    amount: number,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    return this.requestCashReceipt(
      {
        amount,
        receiptType: 'PERSONAL',
        identityNo: '0100001234',
        timeoutSeconds: 15,
      },
      onStateChange
    );
  }

  public abstract cancelCashReceipt(params: CashReceiptCancelParams): Promise<CashReceiptResult>;

  protected createErrorResult(
    code: VanErrorCode,
    message: string,
    amount: number,
    raw?: Record<string, unknown>
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
      error_code: code,
      error_message: message,
      raw_response: raw,
    };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
