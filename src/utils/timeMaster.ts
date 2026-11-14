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
    if (typeof serverEpochMs === 'number' && Number.isFinite(serverEpochMs) && serverEpochMs > 0) {
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
    if (bay.is_paused && typeof bay.prepare_remaining_sec === 'number' && Number.isFinite(bay.prepare_remaining_sec)) {
      return Math.max(0, Math.floor(bay.prepare_remaining_sec));
    }
    if (typeof bay.prepare_expired_epoch_ms === 'number' && Number.isFinite(bay.prepare_expired_epoch_ms) && bay.prepare_expired_epoch_ms > 0) {
      const diffMs = bay.prepare_expired_epoch_ms - TimeMaster.getSyncedNowMs();
      return Math.max(0, Math.ceil(diffMs / 1000));
    }
    const rawSec = bay.prepare_remaining_sec;
    return typeof rawSec === 'number' && Number.isFinite(rawSec) ? Math.max(0, Math.floor(rawSec)) : 0;
  }

  /** 잔여 시간 산출 (실시간 end_epoch_ms 연산 최우선, 볼회수/일시정지 시 카운트다운 동결, Bay 객체 또는 endTime 문자열 모두 지원) */
  static getRemainingMinutes(
    bayOrEndTime?: { minutes_left?: number; end_time?: string | null; end_epoch_ms?: number | null; is_paused?: boolean; duration_min?: number | null } | string | null,
    now?: Date | number,
    endEpochMs?: number | null
  ): number {
    if (!bayOrEndTime && !endEpochMs) return 0;
    const capByDuration = (rem: number): number => {
      const safeRem = Number.isFinite(rem) ? Math.max(0, Math.floor(rem)) : 0;
      if (
        typeof bayOrEndTime === 'object' &&
        bayOrEndTime !== null &&
        typeof bayOrEndTime.duration_min === 'number' &&
        Number.isFinite(bayOrEndTime.duration_min) &&
        bayOrEndTime.duration_min > 0
      ) {
        return Math.min(Math.floor(bayOrEndTime.duration_min), safeRem);
      }
      return safeRem;
    };
    if (
      typeof bayOrEndTime === 'object' &&
      bayOrEndTime !== null &&
      bayOrEndTime.is_paused &&
      typeof bayOrEndTime.minutes_left === 'number' &&
      Number.isFinite(bayOrEndTime.minutes_left)
    ) {
      return capByDuration(Math.max(0, bayOrEndTime.minutes_left));
    }
    const resolvedNowMs =
      now !== undefined
        ? typeof now === 'number'
          ? now
          : now.getTime()
        : TimeMaster.getSyncedNowMs();
    const refNowMs = Number.isFinite(resolvedNowMs) ? resolvedNowMs : TimeMaster.getSyncedNowMs();
    const refDate = new Date(refNowMs);

    if (typeof bayOrEndTime === 'string' || bayOrEndTime === null || bayOrEndTime === undefined) {
      if (typeof endEpochMs === 'number' && Number.isFinite(endEpochMs) && endEpochMs > 0) {
        const diffMs = endEpochMs - refNowMs;
        return Math.max(0, Math.ceil(diffMs / (60 * 1000)));
      }
      if (typeof bayOrEndTime === 'string' && bayOrEndTime) {
        const endDt = TimeMaster.parseSessionEnd(bayOrEndTime, refDate);
        if (endDt) {
          const diffMs = endDt.getTime() - refNowMs;
          return Math.max(0, Math.ceil(diffMs / (60 * 1000)));
        }
      }
      return 0;
    }

    const epoch = endEpochMs ?? bayOrEndTime.end_epoch_ms;
    if (typeof epoch === 'number' && Number.isFinite(epoch) && epoch > 0) {
      const diffMs = epoch - refNowMs;
      return capByDuration(Math.max(0, Math.ceil(diffMs / (60 * 1000))));
    }
    if (bayOrEndTime.end_time) {
      const endDt = TimeMaster.parseSessionEnd(bayOrEndTime.end_time, refDate);
      if (endDt) {
        const diffMs = endDt.getTime() - refNowMs;
        return capByDuration(Math.max(0, Math.ceil(diffMs / (60 * 1000))));
      }
    }
    const rawLeft = bayOrEndTime.minutes_left;
    return capByDuration(typeof rawLeft === 'number' && Number.isFinite(rawLeft) ? Math.max(0, rawLeft) : 0);
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

  /**
   * 매장 당일 운영시간(open_time ~ close_time) 가용 구간 판정 (백엔드 BayFacade.preoccupy_bays & ReservationValidationService 1:1 정합)
   * - 24시간 영업(is24h 또는 00:00~23:59/24:00) 및 심야 익일 마감(예: 06:00~익일 05:00) 완벽 지원
   * - KST(UTC+9) 고정 산술로 비-KST OS 환경 오차 원천 차단
   */
  static evaluateStoreOperatingWindow(
    storeOpenTime?: string | null,
    storeCloseTime?: string | null,
    now: Date = TimeMaster.getSyncedDate(),
    options?: { is24h?: boolean }
  ): StoreOperatingWindowStatus {
    const { hours, minutes } = TimeMaster.getKstParts(now);
    const currentHhmm = `${hours}:${minutes}`;

    if (options?.is24h === true) {
      return {
        isOpen: true,
        phase: 'OPEN',
        currentHhmm,
        rangeLabel: '00:00 ~ 24:00',
      };
    }

    const parsedOpen = parseStoreHhmm(storeOpenTime);
    const parsedClose = parseStoreHhmm(storeCloseTime);
    if (!parsedOpen || !parsedClose) {
      return {
        isOpen: true,
        phase: 'OPEN',
        currentHhmm,
        rangeLabel: '00:00 ~ 24:00',
      };
    }

    const is24hPair =
      (parsedOpen.label === parsedClose.label &&
        (parsedClose.label === '24:00' || parsedClose.label === '00:00')) ||
      (parsedOpen.label === '00:00' &&
        (parsedClose.label === '23:59' ||
          parsedClose.label === '24:00' ||
          parsedClose.label === '00:00'));

    if (is24hPair) {
      return {
        isOpen: true,
        phase: 'OPEN',
        currentHhmm,
        rangeLabel: '00:00 ~ 24:00',
      };
    }

    const MINUTES_PER_HOUR = 60;
    const MINUTES_PER_DAY = 1440;
    const oMin = parsedOpen.hh === 24 ? 0 : parsedOpen.hh * MINUTES_PER_HOUR + parsedOpen.mm;
    const rawCloseMin = parsedClose.hh * MINUTES_PER_HOUR + parsedClose.mm;
    const cMin = rawCloseMin === 0 ? MINUTES_PER_DAY : rawCloseMin;
    const closeDisplay = cMin === MINUTES_PER_DAY ? '24:00' : parsedClose.label;
    const curMin = parseInt(hours, 10) * MINUTES_PER_HOUR + parseInt(minutes, 10);

    if (oMin === cMin) {
      return {
        isOpen: true,
        phase: 'OPEN',
        currentHhmm,
        rangeLabel: '00:00 ~ 24:00',
      };
    }

    if (oMin < cMin) {
      const rangeLabel = `${parsedOpen.label} ~ ${closeDisplay}`;
      if (curMin < oMin) {
        return { isOpen: false, phase: 'BEFORE_OPEN', currentHhmm, rangeLabel };
      }
      if (curMin >= cMin) {
        return { isOpen: false, phase: 'AFTER_CLOSE', currentHhmm, rangeLabel };
      }
      return { isOpen: true, phase: 'OPEN', currentHhmm, rangeLabel };
    }

    const rangeLabel = `${parsedOpen.label} ~ 익일 ${closeDisplay}`;
    if (curMin >= oMin || curMin < cMin) {
      return { isOpen: true, phase: 'OPEN', currentHhmm, rangeLabel };
    }
    return { isOpen: false, phase: 'OVERNIGHT_CLOSED', currentHhmm, rangeLabel };
  }

  /** 매장 운영시간 외 진입 차단 시 사용자 친화적 안내 모달 문구 생성 */
  static buildOperatingHoursBlockMessage(
    windowStatus: StoreOperatingWindowStatus,
    actionLabel: string,
    lang: 'KO' | 'EN' = 'KO'
  ): { title: string; message: string } {
    if (lang !== 'KO') {
      const enRange = windowStatus.rangeLabel.replace('익일 ', 'next day ');
      return {
        title: windowStatus.phase === 'AFTER_CLOSE' ? 'Store Closed for Today' : 'Outside Operating Hours',
        message: `Current time (${windowStatus.currentHhmm}) is outside store operating hours (${enRange}).`,
      };
    }

    const actionWithParticle = appendKoreanObjectParticle(actionLabel);
    if (windowStatus.phase === 'AFTER_CLOSE') {
      return {
        title: '매장 운영시간 종료 안내',
        message: `금일 매장 운영시간(${windowStatus.rangeLabel})이 종료되어 ${actionWithParticle} 진행할 수 없습니다.\n(현재 시각: ${windowStatus.currentHhmm})`,
      };
    }
    if (windowStatus.phase === 'BEFORE_OPEN') {
      return {
        title: '매장 운영시간 안내',
        message: `현재 시각(${windowStatus.currentHhmm})은 매장 오픈 전입니다.\n운영시간(${windowStatus.rangeLabel})에 ${actionWithParticle} 이용해 주세요.`,
      };
    }
    return {
      title: '매장 운영시간 안내',
      message: `현재 시각(${windowStatus.currentHhmm})은 매장 운영시간(${windowStatus.rangeLabel}) 외이므로 ${actionWithParticle} 진행할 수 없습니다.`,
    };
  }

  /**
   * [SSOT] 타석 배정(즉시 배정 vs 대기 예약) 시각·이용시간·단축여부 프리뷰 산출
   * - 백엔드 AllocatorService.find_next_available_slot & kiosk.py (total_duration = effective_duration_min + prepare_min) 1:1 정합
   * - 본 단말기 선점 상태(PRE_OCCUPIED)는 빈 타석 즉시 배정(!isBayOccupied)으로 판정하여 오판 원천 차단
   */
  static buildBayAllocationPreview(options: BayAllocationPreviewOptions): BayAllocationPreviewResult {
    return buildBayAllocationPreview(options);
  }
}

