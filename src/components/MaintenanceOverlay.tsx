import React from 'react';
import { Wrench, ShieldAlert } from 'lucide-react';

interface MaintenanceOverlayProps {
  isVisible: boolean;
  onHiddenTap: () => void;
  noticeMessage?: string;
}

export const MaintenanceOverlay: React.FC<MaintenanceOverlayProps> = ({
  isVisible,
  onHiddenTap,
  noticeMessage,
}) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#fbfbfd',
        zIndex: 99990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        userSelect: 'none',
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
      }}
    >
      {/* Invisible Top-Left 5-Tap Zone to Unlock */}
      <button
        type="button"
        onClick={onHiddenTap}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '120px',
          height: '120px',
          opacity: 0,
          zIndex: 99999,
          cursor: 'default',
          border: 'none',
          background: 'transparent',
        }}
        aria-label="Admin Unlock Zone"
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '580px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '36px',
          border: '1px solid #e5e5ea',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.08)',
          padding: '52px 44px',
          gap: '24px',
        }}
      >
        <div
          style={{
            width: '92px',
            height: '92px',
            borderRadius: '28px',
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1d1d1f',
          }}
        >
          <Wrench size={44} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '999px',
                background: '#f5f5f7',
                border: '1px solid #e5e5ea',
                color: '#1d1d1f',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
              }}
            >
              <ShieldAlert size={14} />
              System Maintenance
            </span>
          </div>
          <h1 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', margin: '8px 0 0 0', letterSpacing: '-0.6px' }}>
            현재 시스템 점검 중입니다
          </h1>
          {noticeMessage ? (
            <p style={{ fontSize: '17px', color: '#48484a', fontWeight: 600, lineHeight: 1.6, margin: '8px 0 0 0', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}>
              {noticeMessage}
            </p>
          ) : (
            <p style={{ fontSize: '17px', color: '#6e6e73', fontWeight: 600, lineHeight: 1.6, margin: '8px 0 0 0' }}>
              더 안정적인 서비스 제공을 위해 장비 점검을 진행하고 있습니다.<br />
              타석 배정 및 결제는 <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>카운터(안내 데스크)</strong>를 이용해 주시기 바랍니다.
            </p>
          )}
        </div>

        <div style={{ paddingTop: '16px', fontSize: '12px', color: '#86868b', fontFamily: 'monospace' }}>
          GOLFOS Kiosk Engine {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.3.0'}
        </div>
      </div>
    </div>
  );
};
