/**
 * 키오스크 상품 구매 완료 직후 [🎯 구매한 회원권으로 바로 타석 배정받기] CTA 노출 자격 판별 유틸리티
 * - [H-5] 파3/레슨/물품/라카 전용 상품 및 미래 개시일(startDate > todayKstYmd) 연장 기간권 구매 시
 *   고객이 오인하여 즉시 배정 버튼을 눌렀다가 배정 불가(400)를 겪지 않도록 사전 필터링합니다.
 */

export interface ImmediateBayAllocationCheckInput {
  purchaseType?: 'MEMBERSHIP' | 'LOCKER' | 'PRODUCT' | string;
  memberNo?: string | null;
  itemId?: string | number | null;
  logicType?: string | null;
  productName?: string | null;
  startDate?: string | null;
  allowedCategories?: string[] | null;
  bundleSummary?: string[] | null;
}

const NON_PRACTICE_BAY_LOGIC_TYPES = new Set([
  'GOODS',
  'RETAIL',
  'FNB',
  'F&B',
  'PRODUCT',
  'ITEM',
  'GENERAL',
  'SERVICE',
  'LESSON',
  'PAR3',
  'LOCKER',
  'RENTAL',
]);

const NON_PRACTICE_ONLY_CATEGORIES = new Set([
  'PAR3',
  'SCREEN',
  'ROOM',
  'LOCKER',
  'LESSON',
]);

export function normalizeYmdDigits(raw?: string | null): string {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : '';
}

export function extractProductAllowedCategories(product?: {
  prod_nm?: string | null;
  logic_type?: string | null;
  access_rules?: Record<string, any> | null;
  rules_detail?: Record<string, any> | null;
} | null): string[] {
  if (!product) return [];
  const rules = product.access_rules || product.rules_detail || {};
  const rawCats =
    rules.allowed_scheduler_categories ||
    rules.allowed_categories ||
    rules.allowed_zones;

  if (Array.isArray(rawCats) && rawCats.length > 0) {
    return rawCats
      .map((c) => String(c || '').trim().toUpperCase())
      .filter(Boolean);
  }

  const nameUpper = String(product.prod_nm || '').toUpperCase();
  const logicUpper = String(product.logic_type || '').toUpperCase();
  if (nameUpper.includes('PAR3') || nameUpper.includes('파3') || logicUpper === 'PAR3') {
    return ['PAR3'];
  }
  return ['BAY'];
}

export function canAllocatePracticeBayImmediately(
  purchaseInfo: ImmediateBayAllocationCheckInput | null | undefined,
  todayKstYmd: string
): boolean {
  if (!purchaseInfo) return false;
  if (purchaseInfo.purchaseType !== 'MEMBERSHIP') return false;
  if (!purchaseInfo.memberNo || String(purchaseInfo.memberNo).trim() === '') return false;

  const logicUpper = String(purchaseInfo.logicType || '').trim().toUpperCase();
  if (NON_PRACTICE_BAY_LOGIC_TYPES.has(logicUpper)) {
    return false;
  }

  if (logicUpper === 'COMPLEX') {
    if (purchaseInfo.itemId === null) {
      return false;
    }
    if (Array.isArray(purchaseInfo.bundleSummary) && purchaseInfo.bundleSummary.length > 0) {
      const hasPracticeChild = purchaseInfo.bundleSummary.some((label) => {
        const u = String(label || '').toUpperCase();
        return !u.includes('라카') && !u.includes('락커') && !u.includes('PAR3') && !u.includes('파3');
      });
      if (!hasPracticeChild) {
        return false;
      }
    }
  }

  const prodNameUpper = String(purchaseInfo.productName || '').toUpperCase();
  if (
    prodNameUpper.includes('파3') ||
    prodNameUpper.includes('PAR3') ||
    prodNameUpper.includes('라카') ||
    prodNameUpper.includes('락커')
  ) {
    return false;
  }

  if (Array.isArray(purchaseInfo.allowedCategories) && purchaseInfo.allowedCategories.length > 0) {
    const normalizedCats = purchaseInfo.allowedCategories
      .map((c) => String(c || '').trim().toUpperCase())
      .filter(Boolean);
    const hasPracticeZone = normalizedCats.some((cat) => !NON_PRACTICE_ONLY_CATEGORIES.has(cat));
    if (!hasPracticeZone) {
      return false;
    }
  }

  const todayDigits = normalizeYmdDigits(todayKstYmd);
  const startDigits = normalizeYmdDigits(purchaseInfo.startDate);
  if (todayDigits && startDigits && startDigits > todayDigits) {
    return false;
  }

  return true;
}

