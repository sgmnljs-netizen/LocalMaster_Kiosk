import React from 'react';

interface KioskBottomBarProps {
  lang: 'KO' | 'EN';
  step: string;
  onGoHome: () => void;
  onGoBack?: () => void;
}

export const KioskBottomBar: React.FC<KioskBottomBarProps> = ({
  lang,
  step,
  onGoHome,
  onGoBack,
}) => {
  if (step === 'INTRO' || step === 'MAIN_DASHBOARD') return null;

  const showBackButton = onGoBack && step !== 'MAIN_DASHBOARD' && step !== 'INTRO';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '12px 24px',
        borderRadius: '32px',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
        width: 'calc(100% - 60px)',
        maxWidth: '1000px',
        boxSizing: 'border-box',
      }}
    >
      {/* 🏠 처음으로 (Home) 버튼 */}
      <button
        type="button"
        onClick={onGoHome}
        style={{
          flex: 1,
          height: '64px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          fontSize: '20px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          transition: 'transform 0.15s ease, background-color 0.15s ease',
        }}
      >
        <span style={{ fontSize: '24px' }}>🏠</span>
        <span>{lang === 'KO' ? '처음으로' : 'Home'}</span>
      </button>

      {/* ⬅️ 이전 (Back) 버튼 */}
      {showBackButton && (
        <button
          type="button"
          onClick={onGoBack}
          style={{
            flex: 1,
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            fontSize: '20px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
          }}
        >
          <span style={{ fontSize: '24px' }}>⬅️</span>
          <span>{lang === 'KO' ? '이전 (돌아가기)' : 'Back'}</span>
        </button>
      )}
    </div>
  );
};

export default KioskBottomBar;
