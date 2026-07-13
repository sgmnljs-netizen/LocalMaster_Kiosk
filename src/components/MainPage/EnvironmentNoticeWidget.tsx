import React from 'react';
import { CloudRain, Megaphone } from 'lucide-react';

export default function EnvironmentNoticeWidget() {
  return (
    <div className="bento-item" style={{ 
      display: 'grid', 
      gridTemplateColumns: '1fr 1fr', 
      gap: '24px',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ 
          backgroundColor: 'rgba(0, 102, 102, 0.1)', 
          padding: '16px', 
          borderRadius: '16px',
          color: 'var(--color-transformative-teal)'
        }}>
          <CloudRain size={32} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '18px', color: 'var(--text-secondary)' }}>현재 날씨</h4>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: 'var(--color-transformative-teal)' }}>
            흐림, 22°C (미세먼지 좋음)
          </p>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '24px' }}>
        <div style={{ 
          backgroundColor: 'rgba(249, 215, 28, 0.2)', 
          padding: '16px', 
          borderRadius: '16px',
          color: '#B39100'
        }}>
          <Megaphone size={32} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '18px', color: 'var(--text-secondary)' }}>센터 공지</h4>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: '500', color: 'var(--text-primary)' }}>
            주말 타석 운영시간 변경 안내 (오전 6시 오픈)
          </p>
        </div>
      </div>
    </div>
  );
}
