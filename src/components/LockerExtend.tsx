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
      className="glass-panel" 
      style={{
        width: '1000px',
        margin: '15px auto',
        padding: '30px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <KeyRound size={32} style={{ color: 'var(--neon-indigo)' }} />
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 900 }}>개인 사물함 라카 연장</h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              회원명: <strong style={{ color: '#fff' }}>{memberName}</strong> 님
            </p>
          </div>
        </div>

        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '8px 18px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 700
          }}
        >
          이전으로
        </button>
      </div>

      {/* 안내 메시지 */}
      <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--neon-indigo)' }}>안내: </strong>키오스크에서는 기존 이용 중인 라카의 <strong>기간 연장</strong>만 가능합니다. <br/>
          (신규 라카 배정 및 자리 이동은 안내 데스크를 이용해 주세요.)
        </p>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} style={{ color: 'var(--neon-red)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
        </div>
      )}

      {/* 로딩 표시 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', fontSize: '18px', color: 'var(--text-secondary)' }}>
          라카 상태 분석 중...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px' }}>
          
          {/* 좌측: 사물함 현황 */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', background: 'rgba(0,0,0,0.2)' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px' }}>이용 중인 라카</h4>
            
            {myLockers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myLockers.map(locker => (
                  <div 
                    key={locker.locker_no}
                    onClick={() => setSelectedLockerNo(locker.locker_no)}
                    className="glass-panel-interactive"
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: selectedLockerNo === locker.locker_no ? '2px solid var(--neon-indigo)' : '1px solid var(--glass-border)',
                      background: selectedLockerNo === locker.locker_no ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: selectedLockerNo === locker.locker_no ? '0 0 10px var(--neon-indigo-glow)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: 900,
                        color: '#fff'
                      }}>
                        {locker.locker_no}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>만료일</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: locker.status === 'EXPIRED' ? 'var(--neon-red)' : '#fff' }}>
                          {locker.end_dt} {locker.status === 'EXPIRED' && '(만료됨)'}
                        </div>
                      </div>
                    </div>
                    {selectedLockerNo === locker.locker_no && (
                      <Check size={24} style={{ color: 'var(--neon-indigo)' }} />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.7 }}>
                <ShieldAlert size={48} style={{ color: 'var(--text-muted)' }} />
                <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>이용 중인 라카가 없습니다.</p>
              </div>
            )}
          </div>

          {/* 우측: 연장 상품 매대 및 요금 확인 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800 }}>연장 하실 상품을 1개 선택해 주세요.</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {lockerProducts.map(prod => (
                <div
                  key={prod.prod_cd}
                  onClick={() => handleExtendClick(prod)}
                  className="glass-panel glass-panel-glow glass-panel-interactive"
                  style={{
                    padding: '20px 24px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(18, 22, 31, 0.4)',
                    cursor: myLockers.length > 0 ? 'pointer' : 'not-allowed',
                    opacity: myLockers.length > 0 ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CalendarRange size={24} style={{ color: 'var(--neon-green)' }} />
                    <div>
                      <h4 style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{prod.prod_nm}</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        개인 사물함 락카 {prod.days}일 연장
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--neon-green)', textShadow: '0 0 8px var(--neon-green-glow)' }}>
                      {prod.standard_price.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>원</span>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
