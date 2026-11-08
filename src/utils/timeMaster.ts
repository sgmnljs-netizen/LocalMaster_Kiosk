/**
 * [SSOT] LocalMaster_Kiosk 전용 TimeMaster 클래스
 * - 한국 표준시(KST UTC+9) 날짜 추출 (toISOString UTC 오용 방지)
 * - HH:mm / HHmm 종료시간 파싱 및 자정 경과(+24h) 보정
 * - 백엔드 minutes_left SSOT 기반 잔여시간 산출
 */
export class TimeMaster {
  private static serverOffsetMs: number = 0;
  private static readonly KST_UTC_OFFSET_MS: number = 9 * 3600 * 1000;

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

  /** 호스트 OS 타임존(UTC 등)과 무관하게 KST(UTC+9) 시각 구성요소를 결정론적으로 추출 */
  static getKstParts(d: Date = new Date()): {
    year: number;
    month: string;
    day: string;
    weekday: number;
    hours: string;
    minutes: string;
    seconds: string;
  } {
    const kst = new Date(d.getTime() + TimeMaster.KST_UTC_OFFSET_MS);
    return {
      year: kst.getUTCFullYear(),
      month: String(kst.getUTCMonth() + 1).padStart(2, '0'),
      day: String(kst.getUTCDate()).padStart(2, '0'),
      weekday: kst.getUTCDay(),
      hours: String(kst.getUTCHours()).padStart(2, '0'),
      minutes: String(kst.getUTCMinutes()).padStart(2, '0'),
      seconds: String(kst.getUTCSeconds()).padStart(2, '0'),
    };
  }

  /** KST(UTC+9) 기준 YYYY-MM-DD 날짜 추출 (toISOString UTC -9h 오차 및 비-KST 호스트 오차 방지) */
  static getKstYmd(d: Date = new Date()): string {
    const { year, month, day } = TimeMaster.getKstParts(d);
    return `${year}-${month}-${day}`;
  }

  /** KST(UTC+9) 기준 HHmm 4자리 시각 추출 */
  static getKstHhMm(d: Date = new Date()): string {
    const { hours, minutes } = TimeMaster.getKstParts(d);
    return `${hours}${minutes}`;
  }

