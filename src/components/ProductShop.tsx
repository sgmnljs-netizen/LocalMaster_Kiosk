import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2, CreditCard, ShoppingBag, X, Layers, Ticket, Hand } from 'lucide-react';
import { api, Product } from '../services/api';

interface ProductShopProps {
  memberNo?: string;
  memberName?: string;
  memberGender?: string;
  discountRate?: number;
  gradeName?: string;
  purposeType?: 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT' | 'SELECT_DAILY_PASS';
  maxAssignableMin?: number | null;
  nextLimitResStartTime?: string | null;
  initialProducts?: Product[];
  onProductSelected: (product: Product) => void;
  onCancel: () => void;
}

interface DisplayCategoryItem {
  category_id: number;
  name: string;
  sort_order: number;
  items: any[];
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
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // 일일 타석 배정권 여부 판별 헬퍼 (상품 DB 속성 직접 참조)
  const checkIfDaily = (prod: Product) => {
    const logicUpper = (prod.logic_type || '').toUpperCase();
    if (logicUpper === 'PERIOD' || logicUpper === 'COUNT' || logicUpper === 'COUPON') {
      return false;
    }
    if (logicUpper === 'DAILY' || logicUpper === 'DAY') {
      return true;
    }
    const isDailyLogic = logicUpper === 'FACILITY';
    const isDailyCd = (prod.prod_cd || '').startsWith('D') || (prod.prod_cd || '').startsWith('P01') || (prod.prod_cd || '').startsWith('P02');
    const isDailyName = (prod.prod_nm || '').includes('일일') || (prod.prod_nm || '').includes('당일');
    const hasDuration = prod.duration_min != null && prod.duration_min > 0;
    return (isDailyLogic || isDailyCd || isDailyName) && hasDuration;
  };

  const nonDailyFilter = (p: Product) => {
    const lt = (p.logic_type || '').toUpperCase();
    return lt !== 'DAILY' && lt !== 'RENTAL' && !checkIfDaily(p);
  };

