import { Bay } from '../services/api';

export interface BayHardwareState {
  isBlocked: boolean; // 점검 중이거나 배정 불가 여부 (ERROR, 점검, 통신오류, 공부족 등)
  isBallEmpty: boolean; // 볼 공급 부족 (볼박스 공 부족)
  isHwError: boolean; // 기기 하드웨어 오류 / 점검
  shortLabel: string; // '점검중' | '공부족' | '통신오류' 등
  errorDetail?: string; // 상세 메시지
}

export function parseBayConfigJson(bay: Bay): Record<string, any> {
  if (!bay.config_json) return {};
  try {
    const parsed = typeof bay.config_json === 'string' ? JSON.parse(bay.config_json) : bay.config_json;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function evaluateBayHardwareState(bay: Bay): BayHardwareState {
  const cfg = parseBayConfigJson(bay);
  const canonicalStatus = String((bay as any).status_info?.code || bay.status || '').toUpperCase();

  // 1. 볼 공급 부족 (E01 or ball_box_detected === false or ball_box_status === 'EMPTY' or error_short_label === '볼부족')
  const isBallEmpty =
    (bay as any).ball_box_detected === false ||
    (bay as any).ball_box_status === 'EMPTY' ||
    cfg.ball_box_detected === false ||
    cfg.ball_box_status === 'EMPTY' ||
    cfg.error_short_label === '볼부족' ||
    String(cfg.error_code) === 'E01' ||
    String((bay as any).error_code) === 'E01';

  // 2. 하드웨어 에러 / 통신 오류
  const isHwError =
    (bay as any).hardware_status === 'ERROR' ||
    cfg.has_error === true ||
    cfg.status === 'communication_error' ||
    (bay as any).has_error === true ||
    Boolean((bay as any).error_code && String((bay as any).error_code) !== '0');

  // 3. 상태 기반 점검/비활성 여부
  const isStatusBlocked =
    (bay as any).is_active === false ||
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
    (bay as any).error_msg ||
    (isBallEmpty ? '볼 공급 불량 (볼박스 공 부족)' : isHwError ? '타석기 하드웨어 점검 중' : undefined);

  return {
    isBlocked,
    isBallEmpty,
    isHwError,
    shortLabel,
    errorDetail,
  };
}
