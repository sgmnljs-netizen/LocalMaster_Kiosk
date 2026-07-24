import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Delete, Phone, QrCode, Search, User, X, Sparkles } from 'lucide-react';
import { api, Member } from '../services/api';

interface MemberAuthProps {
  initialAuthMode?: 'PHONE' | 'QR' | 'FACE';
  onAuthSuccess: (member: Member) => void;
  onCancel: () => void;
  onSignUpClick?: () => void;
  onAuthError?: (code: string, detail: string) => void;
}

export const MemberAuth: React.FC<MemberAuthProps> = ({ 
  initialAuthMode = 'PHONE', 
  onAuthSuccess, 
  onCancel, 
  onSignUpClick,
  onAuthError
}) => {
  const [authMode, setAuthMode] = useState<'PHONE' | 'QR' | 'FACE'>(initialAuthMode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [qrSimulationResult, setQrSimulationResult] = useState<string | null>(null);
  
  // 안면 인식 관련 추가 상태
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceMatchResult, setFaceMatchResult] = useState<Member | null>(null);

  // 🛡️ 비동기 타이머 메모리 누수 방지용 refs
  const faceScanTimeoutRef = useRef<any>(null);
  const qrScanTimeoutRef = useRef<any>(null);
  const authTimeoutRef = useRef<any>(null);

  // 휴대폰 번호 키패드 클릭 핸들러
  const handleNumClick = (num: string) => {
    setErrorMsg('');
    if (phoneNumber.length >= 11) return;
    const nextNum = phoneNumber + num;
    setPhoneNumber(nextNum);
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMsg('');
    setPhoneNumber('');
  };

  // 휴대폰 번호 포맷팅 (010-1234-5678)
  const formatPhoneNumber = (num: string) => {
    const cleaned = num.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 회원 번호 조회 실행
  const handleSearch = useCallback(async () => {
    if (phoneNumber.length < 9) {
      setErrorMsg('휴대폰 번호를 올바르게 입력해주세요.');
      return;
    }
    
    setIsSearching(true);
    setErrorMsg('');

    try {
      const formatted = formatPhoneNumber(phoneNumber);
      const member = await api.getMember(formatted);
      
      if (member) {
        onAuthSuccess(member);
      } else {
        setErrorMsg('등록되지 않은 회원 정보입니다. 번호를 확인해주세요.');
        if (onAuthError) {
          onAuthError('ERR_MEMBER_NOT_FOUND', `${formatted} 휴대폰 번호로 등록된 회원 정보가 존재하지 않습니다.`);
        }
      }
    } catch {
      setErrorMsg('서버와 통신하는 도중 오류가 발생했습니다.');
      if (onAuthError) {
        onAuthError('ERR_NETWORK_DISCONNECTED', '서버와 통신 중 장애가 발생하여 회원 조회를 완료할 수 없습니다.');
      }
    } finally {
      setIsSearching(false);
    }
  }, [phoneNumber, onAuthSuccess, onAuthError]);

  // QR 스캔 모사 핸들러 (테스트 시뮬레이션용)
  const simulateQrScan = useCallback(async (sampleQr: string) => {
    setIsSearching(true);
    setErrorMsg('');
    setQrSimulationResult(sampleQr);

    if (qrScanTimeoutRef.current) clearTimeout(qrScanTimeoutRef.current);

    qrScanTimeoutRef.current = setTimeout(async () => {
      try {
        const member = await api.getMember(sampleQr);
        if (member) {
          onAuthSuccess(member);
        } else {
          setErrorMsg('유효하지 않거나 만료된 QR 코드입니다.');
          setQrSimulationResult(null);
          if (onAuthError) {
            onAuthError('ERR_QR_EXPIRED', `QR코드 [${sampleQr}] 가 존재하지 않거나 유효시간이 초과되었습니다.`);
          }
        }
      } catch {
        setErrorMsg('QR 인증 처리 중 서버 에러가 발생했습니다.');
        setQrSimulationResult(null);
        if (onAuthError) {
          onAuthError('ERR_NETWORK_DISCONNECTED', '네트워크 통신 불안정으로 QR 인증에 실패했습니다.');
        }
      } finally {
        setIsSearching(false);
      }
    }, 1200); // 1.2초간 가상 스캔 딜레이 바디
  }, [onAuthSuccess, onAuthError]);

  // 안면 인식 트리거
  const triggerFaceScan = useCallback(async () => {
    setFaceScanning(true);
    setFaceMatchResult(null);
    setErrorMsg('');

    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);

    try {
      const member = await api.scanFace();
      if (member) {
        setFaceMatchResult(member);
        // 1초 후 로그인 처리 완료 통과
        authTimeoutRef.current = setTimeout(() => {
          onAuthSuccess(member);
        }, 1200);
      } else {
        setErrorMsg('등록된 안면 정보가 없습니다. 휴대폰 번호 또는 QR 인증을 진행해 주세요.');
        setFaceScanning(false);
      }
    } catch {
      setErrorMsg('안면인식 장치 응답 지연이 발생했습니다.');
      setFaceScanning(false);
      if (onAuthError) {
        onAuthError('ERR_HARDWARE_TIMEOUT', '안면인식 스캔 모듈로부터 데이터를 수신하는 데 실패했습니다. 응답 타임아웃.');
      }
    }
  }, [onAuthSuccess, onAuthError]);

  // 🛡️ 컴포넌트 언마운트 시 또는 authMode 전환 시 타이머 전면 클린업
  useEffect(() => {
    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
    if (qrScanTimeoutRef.current) clearTimeout(qrScanTimeoutRef.current);
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);

    if (authMode === 'FACE') {
      triggerFaceScan();
    } else {
      setFaceScanning(false);
      setFaceMatchResult(null);
    }

    return () => {
      if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
      if (qrScanTimeoutRef.current) clearTimeout(qrScanTimeoutRef.current);
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
    };
  }, [authMode, triggerFaceScan]);

  return (
    <div 
      className="premium-glass-card" 
      style={{
        width: '940px',
        margin: '20px auto',
        padding: '60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '40px',
      }}
    >
      {/* 타이틀 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <User size={40} style={{ color: 'var(--neon-green)' }} />
          <h2 style={{ fontSize: '36px', fontWeight: 900, color: 'var(--text-primary)' }}>회원 인증 (안면/휴대폰/QR)</h2>
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

      {/* 인증 모드 전환 탭 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '8px',
        background: 'rgba(0, 0, 0, 0.04)',
        padding: '8px',
        borderRadius: '20px'
      }}>
        <button
          onClick={() => { setAuthMode('FACE'); setErrorMsg(''); }}
          style={{
            padding: '24px',
            fontSize: '22px',
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

        <button
          onClick={() => { setAuthMode('PHONE'); setErrorMsg(''); }}
          style={{
            padding: '24px',
            fontSize: '22px',
            fontWeight: 800,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '0.5px solid',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            color: authMode === 'PHONE' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: authMode === 'PHONE' ? '#ffffff' : 'transparent',
            borderColor: authMode === 'PHONE' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
            boxShadow: authMode === 'PHONE' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
          }}
        >
          <Phone size={26} style={{ color: authMode === 'PHONE' ? 'var(--neon-green)' : 'inherit' }} />
          휴대폰 번호 입력
        </button>

        <button
          onClick={() => { setAuthMode('QR'); setErrorMsg(''); }}
          style={{
            padding: '24px',
            fontSize: '22px',
            fontWeight: 800,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '0.5px solid',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            color: authMode === 'QR' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: authMode === 'QR' ? '#ffffff' : 'transparent',
            borderColor: authMode === 'QR' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
            boxShadow: authMode === 'QR' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
          }}
        >
          <QrCode size={26} style={{ color: authMode === 'QR' ? 'var(--neon-green)' : 'inherit' }} />
          QR 코드 스캔
        </button>
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

      {/* 0. 안면 인식 가상 카메라 패널 (프리미엄 리뉴얼) */}
      {authMode === 'FACE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center' }}>
          
          {/* 거대 스캐너 메인 뷰 (640x640 정방형, Apple Face ID + Sci-Fi 무드) */}
          <div 
            className="premium-glass-card"
            style={{
              width: '640px',
              height: '640px',
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
                width: '320px',
                height: '320px',
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
              marginTop: '40px', 
              fontSize: '24px', 
              color: faceMatchResult ? 'var(--neon-green)' : 'var(--text-secondary)', 
              fontWeight: 800,
              letterSpacing: '1px',
              zIndex: 2
            }}>
              {faceScanning && !faceMatchResult ? '얼굴 스캔 진행 중...' : '정면을 응시해 주세요'}
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
                width: '640px',
                height: '80px',
                borderRadius: '20px',
                fontSize: '24px',
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

          {/* 시뮬레이터 테스트용 가상 회원 매칭 패널 (개발자 모드용 정돈된 UI) */}
          <div style={{ 
            width: '640px', 
            padding: '24px', 
            borderRadius: '24px', 
            background: 'rgba(0, 0, 0, 0.02)',
            border: '1px dashed rgba(0, 0, 0, 0.1)',
            marginTop: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', display: 'inline-block' }} />
              <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '1px' }}>
                DEVELOPER SIMULATION CONTROLS
              </h4>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', display: 'inline-block' }} />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={async () => {
                  setFaceScanning(true);
                  setErrorMsg('');
                  setFaceMatchResult(null);
                  setTimeout(async () => {
                    const member = await api.getMember('M260501');
                    if (member) {
                      setFaceMatchResult(member);
                      setTimeout(() => onAuthSuccess(member), 1500);
                    }
                  }, 2000);
                }}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '18px', padding: '16px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '16px', color: 'var(--text-primary)', fontWeight: 700 }}
              >
                [모사] '김골프' 얼굴 인식 (정상 회원)
              </button>
              <button 
                onClick={async () => {
                  setFaceScanning(true);
                  setErrorMsg('');
                  setFaceMatchResult(null);
                  setTimeout(async () => {
                    const member = await api.getMember('M260502');
                    if (member) {
                      setFaceMatchResult(member);
                      setTimeout(() => onAuthSuccess(member), 1500);
                    }
                  }, 2000);
                }}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '18px', padding: '16px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '16px', color: 'var(--text-primary)', fontWeight: 700 }}
              >
                [모사] '이프로' 얼굴 인식 (VIP 회원)
              </button>
              <button 
                onClick={async () => {
                  setFaceScanning(true);
                  setErrorMsg('');
                  setFaceMatchResult(null);
                  setTimeout(() => {
                    setFaceScanning(false);
                    setErrorMsg('미등록 안면 정보입니다. 회원가입 또는 휴대폰 번호 입력을 사용해주세요.');
                  }, 1500);
                }}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '15px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}
              >
                카메라에 '미등록' 얼굴 인식 모사 (인식 실패)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. 휴대폰 번호 키패드 패널 */}
      {authMode === 'PHONE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center', padding: '10px 0' }}>
          {/* 번호 표시창 */}
          <div 
            style={{
              width: '640px',
              height: '100px',
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '52px',
              fontWeight: 800,
              color: phoneNumber ? 'var(--text-primary)' : 'var(--text-muted)',
              letterSpacing: '3px',
              boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.02)'
            }}
          >
            {phoneNumber ? formatPhoneNumber(phoneNumber) : '010-0000-0000'}
          </div>

          {/* 가상 키패드 그리드 (kiosk_design_system.css 의 .virtual-keypad, .keypad-btn 베이스 사용) */}
          <div className="virtual-keypad" style={{ width: '640px', maxWidth: 'none', gap: '16px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
              <button 
                key={n} 
                onClick={() => handleNumClick(n)} 
                className="keypad-btn"
                style={{ height: '100px', fontSize: '40px', borderRadius: '20px' }}
              >
                {n}
              </button>
            ))}
            <button 
              onClick={handleClear} 
              className="keypad-btn" 
              style={{ height: '100px', fontSize: '22px', color: 'var(--neon-red)', borderRadius: '20px' }}
            >
              전체지움
            </button>
            <button 
              onClick={() => handleNumClick('0')} 
              className="keypad-btn"
              style={{ height: '100px', fontSize: '40px', borderRadius: '20px' }}
            >
              0
            </button>
            <button 
              onClick={handleBackspace} 
              className="keypad-btn" 
              style={{ height: '100px', borderRadius: '20px', color: 'var(--text-secondary)' }}
            >
              <Delete size={36} />
            </button>
          </div>

          {/* 조회 버튼 */}
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="kiosk-btn kiosk-btn-primary"
            style={{
              width: '640px',
              height: '90px',
              borderRadius: '24px',
              fontSize: '28px',
              fontWeight: 800,
              display: 'flex',
              gap: '12px',
              background: 'var(--text-primary)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              border: 'none',
              color: '#fff',
              transition: 'transform 0.2s, opacity 0.2s',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              opacity: isSearching ? 0.7 : 1
            }}
            onMouseDown={(e) => !isSearching && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => !isSearching && (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => !isSearching && (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Search size={32} />
            {isSearching ? '조회 중...' : '회원 인증 조회'}
          </button>
        </div>
      )}

      {/* 2. QR 코드 스캔 프레임 패널 */}
      {authMode === 'QR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center' }}>
          {/* 가상 카메라 뷰 */}
          <div 
            style={{
              width: '480px',
              height: '320px',
              background: '#020305',
              borderRadius: '24px',
              border: '2px solid var(--neon-indigo)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(99, 102, 241, 0.15)'
            }}
          >
            {/* 스캔 가이드 가이드 박스 */}
            <div 
              style={{
                width: '220px',
                height: '220px',
                border: '2px dashed var(--neon-indigo)',
                borderRadius: '16px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Camera size={48} className="animate-blink" style={{ color: 'var(--neon-indigo)' }} />
              {/* 스캔 통과 레이저 모사 */}
              <div 
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'var(--neon-indigo)',
                  boxShadow: '0 0 10px var(--neon-indigo-glow)',
                  top: '50%',
                  animation: 'laser-scan 2s infinite ease-in-out'
                }}
              />
            </div>
            
            <p style={{ marginTop: '16px', fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isSearching ? '스캔 완료! 분석 중...' : '하단 스캐너에 QR코드를 대주세요'}
            </p>

            {qrSimulationResult && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(10, 12, 16, 0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <QrCode size={48} className="glow-text-indigo" />
                <span style={{ fontSize: '20px', fontWeight: 800 }}>QR 스캔 성공: {qrSimulationResult}</span>
              </div>
            )}
          </div>

          {/* 상용 퀄리티 테스트용: 원클릭 QR 모사 도구 */}
          <div className="glass-panel" style={{ width: '480px', padding: '24px', borderRadius: '16px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '14px', textAlign: 'center', color: '#818cf8' }}>
              [시뮬레이터 테스트용 가상 회원 QR 코드]
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={() => simulateQrScan('M260501')}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}
              >
                김골프 회원 (정상 회원권 보유)
              </button>
              <button 
                onClick={() => simulateQrScan('M260502')}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}
              >
                이프로 회원 (VIP 회원)
              </button>
              <button 
                onClick={() => simulateQrScan('M260503')}
                className="kiosk-btn" 
                style={{ width: '100%', fontSize: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)' }}
              >
                박타석 회원 (회원권 만료됨)
              </button>
            </div>
          </div>
        </div>
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
              휴대폰 번호와 이름만으로 30초 만에 즉시 가입하고 이용하실 수 있습니다.
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

      {/* 내부 레이저 애니메이션 스타일 인젝트 */}
      <style>{`
        @keyframes laser-scan {
          0%, 100% { top: 10%; opacity: 0.2; }
          50% { top: 90%; opacity: 1; }
        }
      `}</style>
    </div>
  );
};
