import React, { useEffect, useState } from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, CreditCard, 
  KeyRound, RefreshCw, LogOut, ShieldAlert, Sparkles, UserCheck 
} from 'lucide-react';
import { IntroScreen } from './components/IntroScreen';
import { MemberAuth } from './components/MemberAuth';
import { MemberRegister } from './components/MemberRegister';
import { TeeboxMap } from './components/TeeboxMap';
import { ProductShop } from './components/ProductShop';
import { LockerExtend } from './components/LockerExtend';
import { PaymentTerminal } from './components/PaymentTerminal';
import { api, Member, Product } from './services/api';

type KioskStep = 
  | 'INTRO' 
  | 'MAIN_DASHBOARD' 
  | 'MEMBER_AUTH' 
  | 'MEMBER_REGISTER'
  | 'TEEBOX_MAP' 
  | 'PRODUCT_SHOP' 
  | 'LOCKER_EXTEND' 
  | 'PAYMENT';

type KioskPurpose = 
  | 'ALLOCATE_DAILY'       // 일일 타석 배정
  | 'ALLOCATE_MEMBERSHIP'  // 회원권 타석 배정
  | 'PURCHASE_PRODUCT'     // 회원권/일일권 구매
  | 'EXTEND_LOCKER'        // 라카 대여 및 연장
  | 'MOVE_BAY';            // 사용 중인 타석 변경

// 🌐 글로벌 다국어 번역 딕셔너리 (i18n)
const TRANSLATIONS = {
  KO: {
    welcome: '원하시는 서비스를 선택해 주세요',
    subWelcome: '터치 한 번으로 빠르게 회원인증 및 타석을 배정받으실 수 있습니다.',
    memberAuth: '회원권 타석배정',
    memberAuthSub: '보유 중인 회원 이용권(기간제/횟수제)으로 즉시 타석을 배정합니다.',
    dailyAuth: '일일 타석배정',
    dailyAuthSub: '비회원 및 일일타석권(60분/90분) 신규 결제 후 즉시 배정합니다.',
    moveBay: '타석이동',
    moveBaySub: '현재 이용 중인 타석의 위치를 다른 비어있는 빈 타석으로 변경합니다.',
    purchaseMembership: '회원권 정기 구매',
    purchaseMembershipSub: '1개월/3개월 종일 회원권 등 정기 회원권을 신규 결제 구매합니다.',
    lockerExtend: '개인 사물함 라카 대여 및 연장',
    lockerExtendSub: '이용 중인 라카의 만료 일정을 즉시 카드 결제하여 연장하거나 신규 사물함을 대여합니다.',
    exit: '종료',
    prev: '이전으로',
    confirm: '선택 완료',
    popular: '최우선',
    guestAllowed: '비회원 가능',
    shortcut: '바로가기'
  },
  EN: {
    welcome: 'Please select a service',
    subWelcome: 'Quickly authenticate and assign your teebox with a single touch.',
    memberAuth: 'Member Teebox',
    memberAuthSub: 'Assign your teebox instantly using your active membership Pass.',
    dailyAuth: 'Daily Pass Teebox',
    dailyAuthSub: 'Purchase a daily pass (60/90min) and get assigned a teebox immediately.',
    moveBay: 'Change Teebox',
    moveBaySub: 'Move your current teebox location to another vacant teebox space.',
    purchaseMembership: 'Buy Membership',
    purchaseMembershipSub: 'Purchase 1-month or 3-month full-day club memberships.',
    lockerExtend: 'Locker Rental & Extension',
    lockerExtendSub: 'Extend your locker expiration date or rent a new storage locker.',
    exit: 'Exit',
    prev: 'Back',
    confirm: 'Confirm',
    popular: 'POPULAR',
    guestAllowed: 'GUEST OK',
    shortcut: 'GO'
  }
};

