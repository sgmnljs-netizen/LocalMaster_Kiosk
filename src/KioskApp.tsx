import React, { useEffect, useState } from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, CreditCard, 
  KeyRound, RefreshCw, LogOut, ShieldAlert, Sparkles, UserCheck, UserPlus
} from 'lucide-react';
import { IntroScreen } from './components/IntroScreen';
import { MemberAuth } from './components/MemberAuth';
import { MemberRegister } from './components/MemberRegister';
import { TeeboxMap } from './components/TeeboxMap';
import { ProductShop } from './components/ProductShop';
import { LockerExtend } from './components/LockerExtend';
import { PaymentTerminal } from './components/PaymentTerminal';
import { Par3Allocation } from './components/Par3Allocation';
import { TopTeeboxDashboard } from './components/TopTeeboxDashboard';
import { PracticeSelect } from './components/PracticeSelect';
import { CompanionSetupModal, CompanionTargetItem } from './components/CompanionSetupModal';
import { ErrorMessageModal, ErrorModalData } from './components/ErrorMessageModal';
import { CheckinSelect } from './components/CheckinSelect';
import { api, Member, Product, Bay } from './services/api';
import KioskMainDashboard from './components/MainPage/KioskMainDashboard';

type KioskStep = 
  | 'INTRO' 
  | 'MAIN_DASHBOARD' 
  | 'MEMBER_AUTH' 
  | 'MEMBER_REGISTER'
  | 'PRACTICE_SELECT'
  | 'CHECKIN_SELECT'
  | 'TEEBOX_MAP' 
  | 'PRODUCT_SHOP' 
  | 'LOCKER_EXTEND'
  | 'PAR3_ALLOCATION'
  | 'PAYMENT'
  | 'ASSET_SELECT';

type KioskPurpose = 
  | 'ALLOCATE_DAILY'       // 일일 타석 배정
  | 'ALLOCATE_MEMBERSHIP'  // 회원권 타석 배정
  | 'PURCHASE_PRODUCT'     // 회원권/일일권 구매
  | 'EXTEND_LOCKER'        // 라카 대여 및 연장
  | 'MOVE_BAY'             // 사용 중인 타석 변경
  | 'BOOK_PAR3'            // 파3 연습 라운딩 예약
  | 'CHECKIN_RESERVATION'; // 사전 예약 타석 체크인

