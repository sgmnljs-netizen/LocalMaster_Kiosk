import React from 'react';
import { Layers } from 'lucide-react';
import { Bay } from '../services/api';

interface TopTeeboxDashboardProps {
  bays: Bay[];
  onBayClick: (bayNo: number) => void;
  lang: 'KO' | 'EN';
}

export const TopTeeboxDashboard: React.FC<TopTeeboxDashboardProps> = ({
  bays,
  onBayClick,
  lang
}) => {
  // 층별 동적 그룹핑 (floor 문자열 필드 기준, 없을 시 floor_no 백업)
  const floorsMap: { [key: string]: Bay[] } = {};
  bays.forEach(bay => {
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

  // 층 정렬 ('1F', '2F', '3F' ...)
  const sortedFloors = Object.keys(floorsMap).sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  // 전체 이용 가능 타석 계산
  const totalAvailable = bays.filter(b => b.status === 'AVAILABLE').length;

  const renderBayCard = (bay: Bay) => {
    const isAvailable = bay.status === 'AVAILABLE';
    const isPreOccupied = bay.status === 'PRE_OCCUPIED';
    const isOccupied = bay.status === 'OCCUPIED';
    const isUnderMaintenance = bay.status === 'UNDER_MAINTENANCE';

    let bgCol = '#f5f5f7';
    let borderCol = 'rgba(0, 0, 0, 0.06)';
    let textColor = '#8e8e93';
    let subTextColor = '#aeaeb2';
    let cursorStyle = 'not-allowed';
    let glow = 'none';
    let label = '';

    if (isAvailable) {
      // 럭셔리 에메랄드 딥 그라데이션
      bgCol = 'linear-gradient(135deg, #064e3b 0%, #059669 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = 'rgba(255,255,255,0.9)';
      cursorStyle = 'pointer';
      glow = '0 8px 16px rgba(5, 150, 105, 0.3), inset 0 2px 4px rgba(255,255,255,0.2)';
      label = '';
    } else if (isPreOccupied) {
      // 럭셔리 골드 그라데이션
      bgCol = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = '#ffffff';
      label = '';
    } else if (isOccupied) {
      // 리세스드(음각) Soft UI
      bgCol = 'rgba(0, 0, 0, 0.02)';
      borderCol = 'rgba(0, 0, 0, 0.04)';
      textColor = '#8e8e93';
      subTextColor = '#aeaeb2';
      glow = 'inset 0 4px 6px rgba(0, 0, 0, 0.06)';
      
      if (bay.minutes_left !== undefined && bay.minutes_left !== null) {
        label = `${bay.minutes_left}m`;
      }
    } else if (isUnderMaintenance) {
      // 점검중: 차분한 그레이시 브릭레드 음각
      bgCol = 'rgba(178, 34, 34, 0.04)';
      borderCol = 'rgba(178, 34, 34, 0.08)';
      textColor = '#b22222';
      subTextColor = '#b22222';
      glow = 'inset 0 4px 6px rgba(178, 34, 34, 0.06)';
      label = lang === 'KO' ? '점검' : 'Maint';
    }

    return (
      <div
        key={bay.bay_no}
        onClick={() => isAvailable && onBayClick(bay.bay_no)}
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: bgCol,
          border: `1.5px solid ${borderCol}`,
          cursor: cursorStyle,
          boxShadow: glow,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          animation: isPreOccupied ? 'dashboardPulse 1.5s infinite ease-in-out' : 'none'
        }}
        title={`${bay.bay_no}번 타석: ${isAvailable ? '이용가능' : isOccupied ? '이용중' : isPreOccupied ? '선점중' : '점검중'}`}
      >
        {/* 타석 번호 */}
        <span style={{ fontSize: label ? '15px' : '18px', fontWeight: 900, color: textColor, lineHeight: 1.1 }}>
          {bay.bay_no}
        </span>
        
        {/* 타석 상세 상태 */}
        {label && (
          <span style={{ fontSize: '9px', fontWeight: 800, color: subTextColor, marginTop: '1px' }}>
            {label}
          </span>
        )}

        {/* 좌타석(Left Teebox)인 경우 L 배지 표시 */}
        {bay.type === 'LEFT' && (
          <span 
            style={{ 
              position: 'absolute', 
              top: '-3px', 
              right: '-3px', 
              fontSize: '7px', 
              fontWeight: 900, 
              background: '#4a6984', 
              color: '#fff', 
              padding: '0.5px 2px', 
              borderRadius: '3px',
              border: '0.5px solid rgba(0,0,0,0.05)'
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
        minHeight: '420px',
        height: 'auto',
        background: 'var(--color-cloud-dancer)',
        borderRadius: '0 0 48px 48px', // 하단 라운딩 적용으로 Bento 박스 느낌 부여
        display: 'flex',
        flexDirection: 'column',
        padding: '30px 40px 80px 40px', 
        boxSizing: 'border-box',
        justifyContent: 'space-between',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.4)',
        borderLeft: '1px solid rgba(255,255,255,0.4)',
        borderRight: '1px solid rgba(255,255,255,0.4)',
        overflow: 'hidden'
      }}
    >
      {/* 백그라운드 오로라 백릿 효과 (럭셔리 에메랄드) */}
      <div 
        style={{
          position: 'absolute',
          top: '-20%',
          left: '20%',
          width: '600px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(5, 150, 105, 0.1) 0%, transparent 70%)',
          filter: 'blur(80px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />

      {/* 헤더 및 통계 요약 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, marginBottom: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#059669' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
            {lang === 'KO' ? '실시간 타석 종합 현황판' : 'Live Teebox Board'}
          </h2>
        </div>

        {/* 잔여 타석 현황 뱃지 */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '6px 16px', 
            borderRadius: '20px', 
            background: 'rgba(5, 150, 105, 0.08)',
            border: '1px solid rgba(5, 150, 105, 0.2)'
          }}
        >
          <span style={{ fontSize: '14px', color: '#064e3b', fontWeight: 800, marginRight: '8px' }}>
            {lang === 'KO' ? '이용 가능 타석:' : 'Available:'}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 950, color: '#059669' }}>
            {totalAvailable}
          </span>
          <span style={{ fontSize: '14px', color: 'rgba(5, 150, 105, 0.5)', fontWeight: 800, marginLeft: '4px' }}>
            / {bays.length}
          </span>
        </div>
      </div>

      {/* 층별 대형 가로 맵 그리드 (상단 라벨 배치로 가로 100% 활용) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 1, width: '100%' }}>
        {sortedFloors.map(floor => {
          const floorBays = floorsMap[floor];
          
          // 층별 브랜드 명칭 제거 (백오피스 원본 데이터 그대로 사용)
          let brandLabel = floor;

          const availableCount = floorBays.filter(b => b.status === 'AVAILABLE').length;

          return (
            <div key={floor} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* 상단 층수 라벨 배지 및 요약 정보 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span 
                  style={{ 
                    fontSize: '12px', 
                    fontWeight: 800, 
                    color: '#064e3b', 
                    background: 'rgba(5, 150, 105, 0.08)', 
                    border: `1px solid rgba(5, 150, 105, 0.2)`,
                    padding: '4px 12px', 
                    borderRadius: '20px',
                    letterSpacing: '-0.2px'
                  }}
                >
                  {brandLabel}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  {lang === 'KO' ? `이용 가능 ${availableCount}개` : `${availableCount} Available`}
                </span>
              </div>
              
              {/* 하단 타석 일렬 그리드 (가로 영역 100% 사용하여 20개 타석 일렬 정렬) */}
              <div 
                style={{ 
                  display: 'flex', 
                  gap: '4px',
                  width: '100%',
                  justifyContent: 'flex-start'
                }}
              >
                {floorBays.map(renderBayCard)}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* 선점 타석 실시간 럭셔리 골드 파동 애니메이션 */}
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
      `}</style>
    </div>
  );
};
