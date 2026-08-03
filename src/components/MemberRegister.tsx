import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ShieldAlert, Sparkles, UserPlus, X, Camera } from 'lucide-react';
import { api, Member } from '../services/api';
import { VirtualKeyboard } from './VirtualKeyboard';

interface MemberRegisterProps {
  onRegisterSuccess: (member: Member) => void;
  onCancel: () => void;
  faceTerminalEnabled?: boolean;
  lang?: 'KO' | 'EN' | 'ko' | 'en';
}

// 🌐 Pure Utility Helper (컴포넌트 외부 배치하여 불필요한 재생성 방지)
const formatPhoneNumber = (num: string) => {
  const cleaned = num.replace(/[^0-9]/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
};

export const MemberRegister: React.FC<MemberRegisterProps> = ({ 
  onRegisterSuccess, 
  onCancel, 
  faceTerminalEnabled = true,
  lang = 'KO' 
}) => {
  const [name, setName] = useState('');
  const [hp, setHp] = useState('');

  const [agree, setAgree] = useState(false);
  const [gender, setGender] = useState<'M' | 'F'>('M');

  // 입력 활성화 포커스 제어
  const [activeField, setActiveField] = useState<'NAME' | 'HP' | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 안면 등록 관련 단계 상태 및 카운트다운
  const [isFaceEnrollStep, setIsFaceEnrollStep] = useState(false);
  const [faceCapturing, setFaceCapturing] = useState(false);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [faceCountdown, setFaceCountdown] = useState(25);
  const [faceImageBase64, setFaceImageBase64] = useState('');

  // 🛡️ 비동기 타이머 & 폴링 해제를 위한 Refs
  const captureCountdownRef = useRef<any>(null);

  const isFetchingRef = useRef<boolean>(false);
  const isFaceEnrollStepRef = useRef<boolean>(isFaceEnrollStep);

  useEffect(() => {
    isFaceEnrollStepRef.current = isFaceEnrollStep;
  }, [isFaceEnrollStep]);

  // 안면 등록 캡처 수행 (Front POS 표준: 자동 캡처 모드 및 실시간 감지 연동)
  const triggerFaceCapture = useCallback(async () => {
    if (isFetchingRef.current || faceCaptured) return;
    isFetchingRef.current = true;
    setFaceCapturing(true);
    setFaceCaptured(false);
    setFaceCountdown(25);
    setErrorMsg('');

    // 1. 25초 카운트다운 타이머 시작 (UI 업데이트 전용)
    if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
    captureCountdownRef.current = setInterval(() => {
      setFaceCountdown(prev => {
        if (prev <= 1) {
          if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 3. 1회성 Long-polling 대기 수신 (최대 25초)
    try {
      const result = await api.detectFaceCamera();
      
      if (!isFaceEnrollStepRef.current) return; // 사용자가 '이전' 버튼 등으로 해당 단계를 벗어난 경우 무시

      // 실제 단말기 카메라에서 안면 감지 성공 시
      if (result.detected) {
        if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
        setFaceCapturing(false);
        setFaceCaptured(true);
        setFaceImageBase64(result.imageBase64);
        setErrorMsg('');
        api.cancelFaceCaptureMode().catch(console.warn);
      } else {
        // Timeout 또는 실패 시
        if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
        setFaceCapturing(false);
        setErrorMsg('단말기 정면에 안면이 감지되지 않았습니다. 카메라를 정면으로 바라보신 후 다시 시도해 주세요.');
        api.cancelFaceCaptureMode().catch(console.warn);
      }
    } catch (err: any) {
      console.warn('Face capture exception:', err);
      if (!isFaceEnrollStepRef.current) return;
      if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
      setFaceCapturing(false);
      setErrorMsg('단말기 안면 캡처 통신 예외가 발생했습니다.');
      api.cancelFaceCaptureMode().catch(console.warn);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // 🛡️ 2단계 진입 시 수동 클릭 없이 자동 스캔 진입 & 모달 이탈 시 단말기 모드 안전 원복
  useEffect(() => {
    if (isFaceEnrollStep) {
      triggerFaceCapture();
    } else {
      if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
      setFaceCapturing(false);
      setFaceCaptured(false);
      isFetchingRef.current = false;
    }

    return () => {
      if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
      api.cancelFaceCaptureMode().catch(console.warn);
    };
  }, [isFaceEnrollStep, triggerFaceCapture]);

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

    // 안면인식 사용 여부에 따라 분기
    if (faceTerminalEnabled) {
      setIsFaceEnrollStep(true);
    } else {
      // 안면인식 미사용 시 2단계를 건너뛰고 바로 가입 완료 처리
      handleFinalRegister(false);
    }
  };

  // 최종 회원 가입 완료 (useCallback)
  const handleFinalRegister = useCallback(async (faceReg: boolean) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const formattedHp = formatPhoneNumber(hp);
      const faceVectorId = faceReg ? `FACE_${hp.replace(/[^0-9]/g, '')}` : null;
      
      const res = await api.registerMember(name, formattedHp, '', faceReg, faceVectorId, gender);
      if (res.success && res.member) {
        if (faceReg) {
          // 프런트포스 표준: 실물 안면 단말기 푸시 동기화 등록 (실제 카메라 캐처 이미지 전달)
          const enrollResult = await api.enrollMemberFace(res.member.member_no, name, faceImageBase64 || undefined);
          if (!enrollResult?.success) {
            console.warn('[Kiosk] 안면 단말기 동기화 실패 (가입은 정상 완료):', enrollResult?.message);
          }
        }
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
  }, [name, hp, gender, faceImageBase64, onRegisterSuccess]);

  return (
    <div 
      style={{
        width: '900px',
        margin: '0 auto',
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '36px',
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* 타이틀 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            background: '#34c759', 
            borderRadius: '50%', 
            width: '56px', height: '56px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(52, 199, 89, 0.3)'
          }}>
            <UserPlus size={28} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>무인 스튜디오 30초 즉석 회원가입</h2>
            <p style={{ fontSize: '17px', color: '#86868b', margin: '4px 0 0 0', fontWeight: 500 }}>
              간단한 기본 정보 입력 후 정기권 회원 혜택과 타석 예약을 시작하세요.
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: '#f5f5f7',
            border: 'none',
            color: '#1d1d1f',
            padding: '12px 24px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#e8e8ed'}
          onMouseOut={(e) => e.currentTarget.style.background = '#f5f5f7'}
        >
          취소
        </button>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div style={{ background: '#fff0f0', padding: '16px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #ffc2c2' }}>
          <ShieldAlert size={20} color="#ff3b30" />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#ff3b30' }}>{errorMsg}</span>
        </div>
      )}

      {/* 회원가입 폼 및 안면 등록 단계 조건부 렌더링 */}
      {isFaceEnrollStep ? (
        /* 안면 정보 등록 UI */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.5px' }}>[단계 2/2] 페이스 ID 안면 등록</h3>
            <p style={{ fontSize: '16px', color: '#86868b', marginTop: '8px', fontWeight: 500 }}>
              무인 기기 입장 시 신속한 본인 확인을 위해 페이스 ID 정보를 등록합니다.
            </p>
          </div>

          {/* 가상 카메라 캡처 박스 */}
          <div
            style={{
              width: '480px',
              height: '320px',
              background: '#f5f5f7',
              borderRadius: '24px',
              border: `2px solid ${faceCaptured ? '#34c759' : '#0071e3'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceCaptured 
                ? '0 0 25px rgba(52, 199, 89, 0.15)' 
                : '0 0 25px rgba(0, 113, 227, 0.1)',
              transition: 'all 0.3s ease'
            }}
          >
            {/* 가이드 타원 */}
            <div
              style={{
                width: '160px',
                height: '210px',
                border: `2.5px ${faceCaptured ? 'solid #34c759' : 'dashed #0071e3'}`,
                borderRadius: '50% / 40%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: faceCaptured ? '0 0 20px rgba(52, 199, 89, 0.3)' : 'none',
                background: '#ffffff',
                transition: 'all 0.3s ease'
              }}
            >
              {faceCapturing ? (
                <div style={{ fontSize: '15px', color: '#0071e3', fontWeight: 700 }}>분석 중...</div>
              ) : (
                <Camera size={38} style={{ color: faceCaptured ? '#34c759' : '#0071e3' }} />
              )}

              {/* 캡처 진행 시 로딩 애니메이션 */}
              {faceCapturing && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#0071e3',
                    boxShadow: '0 0 10px rgba(0, 113, 227, 0.5)',
                    top: '10%',
                    animation: 'face-scanner 2s infinite ease-in-out'
                  }}
                />
              )}
            </div>

            <p style={{ marginTop: '20px', fontSize: '16px', color: faceCaptured ? '#34c759' : '#1d1d1f', fontWeight: 600 }}>
              {faceCaptured 
                ? (lang === 'EN' ? 'Face capture successful! Please complete registration.' : '안면 정보 캡처 성공! 가입을 완료해 주세요.') 
                : (faceCapturing 
                  ? (lang === 'EN' ? `Scanning face... Please hold still (${faceCountdown}s)` : `단말기 정면을 응시해 주세요 (${faceCountdown}초)`) 
                  : (lang === 'EN' ? 'Please face the terminal camera' : '단말기 카메라 정면을 응시해 주세요'))}
            </p>

            {faceCaptured && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ background: '#34c759', borderRadius: '50%', padding: '12px' }}>
                  <Check size={48} color="#ffffff" strokeWidth={3} />
                </div>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f' }}>
                  {lang === 'EN' ? 'Face Capture Completed' : '안면 캡처 완료'}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '480px' }}>
            {/* 촬영/재시도 트리거 버튼 */}
            {!faceCaptured && (
              <button
                type="button"
                onClick={triggerFaceCapture}
                disabled={faceCapturing}
                style={{ 
                  height: '64px', 
                  fontSize: '18px', 
                  fontWeight: 700,
                  borderRadius: '20px',
                  background: '#0071e3',
                  color: '#ffffff',
                  border: 'none',
                  cursor: faceCapturing ? 'not-allowed' : 'pointer',
                  opacity: faceCapturing ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(0, 113, 227, 0.3)'
                }}
              >
                {faceCapturing 
                  ? (lang === 'EN' ? `Scanning Face (${faceCountdown}s)...` : `안면 자동 스캔 중 (${faceCountdown}초)...`) 
                  : (lang === 'EN' ? 'Retry Face Scan' : '다시 안면 촬영 시도')}
              </button>
            )}

            {/* 최종 가입완료 / 건너뛰기 액션 버튼 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%' }}>
              <button
                type="button"
                onClick={() => handleFinalRegister(false)}
                disabled={loading}
                style={{ 
                  height: '60px', 
                  fontSize: '17px', 
                  fontWeight: 600, 
                  background: '#ffffff', 
                  border: '1px solid #d2d2d7',
                  color: '#1d1d1f',
                  borderRadius: '16px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                등록 건너뛰기
              </button>

              <button
                type="button"
                onClick={() => handleFinalRegister(true)}
                disabled={loading || !faceCaptured}
                style={{ 
                  height: '60px', 
                  fontSize: '17px', 
                  fontWeight: 700,
                  background: '#34c759',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  cursor: (loading || !faceCaptured) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !faceCaptured) ? 0.5 : 1,
                  boxShadow: '0 4px 12px rgba(52, 199, 89, 0.3)'
                }}
              >
                {loading ? '가입 처리 중...' : '안면 등록 가입'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setIsFaceEnrollStep(false); setFaceCaptured(false); }}
              style={{ 
                fontSize: '15px', 
                color: '#0071e3', 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer', 
                marginTop: '8px',
                fontWeight: 500
              }}
            >
              이전 단계(정보 수정)로 돌아가기
            </button>
          </div>
        </div>
      ) : (
        /* 회원가입 1단계: 기본 정보 입력 폼 */
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '48px' }}>
          
          {/* 좌측: 이름 / 휴대폰 / 이메일 등 입력 상자 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 이름 입력 필드 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '17px', fontWeight: 600, color: '#1d1d1f' }}>이름 (실명 입력)</label>
              <input
                type="text"
                readOnly
                onClick={() => setActiveField('NAME')}
                value={name}
                placeholder="여기를 터치하여 이름을 입력하세요"
                style={{
                  width: '100%',
                  height: '64px',
                  borderRadius: '16px',
                  border: `2px solid ${activeField === 'NAME' ? '#0071e3' : 'transparent'}`,
                  background: '#f5f5f7',
                  color: '#1d1d1f',
                  fontSize: '20px',
                  fontWeight: 600,
                  padding: '0 24px',
                  boxShadow: activeField === 'NAME' ? '0 4px 12px rgba(0, 113, 227, 0.15)' : 'inset 0 2px 4px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            {/* 성별 선택 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '17px', fontWeight: 600, color: '#1d1d1f' }}>성별</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {([['M', '남성 ♂'], ['F', '여성 ♀']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setGender(val)}
                    style={{
                      height: '60px',
                      fontSize: '18px',
                      fontWeight: 700,
                      borderRadius: '16px',
                      border: `2px solid ${gender === val ? '#0071e3' : '#e5e5ea'}`,
                      background: gender === val ? '#0071e3' : '#f5f5f7',
                      color: gender === val ? '#ffffff' : '#1d1d1f',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: gender === val ? '0 4px 12px rgba(0, 113, 227, 0.25)' : 'none'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div 
              onClick={() => setAgree(!agree)}
              style={{ 
                padding: '24px', 
                borderRadius: '20px', 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '16px',
                cursor: 'pointer',
                border: `1.5px solid ${agree ? '#34c759' : '#e5e5ea'}`,
                background: agree ? 'rgba(52, 199, 89, 0.04)' : '#ffffff',
                boxShadow: agree ? '0 8px 24px rgba(52, 199, 89, 0.1)' : '0 2px 8px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
                marginTop: '8px'
              }}
            >
              <div 
                style={{ 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '8px', 
                  border: `2px solid ${agree ? '#34c759' : '#d2d2d7'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: agree ? '#34c759' : 'transparent',
                  color: '#ffffff',
                  marginTop: '2px',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
              >
                {agree && <Check size={18} strokeWidth={3} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: '#1d1d1f' }}>
                  [필수] 개인정보 수집 및 키오스크 이용약관 동의
                </span>
                <p style={{ fontSize: '14px', color: '#86868b', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                  무인 시설 입장 바코드 생성, 타석 배정 예약 정보의 알림톡 발송을 위해 이름과 연락처 수집에 동의해 주셔야 가입이 가능합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 우측: 휴대폰 입력 전용 콤팩트 키패드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              <label style={{ fontSize: '17px', fontWeight: 600, color: '#1d1d1f', textAlign: 'center' }}>
                휴대폰 번호 입력
              </label>
              <div 
                style={{
                  width: '100%',
                  height: '64px',
                  background: '#f5f5f7',
                  border: '2px solid transparent',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 700,
                  color: hp ? '#1d1d1f' : '#a1a1a6',
                  letterSpacing: '1px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
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
                gap: '12px', 
                width: '100%' 
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button 
                  type="button" 
                  key={n} 
                  onClick={() => handleNumClick(n)} 
                  style={{ 
                    height: '64px', 
                    fontSize: '24px', 
                    fontWeight: 600,
                    borderRadius: '16px',
                    background: '#ffffff',
                    color: '#1d1d1f',
                    border: '1px solid #e5e5ea',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f7'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.background = '#e8e8ed'; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#f5f5f7'; }}
                >
                  {n}
                </button>
              ))}
              <button 
                type="button" 
                onClick={() => setHp('')} 
                style={{ 
                  height: '64px', 
                  fontSize: '16px', 
                  fontWeight: 600,
                  color: '#ff3b30', 
                  borderRadius: '16px',
                  background: '#ffffff',
                  border: '1px solid #e5e5ea',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }} 
                onMouseOver={(e) => e.currentTarget.style.background = '#fff0f0'}
                onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                전체 지움
              </button>
              <button 
                type="button" 
                onClick={() => handleNumClick('0')} 
                style={{ 
                  height: '64px', 
                  fontSize: '24px', 
                  fontWeight: 600,
                  borderRadius: '16px',
                  background: '#ffffff',
                  color: '#1d1d1f',
                  border: '1px solid #e5e5ea',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f7'}
                onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                0
              </button>
              <button 
                type="button" 
                onClick={handleBackspace} 
                style={{ 
                  height: '64px', 
                  borderRadius: '16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: '#e5e5ea',
                  color: '#1d1d1f',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }} 
                onMouseOver={(e) => e.currentTarget.style.background = '#d2d2d7'}
                onMouseOut={(e) => e.currentTarget.style.background = '#e5e5ea'}
              >
                ←
              </button>
            </div>

            {/* 가입 완료 최종 제출 버튼 */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '72px',
                borderRadius: '20px',
                fontSize: '20px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '16px',
                background: '#34c759',
                color: '#ffffff',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 8px 24px rgba(52, 199, 89, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => !loading && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseOut={(e) => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <Sparkles size={24} />
              {loading ? '가입 처리 중...' : (faceTerminalEnabled ? '다음 단계 (안면 등록)' : '즉석 회원가입 완료')}
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

