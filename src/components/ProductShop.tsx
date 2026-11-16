import React, { useEffect, useState } from 'react';
import { ArrowRight, Clock, Compass, Layers, ShieldAlert, ShoppingBag, UserCheck, X } from 'lucide-react';
import { api, Bay, Product } from '../services/api';
import {
  buildKioskProductSpecSummary,
  checkIfKioskDailyProduct,
  evaluateDailyPassEligibility,
  normalizeTargetGenderLabel,
  resolveKioskProductDurationMin,
} from '../utils/kioskProductSpecSummary';
import { isKioskChannelProduct } from '../utils/kioskPurchaseEligibility';
import { TimeMaster } from '../utils/timeMaster';

const resolveProductTypeMeta = (
  resolvedLogicType: string,
  isWaitlist: boolean
): { label: string; dotColor: string } => {
  if (resolvedLogicType === 'DAILY') {
    return { label: '일일 타석권', dotColor: isWaitlist ? '#d97706' : '#0071e3' };
  }
  if (resolvedLogicType === 'COUNT') {
    return { label: '횟수 이용권', dotColor: '#0071e3' };
  }
  if (resolvedLogicType === 'TIME') {
    return { label: '시간 정액권', dotColor: '#0891b2' };
  }
  if (resolvedLogicType === 'LESSON') {
    return { label: '프로 레슨권', dotColor: '#7c3aed' };
  }
  if (resolvedLogicType === 'RETAIL' || resolvedLogicType === 'RENTAL') {
    return { label: '부가 서비스', dotColor: '#475569' };
  }
  return { label: '정기 회원권', dotColor: '#059669' };
};

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
  prepareMin?: number;
  allStoreFloors?: string[];
  zoneLabelMap?: Record<string, string>;
  hasActiveMembership?: boolean;
  isStoreClosed?: boolean;
  storeClosedReason?: string | null;
  storeOpenTime?: string | null;
  storeCloseTime?: string | null;
  isStore24h?: boolean;
  nowOverride?: Date;
  initialProducts?: Product[];
  onMemberAuthClick?: () => void;
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
  prepareMin,
  allStoreFloors,
  zoneLabelMap,
  hasActiveMembership = false,
  isStoreClosed = false,
  storeClosedReason = null,
  storeOpenTime = null,
  storeCloseTime = null,
  isStore24h = false,
  nowOverride,
  initialProducts,
  onMemberAuthClick,
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
      className={isDailyPurpose ? 'kiosk-ultra-scrollbar' : undefined}
      style={{
        width: '100%',
        maxWidth: '980px',
        maxHeight: isDailyPurpose ? 'calc(100vh - 170px)' : undefined,
        overflowY: isDailyPurpose ? 'auto' : undefined,
        margin: isDailyPurpose ? '0 auto 76px auto' : '0 auto 140px auto',
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
      {/* 상품 매대 헤더 (Apple HIG 통일 — 이중 헤일로 아이콘 + 38px 타이틀 + 60px 닫기 버튼) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              padding: '7px',
              borderRadius: '50%',
              background: isDailyPurpose ? 'rgba(0, 113, 227, 0.12)' : 'rgba(5, 150, 105, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                background: isDailyPurpose
                  ? 'linear-gradient(145deg, #1a8cff 0%, #0071e3 100%)'
                  : 'linear-gradient(145deg, #10b981 0%, #059669 100%)',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDailyPurpose
                  ? '0 8px 20px rgba(0, 113, 227, 0.25)'
                  : '0 8px 20px rgba(5, 150, 105, 0.25)',
              }}
            >
              <ShoppingBag size={26} color="#ffffff" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: '38px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.9px', lineHeight: 1.15 }}>
              {isDailyPurpose ? '일일 타석권 선택 및 결제' : '회원권 및 정기 서비스 구매'}
            </h2>
            {memberName ? (
              <p style={{ fontSize: '17px', color: '#4b5563', fontWeight: 700, margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 800 }}>
                  인증 완료
                </span>
                <span>회원번호: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{memberNo} ({memberName})</strong> 님 전용 구매</span>
              </p>
            ) : (
              <p style={{ fontSize: '18px', color: '#515154', fontWeight: 700, margin: '6px 0 0 0' }}>
                {isDailyPurpose
                  ? '원하시는 이용 시간을 선택하시면 바로 결제로 이어집니다.'
                  : '회원 전용 상품으로 정기 회원권 및 부가 서비스를 구매하실 수 있습니다.'}
              </p>
            )}
            {isDailyPurpose && typeof maxAssignableMin === 'number' && maxAssignableMin > 0 && (
              <p style={{ fontSize: '15px', color: '#b45309', fontWeight: 800, margin: '6px 0 0 0' }}>
                선택하신 타석은 다음 예약({nextLimitResStartTime || '예정'}) 전까지 최대 [{maxAssignableMin}분] 이용 가능합니다.
              </p>
            )}
          </div>
        </div>

        {/* 우측 액션: 모달 내 회원 인증 버튼 + 60px 애플 볼드 원형 닫기 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {onMemberAuthClick && !memberNo && (
            <button
              type="button"
              data-testid="product-shop-member-auth-btn"
              onClick={onMemberAuthClick}
              style={{
                height: '54px',
                padding: '0 20px',
                borderRadius: '999px',
                background: '#f5f5f7',
                border: '1.5px solid #d1d5db',
                color: '#1d1d1f',
                fontSize: '16px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                boxShadow: '0 3px 10px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease',
              }}
            >
              <UserCheck size={19} strokeWidth={2.5} />
              <span>회원 인증 / 로그인</span>
            </button>
          )}
          <button 
            onClick={onCancel}
            aria-label="돌아가기"
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#f1f5f9',
              border: '2px solid #cbd5e1',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
              flexShrink: 0
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = '#e2e8f0'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f1f5f9'; }}
          >
            <X size={28} strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {/* 일일 타석 배정 모드 시 2열 Double-Check 배정 티켓 (AssetSelectModal 동일 위계) */}
      {isDailyPurpose && selectedBay && (() => {
        const shopPreview = TimeMaster.buildBayAllocationPreview({
          bay: selectedBay,
          durationMin: null,
          prepareMin,
          storeCloseTime,
          storeOpenTime,
          isStore24h,
          now: nowOverride,
        });
        return (
          <div
            data-testid="product-shop-allocation-banner"
            style={{
              borderRadius: '24px',
              padding: '16px 20px',
              background: shopPreview.isWaitlist ? '#fffbeb' : '#f0fdf4',
              border: shopPreview.isWaitlist ? '2px solid #f59e0b' : '2px solid #6ee7b7',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '18px',
                padding: '16px 24px',
                border: shopPreview.isWaitlist ? '1.5px solid #fde68a' : '1.5px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#6e6e73' }}>선택 타석</span>
                  <span
                    style={{
                      padding: '3px 11px',
                      borderRadius: '999px',
                      background: shopPreview.isWaitlist ? '#d97706' : '#059669',
                      color: '#ffffff',
                      fontSize: '13.5px',
                      fontWeight: 900,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {shopPreview.modeBadgeText}
                  </span>
                </div>
                <span style={{ fontSize: '36px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                  {shopPreview.bayWithFloorLabel}
                </span>
              </div>

              <div style={{ width: '1.5px', height: '52px', background: '#e5e7eb', flexShrink: 0 }} />

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', gap: '4px', minWidth: 0 }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#6e6e73' }}>
                  {shopPreview.isWaitlist ? '대기 시작 안내' : '입장 안내'}
                </span>
                <span
                  style={{
                    fontSize: '30px',
                    fontWeight: 950,
                    color: shopPreview.isWaitlist ? '#b45309' : '#059669',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.6px',
                    lineHeight: 1.05,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shopPreview.isWaitlist
                    ? `${shopPreview.startHhmm} 입장 예정`
                    : `${shopPreview.startHhmm} 즉시 시작`}
                </span>
                <span style={{ fontSize: '14.5px', fontWeight: 700, color: shopPreview.isWaitlist ? '#92400e' : '#047857', whiteSpace: 'nowrap' }}>
                  {shopPreview.isWaitlist
                    ? `약 ${shopPreview.waitMinutes}분 대기 · 아래 시간 선택 시 종료 시각 확정`
                    : '아래 상품에서 이용 시간(종료 시각)을 선택하세요'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* 💳 Apple HIG 통일 카드 그리드 (활성 2열 균일 높이 + 이용 불가 하단 1줄 분리) */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px', fontSize: '20px', color: '#86868b', fontWeight: 700 }}>
          상품 정보를 로딩하고 있습니다...
        </div>
      ) : filteredProducts.length > 0 ? (() => {
        const preparedItems = filteredProducts.map((prod) => {
          const isDaily = checkIfDaily(prod);
          const durationMin = getDurationMin(prod);
          const specSummary = buildKioskProductSpecSummary(prod, {
            allStoreFloors,
            zoneLabelMap,
            hasActiveMembership,
          });
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
                  now: nowOverride,
                  allStoreFloors,
                  zoneLabelMap,
                  isStoreClosed,
                  storeClosedReason,
                  storeOpenTime,
                  storeCloseTime,
                  isStore24h,
                })
              : null;
          const isCardDisabled = Boolean(dailyEligibility && !dailyEligibility.eligible);
          const displayName = prod.meta_data?.display_nm || prod.prod_nm;
          const cardPreview =
            isDailyPurpose && selectedBay && durationMin > 0
              ? TimeMaster.buildBayAllocationPreview({
                  bay: selectedBay,
                  durationMin,
                  prepareMin,
                  storeCloseTime,
                  storeOpenTime,
                  isStore24h,
                  now: nowOverride,
                })
              : null;
          return {
            prod,
            durationMin,
            specSummary,
            hasGradeDiscount,
            finalPrice,
            hasAnyDiscount,
            priceFormatted,
            customBadge,
            targetGenderNorm,
            genderBadge,
            dailyEligibility,
            isCardDisabled,
            displayName,
            cardPreview,
          };
        });

        const activeItems = preparedItems.filter((item) => !item.isCardDisabled);
        const disabledItems = preparedItems.filter((item) => item.isCardDisabled);

        const handleProductItemClick = (item: (typeof preparedItems)[number]) => {
          const { prod, isCardDisabled, dailyEligibility, targetGenderNorm } = item;
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
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {activeItems.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: activeItems.length === 1 ? 'minmax(0, 480px)' : 'repeat(2, 1fr)',
                  justifyContent: activeItems.length === 1 ? 'center' : 'stretch',
                  gap: '20px',
                }}
              >
                {activeItems.map((item, idx) => {
                  const {
                    prod,
                    durationMin,
                    specSummary,
                    hasGradeDiscount,
                    hasAnyDiscount,
                    priceFormatted,
                    customBadge,
                    targetGenderNorm,
                    genderBadge,
                    displayName,
                    cardPreview,
                  } = item;
                  const isWaitlistCard = Boolean(cardPreview?.isWaitlist);
                  const typeMeta = resolveProductTypeMeta(specSummary.resolvedLogicType, isWaitlistCard);
                  const ctaColorClass =
                    isDailyPurpose
                      ? (isWaitlistCard ? 'decision-btn-amber' : 'decision-btn-blue')
                      : 'decision-btn-emerald';
                  const hasTimeBenefit =
                    specSummary.resolvedLogicType !== 'RETAIL' &&
                    specSummary.resolvedLogicType !== 'RENTAL' &&
                    durationMin > 0;
                  const nonTimeTokens = specSummary.benefitTokens.filter((tok) => {
                    const combined = `${tok.label}${tok.highlight ?? ''}${tok.suffix ?? ''}`;
                    return !(durationMin > 0 && combined.includes(`${durationMin}분`));
                  });

                  return (
                    <div
                      key={prod.prod_cd}
                      data-testid={`product-card-${prod.prod_cd}`}
                      data-duration={durationMin}
                      data-disabled="false"
                      className="shop-tactile-card"
                      onClick={() => handleProductItemClick(item)}
                      style={{
                        padding: '24px 24px 22px 24px',
                        borderRadius: '26px',
                        border: isWaitlistCard
                          ? '2px solid #fcd34d'
                          : isDailyPurpose
                            ? '2px solid #bfdbfe'
                            : '2px solid #a7f3d0',
                        background: isWaitlistCard
                          ? 'linear-gradient(180deg, #fffbeb 0%, #ffffff 42%)'
                          : isDailyPurpose
                            ? 'linear-gradient(180deg, #eff6ff 0%, #ffffff 42%)'
                            : 'linear-gradient(180deg, #f0fdf8 0%, #ffffff 42%)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '16px',
                        boxShadow: isWaitlistCard
                          ? '0 12px 30px rgba(217, 119, 6, 0.10), inset 0 1px 0 #ffffff'
                          : isDailyPurpose
                            ? '0 12px 30px rgba(0, 113, 227, 0.09), inset 0 1px 0 #ffffff'
                            : '0 12px 30px rgba(5, 150, 105, 0.09), inset 0 1px 0 #ffffff',
                        position: 'relative',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* [1단: 컬러 닷 + 한글 유형 라벨 + 영문 스펙 서브태그 & 우측 배지] */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '10px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: typeMeta.dotColor,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#4b5563', letterSpacing: '-0.2px' }}>
                            {typeMeta.label}
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.8px' }}>
                            {specSummary.headerTypeBadge}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {genderBadge && (
                            <span style={{
                              fontSize: '12.5px',
                              fontWeight: 800,
                              padding: '5px 12px',
                              borderRadius: '999px',
                              background: targetGenderNorm === 'F' ? '#fdf2f8' : '#eff6ff',
                              color: targetGenderNorm === 'F' ? '#db2777' : '#1d4ed8',
                              border: targetGenderNorm === 'F' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                            }}>
                              {genderBadge}
                            </span>
                          )}
                          {customBadge && (
                            <span style={{
                              fontSize: '12.5px',
                              fontWeight: 800,
                              padding: '5px 12px',
                              borderRadius: '999px',
                              background: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0'
                            }}>
                              {customBadge}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* [2단: 대형 상품명 + 시간·혜택 KPI + Exception-Only 제한 칩 (이모지 제거)] */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                        <h3 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.8px', margin: 0, lineHeight: 1.2, wordBreak: 'keep-all' }}>
                          {displayName}
                        </h3>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                          {hasTimeBenefit && (
                            <span
                              style={{
                                fontSize: '23px',
                                fontWeight: 900,
                                color: isWaitlistCard ? '#b45309' : (isDailyPurpose ? '#0071e3' : '#059669'),
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              1회 {durationMin}분
                            </span>
                          )}
                          {nonTimeTokens.map((tok, tokIdx) => (
                            <React.Fragment key={tokIdx}>
                              {(hasTimeBenefit || tokIdx > 0) && (
                                <span style={{ fontSize: '18px', color: '#cbd5e1', fontWeight: 700 }}>·</span>
                              )}
                              <span style={{ fontSize: '18px', color: '#475569', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                {tok.label}
                                {tok.highlight ? <strong style={{ color: '#047857' }}>{tok.highlight}</strong> : null}
                                {tok.suffix || ''}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>

                        {specSummary.restrictionChips.length > 0 && (
                          <div
                            data-testid={`product-restriction-chips-${prod.prod_cd}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                              marginTop: '4px'
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
                                    padding: '5px 11px',
                                    borderRadius: '999px',
                                    fontSize: '13.5px',
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    whiteSpace: 'nowrap',
                                    ...chipStyle
                                  }}
                                >
                                  {chip.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* [3단: 스노우 푸터 (AssetSelectModal 동일 골격 — 좌 요금 · 우 실시간 예상 이용시간)] */}
                      <div
                        style={{
                          background: '#f5f5f7',
                          borderRadius: '18px',
                          padding: '14px 18px',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13.5px', color: '#6e6e73', fontWeight: 700 }}>이용요금</span>
                            {hasAnyDiscount && (
                              <>
                                <span style={{ fontSize: '13.5px', color: '#94a3b8', textDecoration: 'line-through', fontWeight: 600 }}>
                                  {prod.standard_price.toLocaleString()}원
                                </span>
                                <span style={{ fontSize: '11.5px', fontWeight: 900, color: '#059669', background: '#dcfce7', padding: '2px 7px', borderRadius: '6px' }}>
                                  {hasGradeDiscount ? `${gradeName || 'VIP'} ${discountRate}%` : '할인가'}
                                </span>
                              </>
                            )}
                          </div>
                          <span style={{ fontSize: '31px', fontWeight: 950, color: hasAnyDiscount ? '#059669' : '#0f172a', letterSpacing: '-0.8px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                            {priceFormatted}원
                          </span>
                        </div>

                        {cardPreview && cardPreview.endHhmm && (
                          <div
                            style={{
                              flexShrink: 0,
                              textAlign: 'right',
                              paddingLeft: '14px',
                              borderLeft: '1px solid #d1d5db',
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#6e6e73', marginBottom: '2px' }}>
                              {cardPreview.isWaitlist ? '대기 예상 시간' : '예상 이용 시간'}
                            </div>
                            <div
                              style={{
                                fontSize: '23px',
                                fontWeight: 950,
                                color: cardPreview.isWaitlist ? '#b45309' : '#059669',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.1,
                              }}
                            >
                              {cardPreview.timeRangeLabel}
                            </div>
                            {cardPreview.prepareMin > 0 && (
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                ({cardPreview.effectiveDurationMin}분 + 준비 {cardPreview.prepareMin}분)
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* [4단: 3D 입체 택타일 결제 버튼 (교차 유리 광택 스윕 + 화살표 넛지)] */}
                      <button
                        type="button"
                        className={`decision-tactile-btn shop-tactile-btn ${ctaColorClass}`}
                        style={{ '--decision-sheen-delay': `${(idx % 4) * 0.6}s` } as React.CSSProperties}
                      >
                        <span style={{ position: 'relative', zIndex: 2 }}>
                          {priceFormatted}원 선택 및 결제
                        </span>
                        <ArrowRight
                          size={23}
                          strokeWidth={3}
                          className="decision-btn-arrow"
                          aria-hidden="true"
                          style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 이용 불가 상품 하단 1줄 분리 (AssetSelectModal disabledAssets 패턴 통일 — data-testid & reason 100% 보존) */}
            {disabledItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                {disabledItems.map((item) => {
                  const { prod, durationMin, specSummary, priceFormatted, dailyEligibility, displayName } = item;
                  return (
                    <div
                      key={prod.prod_cd}
                      data-testid={`product-card-${prod.prod_cd}`}
                      data-duration={durationMin}
                      data-disabled="true"
                      onClick={() => handleProductItemClick(item)}
                      style={{
                        width: '100%',
                        borderRadius: '20px',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f5f5f7',
                        opacity: 0.82,
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        padding: '16px 22px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '21px', fontWeight: 800, color: '#4b5563' }}>
                            {displayName}
                          </span>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: '#6e6e73', fontVariantNumeric: 'tabular-nums' }}>
                            {priceFormatted}원
                          </span>
                          {dailyEligibility?.badgeLabel && (
                            <span
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 800,
                                padding: '3px 10px',
                                borderRadius: '999px',
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fcd34d',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {dailyEligibility.badgeLabel}
                            </span>
                          )}
                        </div>
                        {specSummary.restrictionChips.length > 0 && (
                          <div
                            data-testid={`product-restriction-chips-${prod.prod_cd}`}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
                          >
                            {specSummary.restrictionChips.map((chip) => (
                              <span
                                key={chip.key}
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 700,
                                  color: '#475569',
                                  background: '#e2e8f0',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                }}
                              >
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled
                        style={{
                          padding: '9px 16px',
                          borderRadius: '999px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#dc2626',
                          fontSize: '15px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          cursor: 'not-allowed',
                          flexShrink: 0,
                        }}
                      >
                        {dailyEligibility?.buttonLabel || '현재 선택 불가'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })() : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '10px' }}>
          <span style={{ fontSize: '18px', color: '#86868b', fontWeight: 700 }}>이 카테고리에는 판매 중인 상품이 없습니다.</span>
        </div>
      )}

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
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                margin: '0 auto 16px auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: warningMessage.includes('다음 예약') || warningTitle?.includes('시간')
                  ? '#fffbeb'
                  : warningTitle?.includes('구역')
                    ? '#eff6ff'
                    : '#fef2f2',
                color: warningMessage.includes('다음 예약') || warningTitle?.includes('시간')
                  ? '#d97706'
                  : warningTitle?.includes('구역')
                    ? '#0071e3'
                    : '#dc2626',
              }}
            >
              {warningMessage.includes('다음 예약') || warningTitle?.includes('시간') ? (
                <Clock size={36} strokeWidth={2.4} />
              ) : warningTitle?.includes('구역') ? (
                <Compass size={36} strokeWidth={2.4} />
              ) : (
                <ShieldAlert size={36} strokeWidth={2.4} />
              )}
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
