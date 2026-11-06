/**
 * 🛡️ [5-Layer Payment Resilience Engine]
 * 키오스크 실물 카드 결제 전후의 인터넷 순단, 응답 지연(Timeout), 서버 일시 장애에 대응하는
 * 1) Pre-Flight 생존 검증
 * 2) 지수 백오프(Exponential Backoff) 자동 재시도 엔진 (4xx 비즈니스 거절은 즉시 통과)
 * 3) 로컬 WAL(Write-Ahead Log) Outbox 영구 스풀 큐 및 백그라운드 Auto-Flush
 * 모듈입니다.
 */

export interface PaymentRetryStatus {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  label: string;
  reason?: string;
}

export type PaymentOutboxKind = 'WAL_IN_FLIGHT' | 'PENDING_DLQ';

export interface PaymentOutboxEntry {
  id: string;
  kind: PaymentOutboxKind;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  storeCd: string;
  terminalId: string;
  authCode: string;
  vanTrNo?: string;
  amount: number;
  purpose?: string;
  endpoint?: string;
  payload: Record<string, unknown>;
}

export const PAYMENT_RESILIENCE_CONFIG = {
  /** 프로덕션 재시도 대기 시간 (1.5s -> 3.0s -> 5.0s) */
  PROD_RETRY_DELAYS_MS: [1500, 3000, 5000] as const,
  /** 프로덕션 DLQ 비상 보고 재시도 대기 시간 (최대 2회) */
  PROD_DLQ_RETRY_DELAYS_MS: [1500, 3000] as const,
  /** Vitest 단위 테스트 환경 재시도 대기 시간 (테스트 속도 보장) */
  TEST_RETRY_DELAYS_MS: [15, 30, 50] as const,
  /** Vitest 단위 테스트 환경 DLQ 재시도 대기 시간 (최대 2회) */
  TEST_DLQ_RETRY_DELAYS_MS: [15, 30] as const,
  /** 단일 결제/배정 확정 HTTP 요청 타임아웃 (10초 — 미들웨어 제어 대기 포함) */
  FETCH_TIMEOUT_MS: 10000,
  /** 결제 시작 전 Pre-Flight 서버 생존 확인 타임아웃 (2초) */
  PREFLIGHT_TIMEOUT_MS: 2000,
  /** 비정상 종료/정전 판정 기준 시간 (60초 경과한 미확정 WAL은 DLQ 자동 승격) */
  STALE_WAL_MS: 60_000,
  /** 로컬 스토리지 Outbox 키 */
  OUTBOX_STORAGE_KEY: 'LM_PAYMENT_OUTBOX',
  /** Outbox 최대 보존 건수 */
  MAX_OUTBOX_ITEMS: 100,
} as const;

type RetryStatusListener = (status: PaymentRetryStatus) => void;
const retryListeners = new Set<RetryStatusListener>();

let currentRetryStatus: PaymentRetryStatus = {
  active: false,
  attempt: 0,
  maxAttempts: PAYMENT_RESILIENCE_CONFIG.PROD_RETRY_DELAYS_MS.length,
  label: '',
};