export interface BayAllocationPreviewProbe extends BayStatusProbe {
  bay_no?: number | string | null;
  floor?: string | number | null;
  floor_no?: number | string | null;
  available_from_time?: string | null;
  available_from_epoch_ms?: number | null;
  total_wait_minutes?: number | null;
  waiting_res_total_min?: number | null;
  minutes_left?: number;
  end_time?: string | null;
  end_epoch_ms?: number | null;
  is_paused?: boolean;
  duration_min?: number | null;
  max_assignable_min?: number | null;
  next_limit_res_start_time?: string | null;
}

export interface BayAllocationPreviewOptions {
  bay?: BayAllocationPreviewProbe | null;
  bays?: BayAllocationPreviewProbe[];
  bayNoFallback?: number | null;
  bayNos?: number[];
  durationMin?: number | null;
  prepareMin?: number | null;
  storeCloseTime?: string | null;
  storeOpenTime?: string | null;
  isStore24h?: boolean;
  now?: Date;
}

export interface BayAllocationPreviewResult {
  hasTargetBay: boolean;
  isGroupMode: boolean;
  isWaitlist: boolean;
  modeCode: 'INSTANT' | 'WAITLIST';
  modeBadgeText: string;
  modeActionLabel: string;
  modeSubText: string;
  waitMinutes: number;
  floorLabel: string | null;
  bayDisplayLabel: string;
  bayWithFloorLabel: string;
  startHhmm: string;
  endHhmm: string | null;
  timeRangeLabel: string;
  requestedDurationMin: number | null;
  effectiveDurationMin: number | null;
  prepareMin: number;
  isTruncated: boolean;
  truncateReason: 'NEXT_RESERVATION' | 'STORE_CLOSE' | null;
  nextLimitResStartTime: string | null;
}

