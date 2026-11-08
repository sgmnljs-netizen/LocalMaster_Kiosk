/**
 * [무인 키오스크 다중 VAN 단말기 통신 클라이언트 (Facade)]
 * - Strategy / Adapter Pattern 적용: VanAdapterFactory를 통해 실제 Provider 어댑터로 위임
 */

import type {
  CardPaymentRequestParams,
  CardApprovalResult,
  CardCancelRequestParams,
  CardCancelResult,
  CashReceiptRequestParams,
  CashReceiptCancelParams,
  CashReceiptResult,
  TerminalHealthResult,
  VanConfig,
  VanPaymentState,
  IVanTerminalAdapter,
} from './van_types';
import { normalizeVanProvider } from './van_types';
import { VanAdapterFactory } from './adapters/VanAdapterFactory';
import { DEFAULT_VAN_CONFIG } from './adapters/BaseVanAdapter';
import { getKioskSettings } from '../../stores/kioskSettings';

export function sanitizeVcatPort(rawPort?: string | number | null, fallbackPort: number = DEFAULT_VAN_CONFIG.vcatPort): number {
  const parsed = typeof rawPort === 'number' ? rawPort : parseInt(String(rawPort ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) {
    return Math.floor(parsed);
  }
  return fallbackPort;
}

export class KioskVanClient implements IVanTerminalAdapter {
  private currentConfig: VanConfig;

  constructor(customConfig?: Partial<VanConfig>) {
    const settings = getKioskSettings();
    const mergedPort = customConfig?.vcatPort !== undefined
      ? sanitizeVcatPort(customConfig.vcatPort, DEFAULT_VAN_CONFIG.vcatPort)
      : sanitizeVcatPort(settings.vcatPort, DEFAULT_VAN_CONFIG.vcatPort);
    this.currentConfig = {
      ...DEFAULT_VAN_CONFIG,
      provider: normalizeVanProvider(settings.providerType),
      terminalId: settings.terminalId || DEFAULT_VAN_CONFIG.terminalId,
      ...customConfig,
      vcatPort: mergedPort,
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('kiosk-settings-changed', () => {
        const updated = getKioskSettings();
        this.setConfig({
          provider: normalizeVanProvider(updated.providerType),
          vcatPort: sanitizeVcatPort(updated.vcatPort, DEFAULT_VAN_CONFIG.vcatPort),
          terminalId: updated.terminalId || DEFAULT_VAN_CONFIG.terminalId,
        });
      });
    }
  }

  private get currentAdapter(): IVanTerminalAdapter {
    return VanAdapterFactory.getAdapter(this.currentConfig);
  }

  public get provider() {
    return this.currentConfig.provider;
  }

  public setConfig(newConfig: Partial<VanConfig>): void {
    const nextProvider = newConfig.provider !== undefined
      ? normalizeVanProvider(newConfig.provider)
      : this.currentConfig.provider;
    const nextPort = newConfig.vcatPort !== undefined
      ? sanitizeVcatPort(newConfig.vcatPort, this.currentConfig.vcatPort)
      : this.currentConfig.vcatPort;
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      provider: nextProvider,
      vcatPort: nextPort,
    };
    this.currentAdapter.setConfig(this.currentConfig);
  }

  public getConfig(): VanConfig {
    return { ...this.currentConfig };
  }

  public cancelCurrentRequest(): void {
    this.currentAdapter.cancelCurrentRequest();
  }

  public async requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult> {
    return this.currentAdapter.requestCardPayment(params, onStateChange);
  }

  public async cancelCardPayment(
    params: CardCancelRequestParams
  ): Promise<CardCancelResult> {
    return this.currentAdapter.cancelCardPayment(params);
  }

  public async requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    return this.currentAdapter.requestCashReceipt(params, onStateChange);
  }

  public async issueCashReceiptAuto(
    amount: number,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult> {
    return this.currentAdapter.issueCashReceiptAuto(amount, onStateChange);
  }

  public async cancelCashReceipt(params: CashReceiptCancelParams): Promise<CashReceiptResult> {
    return this.currentAdapter.cancelCashReceipt(params);
  }

  public async checkHealth(): Promise<boolean> {
    return this.currentAdapter.checkHealth();
  }

  public async checkTerminalHealth(): Promise<TerminalHealthResult> {
    return this.currentAdapter.checkTerminalHealth();
  }
}

export const kioskVanClient = new KioskVanClient();
export { VanAdapterFactory };
