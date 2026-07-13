import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ShieldAlert, Sparkles, UserPlus, X, Camera } from 'lucide-react';
import { api, Member } from '../services/api';
import { VirtualKeyboard } from './VirtualKeyboard';

interface MemberRegisterProps {
  onRegisterSuccess: (member: Member) => void;
  onCancel: () => void;
}

// 🌐 Pure Utility Helper (컴포넌트 외부 배치하여 불필요한 재생성 방지)
const formatPhoneNumber = (num: string) => {
  const cleaned = num.replace(/[^0-9]/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
};

export const MemberRegister: React.FC<MemberRegisterProps> = ({ onRegisterSuccess, onCancel }) => {
  const [name, setName] = useState('');
  const [hp, setHp] = useState('');

  const [agree, setAgree] = useState(false);

  // 입력 활성화 포커스 제어
  const [activeField, setActiveField] = useState<'NAME' | 'HP' | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 안면 등록 관련 단계 상태
  const [isFaceEnrollStep, setIsFaceEnrollStep] = useState(false);
  const [faceCapturing, setFaceCapturing] = useState(false);
  const [faceCaptured, setFaceCaptured] = useState(false);

  // 🛡️ 비동기 타이머 해제를 위한 Refs
  const captureTimeoutRef = useRef<any>(null);

  // 🛡️ 컴포넌트 언마운트 시점에 촬영 타이머 강제 클린업
  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
    };
  }, []);

  // 휴대폰 번호 입력을 위한 텐키 콤팩트 키패드 클릭 핸들러
  const handleNumClick = (num: string) => {
    setErrorMsg('');
    if (hp.length >= 11) return;
    setHp(prev => prev + num);
  };

  const handleBackspace = () => {
    setHp(prev => prev.slice(0, -1));
  };

  // 회원가입 1차 입력 제출 (안면 등록 단계로 진입)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('이름을 입력해 주세요.');
      return;
    }
    if (hp.length < 10) {
      setErrorMsg('올바른 휴대폰 번호를 입력해 주세요.');
      return;
    }

    if (!agree) {
      setErrorMsg('개인정보 수집 및 키오스크 이용약관에 동의해 주세요.');
      return;
    }

    // 안면 등록 단계 활성화
    setIsFaceEnrollStep(true);
  };

  // 안면 등록 캡처 수행 (useCallback & Ref 결합)
  const triggerFaceCapture = useCallback(() => {
    setFaceCapturing(true);
    setFaceCaptured(false);
    
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);

    // 2초 가상 카메라 촬영 모사
    captureTimeoutRef.current = setTimeout(() => {
      setFaceCapturing(false);
      setFaceCaptured(true);
    }, 2000);
  }, []);

  // 최종 회원 가입 완료 (useCallback)
  const handleFinalRegister = useCallback(async (faceReg: boolean) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const formattedHp = formatPhoneNumber(hp);
      const faceVectorId = faceReg ? `FACE_${hp.replace(/[^0-9]/g, '')}` : null;
      
      const res = await api.registerMember(name, formattedHp, '', faceReg, faceVectorId);
      if (res.success && res.member) {
        onRegisterSuccess(res.member);
      } else {
        setErrorMsg(res.message);
        setIsFaceEnrollStep(false);
      }
    } catch {
      setErrorMsg('회원가입 요청 처리 중 서버 통신 에러가 발생했습니다.');
      setIsFaceEnrollStep(false);
    } finally {
      setLoading(false);
    }
  }, [name, hp, onRegisterSuccess]);

  return (
    <div 
      className="glass-panel glass-panel-glow" 
      style={{
        width: '900px',
        margin: '20px auto',
        padding: '40px 50px',
        display: 'flex',
        flexDirection: 'column',
        gap: '30px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 타이틀 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UserPlus size={34} style={{ color: 'var(--neon-green)' }} />
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 900 }}>무인 스튜디오 30초 즉석 회원가입</h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              간단한 기본 정보 입력 후 정기권 회원 혜택과 타석 예약을 시작하세요.
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '8px 16px',
            borderRadius: '10px',
            cursor: 'pointer'
          }}
        >
          취소
        </button>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} style={{ color: 'var(--neon-red)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
        </div>
      )}

      {/* 회원가입 폼 및 안면 등록 단계 조건부 렌더링 */}
      {isFaceEnrollStep ? (
        /* 안면 정보 등록 UI */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>[단계 2/2] 페이스 ID 안면 등록</h3>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              무인 기기 입장 시 신속한 본인 확인을 위해 페이스 ID 정보를 등록합니다.
            </p>
          </div>

          {/* 가상 카메라 캡처 박스 */}
          <div
            style={{
              width: '480px',
              height: '320px',
              background: '#020305',
              borderRadius: '24px',
              border: `2px solid ${faceCaptured ? 'var(--neon-green)' : 'var(--neon-indigo)'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceCaptured 
                ? '0 0 25px rgba(16, 185, 129, 0.2)' 
                : '0 0 25px rgba(99, 102, 241, 0.15)',
              transition: 'all 0.3s ease'
            }}
          >
            {/* 가이드 타원 */}
            <div
              style={{
                width: '160px',
                height: '210px',
                border: `2.5px ${faceCaptured ? 'solid var(--neon-green)' : 'dashed var(--neon-indigo)'}`,
                borderRadius: '50% / 40%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: faceCaptured ? '0 0 20px var(--neon-green-glow)' : 'none',
                transition: 'all 0.3s ease'
              }}
            >
              {faceCapturing ? (
                <div style={{ fontSize: '15px', color: 'var(--neon-indigo)', fontWeight: 800 }}>분석 중...</div>
              ) : (
                <Camera size={38} style={{ color: faceCaptured ? 'var(--neon-green)' : 'var(--neon-indigo)' }} />
              )}

              {/* 캡처 진행 시 로딩 애니메이션 */}
              {faceCapturing && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '4px',
                    backgroundColor: 'var(--neon-indigo)',
                    boxShadow: '0 0 10px var(--neon-indigo-glow)',
                    top: '10%',
                    animation: 'face-scanner 2s infinite ease-in-out'
                  }}
                />
              )}
            </div>

            <p style={{ marginTop: '16px', fontSize: '16px', color: faceCaptured ? 'var(--neon-green)' : 'var(--text-secondary)', fontWeight: 700 }}>
              {faceCaptured 
                ? '안면 정보 캡처 성공! 가입을 완료해 주세요.' 
                : (faceCapturing ? '얼굴 스캔 중... 움직이지 마세요.' : '얼굴을 가이드라인 영역에 맞춰주세요')}
            </p>

            {faceCaptured && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(10, 12, 16, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <Check size={48} style={{ color: 'var(--neon-green)' }} />
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--neon-green)' }}>안면 캡처 완료</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '480px' }}>
            {/* 촬영 트리거 버튼 */}
            {!faceCaptured && (
              <button
                type="button"
                onClick={triggerFaceCapture}
                disabled={faceCapturing}
                className="kiosk-btn kiosk-btn-primary"
                style={{ height: '60px', fontSize: '18px', fontWeight: 800 }}
              >
                {faceCapturing ? '안면 데이터 추출 중...' : '안면 촬영 (페이스 ID 등록)'}
              </button>
            )}

            {/* 최종 가입완료 / 건너뛰기 액션 버튼 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', width: '100%' }}>
              <button
                type="button"
                onClick={() => handleFinalRegister(false)}
                disabled={loading}
                className="kiosk-btn"
                style={{ height: '56px', fontSize: '16px', fontWeight: 800, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}
              >
                등록 건너뛰기
              </button>

              <button
                type="button"
                onClick={() => handleFinalRegister(true)}
                disabled={loading || !faceCaptured}
                className="kiosk-btn kiosk-btn-success"
                style={{ height: '56px', fontSize: '16px', fontWeight: 800 }}
              >
                {loading ? '가입 처리 중...' : '안면 등록 가입'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setIsFaceEnrollStep(false); setFaceCaptured(false); }}
              style={{ fontSize: '14px', color: 'var(--text-muted)', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline', marginTop: '10px' }}
            >
              이전 단계(정보 수정)로 돌아가기
            </button>
          </div>
        </div>
      ) : (
        /* 회원가입 1단계: 기본 정보 입력 폼 */
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '40px' }}>
          
          {/* 좌측: 이름 / 휴대폰 / 이메일 등 입력 상자 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 이름 입력 필드 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' }}>이름 (실명 입력)</label>
              <input
                type="text"
                readOnly
                onClick={() => setActiveField('NAME')}
                value={name}
                placeholder="여기를 터치하여 이름을 입력하세요"
                style={{
                  width: '100%',
                  height: '64px',
                  borderRadius: '12px',
                  border: `2px solid ${activeField === 'NAME' ? 'var(--neon-indigo)' : 'var(--bg-tertiary)'}`,
                  background: '#0a0d14',
                  color: '#fff',
                  fontSize: '20px',
                  fontWeight: 700,
                  padding: '0 20px',
                  boxShadow: activeField === 'NAME' ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                  cursor: 'pointer'
                }}
              />
            </div>



            {/* 개인정보 이용 동의 */}
            <div 
              onClick={() => setAgree(!agree)}
              className="glass-panel"
              style={{ 
                padding: '20px', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '12px',
                cursor: 'pointer',
                border: `1.5px solid ${agree ? 'var(--neon-green)' : 'var(--glass-border)'}`,
                background: agree ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
                transition: 'all 0.15s ease',
                marginTop: '10px'
              }}
            >
              <div 
                style={{ 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '6px', 
                  border: `2px solid ${agree ? 'var(--neon-green)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: agree ? 'var(--neon-green)' : 'transparent',
                  color: '#fff',
                  marginTop: '2px'
                }}
              >
                {agree && <Check size={16} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: agree ? '#fff' : 'var(--text-secondary)' }}>
                  [필수] 개인정보 수집 및 키오스크 이용약관 동의
                </span>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  무인 시설 입장 바코드 생성, 타석 배정 예약 정보의 알림톡 발송을 위해 이름과 연락처 수집에 동의해 주셔야 가입이 가능합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 우측: 휴대폰 입력 전용 콤팩트 키패드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>
                휴대폰 번호 입력
              </label>
              <div 
                style={{
                  width: '100%',
                  height: '64px',
                  background: '#0a0d14',
                  border: '2px solid var(--bg-tertiary)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: hp ? '#fff' : 'var(--text-muted)',
                  letterSpacing: '1px'
                }}
              >
                {hp ? formatPhoneNumber(hp) : '010-0000-0000'}
              </div>
            </div>

            {/* 콤팩트 텐키 그리드 */}
            <div 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '10px', 
                width: '100%' 
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button 
                  type="button" 
                  key={n} 
                  onClick={() => handleNumClick(n)} 
                  style={{ height: '64px', fontSize: '22px', borderRadius: '10px' }}
                  className="keypad-btn"
                >
                  {n}
                </button>
              ))}
              <button 
                type="button" 
                onClick={() => setHp('')} 
                style={{ height: '64px', fontSize: '15px', color: 'var(--neon-amber)', borderRadius: '10px' }} 
                className="keypad-btn"
              >
                지움
              </button>
              <button 
                type="button" 
                onClick={() => handleNumClick('0')} 
                style={{ height: '64px', fontSize: '22px', borderRadius: '10px' }}
                className="keypad-btn"
              >
                0
              </button>
              <button 
                type="button" 
                onClick={handleBackspace} 
                style={{ height: '64px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }} 
                className="keypad-btn"
              >
                ←
              </button>
            </div>

            {/* 가입 완료 최종 제출 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="kiosk-btn kiosk-btn-success animate-pulse-glow"
              style={{
                width: '100%',
                height: '75px',
                borderRadius: '12px',
                fontSize: '22px',
                fontWeight: 800,
                display: 'flex',
                gap: '8px',
                marginTop: '10px'
              }}
            >
              <Sparkles size={20} />
              {loading ? '가입 처리 중...' : '다음 단계 (안면 등록)'}
            </button>
          </div>

        </form>
      )}

      {/* 하단 가상 키보드 영역 바인딩 (이름 입력 활성화 시 스르륵 올라옴) */}
      {!isFaceEnrollStep && activeField === 'NAME' && (
        <VirtualKeyboard
          value={name}
          onChange={(val) => setName(val)}
          onClose={() => setActiveField(null)}
        />
      )}
    </div>
  );
};
