import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function AgentGreetingHeader() {
  const userName = "김골프";
  
  return (
    <div className="liquid-glass-layer" style={{
      margin: '24px 24px 0 24px',
      padding: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 10
    }}>
      <div>
        <h1 style={{ 
          color: 'var(--color-transformative-teal)', 
          fontSize: '36px', 
          fontWeight: 700, 
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Sparkles size={36} color="var(--color-morning-yellow)" />
          {userName} 회원님, 좋은 아침입니다!
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '20px', marginTop: '8px' }}>
          AI 분석 결과, 보통 이 시간에 15번 타석을 자주 이용하셨습니다.
        </p>
      </div>
      
      <button className="soft-btn" style={{
        backgroundColor: 'var(--color-morning-yellow)',
        color: 'var(--text-primary)',
        padding: '24px 40px',
        fontSize: '24px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        ⚡ 15번 타석 바로 예약 <ArrowRight size={28} />
      </button>
    </div>
  );
}
