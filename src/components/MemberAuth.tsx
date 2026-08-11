import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, User, X, Sparkles, Smartphone, Radio } from 'lucide-react';
import { api, Member, WS_BASE_URL, STORE_CODE } from '../services/api';

interface MemberAuthProps {
  initialAuthMode?: 'SMART_TAG' | 'FACE';
  faceTerminalEnabled?: boolean;
  isSubModal?: boolean;
  onAuthSuccess: (member: Member) => void;
  onCancel: () => void;
  onSignUpClick?: () => void;
  onAuthError?: (code: string, detail: string) => void;
}

export const MemberAuth: React.FC<MemberAuthProps> = ({ 
  initialAuthMode = 'SMART_TAG', 
  faceTerminalEnabled = true,
  isSubModal = false,
  onAuthSuccess, 
  onCancel, 
  onSignUpClick,
  onAuthError
}) => {
  const effectiveInitialMode = (!faceTerminalEnabled && initialAuthMode === 'FACE') ? 'SMART_TAG' : initialAuthMode;
  const [authMode, setAuthMode] = useState<'SMART_TAG' | 'FACE'>(effectiveInitialMode);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // 1초 본인 확인 팝업용 회원 감지 상태 (3번 방어책)
  const [detectedMember, setDetectedMember] = useState<Member | null>(null);
  
  // 안면 인식 관련 추가 상태
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceMatchResult, setFaceMatchResult] = useState<Member | null>(null);
  const [faceCountdown, setFaceCountdown] = useState<number>(15);

  // 🛡️ 비동기 타이머 및 네트워크 중단 제어용 refs
  const faceScanTimeoutRef = useRef<any>(null);
  const faceTimerRef = useRef<any>(null);
  const authTimeoutRef = useRef<any>(null);
  const faceAbortControllerRef = useRef<AbortController | null>(null);
  // 키오스크 ↔ 백엔드 NFC/BLE WebSocket 연결 ref
  const nfcBleWsRef = useRef<WebSocket | null>(null);

  // 스마트 태그 (NFC/BLE) 감지 시 회원 수신 처리 (3번 본인 확인 팝업 유도)
  const handleSmartTagDetected = useCallback(async (tokenOrUid: string) => {
    setIsSearching(true);
    setErrorMsg('');
    try {
      const member = await api.getMember(tokenOrUid);
      if (member) {
        setDetectedMember(member);
      } else {
        setErrorMsg('등록되지 않은 모바일 회원 또는 NFC 카드입니다.');
      }
    } catch {
      setErrorMsg('스마트 인증 처리 중 서버 통신 에러가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 안면 인식 트리거 (15초 대기 타이머 & 백엔드 안면 식별 API 동기 연동)
  const triggerFaceScan = useCallback(async () => {
    setFaceScanning(true);
    setFaceMatchResult(null);
    setErrorMsg('');
    setFaceCountdown(15);

    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
    if (faceTimerRef.current) clearInterval(faceTimerRef.current);
    if (faceAbortControllerRef.current) {
      faceAbortControllerRef.current.abort();
    }
    const newController = new AbortController();
    faceAbortControllerRef.current = newController;

    // 15초 카운트다운 타이머 구동
    faceTimerRef.current = setInterval(() => {
      setFaceCountdown(prev => {
        if (prev <= 1) {
          if (faceTimerRef.current) {
            clearInterval(faceTimerRef.current);
            faceTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const member = await api.scanFace(undefined, newController.signal);
      if (faceTimerRef.current) {
        clearInterval(faceTimerRef.current);
        faceTimerRef.current = null;
      }

      if (member) {
        setFaceMatchResult(member);
        // 1.2초 후 회원 로그인 통과 완료
        authTimeoutRef.current = setTimeout(() => {
          onAuthSuccess(member);
        }, 1200);
      } else {
        if (!newController.signal.aborted) {
          setErrorMsg('등록된 안면 정보가 없습니다. 스마트 태그 인증으로 진행해 주세요.');
          setFaceScanning(false);
        }
      }
    } catch {
      if (faceTimerRef.current) {
        clearInterval(faceTimerRef.current);
        faceTimerRef.current = null;
      }
      if (!newController.signal.aborted) {
        setErrorMsg('안면인식 장치 응답 지연이 발생했습니다.');
        setFaceScanning(false);
        if (onAuthError) {
          onAuthError('ERR_HARDWARE_TIMEOUT', '안면인식 스캔 모듈로부터 데이터를 수신하는 데 실패했습니다. 응답 타임아웃.');
        }
      }
    }
  }, [onAuthSuccess, onAuthError]);

  // 🛡️ 컴포넌트 언마운트 시 또는 authMode 전환 시 타이머 전면 클린업
  useEffect(() => {
    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
    if (faceTimerRef.current) clearInterval(faceTimerRef.current);
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);

    if (authMode === 'FACE') {
      triggerFaceScan();
    } else {
      if (faceAbortControllerRef.current) {
        faceAbortControllerRef.current.abort();
        faceAbortControllerRef.current = null;
      }
      setFaceScanning(false);
      setFaceMatchResult(null);
    }

    return () => {
      if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
      if (faceTimerRef.current) clearInterval(faceTimerRef.current);
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
      if (faceAbortControllerRef.current) {
        faceAbortControllerRef.current.abort();
        faceAbortControllerRef.current = null;
      }
    };
  }, [authMode, triggerFaceScan]);

  // 📡 SMART_TAG 탭 진입 시 백엔드 NFC/BLE WebSocket 연결 (handleSmartTagDetected 연결체)
  useEffect(() => {
    if (authMode !== 'SMART_TAG') {
      // SMART_TAG 탭 이탈 시 WS 즉시 종료 (Cleanup)
      nfcBleWsRef.current?.close();
      nfcBleWsRef.current = null;
      return;
    }

    const wsUrl = `${WS_BASE_URL}/api/v1/kiosk/ws/nfc-ble?store_cd=${STORE_CODE}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setErrorMsg('NFC/BLE 감지 서버 연결에 실패했습니다. 네트워크를 확인해 주세요.');
      return;
    }

    // Keep-alive ping 30초마다 전송
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 25000);

    ws.onmessage = async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (
          data.event === 'NFC_MEMBER_TAPPED' ||
          data.event === 'NEARBY_MEMBER_DETECTED'
        ) {
          if (data.member_no) {
            // handleSmartTagDetected 연결 완료: member_no 전달 → 백엔드 조회 → 확인 팝업
            await handleSmartTagDetected(data.member_no);
          }
        }
      } catch (e) {
        console.warn('[Smart Auth WS] 파싱 오류:', e);
      }
    };

    ws.onerror = () => setErrorMsg('NFC/BLE 감지 서버 연결 오류가 발생했습니다.');
    nfcBleWsRef.current = ws;

    return () => {
      clearInterval(pingInterval);
      ws.close();
      nfcBleWsRef.current = null;
    };
  }, [authMode, handleSmartTagDetected]);

  return (
    <div 
      className="premium-glass-card" 
      style={{
        width: isSubModal ? '720px' : '940px',
        height: isSubModal ? '900px' : '1120px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        margin: '0 auto',
        padding: isSubModal ? '32px' : '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: isSubModal ? '24px' : '30px',
      }}
    >
      {/* 타이틀 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <User size={isSubModal ? 32 : 40} style={{ color: 'var(--neon-green)' }} />
          <h2 style={{ fontSize: isSubModal ? '28px' : '36px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {faceTerminalEnabled ? '회원 인증 (스마트 태그 / 안면 인식)' : '회원 인증 (스마트 태그)'}
          </h2>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'transform 0.1s ease'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <X size={18} />
          돌아가기
        </button>
      </div>

      {/* 인증 모드 전환 탭 (스마트 태그 vs 안면 인식) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: faceTerminalEnabled ? 'repeat(2, 1fr)' : '1fr', 
        gap: '12px',
        background: 'rgba(0, 0, 0, 0.04)',
        padding: '8px',
        borderRadius: '20px'
      }}>
        <button
          onClick={() => { setAuthMode('SMART_TAG'); setErrorMsg(''); }}
          style={{
            padding: isSubModal ? '16px' : '24px',
            fontSize: isSubModal ? '18px' : '22px',
            fontWeight: 800,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '0.5px solid',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            color: authMode === 'SMART_TAG' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: authMode === 'SMART_TAG' ? '#ffffff' : 'transparent',
            borderColor: authMode === 'SMART_TAG' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
            boxShadow: authMode === 'SMART_TAG' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
          }}
        >
          <Sparkles size={26} style={{ color: authMode === 'SMART_TAG' ? 'var(--neon-green)' : 'inherit' }} />
          📱 스마트폰 태그 (NFC / BLE)
        </button>

        {faceTerminalEnabled && (
          <button
            onClick={() => { setAuthMode('FACE'); setErrorMsg(''); }}
            style={{
              padding: isSubModal ? '16px' : '24px',
              fontSize: isSubModal ? '18px' : '22px',
              fontWeight: 800,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'FACE' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: authMode === 'FACE' ? '#ffffff' : 'transparent',
              borderColor: authMode === 'FACE' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
              boxShadow: authMode === 'FACE' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
            }}
          >
            <Camera size={26} style={{ color: authMode === 'FACE' ? 'var(--neon-green)' : 'inherit' }} />
            안면 인식 인증
          </button>
        )}
      </div>

      {/* 에러 메세지 */}
      {errorMsg && (
        <div 
          className="neon-border-red"
          style={{ 
            background: 'rgba(239, 68, 68, 0.08)', 
            padding: '16px', 
            borderRadius: '12px', 
            textAlign: 'center',
            color: '#fca5a5',
            fontSize: '18px',
            fontWeight: 700
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 탭 콘텐츠 영역 (고정 높이 적용으로 탭 전환 시 높낮이/헤더 흔들림 완벽 방지) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        {/* 0. 안면 인식 가상 카메라 패널 (프리미엄 리뉴얼) */}
        {authMode === 'FACE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center' }}>
          
          {/* 거대 스캐너 메인 뷰 (640x640 정방형, Apple Face ID + Sci-Fi 무드) */}
          <div 
            className="premium-glass-card"
            style={{
              width: isSubModal ? '440px' : '640px',
              height: isSubModal ? '440px' : '640px',
              background: 'radial-gradient(circle, rgba(20, 20, 24, 0.95) 0%, rgba(4, 5, 7, 0.98) 100%)',
              borderRadius: '40px',
              border: `2px solid ${faceMatchResult ? 'var(--neon-green)' : 'rgba(255, 255, 255, 0.05)'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceMatchResult 
                ? '0 0 40px rgba(52, 199, 89, 0.2), inset 0 0 80px rgba(52, 199, 89, 0.1)' 
                : '0 24px 60px rgba(0, 0, 0, 0.6), inset 0 0 40px rgba(0, 113, 227, 0.05)',
              transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          >
            {/* 4개의 사이버틱 코너 마커 */}
            {[
              { top: '30px', left: '30px', borderTop: '4px solid', borderLeft: '4px solid' },
              { top: '30px', right: '30px', borderTop: '4px solid', borderRight: '4px solid' },
              { bottom: '30px', left: '30px', borderBottom: '4px solid', borderLeft: '4px solid' },
              { bottom: '30px', right: '30px', borderBottom: '4px solid', borderRight: '4px solid' }
            ].map((pos, idx) => (
              <div 
                key={idx}
                style={{
                  position: 'absolute',
                  width: '60px',
                  height: '60px',
                  borderColor: faceMatchResult ? 'var(--neon-green)' : 'var(--neon-indigo)',
                  boxShadow: faceMatchResult ? '0 0 16px var(--neon-green-glow)' : 'none',
                  borderRadius: '12px',
                  opacity: faceScanning && !faceMatchResult ? 0.8 : 0.4,
                  transition: 'all 0.3s ease',
                  ...pos
                }}
              />
            ))}

            {/* 정중앙 스캔 가이드 & 카메라 아이콘 */}
            <div 
              style={{
                width: isSubModal ? '240px' : '320px',
                height: isSubModal ? '240px' : '320px',
                border: `2px dashed ${faceMatchResult ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '50%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                zIndex: 2,
              }}
            >
              <Camera 
                size={72} 
                style={{ 
                  color: faceMatchResult ? 'var(--neon-green)' : (faceScanning ? 'var(--neon-indigo)' : 'var(--text-secondary)'),
                  filter: faceMatchResult ? 'drop-shadow(0 0 12px var(--neon-green))' : 'none',
                  transition: 'all 0.3s ease',
                  opacity: faceMatchResult ? 0 : 1 // 매칭 성공시 카메라 사라짐
                }} 
              />
              
              {/* 스캔 빔 애니메이션 (빛 번짐 레이저) */}
              {faceScanning && !faceMatchResult && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '180%',
                    height: '4px',
                    background: 'linear-gradient(90deg, transparent, var(--neon-indigo), transparent)',
                    boxShadow: '0 0 20px 4px var(--neon-indigo-glow)',
                    top: '0%',
                    left: '-40%',
                    animation: 'face-scanner 2s infinite cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: 0.8
                  }}
                />
              )}
            </div>
            
            <p style={{ 
              marginTop: isSubModal ? '30px' : '40px', 
              fontSize: isSubModal ? '20px' : '24px', 
              color: faceMatchResult ? 'var(--neon-green)' : 'var(--text-secondary)', 
              fontWeight: 800,
              letterSpacing: '1px',
              zIndex: 2
            }}>
              {faceScanning && !faceMatchResult ? `단말기 정면을 응시해 주세요 (${faceCountdown}초)` : '정면을 응시해 주세요'}
            </p>

            {/* 매칭 결과 축하(Pop-up) 햅틱 레이어 */}
            {faceMatchResult && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(4, 5, 7, 0.95) 80%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '20px',
                  zIndex: 10,
                  animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
              >
                <div style={{
                  width: '140px',
                  height: '140px',
                  background: 'var(--neon-green)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 40px var(--neon-green-glow)'
                }}>
                  <Sparkles size={72} color="#ffffff" />
                </div>
                <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', marginTop: '10px' }}>
                  안면 매칭 성공!
                </h3>
                <p style={{ fontSize: '24px', color: 'var(--neon-green)', fontWeight: 700 }}>
                  {faceMatchResult.member_name} 회원 ({faceMatchResult.member_no})
                </p>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>잠시 후 자동으로 로그인됩니다...</p>
              </div>
            )}
          </div>

          {/* 재시도 버튼 */}
          {!faceScanning && !faceMatchResult && (
            <button
              onClick={triggerFaceScan}
              className="kiosk-btn kiosk-btn-primary"
              style={{
                width: isSubModal ? '440px' : '640px',
                height: isSubModal ? '70px' : '80px',
                borderRadius: '20px',
                fontSize: isSubModal ? '20px' : '24px',
                fontWeight: 800,
                display: 'flex',
                gap: '12px',
                background: 'rgba(0, 113, 227, 0.1)',
                color: 'var(--neon-indigo)',
                border: '1px solid rgba(0, 113, 227, 0.3)',
                boxShadow: 'none'
              }}
            >
              <Camera size={28} />
              다시 안면인식 시도
            </button>
          )}
        </div>
      )}

      {/* 1. 스마트폰 NFC / BLE 비접촉 태그 패널 (Apple Light Glass Theme) */}
      {authMode === 'SMART_TAG' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '10px 0', width: '100%' }}>
          {/* 비접촉 태그 메인 뷰 카드 (Apple Frosted Light Glass) */}
          <div 
            style={{
              width: isSubModal ? '480px' : '680px',
              height: isSubModal ? '340px' : '400px',
              background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
              borderRadius: '32px',
              border: '1.5px solid rgba(16, 185, 129, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
              gap: '20px',
              padding: '30px'
            }}
          >
            {/* 애플 호흡(Breathe Glow) 파동 서클 (Light Green Theme) */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div 
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.05))',
                  border: '2px solid #10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 35px rgba(16, 185, 129, 0.25)',
                  animation: 'pulse 2.5s infinite ease-in-out'
                }}
              >
                <Smartphone size={56} style={{ color: '#059669', filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.5))' }} />
              </div>
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>
                스마트폰을 대거나 <span style={{ color: '#059669', fontWeight: 900 }}>[스마트 체크인]</span>을 눌러주세요
              </h3>
              <div style={{ fontSize: '17px', color: '#334155', fontWeight: 600, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>• <b>안드로이드</b>: 골포스 앱 실행 후 하단 리더기에 폰 탭 (NFC)</span>
                <span>• <b>아이폰</b>: 골포스 앱 실행 ➔ <b style={{ color: '#059669' }}>[스마트 체크인]</b> 터치 (BLE)</span>
              </div>
            </div>
          </div>

          {/* 테스트 및 시뮬레이션용 빠른 태그 도구 (개발 환경 전용 격리) */}
          {import.meta.env.DEV && (
            <div 
              style={{ 
                width: isSubModal ? '480px' : '680px', 
                padding: '16px 20px', 
                borderRadius: '20px',
                background: 'rgba(241, 245, 249, 0.9)',
                border: '1px solid #CBD5E1',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#475569', letterSpacing: '0.5px' }}>
                  DEBUG SIMULATOR
                </span>
                <span style={{ fontSize: '12px', color: '#059669', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  DEV ONLY
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <button 
                  onClick={() => setDetectedMember({
                    member_no: 'M260501',
                    member_name: '김골프',
                    masked_name: '김*프',
                    hp: '010-1234-5678',
                    email: 'golf@example.com',
                    member_grade: 'REGULAR',
                    status_cd: 'ACTIVE'
                  })}
                  style={{ 
                    fontSize: '15px', 
                    fontWeight: 800,
                    padding: '12px', 
                    background: '#ffffff', 
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '12px',
                    color: '#0F172A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={18} color="#059669" /> 안드로이드 NFC (김골프)
                </button>
                <button 
                  onClick={() => setDetectedMember({
                    member_no: 'M260502',
                    member_name: '이프로',
                    masked_name: '이*로',
                    hp: '010-9876-5432',
                    email: 'pro@example.com',
                    member_grade: 'VIP',
                    status_cd: 'ACTIVE'
                  })}
                  style={{ 
                    fontSize: '15px', 
                    fontWeight: 800,
                    padding: '12px', 
                    background: '#ffffff', 
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '12px',
                    color: '#0F172A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Radio size={18} color="#059669" /> 아이폰 BLE (이프로)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* 3번 방어선: 1초 회원 이름 확인 팝업 모달 (Apple Light System Dialog Portal) */}
      {detectedMember && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            margin: 0,
            padding: 0
          }}
        >
          <div 
            style={{
              width: '520px',
              padding: '40px 32px',
              borderRadius: '28px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '22px',
              background: 'rgba(255, 255, 255, 0.94)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 1)',
              animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Apple Pay 성공 뱃지 스타일 서클 */}
            <div 
              style={{ 
                width: '76px', 
                height: '76px', 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 10px 25px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Sparkles size={40} style={{ color: '#ffffff' }} />
            </div>

            <div>
              <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                <span style={{ color: '#059669', fontWeight: 900 }}>
                  [{detectedMember.masked_name || detectedMember.member_name}]
                </span> 회원님
              </h3>
              <p style={{ fontSize: '19px', color: '#475569', fontWeight: 600 }}>
                본인이 맞으신가요?
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', width: '100%', marginTop: '6px' }}>
              <button
                onClick={() => setDetectedMember(null)}
                style={{
                  height: '56px',
                  borderRadius: '16px',
                  fontSize: '17px',
                  fontWeight: 700,
                  background: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                아니오 (취소)
              </button>
              <button
                onClick={() => {
                  const target = detectedMember;
                  setDetectedMember(null);
                  onAuthSuccess(target);
                }}
                style={{
                  height: '56px',
                  borderRadius: '16px',
                  fontSize: '19px',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                예, 맞습니다!
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 신규 즉석 회원가입 유도 영역 */}
      {onSignUpClick && (
        <div 
          className="glass-panel" 
          style={{ 
            marginTop: '20px', 
            padding: '24px', 
            borderRadius: '16px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            border: '1.5px dashed rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.02)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>아직 회원이 아니신가요?</span>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              골포스 앱을 다운로드 받아 스마트 체크인을 이용해보세요.
            </p>
          </div>
          <button
            onClick={onSignUpClick}
            className="kiosk-btn kiosk-btn-success animate-pulse-glow"
            style={{ 
              height: '56px', 
              fontSize: '18px', 
              fontWeight: 800, 
              padding: '0 30px', 
              borderRadius: '10px'
            }}
          >
            30초 신규 회원가입
          </button>
        </div>
      )}
    </div>
  );
};
