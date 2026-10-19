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

const DEFAULT_TERMS = {
  KO: {
    privacy_title: "개인정보 수집 및 이용 동의 (필수)",
    privacy_content: `[1. 수집하는 개인정보 항목]
• 필수항목: 이름, 휴대폰 번호, (안면 등록 시) 안면 템플릿 데이터

[2. 수집 및 이용 목적]
• 무인 타석 배정 및 키오스크 본인 확인
• 예약 및 이용 시간 안내 알림톡(SMS) 발송
• 매장 보안 및 부정 이용 방지

[3. 보유 및 이용 기간]
• 회원 탈퇴 시 또는 최종 이용일로부터 1년간 보관 후 즉시 파기

[4. 동의 거부 권리 및 불이익]
• 귀하는 개인정보 수집 동의를 거부할 권리가 있으나, 필수 항목 미동의 시 무인 회원 가입 및 타석 이용이 제한됩니다.`,
    marketing_title: "혜택 및 마케팅 정보 수신 동의 (선택)",
    marketing_content: `[1. 수집 및 이용 목적]
• 할인 쿠폰, 생일 축하 혜택, 이벤트 프로모션 안내
• 신규 레슨 및 매장 대회 안내

[2. 전송 매체]
• 휴대폰 문자메시지(SMS/LMS) 및 카카오 알림톡

[3. 철회 안내]
• 마이페이지 또는 카운터 직원을 통해 언제든지 수신 동의를 철회하실 수 있습니다.`
  },
  EN: {
    privacy_title: "Privacy Policy Agreement (Required)",
    privacy_content: `[1. Collected Personal Information]
• Required: Name, Mobile Phone Number, Face Data (if enrolled)

[2. Purpose of Collection & Use]
• Bay assignment & Kiosk identity verification
• Notification alerts (SMS/Kakao) for reservations & usage time
• Security and fraud prevention

[3. Retention & Usage Period]
• Retained for 1 year from last visit or until account deletion

[4. Right to Refuse]
• You may refuse consent, but Kiosk membership services will be restricted.`,
    marketing_title: "Marketing & Promotional Alerts (Optional)",
    marketing_content: `[1. Purpose]
• Discount coupons, birthday benefits, tournament promotions

[2. Transmission Channel]
• SMS & Mobile messaging

[3. Opt-out]
• You can withdraw consent at any time via My Page or counter staff.`
  }
};

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

  const [privacyAgree, setPrivacyAgree] = useState(false);
  const [marketingAgree, setMarketingAgree] = useState(false);
  const [termsData, setTermsData] = useState<{ privacy_title: string; privacy_content: string; marketing_title: string; marketing_content: string } | null>(null);
  const [modalTerms, setModalTerms] = useState<{ title: string; content: string } | null>(null);
  const [gender, setGender] = useState<'M' | 'F'>('M');

  // 약관 데이터 비동기 로드
  useEffect(() => {
    api.getTerms().then(setTermsData).catch(console.warn);
  }, []);

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
  const isSubmittingRef = useRef<boolean>(false);
  const isFaceEnrollStepRef = useRef<boolean>(isFaceEnrollStep);

  useEffect(() => {
    isFaceEnrollStepRef.current = isFaceEnrollStep;
  }, [isFaceEnrollStep]);

  // 🛡️ 안면 캡처(25초) 또는 가입 통신 중 키오스크 전역 60초 비활동 타이머 리셋 방어 (BUG-M10)
  useEffect(() => {
    if (!faceCapturing && !loading && !isFaceEnrollStep) return;
    const keepAlive = setInterval(() => {
      window.dispatchEvent(new Event('keydown'));
    }, 10000);
    return () => clearInterval(keepAlive);
  }, [faceCapturing, loading, isFaceEnrollStep]);

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

    // 2. 단말기 안면 캡처 모드 활성화 후 1회성 Long-polling 대기 수신 (최대 25초)
    try {
      await api.startFaceCaptureMode().catch(console.warn);
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
        setErrorMsg(
          lang === 'EN'
            ? 'Face not detected. Please look directly at the camera and try again.'
            : '단말기 정면에 안면이 감지되지 않았습니다. 카메라를 정면으로 바라보신 후 다시 시도해 주세요.'
        );
        api.cancelFaceCaptureMode().catch(console.warn);
      }
    } catch (err: any) {
      console.warn('Face capture exception:', err);
      if (!isFaceEnrollStepRef.current) return;
      if (captureCountdownRef.current) clearInterval(captureCountdownRef.current);
      setFaceCapturing(false);
      setErrorMsg(
        lang === 'EN'
          ? 'Face camera communication error occurred.'
          : '단말기 안면 캡처 통신 예외가 발생했습니다.'
      );
      api.cancelFaceCaptureMode().catch(console.warn);
    } finally {
      isFetchingRef.current = false;
    }
  }, [faceCaptured, lang]);

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
    if (activeField === 'NAME') setActiveField(null);
    if (hp.length >= 11) return;
    setHp(prev => prev + num);
  };

  const handleBackspace = () => {
    if (activeField === 'NAME') setActiveField(null);
    setHp(prev => prev.slice(0, -1));
  };

  // 최종 회원 가입 완료 (useCallback)
  const handleFinalRegister = useCallback(async (faceReg: boolean) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg('');
    try {
      const cleanName = name.trim();
      const formattedHp = formatPhoneNumber(hp);
      const faceVectorId = faceReg ? `FACE_${hp.replace(/[^0-9]/g, '')}` : null;
      
      const res = await api.registerMember(cleanName, formattedHp, '', faceReg, faceVectorId, gender, marketingAgree);
      if (res.success && res.member) {
        if (faceReg) {
          // 프런트포스 표준: 실물 안면 단말기 푸시 동기화 등록 (실제 카메라 캡처 이미지 전달)
          const enrollResult = await api.enrollMemberFace(res.member.member_no, cleanName, faceImageBase64 || undefined).catch((err) => ({
            success: false,
            message: err?.message || '안면 단말기 동기화 통신 오류',
          }));
          if (enrollResult?.success) {
            res.member.face_registered = true;
            res.member.face_vector_id = faceVectorId;
          } else {
            console.warn('[Kiosk] 안면 단말기 동기화 실패 (가입은 정상 완료):', enrollResult?.message);
            res.member.face_registered = false;
            res.member.face_vector_id = null;
            (res.member as any).face_enroll_warning = enrollResult?.message || '안면 단말기 동기화에 실패했습니다. 데스크에서 안면 재등록이 필요합니다.';
            setErrorMsg(
              lang === 'EN'
                ? 'Registration completed, but face terminal sync failed. Please re-register your face at the front desk.'
                : '회원 가입은 완료되었으나 안면 단말기 등록에 실패했습니다. 안내 데스크에서 안면 재등록을 진행해 주세요.'
            );
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        onRegisterSuccess(res.member);
      } else {
        setErrorMsg(res.message);
        setIsFaceEnrollStep(false);
      }
    } catch {
      setErrorMsg(
        lang === 'EN'
          ? 'Server communication error occurred during registration.'
          : '회원가입 요청 처리 중 서버 통신 에러가 발생했습니다.'
      );
      setIsFaceEnrollStep(false);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  }, [name, hp, gender, marketingAgree, faceImageBase64, onRegisterSuccess, lang]);

  // 회원가입 1차 입력 제출 (중복 번호 선제 검증 후 안면 등록 단계로 진입 - BUG-M08, BUG-R06)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;
    setErrorMsg('');
    setActiveField(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(lang === 'EN' ? 'Please enter your name.' : '이름을 입력해 주세요.');
      return;
    }
    if (trimmedName.length < 2) {
      setErrorMsg(lang === 'EN' ? 'Please enter at least 2 characters for your name.' : '이름을 2글자 이상 정확히 입력해 주세요.');
      return;
    }
    if (trimmedName.length > 50) {
      setErrorMsg(lang === 'EN' ? 'Name must be 50 characters or less.' : '이름은 50자 이내로 입력해 주세요.');
      return;
    }
    if (/[ㄱ-ㅎㅏ-ㅣ]/.test(trimmedName)) {
      setErrorMsg(lang === 'EN' ? 'Please complete all Korean characters in your name.' : '이름에 완성되지 않은 자음/모음이 포함되어 있습니다. 정확히 입력해 주세요.');
      return;
    }
    if (!/^[가-힣a-zA-Z\s]+$/.test(trimmedName)) {
      setErrorMsg(lang === 'EN' ? 'Name can only contain Korean or English letters.' : '이름은 한글 또는 영문으로만 입력해 주세요.');
      return;
    }

    const cleanHp = hp.replace(/[^0-9]/g, '');
    if (!/^01[016789]\d{7,8}$/.test(cleanHp)) {
      setErrorMsg(lang === 'EN' ? 'Please enter a valid 10-11 digit mobile number.' : '올바른 휴대폰 번호(010 등 10~11자리)를 입력해 주세요.');
      return;
    }

    if (!privacyAgree) {
      setErrorMsg(lang === 'EN' ? 'Please agree to the required privacy policy.' : '필수 개인정보 수집 및 키오스크 이용약관에 동의해 주세요.');
      return;
    }

    // 🛡️ BUG-M08 & BUG-R01: 휴대폰 번호 중복/휴면 가입 여부를 1단계에서 선제 검증
    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const existing = await api.getMember(cleanHp);
      if (existing) {
        setErrorMsg(
          lang === 'EN'
            ? 'This phone number is already registered. Please sign in.'
            : '이미 가입된 휴대폰 번호입니다. 회원 인증(로그인)을 이용해 주세요.'
        );
        isSubmittingRef.current = false;
        setLoading(false);
        return;
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (status === 403 || err?.inactive) {
        setErrorMsg(
          lang === 'EN'
            ? 'This phone number belongs to a dormant or restricted account. Please contact the front desk.'
            : '이미 등록된 휴대폰 번호(휴면/탈퇴/이용제한 상태)입니다. 프런트 데스크에 문의해 주세요.'
        );
        isSubmittingRef.current = false;
        setLoading(false);
        return;
      }
      if (status === 409 || err?.duplicate) {
        setErrorMsg(
          lang === 'EN'
            ? 'This phone number is already registered. Please sign in or contact the front desk.'
            : '이미 등록된 휴대폰 번호입니다. 회원 인증 또는 프런트 데스크에 문의해 주세요.'
        );
        isSubmittingRef.current = false;
        setLoading(false);
        return;
      }
    }
    isSubmittingRef.current = false;
    setLoading(false);

    if (faceTerminalEnabled) {
      setIsFaceEnrollStep(true);
    } else {
      // 안면인식 미사용 시 2단계를 건너뛰고 바로 가입 완료 처리
      await handleFinalRegister(false);
    }
  };

  return (
    <div 
      onClick={() => {
        if (activeField === 'NAME') setActiveField(null);
      }}
      style={{
        width: '980px',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '44px 52px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.12), inset 0 1px 1.5px rgba(255, 255, 255, 0.9), 0 1px 3px rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* 타이틀 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ 
            background: 'linear-gradient(145deg, #059669 0%, #047857 100%)', 
            borderRadius: '16px', 
            width: '56px', height: '56px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4)'
          }}>
            <UserPlus size={28} color="#ffffff" strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '32px', fontWeight: 950, color: '#1d1d1f', margin: 0, letterSpacing: '-0.8px' }}>
                {lang === 'EN' ? '30-Second Quick Sign Up' : '무인 스튜디오 30초 즉석 회원가입'}
              </h2>
              <span 
                style={{ 
                  fontSize: '12px', 
                  fontWeight: 900, 
                  color: '#059669', 
                  background: 'rgba(5, 150, 105, 0.1)', 
                  padding: '4px 10px', 
                  borderRadius: '999px',
                  border: '1px solid rgba(5, 150, 105, 0.2)'
                }}
              >
                {lang === 'EN' ? '⚡ Quick 30s' : '⚡ 간편 30초'}
              </span>
            </div>
            <p style={{ fontSize: '16px', color: '#86868b', margin: '4px 0 0 0', fontWeight: 600 }}>
              {lang === 'EN'
                ? 'Enter basic details to enjoy membership benefits and teebox booking.'
                : '간단한 기본 정보 입력 후 정기권 회원 혜택과 타석 예약을 시작하세요.'}
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: '#f5f5f7',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            color: '#1d1d1f',
            padding: '10px 22px',
            borderRadius: '999px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 800,
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#e8e8ed'}
          onMouseOut={(e) => e.currentTarget.style.background = '#f5f5f7'}
        >
          {lang === 'EN' ? 'Cancel' : '취소'}
        </button>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div style={{ background: '#fff0f0', padding: '16px 20px', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid rgba(255, 59, 48, 0.2)' }}>
          <ShieldAlert size={20} color="#ff3b30" />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#ff3b30' }}>{errorMsg}</span>
        </div>
      )}

      {/* 회원가입 폼 및 안면 등록 단계 조건부 렌더링 */}
      {isFaceEnrollStep ? (
        /* 안면 정보 등록 UI */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
              {lang === 'EN' ? '[Step 2/2] Face ID Registration' : '[단계 2/2] 페이스 ID 안면 등록'}
            </h3>
            <p style={{ fontSize: '16px', color: '#86868b', marginTop: '8px', fontWeight: 600 }}>
              {lang === 'EN'
                ? 'Register your Face ID for instant touchless authentication at the kiosk.'
                : '무인 기기 입장 시 신속한 본인 확인을 위해 페이스 ID 정보를 등록합니다.'}
            </p>
          </div>

          {/* 가상 카메라 캡처 박스 */}
          <div
            style={{
              width: '520px',
              height: '340px',
              background: '#f5f5f7',
              borderRadius: '28px',
              border: `2px solid ${faceCaptured ? '#059669' : '#1d1d1f'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceCaptured 
                ? '0 0 30px rgba(5, 150, 105, 0.2)' 
                : '0 0 30px rgba(0, 0, 0, 0.08)',
              transition: 'all 0.3s ease'
            }}
          >
            {/* 가이드 타원 */}
            <div
              style={{
                width: '170px',
                height: '220px',
                border: `2.5px ${faceCaptured ? 'solid #059669' : 'dashed #1d1d1f'}`,
                borderRadius: '50% / 40%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: faceCaptured ? '0 0 20px rgba(5, 150, 105, 0.3)' : 'none',
                background: '#ffffff',
                transition: 'all 0.3s ease'
              }}
            >
              {faceCapturing ? (
                <div style={{ fontSize: '16px', color: '#059669', fontWeight: 800 }}>분석 중...</div>
              ) : (
                <Camera size={42} style={{ color: faceCaptured ? '#059669' : '#1d1d1f' }} />
              )}

              {/* 캡처 진행 시 로딩 애니메이션 */}
              {faceCapturing && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#059669',
                    boxShadow: '0 0 10px rgba(5, 150, 105, 0.6)',
                    top: '10%',
                    animation: 'face-scanner 2s infinite ease-in-out'
                  }}
                />
              )}
            </div>

            <p style={{ marginTop: '20px', fontSize: '16px', color: faceCaptured ? '#059669' : '#1d1d1f', fontWeight: 700 }}>
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
                <div style={{ background: '#059669', borderRadius: '50%', padding: '14px' }}>
                  <Check size={48} color="#ffffff" strokeWidth={3} />
                </div>
                <span style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f' }}>
                  {lang === 'EN' ? 'Face Capture Completed' : '안면 캡처 완료'}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '520px' }}>
            {/* 촬영/재시도 트리거 버튼 */}
            {!faceCaptured && (
              <button
                type="button"
                onClick={triggerFaceCapture}
                disabled={faceCapturing}
                style={{ 
                  height: '64px', 
                  fontSize: '18px', 
                  fontWeight: 900,
                  borderRadius: '999px',
                  background: '#1d1d1f',
                  color: '#ffffff',
                  border: 'none',
                  cursor: faceCapturing ? 'not-allowed' : 'pointer',
                  opacity: faceCapturing ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)'
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
                  fontWeight: 700, 
                  background: '#f5f5f7', 
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  color: '#1d1d1f',
                  borderRadius: '999px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {lang === 'EN' ? 'Skip Face ID' : '등록 건너뛰기'}
              </button>

              <button
                type="button"
                onClick={() => handleFinalRegister(true)}
                disabled={loading || !faceCaptured}
                style={{ 
                  height: '60px', 
                  fontSize: '17px', 
                  fontWeight: 900,
                  background: 'linear-gradient(145deg, #059669 0%, #047857 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: (loading || !faceCaptured) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !faceCaptured) ? 0.5 : 1,
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)'
                }}
              >
                {loading
                  ? (lang === 'EN' ? 'Registering...' : '가입 처리 중...')
                  : (lang === 'EN' ? 'Complete with Face ID' : '안면 등록 가입')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setIsFaceEnrollStep(false); setFaceCaptured(false); }}
              style={{ 
                fontSize: '15px', 
                color: '#86868b', 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer', 
                marginTop: '8px',
                fontWeight: 600
              }}
            >
              {lang === 'EN' ? '‹ Back to Edit Details' : '‹ 이전 단계(정보 수정)로 돌아가기'}
            </button>
          </div>
        </div>
      ) : (
        /* 회원가입 1단계: 기본 정보 입력 폼 */
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '48px' }}>
          
          {/* 좌측: 이름 / 휴대폰 / 성별 등 입력 상자 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 이름 입력 필드 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f' }}>
                {lang === 'EN' ? 'Full Name' : '이름 (실명 입력)'}
              </label>
              <input
                type="text"
                maxLength={50}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveField('NAME');
                }}
                onFocus={() => setActiveField('NAME')}
                onChange={(e) => setName(e.target.value.slice(0, 50))}
                value={name}
                placeholder={lang === 'EN' ? 'Touch here to enter your name' : '여기를 터치하여 이름을 입력하세요'}
                style={{
                  width: '100%',
                  height: '68px',
                  borderRadius: '18px',
                  border: activeField === 'NAME' ? '2px solid #1d1d1f' : '1px solid rgba(0, 0, 0, 0.08)',
                  background: activeField === 'NAME' ? '#ffffff' : '#f5f5f7',
                  color: '#1d1d1f',
                  fontSize: '20px',
                  fontWeight: 700,
                  padding: '0 24px',
                  boxShadow: activeField === 'NAME' ? '0 6px 16px rgba(0, 0, 0, 0.08)' : 'inset 0 1px 2px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* 성별 선택 (애플 세그먼트 컨트롤) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f' }}>
                {lang === 'EN' ? 'Gender' : '성별'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {([['M', lang === 'EN' ? 'Male ♂' : '남성 ♂'], ['F', lang === 'EN' ? 'Female ♀' : '여성 ♀']] as const).map(([val, label]) => {
                  const isSelected = gender === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        if (activeField === 'NAME') setActiveField(null);
                        setGender(val);
                      }}
                      style={{
                        height: '64px',
                        fontSize: '18px',
                        fontWeight: isSelected ? 950 : 700,
                        borderRadius: '18px',
                        border: isSelected ? '1px solid #1d1d1f' : '1px solid rgba(0, 0, 0, 0.06)',
                        background: isSelected ? '#1d1d1f' : '#f5f5f7',
                        color: isSelected ? '#ffffff' : '#1d1d1f',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                        boxShadow: isSelected ? '0 4px 14px rgba(0, 0, 0, 0.15)' : 'none'
                      }}
                      className="apple-card-hover"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 약관 동의 그룹 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              {/* ⚡ 1터치 전체 동의 대형 버튼 */}
              <button
                type="button"
                onClick={() => {
                  if (activeField === 'NAME') setActiveField(null);
                  const nextState = !(privacyAgree && marketingAgree);
                  setPrivacyAgree(nextState);
                  setMarketingAgree(nextState);
                }}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '16px',
                  border: (privacyAgree && marketingAgree) ? '1.5px solid #059669' : '1px solid rgba(0, 0, 0, 0.1)',
                  background: (privacyAgree && marketingAgree) ? '#ecfdf5' : '#f5f5f7',
                  color: (privacyAgree && marketingAgree) ? '#065f46' : '#1d1d1f',
                  fontSize: '15px',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  backgroundColor: (privacyAgree && marketingAgree) ? '#059669' : '#ffffff',
                  border: (privacyAgree && marketingAgree) ? 'none' : '1.5px solid #d2d2d7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}>
                  {(privacyAgree && marketingAgree) && <Check size={14} strokeWidth={3} />}
                </div>
                <span>
                  {lang === 'EN'
                    ? '⚡ Agree to All Terms (Required + Optional)'
                    : '⚡ 전체 약관 동의 (필수 + 선택 혜택 알림)'}
                </span>
              </button>

              {/* [필수] 개인정보 수집 및 키오스크 이용약관 */}
              <div style={{
                padding: '12px 16px',
                borderRadius: '14px',
                border: privacyAgree ? '1.5px solid rgba(5, 150, 105, 0.35)' : '1px solid rgba(0, 0, 0, 0.08)',
                background: privacyAgree ? 'rgba(5, 150, 105, 0.05)' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div 
                  onClick={() => {
                    if (activeField === 'NAME') setActiveField(null);
                    setPrivacyAgree(!privacyAgree);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    backgroundColor: privacyAgree ? '#059669' : '#ffffff',
                    border: privacyAgree ? 'none' : '1.5px solid #d2d2d7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0
                  }}>
                    {privacyAgree && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#1d1d1f' }}>
                    {lang === 'EN' ? '[Required] Privacy Policy Agreement' : '[필수] 개인정보 수집 및 이용 동의'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (activeField === 'NAME') setActiveField(null);
                    const fallback = (lang === 'EN' || lang === 'en') ? DEFAULT_TERMS.EN : DEFAULT_TERMS.KO;
                    setModalTerms({
                      title: (lang === 'EN' ? fallback.privacy_title : termsData?.privacy_title) || fallback.privacy_title,
                      content: termsData?.privacy_content || fallback.privacy_content
                    });
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: '#f5f5f7',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#86868b',
                    cursor: 'pointer'
                  }}
                >
                  {lang === 'EN' ? 'Details' : '전문보기'}
                </button>
              </div>

              {/* [선택] 마케팅 수신 동의 */}
              <div style={{
                padding: '12px 16px',
                borderRadius: '14px',
                border: marketingAgree ? '1.5px solid rgba(5, 150, 105, 0.35)' : '1px solid rgba(0, 0, 0, 0.08)',
                background: marketingAgree ? 'rgba(5, 150, 105, 0.05)' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div 
                  onClick={() => {
                    if (activeField === 'NAME') setActiveField(null);
                    setMarketingAgree(!marketingAgree);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    backgroundColor: marketingAgree ? '#059669' : '#ffffff',
                    border: marketingAgree ? 'none' : '1.5px solid #d2d2d7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0
                  }}>
                    {marketingAgree && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#4b5563' }}>
                    {lang === 'EN' ? '[Optional] Marketing & Event Notifications' : '[선택] 혜택 및 이벤트 알림(마케팅) 수신'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (activeField === 'NAME') setActiveField(null);
                    const fallback = (lang === 'EN' || lang === 'en') ? DEFAULT_TERMS.EN : DEFAULT_TERMS.KO;
                    setModalTerms({
                      title: (lang === 'EN' ? fallback.marketing_title : termsData?.marketing_title) || fallback.marketing_title,
                      content: termsData?.marketing_content || fallback.marketing_content
                    });
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: '#f5f5f7',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#86868b',
                    cursor: 'pointer'
                  }}
                >
                  {lang === 'EN' ? 'Details' : '전문보기'}
                </button>
              </div>
            </div>
          </div>

          {/* 우측: 휴대폰 입력 전용 콤팩트 키패드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <label style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f', textAlign: 'center' }}>
                {lang === 'EN' ? 'Mobile Number' : '휴대폰 번호 입력'}
              </label>
              <div 
                style={{
                  width: '100%',
                  height: '68px',
                  background: '#f5f5f7',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  borderRadius: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  fontWeight: 900,
                  color: hp ? '#1d1d1f' : '#a1a1a6',
                  letterSpacing: '1px',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)',
                  boxSizing: 'border-box'
                }}
              >
                {hp ? formatPhoneNumber(hp) : '010-0000-0000'}
              </div>
            </div>

            {/* 콤팩트 텐키 그리드 (2.5D 애플 햅틱 스타일) */}
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
                  style={{ 
                    height: '68px', 
                    fontSize: '26px', 
                    fontWeight: 800,
                    borderRadius: '18px',
                    background: '#ffffff',
                    color: '#1d1d1f',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                    cursor: 'pointer',
                    transition: 'all 0.1s cubic-bezier(0.25, 1, 0.5, 1)'
                  }}
                  className="apple-card-hover"
                >
                  {n}
                </button>
              ))}
              <button 
                type="button" 
                onClick={() => {
                  if (activeField === 'NAME') setActiveField(null);
                  setHp('');
                }} 
                style={{ 
                  height: '68px', 
                  fontSize: '15px', 
                  fontWeight: 800,
                  color: '#ef4444', 
                  borderRadius: '18px',
                  background: '#fff5f5',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  boxShadow: '0 2px 6px rgba(239, 68, 68, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.1s cubic-bezier(0.25, 1, 0.5, 1)'
                }} 
                className="apple-card-hover"
              >
                {lang === 'EN' ? 'Clear' : '전체 지움'}
              </button>
              <button 
                type="button" 
                onClick={() => handleNumClick('0')} 
                style={{ 
                  height: '68px', 
                  fontSize: '26px', 
                  fontWeight: 800,
                  borderRadius: '18px',
                  background: '#ffffff',
                  color: '#1d1d1f',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  transition: 'all 0.1s cubic-bezier(0.25, 1, 0.5, 1)'
                }}
                className="apple-card-hover"
              >
                0
              </button>
              <button 
                type="button" 
                onClick={handleBackspace} 
                style={{ 
                  height: '68px', 
                  borderRadius: '18px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: '#f5f5f7',
                  color: '#1d1d1f',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  fontSize: '22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.1s cubic-bezier(0.25, 1, 0.5, 1)'
                }} 
                className="apple-card-hover"
              >
                ←
              </button>
            </div>

            {/* 가입 완료 최종 제출 버튼 (딥 쥬얼 에메랄드 볼드 필) */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: '72px',
                borderRadius: '999px',
                fontSize: '20px',
                fontWeight: 950,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '8px',
                background: 'linear-gradient(145deg, #059669 0%, #047857 50%, #064e3b 100%)',
                color: '#ffffff',
                border: '1.5px solid rgba(52, 211, 153, 0.4)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 8px 24px rgba(6, 78, 59, 0.28)',
                transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                letterSpacing: '-0.3px'
              }}
              className="apple-card-hover"
            >
              <Sparkles size={24} />
              {loading
                ? (lang === 'EN' ? 'Processing...' : '가입 처리 중...')
                : (faceTerminalEnabled
                    ? (lang === 'EN' ? 'Next Step (Face ID) ›' : '다음 단계 (안면 등록) ›')
                    : (lang === 'EN' ? '⚡ Complete Sign Up ›' : '⚡ 3초 즉석 회원가입 완료 ›'))}
            </button>
          </div>

        </form>
      )}

      {/* 하단 가상 키보드 영역 바인딩 (이름 입력 활성화 시 스르륵 올라옴) */}
      {!isFaceEnrollStep && activeField === 'NAME' && (
        <VirtualKeyboard
          key={activeField}
          value={name}
          onChange={(val) => setName(val.slice(0, 50))}
          onClose={() => setActiveField(null)}
        />
      )}

      {/* 약관 전문 열람 팝업 모달 */}
      {modalTerms && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f', margin: 0 }}>{modalTerms.title}</h3>
              <button
                type="button"
                onClick={() => setModalTerms(null)}
                style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f5f5f7', cursor: 'pointer' }}
              >
                <X size={20} color="#1d1d1f" />
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', fontSize: '15px', lineHeight: 1.6, color: '#333336', whiteSpace: 'pre-wrap' }}>
              {modalTerms.content}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e5ea', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalTerms(null)}
                style={{
                  padding: '12px 28px',
                  borderRadius: '999px',
                  background: '#1d1d1f',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '16px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {lang === 'EN' ? 'Close' : '확인 및 닫기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberRegister;

