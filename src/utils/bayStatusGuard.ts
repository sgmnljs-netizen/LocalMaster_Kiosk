import { Bay } from '../services/api';

export const BLOCKED_BAY_STATUSES = [
  'UNDER_MAINTENANCE',
  'MAINTENANCE',
  'REPAIR',
  'ERROR',
  'DISABLED',
  'OFFLINE',
  'FAULT',
  'OUT_OF_SERVICE',
  'HOLD',
  'BUFFER',
] as const;

export const ACTIVE_SESSION_BAY_STATUSES = ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'] as const;

export interface BayHardwareState {
  isBlocked: boolean; // 점검 중이거나 배정 불가 여부 (ERROR, 점검, 통신오류, 공부족 등)
  isStatusBlocked: boolean; // 타석 상태코드/비활성 기반 차단 여부
  isBallEmpty: boolean; // 볼 공급 부족 (볼박스 공 부족)
  isHwError: boolean; // 기기 하드웨어 오류 / 점검
  shortLabel: string; // '점검중' | '공부족' | '통신오류' 등
  errorDetail?: string; // 상세 메시지
}

export function resolveCanonicalBayStatus(
  bay?: { status?: string | null; status_info?: { code?: string | null } | null } | null
): string {
  if (!bay) return '';
  const infoCode = typeof bay.status_info?.code === 'string' ? bay.status_info.code.trim().toUpperCase() : '';
  if (infoCode && infoCode !== 'UNKNOWN') {
    return infoCode;
  }
  return String(bay.status ?? '').trim().toUpperCase();
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
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as BayConfigMeta)
      : {};
  } catch {
    return {};
  }
}

const NON_ERROR_HW_CODES = new Set([
  '',
  '0',
  '00',
  '0.0',
  '-1',
  'NONE',
  'NORMAL',
  'OK',
  'NULL',
  'FALSE',
]);

export function isNonEmptyHardwareErrorCode(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === false) return false;
  if (typeof raw === 'number' && (!Number.isFinite(raw) || raw <= 0)) return false;
  const normalized = String(raw).trim().toUpperCase();
  return !NON_ERROR_HW_CODES.has(normalized);
}

export function evaluateBayHardwareState(bay: Bay): BayHardwareState {
  const cfg = parseBayConfigJson(bay);
  const canonicalStatus = resolveCanonicalBayStatus(bay);
  const hasHwControl = bay.has_hardware_control !== false;
  const cfgErrCode = String(cfg.error_code ?? '').trim().toUpperCase();
  const bayErrCode = String(bay.error_code ?? '').trim().toUpperCase();
  const normBayBallStatus = String(bay.ball_box_status ?? '').trim().toUpperCase();
  const normCfgBallStatus = String(cfg.ball_box_status ?? '').trim().toUpperCase();
  const normHwStatus = String(bay.hardware_status ?? '').trim().toUpperCase();
  const normCfgStatus = String(cfg.status ?? '').trim().toLowerCase();
  const normCfgShortLabel = String(cfg.error_short_label ?? '').trim();

  // 1. 볼 공급 부족 (E01 or ball_box_detected === false or ball_box_status === 'EMPTY' or error_short_label === '볼부족')
  // 스크린전용/비제어 타석(has_hardware_control === false)은 볼센서/장비에러 판정에서 면제
  const isBallEmpty =
    hasHwControl &&
    (bay.ball_box_detected === false ||
      normBayBallStatus === 'EMPTY' ||
      cfg.ball_box_detected === false ||
      normCfgBallStatus === 'EMPTY' ||
      normCfgShortLabel === '볼부족' ||
      cfgErrCode === 'E01' ||
      bayErrCode === 'E01');

  // 2. 하드웨어 에러 / 통신 오류
  const isHwError =
    hasHwControl &&
    (normHwStatus === 'ERROR' ||
      cfg.has_error === true ||
      normCfgStatus === 'communication_error' ||
      bay.has_error === true ||
      isNonEmptyHardwareErrorCode(bay.error_code) ||
      isNonEmptyHardwareErrorCode(cfg.error_code));

  // 3. 상태 기반 점검/비활성 여부 (RESERVED는 예약대기이므로 점검차단에서 제외)
  const isStatusBlocked =
    bay.is_active === false ||
    (BLOCKED_BAY_STATUSES as readonly string[]).includes(canonicalStatus);

  const isBlocked = isStatusBlocked || isHwError || isBallEmpty;

  let shortLabel = '점검중';
  if (isBallEmpty) {
    shortLabel = '공부족';
  } else if (normCfgShortLabel) {
    shortLabel = normCfgShortLabel;
  } else if (bay.error_short_label && String(bay.error_short_label).trim()) {
    shortLabel = String(bay.error_short_label).trim();
  } else if (normCfgStatus === 'communication_error') {
    shortLabel = '통신오류';
  }

  const errorDetail =
    cfg.error_text ||
    cfg.error_msg ||
    bay.error_msg ||
    (isBallEmpty ? '볼 공급 불량 (볼박스 공 부족)' : isHwError ? '타석기 하드웨어 점검 중' : undefined);

  return {
    isBlocked,
    isStatusBlocked,
    isBallEmpty,
    isHwError,
    shortLabel,
    errorDetail,
  };
}

