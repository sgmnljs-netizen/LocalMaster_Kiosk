/**
 * [SSOT] LocalMaster_Kiosk 전용 TimeMaster 클래스
 * - 한국 표준시(KST UTC+9) 날짜 추출 (toISOString UTC 오용 방지)
 * - HH:mm / HHmm 종료시간 파싱 및 자정 경과(+24h) 보정
 * - 백엔드 minutes_left SSOT 기반 잔여시간 산출
 */
export class TimeMaster {
  private static serverOffsetMs: number = 0;

  /** 백엔드 server_epoch_ms를 기반으로 클라이언트-서버 시계 오차 동기화 */
  static syncServerTime(serverEpochMs?: number | null): void {
    if (serverEpochMs && typeof serverEpochMs === 'number') {
      TimeMaster.serverOffsetMs = serverEpochMs - Date.now();
    }
  }

  /** 서버 보정 현재 시각 (ms) */
  static getSyncedNowMs(): number {
    return Date.now() + TimeMaster.serverOffsetMs;
  }

  /** KST 로컬 기준 YYYY-MM-DD 날짜 추출 (toISOString UTC -9h 오차 방지) */
  static getKstYmd(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 타석 종료시간(ISO 8601 / HH:mm / HHmm) 안전 파싱 및 자정 경과(+24h) 보정 */
  static parseSessionEnd(endTimeStr?: string | null, now: Date = new Date()): Date | null {
    if (!endTimeStr) return null;
    const trimmed = String(endTimeStr).trim();
    if (!trimmed) return null;

    // 1. ISO 8601 또는 전체 날짜 문자열 우선 파싱 (예: 2026-10-15T20:30:00 -> 20:26 오작동 원천 차단)
    if (trimmed.includes('T') || trimmed.includes('-') || trimmed.length > 5) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }

    // 2. 4자리 HHmm / HH:mm 전용 파서
    const cleanTime = trimmed.replace(/[^0-9]/g, '');
    if (cleanTime.length !== 4) return null;
    const endHour = parseInt(cleanTime.substring(0, 2), 10);
    const endMin = parseInt(cleanTime.substring(2, 4), 10);
    if (isNaN(endHour) || isNaN(endMin)) return null;
    let endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0, 0);
    // 자정 경과 세션 (예: 23:30 시작 ~ 00:30 종료 시 23시간 과거 산출 방지)
    if (endDt.getTime() < now.getTime() - 12 * 3600 * 1000) {
      endDt = new Date(endDt.getTime() + 24 * 3600 * 1000);
    }
    return endDt;
  }

  /** 서버 보정 현재 Date 객체 */
  static getSyncedDate(): Date {
    return new Date(TimeMaster.getSyncedNowMs());
  }

  /** 대기시간 잔여 (초) 산출 (prepare_expired_epoch_ms SSOT 최우선) */
  static getPrepareRemainingSec(
    bay?: { prepare_remaining_sec?: number; prepare_expired_epoch_ms?: number | null } | null
  ): number {
    if (!bay) return 0;
    if (bay.prepare_expired_epoch_ms && typeof bay.prepare_expired_epoch_ms === 'number') {
      const diffMs = bay.prepare_expired_epoch_ms - TimeMaster.getSyncedNowMs();
      return Math.max(0, Math.ceil(diffMs / 1000));
    }
    return bay.prepare_remaining_sec ?? 0;
  }

  /** 잔여 시간 산출 (실시간 end_epoch_ms 연산 최우선, Bay 객체 또는 endTime 문자열 모두 지원) */
  static getRemainingMinutes(
    bayOrEndTime?: { minutes_left?: number; end_time?: string | null; end_epoch_ms?: number | null } | string | null,
    now?: Date | number,
    endEpochMs?: number | null
  ): number {
    if (!bayOrEndTime && !endEpochMs) return 0;
    const refNowMs =
      now !== undefined
        ? typeof now === 'number'
          ? now
          : now.getTime()
        : TimeMaster.getSyncedNowMs();
    const refDate = new Date(refNowMs);

    if (typeof bayOrEndTime === 'string' || bayOrEndTime === null || bayOrEndTime === undefined) {
      if (endEpochMs && typeof endEpochMs === 'number') {
        const diffMs = endEpochMs - refNowMs;
        return Math.max(0, Math.ceil(diffMs / 1000 / 60));
      }
      if (typeof bayOrEndTime === 'string' && bayOrEndTime) {
        const endDt = TimeMaster.parseSessionEnd(bayOrEndTime, refDate);
        if (endDt) {
          const diffMs = endDt.getTime() - refNowMs;
          return Math.max(0, Math.ceil(diffMs / 1000 / 60));
        }
      }
      return 0;
    }

    const epoch = endEpochMs ?? bayOrEndTime.end_epoch_ms;
    if (epoch && typeof epoch === 'number') {
      const diffMs = epoch - refNowMs;
      return Math.max(0, Math.ceil(diffMs / 1000 / 60));
    }
    if (bayOrEndTime.end_time) {
      const endDt = TimeMaster.parseSessionEnd(bayOrEndTime.end_time, refDate);
      if (endDt) {
        const diffMs = endDt.getTime() - refNowMs;
        return Math.max(0, Math.ceil(diffMs / 1000 / 60));
      }
    }
    return bayOrEndTime.minutes_left ?? 0;
  }

  /** 타석 종료 시각 (HH:mm) 안전 포맷팅 (Bay 객체 또는 endTime 문자열 모두 지원) */
  static formatEndTime(
    bayOrEndTime?: { end_time?: string | null; end_epoch_ms?: number | null } | string | null,
    endEpochMs?: number | null
  ): string {
    const epoch =
      endEpochMs ??
      (typeof bayOrEndTime === 'object' && bayOrEndTime !== null ? bayOrEndTime.end_epoch_ms : undefined);

    if (epoch && typeof epoch === 'number') {
      const d = new Date(epoch);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      }
    }

    const endTimeStr =
      typeof bayOrEndTime === 'string'
        ? bayOrEndTime
        : typeof bayOrEndTime === 'object' && bayOrEndTime !== null
        ? bayOrEndTime.end_time
        : null;

    if (!endTimeStr) return '종료';
    const trimmed = String(endTimeStr).trim();
    if (!trimmed) return '종료';

    if (trimmed.includes('T') || trimmed.includes('-') || trimmed.length > 5) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }

    const clean = trimmed.replace(/[^0-9]/g, '');
    if (clean.length === 4) {
      return `${clean.substring(0, 2)}:${clean.substring(2, 4)}`;
    }
    return trimmed;
  }

  /** 날짜 및 시각 포맷팅 (YYYY.MM.DD HH:mm:ss) */
  static formatKstDateTime(d: Date = new Date(), includeSeconds: boolean = true): string {
    const ymd = TimeMaster.getKstYmd(d).replace(/-/g, '.');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (!includeSeconds) {
      return `${ymd} ${hh}:${mm}`;
    }
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${ymd} ${hh}:${mm}:${ss}`;
  }
}

export const isBayAvailable = (bay: any): boolean =>
  Boolean(bay && bay.is_active !== false && (bay.status === 'AVAILABLE' || bay.status === 'OPEN'));

export const isBayOccupied = (bay: any): boolean =>
  Boolean(bay && ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(String(bay.status || '').toUpperCase()));

export const isBayBlocked = (bay: any): boolean =>
  Boolean(
    !bay ||
      bay.is_active === false ||
      [
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
        'RESERVED',
      ].includes(String(bay.status || '').toUpperCase())
  );