function parseJsonObjectSafe(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeChannelTokens(rawChannels: unknown): string[] | null {
  if (rawChannels === undefined || rawChannels === null) return null;
  if (Array.isArray(rawChannels)) {
    return rawChannels
      .map((c) => String(c ?? '').trim().toUpperCase())
      .filter(Boolean);
  }
  if (typeof rawChannels === 'string') {
    const trimmed = rawChannels.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((c) => String(c ?? '').trim().toUpperCase())
            .filter(Boolean);
        }
      } catch {
        // fallback to comma split
      }
    }
    return trimmed
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  }
  return null;
}

/**
 * [P0-1 / P0-3] 키오스크 채널 노출·구매 허용 상품 여부 방어 판정 (오프라인 캐시 및 폴백 공통 가드)
 * 1) deleted_at !== 0 또는 use_yn === 'N' 이면 즉시 차단
 * 2) meta_data.sales_channels 명시 시 'KIOSK' 포함 여부 최우선 판정
 * 3) meta_data.sales_channels 미존재 시 access_rules.display_channel(또는 sales_channels) 확인
 * 4) Admin UI 전용 메타키(pos_button, short_nm, is_price_open)만 있고 sales_channels가 누락된 경우
 *    Admin UI 기본값(['POS'])과 동일하게 키오스크 미노출(false) 처리
 */
export function isKioskChannelProduct(
  prod?: {
    use_yn?: string | null;
    deleted_at?: number | null;
    logic_type?: string | null;
    group_status?: string | null;
    is_stock_managed?: boolean | null;
    is_bundle?: boolean | null;
    current_stock?: number | null;
    meta_data?: Record<string, any> | string | null;
    access_rules?: Record<string, any> | string | null;
    rules_detail?: Record<string, any> | string | null;
  } | null
): boolean {
  if (!prod) return false;
  if (prod.deleted_at !== undefined && prod.deleted_at !== null && Number(prod.deleted_at) !== 0) {
    return false;
  }
  if (prod.use_yn && String(prod.use_yn).trim().toUpperCase() === 'N') {
    return false;
  }

  const meta = parseJsonObjectSafe(prod.meta_data);
  const rules = parseJsonObjectSafe(prod.access_rules);
  const rulesDetail = parseJsonObjectSafe(prod.rules_detail);

  // [OPT-3] 자유가격(카운터 수기 단가 입력) 상품 및 품절 상품은 무인 키오스크 판매 차단
  if (meta.is_price_open === true) {
    return false;
  }
  if (prod.is_stock_managed === true && !prod.is_bundle && Number(prod.current_stock ?? 0) <= 0) {
    return false;
  }

  // [OPT-2] 모집 마감/종료된 그룹레슨 상품 차단
  if (String(prod.logic_type || '').trim().toUpperCase() === 'LESSON') {
    const gStatus = String(prod.group_status || meta.group_status || '').trim().toUpperCase();
    if (['CLOSED', 'CANCELLED', 'CANCELED', 'COMPLETED', 'FINISHED'].includes(gStatus)) {
      return false;
    }
  }

  if ('sales_channels' in meta) {
    const metaChannels = normalizeChannelTokens(meta.sales_channels);
    if (metaChannels !== null) {
      return metaChannels.includes('KIOSK');
    }
  }

  for (const src of [rules, rulesDetail]) {
    if ('display_channel' in src || 'sales_channels' in src) {
      const rawRc = 'display_channel' in src ? src.display_channel : src.sales_channels;
      const ruleChannels = normalizeChannelTokens(rawRc);
      if (ruleChannels !== null) {
        return ruleChannels.includes('KIOSK');
      }
    }
  }

  if ('pos_button' in meta || 'short_nm' in meta || 'is_price_open' in meta) {
    return false;
  }

  return true;
}

