import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeftRight, Check, Compass, Layers, ShieldAlert, Timer, UserCheck, CreditCard, X } from 'lucide-react';
import { api, Bay } from '../services/api';
import { TopTeeboxDashboard } from './TopTeeboxDashboard';

interface PracticeSelectProps {
  bays: Bay[];
  lang: 'KO' | 'EN';
  initialSelectedBayNo?: number | null;
  onBaySelected: (bayNo: number, purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => void;
  onCancel: () => void;
  onRefreshBays: () => void;
}

export const PracticeSelect: React.FC<PracticeSelectProps> = ({
  bays,
  lang,
  initialSelectedBayNo,
  onBaySelected,
  onCancel,
  onRefreshBays
}) => {
  const [activeFloor, setActiveFloor] = useState<string>('1F');
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(initialSelectedBayNo || null);
  const [preoccupyLoading, setPreoccupyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState<number>(60);
  
  // 회원/비회원 배정 방식 선택 모달 상태
  const [showDecisionModal, setShowDecisionModal] = useState(false);

  // 정상적인 단계 이동(Confirm) 시에만 언마운트 클린업 락 해제를 스킵하기 위한 Ref
  const isConfirmedRef = useRef(false);

  // 선점 락 제한시간 1초 간격 갱신
  useEffect(() => {
    if (selectedBayNo === null) return;
    
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleRelease();
          setErrorMsg(lang === 'KO' ? '선점 유효 시간이 초과되어 타석 선택이 자동 취소되었습니다.' : 'Selection timeout. Teebox released.');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedBayNo, lang]);

  // 컴포넌트 언마운트 시 비정상 이탈(예: 광고 복귀, 홈 이동 등)인 경우 선점 락을 자동으로 즉시 해제하는 Cleanup Guard
  useEffect(() => {
    return () => {
      if (selectedBayNo !== null && !isConfirmedRef.current) {
        api.releaseBay(selectedBayNo).catch(err => console.error('Cleanup release failed:', err));
      }
    };
  }, [selectedBayNo]);

  // bays 데이터로부터 동적으로 존재하는 층 목록 추출 (1F, 2F, 3F 등 문자열 기준 정렬)
  const floorList = Array.from(new Set(bays.map(b => b.floor || (b.floor_no ? `${b.floor_no}F` : '1F')))).sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  // 첫 진입 시 동적으로 추출된 층의 첫 번째 값으로 설정
  useEffect(() => {
    if (floorList.length > 0 && !floorList.includes(activeFloor)) {
      setActiveFloor(floorList[0]);
    }
  }, [bays]);

  // 타석 터치 - 원자적 선점(Pre-emption) 락 시도
  const handleBayTouch = async (bayNo: number) => {
    const bay = bays.find(b => b.bay_no === bayNo);
    if (!bay) return;
    if (bay.status === 'UNDER_MAINTENANCE') return;
    if (bay.status === 'OCCUPIED') return;
    
    // 이미 타인에 의해 선점된 경우
    if (bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
      setErrorMsg(lang === 'KO' ? '이미 다른 고객님께서 선택 중인 타석입니다.' : 'This teebox is currently being selected by another user.');
      return;
    }

    // 내가 이미 선택한 타석을 다시 누른 경우 -> 선택 해제
    if (selectedBayNo === bayNo) {
      handleRelease();
      return;
    }

    // 기존에 선택했던 타석이 있었다면 먼저 해제
    if (selectedBayNo !== null) {
      await api.releaseBay(selectedBayNo);
    }

    setErrorMsg('');
    setPreoccupyLoading(true);

    try {
      const success = await api.preoccupyBay(bayNo);
      if (success) {
        setSelectedBayNo(bayNo);
        // 상단 현황판 클릭 등으로 인해 층이 다른 곳일 경우 활성 층 자동 연동
        const bayFloor = bay.floor || (bay.floor_no ? `${bay.floor_no}F` : '1F');
        if (bayFloor !== activeFloor) {
          setActiveFloor(bayFloor);
        }
      } else {
        setErrorMsg(lang === 'KO' ? '타석 선점에 실패했습니다. 다시 시도해 주세요.' : 'Failed to secure teebox. Please try again.');
      }
    } catch {
      setErrorMsg(lang === 'KO' ? '타석 선점 중 오류가 발생했습니다.' : 'Error occurred while securing teebox.');
    } finally {
      setPreoccupyLoading(false);
      onRefreshBays(); // 최신 상태 즉시 갱신
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

  // 층 이름 및 기술 스펙 반환 가이드
  const getFloorInfo = (f: string) => {
    if (f === '1F') return { label: '1F GDR+', spec: '1층 GDR+ 초고속 센서 (1~20번)' };
    if (f === '2F') return { label: '2F VX', spec: '2층 Kakao VX 스크린 (21~40번)' };
    if (f === '3F') return { label: '3F Room', spec: '3층 Premium Room 스크린 (41~50번)' };
    return { label: f, spec: `${f} 연습 타석` };
  };

  // 선택 완료 버튼 클릭 -> 분기 의사결정 모달 노출
  const handleConfirmClick = () => {
    if (selectedBayNo !== null) {
      setShowDecisionModal(true);
    }
  };

  // 최종 분기 선택 완료 (회원권 배정 vs 일일권 결제)
  const handleDecisionConfirm = (type: 'MEMBERSHIP' | 'DAILY') => {
    if (selectedBayNo === null) return;
    isConfirmedRef.current = true; // 정상 승인 상태로 기록하여 unmount cleanup 락 해제 방지
    setShowDecisionModal(false);
    
    const purposeType = type === 'MEMBERSHIP' ? 'ALLOCATE_MEMBERSHIP' : 'ALLOCATE_DAILY';
    onBaySelected(selectedBayNo, purposeType);
  };

  // 현재 활성 층 타석 필터링
  const floorBays = bays.filter(b => (b.floor || (b.floor_no ? `${b.floor_no}F` : '1F')) === activeFloor);

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '24px',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
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

      {/* 1. 상단 실시간 타석 종합 전광판 (메인 화면에 있는 것 그대로 연동) */}
      <div style={{ width: '100%', background: '#fff', borderRadius: '24px', overflow: 'hidden' }}>
        <TopTeeboxDashboard 
          bays={bays} 
          onBayClick={handleBayTouch} 
          lang={lang} 
        />
      </div>

      {/* 2. 하단 조작 영역 컨테이너 */}
      <div 
        className="glass-panel"
        style={{
          padding: '30px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {/* 층 전환 탭바 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={24} style={{ color: 'var(--neon-indigo)' }} />
            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
              {lang === 'KO' ? '상세 배치도' : 'Detailed Layout'}
            </h3>
          </div>

          {/* 동적 층 탭 버튼 */}
          <div className="glass-panel" style={{ display: 'flex', padding: '6px', borderRadius: '14px', background: 'rgba(0,0,0,0.25)' }}>
            {floorList.map(f => {
              const info = getFloorInfo(f);
              return (
                <button
                  key={f}
                  onClick={() => setActiveFloor(f)}
                  style={{
                    padding: '8px 20px',
                    fontSize: '16px',
                    fontWeight: 800,
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    color: activeFloor === f ? '#fff' : 'var(--text-secondary)',
                    background: activeFloor === f ? 'var(--neon-indigo)' : 'transparent',
                    boxShadow: activeFloor === f ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 에러 피드백 메세지 */}
        {errorMsg && (
          <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} style={{ color: 'var(--neon-red)' }} />
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
          </div>
        )}

        {/* 층 스펙 가이드 안내 */}
        <div 
          style={{ 
            background: 'rgba(255,255,255,0.02)', 
            border: '1px solid var(--glass-border)', 
            padding: '10px 18px', 
            borderRadius: '10px',
            fontSize: '14px',
            color: 'var(--text-secondary)'
          }}
        >
          ⛳ {lang === 'KO' ? '층별 장비 및 방향:' : 'Hardware & Direction:'}{' '}
          <strong style={{ color: 'var(--neon-indigo)' }}>{getFloorInfo(activeFloor).spec}</strong>
          {' • '}
          {lang === 'KO' ? '좌타석(L 배지) 및 우타석 여부를 꼭 확인하고 선택해 주세요.' : 'Please check Left/Right teebox before selection.'}
        </div>

        {/* 실시간 상세 타석 카드 그리드 (Apple Ripple Laser Wave) */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '18px', // 카드 간격 확장하여 Ripple Wave 효과 극대화
            background: '#f5f5f7',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid #e5e5ea',
            minHeight: '320px'
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
              headerBg = '#354238'; // Midnight Green
              headerTextColor = '#ffffff';
            } else if (isSelected) {
              headerBg = '#34c759'; // 고대비 맑은 애플 그린 헤더 복원
              headerTextColor = '#121419'; // 진하고 선명한 검정 폰트
            } else if (isOccupied) {
              headerBg = '#d2d2d7'; // 알루미늄 그레이
              headerTextColor = '#515154';
            } else if (isPreOccupiedByOther) {
              headerBg = '#e5e5ea';
              headerTextColor = '#86868b';
            } else if (isUnderMaintenance) {
              headerBg = '#ff453a'; // 애플 레드
              headerTextColor = '#ffffff';
            }

            // 2. 바디/컨테이너 영역 스타일 (70% 높이)
            let containerBorder = '1px solid #dadce0';
            let containerBg = '#ffffff';
            let statusText = lang === 'KO' ? '이용가능' : 'Available';
            let statusColor = '#354238'; // Midnight Green
            let cursorStyle = 'pointer';
            let opacity = '1';
            let pointerEvents: React.CSSProperties['pointerEvents'] = 'auto';
            let transform = 'none';
            let zIndex = 1;
            let boxShadow = 'none';

            if (isAvailable) {
              containerBorder = '1.5px solid #dadce0'; // 차분한 테두리로 하향하여 선택 카드 극대화
              containerBg = '#ffffff';
              statusText = lang === 'KO' ? '이용가능' : 'Available';
              statusColor = '#354238';
            } else if (isSelected) {
              containerBorder = '2.5px solid #354238'; // 묵직한 미드나잇 그린 테두리
              containerBg = '#ffffff'; // 밝은 화이트 배경 복원 (가시성 회복)
              statusText = lang === 'KO' ? '선택 완료' : 'Selected';
              statusColor = '#1d4e33'; // 짙은 포레스트 그린 텍스트
              
              // 3D 공중 부양 Elevation 극대화
              transform = 'scale(1.05) translateY(-6px)';
              zIndex = 10;
              boxShadow = '0 12px 30px rgba(53, 66, 56, 0.22)';
            } else if (isOccupied) {
              containerBorder = '1px solid #dadce0';
              containerBg = '#eaeaea';
              statusText = lang === 'KO' ? '이용중' : 'Occupied';
              statusColor = '#515154';
              cursorStyle = 'not-allowed';
            } else if (isPreOccupiedByOther) {
              containerBorder = '1px solid #e5e5ea';
              containerBg = '#f5f5f7';
              statusText = lang === 'KO' ? '선택 중' : 'Hold';
              statusColor = '#86868b';
              cursorStyle = 'not-allowed';
              opacity = '0.35';
              pointerEvents = 'none';
            } else if (isUnderMaintenance) {
              containerBorder = '1.5px solid #ff453a';
              containerBg = '#fff5f5';
              statusText = lang === 'KO' ? '점검중' : 'Maint';
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
                  onClick={() => (isAvailable || isSelected) && handleBayTouch(bay.bay_no)}
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
                        {lang === 'KO' ? '좌타' : 'L'}
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
                          color: '#ff453a', // 빨간색 타이머로 시선 고정
                          marginTop: '-2px', 
                          opacity: 0.9,
                          animation: 'softBlink 1s infinite alternate'
                        }}
                      >
                        {countdown}s left
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. 하단 액션 컨트롤러 바 */}
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderTop: '1px solid var(--bg-tertiary)', 
            paddingTop: '18px',
            marginTop: '8px'
          }}
        >
          <div>
            {selectedBayNo !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div 
                  className="neon-border-indigo"
                  style={{ 
                    background: 'rgba(99,102,241,0.08)', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    fontSize: '16px', 
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={16} style={{ color: 'var(--neon-indigo)' }} />
                  <span>
                    {lang === 'KO' ? '선택된 타석:' : 'Selected:'}{' '}
                    <strong style={{ color: '#fff', fontSize: '20px' }}>{selectedBayNo}</strong>
                    {lang === 'KO' ? '번' : ''}
                  </span>
                </div>
                <span style={{ fontSize: '14px', color: 'var(--neon-amber)', fontWeight: 700 }}>
                  ({lang === 'KO' ? `배정 제한시간: ${countdown}초` : `Limit: ${countdown}s`})
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {lang === 'KO' ? '배정받으실 빈 타석 타일을 클릭해 주세요.' : 'Please tap an available teebox tile.'}
              </span>
            )}
          </div>

          {/* Main Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="kiosk-btn" 
              style={{ width: '130px', height: '56px', borderRadius: '10px', fontSize: '16px', fontWeight: 800 }}
              onClick={async () => {
                await handleRelease();
                onCancel();
              }}
            >
              {lang === 'KO' ? '이전으로' : 'Back'}
            </button>
            
            <button
              onClick={handleConfirmClick}
              disabled={selectedBayNo === null || preoccupyLoading}
              className="kiosk-btn kiosk-btn-primary"
              style={{ 
                width: '180px', 
                height: '56px', 
                borderRadius: '10px', 
                fontSize: '18px', 
                fontWeight: 800 
              }}
            >
              {preoccupyLoading 
                ? (lang === 'KO' ? '선점 중...' : 'Securing...') 
                : (lang === 'KO' ? '선택 완료' : 'Select Complete')}
            </button>
          </div>
        </div>
      </div>

      {/* 4. 회원권 배정 vs 일일권 분기 모달 */}
      {showDecisionModal && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 7, 12, 0.8)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            borderRadius: '24px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div 
            className="neon-border-indigo"
            style={{
              width: '640px',
              background: '#121419',
              borderRadius: '24px',
              padding: '36px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
              position: 'relative'
            }}
          >
            {/* Close Button */}
            <button 
              onClick={() => setShowDecisionModal(false)}
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <X size={24} />
            </button>

            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
                {lang === 'KO' ? '배정 방식 선택' : 'Select Allocation Type'}
              </h3>
              <p style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {lang === 'KO' 
                  ? `${selectedBayNo}번 타석의 이용 유형을 선택해 주세요.` 
                  : `Please select the allocation type for teebox ${selectedBayNo}.`}
              </p>
            </div>

            {/* Card Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Type 1 */}
              <div 
                onClick={() => handleDecisionConfirm('MEMBERSHIP')}
                className="premium-glass-card"
                style={{
                  padding: '24px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  border: '1px solid rgba(52, 199, 89, 0.25)',
                  background: 'rgba(52, 199, 89, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ background: 'rgba(52, 199, 89, 0.1)', padding: '14px', borderRadius: '12px' }}>
                  <UserCheck size={28} style={{ color: '#34c759' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '19px', fontWeight: 800, color: '#fff' }}>
                    {lang === 'KO' ? '보유 회원권으로 배정 (회원 인증)' : 'Use Membership Pass (Member Auth)'}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {lang === 'KO' 
                      ? '보유 중인 기간제/횟수제 회원 이용권으로 인증 후 즉시 배정합니다.' 
                      : 'Authenticate with your active membership pass to allocate instantly.'}
                  </span>
                </div>
              </div>

              {/* Type 2 */}
              <div 
                onClick={() => handleDecisionConfirm('DAILY')}
                className="premium-glass-card"
                style={{
                  padding: '24px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  background: 'rgba(99, 102, 241, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '14px', borderRadius: '12px' }}>
                  <CreditCard size={28} style={{ color: 'var(--neon-indigo)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '19px', fontWeight: 800, color: '#fff' }}>
                    {lang === 'KO' ? '일일 이용권 구매 (바로 결제)' : 'Purchase Daily Pass (Direct Payment)'}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {lang === 'KO' 
                      ? '비회원 또는 회원 정보 입력 없이 일일 타석권을 즉시 구매하여 연습을 시작합니다.' 
                      : 'Purchase a daily pass card directly without entering user information.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button 
                className="kiosk-btn"
                style={{ width: '120px', height: '48px', borderRadius: '8px', fontSize: '14px' }}
                onClick={() => setShowDecisionModal(false)}
              >
                {lang === 'KO' ? '취소' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