export const formatBayFloorLabel = (
  bay?: { floor?: string | number | null; floor_no?: number | string | null } | null
): string | null => {
  if (!bay) return null;
  const raw = bay.floor ?? bay.floor_no;
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num === 0) return null;
    return num < 0 ? `B${Math.abs(num)}` : `${num}F`;
  }
  return trimmed.toUpperCase();
};

export const buildBayAllocationPreview = (
  options: BayAllocationPreviewOptions
): BayAllocationPreviewResult => {
  const refNow = options.now ?? TimeMaster.getSyncedDate();
  const refNowMs = refNow.getTime();
  const safePrepareMin =
    typeof options.prepareMin === 'number' && Number.isFinite(options.prepareMin) && options.prepareMin >= 0
      ? Math.floor(options.prepareMin)
      : 3;

  const groupBayNos = Array.isArray(options.bayNos)
    ? options.bayNos.filter((n) => typeof n === 'number' && Number.isFinite(n))
    : [];
  const isGroupMode = groupBayNos.length > 1;

  const resolvedBay =
    options.bay ??
    (options.bays && options.bayNoFallback != null
      ? options.bays.find((b) => Number(b.bay_no) === Number(options.bayNoFallback)) ?? null
      : null) ??
    (options.bays && groupBayNos.length > 0
      ? options.bays.find((b) => Number(b.bay_no) === Number(groupBayNos[0])) ?? null
      : null);

  const resolvedBayNo =
    resolvedBay?.bay_no !== undefined && resolvedBay?.bay_no !== null
      ? Number(resolvedBay.bay_no)
      : options.bayNoFallback ?? (groupBayNos.length > 0 ? groupBayNos[0] : null);

  const hasTargetBay = resolvedBayNo !== null || groupBayNos.length > 0;
  const floorLabel = formatBayFloorLabel(resolvedBay);

  const formatSingleBayNo = (n: number | string) => `${String(n).padStart(2, '0')}번 타석`;
  const bayDisplayLabel = isGroupMode
    ? `${groupBayNos.join('·')}번 타석 (${groupBayNos.length}석)`
    : resolvedBayNo !== null
      ? formatSingleBayNo(resolvedBayNo)
      : '선택 타석';
  const bayWithFloorLabel = floorLabel ? `${floorLabel} · ${bayDisplayLabel}` : bayDisplayLabel;

  // 대기 예약(연쇄 배정) 여부 판별: PRE_OCCUPIED(본 단말기 선점 빈 타석)는 즉시 배정으로 유지
  let isWaitlist = false;
  let waitMinutes = 0;

  if (isGroupMode && options.bays && options.bays.length > 0) {
    for (const bNo of groupBayNos) {
      const bObj = options.bays.find((b) => Number(b.bay_no) === Number(bNo));
      if (isBayOccupied(bObj)) {
        isWaitlist = true;
        waitMinutes = Math.max(waitMinutes, Math.max(1, TimeMaster.getTotalWaitMinutes(bObj, refNow)));
      }
    }
  } else if (isBayOccupied(resolvedBay)) {
    isWaitlist = true;
    waitMinutes = Math.max(1, TimeMaster.getTotalWaitMinutes(resolvedBay, refNow));
  }

  // 시작 시각(startEpochMs / startHhmm) 산출
  let startEpochMs = refNowMs;
  if (isWaitlist && resolvedBay) {
    if (
      !resolvedBay.is_paused &&
      typeof resolvedBay.available_from_epoch_ms === 'number' &&
      resolvedBay.available_from_epoch_ms > 0
    ) {
      startEpochMs = Math.max(refNowMs, resolvedBay.available_from_epoch_ms);
    } else {
      const availStr = TimeMaster.formatAvailableFromTime(resolvedBay);
      const parsedAvail = availStr && availStr !== '종료' ? TimeMaster.parseSessionEnd(availStr, refNow) : null;
      if (parsedAvail && !Number.isNaN(parsedAvail.getTime())) {
        startEpochMs = Math.max(refNowMs, parsedAvail.getTime());
      } else {
        startEpochMs = refNowMs + waitMinutes * 60 * 1000;
      }
    }
  } else if (isWaitlist && waitMinutes > 0) {
    startEpochMs = refNowMs + waitMinutes * 60 * 1000;
  }

  const startParts = TimeMaster.getKstParts(new Date(startEpochMs));
  const startHhmm = `${startParts.hours}:${startParts.minutes}`;

  // 이용 시간 및 단축(다음 예약 / 영업 마감) 산출
  const hasDuration =
    typeof options.durationMin === 'number' && Number.isFinite(options.durationMin) && options.durationMin > 0;
  const requestedDurationMin = hasDuration ? Math.floor(options.durationMin as number) : null;
  let effectiveDurationMin = requestedDurationMin;
  let isTruncated = false;
  let truncateReason: 'NEXT_RESERVATION' | 'STORE_CLOSE' | null = null;

  const bayMaxMin =
    typeof resolvedBay?.max_assignable_min === 'number' && resolvedBay.max_assignable_min > 0
      ? Math.floor(resolvedBay.max_assignable_min)
      : null;
  const nextLimitResStartTime = resolvedBay?.next_limit_res_start_time
    ? String(resolvedBay.next_limit_res_start_time)
    : null;

  if (effectiveDurationMin !== null) {
    if (bayMaxMin !== null && bayMaxMin < effectiveDurationMin) {
      effectiveDurationMin = bayMaxMin;
      isTruncated = true;
      truncateReason = 'NEXT_RESERVATION';
    }
    if (options.storeCloseTime && options.isStore24h !== true) {
      const minsUntilClose = TimeMaster.getMinutesUntilClose(
        options.storeCloseTime,
        new Date(startEpochMs),
        { is24h: options.isStore24h, storeOpenTime: options.storeOpenTime }
      );
      const closeAvailMin = Math.max(0, minsUntilClose - safePrepareMin);
      if (closeAvailMin > 0 && closeAvailMin < effectiveDurationMin) {
        effectiveDurationMin = closeAvailMin;
        isTruncated = true;
        truncateReason = 'STORE_CLOSE';
      }
    }
  }

  let endHhmm: string | null = null;
  if (effectiveDurationMin !== null && effectiveDurationMin > 0) {
    const endEpochMs = startEpochMs + (effectiveDurationMin + safePrepareMin) * 60 * 1000;
    const endParts = TimeMaster.getKstParts(new Date(endEpochMs));
    endHhmm = `${endParts.hours}:${endParts.minutes}`;
  }

  const timeRangeLabel = endHhmm
    ? `${startHhmm} ~ ${endHhmm}`
    : isWaitlist
      ? `${startHhmm} 시작 예정`
      : `지금 즉시 시작 (${startHhmm}~)`;

  const modeBadgeText = isWaitlist
    ? `⏳ 대기 예약 · 약 ${waitMinutes}분 대기`
    : '⚡ 즉시 배정 · 바로 입장';
  const modeActionLabel = isWaitlist ? '대기 예약' : '즉시 배정';
  const modeSubText = isWaitlist
    ? `현재 이용 중인 타석입니다 · 앞 타임 종료 후 ${startHhmm} 자동 시작`
    : '현재 비어 있는 타석입니다 · 배정 확정 즉시 바로 입장 가능';

  return {
    hasTargetBay,
    isGroupMode,
    isWaitlist,
    modeCode: isWaitlist ? 'WAITLIST' : 'INSTANT',
    modeBadgeText,
    modeActionLabel,
    modeSubText,
    waitMinutes,
    floorLabel,
    bayDisplayLabel,
    bayWithFloorLabel,
    startHhmm,
    endHhmm,
    timeRangeLabel,
    requestedDurationMin,
    effectiveDurationMin,
    prepareMin: safePrepareMin,
    isTruncated,
    truncateReason,
    nextLimitResStartTime,
  };
};

