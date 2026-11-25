import React, { useEffect, useId, useRef, useState } from 'react';
import { CarFront, ExternalLink, RefreshCw, X } from 'lucide-react';
import {
  DEFAULT_PARKING_BUTTON_LABEL,
  DEFAULT_PARKING_HEIGHT_PCT,
  DEFAULT_PARKING_IDLE_TIMEOUT_SEC,
  DEFAULT_PARKING_WIDTH_PCT,
  isSafeParkingHttpUrl,
  type KioskParkingConfig,
} from '../stores/kioskSettings';

export interface GolfosKioskElectronBridge {
  isElectron?: boolean;
  openParkingPopup?: (options: {
    url: string;
    title: string;
    idleTimeoutSec: number;
    widthPct: number;
    heightPct: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  closeParkingPopup?: () => Promise<{ ok: boolean }>;
  clearParkingSession?: () => Promise<{ ok: boolean; error?: string }>;
  onParkingPopupClosed?: (callback: (payload: { reason?: string }) => void) => () => void;
}

declare global {
  interface Window {
    golfosKioskBridge?: GolfosKioskElectronBridge;
  }
}

interface ParkingPopupModalProps {
  isOpen: boolean;
  config: KioskParkingConfig;
  onClose: () => void;
}

export const ParkingPopupModal: React.FC<ParkingPopupModalProps> = ({
  isOpen,
  config,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const titleId = useId();
  const safeTitle = (config.buttonLabel || DEFAULT_PARKING_BUTTON_LABEL).trim();
  const safeUrl = isSafeParkingHttpUrl(config.url) ? config.url.trim() : '';
  const initialIdleSec = Number.isFinite(config.idleTimeoutSec)
    ? Math.max(15, Math.min(300, Math.round(config.idleTimeoutSec)))
    : DEFAULT_PARKING_IDLE_TIMEOUT_SEC;
  const widthPct = Number.isFinite(config.popupWidthPct)
    ? Math.max(50, Math.min(98, Math.round(config.popupWidthPct)))
    : DEFAULT_PARKING_WIDTH_PCT;
  const heightPct = Number.isFinite(config.popupHeightPct)
    ? Math.max(45, Math.min(92, Math.round(config.popupHeightPct)))
    : DEFAULT_PARKING_HEIGHT_PCT;

  const isElectronMode = Boolean(
    typeof window !== 'undefined' &&
      window.golfosKioskBridge?.isElectron &&
      typeof window.golfosKioskBridge.openParkingPopup === 'function'
  );

  const [remainSec, setRemainSec] = useState<number>(initialIdleSec);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [electronError, setElectronError] = useState<string | null>(null);

  // 1. 네이티브 <dialog> showModal() 라이프사이클 동기화 (modern-web-guidance: dialog)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen) {
      setRemainSec(initialIdleSec);
      setElectronError(null);
      if (!dlg.open) {
        if (typeof dlg.showModal === 'function') {
          dlg.showModal();
        } else {
          dlg.setAttribute('open', '');
        }
      }
    } else if (dlg.open) {
      dlg.close();
    }
  }, [isOpen, initialIdleSec]);

  // 2. 네이티브 close 이벤트 및 closedby 미지원 브라우저용 경계 밖 클릭 폴백
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleNativeClose = () => {
      dlg.returnValue = '';
      if (isElectronMode && typeof window.golfosKioskBridge?.closeParkingPopup === 'function') {
        void window.golfosKioskBridge.closeParkingPopup().catch(() => {});
      }
      onCloseRef.current();
    };

    dlg.addEventListener('close', handleNativeClose);

