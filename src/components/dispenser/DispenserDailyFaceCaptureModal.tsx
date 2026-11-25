import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { api, isDemoEnvironment } from '../../services/api';

interface DispenserDailyFaceCaptureModalProps {
  productName: string;
  basketCount: number;
  price: number;
  onCaptured: (faceImageBase64: string) => void;
  onCancel: () => void;
}

const MAX_CAPTURE_WAIT_SEC = 25;
const DEMO_PLACEHOLDER_FACE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

export const DispenserDailyFaceCaptureModal: React.FC<DispenserDailyFaceCaptureModalProps> = ({
  productName,
  basketCount,
  price,
  onCaptured,
  onCancel,
}) => {
  const [status, setStatus] = useState<'PREPARING' | 'SCANNING' | 'CAPTURED' | 'TIMEOUT'>('PREPARING');
  const [remainingSec, setRemainingSec] = useState<number>(MAX_CAPTURE_WAIT_SEC);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [attemptKey, setAttemptKey] = useState<number>(0);
  const [errorDetail, setErrorDetail] = useState<string>('');

  const cancelledRef = useRef<boolean>(false);
  const onCapturedRef = useRef(onCaptured);

  useEffect(() => {
    onCapturedRef.current = onCaptured;
  }, [onCaptured]);

  // 캡처 대기(25초) 중 키오스크 전역 비활동 초기화 타이머 방지 (MemberRegister 표준)
  useEffect(() => {
    if (status !== 'PREPARING' && status !== 'SCANNING') return;
    const keepAlive = window.setInterval(() => {
      window.dispatchEvent(new Event('keydown'));
    }, 10000);
    return () => window.clearInterval(keepAlive);
  }, [status]);

  useEffect(() => {
    cancelledRef.current = false;
    setStatus('PREPARING');
    setRemainingSec(MAX_CAPTURE_WAIT_SEC);
    setPreviewSrc('');
    setErrorDetail('');

    let startTimer: number | null = null;
    let countdownTimer: number | null = null;
    let proceedTimer: number | null = null;
    let captureStarted = false;
    let captureFinished = false;

    const runCapture = async () => {
      if (cancelledRef.current) return;

      if (isDemoEnvironment()) {
        setStatus('SCANNING');
        proceedTimer = window.setTimeout(() => {
          if (cancelledRef.current) return;
          setStatus('CAPTURED');
          setPreviewSrc(`data:image/png;base64,${DEMO_PLACEHOLDER_FACE_B64}`);
          proceedTimer = window.setTimeout(() => {
            if (!cancelledRef.current) {
              onCapturedRef.current(DEMO_PLACEHOLDER_FACE_B64);
            }
          }, 700);
        }, 900);
        return;
      }

      // MemberRegister 표준: 단말기 안면 캡처 단일 세션 Long-polling 대기 수신 (최대 25초, Trap 7 이중 호출·StrictMode cancel 충돌 원천 방어)
      captureStarted = true;
      setStatus('SCANNING');
      setRemainingSec(MAX_CAPTURE_WAIT_SEC);

      countdownTimer = window.setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            if (countdownTimer) window.clearInterval(countdownTimer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      try {
        const res = await api.detectFaceCamera();
        captureFinished = true;
        if (countdownTimer) window.clearInterval(countdownTimer);
        if (cancelledRef.current) return;

        if (res.detected && res.imageBase64) {
          const cleanB64 = res.imageBase64.includes(',')
            ? res.imageBase64.split(',')[1]
            : res.imageBase64;
          setPreviewSrc(`data:image/jpeg;base64,${cleanB64}`);
          setStatus('CAPTURED');
          // CaptureFaceData가 JPEG을 반환한 시점에 단말기는 이미 일반 모드로 복귀했으므로 중복 cancel-capture 생략
          proceedTimer = window.setTimeout(() => {
            if (!cancelledRef.current) {
              onCapturedRef.current(cleanB64);
            }
          }, 300);
          return;
        }

        void api.writeKioskLog(
          'DISPENSER_FACE_CAPTURE_FAIL',
          `일일권 선촬영 안면 미검출/타임아웃 (prod=${productName}, attempt=${attemptKey + 1})`,
          'DAILY_GUEST'
        );
        setErrorDetail('얼굴이 감지되지 않았습니다. 단말기 카메라 정면에 서서 다시 시도해 주세요.');
        setStatus('TIMEOUT');
        api.cancelFaceCaptureMode().catch(() => {});
      } catch (err) {
        captureFinished = true;
        if (countdownTimer) window.clearInterval(countdownTimer);
        if (cancelledRef.current) return;
        const msg =
          err instanceof Error
            ? `단말기 안면 촬영 통신 오류: ${err.message}`
            : '단말기 안면 촬영 통신 오류가 발생했습니다.';
        void api.writeKioskLog(
          'DISPENSER_FACE_CAPTURE_FAIL',
          `일일권 선촬영 통신 예외 (prod=${productName}, attempt=${attemptKey + 1}): ${msg}`,
          'DAILY_GUEST'
        );
        setErrorDetail(msg);
        setStatus('TIMEOUT');
        api.cancelFaceCaptureMode().catch(() => {});
      }
    };

    // React.StrictMode 개발 이중 마운트(0~1ms 언마운트) 시 물리 단말기 cancel-capture 경합 원천 차단
    startTimer = window.setTimeout(() => {
      void runCapture();
    }, 40);

    return () => {
      cancelledRef.current = true;
      if (startTimer) window.clearTimeout(startTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
      if (proceedTimer) window.clearTimeout(proceedTimer);
      if (captureStarted && !captureFinished && !isDemoEnvironment()) {
        api.cancelFaceCaptureMode().catch(() => {});
      }
    };
  }, [attemptKey]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.54)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 24px 90px 24px',
        boxSizing: 'border-box',
        zIndex: 9050,
      }}
    >
      <div
        style={{
          width: '940px',
          maxWidth: 'calc(100vw - 48px)',
          overflow: 'hidden',
          borderRadius: '40px',
          border: '1.5px solid #e2e8f0',
          backgroundColor: '#ffffff',
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.3)',
          animation: 'fadeUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1.5px solid #e2e8f0',
            background: '#f8fafc',
            padding: '32px 40px',
            gap: '20px',
          }}
        >
          <div>
            <span
              style={{
                display: 'inline-block',
                padding: '7px 18px',
                borderRadius: '999px',
                background: '#d1fae5',
                border: '1.5px solid #34d399',
                fontSize: '20px',
                fontWeight: 900,
                color: '#065f46',
              }}
            >
              결제 전 1단계 · 일일권 임시 안면 촬영
            </span>
            <h2
              style={{
                margin: '12px 0 0 0',
                fontSize: '36px',
                fontWeight: 950,
                color: '#0f172a',
                letterSpacing: '-0.9px',
                lineHeight: 1.2,
              }}
            >
              {productName} ({basketCount}회 · {price.toLocaleString()}원)
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="취소"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '2px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={32} strokeWidth={2.6} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '44px 44px 40px 44px',
            textAlign: 'center',
            gap: '30px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              border: `6px solid ${status === 'TIMEOUT' ? '#f59e0b' : '#10b981'}`,
              background: status === 'TIMEOUT' ? '#fffbeb' : '#f0fdf4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow:
                status === 'TIMEOUT'
                  ? 'inset 0 4px 16px rgba(217, 119, 6, 0.1), 0 14px 36px rgba(245, 158, 11, 0.2)'
                  : 'inset 0 4px 16px rgba(15, 23, 42, 0.06), 0 14px 36px rgba(16, 185, 129, 0.22)',
            }}
          >
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="촬영된 안면"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '20px',
                }}
              >
                <Camera
                  size={104}
                  strokeWidth={2}
                  style={{ color: status === 'TIMEOUT' ? '#d97706' : '#059669' }}
                />
                {status === 'SCANNING' && (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '8px 22px',
                      borderRadius: '999px',
                      background: '#059669',
                      color: '#ffffff',
                      fontSize: '28px',
                      fontWeight: 950,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {remainingSec}초
                  </span>
                )}
              </div>
            )}
            {status === 'CAPTURED' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(5, 150, 105, 0.36)',
                }}
              >
                <CheckCircle2 size={96} style={{ color: '#ffffff' }} />
              </div>
            )}
          </div>

          {/* 초대형 핵심 안내 문구 (키오스크 원거리 고가독성) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '40px',
                fontWeight: 950,
                color: status === 'TIMEOUT' ? '#b45309' : '#0f172a',
                letterSpacing: '-1px',
                lineHeight: 1.2,
                wordBreak: 'keep-all',
              }}
            >
              {status === 'PREPARING'
                ? '카메라를 준비하고 있습니다...'
                : status === 'CAPTURED'
                  ? '촬영 완료! 결제 화면으로 이동합니다'
                  : status === 'TIMEOUT'
                    ? '얼굴이 인식되지 않았습니다'
                    : '단말기 카메라 정면을 바라봐 주세요'}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 800,
                color: '#475569',
                letterSpacing: '-0.4px',
                wordBreak: 'keep-all',
              }}
            >
              {status === 'TIMEOUT'
                ? '아래 [다시 촬영] 버튼을 눌러 정면에서 다시 찍어 주세요.'
                : status === 'CAPTURED'
                  ? '잠시만 기다려 주세요.'
                  : '얼굴이 인식되면 1초 만에 자동 촬영됩니다.'}
            </p>
          </div>

          <div
            style={{
              width: '100%',
              borderRadius: '28px',
              border: '2px solid #86efac',
              background: '#ecfdf5',
              padding: '26px 32px',
              textAlign: 'left',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <p style={{ margin: 0, fontSize: '25px', fontWeight: 950, color: '#065f46', letterSpacing: '-0.5px' }}>
              왜 결제 전에 얼굴을 먼저 촬영하나요?
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 800,
                lineHeight: 1.5,
                color: '#064e3b',
                wordBreak: 'keep-all',
              }}
            >
              1·2층 볼 배급기에서 얼굴 인증만으로 볼을 바로 받으실 수 있습니다.
              <br />
              촬영된 얼굴은 오늘 영업 종료(자정) 후 자동 삭제됩니다.
            </p>
          </div>

          {status === 'TIMEOUT' && (
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
                borderRadius: '26px',
                border: '2px solid #f59e0b',
                background: '#fffbeb',
                padding: '22px 28px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', color: '#92400e' }}>
                <ShieldAlert size={34} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.4, wordBreak: 'keep-all' }}>
                  {errorDetail || '카메라 정면에 서서 다시 시도해 주세요.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttemptKey((prev) => prev + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '18px',
                  border: 'none',
                  background: '#d97706',
                  padding: '18px 28px',
                  fontSize: '23px',
                  fontWeight: 950,
                  color: '#ffffff',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={22} />
                다시 촬영
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onCancel}
            style={{
              width: '100%',
              borderRadius: '24px',
              border: '2px solid #cbd5e1',
              background: '#ffffff',
              padding: '24px 28px',
              fontSize: '26px',
              fontWeight: 950,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            이전으로
          </button>
        </div>
      </div>
    </div>
  );
};

export default DispenserDailyFaceCaptureModal;
