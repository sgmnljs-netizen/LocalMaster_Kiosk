import { Bay } from '../services/api';

export interface BayHardwareState {
  isBlocked: boolean; // 점검 중이거나 배정 불가 여부 (ERROR, 점검, 통신오류, 공부족 등)
  isBallEmpty: boolean; // 볼 공급 부족 (볼박스 공 부족)
  isHwError: boolean; // 기기 하드웨어 오류 / 점검
  shortLabel: string; // '점검중' | '공부족' | '통신오류' 등
  errorDetail?: string; // 상세 메시지
}

export interface BayConfigMeta {
  ball_box_detected?: boolean | null;
  ball_box_status?: string | null;
  error_short_label?: string | null;
  error_code?: string | number | null;
  has_error?: boolean | null;
  status?: string | null;
  error_text?: string | null;
  error_msg?: string | null;
  [key: string]: unknown;
}

export function parseBayConfigJson(bay: Bay): BayConfigMeta {
  if (!bay.config_json) return {};
  try {
    const parsed: unknown = typeof bay.config_json === 'string' ? JSON.parse(bay.config_json) : bay.config_json;
    return typeof parsed === 'object' && parsed !== null ? (parsed as BayConfigMeta) : {};
  } catch {
    return {};
  }
}

const NON_ERROR_HW_CODES = new Set([
  '',
  '0',
  '00',
  'NONE',
  'NORMAL',
  'OK',
  'NULL',
  'FALSE',
]);

export function isNonEmptyHardwareErrorCode(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === false) return false;
  const normalized = String(raw).trim().toUpperCase();
  return !NON_ERROR_HW_CODES.has(normalized);
}

export function evaluateBayHardwareState(bay: Bay): BayHardwareState {
  const cfg = parseBayConfigJson(bay);
  const statusCode = typeof bay.status_info?.code === 'string' ? bay.status_info.code : '';
  const canonicalStatus = String(statusCode || bay.status || '').toUpperCase();
  const cfgErrCode = String(cfg.error_code ?? '').trim().toUpperCase();
  const bayErrCode = String(bay.error_code ?? '').trim().toUpperCase();

  // 1. 볼 공급 부족 (E01 or ball_box_detected === false or ball_box_status === 'EMPTY' or error_short_label === '볼부족')
  const isBallEmpty =
    bay.ball_box_detected === false ||
    bay.ball_box_status === 'EMPTY' ||
    cfg.ball_box_detected === false ||
    cfg.ball_box_status === 'EMPTY' ||
    cfg.error_short_label === '볼부족' ||
    cfgErrCode === 'E01' ||
    bayErrCode === 'E01';

  // 2. 하드웨어 에러 / 통신 오류
  const isHwError =
    bay.hardware_status === 'ERROR' ||
    cfg.has_error === true ||
    cfg.status === 'communication_error' ||
    bay.has_error === true ||
    isNonEmptyHardwareErrorCode(bay.error_code);

  // 3. 상태 기반 점검/비활성 여부
  const isStatusBlocked =
    bay.is_active === false ||
    ['UNDER_MAINTENANCE', 'MAINTENANCE', 'REPAIR', 'ERROR', 'DISABLED', 'OFFLINE', 'FAULT', 'OUT_OF_SERVICE', 'HOLD', 'BUFFER', 'RESERVED'].includes(canonicalStatus);

  const isBlocked = isStatusBlocked || isHwError || isBallEmpty;

  let shortLabel = '점검중';
  if (isBallEmpty) {
    shortLabel = '공부족';
  } else if (cfg.error_short_label) {
    shortLabel = String(cfg.error_short_label);
  } else if (cfg.status === 'communication_error') {
    shortLabel = '통신오류';
  }

  const errorDetail =
    cfg.error_text ||
    cfg.error_msg ||
    bay.error_msg ||
    (isBallEmpty ? '볼 공급 불량 (볼박스 공 부족)' : isHwError ? '타석기 하드웨어 점검 중' : undefined);

  return {
    isBlocked,
    isBallEmpty,
    isHwError,
    shortLabel,
    errorDetail,
  };
}

/**
 * 키오스크에서 실제로 즉시 배정 가능한 정상 빈 타석인지 판별하는 SSOT 헬퍼
 * - status가 AVAILABLE이더라도 하드웨어 오류/통신단절/볼부족(evaluateBayHardwareState.isBlocked),
 *   레슨 전용(is_lesson_only), 비활성(is_active === false), 볼회수 일시정지(is_paused)인 타석은 즉시 제외한다.
 */
export function isBayTrulyAvailableForKiosk(bay: Bay): boolean {
  const statusCode = typeof bay.status_info?.code === 'string' ? bay.status_info.code : '';
  const canonicalStatus = String(statusCode || bay.status || '').toUpperCase();
  if (canonicalStatus !== 'AVAILABLE') return false;
  if (bay.is_active === false) return false;
  if (Boolean(bay.is_lesson_only)) return false;
  if (Boolean(bay.is_paused) || Boolean(bay.is_global_paused)) return false;
  if (evaluateBayHardwareState(bay).isBlocked) return false;
  return true;
}

/**
 * 배정/그룹배정 비동기 요청 중 더블탭 중복 호출 및 내비게이션 이탈을 원천 차단하는 뮤텍스 실행기
 */
export async function runWithAllocationMutex<T>(
  lockRef: { current: boolean },
  task: () => Promise<T>
): Promise<{ executed: boolean; value?: T }> {
  if (lockRef.current) {
    return { executed: false };
  }
  lockRef.current = true;
  try {
    const value = await task();
    return { executed: true, value };
  } finally {
    lockRef.current = false;
  }
}

