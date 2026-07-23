import React, { useEffect, useState } from 'react';
import { AlertTriangle, Wrench, RefreshCw, X } from 'lucide-react';

export interface ErrorModalData {
  title?: string;
  message: string;
  errorCode?: string | number;
  isHardwareFail?: boolean;
  isVisible: boolean;
}

interface ErrorMessageModalProps {
  data: ErrorModalData;
  onClose: () => void;
  onRetry?: () => void;
}

export const ErrorMessageModal: React.FC<ErrorMessageModalProps> = ({
  data,
  onClose,
  onRetry,
}) => {
  const [countdown, setCountdown] = useState<number>(12);

  useEffect(() => {
    if (!data.isVisible) return;
    setCountdown(12);

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
  }, [data.isVisible, onClose]);

  if (!data.isVisible) return null;

  const isHw = data.isHardwareFail;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div
        className="premium-glass-card"
        style={{
          width: '680px',
          maxWidth: '92vw',
          background: 'linear-gradient(145deg, rgba(24, 26, 32, 0.98) 0%, rgba(12, 14, 18, 0.99) 100%)',
          borderRadius: '32px',
          border: isHw
            ? '2px solid rgba(245, 158, 11, 0.6)'
            : '2px solid rgba(239, 68, 68, 0.6)',
          boxShadow: isHw
            ? '0 20px 60px rgba(245, 158, 11, 0.25), 0 0 40px rgba(245, 158, 11, 0.1)'
            : '0 20px 60px rgba(239, 68, 68, 0.25), 0 0 40px rgba(239, 68, 68, 0.1)',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a1a1aa',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <X size={22} />
        </button>

        {/* 메인 에러 아이콘 */}
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            backgroundColor: isHw ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: isHw ? '2px solid rgba(245, 158, 11, 0.4)' : '2px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
          }}
        >
          {isHw ? (
            <Wrench size={48} color="#f59e0b" />
          ) : (
            <AlertTriangle size={48} color="#ef4444" />
          )}
        </div>

        {/* 에러 타이틀 */}
        <h3
          style={{
            fontSize: '30px',
            fontWeight: 900,
            color: isHw ? '#fbbf24' : '#f87171',
            margin: '0 0 12px 0',
            letterSpacing: '-0.5px',
          }}
        >
          {data.title || (isHw ? '타석 기기 가동 확인 필요' : '타석 배정 오류')}
        </h3>

        {/* 에러 상세 메시지 */}
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '20px 24px',
            width: '100%',
            margin: '12px 0 24px 0',
            fontSize: '20px',
            fontWeight: 700,
            lineHeight: 1.5,
            color: '#f4f4f5',
            wordBreak: 'keep-all',
          }}
        >
          {data.message}
        </div>

        {/* 조치 안내 및 카운트다운 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '12px 16px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '14px',
            fontSize: '15px',
            color: '#a1a1aa',
            marginBottom: '28px',
          }}
        >
          <span>
            {isHw
              ? '💡 배정은 등록되었으나 기기가 시작되지 않았습니다. 카운터에 문의해 주세요.'
              : '💡 직원의 안내를 받으시거나 다시 시도해 주세요.'}
          </span>
          <span style={{ fontWeight: 800, color: '#e4e4e7', minWidth: '70px', textAlign: 'right' }}>
            {countdown}초 후 닫힘
          </span>
        </div>

        {/* 하단 액션 버튼 */}
        <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
          {onRetry && (
            <button
              onClick={() => {
                onClose();
                onRetry();
              }}
              style={{
                flex: 1,
                height: '64px',
                borderRadius: '18px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={22} />
              다시 시도
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: '64px',
              borderRadius: '18px',
              border: 'none',
              background: isHw
                ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              color: '#fff',
              fontSize: '22px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: isHw
                ? '0 8px 20px rgba(217, 119, 6, 0.4)'
                : '0 8px 20px rgba(220, 38, 38, 0.4)',
            }}
          >
            확 인
          </button>
        </div>
      </div>
    </div>
  );
};
