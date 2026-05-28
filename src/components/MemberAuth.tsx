import React, { useState } from 'react';
import { Camera, Delete, Phone, QrCode, Search, User, X } from 'lucide-react';
import { api, Member } from '../services/api';

interface MemberAuthProps {
  onAuthSuccess: (member: Member) => void;
  onCancel: () => void;
  onSignUpClick?: () => void;
}

export const MemberAuth: React.FC<MemberAuthProps> = ({ onAuthSuccess, onCancel, onSignUpClick }) => {
  const [authMode, setAuthMode] = useState<'PHONE' | 'QR'>('PHONE');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [qrSimulationResult, setQrSimulationResult] = useState<string | null>(null);

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
  const handleSearch = async () => {
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
      }
    } catch {
      setErrorMsg('서버와 통신하는 도중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  // QR 스캔 모사 핸들러 (테스트 시뮬레이션용)
  const simulateQrScan = async (sampleQr: string) => {
    setIsSearching(true);
    setErrorMsg('');
    setQrSimulationResult(sampleQr);

    setTimeout(async () => {
      try {
        const member = await api.getMember(sampleQr);
        if (member) {
          onAuthSuccess(member);
        } else {
          setErrorMsg('유효하지 않거나 만료된 QR 코드입니다.');
          setQrSimulationResult(null);
        }
      } catch {
        setErrorMsg('QR 인증 처리 중 서버 에러가 발생했습니다.');
        setQrSimulationResult(null);
      } finally {
        setIsSearching(false);
      }
    }, 1200); // 1.2초간 가상 스캔 딜레이 바디
  };

  return (
    <div 
      className="glass-panel glass-panel-glow" 
      style={{
        width: '900px',
        margin: '40px auto',
        padding: '50px',
        display: 'flex',
        flexDirection: 'column',
        gap: '40px',
        border: '1px solid rgba(255,255,255,0.12)'
      }}
    >
      {/* 타이틀 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <User size={36} style={{ color: 'var(--neon-indigo)' }} />
          <h2 style={{ fontSize: '32px', fontWeight: 900 }}>회원인증 (QR / 휴대폰번호)</h2>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--neon-red)',
            padding: '12px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={24} />
        </button>
      </div>

      {/* 인증 모드 전환 탭 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <button
          onClick={() => { setAuthMode('PHONE'); setErrorMsg(''); }}
          style={{
            padding: '24px',
            fontSize: '24px',
            fontWeight: 800,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '1px solid',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: authMode === 'PHONE' ? '#fff' : 'var(--text-secondary)',
            background: authMode === 'PHONE' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
            borderColor: authMode === 'PHONE' ? 'var(--neon-indigo)' : 'var(--glass-border)',
            boxShadow: authMode === 'PHONE' ? '0 0 20px var(--neon-indigo-glow)' : 'none'
          }}
        >
          <Phone size={24} />
          휴대폰 번호 입력
        </button>

        <button
          onClick={() => { setAuthMode('QR'); setErrorMsg(''); }}
          style={{
            padding: '24px',
            fontSize: '24px',
            fontWeight: 800,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '1px solid',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: authMode === 'QR' ? '#fff' : 'var(--text-secondary)',
            background: authMode === 'QR' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'var(--bg-secondary)',
            borderColor: authMode === 'QR' ? 'var(--neon-indigo)' : 'var(--glass-border)',
            boxShadow: authMode === 'QR' ? '0 0 20px var(--neon-indigo-glow)' : 'none'
          }}
        >
          <QrCode size={24} />
          QR 코드 리더 스캔
        </button>
      </div>

      {/* 에러 메세지 */}
      {errorMsg && (
        <div 
          className="neon-border-red"
          style={{ 
            background: 'rgba(239, 68, 68, 0.15)', 
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

      {/* 1. 휴대폰 번호 키패드 패널 */}
      {authMode === 'PHONE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center' }}>
          {/* 번호 표시창 */}
          <div 
            style={{
              width: '480px',
              height: '84px',
              background: '#0a0d14',
              border: '2px solid var(--bg-tertiary)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              fontWeight: 800,
              color: phoneNumber ? '#fff' : 'var(--text-muted)',
              letterSpacing: '2px',
              boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)'
            }}
          >
            {phoneNumber ? formatPhoneNumber(phoneNumber) : '010-0000-0000'}
          </div>

          {/* 가상 키패드 그리드 */}
          <div className="virtual-keypad" style={{ width: '480px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
              <button key={n} onClick={() => handleNumClick(n)} className="keypad-btn">{n}</button>
            ))}
            <button onClick={handleClear} className="keypad-btn" style={{ fontSize: '20px', color: 'var(--neon-amber)', fontWeight: 800 }}>전체지움</button>
            <button onClick={() => handleNumClick('0')} className="keypad-btn">0</button>
            <button onClick={handleBackspace} className="keypad-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Delete size={28} />
            </button>
          </div>

          {/* 조회 버튼 */}
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="kiosk-btn kiosk-btn-primary"
            style={{
              width: '480px',
              height: '80px',
              borderRadius: '16px',
              fontSize: '26px',
              fontWeight: 800,
              display: 'flex',
              gap: '12px'
            }}
          >
            <Search size={28} />
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
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>아직 LocalMaster 회원이 아니신가요?</span>
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
