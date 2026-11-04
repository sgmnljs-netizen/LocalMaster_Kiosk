import React from 'react';
import { CornerUpLeft } from 'lucide-react';
import { Bay } from '../services/api';
import { evaluateBayHardwareState, isBayTrulyAvailableForKiosk } from '../utils/bayStatusGuard';
import { sortFloorsDescending, sortBaysByNumber } from '../utils/floorUtils';
import { useKioskSettings, KioskTopDashboardMode } from '../stores/kioskSettings';
import { KioskLiveClock } from './KioskLiveClock';

interface TopTeeboxDashboardProps {
  bays: Bay[];
  onBayClick: (bayNo: number) => void;
  lang: 'KO' | 'EN';
  modeOverride?: KioskTopDashboardMode;
  onClose?: () => void;
  selectedBayNo?: number | null;
  selectedBayNos?: number[];
}

export const TopTeeboxDashboard: React.FC<TopTeeboxDashboardProps> = ({
  bays,
  onBayClick,
  lang,
  modeOverride,
  onClose,
  selectedBayNo,
  selectedBayNos,
}) => {
  const { settings } = useKioskSettings();
  const displayMode: KioskTopDashboardMode = modeOverride || settings.topDashboardMode || 'AUTO';

  if (displayMode === 'HIDDEN') {
    return null;
  }

  // 🔄 [구역 카테고리 동적 격리] 상위 PracticeSelect에서 전달된 구역 필터링 타석 목록 기준 (PAR3만 안전 제외)
  const practiceBays = bays.filter(bay => {
    const zCode = String((bay as any).zone_code || (bay as any).zoneCode || '').toUpperCase();
    return zCode !== 'PAR3';
  });

  // 층별 동적 그룹핑 (floor 문자열 필드 기준, 없을 시 floor_no 백업)
  const floorsMap: { [key: string]: Bay[] } = {};
  practiceBays.forEach(bay => {
    let floorKey = '1F';
    if (bay.floor) {
      floorKey = String(bay.floor);
    } else if (bay.floor_no) {
      floorKey = `${bay.floor_no}F`;
    }
    
    if (!floorsMap[floorKey]) {
      floorsMap[floorKey] = [];
    }
    floorsMap[floorKey].push(bay);
  });

  // 층 정렬: 프런트포스(floorUtils.ts)와 1:1 동일하게 건물 물리 층수 내림차순 배치 (예: 3F 상단 -> 2F 중단 -> 1F 최하단)
  const sortedFloors = sortFloorsDescending(Object.keys(floorsMap));
  sortedFloors.forEach(floorKey => {
    floorsMap[floorKey] = sortBaysByNumber(floorsMap[floorKey]);
  });

  const isBayBlocked = (b: Bay) => {
    return evaluateBayHardwareState(b).isBlocked;
  };

  const renderBayCard = (bay: Bay, floorBayCount: number) => {
    const canonicalStatus = String((bay as any).status_info?.code || bay.status || '').toUpperCase();
    const isUnderMaintenance = isBayBlocked(bay);
    const isLessonOnly = Boolean(bay.is_lesson_only);
    const isAvailable = canonicalStatus === 'AVAILABLE' && !isUnderMaintenance && !isLessonOnly;
    const isPreOccupied = canonicalStatus === 'PRE_OCCUPIED';
    const isPrepare = canonicalStatus === 'PREPARE';
    const isOccupied = ['OCCUPIED', 'USE', 'IN_USE'].includes(canonicalStatus);

    // 모드 및 타석 수에 따른 타일 치수·타이포그래피 동적 계산
    const isCompactSingleRow = displayMode === 'COMPACT_1ROW' && floorBayCount > 12;
    const isMultiRowAuto = displayMode === 'AUTO' && floorBayCount > 12;
    const tileHeight = isCompactSingleRow ? '54px' : isMultiRowAuto ? '56px' : (sortedFloors.length >= 3 ? '62px' : '68px');
    const numFontSize = isCompactSingleRow ? '22px' : isMultiRowAuto ? '26px' : '28px';

    let bgCol = '#e5e7eb';
    let borderCol = 'transparent';
    let textColor = '#6b7280';
    let cursorStyle = 'not-allowed';
    let glow = 'none';

    const isSelected = selectedBayNo === bay.bay_no || (selectedBayNos && selectedBayNos.includes(bay.bay_no));

    if (isSelected) {
      // 🔵 현재 선택된 타석: 애플 시그니처 딥 블루 & 고광택 더블 링
      bgCol = '#0071e3';
      borderCol = '#ffffff';
      textColor = '#ffffff';
      glow = '0 0 0 3px #ffffff, 0 0 0 6px #0071e3, 0 6px 20px rgba(0, 113, 227, 0.6)';
    } else if (bay.is_paused) {
      // 🟠 일시정지 / 볼회수: 앰버 오렌지
      bgCol = 'linear-gradient(145deg, #ea580c 0%, #c2410c 100%)';
      borderCol = 'rgba(255, 255, 255, 0.2)';
      textColor = '#ffffff';
      glow = '0 2px 6px rgba(234, 88, 12, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
    } else if (isAvailable) {
      // 🟢 빈타석: 에메랄드 그린
      bgCol = 'linear-gradient(145deg, #059669 0%, #047857 60%, #064e3b 100%)';
      borderCol = 'rgba(255, 255, 255, 0.2)';
      textColor = '#ffffff';
      cursorStyle = 'pointer';
      glow = '0 3px 8px rgba(5, 150, 105, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.35)';
    } else if (isPreOccupied) {
      // 🟡 예약/선점중: 앰버 골드
      bgCol = 'linear-gradient(145deg, #f59e0b 0%, #d97706 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      glow = '0 2px 6px rgba(217, 119, 6, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
    } else if (isOccupied || isPrepare) {
      // ⚪ 사용중 (준비시간 포함 일원화): 슬레이트 그레이
      bgCol = '#e5e7eb';
      borderCol = 'rgba(0, 0, 0, 0.08)';
      textColor = '#4b5563';
      glow = 'inset 0 2px 4px rgba(0, 0, 0, 0.06)';
    } else if (isUnderMaintenance) {
      // 🔴 점검중: 레드
      bgCol = 'linear-gradient(145deg, #ef4444 0%, #dc2626 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      glow = '0 2px 6px rgba(0, 0, 0, 0.12)';
    }

    return (
      <div
        key={bay.bay_no}
        onClick={() => isAvailable && onBayClick(bay.bay_no)}
        style={{
          height: tileHeight,
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bgCol,
          border: borderCol !== 'transparent' ? `1px solid ${borderCol}` : 'none',
          cursor: cursorStyle,
          boxShadow: glow,
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          transform: isSelected ? 'scale(1.12)' : 'none',
          zIndex: isSelected ? 20 : 1,
          animation: isSelected
            ? 'selectedBayHaloPulse 1.6s infinite ease-in-out'
            : (isPreOccupied ? 'dashboardPulse 1.5s infinite ease-in-out' : 'none')
        }}
        title={`${bay.bay_no}번 타석: ${isSelected ? '선택됨' : bay.is_paused ? '일시정지' : isAvailable ? '이용가능' : (isOccupied || isPrepare) ? '사용중' : isPreOccupied ? '선점중' : '점검중'}`}
      >
        {/* 타석 번호 (색상으로만 상태 구분, 글씨 라벨 일절 없음) */}
        <span style={{ fontSize: numFontSize, fontWeight: 800, color: textColor, lineHeight: 1, letterSpacing: '-0.5px' }}>
          {bay.bay_no}
        </span>

        {/* 좌타석(Left Teebox)인 경우 L 배지 표시 */}
        {bay.type === 'LEFT' && (
          <span 
            style={{ 
              position: 'absolute', 
              top: '-4px', 
              right: '-4px', 
              fontSize: '11px', 
              fontWeight: 800, 
              background: '#0071e3', 
              color: '#fff', 
              padding: '1px 5px', 
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
            }}
          >
            L
          </span>
        )}
      </div>
    );
  };

  return (
    <div 
      style={{
        width: '100%',
        height: 'auto',
        background: '#ffffff',
        borderRadius: '0 0 40px 40px',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 36px 28px 36px',
        boxSizing: 'border-box',
        justifyContent: 'space-between',
        position: 'relative',
        boxShadow: '0 14px 32px rgba(0, 0, 0, 0.04)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* 헤더 및 통계 요약 (좌측: 타이틀 / 우측: 이용 가능 타석 대형 뱃지 + 우측 상단 Undo2 원형 되돌아가기 버튼) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, marginBottom: '18px', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap', minWidth: 0 }}>
          <span 
            style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: '#059669',
              boxShadow: '0 0 10px rgba(5, 150, 105, 0.65)',
              flexShrink: 0,
            }} 
            className="animate-pulse-ring"
          />
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.6px', margin: 0, whiteSpace: 'nowrap' }}>
            {lang === 'KO' ? '실시간 타석 종합 현황판' : 'Live Teebox Status'}
          </h2>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#64748b', marginLeft: '4px', whiteSpace: 'nowrap' }}>
            {lang === 'KO' ? '· 빈 타석(초록색)을 터치하면 즉시 배정됩니다' : '· Tap a green bay to assign immediately'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {/* 우측 상단 실시간 24시간제 시계 (층별 라벨과 중복되는 '이용 가능 타석' 배지 대체) */}
          <KioskLiveClock lang={lang} variant="header" />

          {/* 우측 상단 [↩ CornerUpLeft 되돌아가기] 볼드 원형 버튼 */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%)',
                border: '2px solid #cbd5e1',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
              title={lang === 'KO' ? '돌아가기' : 'Back'}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
              onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <CornerUpLeft size={26} strokeWidth={2.8} />
            </button>
          )}
        </div>
      </div>

      {/* 층별 지능형 반응형 그리드 (12개 이하 1줄 대형 와이드 / 13개 이상 2줄 균등 분할) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', zIndex: 1, width: '100%' }}>
        {sortedFloors.map(floor => {
          const floorBays = floorsMap[floor];
          const bayCount = floorBays.length;
          const availableCount = floorBays.filter(b => isBayTrulyAvailableForKiosk(b)).length;

          // 지능형 열 수 산출:
          // - COMPACT_1ROW: 무조건 bayCount 1줄
          // - AUTO: 12개 이하면 1줄 와이드(최대 92px), 13개 이상이면 2줄 균등 분할(Math.ceil(bayCount / 2))
          const cols =
            displayMode === 'COMPACT_1ROW'
              ? Math.max(bayCount, 1)
              : bayCount <= 12
              ? Math.max(bayCount, 1)
              : Math.ceil(bayCount / 2);

          return (
            <div key={floor} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* 상단 층수 라벨 배지 및 요약 정보 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span 
                  style={{ 
                    fontSize: '17px', 
                    fontWeight: 800, 
                    color: '#ffffff', 
                    background: '#111827', 
                    padding: '4px 14px', 
                    borderRadius: '999px',
                    letterSpacing: '-0.2px'
                  }}
                >
                  {floor}
                </span>
                <span style={{ fontSize: '18px', color: '#047857', fontWeight: 800 }}>
                  {lang === 'KO' ? `이용 가능 ${availableCount}석` : `${availableCount} Available`}
                </span>
              </div>
              
              {/* 타석 그리드: 우측 빈 여백 없이 화면 가로 폭에 맞춰 시원하게 자동 확장 */}
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns:
                    bayCount <= 6 && displayMode === 'AUTO'
                      ? `repeat(${cols}, minmax(68px, 110px))`
                      : `repeat(${cols}, minmax(0, 1fr))`,
                  gap: displayMode === 'COMPACT_1ROW' && bayCount > 14 ? '5px' : '8px',
                  width: '100%',
                }}
              >
                {floorBays.map(bay => renderBayCard(bay, bayCount))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* 선점 타석 실시간 럭셔리 골드 파동 및 선택 타석 블루 펄스 애니메이션 */}
      <style>{`
        @keyframes dashboardPulse {
          0% {
            box-shadow: 0 0 0 0px rgba(245, 158, 11, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
          }
          100% {
            box-shadow: 0 0 0 0px rgba(245, 158, 11, 0);
          }
        }
        @keyframes selectedBayHaloPulse {
          0% {
            transform: scale(1.08);
            box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px #0071e3, 0 4px 14px rgba(0, 113, 227, 0.5);
          }
          50% {
            transform: scale(1.16);
            box-shadow: 0 0 0 4px #ffffff, 0 0 0 8px #0071e3, 0 8px 24px rgba(0, 113, 227, 0.75);
          }
          100% {
            transform: scale(1.08);
            box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px #0071e3, 0 4px 14px rgba(0, 113, 227, 0.5);
          }
        }
      `}</style>
    </div>
  );
};
