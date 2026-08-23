import React from 'react';
import { Layers } from 'lucide-react';
import { Bay } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';

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
  // 🔄 [구역 카테고리 동적 격리] 파3(PAR3) 및 룸(ROOM) 구역 타석은 일반 연습타석 현황판에서 전면 동적 제외
  const practiceBays = bays.filter(bay => {
    const zCode = (bay as any).zone_code || (bay as any).zoneCode || '';
    return zCode !== 'PAR3' && zCode !== 'ROOM';
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

  // 층 정렬 ('1F', '2F', '3F' ...)
  const sortedFloors = Object.keys(floorsMap).sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  // 전체 이용 가능 타석 계산 (연습타석 구역 기준)
  const totalAvailable = practiceBays.filter(b => b.status === 'AVAILABLE').length;
  const totalPracticeBays = practiceBays.length;

  const renderBayCard = (bay: Bay) => {
    const isAvailable = bay.status === 'AVAILABLE';
    const isPreOccupied = bay.status === 'PRE_OCCUPIED';
    const isPrepare = bay.status === 'PREPARE';
    const isOccupied = bay.status === 'OCCUPIED' || bay.status === 'USE';
    const isUnderMaintenance = bay.status === 'UNDER_MAINTENANCE' || bay.status === 'MAINTENANCE' || bay.status === 'DISABLED';

    let bgCol = '#e5e5ea';
    let borderCol = 'transparent';
    let textColor = '#8e8e93';
    let subTextColor = '#1d1d1f';
    let cursorStyle = 'not-allowed';
    let glow = 'none';
    let label = '';

    if (isAvailable) {
      // 💎 딥 럭셔리 쥬얼 에메랄드 + 칼 같은 샤프 마이크로 섀도우 (번짐 100% 제거)
      bgCol = 'linear-gradient(145deg, #059669 0%, #047857 60%, #064e3b 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = 'rgba(255,255,255,0.9)';
      cursorStyle = 'pointer';
      glow = '0 1.5px 3px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
      label = '';
    } else if (isPreOccupied) {
      // 🟡 럭셔리 골드 앰버 (샤프 마이크로 섀도우)
      bgCol = 'linear-gradient(145deg, #f59e0b 0%, #d97706 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = '#ffffff';
      glow = '0 1.5px 3px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
      label = '';
    } else if (isPrepare) {
      // 🔵 산뜻한 애플 마린 블루 (샤프 마이크로 섀도우)
      bgCol = 'linear-gradient(145deg, #0ea5e9 0%, #0284c7 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = '#ffffff';
      glow = '0 1.5px 3px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
      label = lang === 'KO' ? '대기' : 'Prep';
    } else if (isOccupied) {
      // ⚪ 새틴 슬레이트 그레이 음각
      bgCol = '#e5e5ea';
      borderCol = 'rgba(0, 0, 0, 0.04)';
      textColor = '#8e8e93';
      subTextColor = '#1d1d1f';
      glow = 'inset 0 1.5px 3px rgba(0, 0, 0, 0.06)';
      
      const remMin = TimeMaster.getRemainingMinutes(bay);
      label = `${remMin}m`;
    } else if (isUnderMaintenance) {
      // 🔴 애플 브릭 레드
      bgCol = 'linear-gradient(145deg, #ef4444 0%, #dc2626 100%)';
      borderCol = 'transparent';
      textColor = '#ffffff';
      subTextColor = '#ffffff';
      glow = '0 1.5px 3px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.4)';
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
          border: borderCol !== 'transparent' ? `1px solid ${borderCol}` : 'none',
          cursor: cursorStyle,
          boxShadow: glow,
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          animation: isPreOccupied ? 'dashboardPulse 1.5s infinite ease-in-out' : 'none'
        }}
        title={`${bay.bay_no}번 타석: ${isAvailable ? '이용가능' : isOccupied ? '이용중' : isPreOccupied ? '선점중' : '점검중'}`}
      >
        {/* 타석 번호 (텍스트 섀도우 완전 제거로 선명한 폰트 렌더링) */}
        <span style={{ fontSize: label ? '15px' : '18px', fontWeight: 950, color: textColor, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
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
              background: '#0071e3', 
              color: '#fff', 
              padding: '0.5px 2px', 
              borderRadius: '3px',
              border: '0.5px solid rgba(255,255,255,0.6)'
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
        background: '#ffffff',
        borderRadius: '0 0 48px 48px', // 원본 48px 대형 곡률
        display: 'flex',
        flexDirection: 'column',
        padding: '30px 40px 80px 40px', // 원본 80px 하단 패딩
        boxSizing: 'border-box',
        justifyContent: 'space-between',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.04)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        overflow: 'hidden'
      }}
    >
      {/* 헤더 및 통계 요약 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, marginBottom: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#059669',
              boxShadow: '0 0 8px rgba(5, 150, 105, 0.6)'
            }} 
            className="animate-pulse-ring"
          />
          <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
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
            / {totalPracticeBays}
          </span>
        </div>
      </div>

      {/* 층별 대형 가로 맵 그리드 (원본 세로 간격 20px 복원) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 1, width: '100%' }}>
        {sortedFloors.map(floor => {
          const floorBays = floorsMap[floor];
          let brandLabel = floor;
          const availableCount = floorBays.filter(b => b.status === 'AVAILABLE').length;

          return (
            <div key={floor} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* 상단 층수 라벨 배지 및 요약 정보 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span 
                  style={{ 
                    fontSize: '12px', 
                    fontWeight: 900, 
                    color: '#ffffff', 
                    background: '#1d1d1f', 
                    padding: '3px 10px', 
                    borderRadius: '20px',
                    letterSpacing: '-0.2px'
                  }}
                >
                  {brandLabel}
                </span>
                <span style={{ fontSize: '12px', color: '#059669', fontWeight: 800 }}>
                  {lang === 'KO' ? `이용 가능 ${availableCount}개` : `${availableCount} Available`}
                </span>
              </div>
              
              {/* 하단 타석 일렬 그리드 (원본 구도 100% 동일) */}
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