  /** Naive ISO/SQLite 문자열(타임존 미포함)을 KST(+09:00)로 안전하게 정규화 파싱 */
  static parseIsoAsKstDate(isoLike: string): Date {
    const trimmed = String(isoLike || '').trim();
    const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)
      ? trimmed.replace(/\s+/, 'T')
      : trimmed;
    const hasExplicitTz = normalized.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalized);
    if (!hasExplicitTz && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
      return new Date(`${normalized}+09:00`);
    }
    return new Date(normalized);
  }

  /** 타석 종료시간(ISO 8601 / HH:mm / HHmm) 안전 파싱 및 자정 경과(+24h) 보정 (KST 고정) */
  static parseSessionEnd(endTimeStr?: string | null, now: Date = new Date()): Date | null {
    if (!endTimeStr) return null;
    const trimmed = String(endTimeStr).trim();
    if (!trimmed) return null;

    // 1. ISO 8601 또는 전체 날짜 문자열 우선 파싱 (예: 2026-10-15T20:30:00 -> 20:26 오작동 원천 차단)
    if (trimmed.includes('T') || trimmed.includes('-') || trimmed.length > 5) {
      const d = TimeMaster.parseIsoAsKstDate(trimmed);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }

    // 2. 4자리 HHmm / HH:mm 전용 파서 (호스트 OS 타임존과 무관하게 KST 기준 파싱)
    const cleanTime = trimmed.replace(/[^0-9]/g, '');
    if (cleanTime.length !== 4) return null;
    const endHour = parseInt(cleanTime.substring(0, 2), 10);
    const endMin = parseInt(cleanTime.substring(2, 4), 10);
    if (
      isNaN(endHour) ||
      isNaN(endMin) ||
      endHour < 0 ||
      endHour > 24 ||
      endMin < 0 ||
      endMin > 59 ||
      (endHour === 24 && endMin > 0)
    ) {
      return null;
    }
    const { year, month, day } = TimeMaster.getKstParts(now);
    const hh = String(endHour === 24 ? 0 : endHour).padStart(2, '0');
    const mm = String(endMin).padStart(2, '0');
    const baseMs = Date.parse(`${year}-${month}-${day}T${hh}:${mm}:00+09:00`);
    let endMs = endHour === 24 ? baseMs + 24 * 3600 * 1000 : baseMs;
    // 자정 경과 세션 (예: 23:30 시작 ~ 00:30 종료 시 23시간 과거 산출 방지)
    if (endMs < now.getTime() - 12 * 3600 * 1000) {
      endMs += 24 * 3600 * 1000;
    }
    return new Date(endMs);
  }

  /** 서버 보정 현재 Date 객체 */
  static getSyncedDate(): Date {
    return new Date(TimeMaster.getSyncedNowMs());
  }

  /** 대기시간 잔여 (초) 산출 (prepare_expired_epoch_ms SSOT 최우선, 볼회수/일시정지 시 카운트다운 동결) */
  static getPrepareRemainingSec(
    bay?: { prepare_remaining_sec?: number | null; prepare_expired_epoch_ms?: number | null; is_paused?: boolean } | null
  ): number {
    if (!bay) return 0;
    if (bay.is_paused && typeof bay.prepare_remaining_sec === 'number') {
      return Math.max(0, bay.prepare_remaining_sec);
    }
    if (bay.prepare_expired_epoch_ms && typeof bay.prepare_expired_epoch_ms === 'number') {
      const diffMs = bay.prepare_expired_epoch_ms - TimeMaster.getSyncedNowMs();
      return Math.max(0, Math.ceil(diffMs / 1000));
    }
    return bay.prepare_remaining_sec ?? 0;
  }

  /** 잔여 시간 산출 (실시간 end_epoch_ms 연산 최우선, 볼회수/일시정지 시 카운트다운 동결, Bay 객체 또는 endTime 문자열 모두 지원) */
  static getRemainingMinutes(
    bayOrEndTime?: { minutes_left?: number; end_time?: string | null; end_epoch_ms?: number | null; is_paused?: boolean; duration_min?: number | null } | string | null,
    now?: Date | number,
    endEpochMs?: number | null
  ): number {
    if (!bayOrEndTime && !endEpochMs) return 0;
    const capByDuration = (rem: number): number => {
      if (typeof bayOrEndTime === 'object' && bayOrEndTime !== null && typeof bayOrEndTime.duration_min === 'number' && bayOrEndTime.duration_min > 0) {
        return Math.min(bayOrEndTime.duration_min, rem);
      }
      return rem;
    };
    if (typeof bayOrEndTime === 'object' && bayOrEndTime !== null && bayOrEndTime.is_paused && typeof bayOrEndTime.minutes_left === 'number') {
      return capByDuration(Math.max(0, bayOrEndTime.minutes_left));
    }
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
      return capByDuration(Math.max(0, Math.ceil(diffMs / 1000 / 60)));
    }
    if (bayOrEndTime.end_time) {
      const endDt = TimeMaster.parseSessionEnd(bayOrEndTime.end_time, refDate);
      if (endDt) {
        const diffMs = endDt.getTime() - refNowMs;
        return capByDuration(Math.max(0, Math.ceil(diffMs / 1000 / 60)));
      }
    }
    return capByDuration(bayOrEndTime.minutes_left ?? 0);
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
        const { hours, minutes } = TimeMaster.getKstParts(d);
        return `${hours}:${minutes}`;
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
      const d = TimeMaster.parseIsoAsKstDate(trimmed);
      if (!isNaN(d.getTime())) {
        const { hours, minutes } = TimeMaster.getKstParts(d);
        return `${hours}:${minutes}`;
      }
    }

    const clean = trimmed.replace(/[^0-9]/g, '');
    if (clean.length === 4) {
      return `${clean.substring(0, 2)}:${clean.substring(2, 4)}`;
    }
    return trimmed;
  }

  /**
   * [SSOT] 타석이 실제로 빈 타석이 되기까지 남은 총 대기 분(minute) 산출
   * - 백엔드 Smart Gap Merge 결과(available_from_epoch_ms / total_wait_minutes)를 최우선 적용
   * - 로컬 폴백 시 현재 세션 잔여시간 + 병합 대기예약 합산시간(waiting_res_total_min) 반환
   */
  static getTotalWaitMinutes(
    bay?: {
      total_wait_minutes?: number | null;
      available_from_epoch_ms?: number | null;
      available_from_time?: string | null;
      waiting_res_total_min?: number | null;
      minutes_left?: number;
      end_time?: string | null;
      end_epoch_ms?: number | null;
      is_paused?: boolean;
      duration_min?: number | null;
      status_info?: Record<string, unknown> | null;
    } | null,
    now?: Date | number
  ): number {
    if (!bay) return 0;
    const refNowMs =
      now !== undefined
        ? typeof now === 'number'
          ? now
          : now.getTime()
        : TimeMaster.getSyncedNowMs();

    if (!bay.is_paused && typeof bay.available_from_epoch_ms === 'number' && bay.available_from_epoch_ms > 0) {
      const diffMs = bay.available_from_epoch_ms - refNowMs;
      return Math.max(0, Math.ceil(diffMs / (60 * 1000)));
    }

    if (typeof bay.total_wait_minutes === 'number' && bay.total_wait_minutes >= 0) {
      return Math.max(0, bay.total_wait_minutes);
    }

    const baseRem =
      typeof bay.status_info?.minutes_left === 'number'
        ? Math.max(0, bay.status_info.minutes_left)
        : TimeMaster.getRemainingMinutes(bay, now);
    const waitingTotal = Number(bay.waiting_res_total_min) || 0;
    return Math.max(0, baseRem + waitingTotal);
  }

  /**
   * [SSOT] 타석이 실제로 빈 타석이 되는 예정 시각 (HH:mm) 포맷팅
   * - 백엔드 Smart Gap Merge 결과(available_from_time / available_from_epoch_ms) 최우선 적용
   * - 로컬 폴백 시 end_epoch_ms + waiting_res_total_min 계산
   */
  static formatAvailableFromTime(
    bay?: {
      available_from_time?: string | null;
      available_from_epoch_ms?: number | null;
      waiting_res_total_min?: number | null;
      end_time?: string | null;
      end_epoch_ms?: number | null;
    } | null
  ): string {
    if (!bay) return '종료';
    if (bay.available_from_time && String(bay.available_from_time).trim()) {
      return TimeMaster.formatEndTime(bay.available_from_time, bay.available_from_epoch_ms);
    }
    if (typeof bay.available_from_epoch_ms === 'number' && bay.available_from_epoch_ms > 0) {
      return TimeMaster.formatEndTime(null, bay.available_from_epoch_ms);
    }
    const waitingTotal = Number(bay.waiting_res_total_min) || 0;
    if (waitingTotal > 0) {
      if (typeof bay.end_epoch_ms === 'number' && bay.end_epoch_ms > 0) {
        return TimeMaster.formatEndTime(null, bay.end_epoch_ms + waitingTotal * 60 * 1000);
      }
      if (bay.end_time) {
        const parsed = TimeMaster.parseSessionEnd(bay.end_time, TimeMaster.getSyncedDate());
        if (parsed) {
          return TimeMaster.formatEndTime(null, parsed.getTime() + waitingTotal * 60 * 1000);
        }
      }
    }
    return TimeMaster.formatEndTime(bay);
  }

  /** 날짜 및 시각 포맷팅 (YYYY.MM.DD HH:mm:ss — KST 고정) */
  static formatKstDateTime(d: Date = new Date(), includeSeconds: boolean = true): string {
    const { year, month, day, hours, minutes, seconds } = TimeMaster.getKstParts(d);
    const ymd = `${year}.${month}.${day}`;
    if (!includeSeconds) {
      return `${ymd} ${hours}:${minutes}`;
    }
    return `${ymd} ${hours}:${minutes}:${seconds}`;
  }

  /** 매장 마감시각까지 남은 분(minute) 산출 (24시간 영업 무제한 보장, 심야 익일 마감 06:00~05:00 및 자정 00:00 마감 정밀 구분 — KST 고정) */
  static getMinutesUntilClose(
    storeCloseTime?: string | null,
    now: Date = TimeMaster.getSyncedDate(),
    options?: { is24h?: boolean; storeOpenTime?: string | null }
  ): number {
    const FULL_DAY_AVAILABLE_MINUTES = 1440;
    if (options?.is24h === true) {
      return FULL_DAY_AVAILABLE_MINUTES;
    }
    const digitsOnly = String(storeCloseTime || '24:00').replace(/[^0-9]/g, '');
    const rawClean = digitsOnly.length === 4 ? digitsOnly : '2400';
    if (options?.is24h !== false && options?.storeOpenTime) {
      const openDigits = String(options.storeOpenTime).replace(/[^0-9]/g, '');
      if (openDigits === '0000' && rawClean === '2359') {
        return FULL_DAY_AVAILABLE_MINUTES;
      }
    }
    const cleanClose = rawClean === '0000' ? '2400' : rawClean;
    const parsedH = parseInt(cleanClose.slice(0, 2), 10);
    const parsedM = parseInt(cleanClose.slice(2, 4), 10);
    const isValidClose =
      !isNaN(parsedH) &&
      !isNaN(parsedM) &&
      parsedH >= 0 &&
      parsedH <= 24 &&
      parsedM >= 0 &&
      parsedM <= 59 &&
      !(parsedH === 24 && parsedM > 0);
    const closeH = isValidClose ? parsedH : 24;
    const closeM = isValidClose ? parsedM : 0;

    const { year, month, day, hours } = TimeMaster.getKstParts(now);
    const nowKstHour = parseInt(hours, 10);
    const isOvernightClose = closeH === 24 || closeH < 6 || (closeH === 6 && closeM === 0);
    const hh = String(closeH === 24 ? 0 : closeH).padStart(2, '0');
    const mm = String(closeM).padStart(2, '0');
    let closeEpochMs = Date.parse(`${year}-${month}-${day}T${hh}:${mm}:00+09:00`);
    if (closeH === 24 || (isOvernightClose && nowKstHour >= 6 && closeEpochMs <= now.getTime())) {
      closeEpochMs += 24 * 3600 * 1000;
    }
    return Math.floor((closeEpochMs - now.getTime()) / 60000);
  }
}

export interface BayStatusProbe {
  status?: string | null;
  is_active?: boolean | null;
}

export const isBayAvailable = (bay?: BayStatusProbe | null): boolean =>
  Boolean(bay && bay.is_active !== false && (bay.status === 'AVAILABLE' || bay.status === 'OPEN'));

export const isBayOccupied = (bay?: BayStatusProbe | null): boolean =>
  Boolean(bay && ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(String(bay.status || '').toUpperCase()));

export const isBayBlocked = (bay?: BayStatusProbe | null): boolean =>
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