interface GlobalProcessEnv {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

function isTestEnv(): boolean {
  try {
    const procEnv = (globalThis as unknown as GlobalProcessEnv).process?.env;
    if (procEnv && (procEnv.VITEST || procEnv.NODE_ENV === 'test')) {
      return true;
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function getRetryDelaysMs(): readonly number[] {
  return isTestEnv()
    ? PAYMENT_RESILIENCE_CONFIG.TEST_RETRY_DELAYS_MS
    : PAYMENT_RESILIENCE_CONFIG.PROD_RETRY_DELAYS_MS;
}

export function getDlqRetryDelaysMs(): readonly number[] {
  return isTestEnv()
    ? PAYMENT_RESILIENCE_CONFIG.TEST_DLQ_RETRY_DELAYS_MS
    : PAYMENT_RESILIENCE_CONFIG.PROD_DLQ_RETRY_DELAYS_MS;
}

export function subscribePaymentRetryStatus(listener: RetryStatusListener): () => void {
  retryListeners.add(listener);
  listener(currentRetryStatus);
  return () => {
    retryListeners.delete(listener);
  };
}

export function notifyPaymentRetryStatus(next: PaymentRetryStatus): void {
  currentRetryStatus = next;
  for (const listener of retryListeners) {
    try {
      listener(currentRetryStatus);
    } catch {
      // ignore listener errors
    }
  }
}

export function clearPaymentRetryStatus(): void {
  if (!currentRetryStatus.active && currentRetryStatus.attempt === 0) return;
  notifyPaymentRetryStatus({
    active: false,
    attempt: 0,
    maxAttempts: getRetryDelaysMs().length,
    label: '',
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP 상태 코드가 네트워크/서버 일시 장애로서 재시도 대상인지 판별합니다.
 * - 408 (Request Timeout), 429 (Too Many Requests), 500, 502, 503, 504: 재시도 대상 (true)
 * - 400, 401, 403, 404, 409, 422 등 비즈니스 거절: 즉시 반환하여 2PC 망취소/안내 처리 (false)
 */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export interface FetchWithPaymentRetryOptions {
  label?: string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  idempotencyKey?: string | null;
}

/**
 * 카드 승인 직후 서버 매출/배정/웹훅 전송을 수행하는 지수 백오프 재시도 래퍼입니다.
 * 1회 순단이나 일시적 응답 지연으로 인해 이미 뽑힌 카드가 억울하게 망취소되는 사고를 방지합니다.
 */
export async function fetchWithPaymentRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithPaymentRetryOptions = {}
): Promise<Response> {
  const delays = options.retryDelaysMs ?? getRetryDelaysMs();
  const maxRetries = delays.length;
  const timeoutMs = options.timeoutMs ?? PAYMENT_RESILIENCE_CONFIG.FETCH_TIMEOUT_MS;
  const label = options.label || '결제 전산 등록';

  const baseHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        baseHeaders[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) {
        baseHeaders[k] = v;
      }
    } else {
      Object.assign(baseHeaders, init.headers as Record<string, string>);
    }
  }
  if (options.idempotencyKey && !baseHeaders['x-idempotency-key']) {
    baseHeaders['x-idempotency-key'] = String(options.idempotencyKey);
  }

  let lastError: unknown = null;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (init.signal?.aborted) {
        const callerAbortErr = new Error('Aborted by caller');
        callerAbortErr.name = 'AbortError';
        throw callerAbortErr;
      }

      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      if (init.signal) {
        init.signal.addEventListener('abort', onCallerAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const fetchInit: RequestInit = {
          ...init,
          headers: Object.keys(baseHeaders).length > 0 ? baseHeaders : init.headers,
          signal: controller.signal,
        };
        const response = await fetch(url, fetchInit);

        if (response.ok || !isRetryableHttpStatus(response.status)) {
          clearPaymentRetryStatus();
          return response;
        }

        // 5xx / 408 / 429 일시 장애 -> 남은 재시도가 있으면 대기 후 재시도
        if (attempt < maxRetries && !init.signal?.aborted) {
          const waitMs = delays[attempt];
          notifyPaymentRetryStatus({
            active: true,
            attempt: attempt + 1,
            maxAttempts: maxRetries,
            label,
            reason: `HTTP ${response.status}`,
          });
          await sleep(waitMs);
          continue;
        }

        clearPaymentRetryStatus();
        return response;
      } catch (err: unknown) {
        lastError = err;

        // 호출자 시그널이 명시적으로 취소된 경우 백오프 재시도 없이 즉시 전파
        if (init.signal?.aborted) {
          throw err;
        }

        if (attempt < maxRetries) {
          const waitMs = delays[attempt];
          const errName = err instanceof Error ? err.name : '';
          const isAbort = errName === 'AbortError';
          notifyPaymentRetryStatus({
            active: true,
            attempt: attempt + 1,
            maxAttempts: maxRetries,
            label,
            reason: isAbort ? '응답 지연(Timeout)' : '네트워크 순단',
          });
          await sleep(waitMs);
          continue;
        }
      } finally {
        clearTimeout(timer);
        if (init.signal) {
          init.signal.removeEventListener('abort', onCallerAbort);
        }
      }
    }
  } finally {
    clearPaymentRetryStatus();
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} 중 서버 통신 오류가 발생했습니다.`);
}

/**
 * 🗄️ [Layer 4: Persistent Payment Outbox Manager]
 * - 카드 승인 직후 원거래 정보를 WAL(Write-Ahead Log)로 로컬 스토리지에 즉시 기록합니다.
 * - 백엔드 전송 성공 시 즉시 제거하며, 만약 인터넷 완전 단절로 DLQ 보고조차 실패한 경우
 *   로컬 큐에 영구 보존했다가 네트워크 복구 시 자동으로 백엔드에 재전송합니다.
 */
export class PaymentOutboxManager {
  private static flushInFlight: Promise<{ flushed: number; remaining: number }> | null = null;

  static getEntries(): PaymentOutboxEntry[] {
    try {
      const raw = localStorage.getItem(PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private static saveEntries(entries: PaymentOutboxEntry[]): void {
    try {
      const trimmed = entries.slice(-PAYMENT_RESILIENCE_CONFIG.MAX_OUTBOX_ITEMS);
      localStorage.setItem(PAYMENT_RESILIENCE_CONFIG.OUTBOX_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.error('[PaymentOutbox] Failed to persist outbox entries:', err);
    }
  }

  static recordWalInFlight(params: {
    storeCd: string;
    terminalId: string;
    authCode: string;
    vanTrNo?: string;
    amount: number;
    purpose?: string;
    endpoint?: string;
    payload: Record<string, unknown>;
  }): string {
    const cleanAuth = String(params.authCode || '').trim();
    const id = cleanAuth
      ? `WAL_${params.storeCd}_${cleanAuth}`
      : `WAL_${Date.now()}_${params.vanTrNo || Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const entries = this.getEntries().filter(
      (e) => e.id !== id && !(cleanAuth && e.kind === 'WAL_IN_FLIGHT' && e.authCode === cleanAuth)
    );
    entries.push({
      id,
      kind: 'WAL_IN_FLIGHT',
      createdAt: nowIso,
      updatedAt: nowIso,
      retryCount: 0,
      storeCd: params.storeCd,
      terminalId: params.terminalId,
      authCode: cleanAuth,
      vanTrNo: params.vanTrNo,
      amount: params.amount,
      purpose: params.purpose,
      endpoint: params.endpoint,
      payload: params.payload,
    });
    this.saveEntries(entries);
    return id;
  }

  static enqueuePendingDlq(params: {
    storeCd: string;
    terminalId: string;
    authCode: string;
    vanTrNo?: string;
    amount: number;
    payload: Record<string, unknown>;
  }): string {
    const cleanAuth = String(params.authCode || '').trim();
    const dedupKey = `DLQ_${params.storeCd}_${cleanAuth}_${params.amount}`;
    const nowIso = new Date().toISOString();
    // 동일 승인번호의 WAL_IN_FLIGHT가 남아있으면 PENDING_DLQ로 원자적 승격(치환)
    const entries = this.getEntries().filter(
      (e) => e.id !== dedupKey && !(cleanAuth && e.kind === 'WAL_IN_FLIGHT' && e.authCode === cleanAuth)
    );
    entries.push({
      id: dedupKey,
      kind: 'PENDING_DLQ',
      createdAt: nowIso,
      updatedAt: nowIso,
      retryCount: 0,
      storeCd: params.storeCd,
      terminalId: params.terminalId,
      authCode: cleanAuth,
      vanTrNo: params.vanTrNo,
      amount: params.amount,
      endpoint: '/sales/dlq/report-ghost-charge',
      payload: params.payload,
    });
    this.saveEntries(entries);
    return dedupKey;
  }

  static removeEntry(id?: string | null): void {
    if (!id) return;
    const entries = this.getEntries();
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length !== entries.length) {
      this.saveEntries(filtered);
    }
  }

  static removeByAuthCode(authCode?: string | null): void {
    if (!authCode) return;
    const entries = this.getEntries();
    const filtered = entries.filter((e) => e.authCode !== authCode);
    if (filtered.length !== entries.length) {
      this.saveEntries(filtered);
    }
  }

  /**
   * 네트워크 복구 또는 앱 재기동 시 큐에 쌓인 미전송 DLQ 보고 건 및
   * 정전/강제종료로 미확정 방치된 Stale WAL(60초 경과) 건들을 백엔드로 자동 재전송(Auto-Flush)합니다.
   */
  static async flushPendingDlq(
    sendDlqFn: (payload: Record<string, unknown>) => Promise<boolean>
  ): Promise<{ flushed: number; remaining: number }> {
    if (this.flushInFlight) {
      return this.flushInFlight;
    }

    this.flushInFlight = (async () => {
      const snapshot = this.getEntries();
      if (snapshot.length === 0) {
        return { flushed: 0, remaining: 0 };
      }

      const nowMs = Date.now();
      let flushed = 0;
      let mutated = false;
      const flushedIds = new Set<string>();
      const updatedById = new Map<string, PaymentOutboxEntry>();

      for (const item of snapshot) {
        const createdMs = Date.parse(item.createdAt);
        const isStaleWal =
          item.kind === 'WAL_IN_FLIGHT' &&
          Boolean(item.authCode) &&
          item.amount > 0 &&
          !Number.isNaN(createdMs) &&
          nowMs - createdMs >= PAYMENT_RESILIENCE_CONFIG.STALE_WAL_MS;

        if (item.kind !== 'PENDING_DLQ' && !isStaleWal) {
          continue;
        }

        mutated = true;
        const dlqPayload =
          item.kind === 'PENDING_DLQ'
            ? item.payload
            : {
                store_cd: item.storeCd,
                terminal_id: item.terminalId || 'KIOSK-01',
                device_type: 'KIOSK',
                auth_no: item.authCode,
                amount: item.amount,
                card_name: item.payload?.issuer_name || item.payload?.cardName || '',
                card_no_masked: item.payload?.card_no_masked || item.payload?.cardNoMasked || '',
                van_tr_no: item.vanTrNo,
                approved_at: item.payload?.approved_at || item.createdAt,
                backend_error_reason: `키오스크 비정상 종료/정전 복구 감지 (${item.purpose || item.endpoint || 'WAL_IN_FLIGHT'})`,
                reversal_error_reason: '전원 차단 또는 프로세스 강제 종료로 현장 망취소 미수행',
              };

        try {
          const ok = await sendDlqFn(dlqPayload);
          if (ok) {
            flushed++;
            flushedIds.add(item.id);
          } else {
            updatedById.set(item.id, {
              ...item,
              kind: 'PENDING_DLQ',
              payload: dlqPayload,
              retryCount: item.retryCount + 1,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch {
          updatedById.set(item.id, {
            ...item,
            kind: 'PENDING_DLQ',
            payload: dlqPayload,
            retryCount: item.retryCount + 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (!mutated) {
        return { flushed: 0, remaining: this.getEntries().length };
      }

      // 비동기 전송 도중 신규 기록된 WAL/DLQ 엔트리를 보존하고 이미 정상 제거된 엔트리는 부활시키지 않도록 최신 큐와 병합
      const latestEntries = this.getEntries();
      const mergedEntries: PaymentOutboxEntry[] = [];
      for (const current of latestEntries) {
        if (flushedIds.has(current.id)) {
          continue;
        }
        const updated = updatedById.get(current.id);
        mergedEntries.push(updated ?? current);
      }
      this.saveEntries(mergedEntries);
      return { flushed, remaining: mergedEntries.length };
    })();

    try {
      return await this.flushInFlight;
    } finally {
      this.flushInFlight = null;
    }
  }
}
