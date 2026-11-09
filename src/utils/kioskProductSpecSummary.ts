import type { Bay, Product } from '../services/api';
import { normalizeFloorZoneToken } from './floorUtils';
import { TimeMaster } from './timeMaster';

const FALLBACK_SESSION_MIN = 60;

const CANONICAL_EN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const CANONICAL_KR_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

const EN_TO_KR_DAY: Record<string, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

const NUM_TO_EN_DAY: Record<number, string> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
  7: 'sun',
};

const NUM_TO_KR_DAY: Record<number, string> = {
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
  7: '일',
};

const JS_WEEKDAY_TO_EN: Record<number, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

const FULL_DAY_TIME_VALUES = new Set([
  '00:00 ~ 23:59',
  '00:00 ~ 24:00',
  '00:00-23:59',
  '00:00-24:00',
  '00:00~23:59',
  '00:00~24:00',
  '종일',
  '종일 이용',
  '전 시간',
  '전 시간(종일)',
  '전 시간대',
  '전 시간대 (종일)',
  'all',
]);

const DEFAULT_ZONE_FALLBACK_LABELS: Record<string, string> = {
  PAR3: '파3',
  GOLF_PAR3: '파3',
  SCREEN: '스크린',
  ROOM: '룸타석',
  VIP: 'VIP타석',
};

export interface KioskProductSpecContext {
  /** 매장 내 전체 활성 타석 물리 층 목록 (예: ['1F', '2F']) — 전 층 모두 포함 시 층 제한 칩 자동 생략 */
  allStoreFloors?: string[];
  /** 구역/카테고리 코드(대문자) ➔ 현장 표시명 동적 매핑 */
  zoneLabelMap?: Record<string, string>;
  /** 인증된 회원이 동일 계열 활성 정기권을 보유 중인지 여부 (연쇄 연장 안내용) */
  hasActiveMembership?: boolean;
}

export interface KioskBenefitToken {
  icon: string;
  label: string;
  highlight?: string;
  suffix?: string;
}

export interface KioskRestrictionChip {
  key: 'days' | 'time' | 'daily_limit' | 'zone' | 'bundle' | 'exception_duration' | 'notice';
  icon: string;
  label: string;
  tone: 'amber' | 'slate' | 'emerald';
}

export type ResolvedKioskLogicType =
  | 'DAILY'
  | 'COUNT'
  | 'TIME'
  | 'PERIOD'
  | 'LESSON'
  | 'COMPLEX'
  | 'PAR3'
  | 'RETAIL'
  | 'RENTAL';

export interface KioskProductSpecSummary {
  resolvedLogicType: ResolvedKioskLogicType;
  headerTypeBadge: string;
  durationMin: number;
  days: number;
  totalCount: number;
  dailyLimit: number;
  /** 카드 2단 기본 제공량 1줄 토큰 */
  benefitTokens: KioskBenefitToken[];
  /** 예외 제한이 설정된 경우에만 유동적으로 채워지는 스마트 조건 칩 (기본 올패스 상품은 빈 배열 []) */
  restrictionChips: KioskRestrictionChip[];
  /** PaymentTerminal 주문 요약 바 1줄 확인 문구 */
  checkoutSummaryLine: string;
}

export interface DailyPassEligibilityOptions {
  maxAssignableMin?: number | null;
  nextLimitResStartTime?: string | null;
  selectedBay?: Bay | null;
  now?: Date;
  allStoreFloors?: string[];
  zoneLabelMap?: Record<string, string>;
  isStoreClosed?: boolean;
  storeClosedReason?: string | null;
  storeOpenTime?: string | null;
  storeCloseTime?: string | null;
  isStore24h?: boolean;
}

export interface DailyPassEligibilityResult {
  eligible: boolean;
  reasonCode: 'OK' | 'DURATION_EXCEEDED' | 'ZONE_MISMATCH' | 'SCHEDULE_MISMATCH';
  badgeLabel: string | null;
  buttonLabel: string | null;
  modalTitle: string | null;
  modalMessage: string | null;
}

function parseRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function checkIfKioskDailyProduct(prod: Product): boolean {
  const logicUpper = String(prod.logic_type || '').trim().toUpperCase();
  if (
    logicUpper === 'PERIOD' ||
    logicUpper === 'COUNT' ||
    logicUpper === 'COUPON' ||
    logicUpper === 'TIME' ||
    logicUpper === 'LESSON' ||
    logicUpper === 'COMPLEX' ||
    logicUpper === 'RENTAL' ||
    logicUpper === 'RETAIL' ||
    logicUpper === 'GOODS' ||
    logicUpper === 'FNB' ||
    logicUpper === 'ITEM' ||
    logicUpper === 'PAR3'
  ) {
    return false;
  }
  if (logicUpper === 'DAILY' || logicUpper === 'DAY' || logicUpper === 'SINGLE' || logicUpper === 'ONEDAY') {
    return true;
  }
  const isFacility = logicUpper === 'FACILITY';
  const cd = String(prod.prod_cd || '');
  const nm = String(prod.prod_nm || '');
  const isDailyCd = cd.startsWith('D') || cd.startsWith('P01') || cd.startsWith('P02');
  const isDailyName = nm.includes('일일') || nm.includes('당일');
  const hasDuration = prod.duration_min != null && prod.duration_min > 0;
  return (isFacility || isDailyCd || isDailyName) && hasDuration;
}

export function resolveKioskProductDurationMin(prod: Product): number {
  if (prod.duration_min != null && prod.duration_min > 0) return Number(prod.duration_min);
  if (prod.time_min != null && prod.time_min > 0) return Number(prod.time_min);
  const rules = parseRecord(prod.access_rules);
  const detail = parseRecord(prod.rules_detail);
  const jsonDur = Number(
    rules.duration_min ?? rules.default_assign_min ?? rules.assign_min ?? detail.duration_min ?? 0
  );
  if (jsonDur > 0) return jsonDur;
  return FALLBACK_SESSION_MIN;
}

export function normalizeTargetGenderLabel(prod: Product): { code: 'M' | 'F' | 'ALL'; label: string | null } {
  const rules = parseRecord(prod.access_rules);
  const detail = parseRecord(prod.rules_detail);
  const raw = String(
    prod.target_gender || rules.restricted_gender || rules.target_gender || detail.restricted_gender || 'ALL'
  )
    .trim()
    .toUpperCase();

  if (raw === 'F' || raw === 'FEMALE' || raw === '여' || raw === '여성' || raw === '여자') {
    return { code: 'F', label: '여성 전용' };
  }
  if (raw === 'M' || raw === 'MALE' || raw === '남' || raw === '남성' || raw === '남자') {
    return { code: 'M', label: '남성 전용' };
  }
  return { code: 'ALL', label: null };
}

function isActiveScheduleSlot(slot: unknown): boolean {
  if (!slot) return false;
  if (typeof slot === 'object' && !Array.isArray(slot)) {
    const rec = slot as Record<string, unknown>;
    if (rec.enabled === false || rec.active === false || rec.closed === true) {
      return false;
    }
    return Boolean(rec.start || rec.start_time || rec.end || rec.end_time || rec.time);
  }
  if (typeof slot === 'string') {
    const t = slot.trim().toUpperCase();
    return Boolean(t) && t !== 'CLOSED' && t !== 'OFF' && t !== 'NONE';
  }
  return Boolean(slot);
}

