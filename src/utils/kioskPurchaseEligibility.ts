/**
 * 키오스크 상품 구매 완료 직후 [🎯 구매한 회원권으로 바로 타석 배정받기] CTA 노출 자격 판별 유틸리티
 * - [H-5] 파3/레슨/물품/라카 전용 상품 및 미래 개시일(startDate > todayKstYmd) 연장 기간권 구매 시
 *   고객이 오인하여 즉시 배정 버튼을 눌렀다가 배정 불가(400)를 겪지 않도록 사전 필터링합니다.
 */

export interface ImmediateBayAllocationCheckInput {
  purchaseType?: 'MEMBERSHIP' | 'LOCKER' | 'PRODUCT' | string;
  memberNo?: string | null;
  logicType?: string | null;
  productName?: string | null;
  startDate?: string | null;
  allowedCategories?: string[] | null;
}

const NON_PRACTICE_BAY_LOGIC_TYPES = new Set([
  'GOODS',
  'RETAIL',
  'FNB',
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
