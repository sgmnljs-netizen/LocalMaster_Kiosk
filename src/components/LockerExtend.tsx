import React, { useEffect, useState } from 'react';
import { Award, CalendarRange, Check, KeyRound, ShieldAlert, X } from 'lucide-react';
import { api, Locker, Product } from '../services/api';

interface LockerExtendProps {
  memberNo: string;
  memberName: string;
  onLockerPaymentTriggered: (lockerNo: number, prod: Product, extendDays: number) => void;
  onCancel: () => void;
}

export const LockerExtend: React.FC<LockerExtendProps> = ({
  memberNo,
  memberName,
  onLockerPaymentTriggered,
  onCancel
}) => {
  const [myLockers, setMyLockers] = useState<Locker[]>([]);
  const [lockerProducts, setLockerProducts] = useState<Product[]>([]);
  
  const [selectedLockerNo, setSelectedLockerNo] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadLockerData = async () => {
    setLoading(true);
    try {
      // 내 라카 찾기 (회원번호로 조회)
      const foundLockers = await api.getMemberLockers(memberNo);
      setMyLockers(foundLockers);

      if (foundLockers.length > 0) {
        setSelectedLockerNo(foundLockers[0].locker_no);
      }

      // 라카 연장 전용 상품 목록 로드
      const allProds = await api.getProducts();
      const lockerProds = allProds.filter(p => p.logic_type === 'FACILITY' || p.logic_type === 'RENTAL');
      setLockerProducts(lockerProds);

    } catch {
      setErrorMsg('라카 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLockerData();
  }, [memberNo]);

  // 연장 실행 트리거 (한 번에 1개의 상품만 연장)
  const handleExtendClick = (prod: Product) => {
    setErrorMsg('');
    
    if (myLockers.length === 0) {
      setErrorMsg('연장할 수 있는 라카가 없습니다. 신규 대여는 데스크로 문의해주세요.');
      return;
    }
    
    if (!selectedLockerNo) {
      setErrorMsg('연장할 라카를 선택해주세요.');
      return;
    }

    // 신규 배정 불가, 기존 라카 연장만
    onLockerPaymentTriggered(selectedLockerNo, prod, prod.days || 30);
  };

  return (
    <div 
      style={{
        width: '1000px',
        margin: '40px auto',
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* 헤더 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            background: '#0071e3', 
            borderRadius: '50%', 
            width: '56px', height: '56px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 113, 227, 0.3)'
          }}>
            <KeyRound size={28} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>개인 사물함 연장</h2>
            <p style={{ fontSize: '17px', color: '#86868b', margin: '4px 0 0 0', fontWeight: 500 }}>
              <strong style={{ color: '#1d1d1f' }}>{memberName}</strong> 님의 이용 중인 라카
            </p>
          </div>
        </div>

        <button 
          onClick={onCancel}
          style={{
            background: '#f5f5f7',
            border: 'none',
            color: '#1d1d1f',
            padding: '12px 24px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#e8e8ed'}
          onMouseOut={(e) => e.currentTarget.style.background = '#f5f5f7'}
        >
          이전으로 돌아가기
        </button>
      </div>

      {/* 안내 메시지 */}
      <div style={{ 
        background: 'rgba(0, 113, 227, 0.05)', 
        padding: '20px 24px', 
        borderRadius: '16px', 
        border: '1px solid rgba(0, 113, 227, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ width: '4px', height: '100%', background: '#0071e3', borderRadius: '2px' }}></div>
        <p style={{ fontSize: '16px', color: '#1d1d1f', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
          <strong style={{ color: '#0071e3' }}>안내: </strong>키오스크에서는 기존 이용 중인 라카의 <strong>기간 연장</strong>만 가능합니다. <br/>
          <span style={{ color: '#86868b' }}>(신규 라카 배정 및 자리 이동은 안내 데스크를 이용해 주세요.)</span>
        </p>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div style={{ background: '#fff0f0', padding: '16px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #ffc2c2' }}>
          <ShieldAlert size={20} color="#ff3b30" />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#ff3b30' }}>{errorMsg}</span>
        </div>
      )}

      {/* 로딩 표시 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', fontSize: '18px', color: '#86868b', fontWeight: 500 }}>
          라카 정보를 불러오는 중입니다...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '32px' }}>
          
          {/* 좌측: 사물함 현황 */}
          <div style={{ 
            padding: '32px', 
            borderRadius: '24px', 
            background: '#fbfbfd',
            border: '1px solid #e5e5ea',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
          }}>
            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: '0 0 24px 0', letterSpacing: '-0.3px' }}>이용 중인 라카</h4>
            
            {myLockers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myLockers.map(locker => {
                  const isSelected = selectedLockerNo === locker.locker_no;
                  const isExpired = locker.status === 'EXPIRED';
                  
                  return (
                    <div 
                      key={locker.locker_no}
                      onClick={() => setSelectedLockerNo(locker.locker_no)}
                      style={{
                        padding: '20px',
                        borderRadius: '20px',
                        background: '#ffffff',
                        border: isSelected ? '2px solid #0071e3' : '1px solid #e5e5ea',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: isSelected ? '0 8px 24px rgba(0, 113, 227, 0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                        transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '16px',
                          background: isSelected ? '#0071e3' : '#f5f5f7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '22px',
                          fontWeight: 800,
                          color: isSelected ? '#ffffff' : '#1d1d1f',
                          transition: 'all 0.2s ease'
                        }}>
                          {locker.locker_no}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 500, marginBottom: '2px' }}>만료일</div>
                          <div style={{ fontSize: '17px', fontWeight: 700, color: isExpired ? '#ff3b30' : '#1d1d1f' }}>
                            {locker.end_dt} {isExpired && <span style={{fontSize:'13px', padding:'2px 6px', background:'#fff0f0', borderRadius:'6px', marginLeft:'4px'}}>만료됨</span>}
                          </div>
                        </div>
                      </div>
                      {isSelected ? (
                        <div style={{ background: '#0071e3', borderRadius: '50%', padding: '4px' }}>
                           <Check size={20} color="#ffffff" strokeWidth={3} />
                        </div>
                      ) : (
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #e5e5ea' }}></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 0' }}>
                <ShieldAlert size={48} color="#d2d2d7" />
                <p style={{ fontSize: '17px', color: '#86868b', fontWeight: 500 }}>이용 중인 라카가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 우측: 연장 상품 매대 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: 0, letterSpacing: '-0.3px' }}>연장 상품 선택</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {lockerProducts.map(prod => {
                const canExtend = myLockers.length > 0;
                
                return (
                  <div
                    key={prod.prod_cd}
                    onClick={() => handleExtendClick(prod)}
                    style={{
                      padding: '24px',
                      borderRadius: '24px',
                      background: '#ffffff',
                      border: '1px solid #e5e5ea',
                      cursor: canExtend ? 'pointer' : 'not-allowed',
                      opacity: canExtend ? 1 : 0.6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }}
                    onMouseOver={(e) => {
                      if (canExtend) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                        e.currentTarget.style.borderColor = '#d2d2d7';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (canExtend) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.03)';
                        e.currentTarget.style.borderColor = '#e5e5ea';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ background: '#f5f5f7', padding: '12px', borderRadius: '16px' }}>
                        <CalendarRange size={28} color="#0071e3" strokeWidth={2} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: '0 0 4px 0' }}>{prod.prod_nm}</h4>
                        <p style={{ fontSize: '15px', color: '#86868b', margin: 0, fontWeight: 500 }}>
                          사물함 {prod.days}일 연장
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                      <span style={{ fontSize: '28px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-1px' }}>
                        {prod.standard_price.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: '#86868b', marginLeft: '2px' }}>원</span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}
    </div>
  );
};

