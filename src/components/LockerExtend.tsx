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
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [lockerProducts, setLockerProducts] = useState<Product[]>([]);
  
  const [myLocker, setMyLocker] = useState<Locker | null>(null);
  const [selectedNewLockerNo, setSelectedNewLockerNo] = useState<number | null>(null);
  
  const [activeTab, setActiveTab] = useState<'MY_LOCKER' | 'NEW_ASSIGN'>('MY_LOCKER');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadLockerData = async () => {
    setLoading(true);
    try {
      // 1. 모든 라카 현황
      const allLockers = await api.getLockers();
      setLockers(allLockers);
      
      // 내 라카 찾기
      const found = allLockers.find(l => l.member_no === memberNo && (l.status === 'OCCUPIED' || l.status === 'EXPIRED'));
      setMyLocker(found || null);

      // 내 라카가 없으면 자동으로 '신규 배정' 탭으로 전환
      if (!found) {
        setActiveTab('NEW_ASSIGN');
      }

      // 2. 라카 연장 전용 상품 목록 로드
      const allProds = await api.getProducts();
      const lockerProds = allProds.filter(p => p.logic_type === 'FACILITY');
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

  // 연장 또는 신규 구매 실행 트리거
  const handleExtendClick = (prod: Product) => {
    setErrorMsg('');
    
    if (activeTab === 'MY_LOCKER' && myLocker) {
      onLockerPaymentTriggered(myLocker.locker_no, prod, prod.days || 30);
    } else if (activeTab === 'NEW_ASSIGN') {
      if (!selectedNewLockerNo) {
        setErrorMsg('이용하실 신규 라카 번호를 지도에서 먼저 선택해 주세요.');
        return;
      }
      onLockerPaymentTriggered(selectedNewLockerNo, prod, prod.days || 30);
    }
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
            <h2 style={{ fontSize: '28px', fontWeight: 900 }}>개인 사물함 라카 대여 및 연장</h2>
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

      {/* 에러 */}
      {errorMsg && (
        <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} style={{ color: 'var(--neon-red)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
        </div>
      )}

      {/* 대여 탭 전환 스위치 (내 라카가 존재할 때만 활성화) */}
      {myLocker && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <button
            onClick={() => setActiveTab('MY_LOCKER')}
            style={{
              padding: '16px',
              fontSize: '18px',
              fontWeight: 800,
              borderRadius: '12px',
              border: '1px solid',
              cursor: 'pointer',
              color: activeTab === 'MY_LOCKER' ? '#fff' : 'var(--text-secondary)',
              background: activeTab === 'MY_LOCKER' ? 'var(--neon-indigo)' : 'var(--bg-secondary)',
              borderColor: activeTab === 'MY_LOCKER' ? 'var(--neon-indigo)' : 'var(--glass-border)',
              boxShadow: activeTab === 'MY_LOCKER' ? '0 0 10px var(--neon-indigo-glow)' : 'none'
            }}
          >
            내 사용중인 라카 연장
          </button>
          <button
            onClick={() => setActiveTab('NEW_ASSIGN')}
            style={{
              padding: '16px',
              fontSize: '18px',
              fontWeight: 800,
              borderRadius: '12px',
              border: '1px solid',
              cursor: 'pointer',
              color: activeTab === 'NEW_ASSIGN' ? '#fff' : 'var(--text-secondary)',
              background: activeTab === 'NEW_ASSIGN' ? 'var(--neon-indigo)' : 'var(--bg-secondary)',
              borderColor: activeTab === 'NEW_ASSIGN' ? 'var(--neon-indigo)' : 'var(--glass-border)',
              boxShadow: activeTab === 'NEW_ASSIGN' ? '0 0 10px var(--neon-indigo-glow)' : 'none'
            }}
          >
            신규 라카 신규 대여
          </button>
        </div>
      )}

      {/* 로딩 표시 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', fontSize: '18px', color: 'var(--text-secondary)' }}>
          라카 상태 분석 중...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px' }}>
          
          {/* 좌측: 사물함 현황 또는 사물함 선택 그리드 */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', background: 'rgba(0,0,0,0.2)' }}>
            {activeTab === 'MY_LOCKER' && myLocker ? (
              // 1. 내 라카 정보 노출
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div 
                  className="neon-border-indigo"
                  style={{
                    width: '160px',
                    height: '160px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '14px', color: 'var(--neon-indigo)', fontWeight: 800 }}>락카번호</span>
                  <span style={{ fontSize: '48px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{myLocker.locker_no}</span>
                </div>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                    이용 상태: <strong style={{ color: 'var(--neon-green)' }}>이용 중 (정상)</strong>
                  </p>
                  <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                    만료 일정: <strong style={{ color: '#fff' }}>{myLocker.end_dt}</strong> 까지
                  </p>
                </div>
              </div>
            ) : (
              // 2. 신규 배정 선택 그리드
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--neon-indigo)' }}>
                  비어있는 신규 라카 번호 선택
                </h4>
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(5, 1fr)', 
                    gap: '10px', 
                    maxHeight: '340px', 
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}
                >
                  {lockers.map(l => {
                    const isAvail = l.status === 'AVAILABLE';
                    const isNewSel = selectedNewLockerNo === l.locker_no;

                    let bg = 'rgba(255,255,255,0.02)';
                    let border = 'var(--glass-border)';
                    let color = 'var(--text-muted)';

                    if (isAvail) {
                      bg = 'rgba(16, 185, 129, 0.03)';
                      border = 'rgba(16, 185, 129, 0.1)';
                      color = 'var(--text-primary)';
                    }
                    if (isNewSel) {
                      bg = 'rgba(99, 102, 241, 0.3)';
                      border = 'var(--neon-indigo)';
                      color = '#fff';
                    }

                    return (
                      <button
                        key={l.locker_no}
                        disabled={!isAvail}
                        onClick={() => setSelectedNewLockerNo(l.locker_no)}
                        style={{
                          height: '64px',
                          borderRadius: '8px',
                          border: `1px solid ${border}`,
                          background: bg,
                          color: color,
                          fontSize: '18px',
                          fontWeight: 700,
                          cursor: isAvail ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isNewSel ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                          transition: 'all 0.1s ease'
                        }}
                        className={isAvail ? 'keypad-btn' : ''}
                      >
                        {l.locker_no}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 우측: 연장/대여 상품 매대 및 요금 확인 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800 }}>대여 / 연장 하실 기간을 선택해 주세요.</h4>
            
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
                    cursor: 'pointer',
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
                        개인 사물함 락카 {prod.days}일 연장 이용
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

            {/* 선택 결과 가이드 요약 */}
            {activeTab === 'NEW_ASSIGN' && selectedNewLockerNo && (
              <div 
                className="neon-border-indigo"
                style={{ 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  padding: '16px', 
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Check size={20} style={{ color: 'var(--neon-indigo)' }} />
                <span style={{ fontSize: '16px', fontWeight: 700 }}>
                  선택된 신규 사물함: <strong style={{ color: '#fff', fontSize: '20px' }}>{selectedNewLockerNo}</strong>번 라카
                </span>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
