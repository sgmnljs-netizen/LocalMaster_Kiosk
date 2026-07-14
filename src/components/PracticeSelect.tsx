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
  
  // 회원/비회원 배정 방식 선택 모달 상태 (이전 화면에서 돌아왔을 때 복원 지원)
  const [showDecisionModal, setShowDecisionModal] = useState<boolean>(!!initialSelectedBayNo);

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

  // 층 이름 및 기술 스펙 하드코딩 함수 삭제 (서버 데이터 그대로 노출)

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

  // 모달 표기용 선택 타석 정보 추출
  const selectedBay = selectedBayNo !== null ? bays.find(b => b.bay_no === selectedBayNo) : null;
  const isOccupied = selectedBay?.status === 'OCCUPIED';

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
        /* 추가: 타일 액티브(터치) GPU 가속 애니메이션 */
        .luxury-tile {
          transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.15s ease;
        }
        .luxury-tile:active {
          transform: scale(0.96) !important;
          box-shadow: inset 0 4px 12px rgba(0,0,0,0.05) !important;
        }
      `}</style>

      {/* 1. 상단 실시간 타석 종합 전광판 (메인 화면에 있는 것 그대로 연동) */}
      <div style={{ width: '100%', background: '#fff', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
        <TopTeeboxDashboard 
          bays={bays} 
          onBayClick={handleBayTouch} 
          lang={lang} 
        />
      </div>

      {/* 2. 하단 조작 영역 컨테이너 (Bento Box) */}
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.03)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {/* 층 전환 대형 탭바 (좌측 정렬 및 버튼 가로사이즈 대폭 확대) */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', padding: '12px', borderRadius: '24px', background: '#f3f4f6', gap: '12px', flexWrap: 'nowrap', overflowX: 'auto' }}>
            {floorList.map(f => {
              return (
                <button
                  key={f}
                  onClick={() => setActiveFloor(f)}
                  style={{
                    minWidth: '160px', // 한 화면에 5개가 들어갈 수 있는 최적 크기
                    padding: '0 24px',
                    height: '64px',
                    fontSize: '22px',
                    fontWeight: 900,
                    borderRadius: '16px',
                    cursor: 'pointer',
                    color: activeFloor === f ? '#047857' : '#6b7280',
                    background: activeFloor === f ? '#ffffff' : 'transparent',
                    border: 'none',
                    outline: 'none',
                    boxShadow: activeFloor === f ? '0 6px 16px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                    whiteSpace: 'nowrap',
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  {/* 백오피스 원본 데이터 그대로 노출 */}
                  {f}
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

        {/* 실시간 상세 타석 카드 그리드 (Apple Ripple Laser Wave) */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            
            // [현재 뷰: Pebble 조약돌 뷰]
            gap: '18px',
            padding: '24px',
            
            // [대안 뷰: 여백 없는 Seamless 뷰 (나중을 위해 보존)]
            // gap: '0px',
            // padding: '0px',
            // overflow: 'hidden',

            background: '#f5f5f7',
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

            // 1. 공통 타일 스타일 변수 (Pebble Shape - GPU Optimized Luxury)
            let containerBg = 'linear-gradient(145deg, #ffffff 0%, #f9fafb 100%)'; // 은은한 펄 그라데이션
            let containerBorder = '1px solid rgba(209, 213, 219, 0.5)'; // 은은한 경계선
            let boxShadow = '0 6px 16px rgba(0,0,0,0.04), inset 0 2px 0 rgba(255,255,255,1)'; // 상단 하이라이트 인셋 섀도우
            let statusText = lang === 'KO' ? '이용가능' : 'Available';
            let statusColor = '#047857'; // 시인성 극대화를 위해 기존보다 더 짙은 에메랄드 텍스트로 변경 
            let statusBadgeBg = '#ecfdf5'; // 맑은 민트 뱃지 배경
            let numberColor = '#111827'; // 타석 번호
            let numberTextShadow = '0 1px 1px rgba(255,255,255,0.8)'; // 메탈릭 양각 느낌
            let cursorStyle = 'pointer';
            let opacity = '1';
            let pointerEvents: React.CSSProperties['pointerEvents'] = 'auto';
            let transform = 'none';
            let zIndex = 1;

            if (isSelected) {
              containerBg = 'linear-gradient(145deg, #022c22 0%, #064e3b 100%)'; // Midnight Stealth Green 그라데이션
              containerBorder = '1px solid #10b981'; // Neon Green
              boxShadow = '0 12px 30px rgba(16,185,129,0.3), inset 0 2px 0 rgba(255,255,255,0.1)';
              statusText = lang === 'KO' ? '선택 완료' : 'Selected';
              statusColor = '#022c22';
              statusBadgeBg = '#10b981';
              numberColor = '#ffffff'; // 하얀색 번호
              numberTextShadow = 'none';
              transform = 'scale(1.02) translateY(-2px)'; // 선택 시 약간 팝업
              zIndex = 10;
            } else if (isOccupied) {
              containerBg = '#f3f4f6';
              containerBorder = '1px solid #e5e7eb';
              boxShadow = 'inset 0 4px 10px rgba(0,0,0,0.02)';
              statusText = lang === 'KO' ? '이용중' : 'Occupied';
              statusColor = '#6b7280';
              statusBadgeBg = '#e5e7eb';
              numberColor = '#9ca3af'; // 연한 회색 번호
              numberTextShadow = 'none';
              cursorStyle = 'not-allowed';
            } else if (isPreOccupiedByOther) {
              containerBg = '#f9fafb';
              containerBorder = '1px solid #e5e7eb';
              boxShadow = 'none';
              statusText = lang === 'KO' ? '선택 중' : 'Hold';
              statusColor = '#9ca3af';
              statusBadgeBg = '#f3f4f6';
              numberColor = '#d1d5db';
              numberTextShadow = 'none';
              cursorStyle = 'not-allowed';
              pointerEvents = 'none';
            } else if (isUnderMaintenance) {
              containerBg = '#fef2f2';
              containerBorder = '1px solid #fca5a5';
              boxShadow = 'none';
              statusText = lang === 'KO' ? '점검중' : 'Maint';
              statusColor = '#dc2626';
              statusBadgeBg = '#fee2e2';
              numberColor = '#f87171';
              numberTextShadow = 'none';
              cursorStyle = 'not-allowed';
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
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      borderRadius: '20px', border: '2.5px solid #34c759',
                      animation: 'rippleWave 1.8s infinite linear',
                      pointerEvents: 'none', zIndex: -1
                    }} />
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      borderRadius: '20px', border: '2.5px solid #34c759',
                      animation: 'rippleWave 1.8s infinite linear', animationDelay: '0.9s',
                      pointerEvents: 'none', zIndex: -1
                    }} />
                  </>
                )}

                {/* --- CARD MAIN BODY --- */}
                <div
                  className={isAvailable ? "luxury-tile" : ""}
                  onClick={() => (isAvailable || isSelected) && handleBayTouch(bay.bay_no)}
                  style={{
                    height: '140px',
                    borderRadius: '20px', // [현재 뷰: 둥근 모서리]
                    // borderRadius: '0px', // [대안 뷰: 여백 없는 Seamless 뷰 적용 시 직각 모서리 사용]
                    border: containerBorder,
                    background: containerBg,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px', // 번호와 뱃지 사이의 확실한 여백
                    cursor: cursorStyle,
                    transition: 'all 0.2s ease',
                    transform: transform,
                    position: 'relative',
                    overflow: 'hidden',
                    pointerEvents: pointerEvents,
                    boxShadow: boxShadow
                  }}
                >
                  {/* --- LEFT/RIGHT BADGE (우상단 아이콘) --- */}
                  {bay.type === 'LEFT' && (
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: isSelected ? 'rgba(255,255,255,0.2)' : '#e0f2fe',
                      color: isSelected ? '#ffffff' : '#0284c7',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}>
                      {lang === 'KO' ? '좌타' : 'L'}
                    </div>
                  )}

                  {/* --- NUMBER (선명한 메탈릭 양각 번호) --- */}
                  <div style={{
                    fontSize: '38px',
                    fontWeight: 900,
                    fontFamily: 'monospace',
                    color: numberColor,
                    textShadow: numberTextShadow,
                    letterSpacing: '-1px',
                    lineHeight: '1'
                  }}>
                    {bay.bay_no.toString().padStart(2, '0')}
                  </div>

                  {/* --- STATUS BADGE & TIMER (상태 뱃지) --- */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {isOccupied && bay.minutes_left !== undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ background: statusBadgeBg, padding: '4px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Timer size={14} style={{ color: statusColor }} />
                          <span style={{ fontSize: '14px', fontWeight: 700, color: statusColor }}>{bay.minutes_left}분 남음</span>
                        </div>
                        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (bay.minutes_left / 60) * 100)}%`, height: '100%', backgroundColor: statusColor, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ background: statusBadgeBg, padding: '6px 16px', borderRadius: '12px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 900, color: statusColor, letterSpacing: '-0.3px' }}>
                            {statusText}
                          </span>
                        </div>
                        {isSelected && (
                          <span style={{ position: 'absolute', bottom: '8px', fontSize: '12px', fontWeight: 700, color: '#10b981', animation: 'softBlink 1s infinite alternate' }}>
                            {countdown}s left
                          </span>
                        )}
                      </>
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
                  style={{ 
                    background: 'rgba(5, 150, 105, 0.08)', 
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    fontSize: '16px', 
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={16} style={{ color: '#059669' }} />
                  <span style={{ color: '#111827' }}>
                    {lang === 'KO' ? '선택된 타석:' : 'Selected:'}{' '}
                    <strong style={{ color: '#059669', fontSize: '20px' }}>{selectedBayNo}</strong>
                    {lang === 'KO' ? '번' : ''}
                  </span>
                </div>
                <span style={{ fontSize: '14px', color: '#ea580c', fontWeight: 700 }}>
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
              {lang === 'KO' ? '돌아가기' : 'Back'}
            </button>
            
            <button
              onClick={handleConfirmClick}
              disabled={selectedBayNo === null || preoccupyLoading}
              className="kiosk-btn"
              style={{ 
                background: 'linear-gradient(135deg, #031510 0%, #022c22 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255,255,255,0.05)',
                color: '#ffffff',
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

      {/* 4. 회원권 배정 vs 일일권 분기 모달 (Light & Glass 리뉴얼) */}
      {/* 4. 회원권 배정 vs 일일권 분기 모달 (Premium Light Glass Theme) */}
      {showDecisionModal && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'var(--overlay-bg, rgba(255, 255, 255, 0.6))',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          <div 
            className="premium-glass-card"
            style={{
              width: '780px',
              padding: '56px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: '40px',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
                {lang === 'KO' ? '배정 방식을 선택해 주세요' : 'Select Allocation Type'}
              </h3>
              <p style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 500, margin: 0 }}>
                {lang === 'KO' 
                  ? '선택하신 타석의 이용 방식을 선택합니다.' 
                  : 'Please select the allocation type for the teebox.'}
              </p>
            </div>

            {/* Double Check 티켓 (라이트 글래스) */}
            {selectedBay && (
              <div 
                className="glass-panel"
                style={{
                  padding: '24px 32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: '24px',
                  background: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                {/* 1. 타석 번호 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '선택 타석' : 'Selected Bay'}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1 }}>{selectedBay.bay_no}</span>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>{lang === 'KO' ? '번' : ''}</span>
                  </div>
                </div>
                
                {/* 세로선 */}
                <div style={{ width: '1px', height: '48px', background: 'var(--glass-border)' }} />

                {/* 2. 시작 시간 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '이용 시작 시간' : 'Start Time'}</span>
                  {!isOccupied ? (
                    <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--system-blue)', letterSpacing: '-0.5px' }}>
                      {lang === 'KO' ? '결제 완료 즉시 (NOW)' : 'Start Immediately'}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--system-orange)', letterSpacing: '-0.5px' }}>
                        {selectedBay.end_time 
                          ? (lang === 'KO' ? `약 ${selectedBay.end_time.slice(0, 2)}:${selectedBay.end_time.slice(2, 4)} 예상` : `Around ${selectedBay.end_time.slice(0, 2)}:${selectedBay.end_time.slice(2, 4)}`)
                          : (lang === 'KO' ? '대기 시간 발생' : 'Wait Required')}
                      </span>
                      {selectedBay.minutes_left !== undefined && (
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--system-orange)', marginTop: '2px', opacity: 0.8 }}>
                          {lang === 'KO' ? `(약 ${selectedBay.minutes_left}분 대기)` : `(Approx. ${selectedBay.minutes_left}m wait)`}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 세로선 */}
                <div style={{ width: '1px', height: '48px', background: 'var(--glass-border)' }} />

                {/* 3. 배정 유형 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '이용 유형' : 'Type'}</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: !isOccupied ? 'var(--system-blue)' : 'var(--system-orange)', letterSpacing: '-0.5px' }}>
                    {!isOccupied 
                      ? (lang === 'KO' ? '✨ 즉시 배정' : 'Instant Allocation') 
                      : (lang === 'KO' ? '👥 대기 예약' : 'Waitlist Booking')}
                  </span>
                </div>
              </div>
            )}

            {/* Card Buttons (프리미엄 럭셔리 스타일) */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px' }}>
              {/* Type 1: 회원권 */}
              <div 
                onClick={() => handleDecisionConfirm('MEMBERSHIP')}
                className="glass-panel"
                style={{
                  flex: 1,
                  padding: '40px 24px',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '20px',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
                  transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.2s'
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
              >
                <div style={{ background: 'var(--text-primary)', padding: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={36} style={{ color: '#ffffff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {lang === 'KO' ? '보유 회원권으로 배정' : 'Membership Pass'}
                  </span>
                  <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {lang === 'KO' 
                      ? '보유 중인 회원권(기간/횟수제)으로\n회원 인증 후 즉시 배정합니다.' 
                      : 'Authenticate with your active membership pass.'}
                  </span>
                </div>
              </div>

              {/* Type 2: 일일권 */}
              <div 
                onClick={() => handleDecisionConfirm('DAILY')}
                className="glass-panel"
                style={{
                  flex: 1,
                  padding: '40px 24px',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '20px',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
                  transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.2s'
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
              >
                <div style={{ background: 'var(--text-primary)', padding: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CreditCard size={36} style={{ color: '#ffffff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {lang === 'KO' ? '일일권 즉시 결제' : 'Daily Pass Payment'}
                  </span>
                  <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {lang === 'KO' 
                      ? '비회원 또는 정보 입력 없이\n일일 타석권을 현장 결제합니다.' 
                      : 'Purchase a daily pass directly.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
              <button 
                className="kiosk-btn"
                onClick={() => setShowDecisionModal(false)}
                style={{ 
                  width: '200px', 
                  height: '56px', 
                  borderRadius: '28px', 
                  fontSize: '18px',
                  fontWeight: 700,
                  background: 'rgba(0, 0, 0, 0.05)',
                  color: 'var(--text-secondary)',
                  border: 'none'
                }}
              >
                {lang === 'KO' ? '취소 후 돌아가기' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