export interface StoreOperatingWindowStatus {
  isOpen: boolean;
  phase: 'OPEN' | 'BEFORE_OPEN' | 'AFTER_CLOSE' | 'OVERNIGHT_CLOSED';
  currentHhmm: string;
  rangeLabel: string;
}

const parseStoreHhmm = (
  raw?: string | null
): { hh: number; mm: number; label: string } | null => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  let hh = NaN;
  let mm = NaN;
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (colonMatch) {
    hh = parseInt(colonMatch[1], 10);
    mm = parseInt(colonMatch[2], 10);
  } else if (/^\d{4}$/.test(trimmed)) {
    hh = parseInt(trimmed.slice(0, 2), 10);
    mm = parseInt(trimmed.slice(2, 4), 10);
  } else {
    return null;
  }

  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 24 ||
    mm < 0 ||
    mm > 59 ||
    (hh === 24 && mm > 0)
  ) {
    return null;
  }
  return {
    hh,
    mm,
    label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
};

const appendKoreanObjectParticle = (word: string): string => {
  const trimmed = word.trim();
  if (!trimmed) return word;
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode >= 0xac00 && lastCode <= 0xd7a3) {
    const hasBatchim = (lastCode - 0xac00) % 28 !== 0;
    return `${trimmed}${hasBatchim ? '을' : '를'}`;
  }
  return `${trimmed}을(를)`;
};

export interface BayStatusProbe {
  status?: string | null;
  status_info?: { code?: string | null } | null;
  is_active?: boolean | null;
}

const resolveProbeStatus = (bay?: BayStatusProbe | null): string => {
  if (!bay) return '';
  const infoCode = typeof bay.status_info?.code === 'string' ? bay.status_info.code.trim().toUpperCase() : '';
  if (infoCode && infoCode !== 'UNKNOWN') return infoCode;
  return String(bay.status || '').trim().toUpperCase();
};

export const isBayAvailable = (bay?: BayStatusProbe | null): boolean => {
  if (!bay || bay.is_active === false) return false;
  const st = resolveProbeStatus(bay);
  return st === 'AVAILABLE' || st === 'OPEN';
};

export const isBayOccupied = (bay?: BayStatusProbe | null): boolean =>
  Boolean(bay && ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(resolveProbeStatus(bay)));

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
      ].includes(resolveProbeStatus(bay))
  );

