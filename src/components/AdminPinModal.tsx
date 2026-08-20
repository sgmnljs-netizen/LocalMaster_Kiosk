import React, { useState } from 'react';
import { Lock, X, Delete } from 'lucide-react';
import { useKioskSettings } from '../stores/kioskSettings';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { settings } = useKioskSettings();
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    if (pin.length >= 4) return;
    const nextPin = pin + num;
    setPin(nextPin);
    setErrorMsg('');

    if (nextPin.length === 4) {
      const correctPin = settings.adminPin || '1234';
      if (nextPin === correctPin) {
        setTimeout(() => {
          setPin('');
          setErrorMsg('');
          onSuccess();
        }, 150);
      } else {
        setTimeout(() => {
          setErrorMsg('관리자 PIN 번호가 일치하지 않습니다.');
          setPin('');
        }, 200);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '420px',
          maxWidth: '92vw',
          background: 'linear-gradient(145deg, #1e222d 0%, #12151c 100%)',
          borderRadius: '32px',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(16, 185, 129, 0.1)',
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          color: '#ffffff',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={() => {
            handleClear();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a1a1aa',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div
            style={{
              padding: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '16px',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={24} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            키오스크 관리자 인증
          </h2>
        </div>

        <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 28px 0', textAlign: 'center' }}>
          관리자 마스터 PIN 4자리를 입력하세요 (기본값: 0000)
        </p>

        {/* PIN 4-Dot Indicator */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: pin.length > idx ? '2px solid #34d399' : '2px solid #4b5563',
                backgroundColor: pin.length > idx ? '#34d399' : '#1f2937',
                boxShadow: pin.length > idx ? '0 0 12px rgba(52, 211, 153, 0.8)' : 'none',
                transition: 'all 0.15s ease',
                transform: pin.length > idx ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {errorMsg && (
          <div
            style={{
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Big Touch Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            width: '100%',
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumClick(num)}
              style={{
                height: '68px',
                background: '#262a36',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                color: '#ffffff',
                fontSize: '26px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            style={{
              height: '68px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              color: '#9ca3af',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            초기화
          </button>
          <button
            onClick={() => handleNumClick('0')}
            style={{
              height: '68px',
              background: '#262a36',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              color: '#ffffff',
              fontSize: '26px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            0
          </button>
          <button
            onClick={handleDelete}
            style={{
              height: '68px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              color: '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
