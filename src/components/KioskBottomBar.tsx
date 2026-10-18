import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 인트로 화면 및 메인 대시보드(홈)에서는 하단 내비게이션 바 숨김
  if (step === 'INTRO' || step === 'MAIN_DASHBOARD') return null;
  if (!isMounted || typeof document === 'undefined') return null;

  const showBackButton = Boolean(onGoBack);

  const content = (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '12px 20px',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(25px)',
        WebkitBackdropFilter: 'blur(25px)',
        border: '1.5px solid rgba(0, 0, 0, 0.08)',
        boxShadow:
          '0 20px 50px rgba(0, 0, 0, 0.22), 0 4px 14px rgba(0, 0, 0, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
        width: 'calc(100% - 48px)',
        maxWidth: '860px',
        boxSizing: 'border-box',
        animation: 'kioskBottomBarSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes kioskBottomBarSlideUp {
          from {
            transform: translate(-50%, 60px);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        .kiosk-nav-btn {
          transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.12s ease, background-color 0.12s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .kiosk-nav-btn:active {
          transform: scale(0.97) !important;
        }
      `}</style>

      {/* 🏠 처음으로 (Home) 버튼 - 퓨어 라이트 캡슐 */}
      <button
        type="button"
        onClick={onGoHome}
        style={{
          flex: 1,
          height: '60px',
          borderRadius: '999px',
          background: '#f2f2f7',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          color: '#1d1d1f',
          fontSize: '18px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
          userSelect: 'none',
        }}
        className="kiosk-nav-btn"
      >
        <Home size={22} strokeWidth={2.4} style={{ color: '#1d1d1f' }} />
        <span>{lang === 'KO' ? '처음으로' : 'Home'}</span>
      </button>

      {/* ‹ 이전 단계 (Back) 버튼 - 애플 딥 차콜 블랙 캡슐 */}
      {showBackButton && (
        <button
          type="button"
          onClick={onGoBack}
          style={{
            flex: 1.25,
            height: '60px',
            borderRadius: '999px',
            background: '#1d1d1f',
            border: '1.5px solid rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: 950,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.22)',
            userSelect: 'none',
          }}
          className="kiosk-nav-btn"
        >
          <ChevronLeft size={24} strokeWidth={3} style={{ color: '#ffffff', marginLeft: '-4px' }} />
          <span>{lang === 'KO' ? '이전 단계' : 'Back'}</span>
        </button>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default KioskBottomBar;
