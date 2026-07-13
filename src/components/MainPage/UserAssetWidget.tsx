import React from 'react';
import { Ticket, Gift } from 'lucide-react';

export default function UserAssetWidget() {
  const packages = [{ type: '1개월 무제한', remain: 'D-15' }, { type: '레슨권', remain: '5회' }];
  
  return (
    <div className="bento-item" style={{ backgroundColor: 'var(--color-sweet-corn)', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: 'var(--color-transformative-teal)', fontSize: '24px', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Ticket size={24} /> 나의 이용권 현황
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {packages.map((pkg, idx) => (
          <div key={idx} className="soft-btn" style={{ 
            padding: '20px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.4)',
            cursor: 'default'
          }}>
            <span style={{ fontSize: '20px', fontWeight: '500' }}>{pkg.type}</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-transformative-teal)' }}>{pkg.remain}</span>
          </div>
        ))}
      </div>

      <button className="soft-btn" style={{ 
        marginTop: '16px', 
        padding: '16px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '8px',
        backgroundColor: 'var(--color-cloud-dancer)',
        color: 'var(--color-transformative-teal)',
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        <Gift size={20} /> 패키지 추가 구매하기
      </button>
    </div>
  );
}
