import React from 'react';

// Mock Data
const MOCK_BAYS = Array.from({ length: 8 }, (_, i) => ({
  id: `bay-${i + 1}`,
  no: i + 1,
  status: i % 3 === 0 ? 'IN_USE' : 'AVAILABLE',
  timeRemaining: i % 3 === 0 ? 45 : null,
}));

export default function LiveBayStatusHero() {
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
        {MOCK_BAYS.map((bay) => (
          <button 
            key={bay.id} 
            className={`soft-btn bay-item ${bay.status === 'AVAILABLE' ? 'available' : 'in-use'}`}
            style={{ 
              height: '100%', 
              minHeight: '140px',
              padding: '16px' 
            }}
          >
            <span style={{ 
              fontSize: '32px', 
              fontWeight: 'bold', 
              color: bay.status === 'AVAILABLE' ? 'var(--text-primary)' : 'var(--color-cloud-dancer)' 
            }}>
              {bay.no}
            </span>
            {bay.status === 'IN_USE' && bay.timeRemaining && (
              <span style={{ 
                marginTop: '12px', 
                fontSize: '18px', 
                color: 'var(--color-sweet-corn)',
                backgroundColor: 'rgba(0,0,0,0.2)',
                padding: '4px 12px',
                borderRadius: '12px'
              }}>
                {bay.timeRemaining}분 남음
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
