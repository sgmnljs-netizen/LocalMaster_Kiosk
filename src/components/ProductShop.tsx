import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckCircle2, CreditCard, ShoppingBag, X } from 'lucide-react';
import { api, Product } from '../services/api';

interface ProductShopProps {
  memberNo?: string;
  memberName?: string;
  onProductSelected: (product: Product) => void;
  onCancel: () => void;
}

export const ProductShop: React.FC<ProductShopProps> = ({
  memberNo,
  memberName,
  onProductSelected,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'DAILY' | 'MEMBERSHIP'>('DAILY');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProds = async () => {
      setLoading(true);
      try {
        const prods = await api.getProducts();
        setProducts(prods);
      } catch {
        console.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProds();
  }, []);

  // 카테고리 필터링
  // 일일권: duration_min이 존재하거나 DAILY 유형
  // 회원권: days가 30일 이상이고 FACILITY(라카)가 아닌 상품
  const filteredProducts = products.filter(p => {
    if (p.logic_type === 'FACILITY') return false; // 라카는 다른 화면에서 처리
    if (activeTab === 'DAILY') {
      return p.duration_min !== undefined;
    } else {
      return p.days !== undefined && p.days >= 30;
    }
  });

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
            <h2 style={{ fontSize: '30px', fontWeight: 900 }}>회원권 및 일일타석권 구매</h2>
            {memberName ? (
              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                회원번호: <strong style={{ color: '#fff' }}>{memberNo} ({memberName})</strong> 님 전용 구매
              </p>
            ) : (
              <p style={{ fontSize: '15px', color: 'var(--neon-amber)', fontWeight: 700, marginTop: '2px' }}>
                ※ 비회원 신규 구매 시 타석 자동 연동 배정
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
          이전으로
        </button>
      </div>

      {/* 카테고리 선택 탭 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <button
          onClick={() => setActiveTab('DAILY')}
          style={{
            padding: '24px',
            fontSize: '22px',
            fontWeight: 800,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            border: '1px solid',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: activeTab === 'DAILY' ? '#fff' : 'var(--text-secondary)',
            background: activeTab === 'DAILY' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
            borderColor: activeTab === 'DAILY' ? 'var(--neon-indigo)' : 'var(--glass-border)',
            boxShadow: activeTab === 'DAILY' ? '0 0 20px var(--neon-indigo-glow)' : 'none'
          }}
        >
          <CreditCard size={24} />
          일일 타석 배정권 (당일 즉시 입장)
        </button>

        <button
          onClick={() => {
            if (!memberNo) {
              alert('회원권 구매는 회원인증이 필요합니다. 회원인증을 먼저 진행해 주세요.');
              return;
            }
            setActiveTab('MEMBERSHIP');
          }}
          style={{
            padding: '24px',
            fontSize: '22px',
            fontWeight: 800,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            border: '1px solid',
            cursor: !memberNo ? 'not-allowed' : 'pointer',
            opacity: !memberNo ? 0.4 : 1,
            transition: 'all 0.2s ease',
            color: activeTab === 'MEMBERSHIP' ? '#fff' : 'var(--text-secondary)',
            background: activeTab === 'MEMBERSHIP' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
            borderColor: activeTab === 'MEMBERSHIP' ? 'var(--neon-indigo)' : 'var(--glass-border)',
            boxShadow: activeTab === 'MEMBERSHIP' ? '0 0 20px var(--neon-indigo-glow)' : 'none'
          }}
        >
          <Calendar size={24} />
          장기 정기 회원권 (회원 전용)
        </button>
      </div>

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
            const isDaily = prod.duration_min !== undefined;
            const priceFormatted = prod.standard_price.toLocaleString();
            
            // 배지 유형 결정
            let badgeText = '인기 상품';
            let badgeColor = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            if (!isDaily && prod.days && prod.days > 30) {
              badgeText = '추천 특가';
              badgeColor = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
            } else if (isDaily && prod.duration_min === 90) {
              badgeText = '시간대비 할인';
              badgeColor = 'linear-gradient(135deg, #10b981 0%, #047857 100%)';
            }

            return (
              <div
                key={prod.prod_cd}
                onClick={() => onProductSelected(prod)}
                className="glass-panel glass-panel-glow glass-panel-interactive"
                style={{
                  padding: '24px 30px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(18, 22, 31, 0.45)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '20px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* 인기/추천 딱지 */}
                <div 
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '24px',
                    background: badgeColor,
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#fff',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                  }}
                >
                  {badgeText}
                </div>

                {/* 상품 이름 및 이용 시간/기간 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Award size={20} style={{ color: 'var(--neon-indigo)' }} />
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#818cf8', letterSpacing: '1px' }}>
                      {isDaily ? 'DAILY PASS' : 'MEMBERSHIP'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', marginBottom: '14px' }}>
                    {prod.prod_nm}
                  </h3>
                  
                  {/* 이용 혜택 리스트 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={16} style={{ color: 'var(--neon-green)' }} />
                      <span>{isDaily ? `선택한 타석 즉시 ${prod.duration_min}분 배정` : `매일 전용 타석 무제한 60분 무료`}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={16} style={{ color: 'var(--neon-green)' }} />
                      <span>고급 다이어리 & 음료 1개 제공</span>
                    </div>
                    {!isDaily && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-secondary)' }}>
                        <CheckCircle2 size={16} style={{ color: 'var(--neon-green)' }} />
                        <span>라카 30% 할인가 결제 권한 부여</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 가격 및 즉시 결제하기 버튼 영역 */}
                <div 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'baseline', 
                    borderTop: '1px solid var(--bg-tertiary)', 
                    paddingTop: '18px' 
                  }}
                >
                  <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 700 }}>이용요금</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 900, color: 'var(--neon-green)', textShadow: '0 0 10px var(--neon-green-glow)' }}>
                      {priceFormatted}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>원</span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: 'var(--text-muted)' }}>
            선택 가능한 상품이 존재하지 않습니다.
          </div>
        )}
      </div>

      {/* 하단 공지 사항 */}
      <div 
        className="glass-panel" 
        style={{ 
          background: 'rgba(0,0,0,0.15)', 
          padding: '16px 24px', 
          borderRadius: '12px',
          fontSize: '15px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6'
        }}
      >
        <strong>[무인 키오스크 구매 안내]</strong><br />
        - 일일 타석권은 결제 즉시 타석 선택창으로 전환되며, 10분 내로 타석에 입장하여 주셔야 이용이 개시됩니다.<br />
        - 모든 결제는 신용카드만 가능하며, 현금 결제나 환불은 파트너센터 및 주간 관리 데스크로 문의해 주세요.
      </div>
    </div>
  );
};
