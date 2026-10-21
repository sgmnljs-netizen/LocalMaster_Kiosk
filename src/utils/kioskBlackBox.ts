/**
 * ============================================================================
 * [키오스크 블랙박스 (KioskBlackBox)] - 초경량 인메모리 링버퍼 & 민감정보 마스킹
 * ============================================================================
 * - 평소에는 네트워크/디스크 부하 0% (RAM 약 30KB 이내, 최대 100건 링버퍼 유지)
 * - 실제 에러/하드웨어 단절/직원 호출 발생 시에만 직전 15건의 터치·단계 동선을
 *   백엔드 `system_logs`로 비동기(Fire-and-Forget) 전송합니다.
 */

export const ENABLE_KIOSK_BLACKBOX = true;

export type KioskBlackBoxCategory =
  | 'STEP'
  | 'AUTH'
  | 'ALLOCATION'
  | 'CHECKIN'
  | 'MOVE'
  | 'LOCKER'
  | 'PURCHASE'
  | 'PAYMENT'
  | 'HW_STATUS'
  | 'API_ERROR'
  | 'UI_ERROR'
  | 'STAFF_CALL'
  | 'AUDIT';

export interface KioskBlackBoxLogItem {
  id: string;
  timestamp: string;
  category: KioskBlackBoxCategory;
  actionName: string;
  payload?: Record<string, unknown> | string | number | null;
  errorInfo?: {
    status?: number;
    appCode?: string;
    appMessage?: string;
    traceId?: string;
    url?: string;
  };
}

declare global {
  interface Window {
    __KIOSK_BLACKBOX__?: KioskBlackBoxLogItem[];
    __KIOSK_BLACKBOX_LATEST_ACTION__?: string;
  }
}

let memoryBlackBox: KioskBlackBoxLogItem[] = [];

if (typeof window !== 'undefined') {
  if (!window.__KIOSK_BLACKBOX__) {
    window.__KIOSK_BLACKBOX__ = memoryBlackBox;
  } else {
    memoryBlackBox = window.__KIOSK_BLACKBOX__;
  }
}

const MAX_LOG_SIZE = 100;

export function clearKioskBlackBox(): void {
  memoryBlackBox = [];
  if (typeof window !== 'undefined') {
    window.__KIOSK_BLACKBOX__ = memoryBlackBox;
    window.__KIOSK_BLACKBOX_LATEST_ACTION__ = undefined;
  }
}

const SENSITIVE_SECRET_KEY_RE = /(password|passwd|pwd|pin|device_?key|secret|token|authorization|api_?key)/i;
const SENSITIVE_CVC_KEY_RE = /^(cvc|cvv|cvv2|card_cvc|security_code)$/i;
const SENSITIVE_CARD_KEY_RE = /^(card_no|cardno|cardnumber|card_number|card_num|pan)$/i;
const RAW_PAN_DIGIT_RE = /\b(\d{6})[-\s]?(\d{2})\d{2}[-\s]?\d{4}[-\s]?(\d{3,4})\b/g;
const RAW_PHONE_RE = /\b(01[016789])[-\s]?(\d{3,4})[-\s]?(\d{4})\b/g;

export function maskKioskSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(maskKioskSensitiveData(parsed, depth + 1));
      } catch {
        // 일반 문자열 마스킹으로 폴백
      }
    }
    return value
      .replace(RAW_PAN_DIGIT_RE, '$1-$2**-****-$3')
      .replace(RAW_PHONE_RE, '$1-****-$3');
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskKioskSensitiveData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const maskedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_SECRET_KEY_RE.test(k)) {
        maskedObj[k] = '******';
      } else if (SENSITIVE_CVC_KEY_RE.test(k)) {
        maskedObj[k] = '***';
      } else if (SENSITIVE_CARD_KEY_RE.test(k) && typeof v === 'string') {
        const digits = v.replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19) {
          maskedObj[k] = `${digits.slice(0, 6)}-**-****-${digits.slice(-4)}`;
        } else {
          maskedObj[k] = '******';
        }
      } else {
        maskedObj[k] = maskKioskSensitiveData(v, depth + 1);
      }
    }
    return maskedObj;
  }

  return value;
}

/**
 * 키오스크 블랙박스 이벤트 기록 (메모리 링버퍼 100건 유지, 부하 0ms)
 */
export function recordKioskBlackBox(
  category: KioskBlackBoxCategory,
  actionName: string,
  payload?: KioskBlackBoxLogItem['payload'],
  errorInfo?: KioskBlackBoxLogItem['errorInfo']
): void {
  if (!ENABLE_KIOSK_BLACKBOX) return;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  const safePayload = (payload !== undefined && payload !== null
    ? maskKioskSensitiveData(payload)
    : null) as KioskBlackBoxLogItem['payload'];

  const safeActionName = String(maskKioskSensitiveData(actionName));

  const newItem: KioskBlackBoxLogItem = {
    id: `kbb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    category,
    actionName: safeActionName,
    payload: safePayload,
    errorInfo,
  };

  memoryBlackBox.unshift(newItem);
  if (memoryBlackBox.length > MAX_LOG_SIZE) {
    memoryBlackBox.pop();
  }

  if (typeof window !== 'undefined') {
    window.__KIOSK_BLACKBOX__ = memoryBlackBox;
    window.__KIOSK_BLACKBOX_LATEST_ACTION__ = `[${category}] ${safeActionName}`;
  }
}

export function getRecentKioskBlackBoxLogs(count = 15): KioskBlackBoxLogItem[] {
  const source = typeof window !== 'undefined' && window.__KIOSK_BLACKBOX__ ? window.__KIOSK_BLACKBOX__ : memoryBlackBox;
  return source.slice(0, count);
}

export function getFormattedKioskBlackBoxText(count = 15): string {
  const source = typeof window !== 'undefined' && window.__KIOSK_BLACKBOX__ ? window.__KIOSK_BLACKBOX__ : memoryBlackBox;
  if (!source || source.length === 0) {
    return '📼 [키오스크 블랙박스] 기록된 동선이 없습니다.';
  }

  const recentLogs = source.slice(0, count);
  const lines: string[] = [
    `### 📼 [키오스크 블랙박스] 직전 ${recentLogs.length}개 화면/터치/통신 이력`,
    `*수집 시각: ${new Date().toLocaleString('ko-KR')}*`,
    '```json',
  ];

  recentLogs.forEach((log, idx) => {
    lines.push(`// #${recentLogs.length - idx} [${log.timestamp}] [${log.category}] ${log.actionName}`);
    if (log.payload) {
      lines.push(`Payload: ${typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}`);
    }
    if (log.errorInfo) {
      lines.push(
        `ERROR: Status ${log.errorInfo.status ?? '-'} | Code: ${log.errorInfo.appCode ?? '-'} | TraceID: ${log.errorInfo.traceId ?? '-'}`
      );
      if (log.errorInfo.appMessage) {
        lines.push(`Message: ${log.errorInfo.appMessage}`);
      }
    }
    lines.push('---');
  });

  lines.push('```');
  return lines.join('\n');
}
