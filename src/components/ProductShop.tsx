import React, { useEffect, useState } from 'react';
import { ShoppingBag, X, Layers, Hand, Clock } from 'lucide-react';
import { api, Bay, Product } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';
import {
  buildKioskProductSpecSummary,
  checkIfKioskDailyProduct,
  evaluateDailyPassEligibility,
  normalizeTargetGenderLabel,
  resolveKioskProductDurationMin,
} from '../utils/kioskProductSpecSummary';
import { isKioskChannelProduct } from '../utils/kioskPurchaseEligibility';

/** 샴페인 플래티넘 메탈 스마트 IC 칩 (EMV Chip) 그래픽 */
const EmvChip: React.FC = () => (
  <svg width="36" height="26" viewBox="0 0 36 26" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <rect width="36" height="26" rx="5" fill="url(#shop-chip-grad)" stroke="#ca8a04" strokeWidth="1.2" />
    <path d="M11 0V26M25 0V26M0 13H36M11 8H25M11 18H25" stroke="#a16207" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
    <rect x="13" y="8.5" width="10" height="9" rx="2" fill="#fef9c3" stroke="#ca8a04" strokeWidth="0.8" />
    <defs>
      <linearGradient id="shop-chip-grad" x1="0" y1="0" x2="36" y2="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fef9c3" />
        <stop offset="0.5" stopColor="#fef08a" />
        <stop offset="1" stopColor="#fde047" />
      </linearGradient>
    </defs>
  </svg>
);

interface ProductShopProps {
  memberNo?: string;
  memberName?: string;
  memberGender?: string;
  discountRate?: number;
  gradeName?: string;
  purposeType?: 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT' | 'SELECT_DAILY_PASS';
  maxAssignableMin?: number | null;
  nextLimitResStartTime?: string | null;
  selectedBay?: Bay | null;
  allStoreFloors?: string[];
  zoneLabelMap?: Record<string, string>;
  hasActiveMembership?: boolean;
  nowOverride?: Date;
  initialProducts?: Product[];
  onProductSelected: (product: Product) => void;
  onCancel: () => void;
}

interface DisplayCategoryItem {
  category_id: number;
  name: string;
  sort_order: number;
  items: Array<Partial<Product> & { prod_cd?: string; prod_nm?: string }>;
}

