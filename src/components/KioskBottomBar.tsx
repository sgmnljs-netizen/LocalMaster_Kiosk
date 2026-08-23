import React from 'react';
import { Home, ChevronLeft } from 'lucide-react';

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
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '10px 16px',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.12), inset 0 1px 1.5px rgba(255, 255, 255, 0.9)',
        width: 'calc(100% - 60px)',
        maxWidth: '880px',
        boxSizing: 'border-box',
      }}
    >
      {/* 🏠 처음으로 (Home) 버튼 - 서브 소프트 그레이 필 */}
      <button
        type="button"
        onClick={onGoHome}
        style={{
          flex: 1,
          height: '56px',
          borderRadius: '999px',
          background: '#f5f5f7',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          color: '#1d1d1f',
          fontSize: '17px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className="apple-card-hover"
      >
        <Home size={20} strokeWidth={2.4} style={{ color: '#1d1d1f' }} />
        <span>{lang === 'KO' ? '처음으로' : 'Home'}</span>
      </button>

      {/* ‹ 이전 단계 (Back) 버튼 - 메인 애플 딥 차콜 블랙 필 */}
      {showBackButton && (
        <button
          type="button"
          onClick={onGoBack}
          style={{
            flex: 1.2,
            height: '56px',
            borderRadius: '999px',
            background: '#1d1d1f',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '17px',
            fontWeight: 950,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
            transition: 'all 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          className="apple-card-hover"
        >
          <ChevronLeft size={22} strokeWidth={2.8} style={{ color: '#ffffff', marginLeft: '-4px' }} />
          <span>{lang === 'KO' ? '이전 단계' : 'Back'}</span>
        </button>
      )}
    </div>
  );
};

export default KioskBottomBar;
