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

      {/* 0. 애플 모션 스타일 전용 CSS 스타일 태그 주입 */}
      <style>{`
        @keyframes rippleWave {
          0% {
            transform: scale(0.96);
            opacity: 0.9;
            box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.6);
          }
          100% {
            transform: scale(1.24);
            opacity: 0;
            box-shadow: 0 0 0 20px rgba(52, 199, 89, 0);
          }
        }
        @keyframes softBlink {
          0% {
            opacity: 0.35;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>

      {/* 실시간 타석 배치도 그리드 (Data Density 최적화) */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '18px',
          background: '#f5f5f7',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid #e5e5ea',
          minHeight: '400px'
        }}
      >
        {floorBays.map((bay) => {
          const isSelected = selectedBayNo === bay.bay_no;
          const isPreOccupiedByOther = bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId();
          const isOccupied = bay.status === 'OCCUPIED';
          const isUnderMaintenance = (bay.status as string) === 'UNDER_MAINTENANCE' || (bay.status as string) === 'REPAIR' || (bay.status as string) === 'ERROR';
          const isAvailable = bay.status === 'AVAILABLE';

          // 1. 헤더 영역 스타일 (30% 높이)
          let headerBg = '#e5e5ea';
          let headerTextColor = '#86868b';

          if (isAvailable) {
            headerBg = '#354238';
            headerTextColor = '#ffffff';
          } else if (isSelected) {
            headerBg = '#34c759'; // 고대비 맑은 애플 그린 헤더 복원
            headerTextColor = '#121419'; // 진하고 선명한 검정 폰트
          } else if (isOccupied) {
            headerBg = '#d2d2d7';
            headerTextColor = '#515154';
          } else if (isPreOccupiedByOther) {
            headerBg = '#e5e5ea';
            headerTextColor = '#86868b';
          } else if (isUnderMaintenance) {
            headerBg = '#ff453a';
            headerTextColor = '#ffffff';
          }

          // 2. 바디/컨테이너 영역 스타일 (70% 높이)
          let containerBorder = '1px solid #dadce0';
          let containerBg = '#ffffff';
          let statusText = '이용가능';
          let statusColor = '#354238';
          let cursorStyle = 'pointer';
          let opacity = '1';
          let pointerEvents: React.CSSProperties['pointerEvents'] = 'auto';
          let transform = 'none';
          let zIndex = 1;
          let boxShadow = 'none';

          if (isAvailable) {
            containerBorder = '1.5px solid #dadce0';
            containerBg = '#ffffff';
            statusText = '이용가능';
            statusColor = '#354238';
          } else if (isSelected) {
            containerBorder = '2.5px solid #354238';
            containerBg = '#ffffff'; // 밝은 화이트 배경 복원
            statusText = '선택 완료';
            statusColor = '#1d4e33'; // 포레스트 그린 텍스트
            
            // 3D 입체 플로팅 효과 극대화
            transform = 'scale(1.05) translateY(-6px)';
            zIndex = 10;
            boxShadow = '0 12px 30px rgba(53, 66, 56, 0.22)';
          } else if (isOccupied) {
            containerBorder = '1px solid #dadce0';
            containerBg = '#eaeaea';
            statusText = '이용중';
            statusColor = '#515154';
            cursorStyle = 'not-allowed';
          } else if (isPreOccupiedByOther) {
            containerBorder = '1px solid #e5e5ea';
            containerBg = '#f5f5f7';
            statusText = '선택 중';
            statusColor = '#86868b';
            cursorStyle = 'not-allowed';
            opacity = '0.35';
            pointerEvents = 'none';
          } else if (isUnderMaintenance) {
            containerBorder = '1.5px solid #ff453a';
            containerBg = '#fff5f5';
            statusText = '점검중';
            statusColor = '#ff453a';
            cursorStyle = 'not-allowed';
            opacity = '0.5';
            pointerEvents = 'none';
          }

          return (
            <div 
              key={bay.bay_no}
              style={{ position: 'relative', zIndex: zIndex }}
            >
              {/* --- RIPPLE LASER WAVE EFFECT (2중 동심원 방출) --- */}
              {isSelected && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: '12px',
                    border: '2.5px solid #34c759',
                    animation: 'rippleWave 1.8s infinite linear',
                    pointerEvents: 'none',
                    zIndex: -1
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: '12px',
                    border: '2.5px solid #34c759',
                    animation: 'rippleWave 1.8s infinite linear',
                    animationDelay: '0.9s',
                    pointerEvents: 'none',
                    zIndex: -1
                  }} />
                </>
              )}

              {/* --- CARD MAIN BODY --- */}
              <div
                onClick={() => (isAvailable || isSelected) && handleBayTouch(bay)}
                style={{
                  height: '130px',
                  borderRadius: '12px',
                  border: containerBorder,
                  background: containerBg,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: cursorStyle,
                  transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
                  transform: transform,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: opacity,
                  pointerEvents: pointerEvents,
                  boxShadow: boxShadow
                }}
              >
                {/* --- HEADER SECTION (30%) --- */}
                <div
                  style={{
                    flexBasis: '30%',
                    background: headerBg,
                    color: headerTextColor,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                    {bay.bay_no.toString().padStart(2, '0')}
                  </span>

                  {bay.type === 'LEFT' && (
                    <span 
                      style={{ 
                        position: 'absolute', 
                        top: '4px', 
                        right: '6px', 
                        fontSize: '9px', 
                        fontWeight: 900, 
                        background: isSelected ? 'rgba(0, 0, 0, 0.08)' : isAvailable ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.05)', 
                        color: isSelected ? '#121419' : isAvailable ? '#ffffff' : '#86868b', 
                        padding: '1px 4px', 
                        borderRadius: '3px',
                        border: '0.5px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      좌타
                    </span>
                  )}
                </div>

                {/* --- BODY SECTION (70%) --- */}
                <div
                  style={{
                    flexBasis: '70%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '8px',
                    boxSizing: 'border-box',
                    gap: '6px'
                  }}
                >
                  {isOccupied && bay.minutes_left !== undefined ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#515154', fontSize: '16px', fontWeight: 800 }}>
                        <Timer size={14} style={{ color: '#515154' }} />
                        <span>{bay.minutes_left}분 남음</span>
                      </div>
                      <div style={{ width: '85%', height: '4px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min(100, (bay.minutes_left / 60) * 100)}%`, 
                            height: '100%', 
                            backgroundColor: '#515154',
                            transition: 'width 0.5s ease'
                          }} 
                        />
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '16px', fontWeight: 800, color: statusColor, letterSpacing: '-0.3px' }}>
                      {statusText}
                    </span>
                  )}

                  {isSelected && (
                    <span 
                      style={{ 
                        fontSize: '12px', 
                        fontWeight: 700, 
                        color: '#ff453a', 
                        marginTop: '-2px',
                        opacity: 0.9,
                        animation: 'softBlink 1s infinite alternate'
                      }}
                    >
                      {countdown}초 남음
                    </span>
                  )}
                </div>
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
