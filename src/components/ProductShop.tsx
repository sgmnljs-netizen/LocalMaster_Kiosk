import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2, CreditCard, ShoppingBag, X, Layers, Ticket, Hand } from 'lucide-react';
import { api, Product } from '../services/api';

interface ProductShopProps {
  memberNo?: string;
  memberName?: string;
  discountRate?: number;
  gradeName?: string;
  purposeType?: 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT';
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
  discountRate = 0,
  gradeName,
  purposeType,
  onProductSelected,
  onCancel
}) => {
  // activeTab: number(동적 카테고리 ID) 또는 'DAILY_PASS'(일일 타석 배정 모드 전용 탭)
  const [activeTab, setActiveTab] = useState<number | 'DAILY_PASS'>(
    purposeType === 'ALLOCATE_DAILY' ? 'DAILY_PASS' : 0
  );
  const [displayCategories, setDisplayCategories] = useState<DisplayCategoryItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadKioskShopData = async () => {
      setLoading(true);
      try {
        // 1. KIOSK 용 전시 카테고리 로드
        const categories = await api.getKioskDisplayCategories();
        setDisplayCategories(categories);

        // 2. 전체 상품 로드
        const products = await api.getProducts();
        setAllProducts(products);

        // 기본 활성 탭 설정
        if (purposeType === 'ALLOCATE_DAILY') {
          setActiveTab('DAILY_PASS');
        } else if (categories.length > 0) {
          // 회원권 구매 모드: 무조건 첫 번째 전시 카테고리(예: 회원권) 기본 선택
          setActiveTab(categories[0].category_id);
        } else {
          setActiveTab('DAILY_PASS');
        }
      } catch (err) {
        console.error('Failed to load kiosk shop data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadKioskShopData();
  }, [memberNo, purposeType]);

  // 일일 타석 배정권 여부 판별 헬퍼 (상품 DB 속성 직접 참조)
  const checkIfDaily = (prod: Product) => {
    const isDailyLogic = (prod.logic_type as string) === 'DAILY' || (prod.logic_type as string) === 'DAY' || (prod.logic_type as string) === 'FACILITY';
    const isDailyCd = prod.prod_cd.startsWith('D') || prod.prod_cd.startsWith('P01') || prod.prod_cd.startsWith('P02');
    const isDailyName = prod.prod_nm.includes('일일') || prod.prod_nm.includes('타석권') || prod.prod_nm.includes('60분') || prod.prod_nm.includes('90분');
    const hasDuration = prod.duration_min != null && prod.duration_min > 0;
    return (isDailyLogic || isDailyCd || isDailyName) && hasDuration;
  };

  // 일일 타석 배정권 시간(분) 추출 헬퍼 (DB 물리 컬럼 ➔ JSON access_rules/rules_detail 직접 참조)
  const getDurationMin = (prod: Product) => {
    if (prod.duration_min != null && prod.duration_min > 0) return prod.duration_min;
    const jsonDuration = (prod as any).access_rules?.duration_min || (prod as any).rules_detail?.duration_min;
    if (jsonDuration != null && jsonDuration > 0) return jsonDuration;
    return 60;
  };

  // 현재 탭에 맞는 노출 상품 목록 필터링
  const getFilteredProducts = (): Product[] => {
    if (activeTab === 'DAILY_PASS') {
      // 일일 타석 배정권 전용 필터링 (checkIfDaily 사용)
      return allProducts.filter(checkIfDaily);
    } else {
      // 동적 전시 카테고리 상품 매핑
      const matchedCat = displayCategories.find(c => c.category_id === activeTab);
      if (!matchedCat) return [];
      
      // 해당 카테고리에 매핑된 prod_cd 리스트에 대응되는 실제 Product 객체 빌드
      const catProdCodes = matchedCat.items.map(item => item.prod_cd);
      return allProducts.filter(p => catProdCodes.includes(p.prod_cd));
    }
  };

  const filteredProducts = getFilteredProducts();

  // 비회원의 장기 회원권 탭 진입 차단 처리
  const handleTabClick = (tabId: number | 'DAILY_PASS', tabName: string) => {
    if (tabId !== 'DAILY_PASS' && !memberNo && (tabName.includes('회원') || tabName.includes('정기') || tabName.includes('라카'))) {
      alert('장기 정기권 및 지정 시설 상품 구매는 회원 인증이 필요합니다. 처음 화면으로 돌아가 회원 조회를 먼저 완료해 주십시오.');
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
              {purposeType === 'ALLOCATE_DAILY' ? '일일 타석권 선택 및 결제' : '회원권 및 정기 서비스 구매'}
            </h2>
            {memberName ? (
              <p style={{ fontSize: '15px', color: '#86868b', marginTop: '4px', margin: 0 }}>
                회원번호: <strong style={{ color: '#1d1d1f' }}>{memberNo} ({memberName})</strong> 님 전용 구매
              </p>
            ) : (
              <p style={{ fontSize: '15px', color: '#d97706', fontWeight: 700, marginTop: '4px', margin: 0 }}>
                {purposeType === 'ALLOCATE_DAILY' 
                  ? '※ 원하시는 이용 시간(N분)을 선택하여 결제를 진행해 주세요.'
                  : '※ 회원 전용 상품으로 정기 회원권 및 부가 서비스를 구매하실 수 있습니다.'}
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
      {purposeType !== 'ALLOCATE_DAILY' && (
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${displayCategories.length}, 1fr)`, 
            gap: '12px' 
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
                  padding: '20px 10px',
                  fontSize: '18px',
                  fontWeight: 800,
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: isLocked ? 0.35 : 1,
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  background: isActive ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
                  borderColor: isActive ? 'var(--neon-indigo)' : 'var(--glass-border)',
                  boxShadow: isActive ? '0 0 15px var(--neon-indigo-glow)' : 'none'
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
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: 'var(--text-secondary)' }}>
            상품 정보를 로딩하고 있습니다...
          </div>
        ) : filteredProducts.length > 0 ? (
          filteredProducts.map((prod) => {
            const isDaily = checkIfDaily(prod);
            const durationMin = getDurationMin(prod);
            const basePrice = prod.standard_price;
            const hasDiscount = Boolean(discountRate && discountRate > 0);
            const discountAmt = hasDiscount ? Math.round(basePrice * (discountRate! / 100)) : 0;
            const finalPrice = Math.max(0, basePrice - discountAmt);
            const priceFormatted = finalPrice.toLocaleString();

            return (
              <div
                key={prod.prod_cd}
                onClick={() => onProductSelected(prod)}
                style={{
                  padding: '36px 30px',
                  borderRadius: '28px',
                  border: '1px solid #e5e5ea',
                  background: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '24px',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#0071e3';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 15px 40px rgba(0, 113, 227, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e5ea';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.04)';
                }}
              >
                {/* 상단 뱃지 및 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 700, letterSpacing: '0.5px' }}>
                    {isDaily ? 'DAILY PASS' : 'MEMBERSHIP'}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '6px 14px',
                    borderRadius: '999px',
                    background: durationMin === 60 ? '#34c759' : '#0071e3',
                    color: '#ffffff',
                    boxShadow: durationMin === 60 ? '0 4px 12px rgba(52, 199, 89, 0.25)' : '0 4px 12px rgba(0, 113, 227, 0.25)'
                  }}>
                    {durationMin === 60 ? '★ BEST 60분' : `${durationMin}분 이용`}
                  </span>
                </div>

                {/* 48px SF Pro Display 대형 이용시간 표출 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.8px' }}>
                    {prod.prod_nm}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1.5px' }}>
                      {durationMin}
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#86868b' }}>
                      분 타석 이용권
                    </span>
                  </div>
                </div>

                {/* 상품 혜택 안내 목록 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #e5e5ea', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d1d1f', fontSize: '15px', fontWeight: 600 }}>
                    <CheckCircle2 size={18} style={{ color: '#0071e3' }} />
                    <span>{isDaily ? `타석 지정 후 즉시 입장 (${durationMin}분)` : `정기 기간 적용 (${prod.days}일 이용)`}</span>
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
                      {hasDiscount && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', color: '#86868b', textDecoration: 'line-through' }}>
                            {basePrice.toLocaleString()}원
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: '6px' }}>
                            {gradeName || 'VIP'} {discountRate}% 할인
                          </span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 900, color: hasDiscount ? '#059669' : '#1d1d1f', letterSpacing: '-0.8px' }}>
                      {priceFormatted}원
                    </span>
                  </div>

                  <button
                    style={{
                      width: '100%',
                      height: '56px',
                      borderRadius: '999px',
                      background: '#1d1d1f',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '17px',
                      fontWeight: 700,
                      letterSpacing: '-0.3px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
                      transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                    }}
                  >
                    <Hand size={18} className="animate-hand-tap" style={{ color: durationMin === 60 ? '#34c759' : '#2997ff' }} />
                    <span>{priceFormatted}원 선택 및 결제</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '10px' }}>
            <span style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 700 }}>이 카테고리에는 판매 중인 상품이 없습니다.</span>
          </div>
        )}
      </div>

      {/* 하단 구매 안내 문구 */}
      <div 
        style={{
          background: 'rgba(0, 113, 227, 0.04)',
          border: '1px solid rgba(0, 113, 227, 0.12)',
          borderRadius: '20px',
          padding: '20px 24px',
          fontSize: '14px',
          color: '#515154',
          lineHeight: '1.6'
        }}
      >
        <strong style={{ color: '#0071e3', display: 'block', marginBottom: '6px', fontSize: '15px', fontWeight: 800 }}>[무인 키오스크 구매 안내]</strong>
        • 일일 타석권은 결제 즉시 타석 선택창으로 전환되며, 10분 내로 타석에 입장하여 주셔야 이용이 개시됩니다.<br />
        • 모든 결제는 신용카드만 가능하며, 현금 결제나 환불은 파트너센터 및 주간 관리 데스크로 문의해 주세요.
      </div>
    </div>
  );
};
