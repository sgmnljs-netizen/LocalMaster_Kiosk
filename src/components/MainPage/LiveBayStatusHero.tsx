import React from 'react';
import type { Bay } from '../../services/api';

interface LiveBayStatusHeroProps {
  bays?: Bay[];
}

export default function LiveBayStatusHero({ bays = [] }: LiveBayStatusHeroProps) {
  const displayBays = bays.length > 0 ? bays.slice(0, 8) : Array.from({ length: 8 }, (_, i) => ({
    bay_no: i + 1,
    status: 'AVAILABLE' as const,
    minutes_left: undefined,
  }));

  return (
    <div className="bento-item bento-item-hero" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--color-transformative-teal)', fontSize: '28px', margin: 0 }}>
          실시간 타석 현황 (1층)
        </h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '18px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--neon-cyan)' }}></div> 빈 타석
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#006666' }}></div> 사용 중
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        flex: 1
      }}>
        {displayBays.map((bay) => {
          const canonicalStatus = (bay as any).status_info?.code || bay.status;
          const isUse = canonicalStatus === 'OCCUPIED' || canonicalStatus === 'USE';
          const remMin = (bay as any).status_info?.minutes_left ?? bay.minutes_left;

          return (
            <button 
              key={bay.bay_no} 
              className={`soft-btn bay-item ${!isUse ? 'available' : 'in-use'}`}
              style={{ 
                height: '100%', 
                minHeight: '140px',
                padding: '16px' 
              }}
            >
              <span style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: !isUse ? 'var(--text-primary)' : 'var(--color-cloud-dancer)' 
              }}>
                {bay.bay_no}
              </span>
              {isUse && remMin !== undefined && remMin !== null && (
                <span style={{ 
                  marginTop: '12px', 
                  fontSize: '18px', 
                  color: 'var(--color-sweet-corn)',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  padding: '4px 12px',
                  borderRadius: '12px'
                }}>
                  {remMin}분 남음
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
