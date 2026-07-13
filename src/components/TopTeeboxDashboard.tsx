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
      // 촌스럽지 않은 클래식 럭셔리 딥 포레스트 그린 (Rolex 그린 계열)
      bgCol = 'rgba(46, 117, 89, 0.06)';
      borderCol = 'rgba(46, 117, 89, 0.25)';
      textColor = '#2e7559';
      subTextColor = '#2e7559';
      cursorStyle = 'pointer';
      glow = '0 2px 8px rgba(46, 117, 89, 0.04)';
      label = '';
    } else if (isPreOccupied) {
      // 차분한 브론즈/코퍼 톤
      bgCol = 'rgba(184, 115, 51, 0.06)';
      borderCol = 'rgba(184, 115, 51, 0.25)';
      textColor = '#b87333';
      subTextColor = '#b87333';
      label = lang === 'KO' ? '선점' : 'Hold';
    } else if (isOccupied) {
      // 차분하고 명확한 웜 그레이
      bgCol = '#f5f5f7';
      borderCol = 'rgba(0, 0, 0, 0.05)';
      textColor = '#555558';
      subTextColor = '#8e8e93';
      
      if (bay.minutes_left !== undefined && bay.minutes_left !== null) {
        label = `${bay.minutes_left}m`;
      }
    } else if (isUnderMaintenance) {
      // 튀지 않는 차분한 브릭 레드
      bgCol = 'rgba(178, 34, 34, 0.06)';
      borderCol = 'rgba(178, 34, 34, 0.25)';
      textColor = '#b22222';
      subTextColor = '#b22222';
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
          position: 'relative'
        }}
        title={`${bay.bay_no}번 타석: ${isAvailable ? '이용가능' : isOccupied ? '이용중' : isPreOccupied ? '선점중' : '점검중'}`}
      >
        {/* 타석 번호 */}
        <span style={{ fontSize: label ? '14px' : '17px', fontWeight: 800, color: textColor, lineHeight: 1.1 }}>
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
        minHeight: '420px', // 340px -> 420px로 키워 세로 1920px 화면에서의 볼륨감 확보
        height: 'auto',
        background: '#fcfcfd', 
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        padding: '30px 40px 100px 40px', // 하단 패딩을 100px로 대폭 늘려 다음 컴포넌트와의 호흡 여백 확장!
        boxSizing: 'border-box',
        justifyContent: 'space-between',
        position: 'relative',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.03)' 
      }}
    >
      {/* 백그라운드 오로라 백릿 효과 (차분하고 은은한 미색 파스텔 광원) */}
      <div 
        style={{
          position: 'absolute',
          top: '-30%',
          left: '40%',
          width: '350px',
          height: '250px',
          background: 'radial-gradient(circle, rgba(46, 117, 89, 0.02) 0%, transparent 70%)',
          filter: 'blur(60px)',
          zIndex: 0,
          pointerEvents: 'none'
        }}
      />

      {/* 헤더 및 통계 요약 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, marginBottom: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2e7559' }} />
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
            background: 'rgba(46, 117, 89, 0.06)',
            border: '1px solid rgba(46, 117, 89, 0.15)'
          }}
        >
          <span style={{ fontSize: '14px', color: '#2e7559', fontWeight: 800, marginRight: '8px' }}>
            {lang === 'KO' ? '이용 가능 타석:' : 'Available:'}
          </span>
          <span style={{ fontSize: '20px', fontWeight: 950, color: '#2e7559' }}>
            {totalAvailable}
          </span>
          <span style={{ fontSize: '14px', color: 'rgba(46, 117, 89, 0.5)', fontWeight: 800, marginLeft: '4px' }}>
            / {bays.length}
          </span>
        </div>
      </div>

      {/* 층별 대형 가로 맵 그리드 (상단 라벨 배치로 가로 100% 활용) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 1, width: '100%' }}>
        {sortedFloors.map(floor => {
          const floorBays = floorsMap[floor];
          
          // 층별 브랜드 명칭 부여 (형광색 배제, 차분한 슬레이트 파스텔 톤)
          let brandLabel = floor;
          let brandColor = '#8e8e93';
          let brandBg = '#f5f5f7';
          let brandBorder = 'rgba(0, 0, 0, 0.06)';

          if (floor === '1F') {
            brandLabel = '1F GDR+';
            brandColor = '#436850'; // 웜 포레스트
            brandBg = 'rgba(67, 104, 80, 0.08)';
            brandBorder = 'rgba(67, 104, 80, 0.2)';
          } else if (floor === '2F') {
            brandLabel = '2F VX';
            brandColor = '#4a6984'; // 슬레이트 블루
            brandBg = 'rgba(74, 105, 132, 0.08)';
            brandBorder = 'rgba(74, 105, 132, 0.2)';
          } else if (floor === '3F') {
            brandLabel = '3F Room';
            brandColor = '#7b507b'; // 플럼 퍼플
            brandBg = 'rgba(123, 80, 123, 0.08)';
            brandBorder = 'rgba(123, 80, 123, 0.2)';
          }

          const availableCount = floorBays.filter(b => b.status === 'AVAILABLE').length;

          return (
            <div key={floor} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* 상단 층수 라벨 배지 및 요약 정보 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span 
                  style={{ 
                    fontSize: '12px', 
                    fontWeight: 800, 
                    color: brandColor, 
                    background: brandBg, 
                    border: `1px solid ${brandBorder}`,
                    padding: '2px 8px', 
                    borderRadius: '8px',
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
    </div>
  );
};