  useEffect(() => {
    const loadKioskShopData = async () => {
      setLoading(true);
      try {
        // 1. KIOSK 용 전시 카테고리 로드
        const categories = await api.getKioskDisplayCategories();

        // 2. 전체 상품 로드
        const products = await api.getProducts();
        setAllProducts(products);

        // 🛡️ BUG-S06: PURCHASE_PRODUCT 모드에서는 일일권/라카만 들어있어 필터링 후 0개가 되는 빈 탭을 제외하고,
        // 유효한 회원권/횟수권/레슨 상품이 1개 이상 존재하는 카테고리만 탭으로 구성 (모두 비어있으면 전체 폴백)
        const isDailyMode = purposeType === 'ALLOCATE_DAILY' || purposeType === 'SELECT_DAILY_PASS';
        const filteredCategories = isDailyMode
          ? categories
          : categories.filter((cat: DisplayCategoryItem) => {
              const items = Array.isArray(cat.items) ? cat.items : [];
              return items.some((item: any) => {
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
        setLoading(false);
      }
    };
    loadKioskShopData();
  }, [memberNo, purposeType]);

  // 일일 타석 배정권 시간(분) 추출 헬퍼 (DB 물리 컬럼 ➔ time_min ➔ JSON access_rules/rules_detail 직접 참조)
  const getDurationMin = (prod: Product) => {
    if (prod.duration_min != null && prod.duration_min > 0) return prod.duration_min;
    if (prod.time_min != null && prod.time_min > 0) return prod.time_min;
    const jsonDuration = prod.access_rules?.duration_min || prod.rules_detail?.duration_min;
    if (jsonDuration != null && jsonDuration > 0) return Number(jsonDuration);
    return 60;
  };

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
      setWarningMessage('장기 정기권 및 지정 시설 상품 구매는 회원 인증이 필요합니다.\n처음 화면으로 돌아가 회원 조회를 먼저 완료해 주십시오.');
      return;
    }
    setActiveTab(tabId);
  };

  return (
    <div 
      style={{
        width: '100%',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* 상품 매대 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: '#0071e3',
            borderRadius: '50%',
            width: '52px',
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 113, 227, 0.3)'
          }}>
            <ShoppingBag size={26} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
              {isDailyPurpose ? '일일 타석권 선택 및 결제' : '회원권 및 정기 서비스 구매'}
            </h2>
            {memberName ? (
              <p style={{ fontSize: '15px', color: '#86868b', marginTop: '4px', margin: 0 }}>
                회원번호: <strong style={{ color: '#1d1d1f' }}>{memberNo} ({memberName})</strong> 님 전용 구매
              </p>
            ) : (
              <p style={{ fontSize: '15px', color: '#d97706', fontWeight: 700, marginTop: '4px', margin: 0 }}>
                {isDailyPurpose 
                  ? '※ 원하시는 이용 시간(N분)을 선택하여 결제를 진행해 주세요.'
                  : '※ 회원 전용 상품으로 정기 회원권 및 부가 서비스를 구매하실 수 있습니다.'}
              </p>
            )}
            {isDailyPurpose && typeof maxAssignableMin === 'number' && maxAssignableMin > 0 && (
              <p style={{ fontSize: '14px', color: '#dc2626', fontWeight: 800, marginTop: '4px', margin: 0 }}>
                ⚠️ 선택하신 타석은 다음 예약({nextLimitResStartTime || '예정'}) 전까지 최대 [{maxAssignableMin}분] 이용 가능합니다.
              </p>
            )}
          </div>
        </div>

        <button 
          onClick={onCancel}
          style={{
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            color: '#1d1d1f',
            padding: '12px 24px',
            borderRadius: '16px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#e8e8ed'}
          onMouseOut={(e) => e.currentTarget.style.background = '#f5f5f7'}
        >
          <X size={18} />
          돌아가기
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
                  padding: '16px 14px',
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
                <Layers size={18} />
                {cat.name}
              </button>
            );
          })}
        </div>
      )}


      {/* 상품 목록 리스트 */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '24px',
          minHeight: '320px'
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
            const rawLogicType = (prod.logic_type || '').toUpperCase();
            const totalCount = prod.total_count ?? prod.access_rules?.total_count ?? prod.rules_detail?.total_count ?? 0;
            const days = prod.days ?? prod.access_rules?.days ?? prod.rules_detail?.days ?? 0;

            const resolvedLogicType: 'COUNT' | 'PERIOD' | 'DAILY' =
              rawLogicType === 'COUNT' || rawLogicType === 'COUPON' || (!isDaily && totalCount > 0)
                ? 'COUNT'
                : isDaily
                  ? 'DAILY'
                  : 'PERIOD';

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

            // 2. 배지(badge) 및 노출 상품명(display_nm) 동적 반영 (하드코딩 제거)
            const customBadge = prod.meta_data?.pos_button?.badge || prod.meta_data?.badges?.[0] || null;
            const rawTargetGender = String(
              prod.target_gender || prod.access_rules?.restricted_gender || prod.rules_detail?.restricted_gender || 'ALL'
            ).toUpperCase();
            const targetGenderNorm = rawTargetGender === 'MALE' ? 'M' : rawTargetGender === 'FEMALE' ? 'F' : rawTargetGender;
            const genderBadge = targetGenderNorm === 'F' ? '여성 전용' : targetGenderNorm === 'M' ? '남성 전용' : null;
            const isDurationExceeded = Boolean(
              isDailyPurpose &&
              isDaily &&
              typeof maxAssignableMin === 'number' &&
              maxAssignableMin > 0 &&
              durationMin > maxAssignableMin
            );
            const badgeText = isDurationExceeded
              ? `⚠️ 최대 ${maxAssignableMin}분 가능 (초과)`
              : (customBadge ? customBadge : `${durationMin}분 이용`);
            const displayName = prod.meta_data?.display_nm || prod.prod_nm;

            return (
              <div
                key={prod.prod_cd}
                data-testid={`product-card-${prod.prod_cd}`}
                data-duration={durationMin}
                data-disabled={isDurationExceeded ? 'true' : 'false'}
                onClick={() => {
                  if (isDurationExceeded) {
                    setWarningMessage(
                      `선택하신 타석은 다음 예약(${nextLimitResStartTime || '예정'})으로 인해 최대 [${maxAssignableMin}분]까지만 이용 가능합니다.\n\n${durationMin}분 상품을 이용하시려면 우측 상단 [돌아가기]를 눌러 다른 타석을 선택해 주세요.`
                    );
                    return;
                  }
                  if (!memberNo && (prod.logic_type || '').toUpperCase() !== 'DAILY' && !checkIfDaily(prod)) {
                    setWarningMessage('회원 전용 상품입니다. 먼저 회원 인증을 진행해 주세요.');
                    return;
                  }
                  if (targetGenderNorm === 'M' || targetGenderNorm === 'F') {
                    const normMemGender = String(memberGender || '').toUpperCase();
                    const memG = normMemGender === 'MALE' || normMemGender === '남' ? 'M' : normMemGender === 'FEMALE' || normMemGender === '여' ? 'F' : normMemGender;
                    if (memG && memG !== targetGenderNorm) {
                      const reqLabel = targetGenderNorm === 'F' ? '여성' : '남성';
                      setWarningMessage(`선택하신 상품은 [${reqLabel} 회원 전용] 상품입니다.\n다른 상품을 선택해 주세요.`);
                      return;
                    }
                  }
                  onProductSelected(prod);
                }}
                style={{
                  padding: '36px 30px',
                  borderRadius: '28px',
                  border: isDurationExceeded ? '1.5px dashed #cbd5e1' : '1px solid #e5e5ea',
                  background: isDurationExceeded ? '#f8fafc' : '#ffffff',
                  opacity: isDurationExceeded ? 0.56 : 1,
                  cursor: isDurationExceeded ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '24px',
                  boxShadow: isDurationExceeded ? 'none' : '0 10px 30px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  if (isDurationExceeded) return;
                  e.currentTarget.style.borderColor = '#0071e3';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 15px 40px rgba(0, 113, 227, 0.12)';
                }}
                onMouseLeave={(e) => {
                  if (isDurationExceeded) return;
                  e.currentTarget.style.borderColor = '#e5e5ea';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.04)';
                }}
              >
                {/* 상단 뱃지 및 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 700, letterSpacing: '0.5px' }}>
                    {resolvedLogicType === 'DAILY'
                      ? 'DAILY PASS'
                      : resolvedLogicType === 'COUNT'
                        ? 'COUNT PASS'
                        : 'MEMBERSHIP'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {genderBadge && (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        padding: '6px 12px',
                        borderRadius: '999px',
                        background: targetGenderNorm === 'F' ? '#ec4899' : '#2563eb',
                        color: '#ffffff',
                      }}>
                        {genderBadge}
                      </span>
                    )}
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      padding: '6px 14px',
                      borderRadius: '999px',
                      background: isDurationExceeded ? '#fef3c7' : (customBadge ? '#34c759' : '#0071e3'),
                      color: isDurationExceeded ? '#b45309' : '#ffffff',
                      border: isDurationExceeded ? '1px solid #fcd34d' : 'none',
                      boxShadow: isDurationExceeded ? 'none' : (customBadge ? '0 4px 12px rgba(52, 199, 89, 0.25)' : '0 4px 12px rgba(0, 113, 227, 0.25)')
                    }}>
                      {badgeText}
                    </span>
                  </div>
                </div>

                {/* 48px SF Pro Display 대형 스펙 표출 (COUNT / PERIOD / DAILY 분기) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.8px' }}>
                    {displayName}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                    {resolvedLogicType === 'COUNT' ? (
                      <>
                        <span style={{ fontSize: '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1.5px' }}>
                          {totalCount}회
                        </span>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: '#86868b' }}>
                          1회 {durationMin}분
                        </span>
                      </>
                    ) : resolvedLogicType === 'PERIOD' ? (
                      <>
                        <span style={{ fontSize: '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1.5px' }}>
                          {days > 0 ? `${days}일` : `1회 ${durationMin}분`}
                        </span>
                        {days > 0 && (
                          <span style={{ fontSize: '20px', fontWeight: 700, color: '#86868b' }}>
                            1회 {durationMin}분
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1.5px' }}>
                          {durationMin}분
                        </span>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: '#86868b' }}>
                          타석 이용권
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* 상품 혜택 안내 목록 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #e5e5ea', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d1d1f', fontSize: '15px', fontWeight: 600 }}>
                    <CheckCircle2 size={18} style={{ color: '#0071e3' }} />
                    <span>
                      {resolvedLogicType === 'COUNT'
                        ? (days > 0
                            ? `유효기간 ${days}일 (1회 ${durationMin}분)`
                            : `횟수 차감형 이용권 (1회 ${durationMin}분)`)
                        : resolvedLogicType === 'PERIOD'
                          ? `기간제 이용권 (${days}일 / 1일 ${durationMin}분)`
                          : '당일 1회 즉시 배정 전용'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#86868b', fontSize: '14px', fontWeight: 500 }}>
                    <CheckCircle2 size={18} style={{ color: '#34c759' }} />
                    <span>신용카드 결제 및 승인 즉시 자동 연동 가동</span>
                  </div>
                </div>

                {/* 가격 및 애플 필 구매 버튼 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 600 }}>이용요금</span>
                      {hasAnyDiscount && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', color: '#86868b', textDecoration: 'line-through' }}>
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
                    <span style={{ fontSize: '28px', fontWeight: 900, color: hasAnyDiscount ? '#059669' : '#1d1d1f', letterSpacing: '-0.8px' }}>
                      {priceFormatted}원
                    </span>
                  </div>

                  <button
                    disabled={isDurationExceeded}
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '999px',
                      background: isDurationExceeded ? '#e2e8f0' : '#1d1d1f',
                      color: isDurationExceeded ? '#64748b' : '#ffffff',
                      border: 'none',
                      fontSize: '17px',
                      fontWeight: 700,
                      letterSpacing: '-0.3px',
                      cursor: isDurationExceeded ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: isDurationExceeded ? 'none' : '0 6px 18px rgba(0, 0, 0, 0.12)',
                      transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                    }}
                  >
                    {isDurationExceeded ? (
                      <span>다음 예약({nextLimitResStartTime || '예정'})으로 선택 불가 (최대 {maxAssignableMin}분)</span>
                    ) : (
                      <>
                        <Hand size={18} className="animate-hand-tap" style={{ color: customBadge ? '#34c759' : '#2997ff' }} />
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

      {/* 회원 전용 상품 인증 및 시간 초과 안내 모달 (동기식 alert 대체) */}
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
              {warningMessage.includes('다음 예약') ? '⏰' : '🔒'}
            </div>
            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f', marginBottom: '12px' }}>
              {warningMessage.includes('다음 예약')
                ? '이용 시간 초과 상품 안내'
                : (warningMessage.includes('전용]') ? '상품 구매 제한 안내' : '회원 인증 필요')}
            </h3>
            <p style={{ fontSize: '16px', color: '#515154', lineHeight: '1.6', whiteSpace: 'pre-line', marginBottom: '28px', fontWeight: 600 }}>
              {warningMessage}
            </p>
            <button
              onClick={() => setWarningMessage(null)}
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