    const needsLightDismissFallback =
      typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype);
    let pressedOutside = false;

    const isOutside = (e: PointerEvent) => {
      const rect = dlg.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dlg.open) {
        dlg.close();
      }
      pressedOutside = false;
    };

    if (needsLightDismissFallback) {
      dlg.addEventListener('pointerdown', onPointerDown);
      dlg.addEventListener('pointerup', onPointerUp);
    }

    return () => {
      dlg.removeEventListener('close', handleNativeClose);
      if (needsLightDismissFallback) {
        dlg.removeEventListener('pointerdown', onPointerDown);
        dlg.removeEventListener('pointerup', onPointerUp);
      }
    };
  }, [isElectronMode]);

  // 3. Electron 전용 persist:parking 모달 창 연동
  useEffect(() => {
    if (!isOpen || !isElectronMode || !safeUrl) return;
    const bridge = window.golfosKioskBridge;
    if (!bridge || typeof bridge.openParkingPopup !== 'function') return;

    let cancelled = false;
    const unsubscribe =
      typeof bridge.onParkingPopupClosed === 'function'
        ? bridge.onParkingPopupClosed(() => {
            if (!cancelled) {
              const dlg = dialogRef.current;
              if (dlg && dlg.open) {
                dlg.close();
              } else {
                onCloseRef.current();
              }
            }
          })
        : () => {};

    void bridge
      .openParkingPopup({
        url: safeUrl,
        title: safeTitle,
        idleTimeoutSec: initialIdleSec,
        widthPct,
        heightPct,
      })
      .then((res) => {
        if (!cancelled && res && !res.ok) {
          setElectronError(res.error || '주차할인 창을 열 수 없습니다.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setElectronError(err instanceof Error ? err.message : '주차할인 창 실행 중 오류가 발생했습니다.');
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof bridge.closeParkingPopup === 'function') {
        void bridge.closeParkingPopup().catch(() => {});
      }
    };
  }, [isOpen, isElectronMode, safeUrl, safeTitle, initialIdleSec, widthPct, heightPct]);

  // 4. 웹 브라우저 폴백 모드 유휴 자동 닫힘 타이머
  useEffect(() => {
    if (!isOpen || isElectronMode) return;
    setRemainSec(initialIdleSec);

    const timerId = window.setInterval(() => {
      setRemainSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(timerId);
          const dlg = dialogRef.current;
          if (dlg && dlg.open) {
            dlg.close();
          } else {
            onCloseRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isOpen, isElectronMode, initialIdleSec]);

  const handleManualClose = () => {
    const dlg = dialogRef.current;
    if (dlg && dlg.open) {
      dlg.close();
    } else {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <style>{`
        dialog.kiosk-parking-dialog {
          padding: 0;
          margin: auto;
          border: none;
          border-radius: 26px;
          background: #0f172a;
          color: #f8fafc;
          box-shadow: 0 28px 70px rgba(2, 6, 23, 0.72);
          overflow: hidden;
        }
        dialog.kiosk-parking-dialog[open] {
          display: flex;
          flex-direction: column;
        }
        dialog.kiosk-parking-dialog:modal {
          overscroll-behavior: contain;
        }
        dialog.kiosk-parking-dialog::backdrop {
          background: rgba(2, 6, 23, 0.72);
          backdrop-filter: blur(8px);
          overflow: hidden;
          overscroll-behavior: contain;
        }
      `}</style>
      <dialog
        ref={dialogRef}
        className="kiosk-parking-dialog"
        data-testid="parking-popup-dialog"
        aria-labelledby={titleId}
        {...({ closedby: 'any' } as Record<string, string>)}
        onPointerDown={() => {
          if (!isElectronMode) setRemainSec(initialIdleSec);
        }}
        style={{
          width: isElectronMode ? '540px' : `${widthPct}vw`,
          height: isElectronMode ? 'auto' : `${heightPct}vh`,
          maxWidth: '98vw',
          maxHeight: '94vh',
        }}
      >
        {/* 상단 고정 제어 바 */}
        <div
          style={{
            height: '68px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
            borderBottom: '2px solid rgba(16, 185, 129, 0.45)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CarFront size={22} color="#34d399" strokeWidth={2.4} />
            </div>
            <h1
              id={titleId}
              style={{
                fontSize: '20px',
                fontWeight: 900,
                margin: 0,
                color: '#ffffff',
                letterSpacing: '-0.4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {safeTitle}
            </h1>
            {!isElectronMode && (
              <span
                data-testid="parking-popup-countdown"
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.18)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  color: '#6ee7b7',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {remainSec}초 후 자동 닫힘
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {!isElectronMode && safeUrl && (
              <button
                type="button"
                onClick={() => {
                  setRemainSec(initialIdleSec);
                  setIframeKey((k) => k + 1);
                }}
                aria-label="새로고침"
                style={{
                  height: '44px',
                  padding: '0 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={16} />
                <span>새로고침</span>
              </button>
            )}
            <button
              type="button"
              autoFocus
              data-testid="parking-popup-close-btn"
              onClick={handleManualClose}
              style={{
                height: '44px',
                padding: '0 22px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              <X size={18} strokeWidth={2.8} />
              <span>닫기</span>
            </button>
          </div>
        </div>

        {/* 본문: Electron 전용 백드롭 상태 카드 또는 브라우저 iframe 폴백 */}
        {isElectronMode ? (
          <div style={{ padding: '28px 26px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {electronError ? '주차할인 창 실행 오류' : '주차 할인 등록 창이 화면 위에 열렸습니다.'}
            </p>
            <p style={{ fontSize: '14px', fontWeight: 600, color: electronError ? '#fda4af' : '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              {electronError || '차량번호를 입력한 뒤 상단 [닫기] 버튼을 누르시면 키오스크 메인으로 돌아옵니다.'}
            </p>
          </div>
        ) : !safeUrl ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#fda4af', margin: 0 }}>
              유효한 주차할인 웹 주소가 설정되지 않았습니다. 관리자 설정에서 URL을 확인해 주세요.
            </p>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#ffffff', minHeight: 0 }}>
            <iframe
              key={iframeKey}
              src={safeUrl}
              title={safeTitle}
              sandbox="allow-forms allow-scripts allow-same-origin"
              style={{ width: '100%', flex: 1, border: 'none', background: '#ffffff' }}
            />
            <div
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                fontSize: '12px',
                color: '#475569',
                fontWeight: 700,
              }}
            >
              <span>
                주차업체 보안 정책(X-Frame-Options)으로 화면이 표시되지 않을 경우 전용 Electron 키오스크 앱에서 정상 동작합니다.
              </span>
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#0284c7',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <ExternalLink size={13} />
                <span>새 창 열기</span>
              </a>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
};
