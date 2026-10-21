import React, { useEffect, useState } from 'react';
import { AlertTriangle, Wrench, RefreshCw, X } from 'lucide-react';

export interface ErrorModalData {
  title?: string;
  message: string;
  errorCode?: string | number;
  isHardwareFail?: boolean;
  isVisible: boolean;
  onCloseCallback?: () => void;
  onRetryCallback?: () => void;
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

  const handleClose = () => {
    data.onCloseCallback?.();
    onClose();
  };

  const handleRetry = () => {
    data.onRetryCallback?.();
    if (onRetry) onRetry();
    onClose();
  };

  useEffect(() => {
    if (!data.isVisible) return;
    setCountdown(12);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleClose();
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
        inset: 0,
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
          background: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '36px',
          border: '1px solid #e5e5ea',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
          padding: '44px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          color: '#1d1d1f',
        }}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#48484a',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <X size={22} />
        </button>

        {/* 메인 에러 아이콘 */}
        <div
          style={{
            width: '88px',
            height: '88px',
            borderRadius: '50%',
            backgroundColor: isHw ? '#fffbeb' : '#fef2f2',
            border: isHw ? '1.5px solid #fde68a' : '1.5px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          {isHw ? (
            <Wrench size={42} color="#d97706" />
          ) : (
            <AlertTriangle size={42} color="#dc2626" />
          )}
        </div>

        {/* 에러 타이틀 */}
        <h3
          style={{
            fontSize: '28px',
            fontWeight: 900,
            color: '#1d1d1f',
            margin: '0 0 14px 0',
            letterSpacing: '-0.6px',
          }}
        >
          {data.title || (isHw ? '타석 기기 가동 확인 필요' : '타석 배정 오류')}
        </h3>

        {/* 에러 상세 메시지 */}
        <div
          style={{
            backgroundColor: '#f5f5f7',
            borderRadius: '22px',
            border: '1px solid #e5e5ea',
            padding: '22px 24px',
            marginBottom: '20px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              fontSize: '19px',
              fontWeight: 700,
              color: '#1d1d1f',
              lineHeight: 1.6,
              margin: 0,
              wordBreak: 'keep-all',
            }}
          >
            {data.message}
          </p>

          {data.errorCode && (
            <p
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#86868b',
                margin: '10px 0 0 0',
                fontFamily: 'monospace',
              }}
            >
              ERR_CODE: {data.errorCode}
            </p>
          )}
        </div>

        {/* 자동 닫힘 안내 바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '12px 20px',
            backgroundColor: '#f5f5f7',
            borderRadius: '14px',
            fontSize: '14px',
            color: '#6e6e73',
            marginBottom: '28px',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {isHw
              ? '💡 배정은 등록되었으나 기기가 시작되지 않았습니다. 카운터에 문의해 주세요.'
              : '💡 직원의 안내를 받으시거나 다시 시도해 주세요.'}
          </span>
          <span style={{ fontWeight: 800, color: '#1d1d1f', minWidth: '75px', textAlign: 'right' }}>
            {countdown}초 후 닫힘
          </span>
        </div>

        {/* 하단 액션 버튼 */}
        <div style={{ display: 'flex', gap: '14px', width: '100%' }}>
          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              style={{
                flex: 1,
                height: '64px',
                borderRadius: '999px',
                border: '1px solid #d2d2d7',
                background: '#f5f5f7',
                color: '#1d1d1f',
                fontSize: '19px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={20} />
              다시 시도
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            style={{
              flex: 1,
              height: '64px',
              borderRadius: '999px',
              border: 'none',
              background: '#1d1d1f',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
            }}
          >
            확 인
          </button>
        </div>
      </div>
    </div>
  );
};