export default function KioskApp() {
  const [step, setStep] = useState<KioskStep>('INTRO');
  const [purpose, setPurpose] = useState<KioskPurpose | null>(null);
  const [lang, setLang] = useState<'KO' | 'EN'>('KO');

  // 세션 정보
  const [authMember, setAuthMember] = useState<Member | null>(null);
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(null);
  const [selectedLockerNo, setSelectedLockerNo] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // UI 상태
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null);
  const [errorMasterCard, setErrorMasterCard] = useState<{ code: string; detail: string; traceId: string } | null>(null);

  // 1. 토스트 알림 타이머 자동 제거
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // 2. 무인기기 비활성 세션 아웃 (3분간 조작이 없으면 자동으로 광고 인트로로 복귀)
  useEffect(() => {
    if (step === 'INTRO') return;

    const resetTimer = () => {
      clearTimeout(sessionTimeout);
      sessionTimeout = setTimeout(() => {
        handleLogout();
        showToast(lang === 'KO' ? '일정 시간 조작이 없어 광고 화면으로 복귀합니다.' : 'Session timeout. Returning to ad screen.', false);
      }, 180000); // 180초 (3분)
    };

    let sessionTimeout = setTimeout(() => {}, 0);
    resetTimer();

    window.addEventListener('click', resetTimer);
    return () => {
      window.removeEventListener('click', resetTimer);
      clearTimeout(sessionTimeout);
    };
  }, [step, lang]);

  const showToast = (message: string, success = true) => {
    setToast({ message, success });
  };

  // 회원 로그아웃/초기화
  const handleLogout = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    setAuthMember(null);
    setSelectedBayNo(null);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setStep('INTRO');
  };

  const handleStartKiosk = () => {
    api.writeKioskLog('KIOSK_START', '키오스크 스크린 터치 시작');
    setStep('MAIN_DASHBOARD');
  };

  // --------------------------------------------------------------------------
  // ⚡ 세부 기능 라우팅 및 검증 엔진 (ErrorMaster-First 진단 탑재)
  // --------------------------------------------------------------------------

  // 1. 회원인증 성공 시 핸들러
  const handleAuthSuccess = async (member: Member) => {
    setAuthMember(member);
    showToast(lang === 'KO' ? `${member.member_name} 님 인증되었습니다.` : `${member.member_name} verified.`);
    
    // 감사 로그 적재
    await api.writeKioskLog('AUTH_SUCCESS', `${member.member_name} 회원 인증 성공 (${member.hp})`, member.member_no);

    // 회원인증의 목적에 따라 다음 단계로 지능형 라우팅
    if (purpose === 'ALLOCATE_MEMBERSHIP') {
      // 회원권 타석 배정 검증
      if (!member.expiry_date || member.remain_days === undefined || member.remain_days <= 0) {
        // [ErrorMaster-First 예시] 회원권 만료 에러
        const trace = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
        await api.writeKioskLog('AUTH_ERROR', `회원권 만료 제약 차단 (Trace ID: ${trace})`, member.member_no);
        
        setErrorMasterCard({
          code: 'ERR_MEMBERSHIP_EXPIRED',
          detail: lang === 'KO' 
            ? '고객님의 회원권 기간이 만료되었거나 보유하신 유효 이용권이 없습니다.' 
            : 'Your membership pass has expired or you do not have any valid teebox tickets.',
          traceId: trace
        });
        setStep('MAIN_DASHBOARD');
      } else {
        setStep('TEEBOX_MAP');
      }
    } else if (purpose === 'PURCHASE_PRODUCT') {
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'EXTEND_LOCKER') {
      setStep('LOCKER_EXTEND');
    } else if (purpose === 'MOVE_BAY') {
      setStep('TEEBOX_MAP');
    } else {
      setStep('MAIN_DASHBOARD');
    }
  };

  // 6. 즉석 신규 회원가입 성공 시 핸들러
  const handleRegisterSuccess = async (member: Member) => {
    setAuthMember(member);
    showToast(lang === 'KO' ? `${member.member_name} 님, 환영합니다! 신규 회원가입이 완료되었습니다.` : `Welcome ${member.member_name}! Registration successful.`);

    // 감사 로그 적재
    await api.writeKioskLog('REGISTER_SUCCESS', `즉석 회원가입 성공 (${member.member_name}, ${member.hp})`, member.member_no);

    // 가입 직후 회원권 구매 또는 다른 본 목적에 맞춤형 지능적 라우팅
    if (purpose === 'PURCHASE_PRODUCT') {
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'ALLOCATE_MEMBERSHIP') {
      // 신규 가입 직후는 회원권이 없을 확률이 99%이므로, 회원권 구매 매대로 친절하게 안내하여 상용 키오스크의 세일즈 퍼널을 최적화합니다.
      showToast(lang === 'KO' ? '이용을 위해 먼저 정기 회원권 또는 일일타석권을 구매해주세요.' : 'Please purchase a membership pass or daily ticket to use teebox.', false);
      setPurpose('PURCHASE_PRODUCT');
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'EXTEND_LOCKER') {
      setStep('LOCKER_EXTEND');
    } else {
      setStep('MAIN_DASHBOARD');
    }
  };

  // 2. 타석 맵에서 타석 선택 완료
  const handleBaySelected = async (bayNo: number) => {
    setSelectedBayNo(bayNo);

    if (purpose === 'ALLOCATE_MEMBERSHIP' && authMember) {
      // 회원권 타석 배정은 결제 필요 없이 즉시 배정 완료
      try {
        const res = await api.allocateBay(bayNo, 60, authMember.member_no); // 기본 60분 배정
        if (res.success) {
          // 감사 로그 적재
          await api.writeKioskLog('BAY_ALLOCATE_MEMBERSHIP', `회원권 타석배정 완료 (${bayNo}번 타석)`, authMember.member_no);

          const updated = await api.getMember(authMember.member_no);
          if (updated) setAuthMember(updated);
          
          setSelectedBayNo(bayNo);
          setStep('PAYMENT'); // 영수증 인출을 위해 가상 결제창의 프린트 모드로 강제 이동
        } else {
          showToast(res.message, false);
        }
      } catch {
        showToast(lang === 'KO' ? '타석 배정 중 통신 장애가 발생했습니다.' : 'Connection failure during teebox allocation.', false);
      }
    } else if (purpose === 'ALLOCATE_DAILY') {
      // 일일권은 먼저 타석을 선택한 뒤, 60분/90분 결제 단계로 진입
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'MOVE_BAY' && authMember) {
      // 타석 이동 완료 처리
      try {
        const res = await api.moveBay(authMember.member_no, bayNo);
        if (res.success) {
          // 감사 로그 적재
          await api.writeKioskLog('BAY_MOVE', `타석 이동 성공 (${bayNo}번 타석으로 이동)`, authMember.member_no);
          
          showToast(res.message);
          handleLogout();
        } else {
          showToast(res.message, false);
        }
      } catch {
        showToast(lang === 'KO' ? '타석 이동 처리 중 오류가 발생했습니다.' : 'Failed to move teebox.', false);
      }
    }
  };

  // 3. 상품 매대에서 구매 상품 선택 완료
  const handleProductSelected = (prod: Product) => {
    setSelectedProduct(prod);

    if (purpose === 'ALLOCATE_DAILY') {
      // 일일 타석권 요금 결제 진입
      setStep('PAYMENT');
    } else if (purpose === 'PURCHASE_PRODUCT') {
      // 일반 회원권 구매 요금 결제 진입
      setStep('PAYMENT');
    }
  };

  // 4. 라카 연장/대여 상품 선택 및 결제 트리거
  const handleLockerPaymentTriggered = (lockerNo: number, prod: Product, extendDays: number) => {
    setSelectedLockerNo(lockerNo);
    setSelectedProduct(prod);
    setStep('PAYMENT');
  };

  // 5. 결제 및 배정 완전 성공 (영수증 출력 후 메인 복귀)
  const handlePaymentCompleted = async () => {
    showToast('모든 처리가 안전하게 완료되었습니다. 이용권을 챙겨주세요!');
    
    // 타석 일일권 배정인 경우 결제 완료 시점에 실제 배정 트랜잭션 수행
    if (purpose === 'ALLOCATE_DAILY' && selectedBayNo && selectedProduct) {
      await api.allocateBay(selectedBayNo, selectedProduct.duration_min || 60, undefined, '비회원', '010-0000-0000');
    }

    // 일반 회원권 구매 성공인 경우
    if (purpose === 'PURCHASE_PRODUCT' && authMember && selectedProduct) {
      await api.purchaseProduct(authMember.member_no, selectedProduct.prod_cd, selectedProduct.standard_price);
    }

    // 라카 연장/대여 결제 완료 시점에 반영
    if (purpose === 'EXTEND_LOCKER' && selectedLockerNo && selectedProduct) {
      await api.extendLocker(selectedLockerNo, selectedProduct.days || 30, selectedProduct.standard_price);
    }

    handleLogout();
  };

  return (
    <div className="kiosk-container">
      {/* 전역 토스트 팝업 */}
      {toast && (
        <div className="kiosk-toast">
          <Sparkles size={20} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* A. 인트로 광고 화면 단계 */}
      {step === 'INTRO' && (
        <IntroScreen onStart={handleStartKiosk} />
      )}

      {/* B. 본격 조작 화면 템플릿 */}
      {step !== 'INTRO' && (
        <>
          {/* FHD 광고 상단 롤링 (메인 기능 실행 중에도 FHD 광고는 24시간 돌아가서 고객 시선을 사로잡음) */}
          <div className="kiosk-ad-area" style={{ height: '360px', borderBottom: '1px solid var(--glass-border)' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(to top, #0a0c10 0%, rgba(10,12,16,0.3) 100%), url(https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1080&q=80) center/cover no-repeat',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '24px'
              }}
            >
              <div>
                <span style={{ color: 'var(--neon-indigo)', fontSize: '13px', fontWeight: 800, letterSpacing: '1px' }}>PREMIUM ACADEMY</span>
                <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>LocalMaster 무인 골프 스튜디오</h3>
              </div>
            </div>
          </div>

          {/* 메인 기능 터미널 구역 */}
          <div className="kiosk-terminal-area" style={{ height: '1560px', padding: '30px' }}>
            
            {/* 최상단 지점 및 세션 네비게이션 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div 
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (confirm('메인 광고 화면으로 나가시겠습니까?')) {
                    handleLogout();
                  }
                }}
              >
                <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#fff' }}>
                  Local<span style={{ color: 'var(--neon-indigo)', textShadow: '0 0 10px var(--neon-indigo-glow)' }}>Master</span>
                </h1>
              </div>

              {/* 현재 로그인 회원 카드 요약 */}
              {authMember ? (
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '8px 20px', 
                    borderRadius: '12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    border: '1px solid var(--neon-indigo)'
                  }}
                >
                  <UserCheck size={18} style={{ color: 'var(--neon-green)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700 }}>
                    <strong style={{ color: 'var(--neon-green)' }}>{authMember.member_name}</strong> 회원님
                  </span>
                  <button 
                    onClick={handleLogout}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: 'var(--neon-red)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <LogOut size={12} />
                    종료
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* KO/EN 다국어 선택 탭 */}
                  <div className="glass-panel" style={{ display: 'flex', padding: '4px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)' }}>
                    <button 
                      onClick={() => setLang('KO')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: lang === 'KO' ? 'var(--neon-indigo)' : 'transparent',
                        color: lang === 'KO' ? '#fff' : 'var(--text-secondary)',
                        boxShadow: lang === 'KO' ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      KO
                    </button>
                    <button 
                      onClick={() => setLang('EN')}
                      style={{
                        padding: '6px 14px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: lang === 'EN' ? 'var(--neon-indigo)' : 'transparent',
                        color: lang === 'EN' ? '#fff' : 'var(--text-secondary)',
                        boxShadow: lang === 'EN' ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      EN
                    </button>
                  </div>
                  <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '1px' }}>
                    SYSTEM READY
                  </span>
                </div>
              )}
            </div>

            {/* ErrorMaster-First 진단 에러 카드 (회원권 만료 등) */}
            {errorMasterCard && (
              <div 
                className="neon-border-red"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '2px solid var(--neon-red)',
                  padding: '30px',
                  borderRadius: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: '0 0 30px rgba(239,68,68,0.2)',
                  marginBottom: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--neon-red)' }}>
                  <ShieldAlert size={36} className="glow-text-red" />
                  <h3 style={{ fontSize: '24px', fontWeight: 900 }}>ErrorMaster 진단: 이용 제약 안내</h3>
                </div>
                
                <p style={{ fontSize: '18px', color: '#fca5a5', fontWeight: 600, lineHeight: '1.6' }}>
                  {errorMasterCard.detail}
                </p>

                <div 
                  style={{ 
                    borderTop: '1px solid rgba(239,68,68,0.2)', 
                    paddingTop: '14px', 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: '14px', 
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace'
                  }}
                >
                  <span>코드: {errorMasterCard.code}</span>
                  <span style={{ color: 'var(--neon-amber)' }}>TRACE_ID: {errorMasterCard.traceId}</span>
                </div>
                
                <button
                  className="kiosk-btn kiosk-btn-danger"
                  style={{ height: '54px', fontSize: '16px', fontWeight: 800, marginTop: '8px', borderRadius: '10px' }}
                  onClick={() => setErrorMasterCard(null)}
                >
                  확인 및 닫기
                </button>
              </div>
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 1: 메인 메뉴 대시보드 (Data Density 최적화 다단 컬럼)
                ---------------------------------------------------------------- */}
            {step === 'MAIN_DASHBOARD' && (
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '40px',
                  justifyContent: 'center',
                  height: '100%',
                  maxHeight: '1080px'
                }}
              >
                {/* 웰컴 배너 */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '38px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                    {TRANSLATIONS[lang].welcome}
                  </h2>
                  <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                    {TRANSLATIONS[lang].subWelcome}
                  </p>
                </div>

                {/* 메뉴 다단 컬럼 (2단 Grid 배치 - Data Density 확보) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '30px' }}>
                  
                  {/* 메뉴 1. 회원권 타석 배정 */}
                  <div
                    onClick={() => {
                      setPurpose('ALLOCATE_MEMBERSHIP');
                      if (authMember) {
                        setStep('TEEBOX_MAP');
                      } else {
                        setStep('MEMBER_AUTH');
                      }
                    }}
                    className="glass-panel glass-panel-glow glass-panel-interactive"
                    style={{
                      height: '240px',
                      padding: '30px',
                      borderRadius: '24px',
                      cursor: 'pointer',
                      border: '1.5px solid rgba(99, 102, 241, 0.25)',
                      background: 'rgba(99, 102, 241, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Compass size={40} style={{ color: 'var(--neon-indigo)' }} />
                      <span style={{ fontSize: '13px', fontWeight: 900, background: 'var(--neon-indigo)', color: '#fff', padding: '3px 10px', borderRadius: '10px', letterSpacing: '1px' }}>
                        {TRANSLATIONS[lang].popular}
                      </span>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                        {TRANSLATIONS[lang].memberAuth}
                      </h3>
                      <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
                        {TRANSLATIONS[lang].memberAuthSub}
                      </p>
                    </div>
                  </div>

                  {/* 메뉴 2. 일일타석권 타석 배정 */}
                  <div
                    onClick={() => {
                      setPurpose('ALLOCATE_DAILY');
                      setStep('TEEBOX_MAP'); // 일일권은 타석을 먼저 선점한 뒤 구매 진행
                    }}
                    className="glass-panel glass-panel-glow glass-panel-interactive"
                    style={{
                      height: '240px',
                      padding: '30px',
                      borderRadius: '24px',
                      cursor: 'pointer',
                      border: '1.5px solid rgba(16, 185, 129, 0.25)',
                      background: 'rgba(16, 185, 129, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <CreditCard size={40} style={{ color: 'var(--neon-green)' }} />
                      <span style={{ fontSize: '13px', fontWeight: 900, background: 'var(--neon-green)', color: '#fff', padding: '3px 10px', borderRadius: '10px', letterSpacing: '1px' }}>
                        {TRANSLATIONS[lang].guestAllowed}
                      </span>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                        {TRANSLATIONS[lang].dailyAuth}
                      </h3>
                      <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
                        {TRANSLATIONS[lang].dailyAuthSub}
                      </p>
                    </div>
                  </div>

                  {/* 메뉴 3. 타석 이동 */}
                  <div
                    onClick={() => {
                      setPurpose('MOVE_BAY');
                      if (authMember) {
                        setStep('TEEBOX_MAP');
                      } else {
                        setStep('MEMBER_AUTH');
                      }
                    }}
                    className="glass-panel glass-panel-glow glass-panel-interactive"
                    style={{
                      height: '220px',
                      padding: '30px',
                      borderRadius: '24px',
                      cursor: 'pointer',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      background: 'rgba(6, 182, 212, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <ArrowLeftRight size={36} style={{ color: 'var(--neon-cyan)' }} />
                    <div>
                      <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>
                        {TRANSLATIONS[lang].moveBay}
                      </h3>
                      <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                        {TRANSLATIONS[lang].moveBaySub}
                      </p>
                    </div>
                  </div>

                  {/* 메뉴 4. 회원권 및 상품 구매 */}
                  <div
                    onClick={() => {
                      setPurpose('PURCHASE_PRODUCT');
                      if (authMember) {
                        setStep('PRODUCT_SHOP');
                      } else {
                        setStep('MEMBER_AUTH');
                      }
                    }}
                    className="glass-panel glass-panel-glow glass-panel-interactive"
                    style={{
                      height: '220px',
                      padding: '30px',
                      borderRadius: '24px',
                      cursor: 'pointer',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      background: 'rgba(245, 158, 11, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Calendar size={36} style={{ color: 'var(--neon-amber)' }} />
                    <div>
                      <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>
                        {TRANSLATIONS[lang].purchaseMembership}
                      </h3>
                      <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                        {TRANSLATIONS[lang].purchaseMembershipSub}
                      </p>
                    </div>
                  </div>

                  {/* 메뉴 5. 라카 대여 및 연장 (하단 전체 너비 다단 통합형) */}
                  <div
                    onClick={() => {
                      setPurpose('EXTEND_LOCKER');
                      if (authMember) {
                        setStep('LOCKER_EXTEND');
                      } else {
                        setStep('MEMBER_AUTH');
                      }
                    }}
                    className="glass-panel glass-panel-glow glass-panel-interactive"
                    style={{
                      gridColumn: 'span 2',
                      height: '140px',
                      padding: '24px 30px',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      border: '1px solid var(--glass-border)',
                      background: 'rgba(255, 255, 255, 0.01)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <KeyRound size={36} style={{ color: '#818cf8' }} />
                      <div>
                        <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>개인 사물함 라카 대여 및 연장</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          이용 중인 라카의 만료 일정을 즉시 카드 결제하여 연장하거나 신규 사물함을 대여합니다.
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#818cf8' }}>바로가기 &gt;</span>
                  </div>

                </div>
              </div>
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2: 회원인증 (폰번호 / QR 스캔)
                ---------------------------------------------------------------- */}
            {step === 'MEMBER_AUTH' && (
              <MemberAuth
                onAuthSuccess={handleAuthSuccess}
                onCancel={handleLogout}
                onSignUpClick={() => setStep('MEMBER_REGISTER')}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.5: 신규 즉석 회원가입 (한글 오토마타 가상키보드 연동)
                ---------------------------------------------------------------- */}
            {step === 'MEMBER_REGISTER' && (
              <MemberRegister
                onRegisterSuccess={handleRegisterSuccess}
                onCancel={handleLogout}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 3: 타석 배치 맵 (선점 락 연동)
                ---------------------------------------------------------------- */}
            {step === 'TEEBOX_MAP' && (
              <TeeboxMap
                memberNo={authMember?.member_no}
                memberName={authMember?.member_name}
                isMoveMode={purpose === 'MOVE_BAY'}
                onBaySelected={handleBaySelected}
                onCancel={handleLogout}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 4: 회원권 / 일일권 상품 매대
                ---------------------------------------------------------------- */}
            {step === 'PRODUCT_SHOP' && (
              <ProductShop
                memberNo={authMember?.member_no}
                memberName={authMember?.member_name}
                onProductSelected={handleProductSelected}
                onCancel={handleLogout}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 5: 라카 조회 및 연장/구매
                ---------------------------------------------------------------- */}
            {step === 'LOCKER_EXTEND' && authMember && (
              <LockerExtend
                memberNo={authMember.member_no}
                memberName={authMember.member_name}
                onLockerPaymentTriggered={handleLockerPaymentTriggered}
                onCancel={handleLogout}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 6: 가상 결제 단말기 & 영수증 인출
                ---------------------------------------------------------------- */}
            {step === 'PAYMENT' && (
              <PaymentTerminal
                productName={selectedProduct ? selectedProduct.prod_nm : (purpose === 'ALLOCATE_MEMBERSHIP' ? '회원권 타석 배정' : '라카 연장 대여')}
                amount={selectedProduct ? selectedProduct.standard_price : 0}
                assignedBayNo={selectedBayNo}
                assignedLockerNo={selectedLockerNo}
                onPaymentSuccess={handlePaymentCompleted}
                onCancel={handleLogout}
              />
            )}

          </div>
        </>
      )}
    </div>
  );
}