// 🌐 글로벌 다국어 번역 딕셔너리 (i18n)
const TRANSLATIONS = {
  KO: {
    welcome: '원하시는 서비스를 선택해 주세요',
    subWelcome: '터치 한 번으로 빠르게 회원인증 및 타석을 배정받으실 수 있습니다.',
    recommend: '가장 빠른 예약',
    practiceTeebox: '연습타석배정',
    practiceTeeboxSub: '보유 중인 회원 이용권(기간제/횟수제) 또는 일일 타석권을 배정받아 연습을 시작합니다.',
    par3Course: '파3 코스배정',
    par3CourseSub: '천연 잔디 파3 연습 라운딩 코스를 간편하게 예약하고 배정받습니다.',
    purchaseMembership: '회원권 구매',
    purchaseMembershipSub: '1개월/3개월 종일 회원권 등 정기 회원권을 신규 결제 구매합니다.',
    moveBay: '타석이동',
    moveBaySub: '현재 이용 중인 타석의 위치를 다른 비어있는 빈 타석으로 변경합니다.',
    lockerExtend: '라카연장',
    lockerExtendSub: '이용 중인 라카의 만료 일정을 즉시 카드 결제하여 연장하거나 신규 사물함을 대여합니다.',
    signUp: '회원가입',
    signUpSub: '아직 회원이 아니신가요? 간편하게 신규 즉석 회원가입 후 혜택을 받아보세요.',
    exit: '종료',
    prev: '돌아가기',
    confirm: '선택 완료',
    popular: '최우선',
    guestAllowed: '비회원 가능',
    shortcut: '바로가기'
  },
  EN: {
    welcome: 'Please select a service',
    subWelcome: 'Quickly authenticate and assign your teebox with a single touch.',
    recommend: 'FASTEST BOOKING',
    practiceTeebox: 'Practice Teebox',
    practiceTeeboxSub: 'Assign your teebox instantly using active membership Pass or Daily ticket.',
    par3Course: 'Par-3 Course Booking',
    par3CourseSub: 'Quickly reserve and get assigned for natural grass Par-3 practice roundings.',
    purchaseMembership: 'Purchase Pass',
    purchaseMembershipSub: 'Purchase 1-month or 3-month full-day club memberships.',
    moveBay: 'Change Teebox',
    moveBaySub: 'Move your current active teebox to another vacant teebox space.',
    lockerExtend: 'Locker Extend',
    lockerExtendSub: 'Extend your locker expiration date or rent a new storage locker.',
    signUp: 'Sign Up',
    signUpSub: 'Not a member yet? Register easily on site to enjoy exclusive club benefits.',
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
  const [initialAuthMode, setInitialAuthMode] = useState<'PHONE' | 'QR' | 'FACE'>('FACE');

  // 세션 정보
  const [authMember, setAuthMember] = useState<Member | null>(null);
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(null);
  const [selectedBayNos, setSelectedBayNos] = useState<number[]>([]);
  const [showCompanionModal, setShowCompanionModal] = useState<boolean>(false);
  const [selectedLockerNo, setSelectedLockerNo] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [currentHoldResId, setCurrentHoldResId] = useState<string | null>(null);

  // UI 상태
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null);
  const [errorMasterCard, setErrorMasterCard] = useState<{ code: string; detail: string; traceId: string } | null>(null);
  const [errorModal, setErrorModal] = useState<ErrorModalData>({ isVisible: false, message: '' });
  const [storeName, setStoreName] = useState<string>('SGM Golf Academy');
  const [checkinPolicy, setCheckinPolicy] = useState<string>('CHECKIN_REQUIRED');
  const [hwFailAlert, setHwFailAlert] = useState<{ bayNo: number; resId: string } | null>(null);

  // 미들웨어 헬스체크 오프라인 감지
  const [isMiddlewareOffline, setIsMiddlewareOffline] = useState<boolean>(false);

  useEffect(() => {
    const checkMw = async () => {
      const status = await api.getMiddlewareStatus();
      setIsMiddlewareOffline(!status.online);
    };

    checkMw();
    const interval = setInterval(checkMw, 30000); // 30초 주기 Heartbeat Polling
    return () => clearInterval(interval);
  }, []);

  const showErrorModal = (message: string, title?: string, isHw: boolean = false, errorCode?: string | number) => {
    setErrorModal({
      isVisible: true,
      title: title || (isHw ? '타석 기기 가동 확인 필요' : '타석 배정 오류'),
      message,
      errorCode,
      isHardwareFail: isHw
    });
  };

  // 실시간 타석 데이터 상태
  const [bays, setBays] = useState<Bay[]>([]);


  const loadBays = async () => {
    try {
      const data = await api.getBays();
      setBays(data);
    } catch {
      console.error('Failed to load bays');
    }
  };

  // 0. 가맹점 상호명 및 동적 체크인 정책 로드 + WebSocket 실시간 채널 연결
  useEffect(() => {
    const fetchStoreInfo = async () => {
      const info = await api.getStoreInfo();
      setStoreName(info.store_nm);
      setCheckinPolicy(info.checkin_policy);
    };
    fetchStoreInfo();
    loadBays();

    // [Phase 2: WS-2] WebSocket 실시간 수신 연결
    // bay_updated 이벤트를 받으면 폴링 없이 즉시 setBays 업데이트
    const wsCleanup = api.connectBayWebSocket(
      (updatedBay) => {
        // 단일 타석 온라인 업데이트 — 전체 재조회 없이 O(n) 부분 갱신
        setBays(prev => prev.map(b => b.bay_no === updatedBay.bay_no ? { ...b, ...updatedBay } : b));
      },
      (msg) => {
        const data = msg as Record<string, unknown>;
        if (data.type === 'middleware_offline') {
          console.warn('[WS-Kiosk] 미들웨어 오프라인 신호 수신');
        }
      }
    );

    // [Fallback] 5초 폴링 — WS 연결 실패 또는 재연결 대기 중에도 타석 실화 보장
    const interval = setInterval(() => {
      loadBays();
      fetchStoreInfo();
    }, 5000);

    return () => {
      wsCleanup();
      clearInterval(interval);
    };
  }, []);

  // 1. 토스트 알림 타이머 자동 제거
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // 2. 무인기기 비활성 세션 아웃 (40초간 조작이 없으면 자동으로 광고 인트로로 복귀)
  useEffect(() => {
    if (step === 'INTRO') return;

    const resetTimer = () => {
      clearTimeout(sessionTimeout);
      sessionTimeout = setTimeout(() => {
        handleLogout();
        showToast(lang === 'KO' ? '일정 시간 조작이 없어 광고 화면으로 복귀합니다.' : 'Session timeout. Returning to ad screen.', false);
      }, 40000); // 40초
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
    if (currentHoldResId) {
      api.cancelHoldReservation(currentHoldResId).catch(console.error);
      setCurrentHoldResId(null);
    }
    // 선점된 타석이 있다면 해제 (메모리 누수 방지)
    if (selectedBayNo !== null) {
      api.releaseBay(selectedBayNo).catch(console.error);
    }
    if (selectedBayNos.length > 0) {
      api.releaseBays(selectedBayNos).catch(console.error);
    }
    setAuthMember(null);
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setStep('INTRO');
  };

  // 행위 완료 후 메인화면(MAIN_DASHBOARD)으로 세션 초기화 복귀
  const handleLogoutToHome = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    if (currentHoldResId) {
      api.cancelHoldReservation(currentHoldResId).catch(console.error);
      setCurrentHoldResId(null);
    }
    if (selectedBayNo !== null) {
      api.releaseBay(selectedBayNo).catch(console.error);
    }
    if (selectedBayNos.length > 0) {
      api.releaseBays(selectedBayNos).catch(console.error);
    }
    setAuthMember(null);
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setStep('MAIN_DASHBOARD');
  };

  // 실시간 미니 모니터 타석 클릭 단축키
  const handleMiniBayClick = async (bayNo: number) => {
    showToast(lang === 'KO' ? `${bayNo}번 타석 선점 시도 중...` : `Securing teebox ${bayNo}...`);
    try {
      const success = await api.preoccupyBay(bayNo);
      if (success) {
        setSelectedBayNo(bayNo);
        // 타석이 선점된 상태로 연습타석 분기 선택으로 직행
        setStep('PRACTICE_SELECT');
      } else {
        showToast(lang === 'KO' ? '이미 다른 고객님께서 선택 중이거나 예약 불가능한 타석입니다.' : 'Failed to secure teebox.', false);
      }
    } catch {
      showToast(lang === 'KO' ? '타석 선점 처리 중 오류가 발생했습니다.' : 'Failed to preoccupy teebox.', false);
    }
  };

  // 메인 대시보드로 복귀 (세부 프로세스 중단 및 가상 락 정리)
  const handleGoHome = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    if (currentHoldResId) {
      api.cancelHoldReservation(currentHoldResId).catch(console.error);
      setCurrentHoldResId(null);
    }
    // [BugFix] 배정이 진행 중(중도 취소)일 때만 선점 락을 해제하도록 가딩
    if (selectedBayNo !== null && purpose !== 'ALLOCATE_DAILY' && purpose !== 'ALLOCATE_MEMBERSHIP') {
      api.releaseBay(selectedBayNo).catch(console.error);
    }
    if (selectedBayNos.length > 0) {
      api.releaseBays(selectedBayNos).catch(console.error);
    }
    setAuthMember(null); // 메인화면 복귀 시 로그인 세션 즉시 파기 (공용 키오스크 보안 강화)
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setStep('MAIN_DASHBOARD');
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
        if (selectedBayNos.length > 0) {
          setShowCompanionModal(true);
          setStep('PRACTICE_SELECT');
        } else {
          setSelectedAssetId(null);
          setStep('ASSET_SELECT');
        }
      }
    } else if (purpose === 'PURCHASE_PRODUCT') {
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'EXTEND_LOCKER') {
      setStep('LOCKER_EXTEND');
    } else if (purpose === 'MOVE_BAY') {
      setStep('TEEBOX_MAP');
    } else if (purpose === 'CHECKIN_RESERVATION') {
      setStep('CHECKIN_SELECT');
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
      // 회원권 타석 배정은 이용권 선택 화면으로 유도
      setSelectedAssetId(null);
      setStep('ASSET_SELECT');
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
          showErrorModal(res.message || '타석 이동을 진행할 수 없습니다.');
        }
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '타석 이동 처리 중 오류가 발생했습니다.' : 'Failed to move teebox.'));
      }
    }
  };

  // 2.5 선택한 이용권으로 타석 배정 최종 승인 처리
  const handleAssetSelected = async (memberItemId: number) => {
    if (selectedBayNo !== null && authMember) {
      try {
        // [BUG-3 FIX] payment_method='TICKET' 명시 전달 — 통합 API에서 이용권 차감 보장
        const res = await api.allocateBay(
          selectedBayNo, 60, authMember.member_no,
          undefined, undefined, memberItemId,
          'TICKET', 0
        );
        if (res.success) {
          await api.writeKioskLog('BAY_ALLOCATE_MEMBERSHIP', `회원권 타석배정 완료 (${selectedBayNo}번 타석, 이용권 ID: ${memberItemId})`, authMember.member_no);
          if (res.hardware_success === false) {
            showErrorModal(`${selectedBayNo}번 타석 배정은 완료되었으나, 센서/타석 기기 시작에 실패했습니다. 직원을 호출해 주세요.`, '타석 기기 가동 미완료', true);
          }
          const updated = await api.getMember(authMember.member_no);
          if (updated) setAuthMember(updated);
          setStep('PAYMENT');
        } else {
          showErrorModal(res.message || '회원 이용권 타석 배정에 실패했습니다.');
        }
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '타석 배정 처리 중 시스템 오류가 발생했습니다.' : 'Failed to allocate teebox.'));
      }
    }
  };

  // 2.5. 연습타석배정 화면에서 타석 및 배정 목적(회원권/일일권) 선택 완료 핸들러
  const handlePracticeSelectConfirm = async (bayNo: number, purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => {
    setSelectedBayNo(bayNo);
    setPurpose(purposeType);

    if (purposeType === 'ALLOCATE_MEMBERSHIP') {
      setInitialAuthMode('FACE');
      if (authMember) {
        await handleBaySelected(bayNo);
      } else {
        setStep('MEMBER_AUTH');
      }
    } else if (purposeType === 'ALLOCATE_DAILY') {
      setStep('PRODUCT_SHOP');
    }
  };

  // 2.6. 동반자 다중 타석 선택 완료 핸들러
  const handleGroupBaySelected = (bayNos: number[]) => {
    setSelectedBayNos(bayNos);
    setPurpose('ALLOCATE_MEMBERSHIP');
    if (authMember) {
      setShowCompanionModal(true);
    } else {
      setInitialAuthMode('FACE');
      setStep('MEMBER_AUTH');
    }
  };

  // 2.7. 동반자 배정 설정 완료 및 일괄 배정/결제 승인
  const handleCompanionConfirm = async (targets: CompanionTargetItem[]) => {
    setShowCompanionModal(false);
    const totalPrice = targets.reduce((sum, t) => sum + t.price, 0);

    if (totalPrice === 0) {
      // 모두 회원권 차감인 경우 즉시 다중 배정 수행
      showToast(lang === 'KO' ? '동반자 타석 일괄 배정을 진행 중입니다...' : 'Allocating group teeboxes...');
      try {
        for (const t of targets) {
          // [BUG-3 FIX] payment_method='TICKET' 명시 전달
          const res = await api.allocateBay(t.bayNo, t.durationMin, t.memberNo, t.memberName, t.hp, t.memberItemId, 'TICKET', 0);
          if (!res.success) {
            showErrorModal(res.message || `${t.bayNo}번 동반자 타석 배정에 실패했습니다.`);
            return;
          }
        }
        showToast(lang === 'KO' ? '동반자 타석 배정이 모두 완료되었습니다!' : 'Group teebox allocation completed!');
        setStep('PAYMENT');
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '동반자 타석 배정 처리 중 오류가 발생했습니다.' : 'Group allocation failed.'));
      }
    } else {
      // 일일권 결제가 포함된 경우 결제 단말기 퍼널로 전이
      setSelectedProduct({
        prod_cd: 'PROD_GROUP',
        prod_nm: `동반자 ${targets.length}개 타석 일괄 결제`,
        standard_price: totalPrice,
        logic_type: 'MEMBERSHIP',
        duration_min: 60
      });
      setStep('PAYMENT');
    }
  };

  // 3. 상품 매대에서 구매 상품 선택 완료
  const handleProductSelected = async (prod: Product) => {
    if (purpose === 'ALLOCATE_DAILY' && selectedBayNo) {
      showToast(lang === 'KO' ? '결제 대기 예약을 생성 중입니다...' : 'Creating hold reservation...');
      try {
        const res = await api.createHoldReservation(
          selectedBayNo,
          prod.duration_min || 60,
          authMember?.member_no,
          authMember?.member_name || '비회원',
          authMember?.hp || '010-0000-0000'
        );
        if (res.success && res.res_id) {
          setCurrentHoldResId(res.res_id);
          setSelectedProduct(prod);
          setStep('PAYMENT');
        } else {
          showErrorModal(res.message || '결제 대기 예약 생성에 실패했습니다.');
        }
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '결제 대기 예약 생성 중 오류가 발생했습니다.' : 'Failed to create hold reservation.'));
      }
    } else {
      setSelectedProduct(prod);
      if (purpose === 'PURCHASE_PRODUCT' || purpose === 'ALLOCATE_DAILY') {
        setStep('PAYMENT');
      }
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
    
    // [BUG-1 FIX] 일일권 배정: allocateBay + processPaymentWebhook 이중 호출 제거
    // 통합 API(POST /api/v1/kiosk/allocate-bay)로 단일 처리 (CoreEngine 2회 호출 방지)
    if (purpose === 'ALLOCATE_DAILY' && selectedBayNo && selectedProduct) {
      try {
        const allocResult = await api.allocateBay(
          selectedBayNo,
          selectedProduct.duration_min || 60,
          authMember?.member_no,
          authMember?.member_name || '비회원',
          authMember?.hp || '010-0000-0000',
          undefined,       // member_item_id — 일일권은 null
          'CARD',          // [BUG-3 FIX] payment_method 명시
          selectedProduct.standard_price  // [BUG-3 FIX] 매출 금액 전달
        );
        if (allocResult) {
          if (!allocResult.success) {
            showErrorModal(allocResult.message || '일일권 타석 배정에 실패했습니다. 카운터 직원을 호출해 주세요.');
          } else if (allocResult.hardware_success === false) {
            setHwFailAlert({ bayNo: selectedBayNo, resId: allocResult.res_id || '' });
            showErrorModal(`${selectedBayNo}번 타석 결제는 완료되었으나 센서 기기 가동에 실패했습니다. 직원을 호출해주세요.`, '타석 기기 시작 확인 필요', true);
          }
        }
      } catch (err: any) {
        console.error('[BUG-1 FIX] 일일권 타석 배정 실패:', err);
        showErrorModal(err?.message || '타석 배정 중 오류가 발생했습니다. 직원에게 문의해주세요.');
      }
    }

    // 일반 회원권 구매 성공인 경우
    if (purpose === 'PURCHASE_PRODUCT' && authMember && selectedProduct) {
      await api.purchaseProduct(authMember.member_no, selectedProduct.prod_cd, selectedProduct.standard_price);
    }

    // 라카 연장/대여 결제 완료 시점에 반영
    if (purpose === 'EXTEND_LOCKER' && selectedLockerNo && selectedProduct) {
      await api.extendLocker(selectedLockerNo, selectedProduct.days || 30, selectedProduct.standard_price);
    }

    // 성공적으로 배정된 타석 변수 초기화 (중복 release 락 해제 방지)
    setSelectedBayNo(null);
    setSelectedBayNos([]);

    // 최신 타석 상태 재조회
    await loadBays();

    setCurrentHoldResId(null);
    handleLogoutToHome();
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

      {/* [Fix-5] 하드웨어 가동 실패 — 직원 호출 전체 화면 알림 */}
      {hwFailAlert && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24
        }}>
          <ShieldAlert size={72} color="#ef4444" />
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, textAlign: 'center' }}>
            {hwFailAlert.bayNo}번 타석 기기 가동 실패
          </h2>
          <p style={{ color: '#fca5a5', fontSize: 18, textAlign: 'center', maxWidth: 480 }}>
            결제 및 배정은 완료되었습니다.<br />
            직원을 호출하여 타석 기기를 수동으로 가동해 주세요.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>예약번호: {hwFailAlert.resId}</p>
          <button
            onClick={() => { setHwFailAlert(null); handleLogoutToHome(); }}
            style={{
              marginTop: 12, padding: '16px 48px',
              background: '#ef4444', color: '#fff',
              border: 'none', borderRadius: 12,
              fontSize: 20, fontWeight: 700, cursor: 'pointer'
            }}
          >
            직원 확인 완료
          </button>
        </div>
      )}

      {/* A. 인트로 광고 화면 단계 */}
      {step === 'INTRO' && (
        <IntroScreen onStart={handleStartKiosk} storeName={storeName} />
      )}

      {/* B. 본격 조작 화면 템플릿 */}
      {step !== 'INTRO' && (
        <>
          {/* step === 'MAIN_DASHBOARD' 일 때만 대형 실시간 타석 종합 전광판 노출 (기존 광고 영역 대체) */}
          {step === 'MAIN_DASHBOARD' && (
            <TopTeeboxDashboard bays={bays} onBayClick={handleMiniBayClick} lang={lang} />
          )}

          {/* 메인 기능 터미널 구역 (대시보드일 때는 1560px, 나머지 단계일 때는 1920px 전체화면으로 가변 확장) */}
          <div 
            className="kiosk-terminal-area-luxury" 
            style={{ 
              height: step === 'MAIN_DASHBOARD' ? '1560px' : '1920px', 
              padding: '30px',
              transition: 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
          >
            
            {/* 최상단 지점 및 세션 네비게이션 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              {step === 'MAIN_DASHBOARD' ? (
                <div 
                  style={{ cursor: 'pointer', width: '120px', height: '40px' }}
                  onClick={() => {
                    if (confirm('메인 광고 화면으로 나가시겠습니까?')) {
                      handleLogout();
                    }
                  }}
                />
              ) : (
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    cursor: 'pointer',
                    padding: '8px 18px',
                    borderRadius: '20px',
                    background: 'rgba(0, 113, 227, 0.05)',
                    border: '1px solid rgba(0, 113, 227, 0.15)',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={handleGoHome}
                >
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#0071e3' }}>◀</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f' }}>
                    {lang === 'KO' ? '처음으로' : 'Home'}
                  </span>
                </div>
              )}

              {/* 현재 로그인 회원 카드 요약 */}
              {authMember ? (
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '12px 24px', 
                    borderRadius: '24px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    border: '1px solid rgba(52, 199, 89, 0.25)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  <UserCheck size={18} style={{ color: '#0071e3' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700 }}>
                    <strong style={{ color: '#0071e3' }}>{authMember.member_name}</strong> 회원님
                  </span>
                  <button 
                    onClick={handleLogout}
                    style={{
                      background: 'rgba(255, 59, 48, 0.08)',
                      border: '0.5px solid rgba(255, 59, 48, 0.25)',
                      color: 'var(--neon-red)',
                      padding: '6px 14px',
                      borderRadius: '16px',
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
                  <div className="glass-panel" style={{ display: 'flex', padding: '4px', borderRadius: '24px', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <button 
                      onClick={() => setLang('KO')}
                      style={{
                        padding: '6px 16px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        background: lang === 'KO' ? '#0071e3' : 'transparent',
                        color: lang === 'KO' ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      KO
                    </button>
                    <button 
                      onClick={() => setLang('EN')}
                      style={{
                        padding: '6px 16px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        background: lang === 'EN' ? '#0071e3' : 'transparent',
                        color: lang === 'EN' ? '#fff' : 'var(--text-secondary)',
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
                📥 STEP 1: 메인 메뉴 대시보드 (2026 Premium Bento Box)
                ---------------------------------------------------------------- */}
            {step === 'MAIN_DASHBOARD' && (
              <KioskMainDashboard 
                lang={lang}
                onPracticeTeebox={() => setStep('PRACTICE_SELECT')}
                onPar3Allocation={() => {
                  setPurpose('BOOK_PAR3');
                  setStep('PAR3_ALLOCATION');
                }}
                onPurchaseMembership={() => {
                  setPurpose('PURCHASE_PRODUCT');
                  setInitialAuthMode('FACE');
                  if (authMember) {
                    setStep('PRODUCT_SHOP');
                  } else {
                    setStep('MEMBER_AUTH');
                  }
                }}
                onMoveBay={() => {
                  setPurpose('MOVE_BAY');
                  setInitialAuthMode('FACE');
                  if (authMember) {
                    setStep('TEEBOX_MAP');
                  } else {
                    setStep('MEMBER_AUTH');
                  }
                }}
                onLockerExtend={() => {
                  setPurpose('EXTEND_LOCKER');
                  setInitialAuthMode('FACE');
                  if (authMember) {
                    setStep('LOCKER_EXTEND');
                  } else {
                    setStep('MEMBER_AUTH');
                  }
                }}
                onSignUp={() => setStep('MEMBER_REGISTER')}
                onCheckin={checkinPolicy !== 'DISABLED' ? () => {
                  setPurpose('CHECKIN_RESERVATION');
                  setStep('MEMBER_AUTH');
                } : undefined}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.7: 예약 타석 체크인 (CheckinSelect & Route Guard)
                ---------------------------------------------------------------- */}
            {step === 'CHECKIN_SELECT' && authMember && (
              checkinPolicy === 'DISABLED' ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
                  <h3>{lang === 'KO' ? '본 매장은 현재 체크인 메뉴를 사용하지 않습니다.' : 'Check-in is currently disabled in this store.'}</h3>
                  <button onClick={handleGoHome} style={{ padding: '12px 24px', borderRadius: '8px', background: '#10b981', border: 'none', color: '#fff', marginTop: '20px', cursor: 'pointer' }}>
                    {lang === 'KO' ? '메인 화면으로' : 'Return Main'}
                  </button>
                </div>
              ) : (
                <CheckinSelect
                  memberNo={authMember.member_no}
                  memberName={authMember.member_name}
                  lang={lang}
                  onCheckinSuccess={(bayNo, resId) => {
                    setSelectedBayNo(bayNo);
                    setCurrentHoldResId(resId);
                    showToast(lang === 'KO' ? `${bayNo}번 타석 체크인이 완료되었습니다.` : `Bay ${bayNo} check-in completed.`);
                    setStep('PAYMENT');
                  }}
                  onCancel={handleGoHome}
                />
              )
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2: 회원인증 (안면 / 폰번호 / QR 스캔)
                ---------------------------------------------------------------- */}
            {step === 'MEMBER_AUTH' && (
              <MemberAuth
                initialAuthMode={initialAuthMode}
                onAuthSuccess={handleAuthSuccess}
                onCancel={() => {
                  if (purpose === 'ALLOCATE_MEMBERSHIP') {
                    setStep('PRACTICE_SELECT');
                  } else {
                    handleGoHome();
                  }
                }}
                onSignUpClick={() => setStep('MEMBER_REGISTER')}
                onAuthError={(code, detail) => {
                  const trace = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
                  setErrorMasterCard({
                    code,
                    detail,
                    traceId: trace
                  });
                  api.writeKioskLog('AUTH_ERROR', `${detail} (Trace ID: ${trace})`);
                  setStep('MAIN_DASHBOARD');
                }}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.5: 신규 즉석 회원가입 (한글 오토마타 가상키보드 연동)
                ---------------------------------------------------------------- */}
            {step === 'MEMBER_REGISTER' && (
              <MemberRegister
                onRegisterSuccess={handleRegisterSuccess}
                onCancel={handleGoHome}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.7: 연습타석배정 (실시간 현황판 + 층별 상세 그리드 및 분기)
                ---------------------------------------------------------------- */}
            {step === 'PRACTICE_SELECT' && (
              <PracticeSelect
                bays={bays}
                lang={lang}
                initialSelectedBayNo={selectedBayNo}
                onBaySelected={handlePracticeSelectConfirm}
                onGroupBaySelected={handleGroupBaySelected}
                onCancel={handleGoHome}
                onRefreshBays={loadBays}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.8: 동반자 다중 타석 설정 팝업 모달
                ---------------------------------------------------------------- */}
            {showCompanionModal && authMember && (
              <CompanionSetupModal
                selectedBayNos={selectedBayNos}
                bays={bays}
                leaderMember={authMember}
                lang={lang}
                onConfirm={handleCompanionConfirm}
                onCancel={() => {
                  setShowCompanionModal(false);
                  api.releaseBays(selectedBayNos).catch(console.error);
                  setSelectedBayNos([]);
                }}
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
                lang={lang}
                onBaySelected={handleBaySelected}
                onCancel={handleGoHome}
                bays={bays}
                onRefreshBays={loadBays}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 4: 회원권 / 일일권 상품 매대
                ---------------------------------------------------------------- */}
            {step === 'PRODUCT_SHOP' && (
              <ProductShop
                memberNo={authMember?.member_no}
                memberName={authMember?.member_name}
                purposeType={purpose as 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT'}
                onProductSelected={handleProductSelected}
                onCancel={purpose === 'ALLOCATE_DAILY' ? () => setStep('PRACTICE_SELECT') : handleGoHome}
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
                onCancel={handleGoHome}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 5.5: 파3 골프 라운딩 배정 및 예약
                ---------------------------------------------------------------- */}
            {step === 'PAR3_ALLOCATION' && (
              <Par3Allocation
                memberNo={authMember?.member_no}
                memberName={authMember?.member_name}
                onBookingSelected={(prod) => {
                  setSelectedProduct(prod);
                  setStep('PAYMENT');
                }}
                onCancel={handleGoHome}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 6: 가상 결제 단말기 & 영수증 인출
                ---------------------------------------------------------------- */}
            {/* ----------------------------------------------------------------
                📥 STEP 6: 가상 결제 단말기 & 영수증 인출
                ---------------------------------------------------------------- */}
            {step === 'PAYMENT' && (
              <PaymentTerminal
                productName={selectedProduct ? selectedProduct.prod_nm : (purpose === 'ALLOCATE_MEMBERSHIP' ? '회원권 타석 배정' : '라카 연장 대여')}
                amount={selectedProduct ? selectedProduct.standard_price : 0}
                assignedBayNo={selectedBayNo}
                assignedBayNos={selectedBayNos}
                assignedLockerNo={selectedLockerNo}
                resId={currentHoldResId}
                memberName={authMember?.member_name}
                memberNo={authMember?.member_no}
                onPaymentSuccess={handlePaymentCompleted}
                onCancel={handleGoHome}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 7: 보유 회원권 및 이용권 선택 (Asset Select)
                ---------------------------------------------------------------- */}
            {step === 'ASSET_SELECT' && authMember && (
              <div 
                style={{
                  padding: '40px',
                  borderRadius: '32px',
                  border: '1px solid #e5e5ea',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '30px',
                  color: '#1d1d1f',
                  width: '100%',
                  boxSizing: 'border-box',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                    {lang === 'KO' ? '보유 이용권 선택' : 'Select Active Pass'}
                  </h2>
                  <p style={{ fontSize: '18px', color: '#86868b', fontWeight: 600 }}>
                    {lang === 'KO' 
                      ? `${authMember.member_name} 님, 배정에 사용할 유효 이용권을 터치해 주세요.`
                      : `${authMember.member_name}, please select the pass to allocate.`}
                  </p>
                </div>

                {/* Asset List Grid */}
                <div 
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '16px',
                    maxHeight: '520px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}
                >
                  {(() => {
                    // 1. 현재 선택된 타석의 구역 옵션 추출 (기본값 BAY)
                    const targetZoneCode = bays.find(b => b.bay_no === selectedBayNo)?.zone_code?.toUpperCase() || 'BAY';
                    
                    // 2. 보유 자산 중 해당 구역을 허용하는 것만 필터링 (레슨권 등 빈 배열은 무조건 제외)
                    const validAssets = (authMember.assets || []).filter(asset => {
                      if (!asset.allowed_categories || asset.allowed_categories.length === 0) return false;
                      return asset.allowed_categories.map(c => c.toUpperCase()).includes(targetZoneCode);
                    });

                    if (validAssets.length === 0) {
                      return (
                        <div 
                          style={{
                            padding: '40px',
                            textAlign: 'center',
                            color: '#86868b',
                            fontSize: '18px',
                            fontWeight: 700,
                            border: '1px dashed #dadce0',
                            borderRadius: '16px'
                          }}
                        >
                          {lang === 'KO' ? '해당 타석에서 사용할 수 있는 이용권이 없습니다.' : 'No active pass items found for this zone.'}
                        </div>
                      );
                    }

                    return validAssets.map((asset) => {
                      const isAssetSelected = selectedAssetId === parseInt(asset.member_item_id);
                      return (
                        <div
                          key={asset.member_item_id}
                          onClick={() => setSelectedAssetId(parseInt(asset.member_item_id))}
                          className="premium-glass-card"
                          style={{
                            padding: '24px',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            border: isAssetSelected 
                              ? '2.5px solid #34c759' 
                              : '1.5px solid #dadce0',
                            background: isAssetSelected 
                              ? '#ffffff' 
                              : '#f5f5f7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.2s ease',
                            boxShadow: isAssetSelected 
                              ? '0 10px 25px rgba(52, 199, 89, 0.15)' 
                              : 'none',
                            transform: isAssetSelected ? 'scale(1.01)' : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div 
                              style={{
                                background: isAssetSelected ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0, 0, 0, 0.03)',
                                padding: '14px',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {/* Ticket SVG */}
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isAssetSelected ? '#34c759' : '#86868b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
                                <path d="M13 5v2"/>
                                <path d="M13 17v2"/>
                                <path d="M13 11v2"/>
                              </svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ 
                                fontSize: '20px', 
                                fontWeight: 800, 
                                color: isAssetSelected ? '#121419' : '#1d1d1f' 
                              }}>
                                {asset.item_name}
                              </span>
                              <span style={{ 
                                fontSize: '14px', 
                                color: isAssetSelected ? '#1d4e33' : '#86868b',
                                fontWeight: 600
                              }}>
                                {asset.rem_count !== undefined && asset.rem_count > 0 
                                  ? `${lang === 'KO' ? '남은 횟수' : 'Remaining'}: ${asset.rem_count}회` 
                                  : (lang === 'KO' ? '기간제 무제한 이용권' : 'Unlimited Period Pass')}
                              </span>
                            </div>
                          </div>

                          {/* Check Circle SVG when selected */}
                          {isAssetSelected && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                  <button 
                    className="kiosk-btn" 
                    style={{ width: '160px', height: '64px', borderRadius: '12px', fontSize: '18px', fontWeight: 800 }}
                    onClick={() => {
                      setSelectedAssetId(null);
                      setStep('MEMBER_AUTH');
                    }}
                  >
                    {lang === 'KO' ? '돌아가기' : 'Back'}
                  </button>

                  <button 
                    className="kiosk-btn kiosk-btn-primary" 
                    style={{ 
                      width: '260px', 
                      height: '64px', 
                      borderRadius: '12px', 
                      fontSize: '20px', 
                      fontWeight: 800 
                    }}
                    disabled={selectedAssetId === null}
                    onClick={() => selectedAssetId !== null && handleAssetSelected(selectedAssetId)}
                  >
                    {lang === 'KO' ? '선택한 이용권으로 배정' : 'Allocate with Selected Pass'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </>
      )}

      {/* 시각적 에러 메시지 팝업 모달 */}
      <ErrorMessageModal
        data={errorModal}
        onClose={() => setErrorModal((prev) => ({ ...prev, isVisible: false }))}
      />

      {/* 🛑 미들웨어 장애 점검 대형 차단 모달 (POS 표준) */}
      {isMiddlewareOffline && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(10, 12, 16, 0.92)',
            backdropFilter: 'blur(20px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '32px',
              border: '2px solid #ef4444',
              padding: '48px',
              maxWidth: '640px',
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(239, 68, 68, 0.3)',
              color: '#ffffff',
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#f87171', marginBottom: '12px' }}>
              타석 장비 미들웨어 점검 중
            </h2>
            <p style={{ fontSize: '18px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '32px' }}>
              현재 센서 기기 제어 서버(미들웨어) 점검 및 통신 확인 중입니다.<br />
              안전한 영업을 위해 키오스크 배정이 일시 차단되었습니다.<br />
              <strong>안내 데스크 직원에게 문의해 주세요.</strong>
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  api.writeKioskLog('STAFF_CALL', '미들웨어 점검 장애 화면에서 직원을 호출함');
                  alert('안내 데스크로 직원 호출 알림이 전송되었습니다.');
                }}
                style={{
                  padding: '16px 36px',
                  borderRadius: '20px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '20px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
                }}
              >
                🔔 직원 호출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
