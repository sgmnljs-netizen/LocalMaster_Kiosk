import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeftRight, Check, Compass, Layers, ShieldAlert, Timer } from 'lucide-react';
import { api, Bay } from '../services/api';

interface TeeboxMapProps {
  memberNo?: string;
  memberName?: string;
  isMoveMode?: boolean; // 타석 이동 모드 여부
  lang?: 'KO' | 'EN';
  onBaySelected: (bayNo: number) => void;
  onCancel: () => void;
  bays: Bay[];
  onRefreshBays: () => void;
}

export const TeeboxMap: React.FC<TeeboxMapProps> = ({
  memberNo,
  memberName,
  isMoveMode = false,
  lang = 'KO',
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

  // 이동 모드 시 현재 회원이 점유 중인 타석 검색
  const currentBay = isMoveMode
    ? bays.find(
        b =>
          b.status === 'OCCUPIED' &&
          ((memberNo && b.current_user_name === memberNo) ||
            (memberName && b.current_user_name === memberName) ||
            (memberName && b.current_user_name && b.current_user_name.includes(memberName)))
      )
    : null;

  // minutes_left 정밀 파싱 및 end_time fallback 계산
  const calculateRemMin = useCallback((bay: Bay | null | undefined): number => {
    if (!bay) return 0;
    if (bay.minutes_left !== undefined && bay.minutes_left !== null) {
      return bay.minutes_left;
    }
    if (bay.end_time) {
      try {
        const endMs = new Date(bay.end_time).getTime();
        const nowMs = new Date().getTime();
        if (!isNaN(endMs)) {
          return Math.max(0, Math.floor((endMs - nowMs) / 60000));
        }
      } catch {
        return 0;
      }
    }
    return 0;
  }, []);

  const currentRemMin = calculateRemMin(currentBay);
  const isTimeRestricted = isMoveMode && currentBay && currentRemMin < 5;
  const hasNoActiveBay = isMoveMode && !currentBay;

  // 선점 수동 해제 (useCallback 가딩)
  const handleRelease = useCallback(async () => {
    if (selectedBayNo !== null) {
      await api.releaseBay(selectedBayNo);
      setSelectedBayNo(null);
      onRefreshBays();
    }
  }, [selectedBayNo, onRefreshBays]);

  // 선점 락 제한시간 1초 간격 갱신
  useEffect(() => {
    if (selectedBayNo === null) return;
    
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // 선점 시간 초과 -> 자동 락 해제
          handleRelease();
          setErrorMsg(lang === 'KO' ? '선점 유효 시간이 초과되어 타석 선택이 자동 취소되었습니다.' : 'Pre-occupation lock expired.');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedBayNo, handleRelease, lang]);

  // 타석 터치 - 원자적 선점(Pre-emption) 락 시도 (useCallback 가딩)
  const handleBayTouch = useCallback(async (bay: Bay) => {
    if (isTimeRestricted || hasNoActiveBay) return;
    if (bay.status === 'UNDER_MAINTENANCE') return;
    if (bay.status === 'OCCUPIED') return;
    if (bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
      setErrorMsg(lang === 'KO' ? '이미 다른 고객님께서 선택 중인 타석입니다.' : 'Teebox selected by another user.');
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
        setErrorMsg(lang === 'KO' ? '타석 선점에 실패했습니다. 다시 시도해 주세요.' : 'Failed to preoccupy teebox.');
      }
    } catch {
      setErrorMsg(lang === 'KO' ? '타석 선점 중 오류가 발생했습니다.' : 'Error preoccupying teebox.');
    } finally {
      setPreoccupyLoading(false);
      onRefreshBays(); // 즉시 상태 갱신
    }
  }, [isTimeRestricted, hasNoActiveBay, selectedBayNo, onRefreshBays, lang]);

  // 배정 최종 확인 버튼 클릭 (useCallback 가딩)
  const handleConfirm = useCallback(() => {
    if (selectedBayNo !== null) {
      onBaySelected(selectedBayNo);
    }
  }, [selectedBayNo, onBaySelected]);

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

      {/* 타석 이동(MOVE_BAY) 전용 오버레이 헤더 패널 */}
      {isMoveMode && (
        <>
          {hasNoActiveBay ? (
            <div
              className="neon-border-red"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '2px solid var(--neon-red)',
                borderRadius: '20px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <ShieldAlert size={36} style={{ color: 'var(--neon-red)' }} />
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                    현재 이용 중인 타석 내역이 없습니다
                  </h3>
                  <p style={{ fontSize: '15px', color: '#fca5a5', margin: '4px 0 0 0' }}>
                    <strong>{memberName || '고객'}</strong> 님 명의로 점유 중인 타석을 찾을 수 없습니다. [연습타석배정] 메뉴에서 신규 배정을 진행해 주세요.
                  </p>
                </div>
              </div>
              <button
                onClick={onCancel}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  color: '#1d1d1f',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor: 'pointer'
                }}
              >
                메인으로 복귀
              </button>
            </div>
          ) : isTimeRestricted ? (
            <div
              className="neon-border-red"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '2px solid var(--neon-red)',
                borderRadius: '20px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <ShieldAlert size={36} style={{ color: 'var(--neon-red)' }} />
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                    ⏱️ 타석 이동 불가 (잔여시간 5분 미만)
                  </h3>
                  <p style={{ fontSize: '15px', color: '#fca5a5', margin: '4px 0 0 0' }}>
                    현재 이용 중인 <strong>{currentBay.bay_no}번 타석</strong>의 남은 시간이 5분 미만(<strong>{currentRemMin}분 남음</strong>)이므로 자리 이동이 제한됩니다.
                  </p>
                </div>
              </div>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#ef4444',
                  background: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '12px'
                }}
              >
                이용 종료 임박
              </span>
            </div>
          ) : (
            <div
              style={{
                background: 'linear-gradient(135deg, #031510 0%, #022c22 100%)',
                border: '2px solid #10b981',
                borderRadius: '20px',
                padding: '20px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 8px 24px rgba(6, 78, 59, 0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '16px', border: '1px solid #10b981' }}>
                  <ArrowLeftRight size={28} style={{ color: '#10b981' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, background: '#10b981', color: '#ffffff', padding: '3px 10px', borderRadius: '8px' }}>
                      현재 이용 중
                    </span>
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                      {currentBay?.bay_no}번 타석
                    </h3>
                    {selectedBayNo !== null && (
                      <>
                        <span style={{ fontSize: '20px', color: '#10b981', fontWeight: 900 }}>➔</span>
                        <span style={{ fontSize: '13px', fontWeight: 900, background: '#3b82f6', color: '#ffffff', padding: '3px 10px', borderRadius: '8px' }}>
                          이동 대상
                        </span>
                        <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#60a5fa', margin: 0 }}>
                          {selectedBayNo}번 타석
                        </h3>
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: '15px', color: '#a7f3d0', margin: '4px 0 0 0' }}>
                    회원명: <strong style={{ color: '#fff' }}>{memberName}</strong> | 이용 잔여 시간: <strong style={{ color: '#6ee7b7' }}>{currentRemMin}분 남음</strong> {currentBay?.end_time ? `(종료: ${currentBay.end_time})` : ''}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', color: '#6ee7b7', fontWeight: 800 }}>잔여시간 100% 보전 (상품 호환)</div>
                <div style={{ fontSize: '14px', color: '#a7f3d0', marginTop: '2px' }}>
                  {selectedBayNo !== null ? '하단 [선택 완료] 버튼을 누르면 즉시 이동됩니다.' : '이동을 원하시는 빈 타석 카드를 선택해 주세요.'}
                </div>
              </div>
            </div>
          )}
        </>
      )}

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

                  {/* 스펙 뱃지 바 (GDR+, VX, 좌타, 레슨전용 등) */}
                  {(() => {
                    const simType = bay.simulator_type || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).simulator_type; } catch { return null; } })() : null);
                    const handed = bay.handedness || bay.type || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).handedness; } catch { return null; } })() : null);
                    const lessonOnly = bay.is_lesson_only || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).is_lesson_only; } catch { return false; } })() : false);
                    const screenSpec = bay.screen_spec || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).screen_spec; } catch { return null; } })() : null);

                    const hasBadges = (simType && simType !== 'NONE') || (handed && (handed === 'LEFT' || handed === 'BOTH')) || lessonOnly || (screenSpec && screenSpec !== 'STANDARD');
                    if (!hasBadges) return null;

                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '2px' }}>
                        {simType && simType !== 'NONE' && (
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                            {simType === 'GDR_PLUS' ? 'GDR+' : simType === 'KAKAO_VX' ? 'VX' : simType === 'QED' ? 'QED' : simType === 'SDR' ? 'SDR' : simType}
                          </span>
                        )}
                        {handed && (handed === 'LEFT' || handed === 'BOTH') && (
                          <span style={{ fontSize: '9px', fontWeight: 900, padding: '1px 4px', borderRadius: '3px', background: handed === 'LEFT' ? '#ffe4e6' : '#f3e8ff', color: handed === 'LEFT' ? '#9f1239' : '#6b21a8', border: '1px solid #fecdd3' }}>
                            {handed === 'LEFT' ? '좌타 🎯' : '양타 ↔'}
                          </span>
                        )}
                        {lessonOnly && (
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: '#faf5ff', color: '#6b21a8', border: '1px solid #e9d5ff' }}>
                            레슨 🎓
                          </span>
                        )}
                        {screenSpec && screenSpec !== 'STANDARD' && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                            {screenSpec === 'WIDE_16_9' ? '16:9' : '커브드'}
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
          {isMoveMode && currentBay && selectedBayNo !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
                  border: '2px solid #10b981',
                  borderRadius: '16px',
                  padding: '12px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#a7f3d0', fontWeight: 700 }}>이전 타석</span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff' }}>{currentBay.bay_no}번</span>
                </div>
                <ArrowLeftRight size={24} style={{ color: '#10b981' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 700 }}>이동할 타석</span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#6ee7b7' }}>{selectedBayNo}번</span>
                </div>
                <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', color: '#ffffff', fontWeight: 800 }}>남은 {currentRemMin}분 100% 보전</span>
                  <span style={{ fontSize: '12px', color: '#a7f3d0' }}>선점 락: {countdown}초 남음</span>
                </div>
              </div>
            </div>
          ) : selectedBayNo !== null ? (
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
            <span style={{ fontSize: '16px', color: isTimeRestricted ? 'var(--neon-red)' : 'var(--text-secondary)', fontWeight: 700 }}>
              {isMoveMode 
                ? isTimeRestricted 
                  ? '⏱️ 이용 종료 임박(5분 미만)으로 자리 이동이 불가능합니다.' 
                  : hasNoActiveBay 
                  ? '현재 이용 중인 타석이 없습니다.' 
                  : '이동하실 목적지 빈 타석을 선택해 주세요.'
                : '배정하실 타석 카드를 터치하여 선택해 주세요.'}
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
            disabled={selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay}
            className="kiosk-btn kiosk-btn-primary"
            style={{ 
              width: '220px', 
              height: '64px', 
              borderRadius: '12px', 
              fontSize: '20px', 
              fontWeight: 800,
              opacity: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay) ? 0.5 : 1,
              cursor: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay) ? 'not-allowed' : 'pointer'
            }}
          >
            {preoccupyLoading ? '선점 처리 중...' : isMoveMode ? '타석 이동 확정' : '선택 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