/**
 * 키오스크에서 실제로 즉시 배정 가능한 정상 빈 타석인지 판별하는 SSOT 헬퍼
 * - status가 AVAILABLE/OPEN이더라도 하드웨어 오류/통신단절/볼부족(evaluateBayHardwareState.isBlocked),
 *   레슨 전용(is_lesson_only), 비활성(is_active === false), 볼회수 일시정지(is_paused)인 타석은 즉시 제외한다.
 */
export function isBayTrulyAvailableForKiosk(bay: Bay): boolean {
  const canonicalStatus = resolveCanonicalBayStatus(bay);
  if (canonicalStatus !== 'AVAILABLE' && canonicalStatus !== 'OPEN') return false;
  if (bay.is_active === false) return false;
  if (Boolean(bay.is_lesson_only)) return false;
  if (Boolean(bay.is_paused) || Boolean(bay.is_global_paused)) return false;
  if (evaluateBayHardwareState(bay).isBlocked) return false;
  return true;
}

/**
 * 셀프 타석 이동 시 회원이 현재 점유 중인 출발 타석(고장/점검 전환된 활성 세션 포함)인지 판별하는 SSOT 헬퍼
 */
export function isBayOwnedWithActiveSession(
  bay: Bay | null | undefined,
  effMemberNo?: string | null,
  effMemberName?: string | null
): boolean {
  if (!bay) return false;
  const st = resolveCanonicalBayStatus(bay);
  const isNormalActive = (ACTIVE_SESSION_BAY_STATUSES as readonly string[]).includes(st);
  const hasLiveSessionEvidence =
    Boolean(bay.res_id) ||
    Number(bay.minutes_left ?? 0) > 0 ||
    Boolean(bay.end_time) ||
    Boolean(bay.end_epoch_ms);
  const isBrokenActive =
    (BLOCKED_BAY_STATUSES as readonly string[]).includes(st) && hasLiveSessionEvidence;

  if (!isNormalActive && !isBrokenActive) return false;

  const normEffNo = String(effMemberNo ?? '').trim();
  const normEffName = String(effMemberName ?? '').trim();
  const bayMemberNo = String(bay.current_member_no || bay.member_no || '').trim();
  if (bayMemberNo !== '') {
    return Boolean(normEffNo && bayMemberNo === normEffNo);
  }
  if (normEffNo && String(bay.current_user_name || '').trim() === normEffNo) {
    return true;
  }
  const bayUserName = String(bay.member_name || bay.current_user_name || '').trim();
  return normEffName !== '' && bayUserName !== '' && bayUserName === normEffName;
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

