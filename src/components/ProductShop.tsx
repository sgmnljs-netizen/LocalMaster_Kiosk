import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2, CreditCard, ShoppingBag, X, Layers, Ticket } from 'lucide-react';
import { api, Product } from '../services/api';

interface ProductShopProps {
  memberNo?: string;
  memberName?: string;
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
  purposeType,
  onProductSelected,
  onCancel
}) => {
  // activeTab: number(동적 카테고리 ID) 또는 'DAILY_PASS'(일일 타석 배정권 고정 탭)
  const [activeTab, setActiveTab] = useState<number | 'DAILY_PASS'>('DAILY_PASS');
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

        // 2. 전체 상품 로드 (일일 타석권 추출용)
        const products = await api.getProducts();
        setAllProducts(products);

        // 기본 활성 탭 설정
        if (purposeType === 'ALLOCATE_DAILY') {
          setActiveTab('DAILY_PASS');
        } else if (categories.length > 0) {
          if (memberNo) {
            // 회원 로그인 상태 ➔ 첫 번째 동적 카테고리 탭 (예: 회원권) 기본 선택
            setActiveTab(categories[0].category_id);
          } else {
            // 비로그인 상태 ➔ 일일 타석 배정권 탭 기본 선택 (비회원은 장기 회원권 구매 불가)
            setActiveTab('DAILY_PASS');
          }
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

  // 일일 타석 배정권 여부 판별 헬퍼
  const checkIfDaily = (prod: Product) => {
    return prod.logic_type === 'DAILY' && (prod.prod_cd.startsWith('D') || prod.prod_nm.includes('일일타석'));
  };

  // 일일 타석 배정권 시간(분) 추출 헬퍼 (DB의 duration_min이 None/null인 케이스 대응)
  const getDurationMin = (prod: Product) => {
    if (prod.duration_min != null && prod.duration_min > 0) return prod.duration_min;
    if (prod.prod_cd === 'D001') return 60;
    if (prod.prod_cd === 'D002') return 90;
    const match = prod.prod_nm.match(/(\d+)분/);
    return match ? parseInt(match[1]) : 60;
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
      className="glass-panel" 
      style={{
        width: '1000px',
        margin: '15px auto',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '30px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 상품 매대 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <ShoppingBag size={34} style={{ color: 'var(--neon-indigo)' }} />
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 900 }}>
              {purposeType === 'ALLOCATE_DAILY' ? '일일 타석권 선택 및 결제' : '회원권 및 일일타석권 구매'}
            </h2>
            {memberName ? (
              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                회원번호: <strong style={{ color: '#fff' }}>{memberNo} ({memberName})</strong> 님 전용 구매
              </p>
            ) : (
              <p style={{ fontSize: '15px', color: 'var(--neon-amber)', fontWeight: 700, marginTop: '2px' }}>
                {purposeType === 'ALLOCATE_DAILY' 
                  ? '※ 원하시는 이용 시간(N분)을 선택하여 결제를 진행해 주세요.'
                  : '※ 비회원 신규 구매 시 타석 자동 연동 배정'}
              </p>
            )}
          </div>
        </div>

        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <X size={18} />
          돌아가기
        </button>
      </div>

      {/* 동적 카테고리 & 고정 일일권 탭 목록 (일일권 배정 모드일 때는 숨김 처리) */}
      {purposeType !== 'ALLOCATE_DAILY' && (
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${displayCategories.length + 1}, 1fr)`, 
            gap: '12px' 
          }}
        >
          {/* 1. 스샷1 어드민에서 설정한 동적 카테고리 탭 렌더링 */}
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

          {/* 2. 가장 마지막에 고정 노출되는 일일 타석 배정권 탭 */}
          <button
            onClick={() => setActiveTab('DAILY_PASS')}
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
              color: activeTab === 'DAILY_PASS' ? '#fff' : 'var(--text-secondary)',
              background: activeTab === 'DAILY_PASS' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
              borderColor: activeTab === 'DAILY_PASS' ? 'var(--neon-indigo)' : 'var(--glass-border)',
              boxShadow: activeTab === 'DAILY_PASS' ? '0 0 15px var(--neon-indigo-glow)' : 'none'
            }}
          >
            <CreditCard size={18} />
            일일 타석 배정권 (즉시 입장)
          </button>
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
            const priceFormatted = prod.standard_price.toLocaleString();

            return (
              <div
                key={prod.prod_cd}
                className="glass-card"
                onClick={() => onProductSelected(prod)}
                style={{
                  padding: '30px',
                  borderRadius: '20px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '20px',
                  transition: 'transform 0.2s ease, border-color 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--neon-indigo)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* 카드 우측 상단 인기/추천 배지 */}
                <div style={{ position: 'absolute', top: '15px', right: '15px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 900,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    background: isDaily ? 'rgba(16, 185, 129, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                    color: isDaily ? '#10b981' : '#6366f1',
                    border: isDaily ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(79,70,229,0.2)'
                  }}>
                    {isDaily ? '즉시 배정' : '기간 이용권'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary, #4b5563)', fontWeight: 700 }}>
                    {isDaily ? 'DAILY PASS' : 'MEMBERSHIP'}
                  </span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #111827)', letterSpacing: '-0.5px' }}>
                    {prod.prod_nm}
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary, #4b5563)', fontSize: '14px' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--neon-indigo)' }} />
                    <span>
                      {isDaily ? `타석 지정 즉시 입장 (${durationMin}분)` : `정기 기간 적용 (${prod.days}일 이용 가능)`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary, #4b5563)', fontSize: '14px' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--neon-indigo)' }} />
                    <span>신용카드 결제 및 승인 즉시 자동 연동 가동</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '10px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary, #4b5563)' }}>이용요금</span>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: 'var(--neon-emerald, #059669)' }}>
                    {priceFormatted}원
                  </span>
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
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          padding: '20px 24px',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6'
        }}
      >
        <strong style={{ color: 'var(--neon-indigo)', display: 'block', marginBottom: '6px' }}>[무인 키오스크 구매 안내]</strong>
        • 일일 타석권은 결제 즉시 타석 선택창으로 전환되며, 10분 내로 타석에 입장하여 주셔야 이용이 개시됩니다.<br />
        • 모든 결제는 신용카드만 가능하며, 현금 결제나 환불은 파트너센터 및 주간 관리 데스크로 문의해 주세요.
      </div>
    </div>
  );
};
