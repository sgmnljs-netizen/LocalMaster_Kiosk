import React, { useState, useEffect } from 'react';
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
  const [failCount, setFailCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!lockoutUntil) return;
    const timer = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        setLockoutUntil(null);
        setFailCount(0);
        setErrorMsg('');
      } else {
        setErrorMsg(`PIN 5회 오류로 잠금되었습니다. (${rem}초 후 재시도)`);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setErrorMsg(`PIN 5회 오류로 잠금되었습니다. (${rem}초 후 재시도)`);
      return;
    }
    if (pin.length >= 4) return;
    const nextPin = pin + num;
    setPin(nextPin);
    setErrorMsg('');

    if (nextPin.length === 4) {
      const correctPin = settings.adminPin || '0000';
      if (nextPin === correctPin) {
        setTimeout(() => {
          setPin('');
          setErrorMsg('');
          setFailCount(0);
          setLockoutUntil(null);
          onSuccess();
        }, 150);
      } else {
        const nextFail = failCount + 1;
        setFailCount(nextFail);
        setTimeout(() => {
          if (nextFail >= 5) {
            const until = Date.now() + 30000;
            setLockoutUntil(until);
            setErrorMsg('PIN 5회 오류로 잠금되었습니다. (30초 후 재시도)');
          } else {
            setErrorMsg(`관리자 PIN 번호가 일치하지 않습니다. (${nextFail}/5)`);
          }
          setPin('');
        }, 200);
      }
    }
  };

  const handleDelete = () => {
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    if (!lockoutUntil || Date.now() >= lockoutUntil) {
      setErrorMsg('');
    }
  };

  return (
    <div
      data-testid="admin-pin-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
        data-testid="admin-pin-modal-card"
        style={{
          width: '420px',
          maxWidth: '92vw',
          background: '#ffffff',
          borderRadius: '32px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18), 0 4px 16px rgba(15, 23, 42, 0.06)',
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          color: '#0f172a',
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
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
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
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '16px',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={24} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            키오스크 관리자 인증
          </h2>
        </div>

        <p style={{ fontSize: '14px', color: '#64748b', fontWeight: 500, margin: '0 0 28px 0', textAlign: 'center' }}>
          관리자 마스터 PIN 4자리를 입력하세요
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
                border: pin.length > idx ? '2px solid #059669' : '2px solid #cbd5e1',
                backgroundColor: pin.length > idx ? '#10b981' : '#f1f5f9',
                boxShadow: pin.length > idx ? '0 0 12px rgba(16, 185, 129, 0.45)' : 'none',
                transition: 'all 0.15s ease',
                transform: pin.length > idx ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {errorMsg && (
          <div
            style={{
              color: '#dc2626',
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
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '20px',
                color: '#0f172a',
                fontSize: '26px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
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
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              color: '#475569',
              fontSize: '15px',
              fontWeight: 800,
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
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              color: '#0f172a',
              fontSize: '26px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
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
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              color: '#475569',
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
