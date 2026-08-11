import React, { useEffect, useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { api, Member, Bay } from '../../services/api';

interface AgentGreetingHeaderProps {
  member?: Member | null;
  frequentBayNo?: number | string | null;
  onQuickReserve?: (bayNo?: number | string) => void;
}

export default function AgentGreetingHeader({
  member: initialMember,
  frequentBayNo: initialBayNo,
  onQuickReserve
}: AgentGreetingHeaderProps) {
  const [member, setMember] = useState<Member | null>(initialMember || null);
  const [bayNo, setBayNo] = useState<number | string>(initialBayNo || 1);

  useEffect(() => {
    if (initialMember) {
      setMember(initialMember);
    } else {
      const cached = localStorage.getItem('LM_AUTH_MEMBER');
      if (cached) {
        try {
          setMember(JSON.parse(cached));
        } catch {}
      }
    }
  }, [initialMember]);

  useEffect(() => {
    if (initialBayNo) {
      setBayNo(initialBayNo);
    } else {
      api.getBays().then((bays: Bay[]) => {
        const availableBay = bays.find(b => b.status === 'AVAILABLE');
        if (availableBay) {
          setBayNo(availableBay.bay_no);
        }
      }).catch(() => {});
    }
  }, [initialBayNo]);

  const userName = member?.member_name || member?.masked_name || '회원';

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
          {userName} 님, 환영합니다!
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '20px', marginTop: '8px' }}>
          AI 분석 결과, 보통 이 시간에 {bayNo}번 타석을 자주 이용하셨습니다.
        </p>
      </div>
      
      <button 
        onClick={() => onQuickReserve?.(bayNo)}
        className="soft-btn" 
        style={{
          backgroundColor: 'var(--color-morning-yellow)',
          color: 'var(--text-primary)',
          padding: '24px 40px',
          fontSize: '24px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          cursor: 'pointer'
        }}
      >
        ⚡ {bayNo}번 타석 바로 예약 <ArrowRight size={28} />
      </button>
    </div>
  );
}