const NON_LOCKER_RENTAL_SUB_TYPES = new Set(['PARKING', 'STORAGE', 'DEPOSIT']);

/**
 * [P1-3-A] 키오스크 [개인 사물함 연장] 전용 상품 여부 판별
 * - KIOSK 판매채널 및 활성 상태(`isKioskChannelProduct`) 통과 필수
 * - 어드민 대여 구분(`meta_data.sub_type`)이 주차권(`PARKING`), 기타보관함(`STORAGE`), 보증금(`DEPOSIT`)이거나
 *   `meta_data.is_deposit === true`인 항목은 `logic_type === 'RENTAL'`이어도 100% 배제
 * - `sub_type` 미지정 레거시 상품 중 상품명에 '주차'/'parking'이 포함되고 라카 키워드가 없는 주차권 상품 배제
 * - 기존 정상 사물함 상품(`sub_type === 'LOCKER'` 또는 미지정 `RENTAL`/`LOCKER`/`LC*`/`RNT*`/장기 `FACILITY`)은 100% 허용
 */
export function isKioskLockerExtensionProduct(
  prod?: {
    prod_cd?: string | null;
    prod_nm?: string | null;
    logic_type?: string | null;
    days?: number | null;
    use_yn?: string | null;
    deleted_at?: number | null;
    group_status?: string | null;
    is_stock_managed?: boolean | null;
    is_bundle?: boolean | null;
    current_stock?: number | null;
    sale_price?: number | null;
    standard_price?: number | null;
    total_count?: number | null;
    meta_data?: Record<string, any> | string | null;
    access_rules?: Record<string, any> | string | null;
    rules_detail?: Record<string, any> | string | null;
  } | null
): boolean {
  if (!prod || !isKioskChannelProduct(prod)) return false;

  const meta = parseJsonObjectSafe(prod.meta_data);
  if (meta.is_deposit === true) {
    return false;
  }

  const effPrice = Number(
    prod.sale_price !== undefined && prod.sale_price !== null
      ? prod.sale_price
      : (prod.standard_price ?? 0)
  );
  if (
    Number(meta.deposit_amount ?? 0) > 0 &&
    effPrice === 0 &&
    (prod.days ?? 0) <= 0 &&
    (prod.total_count ?? 0) <= 0
  ) {
    return false;
  }

  const subType = String(meta.sub_type || '').trim().toUpperCase();
  if (subType && NON_LOCKER_RENTAL_SUB_TYPES.has(subType)) {
    return false;
  }

  const nm = String(prod.prod_nm || '').toLowerCase();
  const cd = String(prod.prod_cd || '').trim().toUpperCase();
  const lt = String(prod.logic_type || '').trim().toUpperCase();
  const hasLockerKeyword = nm.includes('라카') || nm.includes('락커') || nm.includes('사물함');

  if (!subType && (nm.includes('주차') || nm.includes('parking')) && !hasLockerKeyword) {
    return false;
  }
  if (cd.endsWith('-DEP') || (nm.includes('보증금') && (prod.days ?? 0) <= 0)) {
    return false;
  }

  if (subType === 'LOCKER' || lt === 'RENTAL' || lt === 'LOCKER') {
    return true;
  }
  if (hasLockerKeyword || cd.startsWith('LC') || cd.startsWith('RNT')) {
    return true;
  }
  const resolvedDays = resolveLockerExtendDays(prod);
  if (
    lt === 'FACILITY' &&
    resolvedDays > 0 &&
    !nm.includes('일일') &&
    !nm.includes('당일') &&
    !nm.includes('타석') &&
    !nm.includes('par3') &&
    !nm.includes('파3')
  ) {
    return true;
  }
  return false;
}

