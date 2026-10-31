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

import { TimeMaster } from '../../../utils/timeMaster';

export const KIOSK_VAN_APPROVAL_TIMEOUT_SEC = 60;
export const KIOSK_VAN_CANCEL_TIMEOUT_MS = 50000;
export const KIOSK_VAN_RECOVERY_TIMEOUT_MS = 2500;

export const isKioskDemoRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const search = window.location?.search || '';
  const pathname = window.location?.pathname || '';
  const hostname = window.location?.hostname || '';
  return (
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    search.includes('demo=true') ||
    search.includes('demo=1') ||
    pathname.includes('/demo/') ||
    hostname.endsWith('segnet.co.kr') ||
    hostname.endsWith('golfos.co.kr')
  );
};

const KST_UTC_OFFSET_MS = 9 * 3600 * 1000;

export const formatKstIsoTimestamp = (d: Date = TimeMaster.getSyncedDate()): string => {
  const kst = new Date(d.getTime() + KST_UTC_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
};

/**
 * [SSOT] 원거래 승인일시(ISO 8601 UTC/KST, 12자리 YYMMDDHHmmss, 8자리 YYYYMMDD 등)를
 * KST 기준 8자리 `YYYYMMDD` 문자열로 안전하게 정규화합니다.
 */
export const extractKstYyyyMmDd = (approvedAt?: string | null): string => {
  const syncedKst = new Date(TimeMaster.getSyncedNowMs() + KST_UTC_OFFSET_MS);
  const fallbackYmd = `${syncedKst.getUTCFullYear()}${String(syncedKst.getUTCMonth() + 1).padStart(2, '0')}${String(syncedKst.getUTCDate()).padStart(2, '0')}`;
  if (!approvedAt) return fallbackYmd;
  const raw = String(approvedAt).trim();
  if (!raw) return fallbackYmd;

  // 1. 타임존 포함 ISO 8601 (예: 2026-10-30T15:30:00.000Z -> KST 20261031)
  if (raw.includes('T') && (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw))) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const kst = new Date(parsed.getTime() + KST_UTC_OFFSET_MS);
      return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
    }
  }

  // 2. 타임존 미포함 YYYY-MM-DD / YYYY.MM.DD 로컬 문자열
  const localMatch = raw.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (localMatch) {
    return `${localMatch[1]}${localMatch[2]}${localMatch[3]}`;
  }

  // 3. 숫자형 VCAT 응답 (14자리 YYYYMMDDHHmmss, 8자리 YYYYMMDD, 12자리 YYMMDDHHmmss, 6자리 YYMMDD)
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8 && (digits.startsWith('19') || digits.startsWith('20'))) {
    return digits.slice(0, 8);
  }
  if (digits.length >= 6) {
    return `20${digits.slice(0, 6)}`;
  }

  return fallbackYmd;
};

export const getIsMockVan = (forceProdCheck?: boolean): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage ? window.localStorage.getItem('VAN_MOCK') : null;
  if (stored !== null) return stored === 'true';
  if (import.meta.env.VITE_VAN_MOCK === 'true') return true;
  const isProd = forceProdCheck ?? Boolean(import.meta.env.PROD);
  if (isProd && !isKioskDemoRuntime()) {
    return false;
  }
  const isRealWindows =
    window.navigator.userAgent.includes('Windows') &&
    Boolean(window.navigator.platform && window.navigator.platform.startsWith('Win')) &&
    !window.navigator.webdriver;
  return !isRealWindows;
};

export const DEFAULT_VAN_CONFIG: VanConfig = {
  provider: 'KCP',
  vcatHost: 'http://127.0.0.1',
  vcatPort: 9099,
  terminalId: '88010003',
  isMock: getIsMockVan(),
  timeoutSeconds: KIOSK_VAN_APPROVAL_TIMEOUT_SEC,
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
      approved_at: formatKstIsoTimestamp(),
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
