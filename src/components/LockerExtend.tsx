import React, { useEffect, useState } from 'react';
import { Award, CalendarRange, Check, KeyRound, ShieldAlert, X } from 'lucide-react';
import { api, Locker, Member, Product } from '../services/api';

interface LockerExtendProps {
  member?: Member | null;
  memberNo: string;
  memberName: string;
  discountRate?: number;
  onLockerPaymentTriggered: (lockerNo: number, prod: Product, extendDays: number, displayLockerNo?: string) => void;
  onCancel: () => void;
}

export const LockerExtend: React.FC<LockerExtendProps> = ({
  member,
  memberNo,
  memberName,
  discountRate,
  onLockerPaymentTriggered,
  onCancel
}) => {
  const [myLockers, setMyLockers] = useState<Locker[]>([]);
  const [lockerProducts, setLockerProducts] = useState<Product[]>([]);
  
  const [selectedLockerNo, setSelectedLockerNo] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const effDiscountRate = discountRate ?? member?.discount_rate ?? 0;

  const loadLockerData = async () => {
    setLoading(true);
    try {
      const effMemberNo = member?.member_no || memberNo;
      // 내 라카 찾기 (회원번호로 조회)
      let foundLockers = await api.getMemberLockers(effMemberNo);
      const memberLockerInfo = (member as any)?.locker_info;
      if ((!foundLockers || foundLockers.length === 0) && memberLockerInfo) {
        const rawNoStr = String(memberLockerInfo.locker_no ?? memberLockerInfo.locker_id ?? '').replace(/[^0-9]/g, '');
        const parsedNo = rawNoStr ? Number(rawNoStr) : 0;
        if (parsedNo > 0) {
          foundLockers = [
            {
              locker_no: parsedNo,
              status: memberLockerInfo.status || 'IN_USE',
              member_no: effMemberNo,
              member_name: member?.member_name || memberName,
              end_dt: memberLockerInfo.end_dt || memberLockerInfo.expiry_date || '',
              ...({ locker_id: memberLockerInfo.locker_id || parsedNo, display_no: memberLockerInfo.locker_no || String(parsedNo) } as any)
            }
          ];
        } else {
          foundLockers = [];
        }
      }
      setMyLockers(foundLockers);

      if (foundLockers.length > 0) {
        setSelectedLockerNo(foundLockers[0].locker_no);
      }

      // 라카 연장 전용 상품 목록 로드 (일일 타석/파3 FACILITY 상품 혼입 차단)
      const allProds = await api.getProducts();
      const lockerProds = allProds.filter(p => {
        const lt = (p.logic_type || '').toUpperCase();
        const nm = (p.prod_nm || '').toLowerCase();
        const cd = (p.prod_cd || '').toUpperCase();
        if (lt === 'RENTAL') return true;
        if (nm.includes('라카') || nm.includes('락커') || nm.includes('사물함') || cd.startsWith('LC') || cd.startsWith('RNT')) {
          return true;
        }
        if (lt === 'FACILITY' && (p.days ?? 0) > 0 && !nm.includes('일일') && !nm.includes('당일') && !nm.includes('타석') && !nm.includes('par3') && !nm.includes('파3')) {
          return true;
        }
        return false;
      });
      setLockerProducts(lockerProds);

    } catch {
      setErrorMsg('라카 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLockerData();
  }, [memberNo, member]);

  // 연장 실행 트리거 (한 번에 1개의 상품만 연장)
  const handleExtendClick = (prod: Product) => {
    setErrorMsg('');
    
    if (myLockers.length === 0 && !(member as any)?.locker_info) {
      setErrorMsg('연장할 수 있는 라카가 없습니다. 신규 대여는 데스크로 문의해주세요.');
      return;
    }
    
    const selectedObj = myLockers.find(l => l.locker_no === selectedLockerNo) || myLockers[0];
    const targetLockerId =
      Number(
        (selectedObj as any)?.locker_id ||
        (member as any)?.locker_info?.locker_id ||
        selectedLockerNo ||
        selectedObj?.locker_no ||
        (member as any)?.locker_info?.locker_no
      ) || 0;
    if (!targetLockerId) {
      setErrorMsg('연장할 라카를 선택해주세요.');
      return;
    }

    const displayLockerNo = String(
      (selectedObj as any)?.display_no ||
      selectedObj?.locker_no ||
      (member as any)?.locker_info?.locker_no ||
      targetLockerId
    );

    // 신규 배정 불가, 기존 라카 연장만
    onLockerPaymentTriggered(targetLockerId, prod, prod.days || 30, displayLockerNo);
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
                          {(locker as any).display_no || (member as any)?.locker_info?.locker_no || locker.locker_no}
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
              {lockerProducts.length > 0 ? lockerProducts.map(prod => {
                const canExtend = myLockers.length > 0;
                const effectivePrice =
                  prod.sale_price !== undefined && prod.sale_price !== null && prod.sale_price > 0
                    ? prod.sale_price
                    : prod.standard_price;
                const finalPrice =
                  effDiscountRate > 0
                    ? Math.max(0, effectivePrice - Math.round(effectivePrice * (effDiscountRate / 100)))
                    : effectivePrice;
                const hasSaleDiscount = prod.standard_price > finalPrice;
                
                return (
                  <div
                    key={prod.prod_cd}
                    data-testid="locker-prod-card"
                    className="locker-product-card"
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
                        <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: '0 0 4px 0' }}>
                          {prod.meta_data?.display_nm || prod.prod_nm}
                        </h4>
                        <p style={{ fontSize: '15px', color: '#86868b', margin: 0, fontWeight: 500 }}>
                          사물함 {prod.days || 30}일 연장{effDiscountRate > 0 ? ` (${effDiscountRate}% 등급할인 적용)` : ''}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      {hasSaleDiscount && (
                        <span style={{ fontSize: '13px', color: '#86868b', textDecoration: 'line-through', fontWeight: 600 }}>
                          {prod.standard_price.toLocaleString()}원
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                        <span style={{ fontSize: '28px', fontWeight: 800, color: hasSaleDiscount ? '#059669' : '#1d1d1f', letterSpacing: '-1px' }}>
                          {finalPrice.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: '#86868b', marginLeft: '2px' }}>원</span>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{
                  padding: '40px 24px',
                  borderRadius: '24px',
                  background: '#fbfbfd',
                  border: '1px dashed #d2d2d7',
                  textAlign: 'center',
                  color: '#86868b',
                  fontSize: '16px',
                  fontWeight: 600
                }}>
                  현재 등록된 라카 연장 상품이 없습니다. 안내 데스크로 문의해 주세요.
                </div>
              )}
            </div>

          </div>

        </div>
      )}
    </div>
  );
};