function padHhmmToken(rawToken: string): string {
  const parts = rawToken.trim().split(':');
  if (parts.length !== 2) return rawToken.trim();
  const hh = Number(parts[0]);
  const mm = parts[1];
  if (Number.isNaN(hh)) return rawToken.trim();
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function extractSlotRangeString(slot: unknown): string | null {
  if (!slot) return null;
  if (typeof slot === 'string') {
    const trimmed = slot.trim();
    return trimmed || null;
  }
  if (typeof slot === 'object' && !Array.isArray(slot)) {
    const rec = slot as Record<string, unknown>;
    if (rec.enabled === false || rec.active === false || rec.closed === true) {
      return null;
    }
    const s = rec.start ?? rec.start_time;
    const e = rec.end ?? rec.end_time;
    if (s && e) {
      return `${String(s).trim()}~${String(e).trim()}`;
    }
    if (typeof rec.time === 'string' && rec.time.trim()) {
      return rec.time.trim();
    }
  }
  return null;
}

function normalizeTimeRangeLabel(rawRange: string | null | undefined): string | null {
  if (!rawRange) return null;
  const trimmed = rawRange.trim();
  if (!trimmed) return null;
  if (FULL_DAY_TIME_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }

  const match = trimmed.match(/(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/);
  if (match) {
    const s = padHhmmToken(match[1]);
    const e = padHhmmToken(match[2]);
    const normalized = `${s}~${e}`;
    if (FULL_DAY_TIME_VALUES.has(normalized.toLowerCase())) {
      return null;
    }
    return normalized;
  }
  return trimmed;
}

function isHolidayClosedSetting(holidaySchedule: unknown): boolean {
  if (!holidaySchedule) return false;
  if (typeof holidaySchedule === 'string') {
    const u = holidaySchedule.trim().toUpperCase();
    return u === 'CLOSED' || u === 'NONE' || u === 'OFF' || u === '불가' || u === '휴무';
  }
  if (typeof holidaySchedule === 'object' && !Array.isArray(holidaySchedule)) {
    const rec = holidaySchedule as Record<string, unknown>;
    return rec.enabled === false || rec.active === false || rec.closed === true;
  }
  return false;
}

function isInvalidDayToken(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed === 'nan' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'none') {
    return true;
  }
  return /^-?\d+(\.\d+)?$/.test(trimmed);
}

function summarizeDayRestriction(rules: Record<string, unknown>): {
  chipLabel: string | null;
  summaryLabel: string | null;
} {
  const weeklySchedule = rules.weekly_schedule;
  const fallbackDays =
    Array.isArray(rules.days) ||
    (typeof rules.days === 'string' && !isInvalidDayToken(rules.days))
      ? rules.days
      : undefined;
  const allowedDays = rules.allowed_days ?? fallbackDays ?? rules.available_days;
  const holidaySchedule = rules.holiday_schedule;
  const holidayClosed = isHolidayClosedSetting(holidaySchedule);

  // 1. weekly_schedule 우선 해석
  if (weeklySchedule && typeof weeklySchedule === 'object' && !Array.isArray(weeklySchedule)) {
    const wsRec = weeklySchedule as Record<string, unknown>;
    const activeEn = Object.entries(wsRec)
      .filter(([, slot]) => isActiveScheduleSlot(slot))
      .map(([day]) => day.toLowerCase().trim());

    const uniqueOrdered = Array.from(new Set(activeEn)).sort((a, b) => {
      const idxA = CANONICAL_EN_DAYS.indexOf(a as (typeof CANONICAL_EN_DAYS)[number]);
      const idxB = CANONICAL_EN_DAYS.indexOf(b as (typeof CANONICAL_EN_DAYS)[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    if (uniqueOrdered.length >= 7) {
      if (holidayClosed) {
        return { chipLabel: '공휴일 제외', summaryLabel: '공휴일 제외' };
      }
      return { chipLabel: null, summaryLabel: null };
    }
    if (
      uniqueOrdered.length === 5 &&
      ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => uniqueOrdered.includes(d))
    ) {
      const label = holidayClosed ? '평일 전용(공휴일 제외)' : '평일 전용';
      const summary = holidayClosed ? '평일(월~금·공휴일 제외)' : '평일(월~금)';
      return { chipLabel: label, summaryLabel: summary };
    }
    if (uniqueOrdered.length === 2 && ['sat', 'sun'].every((d) => uniqueOrdered.includes(d))) {
      return { chipLabel: '주말 전용', summaryLabel: '주말(토·일)' };
    }
    if (uniqueOrdered.length > 0) {
      const joined = uniqueOrdered.map((d) => EN_TO_KR_DAY[d] || d).join('·');
      return { chipLabel: `${joined} 전용`, summaryLabel: `${joined}요일` };
    }
  }

  // 2. allowed_days 배열/문자열 해석
  if (Array.isArray(allowedDays) && allowedDays.length > 0) {
    const intSet = new Set<number>();
    const strList: string[] = [];

    for (const d of allowedDays) {
      const asNum = Number(d);
      if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 7) {
        intSet.add(asNum);
        strList.push(NUM_TO_KR_DAY[asNum] || String(d));
      } else {
        strList.push(String(d).toLowerCase().trim());
      }
    }

    const strSet = new Set(strList);
    const hasAll =
      intSet.size === 7 ||
      CANONICAL_EN_DAYS.every((d) => strSet.has(d)) ||
      CANONICAL_KR_DAYS.every((d) => strSet.has(d)) ||
      strSet.has('all') ||
      strSet.has('전체') ||
      strSet.has('매일');

    if (hasAll) {
      if (holidayClosed) {
        return { chipLabel: '공휴일 제외', summaryLabel: '공휴일 제외' };
      }
      return { chipLabel: null, summaryLabel: null };
    }

    const isMonFri =
      (intSet.size === 5 && [1, 2, 3, 4, 5].every((n) => intSet.has(n))) ||
      (strSet.size === 5 && ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => strSet.has(d))) ||
      (strSet.size === 5 && ['월', '화', '수', '목', '금'].every((d) => strSet.has(d))) ||
      strSet.has('weekday') ||
      strSet.has('weekdays') ||
      strSet.has('평일');

    if (isMonFri) {
      const label = holidayClosed ? '평일 전용(공휴일 제외)' : '평일 전용';
      const summary = holidayClosed ? '평일(월~금·공휴일 제외)' : '평일(월~금)';
      return { chipLabel: label, summaryLabel: summary };
    }

    const isWeekend =
      (intSet.size === 2 && [6, 7].every((n) => intSet.has(n))) ||
      (strSet.size === 2 && ['sat', 'sun'].every((d) => strSet.has(d))) ||
      (strSet.size === 2 && ['토', '일'].every((d) => strSet.has(d))) ||
      strSet.has('weekend') ||
      strSet.has('weekends') ||
      strSet.has('주말');

    if (isWeekend) {
      return { chipLabel: '주말 전용', summaryLabel: '주말(토·일)' };
    }

    const mappedKr = strList
      .map((s) => EN_TO_KR_DAY[s] || s.replace(/요일$/, ''))
      .filter((s) => s !== 'hol' && s !== 'holiday' && s !== '공휴일' && !isInvalidDayToken(s));
    const orderedKr = Array.from(new Set(mappedKr)).sort((a, b) => {
      const idxA = CANONICAL_KR_DAYS.indexOf(a as (typeof CANONICAL_KR_DAYS)[number]);
      const idxB = CANONICAL_KR_DAYS.indexOf(b as (typeof CANONICAL_KR_DAYS)[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    if (orderedKr.length > 0 && orderedKr.length < 7) {
      const joined = orderedKr.join('·');
      return { chipLabel: `${joined} 전용`, summaryLabel: `${joined}요일` };
    }
  } else if (typeof allowedDays === 'string' && allowedDays.trim()) {
    const raw = allowedDays.trim();
    const lower = raw.toLowerCase();
    if (isInvalidDayToken(raw)) {
      return holidayClosed
        ? { chipLabel: '공휴일 제외', summaryLabel: '공휴일 제외' }
        : { chipLabel: null, summaryLabel: null };
    }
    if (lower === 'all' || lower === 'everyday' || raw === '전체' || raw.includes('전요일') || raw === '매일') {
      return holidayClosed
        ? { chipLabel: '공휴일 제외', summaryLabel: '공휴일 제외' }
        : { chipLabel: null, summaryLabel: null };
    }
    if (lower === 'weekday' || lower === 'weekdays' || raw === '평일') {
      return {
        chipLabel: holidayClosed ? '평일 전용(공휴일 제외)' : '평일 전용',
        summaryLabel: holidayClosed ? '평일(월~금·공휴일 제외)' : '평일(월~금)',
      };
    }
    if (lower === 'weekend' || lower === 'weekends' || raw === '주말') {
      return { chipLabel: '주말 전용', summaryLabel: '주말(토·일)' };
    }
    return { chipLabel: raw, summaryLabel: raw };
  }

  if (holidayClosed) {
    return { chipLabel: '공휴일 제외', summaryLabel: '공휴일 제외' };
  }

  return { chipLabel: null, summaryLabel: null };
}

function summarizeTimeRestriction(
  rules: Record<string, unknown>,
  metaObj: Record<string, unknown>,
  scheduleNotice?: string | null
): string | null {
  const timeObj = rules.time;
  if (timeObj && typeof timeObj === 'object' && !Array.isArray(timeObj)) {
    const timeRec = timeObj as Record<string, unknown>;
    const s = timeRec.start ?? timeRec.start_time;
    const e = timeRec.end ?? timeRec.end_time;
    if (s && e) {
      const norm = normalizeTimeRangeLabel(`${String(s)}~${String(e)}`);
      if (norm) return norm;
    }
  }

  const timeSlots = rules.time_slots ?? rules.allowed_time_slots;
  if (typeof timeSlots === 'string' && timeSlots.trim()) {
    const norm = normalizeTimeRangeLabel(timeSlots);
    if (norm) return norm;
  } else if (Array.isArray(timeSlots) && timeSlots.length > 0) {
    const slotLabels = timeSlots
      .map((sl) => normalizeTimeRangeLabel(extractSlotRangeString(sl)))
      .filter((v): v is string => Boolean(v));
    if (slotLabels.length > 0) {
      return Array.from(new Set(slotLabels)).join(', ');
    }
  } else if (timeSlots && typeof timeSlots === 'object' && !Array.isArray(timeSlots)) {
    const slotRec = parseRecord(timeSlots);
    const wk = normalizeTimeRangeLabel(extractSlotRangeString(slotRec.weekday));
    const we = normalizeTimeRangeLabel(extractSlotRangeString(slotRec.weekend));
    if (wk && we) {
      return wk === we ? wk : `평일 ${wk} · 주말 ${we}`;
    }
    if (wk || we) return wk || we;
  }

  const availStart = rules.available_start_time ?? rules.start_time;
  const availEnd = rules.available_end_time ?? rules.end_time;
  if (availStart && availEnd) {
    const norm = normalizeTimeRangeLabel(`${String(availStart)}~${String(availEnd)}`);
    if (norm) return norm;
  }

  const weeklySchedule = rules.weekly_schedule;
  if (weeklySchedule && typeof weeklySchedule === 'object' && !Array.isArray(weeklySchedule)) {
    const ranges = Object.values(weeklySchedule as Record<string, unknown>)
      .map((slot) => normalizeTimeRangeLabel(extractSlotRangeString(slot)))
      .filter((v): v is string => Boolean(v));
    if (ranges.length > 0) {
      const uniqueRanges = Array.from(new Set(ranges));
      return uniqueRanges.length === 1 ? uniqueRanges[0] : '요일별 시간상이';
    }
  }

  const descCandidate =
    rules.time_range_desc ??
    rules.usable_time ??
    rules.time_range ??
    rules.schedule_desc ??
    metaObj.usable_time ??
    metaObj.time_range ??
    scheduleNotice;
  if (typeof descCandidate === 'string' && descCandidate.trim()) {
    const norm = normalizeTimeRangeLabel(descCandidate);
    if (norm) return norm;
  }

  return null;
}

function mergeProductZoneLabelMap(
  prod: Product,
  contextMap?: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = {};
  if (prod.zone_labels && typeof prod.zone_labels === 'object') {
    for (const [k, v] of Object.entries(prod.zone_labels)) {
      if (k && v) {
        merged[String(k).trim().toUpperCase()] = String(v).trim();
      }
    }
  }
  if (contextMap) {
    for (const [k, v] of Object.entries(contextMap)) {
      if (k && v) {
        merged[String(k).trim().toUpperCase()] = String(v).trim();
      }
    }
  }
  return merged;
}

interface ExceptionScheduleEntry {
  duration_min?: number | string | null;
  days?: unknown[];
  start_time?: string | null;
  end_time?: string | null;
}

function summarizeExceptionScheduleBonus(
  rules: Record<string, unknown>,
  baseDurationMin: number
): string | null {
  const exList = Array.isArray(rules.exception_schedule)
    ? (rules.exception_schedule as ExceptionScheduleEntry[])
    : [];
  if (exList.length === 0) return null;

  const diffRules = exList.filter((ex) => {
    const dur = Number(ex?.duration_min ?? 0);
    return dur > 0 && dur !== baseDurationMin;
  });
  if (diffRules.length === 0) return null;

  if (diffRules.length === 1) {
    const first = diffRules[0];
    const dur = Number(first.duration_min);
    const rawDays = Array.isArray(first.days)
      ? first.days.map((d: unknown) => String(d).toLowerCase().trim())
      : [];
    const daySet = new Set(rawDays);
    let dayPrefix = '';
    if (daySet.size === 5 && ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => daySet.has(d))) {
      dayPrefix = '평일 ';
    } else if (daySet.size === 2 && ['sat', 'sun'].every((d) => daySet.has(d))) {
      dayPrefix = '주말 ';
    } else if (daySet.size > 0 && daySet.size < 7) {
      dayPrefix = `${rawDays.map((d: string) => EN_TO_KR_DAY[d] || d).join('·')} `;
    }
    const normRange = normalizeTimeRangeLabel(
      first.start_time && first.end_time ? `${String(first.start_time)}~${String(first.end_time)}` : null
    );
    return `${dayPrefix}${normRange ? `${normRange} ` : ''}${dur}분 배정`.trim();
  }

  return '시간대별 배정시간 우대';
}

function summarizeZoneRestriction(
  prod: Product,
  rules: Record<string, unknown>,
  skipZoneSummary: boolean,
  context?: KioskProductSpecContext
): { chipLabel: string | null; summaryLabel: string | null } {
  if (skipZoneSummary) {
    return { chipLabel: null, summaryLabel: null };
  }

  const zoneLabelMap = mergeProductZoneLabelMap(prod, context?.zoneLabelMap);
  const allStoreFloorsUpper = new Set(
    (context?.allStoreFloors ?? [])
      .map((f) => String(f).trim().toUpperCase())
      .filter(Boolean)
  );

  const labels: string[] = [];

  // 1. 물리 층 / 세부 타석 구역 (allowed_zones)
  const rawZones = Array.isArray(rules.allowed_zones) ? rules.allowed_zones : [];
  const cleanedZones = rawZones
    .map((z) => String(z).trim())
    .filter((z) => {
      const u = z.toUpperCase();
      return Boolean(z) && u !== 'ALL' && u !== '전체' && u !== 'BAY' && u !== 'BAT' && u !== 'TEEBOX' && u !== 'GENERAL' && u !== 'MAIN';
    });

  if (cleanedZones.length > 0) {
    const selectedUpperSet = new Set(cleanedZones.map((z) => z.toUpperCase()));
    const coversAllFloors =
      allStoreFloorsUpper.size > 0 &&
      Array.from(allStoreFloorsUpper).every((f) => selectedUpperSet.has(f));

    if (!coversAllFloors) {
      for (const z of cleanedZones) {
        const u = z.toUpperCase();
        const resolved = zoneLabelMap[u] || DEFAULT_ZONE_FALLBACK_LABELS[u] || z;
        if (!labels.includes(resolved)) {
          labels.push(resolved);
        }
      }
    }
  }

  // 2. 특수 스케줄러 카테고리 (파3, 룸, 스크린 등 — 기본값 BAY/BAT/타석 생략)
  const rawCats = Array.isArray(rules.allowed_scheduler_categories)
    ? rules.allowed_scheduler_categories
    : Array.isArray(rules.allowed_categories)
      ? rules.allowed_categories
      : [];

  for (const c of rawCats) {
    const cTrim = String(c).trim();
    const u = cTrim.toUpperCase();
    if (!cTrim || u === 'BAY' || u === 'BAT' || u === 'TEEBOX' || u === 'ALL' || u === 'GENERAL' || u === 'MAIN' || cTrim === '타석') {
      continue;
    }
    const resolved = zoneLabelMap[u] || DEFAULT_ZONE_FALLBACK_LABELS[u] || cTrim;
    if (resolved !== '타석' && !labels.includes(resolved)) {
      labels.push(resolved);
    }
  }

  if (labels.length === 0) {
    return { chipLabel: null, summaryLabel: null };
  }

  if (labels.length === 1) {
    const item = labels[0];
    const withSuffix = item.endsWith('전용') ? item : `${item} 전용`;
    return { chipLabel: withSuffix, summaryLabel: withSuffix };
  }

  if (labels.length <= 2) {
    const joined = `${labels.join('·')} 전용`;
    return { chipLabel: joined, summaryLabel: joined };
  }

  return {
    chipLabel: `${labels[0]} 외 ${labels.length - 1}곳 전용`,
    summaryLabel: `${labels.join('·')} 전용`,
  };
}

/**
 * 키오스크 판매 매대(ProductShop) 및 결제 확인창(PaymentTerminal)에서 공유하는
 * Exception-Only(필요한 조건만 유동적 표출) 상품 스펙·제한 조건 요약 빌더
 */
export function buildKioskProductSpecSummary(
  prod: Product,
  context?: KioskProductSpecContext
): KioskProductSpecSummary {
  const rules = parseRecord(prod.access_rules);
  const detail = parseRecord(prod.rules_detail);
  const metaObj = parseRecord(prod.meta_data);

  const isDaily = checkIfKioskDailyProduct(prod);
  const rawLogic = String(prod.logic_type || '').trim().toUpperCase();
  const toNonNegativeInt = (raw: unknown): number => {
    const num = Number(raw ?? 0);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
  };
  const durationMin = resolveKioskProductDurationMin(prod);
  const totalCount = toNonNegativeInt(prod.total_count ?? rules.total_count ?? detail.total_count ?? 0);
  const days = toNonNegativeInt(prod.days ?? rules.days ?? detail.days ?? 0);
  const dailyLimit = toNonNegativeInt(rules.daily_limit_count ?? rules.daily_limit ?? detail.daily_limit ?? 0);

  let resolvedLogicType: ResolvedKioskLogicType = 'PERIOD';
  if (rawLogic === 'RENTAL' || rawLogic === 'LOCKER') {
    resolvedLogicType = 'RENTAL';
  } else if (rawLogic === 'RETAIL' || rawLogic === 'GOODS' || rawLogic === 'FNB' || rawLogic === 'ITEM' || rawLogic === 'PRODUCT') {
    resolvedLogicType = 'RETAIL';
  } else if (rawLogic === 'COMPLEX' || Boolean(metaObj.is_bundle) || (Array.isArray(prod.bundle_summary) && prod.bundle_summary.length > 0)) {
    resolvedLogicType = 'COMPLEX';
  } else if (rawLogic === 'LESSON') {
    resolvedLogicType = 'LESSON';
  } else if (rawLogic === 'TIME') {
    resolvedLogicType = 'TIME';
  } else if (rawLogic === 'PAR3' && totalCount === 0 && days === 0) {
    resolvedLogicType = 'PAR3';
  } else if (isDaily) {
    resolvedLogicType = 'DAILY';
  } else if (rawLogic === 'COUNT' || rawLogic === 'COUPON' || totalCount > 0) {
    resolvedLogicType = 'COUNT';
  } else {
    resolvedLogicType = 'PERIOD';
  }

  const headerTypeBadge =
    resolvedLogicType === 'DAILY'
      ? 'DAILY PASS'
      : resolvedLogicType === 'COUNT'
        ? 'COUNT PASS'
        : resolvedLogicType === 'TIME'
          ? 'TIME PASS'
          : resolvedLogicType === 'LESSON'
            ? 'PRO LESSON'
            : resolvedLogicType === 'COMPLEX'
              ? 'PACKAGE PASS'
              : resolvedLogicType === 'PAR3'
                ? 'PAR3 PASS'
                : resolvedLogicType === 'RETAIL'
                  ? 'STORE ITEM'
                  : resolvedLogicType === 'RENTAL'
                    ? 'LOCKER PASS'
                    : 'VIP MEMBERSHIP';

  const skipZoneSummary = resolvedLogicType === 'RENTAL' || resolvedLogicType === 'RETAIL';
  const dayInfo = summarizeDayRestriction(rules);
  const timeLabel = summarizeTimeRestriction(rules, metaObj, prod.schedule_notice);
  const zoneInfo = summarizeZoneRestriction(prod, rules, skipZoneSummary, context);
  const exceptionDurationLabel = summarizeExceptionScheduleBonus(rules, durationMin);
  const genderInfo = normalizeTargetGenderLabel(prod);
  const bundleItems = Array.isArray(prod.bundle_summary)
    ? prod.bundle_summary.map((s) => String(s).trim()).filter(Boolean)
    : [];

  // 1. 유동적 예외 제한 칩(Exception-Only): 기본값(매일·종일·전타석)이면 0개 반환
  const restrictionChips: KioskRestrictionChip[] = [];

  if (bundleItems.length > 0) {
    const bundleText =
      bundleItems.length <= 2
        ? `구성: ${bundleItems.join(' + ')}`
        : `구성: ${bundleItems[0]} + ${bundleItems[1]} 외 ${bundleItems.length - 2}종`;
    restrictionChips.push({
      key: 'bundle',
      icon: '📦',
      label: bundleText,
      tone: 'emerald',
    });
  }

  if (exceptionDurationLabel) {
    restrictionChips.push({
      key: 'exception_duration',
      icon: '✨',
      label: exceptionDurationLabel,
      tone: 'emerald',
    });
  }

  if (dayInfo.chipLabel) {
    restrictionChips.push({
      key: 'days',
      icon: '📆',
      label: dayInfo.chipLabel,
      tone: 'amber',
    });
  }

  if (timeLabel) {
    restrictionChips.push({
      key: 'time',
      icon: '⏰',
      label: timeLabel,
      tone: 'amber',
    });
  }

  if (
    dailyLimit > 0 &&
    resolvedLogicType !== 'DAILY' &&
    resolvedLogicType !== 'RENTAL' &&
    resolvedLogicType !== 'RETAIL'
  ) {
    restrictionChips.push({
      key: 'daily_limit',
      icon: '🔄',
      label: `1일 ${dailyLimit}회 제한`,
      tone: 'slate',
    });
  }

  if (zoneInfo.chipLabel) {
    restrictionChips.push({
      key: 'zone',
      icon: '📍',
      label: zoneInfo.chipLabel,
      tone: 'slate',
    });
  }

  // 2. 카드 본체 1열 핵심 제공량 토큰 (허위 '무제한' 제거)
  const benefitTokens: KioskBenefitToken[] = [];
  const hasAnyUsageRestriction = Boolean(dayInfo.chipLabel || timeLabel || dailyLimit > 0 || zoneInfo.chipLabel);

  if (resolvedLogicType === 'TIME') {
    const totalMinutes = totalCount > 0 ? totalCount : durationMin;
    benefitTokens.push({ icon: '⏱️', label: '총 ', highlight: `${totalMinutes}분`, suffix: ' 제공' });
    benefitTokens.push({ icon: '📅', label: days > 0 ? `유효기간 ${days}일` : '시간 차감형' });
    benefitTokens.push({ icon: '⛳', label: `1회 ${durationMin}분` });
  } else if (resolvedLogicType === 'COUNT') {
    benefitTokens.push({ icon: '🎫', label: '총 ', highlight: `${totalCount}회`, suffix: ' 제공' });
    benefitTokens.push({ icon: '📅', label: days > 0 ? `유효기간 ${days}일` : '횟수 차감형' });
    benefitTokens.push({ icon: '⏱️', label: `1회 ${durationMin}분` });
  } else if (resolvedLogicType === 'LESSON') {
    if (totalCount > 0) {
      benefitTokens.push({ icon: '🎓', label: '레슨 ', highlight: `${totalCount}회` });
    } else if (days > 0) {
      benefitTokens.push({ icon: '🎓', label: '레슨 ', highlight: `${days}일` });
    } else {
      benefitTokens.push({ icon: '🎓', label: '전문 프로 레슨' });
    }
    benefitTokens.push({ icon: '📅', label: days > 0 ? `유효기간 ${days}일` : '일정 협의' });
    benefitTokens.push({ icon: '⏱️', label: `회당 ${durationMin}분` });
  } else if (resolvedLogicType === 'COMPLEX') {
    if (days > 0) {
      benefitTokens.push({ icon: '📅', label: '유효기간 ', highlight: `${days}일` });
    }
    if (totalCount > 0) {
      benefitTokens.push({ icon: '🎫', label: '총 ', highlight: `${totalCount}회` });
    }
    if (benefitTokens.length === 0) {
      benefitTokens.push({ icon: '📦', label: '복합 멤버십 패키지' });
    }
    benefitTokens.push({ icon: '⏱️', label: `1회 ${durationMin}분` });
  } else if (resolvedLogicType === 'PAR3') {
    benefitTokens.push({ icon: '⛳', label: '파3 라운딩 이용권' });
    benefitTokens.push({ icon: '⏱️', label: `회당 ${durationMin}분` });
  } else if (resolvedLogicType === 'RETAIL') {
    benefitTokens.push({ icon: '🛍️', label: '매장 현장 구매 상품' });
  } else if (resolvedLogicType === 'RENTAL') {
    benefitTokens.push({ icon: '🔑', label: '대여기간 ', highlight: `${days > 0 ? days : 30}일` });
    benefitTokens.push({ icon: '📅', label: '기간 연장 전용' });
  } else if (resolvedLogicType === 'DAILY') {
    benefitTokens.push({ icon: '⛳', label: '당일 1회 즉시 배정' });
    benefitTokens.push({ icon: '⏱️', label: '', highlight: `${durationMin}분`, suffix: ' 이용' });
    if (!hasAnyUsageRestriction) {
      benefitTokens.push({ icon: '⚡', label: '결제 즉시 가동' });
    }
  } else {
    // PERIOD (정기 회원권)
    benefitTokens.push({
      icon: '📅',
      label: days > 0 ? '유효기간 ' : '정기 ',
      highlight: days > 0 ? `${days}일` : '회원권',
    });
    benefitTokens.push({
      icon: '⏱️',
      label: `1회 ${durationMin}분`,
    });
    if (!hasAnyUsageRestriction) {
      benefitTokens.push({
        icon: context?.hasActiveMembership ? '🔗' : '♾️',
        label: context?.hasActiveMembership ? '만료일 이후 연장 가능' : '전일·종일 자유 이용',
      });
    } else if (context?.hasActiveMembership) {
      benefitTokens.push({
        icon: '🔗',
        label: '만료일 이후 연장 가능',
      });
    }
  }

  // 3. PaymentTerminal 결제 직전 1줄 요약 문자열 (기본 스펙 + 실제 설정된 제한 항목만 유동 조합)
  const summaryParts: string[] = [];
  if (resolvedLogicType === 'DAILY') {
    summaryParts.push('당일 1회 즉시 배정');
    summaryParts.push(`${durationMin}분 이용`);
  } else if (resolvedLogicType === 'TIME') {
    const totalMinutes = totalCount > 0 ? totalCount : durationMin;
    summaryParts.push(`총 ${totalMinutes}분`);
    if (days > 0) summaryParts.push(`유효기간 ${days}일`);
    summaryParts.push(`1회 ${durationMin}분`);
  } else if (resolvedLogicType === 'COUNT') {
    if (totalCount > 0) summaryParts.push(`총 ${totalCount}회`);
    if (days > 0) summaryParts.push(`유효기간 ${days}일`);
    summaryParts.push(`1회 ${durationMin}분`);
  } else if (resolvedLogicType === 'LESSON') {
    if (totalCount > 0) summaryParts.push(`레슨 ${totalCount}회`);
    if (days > 0) summaryParts.push(`유효기간 ${days}일`);
    summaryParts.push(`회당 ${durationMin}분`);
  } else if (resolvedLogicType === 'PAR3') {
    summaryParts.push('파3 라운딩');
    summaryParts.push(`회당 ${durationMin}분`);
  } else if (resolvedLogicType === 'RETAIL') {
    summaryParts.push('매장 현장 구매 상품');
  } else if (resolvedLogicType === 'RENTAL') {
    summaryParts.push(`라카 연장`);
    if (days > 0) summaryParts.push(`${days}일`);
  } else if (resolvedLogicType === 'COMPLEX') {
    if (bundleItems.length > 0) {
      summaryParts.push(bundleItems.join(' + '));
    } else {
      summaryParts.push('복합 패키지');
    }
    if (days > 0) summaryParts.push(`유효기간 ${days}일`);
  } else {
    if (days > 0) summaryParts.push(`유효기간 ${days}일`);
    summaryParts.push(`1회 ${durationMin}분`);
  }

  if (exceptionDurationLabel) {
    summaryParts.push(exceptionDurationLabel);
  }
  if (genderInfo.label) {
    summaryParts.push(genderInfo.label);
  }
  if (dayInfo.summaryLabel) {
    summaryParts.push(dayInfo.summaryLabel);
  }
  if (timeLabel) {
    summaryParts.push(timeLabel);
  }
  if (
    dailyLimit > 0 &&
    resolvedLogicType !== 'DAILY' &&
    resolvedLogicType !== 'RENTAL' &&
    resolvedLogicType !== 'RETAIL'
  ) {
    summaryParts.push(`1일 ${dailyLimit}회 제한`);
  }
  if (zoneInfo.summaryLabel) {
    summaryParts.push(zoneInfo.summaryLabel);
  }

  return {
    resolvedLogicType,
    headerTypeBadge,
    durationMin,
    days,
    totalCount,
    dailyLimit,
    benefitTokens,
    restrictionChips,
    checkoutSummaryLine: summaryParts.join(' · '),
  };
}

function getKstDayAndHhmm(now: Date): {
  curYmd: string;
  curEn: string;
  curKr: string;
  curHhmm: string;
  isWeekendDay: boolean;
} {
  const kstFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = kstFormatter.formatToParts(now);
  const yearStr = parts.find((p) => p.type === 'year')?.value || '2026';
  const monthStr = (parts.find((p) => p.type === 'month')?.value || '01').padStart(2, '0');
  const dayStr = (parts.find((p) => p.type === 'day')?.value || '01').padStart(2, '0');
  const wkShort = (parts.find((p) => p.type === 'weekday')?.value || '').toLowerCase().slice(0, 3);
  const hourStr = parts.find((p) => p.type === 'hour')?.value || '00';
  const minStr = parts.find((p) => p.type === 'minute')?.value || '00';
  const normalizedHour = hourStr === '24' ? '00' : hourStr.padStart(2, '0');
  const curEn = EN_TO_KR_DAY[wkShort] ? wkShort : JS_WEEKDAY_TO_EN[now.getDay()] || 'mon';
  const curKr = EN_TO_KR_DAY[curEn] || '월';
  return {
    curYmd: `${yearStr}${monthStr}${dayStr}`,
    curEn,
    curKr,
    curHhmm: `${normalizedHour}:${minStr.padStart(2, '0')}`,
    isWeekendDay: curEn === 'sat' || curEn === 'sun',
  };
}

function checkHhmmInSlotRange(curHhmm: string, rawSlot: unknown): { matched: boolean; rangeLabel: string } | null {
  if (rawSlot && typeof rawSlot === 'object' && !Array.isArray(rawSlot)) {
    const rec = rawSlot as Record<string, unknown>;
    if (rec.enabled === false || rec.active === false || rec.closed === true) {
      return { matched: false, rangeLabel: '이용 불가 요일' };
    }
  }
  const extracted = extractSlotRangeString(rawSlot);
  if (!extracted) return null;
  const m = extracted.match(/(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const s = padHhmmToken(m[1]);
  const e = padHhmmToken(m[2]);
  const label = `${s}~${e}`;
  if (s === '00:00' && (e === '23:59' || e === '24:00')) {
    return { matched: true, rangeLabel: label };
  }
  const matched = s <= e ? curHhmm >= s && curHhmm <= e : curHhmm >= s || curHhmm <= e;
  return { matched, rangeLabel: label };
}

function checkBayZoneCompatibility(
  prod: Product,
  selectedBay: Bay,
  zoneLabelMap?: Record<string, string>
): { ok: boolean; requiredLabel: string | null } {
  const rules = parseRecord(prod.access_rules);
  const allowedCats = (
    Array.isArray(rules.allowed_scheduler_categories)
      ? rules.allowed_scheduler_categories
      : Array.isArray(rules.allowed_categories)
        ? rules.allowed_categories
        : []
  )
    .map((x: unknown) => String(x || '').trim().toUpperCase())
    .filter(Boolean);

  const allowedZones = (Array.isArray(rules.allowed_zones) ? rules.allowed_zones : [])
    .map((x: unknown) => String(x || '').trim().toUpperCase())
    .filter(Boolean);

  const rawAllowed = [...allowedCats, ...allowedZones];
  if (rawAllowed.length === 0) {
    return { ok: true, requiredLabel: null };
  }

  const labelMap = mergeProductZoneLabelMap(prod, zoneLabelMap);
  const formatRequired = (codes: string[]) => {
    const cleaned = codes.filter((c) => !['ALL', 'GENERAL', 'BAY', 'BAT', 'TEEBOX', 'MAIN', '전체'].includes(c));
    if (cleaned.length === 0) return '지정 구역';
    return cleaned.map((c) => labelMap[c] || DEFAULT_ZONE_FALLBACK_LABELS[c] || c).join('·');
  };

  const bayFloor =
    normalizeFloorZoneToken(selectedBay.floor ?? selectedBay.floor_no) ||
    (selectedBay.floor ? String(selectedBay.floor).trim().toUpperCase() : '');
  const bayZone = String(selectedBay.zone_code || 'BAY').trim().toUpperCase();

  // 1. 물리 층 제한 검증 (ReservationValidationService.validate_access_rules step 0 정합 — B1/B1F/-1 정규화 포함)
  if (bayFloor && allowedZones.length > 0) {
    const floorLikeZones = allowedZones.filter((az) => Boolean(normalizeFloorZoneToken(az)));
    const normalizedAllowedFloors = floorLikeZones.map((az) => normalizeFloorZoneToken(az));
    const hasWildcardZone = allowedZones.some((a) => ['ALL', 'GENERAL', 'BAY', 'BAT', 'TEEBOX', '전체'].includes(a));
    if (floorLikeZones.length > 0 && !hasWildcardZone && !normalizedAllowedFloors.includes(bayFloor)) {
      return { ok: false, requiredLabel: formatRequired(floorLikeZones) };
    }
  }

  // 2. 타석 zone_code 검증 (step 1 정합)
  if (bayZone && !['', 'BAY', 'BAT', 'TEEBOX', 'GENERAL', 'ALL', 'MAIN'].includes(bayZone) && allowedZones.length > 0) {
    const hasWildcardZone = allowedZones.some((a) => ['ALL', 'GENERAL', 'BAY', 'BAT', 'TEEBOX', '전체'].includes(a));
    if (!hasWildcardZone && !allowedZones.includes(bayZone)) {
      return { ok: false, requiredLabel: formatRequired(allowedZones) };
    }
  }

  // 3. 스케줄러 카테고리 검증 (step 2 정합)
  if (allowedCats.length > 0) {
    const targetCat = bayZone || 'BAY';
    const isCatAllowed =
      rawAllowed.includes(targetCat) ||
      rawAllowed.some((a) => a === 'ALL' || a === 'GENERAL' || a === '전체') ||
      (['BAY', 'BAT', 'TEEBOX', 'MAIN'].includes(targetCat) &&
        rawAllowed.some((a) => ['BAY', 'BAT', 'TEEBOX', 'MAIN', '타석'].includes(a)));
    if (!isCatAllowed) {
      return { ok: false, requiredLabel: formatRequired(allowedCats) };
    }
  }

  return { ok: true, requiredLabel: null };
}

/**
 * 일일 타석권 즉시 배정(ALLOCATE_DAILY / SELECT_DAILY_PASS / 동반자 일일권 매칭) 시
 * ① 다음 예약까지 남은 시간 초과, ② 선택 타석 층/구역 불일치, ③ 현재 요일·공휴일·시간대 불일치를 판정합니다.
 * ※ 정기권·쿠폰권 사전 구매(PURCHASE_PRODUCT)에는 호출하지 않으며, 사전 구매는 항상 허용됩니다.
 */
export function evaluateDailyPassEligibility(
  prod: Product,
  options: DailyPassEligibilityOptions = {}
): DailyPassEligibilityResult {
  const durationMin = resolveKioskProductDurationMin(prod);
  const { maxAssignableMin, nextLimitResStartTime, selectedBay, zoneLabelMap } = options;

  // 1순위: 다음 예약까지 남은 최대 배정 가능 시간(maxAssignableMin) 초과 검증 (기존 G05 규약 100% 보존)
  if (typeof maxAssignableMin === 'number' && maxAssignableMin > 0 && durationMin > maxAssignableMin) {
    const nextResLabel = nextLimitResStartTime || '예정';
    return {
      eligible: false,
      reasonCode: 'DURATION_EXCEEDED',
      badgeLabel: `⚠️ 최대 ${maxAssignableMin}분 가능 (초과)`,
      buttonLabel: `다음 예약(${nextResLabel})으로 선택 불가 (최대 ${maxAssignableMin}분)`,
      modalTitle: '이용 시간 초과 상품 안내',
      modalMessage: `선택하신 타석은 다음 예약(${nextResLabel})으로 인해 최대 [${maxAssignableMin}분]까지만 이용 가능합니다.\n\n${durationMin}분 상품을 이용하시려면 우측 상단 [×] 닫기 버튼을 눌러 다른 타석을 선택해 주세요.`,
    };
  }

  // 2순위: 선택한 타석의 물리 층(floor) / 구역(zone_code) 호환성 검증
  if (selectedBay) {
    const zoneCheck = checkBayZoneCompatibility(prod, selectedBay, zoneLabelMap);
    if (!zoneCheck.ok) {
      const reqZone = zoneCheck.requiredLabel || '지정 구역';
      return {
        eligible: false,
        reasonCode: 'ZONE_MISMATCH',
        badgeLabel: `📍 ${reqZone} 전용`,
        buttonLabel: `선택 타석 이용 불가 (${reqZone} 전용)`,
        modalTitle: '타석 구역 제한 상품 안내',
        modalMessage: `선택하신 상품은 [${reqZone} 전용] 상품으로 현재 선택하신 ${selectedBay.bay_no}번 타석에서는 이용할 수 없습니다.\n\n다른 상품을 선택하시거나 타석을 변경해 주세요.`,
      };
    }
  }

  // 3순위: 현재 KST 요일 · 공휴일(today_day_type) · 시간대 적합성 검증
  const rules = parseRecord(prod.access_rules);
  const metaObj = parseRecord(prod.meta_data);
  const timeSummary = summarizeTimeRestriction(rules, metaObj, prod.schedule_notice);
  const daySummary = summarizeDayRestriction(rules);
  const nowDate = options.now ?? TimeMaster.getSyncedDate();
  const { curYmd, curEn, curKr, curHhmm, isWeekendDay } = getKstDayAndHhmm(nowDate);
  const rawEvalYmd = String(prod.evaluated_ymd || '').replace(/\D/g, '');
  const isSameEvaluatedDay = !rawEvalYmd || rawEvalYmd === curYmd;

  // 3-0. 실시간 매장 휴무일(WS settings_updated / getStoreInfo) 및 매장 영업시간 검증
  const effectiveDayType = String(
    (isSameEvaluatedDay ? prod.today_day_type : null) || (isWeekendDay ? 'WEEKEND' : 'WEEKDAY')
  ).toUpperCase();

  if (options.isStoreClosed === true || effectiveDayType === 'STORE_CLOSED') {
    const reasonText = options.storeClosedReason ? ` (${options.storeClosedReason})` : '';
    return {
      eligible: false,
      reasonCode: 'SCHEDULE_MISMATCH',
      badgeLabel: '⏰ 매장 휴무일',
      buttonLabel: '매장 휴무일로 선택 불가',
      modalTitle: '매장 휴무일 안내',
      modalMessage: `오늘은 매장 휴무일${reasonText}로 일일 타석권을 배정할 수 없습니다.`,
    };
  }

  if (options.isStore24h !== true && options.storeOpenTime && options.storeCloseTime) {
    const normOpen = padHhmmToken(options.storeOpenTime);
    const rawClose = padHhmmToken(options.storeCloseTime);
    const normClose = rawClose === '00:00' && normOpen !== '00:00' ? '24:00' : rawClose;
    const storeHoursCheck = checkHhmmInSlotRange(curHhmm, `${normOpen}-${normClose}`);
    if (storeHoursCheck && !storeHoursCheck.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 영업시간 외 (${storeHoursCheck.rangeLabel})`,
        buttonLabel: `매장 영업시간 외 (${storeHoursCheck.rangeLabel})`,
        modalTitle: '매장 영업시간 안내',
        modalMessage: `현재 매장 영업시간(${storeHoursCheck.rangeLabel})이 아니므로 일일 타석권을 즉시 배정할 수 없습니다.`,
      };
    }
  }

  // 3-A. 백엔드 실시간 공휴일/시간대 판정이 당일 기준 명시적 불가(false)이고, 커스텀 시각 오버라이드가 없는 경우 우선 반영
  if (prod.is_usable_now === false && !options.now && isSameEvaluatedDay) {
    const reasonDetail = prod.unusable_now_reason || '현재 요일 또는 시간대에는 이용할 수 없는 상품입니다.';
    const compactCondition = timeSummary || daySummary.chipLabel || '시간 제한';
    return {
      eligible: false,
      reasonCode: 'SCHEDULE_MISMATCH',
      badgeLabel: `⏰ 이용 시간 외 (${compactCondition})`,
      buttonLabel: `현재 이용 불가 (${compactCondition})`,
      modalTitle: '이용 가능 요일·시간 안내',
      modalMessage: `${reasonDetail}\n\n현재 즉시 이용 가능한 다른 일일 타석권을 선택해 주세요.`,
    };
  }

  const weeklySchedule = rules.weekly_schedule;
  const allowedDays = rules.allowed_days ?? rules.days ?? rules.available_days;
  const holidaySchedule = rules.holiday_schedule;
  const timeSlots = rules.time_slots ?? rules.allowed_time_slots;
  const timeObj = parseRecord(rules.time);
  const availStart = rules.available_start_time ?? rules.start_time ?? timeObj.start ?? timeObj.start_time;
  const availEnd = rules.available_end_time ?? rules.end_time ?? timeObj.end ?? timeObj.end_time;

  // 공휴일 검증
  if (effectiveDayType === 'PUBLIC_HOLIDAY') {
    if (isHolidayClosedSetting(holidaySchedule)) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: '📆 공휴일 이용 불가',
        buttonLabel: '공휴일 이용 불가 상품',
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: '선택하신 상품은 공휴일 이용이 제한된 상품입니다.\n다른 일일 타석권을 선택해 주세요.',
      };
    }
    const holRange = checkHhmmInSlotRange(curHhmm, holidaySchedule);
    if (holRange && !holRange.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${holRange.rangeLabel})`,
        buttonLabel: `현재 이용 불가 (${holRange.rangeLabel})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품은 공휴일 허용 시간대(${holRange.rangeLabel})에만 이용 가능합니다.\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
    if (!holidaySchedule && daySummary.chipLabel?.startsWith('평일 전용')) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: '📆 평일 전용 (공휴일 제외)',
        buttonLabel: '공휴일 선택 불가 (평일 전용)',
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: '선택하신 상품은 평일 전용 상품으로 공휴일에는 이용할 수 없습니다.\n다른 일일 타석권을 선택해 주세요.',
      };
    }
  }

  // 허용 요일(allowed_days) 검증
  if (Array.isArray(allowedDays) && allowedDays.length > 0) {
    const adTokens = new Set<string>();
    for (const d of allowedDays) {
      const asNum = Number(d);
      if (Number.isInteger(asNum) && NUM_TO_EN_DAY[asNum]) {
        adTokens.add(NUM_TO_EN_DAY[asNum]);
      } else {
        adTokens.add(String(d).toLowerCase().trim().replace(/요일$/, ''));
      }
    }
    const isAll =
      adTokens.has('all') ||
      adTokens.has('전체') ||
      adTokens.has('매일') ||
      CANONICAL_EN_DAYS.every((d) => adTokens.has(d)) ||
      CANONICAL_KR_DAYS.every((d) => adTokens.has(d));
    const isWkdayOk =
      effectiveDayType === 'WEEKDAY' &&
      !isWeekendDay &&
      (adTokens.has('weekday') || adTokens.has('weekdays') || adTokens.has('평일'));
    const isWkendOk =
      (effectiveDayType === 'WEEKEND' || effectiveDayType === 'PUBLIC_HOLIDAY' || isWeekendDay) &&
      (adTokens.has('weekend') || adTokens.has('weekends') || adTokens.has('주말'));

    if (!isAll && !isWkdayOk && !isWkendOk && !adTokens.has(curEn) && !adTokens.has(curKr)) {
      const label = daySummary.chipLabel || '요일 제한';
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `📆 ${label}`,
        buttonLabel: `오늘(${curKr}) 선택 불가 (${label})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품은 [${label}] 상품으로 오늘(${curKr}요일)은 이용할 수 없습니다.\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  } else if (typeof allowedDays === 'string' && allowedDays.trim()) {
    const lower = allowedDays.trim().toLowerCase();
    if ((lower === 'weekday' || lower === 'weekdays' || lower === '평일') && (effectiveDayType !== 'WEEKDAY' || isWeekendDay)) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: '📆 평일 전용',
        buttonLabel: '오늘 선택 불가 (평일 전용)',
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: '선택하신 상품은 [평일 전용] 상품입니다.\n다른 일일 타석권을 선택해 주세요.',
      };
    }
    if ((lower === 'weekend' || lower === 'weekends' || lower === '주말') && !isWeekendDay && effectiveDayType !== 'PUBLIC_HOLIDAY') {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: '📆 주말 전용',
        buttonLabel: '오늘 선택 불가 (주말 전용)',
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: '선택하신 상품은 [주말 전용] 상품입니다.\n다른 일일 타석권을 선택해 주세요.',
      };
    }
  }

  // 주간 스케줄(weekly_schedule) 검증
  if (weeklySchedule && typeof weeklySchedule === 'object' && !Array.isArray(weeklySchedule)) {
    const activeEntries = Object.entries(weeklySchedule as Record<string, unknown>).filter(([, v]) => isActiveScheduleSlot(v));
    if (activeEntries.length > 0) {
      const wsMap = new Map(activeEntries.map(([k, v]) => [k.toLowerCase().trim(), v]));
      const todaySlot = wsMap.get(curEn);
      if (!todaySlot) {
        const label = daySummary.chipLabel || '지정 요일 전용';
        return {
          eligible: false,
          reasonCode: 'SCHEDULE_MISMATCH',
          badgeLabel: `📆 ${label}`,
          buttonLabel: `오늘(${curKr}) 선택 불가 (${label})`,
          modalTitle: '이용 가능 요일·시간 안내',
          modalMessage: `선택하신 상품은 [${label}] 상품으로 오늘(${curKr}요일)은 이용할 수 없습니다.\n다른 일일 타석권을 선택해 주세요.`,
        };
      }
      const wsRange = checkHhmmInSlotRange(curHhmm, todaySlot);
      if (wsRange && !wsRange.matched) {
        return {
          eligible: false,
          reasonCode: 'SCHEDULE_MISMATCH',
          badgeLabel: `⏰ 이용 시간 외 (${wsRange.rangeLabel})`,
          buttonLabel: `현재 이용 불가 (${wsRange.rangeLabel})`,
          modalTitle: '이용 가능 요일·시간 안내',
          modalMessage: `선택하신 상품의 오늘 이용 가능 시간대는 [${wsRange.rangeLabel}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
        };
      }
      return {
        eligible: true,
        reasonCode: 'OK',
        badgeLabel: null,
        buttonLabel: null,
        modalTitle: null,
        modalMessage: null,
      };
    }
  }

  // 시간대(time_slots / available_start_time~end_time / time_range_desc) 검증
  if (Array.isArray(timeSlots) && timeSlots.length > 0) {
    const checks = timeSlots
      .map((sl) => checkHhmmInSlotRange(curHhmm, sl))
      .filter((c): c is { matched: boolean; rangeLabel: string } => c !== null);
    if (checks.length > 0 && !checks.some((c) => c.matched)) {
      const joined = checks.map((c) => c.rangeLabel).join(', ');
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${joined})`,
        buttonLabel: `현재 이용 불가 (${joined})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품의 이용 가능 시간대는 [${joined}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  } else if (timeSlots && typeof timeSlots === 'object' && !Array.isArray(timeSlots)) {
    const isWknd = effectiveDayType === 'WEEKEND' || effectiveDayType === 'PUBLIC_HOLIDAY' || isWeekendDay;
    const targetSlot = isWknd ? (timeSlots as Record<string, unknown>).weekend : (timeSlots as Record<string, unknown>).weekday;
    const chk = checkHhmmInSlotRange(curHhmm, targetSlot);
    if (chk && !chk.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${chk.rangeLabel})`,
        buttonLabel: `현재 이용 불가 (${chk.rangeLabel})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품의 이용 가능 시간대는 [${chk.rangeLabel}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  } else if (typeof timeSlots === 'string' && timeSlots.trim()) {
    const chk = checkHhmmInSlotRange(curHhmm, timeSlots);
    if (chk && !chk.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${chk.rangeLabel})`,
        buttonLabel: `현재 이용 불가 (${chk.rangeLabel})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품의 이용 가능 시간대는 [${chk.rangeLabel}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  } else if (availStart && availEnd) {
    const chk = checkHhmmInSlotRange(curHhmm, `${String(availStart)}~${String(availEnd)}`);
    if (chk && !chk.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${chk.rangeLabel})`,
        buttonLabel: `현재 이용 불가 (${chk.rangeLabel})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품의 이용 가능 시간대는 [${chk.rangeLabel}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  } else if (typeof rules.time_range_desc === 'string' && rules.time_range_desc.trim()) {
    const chk = checkHhmmInSlotRange(curHhmm, rules.time_range_desc);
    if (chk && !chk.matched) {
      return {
        eligible: false,
        reasonCode: 'SCHEDULE_MISMATCH',
        badgeLabel: `⏰ 이용 시간 외 (${chk.rangeLabel})`,
        buttonLabel: `현재 이용 불가 (${chk.rangeLabel})`,
        modalTitle: '이용 가능 요일·시간 안내',
        modalMessage: `선택하신 상품의 이용 가능 시간대는 [${chk.rangeLabel}]입니다. (현재 시각: ${curHhmm})\n다른 일일 타석권을 선택해 주세요.`,
      };
    }
  }

  return {
    eligible: true,
    reasonCode: 'OK',
    badgeLabel: null,
    buttonLabel: null,
    modalTitle: null,
    modalMessage: null,
  };
}
