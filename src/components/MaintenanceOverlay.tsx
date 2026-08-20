import React from 'react';
import { Wrench, ShieldAlert } from 'lucide-react';

interface MaintenanceOverlayProps {
  isVisible: boolean;
  onHiddenTap: () => void;
}

export const MaintenanceOverlay: React.FC<MaintenanceOverlayProps> = ({
  isVisible,
  onHiddenTap,
}) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0c0e12',
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
          maxWidth: '520px',
          gap: '24px',
        }}
      >
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '28px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '2px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fbbf24',
            boxShadow: '0 20px 50px rgba(245, 158, 11, 0.15)',
          }}
        >
          <Wrench size={48} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 14px',
                borderRadius: '999px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              <ShieldAlert size={14} />
              System Maintenance
            </span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff', margin: '8px 0 0 0', letterSpacing: '-0.5px' }}>
            현재 시스템 점검 중입니다
          </h1>
          <p style={{ fontSize: '15px', color: '#9ca3af', lineHeight: 1.6, margin: '8px 0 0 0' }}>
            더 안정적인 서비스 제공을 위해 장비 점검을 진행하고 있습니다.<br />
            타석 배정 및 결제는 <strong style={{ color: '#34d399', fontWeight: 700 }}>카운터 포스</strong>를 이용해 주시기 바랍니다.
          </p>
        </div>

        <div style={{ paddingTop: '32px', fontSize: '12px', color: '#4b5563', fontFamily: 'monospace' }}>
          LocalMaster Kiosk Engine v0.3.0
        </div>
      </div>
    </div>
  );
};