/**
 * [P1-3-C] 라카 연장 상품의 유효 연장 일수(days) 산출
 * - `prod.days > 0` 최우선 적용
 * - 미지정(`0`/`null`) 시 `access_rules.period_count` 및 `period_type`(`MONTH` = count * 30, `DAY` = count) 폴백
 * - 모두 없으면 기본 30일 반환
 */
export function resolveLockerExtendDays(
  prod?: {
    days?: number | null;
    access_rules?: Record<string, any> | string | null;
    rules_detail?: Record<string, any> | string | null;
  } | null
): number {
  const directDays = Number(prod?.days ?? 0);
  if (Number.isFinite(directDays) && directDays > 0) {
    return Math.round(directDays);
  }
  const rules = parseJsonObjectSafe(prod?.access_rules);
  const rulesDetail = parseJsonObjectSafe(prod?.rules_detail);
  const rawCount = Number(rules.period_count ?? rulesDetail.period_count ?? 0);
  if (Number.isFinite(rawCount) && rawCount > 0) {
    const pType = String(rules.period_type || rulesDetail.period_type || 'DAY')
      .trim()
      .toUpperCase();
    return pType === 'MONTH' ? Math.round(rawCount) * 30 : Math.round(rawCount);
  }
  return 30;
}

export interface LockerRenewalWindowEvaluation {
  canRenewNow: boolean;
  renewalAvailableDays: number | null;
  badgeText: string | null;
  reasonMessage: string | null;
}

/**
 * [P1-3-B] 라카 사전 연장 가능 기간(`access_rules.renewal_available_days`) 평가
 * - 백엔드 `LockerService.validate_extension_eligibility`와 동일한 산식:
 *   `lockerRemainDays >= 0 && renewalAvailableDays > 0 && lockerRemainDays > renewalAvailableDays` 일 때만 연장 제한
 * - 이미 만료된 라카(`lockerRemainDays < 0`)이거나 `renewal_available_days` 미설정(`<= 0`) 시 즉시 연장 허용
 */
export function evaluateLockerRenewalWindow(
  prod?: {
    access_rules?: Record<string, any> | string | null;
    rules_detail?: Record<string, any> | string | null;
  } | null,
  lockerRemainDays?: number | null,
  lang: 'KO' | 'EN' | string = 'KO'
): LockerRenewalWindowEvaluation {
  const rules = parseJsonObjectSafe(prod?.access_rules);
  const rulesDetail = parseJsonObjectSafe(prod?.rules_detail);
  const rawLimit = rules.renewal_available_days ?? rulesDetail.renewal_available_days;
  const parsedLimit = rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim() !== ''
    ? Number(rawLimit)
    : 0;
  const renewalDays = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 0;

  if (
    renewalDays > 0 &&
    lockerRemainDays !== undefined &&
    lockerRemainDays !== null &&
    Number.isFinite(lockerRemainDays) &&
    lockerRemainDays >= 0 &&
    lockerRemainDays > renewalDays
  ) {
    const isEn = String(lang || 'KO').trim().toUpperCase() === 'EN';
    return {
      canRenewNow: false,
      renewalAvailableDays: renewalDays,
      badgeText: isEn
        ? `Renewable within D-${renewalDays} (Current D-${lockerRemainDays})`
        : `만료 ${renewalDays}일 전부터 연장 가능 (현재 D-${lockerRemainDays})`,
      reasonMessage: isEn
        ? `Not yet eligible for renewal. You can extend within ${renewalDays} days before expiry. (Remaining: ${lockerRemainDays} days)`
        : `아직 연장 가능한 기간이 아닙니다. 만료 ${renewalDays}일 전부터 연장하실 수 있습니다. (잔여: ${lockerRemainDays}일)`,
    };
  }

  return {
    canRenewNow: true,
    renewalAvailableDays: renewalDays > 0 ? renewalDays : null,
    badgeText: null,
    reasonMessage: null,
  };
}

