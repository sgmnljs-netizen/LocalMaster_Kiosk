import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Compass, Layers, ShieldAlert, Timer } from 'lucide-react';
import { api, Bay } from '../services/api';

interface TeeboxMapProps {
  memberNo?: string;
  memberName?: string;
  isMoveMode?: boolean; // 타석 이동 모드 여부
  onBaySelected: (bayNo: number) => void;
  onCancel: () => void;
  bays: Bay[];
  onRefreshBays: () => void;
}

export const TeeboxMap: React.FC<TeeboxMapProps> = ({
  memberNo,
  memberName,
  isMoveMode = false,
  onBaySelected,
  onCancel,
  bays,
  onRefreshBays
}) => {
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(null);
  const [preoccupyLoading, setPreoccupyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState<number>(60); // 선점 락 카운트다운 (1분)

  // 선점 락 제한시간 1초 간격 갱신
  useEffect(() => {
    if (selectedBayNo === null) return;
    
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // 선점 시간 초과 -> 자동 락 해제
          handleRelease();
          setErrorMsg('선점 유효 시간이 초과되어 타석 선택이 자동 취소되었습니다.');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedBayNo]);

  // 타석 터치 - 원자적 선점(Pre-emption) 락 시도
  const handleBayTouch = async (bay: Bay) => {
    if (bay.status === 'UNDER_MAINTENANCE') return;
    if (bay.status === 'OCCUPIED') return;
    if (bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
      setErrorMsg('이미 다른 고객님께서 선택 중인 타석입니다.');
      return;
    }

    // 기존에 선택했던 타석이 있었다면 해제
    if (selectedBayNo !== null) {
      await api.releaseBay(selectedBayNo);
    }

    setErrorMsg('');
    setPreoccupyLoading(true);

    try {
      const success = await api.preoccupyBay(bay.bay_no);
      if (success) {
        setSelectedBayNo(bay.bay_no);
      } else {
        setErrorMsg('타석 선점에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch {
      setErrorMsg('타석 선점 중 오류가 발생했습니다.');
    } finally {
      setPreoccupyLoading(false);
      onRefreshBays(); // 즉시 상태 갱신
    }
  };

  // 선점 수동 해제
  const handleRelease = async () => {
    if (selectedBayNo !== null) {
      await api.releaseBay(selectedBayNo);
      setSelectedBayNo(null);
      onRefreshBays();
    }
  };

  // 배정 최종 확인 버튼 클릭
  const handleConfirm = () => {
    if (selectedBayNo !== null) {
      onBaySelected(selectedBayNo);
    }
  };

  // 필터링된 층별 타석 목록
  const floorBays = bays.filter(b => b.floor_no === activeFloor);

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
      {/* 타석 맵 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isMoveMode ? (
            <ArrowLeftRight size={32} style={{ color: 'var(--neon-indigo)' }} />
          ) : (
            <Compass size={32} style={{ color: 'var(--neon-indigo)' }} />
          )}
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 900 }}>
              {isMoveMode ? '이동하실 타석 선택' : '이용하실 타석 선택'}
            </h2>
            {memberName && (
              <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                회원명: <strong style={{ color: '#fff' }}>{memberName}</strong> 님
              </p>
            )}
          </div>
        </div>

        {/* 층별 탭 전환 스위치 */}
        <div className="glass-panel" style={{ display: 'flex', padding: '6px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
          {[1, 2].map(f => (
            <button
              key={f}
              onClick={() => setActiveFloor(f)}
              style={{
                padding: '10px 24px',
                fontSize: '18px',
                fontWeight: 800,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                color: activeFloor === f ? '#fff' : 'var(--text-secondary)',
                background: activeFloor === f ? 'var(--neon-indigo)' : 'transparent',
                boxShadow: activeFloor === f ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Layers size={16} />
              {f}층 타석
            </button>
          ))}
        </div>
      </div>

      {/* 에러 또는 주의 알림 */}
      {errorMsg && (
        <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={20} style={{ color: 'var(--neon-red)' }} />
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
        </div>
      )}

      {/* 상태 안내 범례 */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '30px', 
          background: 'rgba(0,0,0,0.15)', 
          padding: '14px', 
          borderRadius: '12px',
          border: '1px solid var(--glass-border)' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green-glow)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700 }}>이용 가능 (Green)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: 'var(--neon-indigo)', boxShadow: '0 0 6px var(--neon-indigo-glow)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700 }}>사용 중 (Indigo)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: 'var(--neon-amber)', boxShadow: '0 0 6px var(--neon-amber-glow)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700 }}>선택 중 (Amber)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: 'var(--neon-red)', boxShadow: '0 0 6px var(--neon-red-glow)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700 }}>점검/고장 (Red)</span>
        </div>
      </div>

      {/* 층별 테크 스펙 안내 바 (Data Density 강화) */}
      <div 
        style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--glass-border)', 
          padding: '12px 20px', 
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '14px',
          color: 'var(--text-secondary)'
        }}
      >
        <span>⛳ 층별 장비 스펙: <strong style={{ color: 'var(--neon-indigo)' }}>{activeFloor === 1 ? '1층 GDR+ 초고속 센서 (1~10번)' : '2층 Kakao VX 스크린 (11~20번)'}</strong></span>
        <span>• 좌타/우타 방향을 반드시 확인 후 선택해 주세요.</span>
      </div>

      {/* 실시간 타석 배치도 그리드 (Data Density 최적화) */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          background: '#0a0d14',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid var(--bg-tertiary)',
          minHeight: '400px'
        }}
      >
        {floorBays.map((bay) => {
          const isSelected = selectedBayNo === bay.bay_no;
          const isPreOccupied = bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId();
          
          let borderCol = 'var(--glass-border)';
          let bgCol = 'rgba(255,255,255,0.02)';
          let statusText = '이용가능';
          let statusColor = 'var(--neon-green)';

          if (bay.status === 'OCCUPIED') {
            borderCol = 'rgba(99,102,241,0.2)';
            bgCol = 'rgba(99,102,241,0.05)';
            statusText = `${bay.current_user_name || '회원'} 이용중`;
            statusColor = 'var(--neon-indigo)';
          } else if (bay.status === 'UNDER_MAINTENANCE') {
            borderCol = 'rgba(239,68,68,0.2)';
            bgCol = 'rgba(239,68,68,0.05)';
            statusText = '점검중';
            statusColor = 'var(--neon-red)';
          } else if (isPreOccupied) {
            borderCol = 'rgba(245,158,11,0.2)';
            bgCol = 'rgba(245,158,11,0.05)';
            statusText = '선택 중';
            statusColor = 'var(--neon-amber)';
          }

          // 내가 선점 중인 상태
          if (isSelected) {
            borderCol = 'var(--neon-indigo)';
            bgCol = 'rgba(99, 102, 241, 0.2)';
          }

          return (
            <div
              key={bay.bay_no}
              onClick={() => handleBayTouch(bay)}
              className="glass-panel"
              style={{
                height: '140px',
                borderRadius: '14px',
                border: `2px solid ${borderCol}`,
                background: bgCol,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: bay.status === 'AVAILABLE' || isSelected ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 0 15px var(--neon-indigo-glow)' : 'none',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* 우상단 좌타/우타 방향 표시 */}
              <div 
                style={{ 
                  position: 'absolute', 
                  top: '8px', 
                  right: '8px', 
                  fontSize: '11px', 
                  fontWeight: 900, 
                  color: bay.type === 'LEFT' ? 'var(--neon-amber)' : 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                {bay.type === 'LEFT' ? '좌타' : '우타'}
              </div>

              {/* 타석 번호 */}
              <div>
                <span style={{ fontSize: '32px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                  {bay.bay_no}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>번 타석</span>
              </div>

              {/* 하단 상태 문구 및 타이머 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {bay.status === 'OCCUPIED' && bay.minutes_left !== undefined ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--neon-indigo)' }}>
                      <Timer size={14} className="glow-text-indigo" />
                      <span style={{ fontSize: '15px', fontWeight: 800 }}>
                        {bay.minutes_left}분 남음
                      </span>
                    </div>
                    {/* 실시간 잔여시간 프로그레스 바 게이지 */}
                    <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          width: `${Math.min(100, (bay.minutes_left / 60) * 100)}%`, 
                          height: '100%', 
                          backgroundColor: 'var(--neon-indigo)',
                          boxShadow: '0 0 6px var(--neon-indigo-glow)',
                          transition: 'width 0.5s ease-in-out'
                        }} 
                      />
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '14px', fontWeight: 700, color: statusColor }}>
                    {isSelected ? '선택 완료' : statusText}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 최종 조작 액션 바 */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderTop: '1px solid var(--bg-tertiary)', 
          paddingTop: '20px' 
        }}
      >
        <div>
          {selectedBayNo !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                className="neon-border-indigo"
                style={{ 
                  background: 'rgba(99,102,241,0.1)', 
                  padding: '10px 20px', 
                  borderRadius: '10px', 
                  fontSize: '18px', 
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Check size={18} style={{ color: 'var(--neon-indigo)' }} />
                <span>선택된 타석: <strong style={{ color: '#fff', fontSize: '22px' }}>{selectedBayNo}</strong>번</span>
              </div>
              <span style={{ fontSize: '15px', color: 'var(--neon-amber)', fontWeight: 700 }}>
                (배정 대기 시간: {countdown}초 남음)
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              배정하실 타석 카드를 터치하여 선택해 주세요.
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <button 
            className="kiosk-btn" 
            style={{ width: '140px', height: '64px', borderRadius: '12px', fontSize: '18px' }}
            onClick={async () => {
              await handleRelease();
              onCancel();
            }}
          >
            이전으로
          </button>
          
          <button
            onClick={handleConfirm}
            disabled={selectedBayNo === null || preoccupyLoading}
            className="kiosk-btn kiosk-btn-primary"
            style={{ 
              width: '220px', 
              height: '64px', 
              borderRadius: '12px', 
              fontSize: '20px', 
              fontWeight: 800 
            }}
          >
            {preoccupyLoading ? '선점 처리 중...' : isMoveMode ? '타석 이동 완료' : '선택 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
