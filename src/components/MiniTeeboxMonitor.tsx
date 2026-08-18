import React from 'react';
import { Layers } from 'lucide-react';
import { Bay } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';

interface MiniTeeboxMonitorProps {
  bays: Bay[];
  onBayClick: (bayNo: number) => void;
  lang: 'KO' | 'EN';
}

export const MiniTeeboxMonitor: React.FC<MiniTeeboxMonitorProps> = ({
  bays,
  onBayClick,
  lang
}) => {
  // 연습타석 구역 기준 필터링
  const practiceBays = bays.filter(bay => {
    const zCode = (bay as any).zone_code || (bay as any).zoneCode || '';
    return zCode !== 'PAR3' && zCode !== 'ROOM';
  });

  // 동적 층별 그룹핑
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

  const sortedFloors = Object.keys(floorsMap).sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  const totalAvailable = practiceBays.filter(b => b.status === 'AVAILABLE').length;

  const renderBayIndicator = (bay: Bay) => {
    const isAvailable = bay.status === 'AVAILABLE';
    const isPreOccupied = bay.status === 'PRE_OCCUPIED';
    const isPrepare = bay.status === 'PREPARE';
    const isOccupied = bay.status === 'OCCUPIED' || bay.status === 'USE';
    const isUnderMaintenance = bay.status === 'UNDER_MAINTENANCE' || bay.status === 'MAINTENANCE' || bay.status === 'DISABLED';

    let bgCol = 'rgba(255, 255, 255, 0.03)';
    let borderCol = 'rgba(255, 255, 255, 0.1)';
    let textColor = 'rgba(255, 255, 255, 0.4)';
    let cursorStyle = 'not-allowed';
    let glow = 'none';

    if (isAvailable) {
      bgCol = 'rgba(16, 185, 129, 0.12)';
      borderCol = 'rgba(16, 185, 129, 0.5)';
      textColor = 'var(--neon-green)';
      cursorStyle = 'pointer';
      glow = '0 0 10px rgba(16, 185, 129, 0.2)';
    } else if (isPreOccupied) {
      bgCol = 'rgba(245, 158, 11, 0.15)';
      borderCol = 'rgba(245, 158, 11, 0.5)';
      textColor = 'var(--neon-amber)';
    } else if (isPrepare) {
      bgCol = 'rgba(2, 132, 199, 0.18)';
      borderCol = 'rgba(2, 132, 199, 0.6)';
      textColor = '#38bdf8';
    } else if (isOccupied) {
      bgCol = 'rgba(79, 70, 229, 0.1)';
      borderCol = 'rgba(79, 70, 229, 0.2)';
      textColor = 'rgba(255, 255, 255, 0.25)';
    } else if (isUnderMaintenance) {
      bgCol = 'rgba(239, 68, 68, 0.15)';
      borderCol = 'rgba(239, 68, 68, 0.5)';
      textColor = 'var(--neon-red)';
    }

    const remMin = TimeMaster.getRemainingMinutes(bay);
    const titleText = `${bay.bay_no}번 타석: ${
      isAvailable ? '이용가능' : isPrepare ? '대기중' : isOccupied ? `이용중(${remMin}분)` : isPreOccupied ? '선점중' : '점검중'
    }`;

    return (
      <div
        key={bay.bay_no}
        onClick={() => isAvailable && onBayClick(bay.bay_no)}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 800,
          background: bgCol,
          border: `1.5px solid ${borderCol}`,
          color: textColor,
          cursor: cursorStyle,
          boxShadow: glow,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isAvailable ? 'scale(1)' : 'scale(0.95)',
          position: 'relative'
        }}
        title={titleText}
      >
        {bay.bay_no}
        {/* 좌타석 인디케이터 표시 (L) */}
        {bay.type === 'LEFT' && (
          <span 
            style={{ 
              position: 'absolute', 
              bottom: '-2px', 
              right: '-2px', 
              fontSize: '9px', 
              fontWeight: 900, 
              background: 'var(--neon-indigo)', 
              color: '#fff', 
              padding: '1px 3px', 
              borderRadius: '4px',
              border: '0.5px solid rgba(255,255,255,0.2)'
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
      className="premium-glass-card" 
      style={{
        padding: '24px 30px',
        borderRadius: '32px',
        border: '1.5px solid rgba(16, 185, 129, 0.2)',
        background: 'rgba(20, 20, 24, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '30px',
        width: '100%',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.08)'
      }}
    >
      {/* 좌측: 실시간 현황 배지 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 10px var(--neon-green-glow)', animation: 'pulse 2s infinite' }} />
          <h4 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
            {lang === 'KO' ? '실시간 타석 모니터' : 'Live Teebox Monitor'}
          </h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
          <span style={{ fontSize: '28px', fontWeight: 950, color: 'var(--neon-green)' }}>
            {totalAvailable}
          </span>
          <span style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 700 }}>
            / {practiceBays.length} {lang === 'KO' ? '대 예약 가능' : 'Bays Available'}
          </span>
        </div>
      </div>

      {/* 우측: 층별 가로 맵 스트립 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        {sortedFloors.map(floorKey => (
          <div key={floorKey} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '13px', 
                fontWeight: 900, 
                color: 'var(--text-secondary)', 
                background: 'rgba(255,255,255,0.03)',
                padding: '6px 12px',
                borderRadius: '12px',
                border: '0.5px solid var(--glass-border)',
                minWidth: '95px',
                justifyContent: 'center'
              }}
            >
              <Layers size={12} />
              <span>{floorKey}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {(floorsMap[floorKey] || []).map(renderBayIndicator)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