export const ProductShop: React.FC<ProductShopProps> = ({
  memberNo,
  memberName,
  memberGender,
  discountRate = 0,
  gradeName,
  purposeType,
  maxAssignableMin = null,
  nextLimitResStartTime = null,
  selectedBay = null,
  allStoreFloors,
  zoneLabelMap,
  hasActiveMembership = false,
  nowOverride,
  initialProducts,
  onProductSelected,
  onCancel
}) => {
  const isDailyPurpose = purposeType === 'ALLOCATE_DAILY' || purposeType === 'SELECT_DAILY_PASS';

  // activeTab: number(동적 카테고리 ID) 또는 'DAILY_PASS'(일일 타석 배정 모드 전용 탭)
  const [activeTab, setActiveTab] = useState<number | 'DAILY_PASS'>(
    isDailyPurpose ? 'DAILY_PASS' : 0
  );
  const [displayCategories, setDisplayCategories] = useState<DisplayCategoryItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>(initialProducts || []);
  const [loading, setLoading] = useState(false);
  const [warningTitle, setWarningTitle] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // 일일 타석 배정권 여부 판별 헬퍼 (상품 DB 속성 + KIOSK 판매채널 허용 여부 직접 참조)
  const checkIfDaily = (prod: Product) => isKioskChannelProduct(prod) && checkIfKioskDailyProduct(prod);

  const nonDailyFilter = (p: Product) => {
    if (!isKioskChannelProduct(p)) return false;
    const lt = (p.logic_type || '').toUpperCase();
    return lt !== 'DAILY' && lt !== 'RENTAL' && !checkIfDaily(p);
  };

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setAllProducts(initialProducts);
      return;
    }
    let mounted = true;
    const loadKioskShopData = async () => {
      setLoading(true);
      try {
        // 1. KIOSK 전시 카테고리 및 전체 상품을 병렬 조회하여 체감 응답 지연 절반 단축
        const [categories, products] = await Promise.all([
          api.getKioskDisplayCategories(),
          api.getProducts(),
        ]);
        if (!mounted) return;
        setAllProducts(products);

        // 🛡️ BUG-S06: PURCHASE_PRODUCT 모드에서는 일일권/라카만 들어있어 필터링 후 0개가 되는 빈 탭을 제외하고,
        // 유효한 회원권/횟수권/레슨 상품이 1개 이상 존재하는 카테고리만 탭으로 구성 (모두 비어있으면 전체 폴백)
        const isDailyMode = purposeType === 'ALLOCATE_DAILY' || purposeType === 'SELECT_DAILY_PASS';
        const filteredCategories = isDailyMode
          ? categories
          : categories.filter((cat: DisplayCategoryItem) => {
              const items = Array.isArray(cat.items) ? cat.items : [];
              return items.some((item) => {
                const resolved = products.find(p => p.prod_cd === item.prod_cd) || (item?.prod_nm ? item as Product : undefined);
                return Boolean(resolved && nonDailyFilter(resolved));
              });
            });

        setDisplayCategories(filteredCategories);

        // 기본 활성 탭 설정
        if (isDailyMode) {
          setActiveTab('DAILY_PASS');
        } else if (filteredCategories.length > 0) {
          // 회원권 구매 모드: 유효 상품이 존재하는 첫 번째 전시 카테고리 기본 선택
          setActiveTab(filteredCategories[0].category_id);
        } else {
          // 전시 카테고리가 미설정되었거나 유효 카테고리가 없는 경우 0 유지 (전체 비일일권 상품 폴백)
          setActiveTab(0);
        }
      } catch (err) {
        console.error('Failed to load kiosk shop data:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    loadKioskShopData();
    return () => {
      mounted = false;
    };
  }, [memberNo, purposeType, initialProducts]);

  // 일일 타석 배정권 시간(분) 추출 헬퍼 (DB 물리 컬럼 ➔ time_min ➔ JSON access_rules/rules_detail 직접 참조)
  const getDurationMin = (prod: Product) => resolveKioskProductDurationMin(prod);

  // 현재 탭 및 목적(purposeType)에 맞는 노출 상품 목록 필터링
  const getFilteredProducts = (): Product[] => {
    if (isDailyPurpose || activeTab === 'DAILY_PASS') {
      // 일일 타석 배정권 전용 필터링 (DAILY 상품만 노출)
      return allProducts.filter(checkIfDaily);
    } else {
      // 동적 전시 카테고리 상품 매핑
      const matchedCat = displayCategories.find(c => c.category_id === activeTab);
      if (!matchedCat) {
        if (displayCategories.length === 0) {
          return allProducts.filter(nonDailyFilter);
        }
        return [];
      }
      
      // 해당 카테고리에 매핑된 prod_cd 리스트에 대응되는 실제 Product 객체 빌드 (어드민 지정 정렬 순서 100% 보장 + DAILY 제외)
      return matchedCat.items
        .map(item => allProducts.find(p => p.prod_cd === item.prod_cd) || (item?.prod_nm ? item as Product : undefined))
        .filter((p): p is Product => !!p && nonDailyFilter(p));
    }
  };

  const filteredProducts = getFilteredProducts();

  // 비회원의 장기 회원권 탭 진입 차단 처리
  const handleTabClick = (tabId: number | 'DAILY_PASS', tabName: string) => {
    if (tabId !== 'DAILY_PASS' && !memberNo && (tabName.includes('회원') || tabName.includes('정기') || tabName.includes('라카'))) {
      setWarningTitle('회원 인증 필요');
      setWarningMessage('장기 정기권 및 지정 시설 상품 구매는 회원 인증이 필요합니다.\n처음 화면으로 돌아가 회원 조회를 먼저 완료해 주십시오.');
      return;
    }
    setActiveTab(tabId);
  };

  return (
    <div 
      style={{
        width: '100%',
        maxWidth: '980px',
        margin: isDailyPurpose ? '0 auto' : '0 auto 140px auto',
        padding: '44px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        background: '#ffffff',
        borderRadius: '40px',
        border: '1.5px solid #e5e5ea',
        boxShadow: '0 25px 70px rgba(0, 0, 0, 0.16), 0 4px 18px rgba(0, 0, 0, 0.04)',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Malgun Gothic", sans-serif'
      }}
    >
      {/* 상품 매대 헤더 (스페이스 블랙 원형 아이콘 + 에메랄드 인디케이터 닷 + 우측 56px 볼드 원형 닫기 버튼) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{
              background: '#1d1d1f',
              borderRadius: '50%',
              width: '56px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(17, 24, 39, 0.16)'
            }}>
              <ShoppingBag size={26} color="#ffffff" strokeWidth={2.5} />
            </div>
            <div style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#10b981',
              border: '2.5px solid #ffffff'
            }} />
          </div>
          <div>
            <h2 style={{ fontSize: '34px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.8px', lineHeight: 1.15 }}>
              {isDailyPurpose ? '일일 타석권 선택 및 결제' : '회원권 및 정기 서비스 구매'}
            </h2>
            {memberName ? (
              <p style={{ fontSize: '15px', color: '#64748b', fontWeight: 600, marginTop: '6px', margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '2px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: 800 }}>
                  인증 완료
                </span>
                <span>회원번호: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{memberNo} ({memberName})</strong> 님 전용 구매</span>
              </p>
            ) : (
              <p style={{ fontSize: '15px', color: '#d97706', fontWeight: 700, marginTop: '5px', margin: '5px 0 0 0' }}>
                {isDailyPurpose 
                  ? '※ 원하시는 이용 시간(N분)을 선택하여 결제를 진행해 주세요.'
                  : '※ 회원 전용 상품으로 정기 회원권 및 부가 서비스를 구매하실 수 있습니다.'}
              </p>
            )}
            {isDailyPurpose && typeof maxAssignableMin === 'number' && maxAssignableMin > 0 && (
              <p style={{ fontSize: '14px', color: '#dc2626', fontWeight: 800, marginTop: '4px', margin: '4px 0 0 0' }}>
                ⚠️ 선택하신 타석은 다음 예약({nextLimitResStartTime || '예정'}) 전까지 최대 [{maxAssignableMin}분] 이용 가능합니다.
              </p>
            )}
          </div>
        </div>

        {/* 닫기 버튼 (56px 애플 볼드 원형 버튼 표준) */}
        <button 
          onClick={onCancel}
          aria-label="돌아가기"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#f5f5f7',
            border: '1.5px solid #e5e5ea',
            color: '#1d1d1f',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
            flexShrink: 0
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = '#e5e5ea'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
        >
          <X size={28} strokeWidth={2.4} />
        </button>
      </div>

      {/* 동적 카테고리 탭 목록 (회원권 구매 전용 매대) */}
      {!isDailyPurpose && displayCategories.length > 0 && (
        <div 
          style={{ 
            display: 'flex', 
            overflowX: 'auto',
            gap: '8px',
            padding: '6px',
            background: '#f5f5f7',
            borderRadius: '20px',
            border: '1px solid #e5e5ea'
          }}
        >
          {/* 어드민에서 설정한 동적 카테고리 탭 렌더링 (회원권, 쿠폰, 라카, 파3 등) */}
          {displayCategories.map(cat => {
            const isActive = activeTab === cat.category_id;
            const isLocked = !memberNo && (cat.name.includes('회원') || cat.name.includes('라카'));
            
            return (
              <button
                key={cat.category_id}
                onClick={() => handleTabClick(cat.category_id, cat.name)}
                style={{
                  flex: displayCategories.length <= 4 ? '1' : '0 0 auto',
                  minWidth: '140px',
                  padding: '15px 14px',
                  fontSize: '17px',
                  fontWeight: 800,
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: isLocked ? 0.45 : 1,
                  color: isActive ? '#ffffff' : '#86868b',
                  background: isActive ? '#1d1d1f' : 'transparent',
                  boxShadow: isActive ? '0 4px 12px rgba(0, 0, 0, 0.14)' : 'none'
                }}
              >
                <Layers size={18} style={{ color: isActive ? '#34d399' : '#86868b' }} />
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 💳 애플 럭셔리 VIP 멤버십 카드 그리드 (2열) */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          minHeight: '300px'
        }}
      >
        {loading ? (
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#86868b', fontWeight: 700 }}>
            상품 정보를 로딩하고 있습니다...
          </div>
        ) : filteredProducts.length > 0 ? (
          filteredProducts.map((prod) => {
            const isDaily = checkIfDaily(prod);
            const durationMin = getDurationMin(prod);
            const specSummary = buildKioskProductSpecSummary(prod, {
              allStoreFloors,
              zoneLabelMap,
              hasActiveMembership,
            });

            // 1. 실제 판매 기준 가격 (sale_price 우선 참조) 및 정상가 취소선 계산
            const effectiveSalePrice =
              prod.sale_price !== undefined && prod.sale_price !== null && prod.sale_price > 0
                ? prod.sale_price
                : prod.standard_price;
            const hasSaleDiscount = prod.standard_price > effectiveSalePrice;
            const hasGradeDiscount = Boolean(discountRate && discountRate > 0);
            const gradeDiscountAmt = hasGradeDiscount ? Math.round(effectiveSalePrice * (discountRate! / 100)) : 0;
            const finalPrice = Math.max(0, effectiveSalePrice - gradeDiscountAmt);
            const hasAnyDiscount = hasSaleDiscount || hasGradeDiscount;
            const priceFormatted = finalPrice.toLocaleString();

            // 2. 배지(badge), 성별 제한, 일일권 실시간 이용 적합성(시간/구역/요일) 동적 반영
            const customBadge = prod.meta_data?.pos_button?.badge || prod.meta_data?.badges?.[0] || prod.meta_data?.badge || null;
            const genderInfo = normalizeTargetGenderLabel(prod);
            const targetGenderNorm = genderInfo.code;
            const genderBadge = genderInfo.label;

            const dailyEligibility =
              isDailyPurpose && isDaily
                ? evaluateDailyPassEligibility(prod, {
                    maxAssignableMin,
                    nextLimitResStartTime,
                    selectedBay,
                    now: nowOverride ?? TimeMaster.getSyncedDate(),
                    allStoreFloors,
                    zoneLabelMap,
                  })
                : null;
            const isCardDisabled = Boolean(dailyEligibility && !dailyEligibility.eligible);
            const displayName = prod.meta_data?.display_nm || prod.prod_nm;

            return (
              <div
                key={prod.prod_cd}
                data-testid={`product-card-${prod.prod_cd}`}
                data-duration={durationMin}
                data-disabled={isCardDisabled ? 'true' : 'false'}
                onClick={() => {
                  if (isCardDisabled && dailyEligibility) {
                    setWarningTitle(dailyEligibility.modalTitle || '이용 제한 안내');
                    setWarningMessage(dailyEligibility.modalMessage || '현재 선택하실 수 없는 상품입니다.');
                    return;
                  }
                  if (!memberNo && (prod.logic_type || '').toUpperCase() !== 'DAILY' && !checkIfDaily(prod)) {
                    setWarningTitle('회원 인증 필요');
                    setWarningMessage('회원 전용 상품입니다. 먼저 회원 인증을 진행해 주세요.');
                    return;
                  }
                  if (targetGenderNorm === 'M' || targetGenderNorm === 'F') {
                    const normMemGender = String(memberGender || '').toUpperCase();
                    const memG = normMemGender === 'MALE' || normMemGender === '남' ? 'M' : normMemGender === 'FEMALE' || normMemGender === '여' ? 'F' : normMemGender;
                    if (memG && memG !== targetGenderNorm) {
                      const reqLabel = targetGenderNorm === 'F' ? '여성' : '남성';
                      setWarningTitle('상품 구매 제한 안내');
                      setWarningMessage(`선택하신 상품은 [${reqLabel} 회원 전용] 상품입니다.\n다른 상품을 선택해 주세요.`);
                      return;
                    }
                  }
                  onProductSelected(prod);
                }}
                style={{
                  padding: '24px 26px 22px 26px',
                  borderRadius: '24px',
                  border: isCardDisabled ? '1.5px dashed #cbd5e1' : '1.5px solid #e2e8f0',
                  background: isCardDisabled
                    ? '#f8fafc'
                    : 'linear-gradient(135deg, #ffffff 0%, #fbfcfd 45%, #f4f6f8 100%)',
                  opacity: isCardDisabled ? 0.56 : 1,
                  cursor: isCardDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '18px',
                  boxShadow: isCardDisabled ? 'none' : '0 8px 24px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.03)',
                  transition: 'all 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  if (isCardDisabled) return;
                  e.currentTarget.style.borderColor = '#059669';
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 16px 36px rgba(5, 150, 105, 0.14), 0 2px 8px rgba(0, 0, 0, 0.04)';
                }}
                onMouseLeave={(e) => {
                  if (isCardDisabled) return;
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.03)';
                }}
              >
                {/* [1단: 카드 헤더 — 샴페인 플래티넘 스마트 IC 칩 & 각인 & 우측 뱃지] */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <EmvChip />
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', letterSpacing: '1.2px' }}>
                      {specSummary.headerTypeBadge}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {genderBadge && (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '5px 11px',
                        borderRadius: '999px',
                        background: targetGenderNorm === 'F' ? '#fdf2f8' : '#eff6ff',
                        color: targetGenderNorm === 'F' ? '#db2777' : '#1d4ed8',
                        border: targetGenderNorm === 'F' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                      }}>
                        {genderBadge}
                      </span>
                    )}
                    {isCardDisabled && dailyEligibility?.badgeLabel ? (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        background: '#fef3c7',
                        color: '#b45309',
                        border: '1px solid #fcd34d'
                      }}>
                        {dailyEligibility.badgeLabel}
                      </span>
                    ) : customBadge ? (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #a7f3d0'
                      }}>
                        {customBadge}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* [2단: 카드 본체 — 24px 볼드 상품명 & 1회 배정시간 시그니처 뱃지 & 유동적 혜택·제한 라인] */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.2 }}>
                      {displayName}
                    </h3>

                    {specSummary.resolvedLogicType !== 'RETAIL' && specSummary.resolvedLogicType !== 'RENTAL' && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 11px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        background: '#f1f5f9',
                        color: '#1e293b',
                        border: '1px solid #e2e8f0',
                        flexShrink: 0
                      }}>
                        <Clock size={13} strokeWidth={2.4} style={{ color: '#059669' }} />
                        <span>1회 {durationMin}분 배정</span>
                      </span>
                    )}
                  </div>

                  {/* 1열 가로 기본 제공량 요약 라인 (허위 '무제한' 제거) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    flexWrap: 'wrap',
                    fontSize: '13px',
                    color: '#475569',
                    fontWeight: 700,
                    padding: '2px 0'
                  }}>
                    {specSummary.benefitTokens.map((tok, tokIdx) => (
                      <React.Fragment key={tokIdx}>
                        {tokIdx > 0 && <span style={{ color: '#cbd5e1' }}>·</span>}
                        <span>
                          {tok.icon} {tok.label}
                          {tok.highlight && <strong style={{ color: '#047857' }}>{tok.highlight}</strong>}
                          {tok.suffix || ''}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Exception-Only 유동 조건 칩: 실제 제한 옵션이 설정된 상품에만 노출 (일반 올패스 상품은 미렌더링) */}
                  {specSummary.restrictionChips.length > 0 && (
                    <div
                      data-testid={`product-restriction-chips-${prod.prod_cd}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                        marginTop: '2px'
                      }}
                    >
                      {specSummary.restrictionChips.map((chip) => {
                        const chipStyle =
                          chip.tone === 'amber'
                            ? { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
                            : chip.tone === 'emerald'
                              ? { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
                              : { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };
                        return (
                          <span
                            key={chip.key}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              lineHeight: 1.2,
                              whiteSpace: 'nowrap',
                              ...chipStyle
                            }}
                          >
                            <span>{chip.icon}</span>
                            <span>{chip.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* [3단: 카드 푸터 — 이용요금 & 56px 딥 차콜 애플 필 구매 버튼] */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>이용요금</span>
                      {hasAnyDiscount && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', color: '#94a3b8', textDecoration: 'line-through' }}>
                            {prod.standard_price.toLocaleString()}원
                          </span>
                          {hasGradeDiscount ? (
                            <span style={{ fontSize: '11px', fontWeight: 900, color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: '6px' }}>
                              {gradeName || 'VIP'} {discountRate}% 할인
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 900, color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: '6px' }}>
                              할인가 적용
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '30px', fontWeight: 950, color: hasAnyDiscount ? '#059669' : '#0f172a', letterSpacing: '-0.8px', lineHeight: 1 }}>
                      {priceFormatted}원
                    </span>
                  </div>

                  <button
                    disabled={isCardDisabled}
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '999px',
                      background: isCardDisabled ? '#e2e8f0' : '#1d1d1f',
                      color: isCardDisabled ? '#64748b' : '#ffffff',
                      border: 'none',
                      fontSize: '17px',
                      fontWeight: 800,
                      letterSpacing: '-0.3px',
                      cursor: isCardDisabled ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: isCardDisabled ? 'none' : '0 6px 18px rgba(0, 0, 0, 0.14)',
                      transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                    }}
                  >
                    {isCardDisabled && dailyEligibility?.buttonLabel ? (
                      <span>{dailyEligibility.buttonLabel}</span>
                    ) : (
                      <>
                        <Hand size={18} className="animate-hand-tap" style={{ color: '#10b981' }} />
                        <span>{priceFormatted}원 선택 및 결제</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '10px' }}>
            <span style={{ fontSize: '18px', color: '#86868b', fontWeight: 700 }}>이 카테고리에는 판매 중인 상품이 없습니다.</span>
          </div>
        )}
      </div>

      {/* 하단 구매 안내 문구 */}
      <div 
        style={{
          background: '#f5f5f7',
          border: '1px solid #e5e5ea',
          borderRadius: '20px',
          padding: '18px 24px',
          fontSize: '14px',
          color: '#515154',
          lineHeight: '1.6'
        }}
      >
        <strong style={{ color: '#1d1d1f', display: 'block', marginBottom: '4px', fontSize: '15px', fontWeight: 800 }}>[무인 키오스크 구매 안내]</strong>
        • 일일 타석권은 결제 즉시 타석 배정이 완료되며, 모든 결제는 신용카드만 가능합니다 (현금 결제/환불은 안내 데스크 문의).
      </div>

      {/* 회원 전용 상품 인증 및 이용 제한 안내 모달 (동기식 alert 대체) */}
      {warningMessage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '28px',
            padding: '36px 32px',
            maxWidth: '440px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #e5e5ea'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {warningMessage.includes('다음 예약') || warningTitle?.includes('시간')
                ? '⏰'
                : warningTitle?.includes('구역')
                  ? '📍'
                  : '🔒'}
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f', marginBottom: '12px' }}>
              {warningTitle ||
                (warningMessage.includes('다음 예약')
                  ? '이용 시간 초과 상품 안내'
                  : (warningMessage.includes('전용]') ? '상품 구매 제한 안내' : '회원 인증 필요'))}
            </h3>
            <p style={{ fontSize: '16px', color: '#515154', lineHeight: '1.6', whiteSpace: 'pre-line', marginBottom: '28px', fontWeight: 600 }}>
              {warningMessage}
            </p>
            <button
              onClick={() => {
                setWarningTitle(null);
                setWarningMessage(null);
              }}
              style={{
                width: '100%',
                height: '56px',
                borderRadius: '999px',
                background: '#1d1d1f',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 8px 18px rgba(0, 0, 0, 0.16)'
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
