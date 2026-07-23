import React from 'react';
import { Clock, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { Bay } from '../services/api';

interface ChainedBookingModalProps {
  isOpen: boolean;
  bay: Bay | null;
  startTimeStr: string; // e.g. "20:46"
  endTimeStr: string;   // e.g. "21:46"
  minutesWait: number;  // e.g. 26
  durationMin?: number; // e.g. 60
  onConfirm: () => void;
  onClose: () => void;
  lang?: 'KO' | 'EN';
}

export const ChainedBookingModal: React.FC<ChainedBookingModalProps> = ({
  isOpen,
  bay,
  startTimeStr,
  endTimeStr,
  minutesWait,
  durationMin = 60,
  onConfirm,
  onClose,
  lang = 'KO',
}) => {
  if (!isOpen || !bay) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '32px',
          padding: '36px 40px',
          maxWidth: '540px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <X size={20} />
        </button>

        {/* 1. 상단 경고/안내 뱃지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '16px',
              backgroundColor: '#fff7ed',
              color: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', letterSpacing: '-0.2px' }}>
              연쇄 예약 안내 (Next-Slot Booking)
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
              {String(bay.bay_no).padStart(2, '0')}번 타석 연쇄 배정
            </div>
          </div>
        </div>

        {/* 2. 메인 시각 안내 카드 (강렬한 강조) */}
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '2px solid #22c55e',
            borderRadius: '24px',
            padding: '24px',
            textAlign: 'center',
            marginBottom: '24px',
            boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.15)',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803d', marginBottom: '6px' }}>
            입장 예정 시각 (앞 세션 종료 1분 후)
          </div>
          <div style={{ fontSize: '42px', fontWeight: 900, color: '#15803d', letterSpacing: '-1px', lineHeight: 1.1 }}>
            ⏰ {startTimeStr} 시작
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#16a34a', marginTop: '8px' }}>
            ({minutesWait > 0 ? `${minutesWait}분 뒤 입장` : '즉시 입장 가능'})
          </div>
        </div>

        {/* 3. 이용 예정 상세 스펙 */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginBottom: '28px',
            fontSize: '15px',
            color: '#334155',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>이용 구간</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>
              {startTimeStr} ~ {endTimeStr} ({durationMin}분)
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>타석 번호</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{String(bay.bay_no).padStart(2, '0')}번 타석</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>자동 알림</span>
            <span style={{ fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={15} /> 카카오 알림톡 발송
            </span>
          </div>
        </div>

        {/* 4. 하단 액션 버튼 */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '18px',
              borderRadius: '16px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              fontWeight: 800,
              fontSize: '18px',
              cursor: 'pointer',
            }}
          >
            다른 타석 선택
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1.6,
              padding: '18px',
              borderRadius: '16px',
              border: 'none',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '18px',
              cursor: 'pointer',
              boxShadow: '0 10px 20px -5px rgba(5, 150, 105, 0.4)',
            }}
          >
            {startTimeStr} 배정 결제하기
          </button>
        </div>
      </div>
    </div>
  );
};
