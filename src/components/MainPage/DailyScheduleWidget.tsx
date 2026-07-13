import React from 'react';
import { Calendar, Clock } from 'lucide-react';

export default function DailyScheduleWidget() {
  const schedule = [
    { time: '10:00 AM', type: '개인 레슨', pro: '이프로' },
    { time: '02:00 PM', type: '스크린 게임', pro: '-' },
  ];

  return (
    <div className="bento-item" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: 'var(--color-transformative-teal)', fontSize: '24px', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Calendar size={24} /> 오늘의 스케줄
      </h3>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {schedule.length > 0 ? schedule.map((item, idx) => (
          <div key={idx} className="soft-btn" style={{ 
            padding: '20px', 
            display: 'flex', 
            alignItems: 'center',
            gap: '16px',
            cursor: 'pointer'
          }}>
            <div style={{ 
              backgroundColor: 'var(--color-transformative-teal)', 
              color: 'var(--color-cloud-dancer)', 
              padding: '12px', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontWeight: 'bold'
            }}>
              <span style={{ fontSize: '14px', opacity: 0.8 }}>오늘</span>
              <span style={{ fontSize: '18px' }}>{item.time.split(' ')[0]}</span>
            </div>
            
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.type}</div>
              <div style={{ fontSize: '16px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <Clock size={16} /> {item.pro !== '-' ? `${item.pro} 프로` : '자유 연습'}
              </div>
            </div>
          </div>
        )) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            예정된 스케줄이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
