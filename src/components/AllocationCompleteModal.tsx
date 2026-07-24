import React, { useEffect, useState } from 'react';
import { Check, Printer, ArrowRight } from 'lucide-react';

interface AllocationCompleteModalProps {
  bayNo: number | string;
  durationMin: number;
  startTime?: string;
  endTime?: string;
  lang?: 'KO' | 'EN';
  onClose: () => void;
}

export const AllocationCompleteModal: React.FC<AllocationCompleteModalProps> = ({
  bayNo,
  durationMin,
  startTime,
  endTime,
  lang = 'KO',
  onClose
}) => {
  const [countdown, setCountdown] = useState(5);

  // 5초 자동 카운트다운
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  // 시각 포맷팅 (HH:mm)
  const formatTime = (timeStr?: string) => {
    if (!timeStr) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      return `${hours}:${mins}`;
    }
    if (timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins}`;
      }
    }
    return timeStr;
  };

  const startDisplay = formatTime(startTime);
  let endDisplay = formatTime(endTime);

  if (!endTime && startTime) {
    const d = new Date(startTime.includes('T') ? startTime : `2026-07-24T${startTime}:00`);
    if (!isNaN(d.getTime())) {
      d.setMinutes(d.getMinutes() + durationMin);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      endDisplay = `${hours}:${mins}`;
    }
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '24px'
      }}
    >
      {/* Apple Snow White Ticket Card */}
      <div 
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#ffffff',
          borderRadius: '32px',
          border: '1px solid #e5e5ea',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15)',
          padding: '44px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: '#1d1d1f',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Apple Minimal Green Circle Icon */}
        <div style={{ marginBottom: '20px' }}>
          <div 
            style={{ 
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(52, 199, 89, 0.12)',
              border: '1px solid rgba(52, 199, 89, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(52, 199, 89, 0.15)'
            }}
          >
            <Check size={40} style={{ color: '#34c759', strokeWidth: 2.5 }} />
          </div>
        </div>

        {/* 100% 한글 애플 타이포그래피 */}
        <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-1px' }}>
          {lang === 'KO' ? '골프 타석 배정표' : 'Golf Bay Assignment Ticket'}
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#86868b', fontSize: '16px', fontWeight: 500, marginBottom: '32px', letterSpacing: '-0.3px' }}>
          <Printer size={18} style={{ color: '#0071e3' }} />
          <span>{lang === 'KO' ? '영수증 및 타석 배정표가 현장에서 출력 중입니다.' : 'Printing receipt and bay assignment ticket...'}</span>
        </div>

        {/* 한글 데이터 그리드 티켓 카딩 */}
        <div 
          style={{ 
            width: '100%', 
            background: '#f5f5f7', 
            borderRadius: '24px', 
            border: '1px solid #e5e5ea', 
            padding: '24px 28px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '18px', 
            marginBottom: '32px'
          }}
        >
          {/* 배정 타석 번호 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e5ea', paddingBottom: '16px' }}>
            <span style={{ fontSize: '17px', color: '#86868b', fontWeight: 600, letterSpacing: '-0.3px' }}>
              {lang === 'KO' ? '배정 타석' : 'Assigned Bay'}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '52px', fontWeight: 950, color: '#000000', letterSpacing: '-1.5px' }}>
                {String(bayNo).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#1d1d1f' }}>
                {lang === 'KO' ? '번 타석' : ''}
              </span>
            </div>
          </div>

          {/* 이용 시간 & 이용 시간대 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center', border: '1px solid #e5e5ea' }}>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                {lang === 'KO' ? '이용 시간' : 'Duration'}
              </span>
              <span style={{ fontSize: '26px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                {durationMin}{lang === 'KO' ? '분' : ' min'}
              </span>
            </div>

            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center', border: '1px solid #e5e5ea' }}>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                {lang === 'KO' ? '이용 시간대' : 'Time Interval'}
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#0071e3', letterSpacing: '-0.5px' }}>
                {startDisplay} ~ {endDisplay}
              </span>
            </div>
          </div>
        </div>

        {/* 애플 딥 차콜 필 버튼 */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: '64px',
            borderRadius: '999px',
            background: '#1d1d1f',
            color: '#ffffff',
            border: 'none',
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.9'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
        >
          <span>
            {lang === 'KO' 
              ? `확인 및 메인으로 이동 (${countdown}s)` 
              : `Confirm & Go Home (${countdown}s)`}
          </span>
          <ArrowRight size={22} style={{ color: '#ffffff' }} />
        </button>
      </div>
    </div>
  );
};
