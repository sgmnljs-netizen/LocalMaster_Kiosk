import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, CreditCard, Clock,
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
import { TimeMaster } from './utils/timeMaster';
import { CompanionSetupModal, CompanionTargetItem } from './components/CompanionSetupModal';
import { ErrorMessageModal, ErrorModalData } from './components/ErrorMessageModal';
import { CheckinSelect } from './components/CheckinSelect';
import { AllocationCompleteModal } from './components/AllocationCompleteModal';
import { PurchaseCompleteModal, CompletedPurchaseInfo } from './components/PurchaseCompleteModal';
import { api, Member, Product, Bay } from './services/api';
import type { CardApprovalResult } from './services/van/van_types';
import { kioskVanClient } from './services/van/van_client';
import { executeKioskAutoReversal } from './services/van/kioskPaymentReversal';
import KioskMainDashboard from './components/MainPage/KioskMainDashboard';
import { KioskBottomBar } from './components/KioskBottomBar';
import { useKioskSettings } from './stores/kioskSettings';
import { useHiddenAdminTrigger } from './hooks/useHiddenAdminTrigger';
import { AdminPinModal } from './components/AdminPinModal';
import { KioskSettingsModal } from './components/KioskSettingsModal';
import { MaintenanceOverlay } from './components/MaintenanceOverlay';
import { useKioskHardwareHeartbeat } from './hooks/useKioskHardwareHeartbeat';
import { recordKioskBlackBox } from './utils/kioskBlackBox';

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

const DEFAULT_SESSION_MIN = 60;

export default function KioskApp() {
  const { settings } = useKioskSettings();
  const [isAdminPinOpen, setIsAdminPinOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { handleTap: handleHiddenTap } = useHiddenAdminTrigger(5, 3000);

  // 🚦 키오스크 하드웨어 실시간 헬스체크 (30초 주기 하트비트)
  useKioskHardwareHeartbeat();

  const handleSecretTrigger = () => {
    setIsAdminPinOpen(true);
  };

  const [step, setStep] = useState<KioskStep>('INTRO');
  const [purpose, setPurpose] = useState<KioskPurpose | null>(null);
  const [lang, setLang] = useState<'KO' | 'EN'>('KO');
  const [initialAuthMode, setInitialAuthMode] = useState<'SMART_TAG' | 'FACE'>('SMART_TAG');
  const [faceTerminalEnabled, setFaceTerminalEnabled] = useState<boolean>(true);
  const effectiveFaceTerminalEnabled = faceTerminalEnabled && settings.authMethods?.FACE !== false;


  // 🔍 키오스크 화면 확대/축소 (Zoom Scale) 상태 및 localStorage 연동
  const [zoomScale, setZoomScale] = useState<number>(() => {
    const saved = localStorage.getItem('kiosk_zoom_scale');
    return saved ? parseFloat(saved) : 1.0;
  });

  const handleZoomIn = () => {
    setZoomScale(prev => {
      const next = Math.min(1.5, Math.round((prev + 0.05) * 100) / 100);
      localStorage.setItem('kiosk_zoom_scale', String(next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoomScale(prev => {
      const next = Math.max(0.4, Math.round((prev - 0.05) * 100) / 100);
      localStorage.setItem('kiosk_zoom_scale', String(next));
      return next;
    });
  };

  const handleZoomReset = () => {
    setZoomScale(1.0);
    localStorage.setItem('kiosk_zoom_scale', '1.0');
  };

  // 이중 클릭 및 중복 API 호출 방어 락 Ref
  const isAllocatingRef = useRef(false);

  // 세션 정보
  const [authMember, setAuthMember] = useState<Member | null>(null);
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(null);
  const [selectedBayNos, setSelectedBayNos] = useState<number[]>([]);
  const [companionTargets, setCompanionTargets] = useState<CompanionTargetItem[]>([]);
  const [showCompanionModal, setShowCompanionModal] = useState<boolean>(false);
  const [selectedLockerNo, setSelectedLockerNo] = useState<number | string | null>(null);
  const [selectedLockerDisplayNo, setSelectedLockerDisplayNo] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [currentHoldResId, setCurrentHoldResId] = useState<string | null>(null);
  const [checkinResId, setCheckinResId] = useState<string | null>(null);
  const [selectedZoneIds, setSelectedZoneIds] = useState<(string | number)[]>([]);

  // [P0-17] Stale closure 방어용 최신 참조 Ref
  const selectedBayNoRef = useRef<number | null>(null);
  const selectedBayNosRef = useRef<number[]>([]);
  const currentHoldResIdRef = useRef<string | null>(null);
  const authReturnStepRef = useRef<'PRODUCT_SHOP' | 'PAYMENT' | null>(null);
  useEffect(() => { selectedBayNoRef.current = selectedBayNo; }, [selectedBayNo]);
  useEffect(() => { selectedBayNosRef.current = selectedBayNos; }, [selectedBayNos]);
  useEffect(() => { currentHoldResIdRef.current = currentHoldResId; }, [currentHoldResId]);

  // UI 상태
  const [justAllocatedBayNo, setJustAllocatedBayNo] = useState<number | null>(null);
  const [feedbackCountdown, setFeedbackCountdown] = useState<number | null>(null);
  const feedbackTimerRef = useRef<any>(null);

  const cancelFeedbackCountdown = () => {
    if (feedbackTimerRef.current) {
      clearInterval(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedbackCountdown(null);
    setJustAllocatedBayNo(null);
  };
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null);
  const [errorMasterCard, setErrorMasterCard] = useState<{ code: string; detail: string; traceId: string } | null>(null);
  const [errorModal, setErrorModal] = useState<ErrorModalData>({ isVisible: false, message: '' });
  const [storeName, setStoreName] = useState<string>('SGM Golf Academy');
  const [storeCloseTime, setStoreCloseTime] = useState<string>('24:00');
  const [checkinPolicy, setCheckinPolicy] = useState<string>('CHECKIN_REQUIRED');
  const [hwFailAlert, setHwFailAlert] = useState<{ bayNo: number; resId: string } | null>(null);
  const [closingPromptModal, setClosingPromptModal] = useState<{
    isVisible: boolean;
    maxMin: number;
    closeTime: string;
    title?: string;
    reason?: string;
    message?: string;
    noticeText?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [completedAllocationInfo, setCompletedAllocationInfo] = useState<{
    bayNo: number | string;
    oldBayNo?: number | string;
    durationMin: number;
    startTime?: string;
    endTime?: string;
    resId?: string;
    memberName?: string;
    payAmount?: number;
    originalAmount?: number;
    discountAmount?: number;
    usedPoints?: number;
    cardIssuer?: string;
    cardNoMasked?: string;
    terminalId?: string;
    authNo?: string;
    installmentMonths?: number;
    vatYn?: string;
    checkinMode?: string;
    noticeMessage?: string;
  } | null>(null);
  const [completedPurchaseInfo, setCompletedPurchaseInfo] = useState<CompletedPurchaseInfo | null>(null);
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);
  const keepAuthAfterPurchaseRef = useRef(false);

  // 미들웨어 헬스체크 및 키오스크 설정 로드
  const [isMiddlewareOffline, setIsMiddlewareOffline] = useState(false);
  const [isNetworkOffline, setIsNetworkOffline] = useState(false);
  const [isKioskActive, setIsKioskActive] = useState(true);
  const [inactiveNotice, setInactiveNotice] = useState<string>('');
  const [kioskMenuConfigs, setKioskMenuConfigs] = useState<any[]>([]);
  const [customMenuNotice, setCustomMenuNotice] = useState<{ title: string; desc: string } | null>(null);

  useEffect(() => {
    const isDemoEnvironment = 
      import.meta.env.VITE_DEMO_MODE === 'true' ||
      (typeof window !== 'undefined' && (
        window.location.search.includes('demo=true') ||
        window.location.pathname.includes('/demo/') ||
        window.location.hostname === 'segnet.co.kr'
      ));

    const checkMw = async () => {
      if (isDemoEnvironment) {
        setIsMiddlewareOffline(false);
        setIsNetworkOffline(false);
        return;
      }
      const [status, isConnected] = await Promise.all([
        api.getMiddlewareStatus(),
        api.checkConnection(),
      ]);
      setIsMiddlewareOffline(!status.online);
      setIsNetworkOffline(!isConnected);
      if (!isConnected) {
        recordKioskBlackBox('API_ERROR', '[NETWORK_OFFLINE] checkConnection 통신 실패 감지');
      }
    };

    // F05: 재기동(Reboot) 시 잔여 선점 락 자동 해제 및 로컬 상태 정리
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    selectedBayNoRef.current = null;
    selectedBayNosRef.current = [];
    api.releaseOrphanedLocks().catch(() => {});

    const handleWindowOnline = () => {
      setIsNetworkOffline(false);
      recordKioskBlackBox('HW_STATUS', '[NETWORK_ONLINE] 네트워크 통신 복구 감지');
      api.writeKioskLog('NETWORK_ONLINE', '네트워크 통신 정상 복구 - 키오스크 정상 운영 재개').catch(() => {});
      loadBays();
    };
    const handleWindowOffline = () => {
      setIsNetworkOffline(true);
      recordKioskBlackBox('API_ERROR', '[NETWORK_OFFLINE] 인터넷/서버 네트워크 단절 감지');
      api.writeKioskLog('NETWORK_OFFLINE', '인터넷/공유기 네트워크 단절 감지 - Fail-Safe 잠금 전환').catch(() => {});
    };

    window.addEventListener('online', handleWindowOnline);
    window.addEventListener('offline', handleWindowOffline);

    const loadSettings = async () => {
      try {
        const kioskConfig = await api.getKioskSystemSettings();
        if (kioskConfig) {
          if (kioskConfig.menu_zone_mappings) {
            setKioskMenuConfigs(prev => {
              const nextStr = JSON.stringify(kioskConfig.menu_zone_mappings);
              const prevStr = JSON.stringify(prev);
              return nextStr !== prevStr ? kioskConfig.menu_zone_mappings : prev;
            });
          }
          setIsKioskActive(kioskConfig.is_active ?? true);
          setInactiveNotice(kioskConfig.inactive_notice || '');
        }
      } catch (err) {
        console.error('Failed to fetch kiosk menu configs:', err);
      }
    };

    checkMw();
    loadSettings();
    const interval = setInterval(() => {
      checkMw();
      loadSettings();
    }, 10000); // 10초 주기 Polling 및 어드민 설정 실시간 동기화
    return () => {
      window.removeEventListener('online', handleWindowOnline);
      window.removeEventListener('offline', handleWindowOffline);
      clearInterval(interval);
    };
  }, [settings.storeCode, settings.apiUrl]);

  useEffect(() => {
    recordKioskBlackBox(
      'STEP',
      `화면 이동: ${step}${purpose ? ` (목적: ${purpose})` : ''}`,
      selectedBayNo ? { bayNo: selectedBayNo } : null
    );
  }, [step, purpose, selectedBayNo]);

  const showErrorModal = (
    message: string, 
    title?: string, 
    isHw: boolean = false, 
    errorCode?: string | number,
    onCloseCallback?: () => void,
    onRetryCallback?: () => void
  ) => {
    const resolvedTitle = title || (isHw ? '타석 기기 가동 확인 필요' : '타석 배정 오류');
    api.writeKioskLog(
      isHw ? 'HW_START_ERROR' : 'UI_ERROR_MODAL',
      `[${resolvedTitle}] ${message}${errorCode ? ` (Code: ${errorCode})` : ''}`,
      authMember?.member_no
    ).catch(() => {});

    setErrorModal({
      isVisible: true,
      title: resolvedTitle,
      message,
      errorCode,
      isHardwareFail: isHw,
      onCloseCallback,
      onRetryCallback
    });
  };

  // 실시간 타석 데이터 상태
  const [bays, setBays] = useState<Bay[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

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
      await api.getKioskMasterData();
      const info = await api.getStoreInfo();
      setStoreName(info.store_nm);
      if ((info as any).close_time) {
        setStoreCloseTime((info as any).close_time);
      }
      setCheckinPolicy(info.checkin_policy);
      setLogoUrl(info.logo_url);
      setPhotoUrl(info.photo_url);

      if (info.meta_data) {
        try {
          const meta = typeof info.meta_data === 'string' ? JSON.parse(info.meta_data) : info.meta_data;
          const faceYn = meta?.integration?.face_terminal_yn ?? true;
          setFaceTerminalEnabled(faceYn);
        } catch {
          setFaceTerminalEnabled(true);
        }
      }
    };
    fetchStoreInfo();
    loadBays();

    // [Phase 2: WS-2] WebSocket 실시간 수신 연결
    // bay_updated 이벤트를 받으면 폴링 없이 즉시 setBays 및 loadBays 실행
    const wsCleanup = api.connectBayWebSocket(
      (updatedBay) => {
        // 단일 타석 온라인 업데이트 — 전체 재조회 없이 O(n) 부분 갱신 + loadBays 확정 갱신
        setBays(prev => prev.map(b => b.bay_no === updatedBay.bay_no ? { ...b, ...updatedBay } : b));
        loadBays();
      },
      (msg) => {
        const data = msg as Record<string, unknown>;
        if (data.type === 'middleware_offline') {
          console.warn('[WS-Kiosk] 미들웨어 오프라인 신호 수신');
        }
        if (['bay_release', 'bay_update', 'bay_updated', 'bay_status_updated', 'bay_preoccupy', 'bay_created', 'bay_deleted', 'global_pause', 'checkin_complete', 'checkin_status', 'reservation_update', 'settings_updated'].includes(data.type as string)) {
          loadBays();
          if (data.type === 'settings_updated' || data.type === 'global_pause') {
            fetchStoreInfo();
          }
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
  }, [settings.storeCode, settings.apiUrl, settings.terminalId]);

  // 0-1. 화면 전환 시 (특히 타석 배치도 진입 시) 최신 타석 데이터 즉시 강제 갱신
  useEffect(() => {
    if (step === 'TEEBOX_MAP' || step === 'MAIN_DASHBOARD' || step === 'PRACTICE_SELECT') {
      loadBays();
    }
  }, [step]);

  // 1. 토스트 알림 타이머 자동 제거
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message: string, success = true) => {
    setToast({ message, success });
  };

  // 회원 로그아웃/초기화
  const handleLogout = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    const holdId = currentHoldResId || currentHoldResIdRef.current;
    if (holdId) {
      api.cancelHoldReservation(holdId).catch(console.error);
      setCurrentHoldResId(null);
      currentHoldResIdRef.current = null;
    }
    setCheckinResId(null);
    // 선점된 타석이 있다면 해제 (메모리 누수 방지)
    const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
    if (bayToRelease !== null) {
      api.releaseBay(bayToRelease).catch(console.error);
    }
    const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      api.releaseBays(baysToRelease).catch(console.error);
    }
    selectedBayNoRef.current = null;
    selectedBayNosRef.current = [];
    authReturnStepRef.current = null;
    cancelFeedbackCountdown();
    setAuthMember(null);
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setCompanionTargets([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setSelectedAssetId(null);
    setCompletedAllocationInfo(null);
    setCompletedPurchaseInfo(null);
    setInactivityCountdown(null);
    setSelectedZoneIds([]);
    setIsAdminPinOpen(false);
    setIsSettingsOpen(false);
    setCustomMenuNotice(null);
    setErrorModal(prev => ({ ...prev, isVisible: false }));
    setHwFailAlert(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setClosingPromptModal(null);
    setInactivityCountdown(null);
    setStep('INTRO');
  };

  const handleLogoutRef = useRef(handleLogout);
  handleLogoutRef.current = handleLogout;
  const isVanBusyRef = useRef(false);
  const isAdminPinOpenRef = useRef(isAdminPinOpen);
  isAdminPinOpenRef.current = isAdminPinOpen;
  const isSettingsOpenRef = useRef(isSettingsOpen);
  isSettingsOpenRef.current = isSettingsOpen;
  const completedAllocationInfoRef = useRef(completedAllocationInfo);
  completedAllocationInfoRef.current = completedAllocationInfo;
  const completedPurchaseInfoRef = useRef(completedPurchaseInfo);
  completedPurchaseInfoRef.current = completedPurchaseInfo;

  // 2. 무인기기 비활성 세션 아웃 (40초간 조작이 없으면 자동으로 광고 인트로로 복귀, 결제/파3 화면은 90초 보호 + 만료 10초 전 사전 경고 카운트다운 + VAN 통신/관리자 모드/완료 모달 중 보호)
  useEffect(() => {
    setInactivityCountdown(prev => (prev !== null ? null : prev));
    if (step === 'INTRO') return;

    const timeoutMs = (step === 'PAYMENT' || step === 'PAR3_ALLOCATION' || step === 'MEMBER_REGISTER') ? 90000 : 40000;
    const warningLeadMs = 10000;
    let warningTimeout = setTimeout(() => {}, 0);
    let sessionTimeout = setTimeout(() => {}, 0);
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    const clearAllTimers = () => {
      clearTimeout(warningTimeout);
      clearTimeout(sessionTimeout);
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };

    const resetTimer = () => {
      clearAllTimers();
      setInactivityCountdown(prev => (prev !== null ? null : prev));

      warningTimeout = setTimeout(() => {
        if (
          isAllocatingRef.current ||
          isVanBusyRef.current ||
          isAdminPinOpenRef.current ||
          isSettingsOpenRef.current ||
          completedAllocationInfoRef.current !== null ||
          completedPurchaseInfoRef.current !== null
        ) {
          resetTimer();
          return;
        }
        setInactivityCountdown(10);
        countdownInterval = setInterval(() => {
          setInactivityCountdown(prev => (prev !== null && prev > 1 ? prev - 1 : prev));
        }, 1000);
      }, Math.max(0, timeoutMs - warningLeadMs));

      sessionTimeout = setTimeout(() => {
        if (
          isAllocatingRef.current ||
          isVanBusyRef.current ||
          isAdminPinOpenRef.current ||
          isSettingsOpenRef.current ||
          completedAllocationInfoRef.current !== null ||
          completedPurchaseInfoRef.current !== null
        ) {
          resetTimer();
          return;
        }
        clearAllTimers();
        setInactivityCountdown(null);
        handleLogoutRef.current();
        showToast(lang === 'KO' ? '일정 시간 조작이 없어 광고 화면으로 복귀합니다.' : 'Session timeout. Returning to ad screen.', false);
      }, timeoutMs);
    };

    resetTimer();

    const events = ['click', 'mousemove', 'touchstart', 'keydown'];
    events.forEach(ev => window.addEventListener(ev, resetTimer));
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
      clearAllTimers();
    };
  }, [step, lang]);

  // 2-1. 결제·회원가입·상품/이용권 선택 대기 중 선점 타석(Soft-Lock) 만료 방지를 위한 25초 주기 Heartbeat 연장
  useEffect(() => {
    if (step !== 'PAYMENT') {
      isVanBusyRef.current = false;
    }
    if (step !== 'PAYMENT' && step !== 'MEMBER_REGISTER' && step !== 'PRODUCT_SHOP' && step !== 'ASSET_SELECT') {
      return;
    }
    const heartbeatInterval = setInterval(() => {
      const singleBay = selectedBayNo ?? selectedBayNoRef.current;
      if (singleBay !== null) {
        api.preoccupyBay(singleBay).catch(() => {});
      }
      const multiBays = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
      if (multiBays.length > 0) {
        multiBays.forEach(bNo => {
          api.preoccupyBay(bNo).catch(() => {});
        });
      }
    }, 25000);
    return () => clearInterval(heartbeatInterval);
  }, [step, selectedBayNo, selectedBayNos]);

  // 행위 완료 후 메인화면(MAIN_DASHBOARD)으로 세션 초기화 복귀
  const handleLogoutToHome = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    const holdId = currentHoldResId || currentHoldResIdRef.current;
    if (holdId) {
      api.cancelHoldReservation(holdId).catch(console.error);
      setCurrentHoldResId(null);
      currentHoldResIdRef.current = null;
    }
    setCheckinResId(null);
    const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
    if (bayToRelease !== null) {
      api.releaseBay(bayToRelease).catch(console.error);
    }
    const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      api.releaseBays(baysToRelease).catch(console.error);
    }
    selectedBayNoRef.current = null;
    selectedBayNosRef.current = [];
    authReturnStepRef.current = null;
    cancelFeedbackCountdown();
    setAuthMember(null);
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setCompanionTargets([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedProduct(null);
    setSelectedAssetId(null);
    setCompletedAllocationInfo(null);
    setCompletedPurchaseInfo(null);
    setInactivityCountdown(null);
    setSelectedZoneIds([]);
    setIsAdminPinOpen(false);
    setIsSettingsOpen(false);
    setCustomMenuNotice(null);
    setErrorModal(prev => ({ ...prev, isVisible: false }));
    setHwFailAlert(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setClosingPromptModal(null);
    setStep('MAIN_DASHBOARD');
  };

  // 실시간 미니 모니터 타석 클릭 단축키
  const handleMiniBayClick = async (bayNo: number) => {
    showToast(lang === 'KO' ? `${bayNo}번 타석 선점 시도 중...` : `Securing teebox ${bayNo}...`);
    try {
      const success = await api.preoccupyBay(bayNo);
      if (success) {
        setSelectedBayNo(bayNo);
        selectedBayNoRef.current = bayNo;
        // 타석이 선점된 상태로 연습타석 분기 선택으로 직행
        setStep('PRACTICE_SELECT');
      } else {
        showToast(lang === 'KO' ? '이미 다른 고객님께서 선택 중이거나 예약 불가능한 타석입니다.' : 'Failed to secure teebox.', false);
      }
    } catch {
      showToast(lang === 'KO' ? '타석 선점 처리 중 오류가 발생했습니다.' : 'Failed to preoccupy teebox.', false);
    }
  };

  // 결제 취소 핸들러 (HOLD 예약 취소 + 선점 타석 릴리즈 + 상태 롤백)
  const handlePaymentCancel = async () => {
    const holdId = currentHoldResId || currentHoldResIdRef.current;
    if (holdId) {
      await api.cancelHoldReservation(holdId).catch(console.error);
      setCurrentHoldResId(null);
      currentHoldResIdRef.current = null;
    }
    const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
    if (bayToRelease !== null) {
      await api.releaseBay(bayToRelease).catch(console.error);
      setSelectedBayNo(null);
      selectedBayNoRef.current = null;
    }
    const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      await api.releaseBays(baysToRelease).catch(console.error);
      setSelectedBayNos([]);
      selectedBayNosRef.current = [];
    }
    setSelectedLockerNo(null);
    setSelectedLockerDisplayNo(null);
    setSelectedProduct(null);
    setSelectedAssetId(null);
    setCheckinResId(null);
    setClosingPromptModal(null);
    authReturnStepRef.current = null;
    if (purpose === 'PURCHASE_PRODUCT') {
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'EXTEND_LOCKER') {
      setStep('LOCKER_EXTEND');
    } else {
      setStep('PRACTICE_SELECT');
    }
  };

  // 메인 대시보드로 복귀 (세부 프로세스 중단 및 가상 락 정리)
  const handleGoHome = () => {
    if (authMember) {
      api.writeKioskLog('SESSION_CLOSE', `${authMember.member_name} 회원 세션 정상 종료`, authMember.member_no);
    }
    const holdId = currentHoldResId || currentHoldResIdRef.current;
    if (holdId) {
      api.cancelHoldReservation(holdId).catch(console.error);
      setCurrentHoldResId(null);
      currentHoldResIdRef.current = null;
    }
    setCheckinResId(null);
    // [BugFix] 고객이 중도 취소/처음으로 복귀 시 선점 락 100% 해제 (결제 진행 중 상주 현상 방지)
    const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
    if (bayToRelease !== null) {
      api.releaseBay(bayToRelease).catch(console.error);
    }
    const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      api.releaseBays(baysToRelease).catch(console.error);
    }
    selectedBayNoRef.current = null;
    selectedBayNosRef.current = [];
    authReturnStepRef.current = null;
    setAuthMember(null); // 메인화면 복귀 시 로그인 세션 즉시 파기 (공용 키오스크 보안 강화)
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setCompanionTargets([]);
    setShowCompanionModal(false);
    setSelectedLockerNo(null);
    setSelectedLockerDisplayNo(null);
    setSelectedProduct(null);
    setPurpose(null);
    setErrorMasterCard(null);
    setClosingPromptModal(null);
    
    // 🔒 [4차 방어막] 이탈/타임아웃 시 잔존 배정 상태 100% 클리어
    setSelectedAssetId(null);
    setCompletedAllocationInfo(null);
    setCompletedPurchaseInfo(null);
    setInactivityCountdown(null);
    setSelectedZoneIds([]);
    setIsAdminPinOpen(false);
    setIsSettingsOpen(false);
    
    setStep('MAIN_DASHBOARD');
  };

  // 직전 화면 단계로 복귀 핸들러
  const handleGoBack = () => {
    if (step === 'MEMBER_AUTH') {
      // 🛡️ BUG-P05: 일일 타석권 상품 매대(PRODUCT_SHOP) 또는 결제창(PAYMENT)에서 [👤 회원 인증하고 혜택 받기]를 눌러 진입한 경우,
      // [이전 단계로] 터치 시 타석 선점 락을 해제하지 않고 원래 화면(PAYMENT 또는 PRODUCT_SHOP)으로 안전하게 복귀
      if (purpose === 'ALLOCATE_DAILY' && (selectedBayNo ?? selectedBayNoRef.current) !== null) {
        if (authReturnStepRef.current === 'PAYMENT' && selectedProduct) {
          authReturnStepRef.current = null;
          setStep('PAYMENT');
          return;
        }
        authReturnStepRef.current = null;
        setStep('PRODUCT_SHOP');
        return;
      }
      if (purpose === 'ALLOCATE_MEMBERSHIP' || purpose === 'ALLOCATE_DAILY') {
        const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
        if (bayToRelease !== null) {
          api.releaseBay(bayToRelease).catch(console.error);
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
        }
        const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
        if (baysToRelease.length > 0) {
          api.releaseBays(baysToRelease).catch(console.error);
          setSelectedBayNos([]);
          selectedBayNosRef.current = [];
        }
        setStep('PRACTICE_SELECT');
        return;
      }
      handleGoHome();
    } else if (step === 'MEMBER_REGISTER') {
      if (
        purpose === 'PURCHASE_PRODUCT' ||
        purpose === 'EXTEND_LOCKER' ||
        purpose === 'MOVE_BAY' ||
        purpose === 'CHECKIN_RESERVATION' ||
        ((purpose === 'ALLOCATE_MEMBERSHIP' || purpose === 'ALLOCATE_DAILY') && ((selectedBayNo ?? selectedBayNoRef.current) !== null || selectedBayNos.length > 0))
      ) {
        setStep('MEMBER_AUTH');
        return;
      }
      handleGoHome();
    } else if (step === 'PRODUCT_SHOP') {
      if (purpose === 'ALLOCATE_DAILY') {
        const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
        if (bayToRelease !== null) {
          api.releaseBay(bayToRelease).catch(console.error);
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
        }
        setStep('PRACTICE_SELECT');
        return;
      }
      handleGoHome();
    } else if (step === 'ASSET_SELECT') {
      setSelectedAssetId(null);
      setAuthMember(null);
      const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
      if (bayToRelease !== null) {
        api.releaseBay(bayToRelease).catch(console.error);
        setSelectedBayNo(null);
        selectedBayNoRef.current = null;
      }
      setStep('PRACTICE_SELECT');
    } else if (step === 'PAYMENT') {
      void handlePaymentCancel();
    } else if (
      step === 'PRACTICE_SELECT' ||
      step === 'PAR3_ALLOCATION' ||
      step === 'LOCKER_EXTEND' ||
      step === 'TEEBOX_MAP' ||
      step === 'CHECKIN_SELECT'
    ) {
      handleGoHome();
    } else {
      handleGoHome();
    }
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
      // [P1-1] 회원권 타석 배정 검증: 유효 기간(remain_days >= 0) 또는 기간제/횟수제 유효 이용권 존재 시 허용
      const hasValidDays = Boolean(member.expiry_date && member.remain_days !== undefined && member.remain_days >= 0);
      const hasValidAsset = Boolean(
        member.assets && member.assets.length > 0 && member.assets.some(a => {
          if (a.is_assignable === false) return false;
          const logicType = (a.logic_type || '').toUpperCase();
          if (logicType === 'PERIOD' || logicType === 'MEMBERSHIP') {
            return (a.remain_days === undefined || a.remain_days >= 0) && (member.remain_days === undefined || member.remain_days >= 0);
          }
          return (
            (a.rem_count !== undefined && a.rem_count > 0) ||
            (a.remain_cnt !== undefined && a.remain_cnt > 0) ||
            (a.remain_days !== undefined && a.remain_days > 0)
          );
        })
      );

      const hasPreselectedBay = (selectedBayNo ?? selectedBayNoRef.current) !== null || selectedBayNos.length > 0 || selectedBayNosRef.current.length > 0;

      if (!hasValidDays && !hasValidAsset && !hasPreselectedBay) {
        // [ErrorMaster-First 예시] 타석 미선택 상태에서 회원권 만료 에러
        const trace = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
        await api.writeKioskLog('AUTH_ERROR', `회원권 만료 제약 차단 (Trace ID: ${trace})`, member.member_no);
        
        setErrorMasterCard({
          code: 'ERR_MEMBERSHIP_EXPIRED',
          detail: lang === 'KO' 
            ? '고객님의 회원권 기간이 만료되었거나 보유하신 유효 이용권이 없습니다.' 
            : 'Your membership pass has expired or you do not have any valid teebox tickets.',
          traceId: trace
        });
        setAuthMember(null); // [Security Patch] 에러 발생 시 강제 세션 파기
        setStep('MAIN_DASHBOARD');
      } else {
        // 🛡️ BUG-M07: 타석을 선점한 상태에서 이용권이 만료/부재하더라도 락과 회원 세션(할인/포인트)을 유지한 채
        // ASSET_SELECT ('💳 일일 타석권 결제로 전환' 버튼 탑재) 또는 CompanionSetupModal로 진입 허용
        if (selectedBayNos.length > 0) {
          setShowCompanionModal(true);
          setStep('PRACTICE_SELECT');
        } else {
          setSelectedAssetId(null);
          setStep('ASSET_SELECT');
        }
      }
    } else if (purpose === 'ALLOCATE_DAILY') {
      if (authReturnStepRef.current === 'PAYMENT' && selectedProduct) {
        authReturnStepRef.current = null;
        setStep('PAYMENT');
      } else {
        authReturnStepRef.current = null;
        setStep('PRODUCT_SHOP');
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
    const activeBayNo = selectedBayNo ?? selectedBayNoRef.current;
    const warnSuffix = (member as any)?.face_enroll_warning
      ? ` (${(member as any).face_enroll_warning})`
      : '';

    // 감사 로그 적재
    await api.writeKioskLog('REGISTER_SUCCESS', `즉석 회원가입 성공 (${member.member_name}, ${member.hp})`, member.member_no);

    // 🛡️ BUG-M12: 타석을 이미 선점한 뒤 [30초 신규 회원가입]을 진행한 경우, 선점 락을 해제하지 않고
    // 가입된 회원 세션(등급 할인/포인트 적립)을 유지한 채 일일 타석권 결제(PAYMENT 또는 PRODUCT_SHOP)로 즉시 연결
    if (activeBayNo !== null && (purpose === 'ALLOCATE_MEMBERSHIP' || purpose === 'ALLOCATE_DAILY')) {
      setAuthMember(member);
      setPurpose('ALLOCATE_DAILY');
      showToast(
        lang === 'KO'
          ? `${member.member_name} 님 가입이 완료되었습니다! 선택하신 ${activeBayNo}번 타석 일일권 결제로 이동합니다.${warnSuffix}`
          : `Welcome ${member.member_name}! Proceeding to Bay ${activeBayNo} Daily Pass.${warnSuffix}`,
        Boolean((member as any)?.face_enroll_warning)
      );
      if (authReturnStepRef.current === 'PAYMENT' && selectedProduct) {
        authReturnStepRef.current = null;
        setStep('PAYMENT');
      } else {
        authReturnStepRef.current = null;
        setStep('PRODUCT_SHOP');
      }
      return;
    }

    // 🛡️ BUG-S05: [회원권/상품 구매] (PURCHASE_PRODUCT) 퍼널에서 [30초 신규 회원가입]을 완료한 경우,
    // 세션을 파기하지 않고 방금 가입한 회원 자격으로 상품 매대(PRODUCT_SHOP)로 즉시 직행
    if (purpose === 'PURCHASE_PRODUCT') {
      setAuthMember(member);
      showToast(
        lang === 'KO'
          ? `${member.member_name} 님 가입이 완료되었습니다! 회원권 및 상품 구매 화면으로 이동합니다.${warnSuffix}`
          : `Welcome ${member.member_name}! Proceeding to Membership Shop.${warnSuffix}`,
        Boolean((member as any)?.face_enroll_warning)
      );
      setStep('PRODUCT_SHOP');
      return;
    }

    const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
    if (bayToRelease !== null) {
      api.releaseBay(bayToRelease).catch(console.error);
      setSelectedBayNo(null);
      selectedBayNoRef.current = null;
    }
    const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      api.releaseBays(baysToRelease).catch(console.error);
      setSelectedBayNos([]);
      selectedBayNosRef.current = [];
    }
    // 홈 화면에서 단독 회원가입한 경우 공용 단말기 보호를 위해 세션을 유지하지 않고 홈으로 복귀
    setAuthMember(null); 
    setPurpose(null);
    showToast(
      lang === 'KO'
        ? `${member.member_name} 님, 환영합니다! 신규 회원가입이 완료되었습니다.${warnSuffix}`
        : `Welcome ${member.member_name}! Registration successful.${warnSuffix}`,
      Boolean((member as any)?.face_enroll_warning)
    );
    setStep('MAIN_DASHBOARD');
  };



  // 2. 타석 맵에서 타석 선택 완료
  const handleBaySelected = async (bayNo: number, sourceBayNo?: number) => {
    setSelectedBayNo(bayNo);

    if (purpose === 'ALLOCATE_MEMBERSHIP' && authMember) {
      // 회원권 타석 배정은 이용권 선택 화면으로 유도
      setSelectedAssetId(null);
      setStep('ASSET_SELECT');
    } else if (purpose === 'ALLOCATE_DAILY') {
      // 일일권은 먼저 타석을 선택한 뒤, 60분/90분 결제 단계로 진입
      setStep('PRODUCT_SHOP');
    } else if (purpose === 'MOVE_BAY' && authMember) {
      if (isAllocatingRef.current) return;
      isAllocatingRef.current = true;
      // 타석 이동 완료 처리
      try {
        const effMemberNo = authMember.member_no;
        const effMemberName = (authMember.member_name || '').trim();
        const currentBay = bays.find(b => {
          if (Number(b.bay_no) >= 1000) return false;
          const zoneStr = String((b as any).zone || (b as any).zone_name || '').toUpperCase();
          if (zoneStr.includes('PAR3') || zoneStr.includes('SCREEN') || zoneStr.includes('ROOM') || zoneStr.includes('파3') || zoneStr.includes('스크린')) return false;
          const st = String((b as any).status_info?.code || b.status || '').toUpperCase();
          if (!['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(st)) return false;
          const bayMemberNo = String((b as any).current_member_no || b.member_no || '').trim();
          if (effMemberNo && bayMemberNo !== '') {
            return bayMemberNo === String(effMemberNo).trim();
          }
          if (!bayMemberNo && effMemberNo && String(b.current_user_name || '').trim() === String(effMemberNo).trim()) {
            return true;
          }
          const bayUserName = String((b as any).member_name || b.current_user_name || '').trim();
          if (!bayMemberNo && effMemberName !== '' && bayUserName !== '' && bayUserName === effMemberName) {
            return true;
          }
          return false;
        });
        const resolvedSourceBayNo = sourceBayNo ?? currentBay?.bay_no;
        const res = await api.moveBay(authMember.member_no, bayNo, resolvedSourceBayNo);
        if (res.success) {
          const resolvedOldBayNo = res.old_bay_no ?? resolvedSourceBayNo;
          // 감사 로그 적재
          await api.writeKioskLog('BAY_MOVE', `타석 이동 성공 (${resolvedOldBayNo ?? '?'}번 -> ${bayNo}번 타석으로 이동)`, authMember.member_no);
          await loadBays();
          showToast(res.message);
          const movedMemberName = authMember.member_name;
          const remainMin = (res.remain_min ?? (currentBay ? TimeMaster.getRemainingMinutes(currentBay) : 0)) || DEFAULT_SESSION_MIN;
          setAuthMember(null);
          setPurpose(null);
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
          setCompletedAllocationInfo({
            bayNo: bayNo,
            oldBayNo: resolvedOldBayNo,
            durationMin: remainMin,
            startTime: res.start_time || (currentBay as any)?.start_time,
            endTime: res.end_time || (currentBay as any)?.end_time,
            resId: (res as any).res_id || (currentBay as any)?.res_id,
            memberName: movedMemberName,
            payAmount: 0,
            checkinMode: 'MOVE_BAY',
            noticeMessage: res.message
          });
        } else {
          await api.releaseBay(bayNo).catch(() => {});
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
          await loadBays();
          showErrorModal(res.message || '타석 이동을 진행할 수 없습니다.');
        }
      } catch (err: any) {
        await api.releaseBay(bayNo).catch(() => {});
        setSelectedBayNo(null);
        selectedBayNoRef.current = null;
        await loadBays();
        showErrorModal(err?.message || (lang === 'KO' ? '타석 이동 처리 중 오류가 발생했습니다.' : 'Failed to move teebox.'));
      } finally {
        isAllocatingRef.current = false;
      }
    }
  };

  // 2.5 선택한 이용권으로 타석 배정 최종 승인 처리
  const handleAssetSelected = async (memberItemId: number, overrideDurationMin?: number, acceptClosingTruncate?: boolean) => {
    if (isAllocatingRef.current) return;
    if (selectedBayNo !== null && authMember) {
      isAllocatingRef.current = true;
      try {
        const targetAsset = (authMember.assets || []).find(a => String(a.member_item_id) === String(memberItemId));
        const passDuration = overrideDurationMin ?? (targetAsset?.duration_min ?? DEFAULT_SESSION_MIN);
        const res = await api.allocateBay(
          selectedBayNo, passDuration, authMember.member_no,
          undefined, undefined, memberItemId,
          'TICKET', 0,
          undefined, undefined, undefined,
          { acceptClosingTruncate }
        );
        if (res.success) {
          const confirmedMemberName = authMember.member_name;
          const effectiveDur = (res as any).duration_min ?? passDuration;
          await api.writeKioskLog('BAY_ALLOCATE_MEMBERSHIP', `회원권 타석배정 완료 (${selectedBayNo}번 타석, 이용권 ID: ${memberItemId}, ${effectiveDur}분)`, authMember.member_no);
          await loadBays();
          if (res.hardware_success === false) {
            showErrorModal(`${selectedBayNo}번 타석 배정은 완료되었으나, 센서/타석 기기 시작에 실패했습니다. 직원을 호출해 주세요.`, '타석 기기 가동 미완료', true);
          }
          
          const allocatedBayNo = selectedBayNo;
          // 🔒 [1차 방어막] 배정 성공 직후 로그인 세션 및 선점 타석 상태 즉시 완전 파기 (뒷사람 무단 사용 및 유령 선택 원천 차단 - 0.001초 즉시 파기)
          setAuthMember(null);
          setSelectedAssetId(null);
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
          
          setStep('PRACTICE_SELECT');
          setCompletedAllocationInfo({
            bayNo: allocatedBayNo,
            durationMin: effectiveDur,
            startTime: (res as any).start_time || (res as any).startTime,
            endTime: (res as any).end_time || (res as any).endTime,
            resId: res.res_id,
            memberName: confirmedMemberName,
            payAmount: 0
          });
        } else {
          // ⏰ [영업 마감 및 다음 예약 단축 승낙 룰 (SSOT)]: 10분 이상 잔여 시 단축 배정 확인 모달 표출
          if (res.closingPrompt && res.closingPrompt.max_available_min >= 10) {
            const prompt = res.closingPrompt;
            const isNextResLimit = prompt.reason === 'NEXT_RESERVATION_LIMIT';
            setClosingPromptModal({
              isVisible: true,
              maxMin: prompt.max_available_min,
              closeTime: prompt.close_time,
              reason: prompt.reason,
              title: isNextResLimit ? '⚠️ 다음 예약 이용시간 안내' : '⏰ 영업 마감 이용시간 안내',
              message: prompt.message,
              noticeText: isNextResLimit
                ? '※ 이용권 1회가 정상 차감되며, 단축된 잔여 시간에 대한 부분 환불은 불가합니다. 원치 않으시면 취소 후 다른 타석을 선택해 주세요.'
                : '※ 이용권 1회가 정상 차감되며, 단축된 잔여 시간에 대한 부분 환불은 불가합니다.',
              onConfirm: async () => {
                setClosingPromptModal(null);
                await handleAssetSelected(memberItemId, prompt.max_available_min, true);
              },
              onCancel: () => {
                setClosingPromptModal(null);
                if (isNextResLimit) {
                  setSelectedAssetId(null);
                  const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                  if (bayToRelease !== null) {
                    api.releaseBay(bayToRelease).catch(console.error);
                    setSelectedBayNo(null);
                    selectedBayNoRef.current = null;
                  }
                  keepAuthAfterPurchaseRef.current = true;
                  setStep('PRACTICE_SELECT');
                }
              }
            });
            return;
          }
          showErrorModal(res.message || '회원 이용권 타석 배정에 실패했습니다.');
        }
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '타석 배정 처리 중 시스템 오류가 발생했습니다.' : 'Failed to allocate teebox.'));
      } finally {
        isAllocatingRef.current = false;
      }
    }
  };

  // 2.5. 연습타석배정 화면에서 타석 및 배정 목적(회원권/일일권) 선택 완료 핸들러
  const handlePracticeSelectConfirm = async (bayNo: number, purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => {
    setSelectedBayNo(bayNo);
    setPurpose(purposeType);

    if (purposeType === 'ALLOCATE_MEMBERSHIP') {
      // 🛡️ BUG-S07: 회원권 구매 완료 직후 [구매한 회원권으로 바로 타석 배정받기]로 진입한 경우 재인증 생략 후 바로 이용권 선택
      if (keepAuthAfterPurchaseRef.current && authMember) {
        keepAuthAfterPurchaseRef.current = false;
        setSelectedAssetId(null);
        setStep('ASSET_SELECT');
        return;
      }
      setInitialAuthMode('FACE');
      // 🔒 [2차 방어막] 단일 타석 선택 시 이전 비정상 잔존 세션이 있더라도 100% 강제 파기 후 신규 안면인식 유도
      setAuthMember(null);
      setStep('MEMBER_AUTH');
    } else if (purposeType === 'ALLOCATE_DAILY') {
      keepAuthAfterPurchaseRef.current = false;
      setAuthMember(null);
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
  const handleCompanionConfirm = async (targets: CompanionTargetItem[], acceptClosingTruncate: boolean = false) => {
    setShowCompanionModal(false);
    const totalPrice = targets.reduce((sum, t) => sum + t.price, 0);

    if (totalPrice === 0) {
      // 모두 회원권 차감인 경우 즉시 다중 배정 수행
      showToast(lang === 'KO' ? '동반자 타석 일괄 배정을 진행 중입니다...' : 'Allocating group teeboxes...');
      try {
        const groupRes = await api.allocateGroupBays(
          targets.map(t => ({
            bayNo: t.bayNo,
            durationMin: t.durationMin ?? DEFAULT_SESSION_MIN,
            memberNo: t.memberNo,
            memberName: t.memberName,
            hp: t.hp,
            memberItemId: t.memberItemId,
            paymentMethod: 'TICKET',
            amount: 0
          })),
          undefined,
          { acceptClosingTruncate }
        );
        if (!groupRes.success) {
          if (groupRes.closingPrompt && groupRes.closingPrompt.max_available_min >= 10) {
            const prompt = groupRes.closingPrompt;
            const isNextResLimit = prompt.reason === 'NEXT_RESERVATION_LIMIT';
            setClosingPromptModal({
              isVisible: true,
              maxMin: prompt.max_available_min,
              closeTime: prompt.close_time,
              reason: prompt.reason,
              title: isNextResLimit ? '⚠️ 다음 예약 이용시간 안내' : '⏰ 영업 마감 이용시간 안내',
              message: prompt.message,
              noticeText: '※ 동반자 이용권이 정상 차감되며, 단축된 잔여 시간에 대한 부분 환불은 불가합니다.',
              onConfirm: async () => {
                setClosingPromptModal(null);
                const truncatedTargets = targets.map(t => ({ ...t, durationMin: prompt.max_available_min }));
                await handleCompanionConfirm(truncatedTargets, true);
              },
              onCancel: () => {
                setClosingPromptModal(null);
              }
            });
            return;
          }
          showErrorModal(groupRes.message || '동반자 타석 배정에 실패했습니다.');
          return;
        }
        const firstRes = groupRes.results?.[0] || {};
        const leaderName = authMember?.member_name || targets[0]?.memberName || '회원';
        await loadBays();
        showToast(lang === 'KO' ? '동반자 타석 배정이 모두 완료되었습니다!' : 'Group teebox allocation completed!');
        setAuthMember(null);
        setSelectedBayNo(null);
        selectedBayNoRef.current = null;
        setSelectedBayNos([]);
        selectedBayNosRef.current = [];
        setCompanionTargets([]);
        setStep('PRACTICE_SELECT');
        setCompletedAllocationInfo({
          bayNo: targets.length > 1 ? targets.map(t => t.bayNo).join(', ') : targets[0].bayNo,
          durationMin: firstRes.duration_min ?? targets[0].durationMin ?? DEFAULT_SESSION_MIN,
          startTime: firstRes.start_time || firstRes.startTime,
          endTime: firstRes.end_time || firstRes.endTime,
          resId: firstRes.res_id,
          memberName: `${leaderName} 외 ${targets.length - 1}명 (${targets.map(t => t.bayNo).join(', ')}번)`,
          payAmount: 0
        });
      } catch (err: any) {
        showErrorModal(err?.message || (lang === 'KO' ? '동반자 타석 배정 처리 중 오류가 발생했습니다.' : 'Group allocation failed.'));
      }
    } else {
      // [BUG-09 FIX] 동반자 유료 결제 포함 시에도 결제 진입 전 중간 빈타석 한도 및 영업 마감시간 사전 점검 수행
      if (!acceptClosingTruncate) {
        for (const t of targets) {
          const bObj = bays.find(b => b.bay_no === t.bayNo);
          const tDur = t.durationMin ?? DEFAULT_SESSION_MIN;
          if (
            bObj &&
            typeof bObj.max_assignable_min === 'number' &&
            bObj.max_assignable_min > 0 &&
            tDur > bObj.max_assignable_min
          ) {
            const limitMin = bObj.max_assignable_min;
            const nextStartStr = bObj.next_limit_res_start_time || '예정';
            showErrorModal(
              `선택하신 ${t.bayNo}번 타석은 다음 예약(${nextStartStr})으로 인해 최대 [${limitMin}분]까지만 이용 가능합니다.\n\n동반자 일일권 초과 결제를 방지하기 위해 다른 타석을 선택해 주세요.`,
              '이용 가능 시간 초과 안내'
            );
            return;
          }
        }

        const now = TimeMaster.getSyncedDate();
        const diffMin = TimeMaster.getMinutesUntilClose(storeCloseTime, now);
        const PAYMENT_BUFFER_MIN = 2;
        const prepareMin = 3;
        const maxWaitMin = targets.reduce((maxW, t) => {
          const bObj = bays.find(b => b.bay_no === t.bayNo);
          if (bObj && (bObj.status === 'OCCUPIED' || bObj.status === 'PREPARE')) {
            const w = TimeMaster.getRemainingMinutes(bObj, now, bObj.end_epoch_ms);
            return Math.max(maxW, w);
          }
          return maxW;
        }, 0);
        const reqDuration = Math.max(...targets.map(t => t.durationMin ?? DEFAULT_SESSION_MIN));
        const maxUserMin = Math.max(0, diffMin - (maxWaitMin + prepareMin + PAYMENT_BUFFER_MIN));

        if (diffMin < reqDuration + maxWaitMin + prepareMin) {
          if (maxUserMin < 10) {
            showErrorModal(`영업 마감시간(${storeCloseTime}) 임박(최소 이용시간 10분 미만)으로 동반자 일일권 결제를 진행할 수 없습니다.`);
            return;
          }
          setClosingPromptModal({
            isVisible: true,
            maxMin: maxUserMin,
            closeTime: storeCloseTime,
            message: `영업 마감시각(${storeCloseTime})까지 이용 가능한 최대 시간은 [${maxUserMin}분]입니다.\n\n${maxUserMin}분으로 단축하여 동반자 결제 및 배정을 진행하시겠습니까?`,
            noticeText: '※ 결제 금액은 정상 요금으로 결제되며, 단축된 잔여 시간에 대한 부분 환불은 불가합니다.',
            onConfirm: () => {
              setClosingPromptModal(null);
              const truncatedTargets = targets.map(t => ({
                ...t,
                durationMin: Math.min(t.durationMin ?? DEFAULT_SESSION_MIN, maxUserMin)
              }));
              handleCompanionConfirm(truncatedTargets, true);
            },
            onCancel: () => {
              setClosingPromptModal(null);
            }
          });
          return;
        }
      }

      // 일일권 결제가 포함된 경우 결제 단말기 퍼널로 전이
      setCompanionTargets(targets);
      setSelectedProduct({
        prod_cd: 'PROD_GROUP',
        prod_nm: `동반자 ${targets.length}개 타석 일괄 결제`,
        standard_price: totalPrice,
        logic_type: 'DAILY',
        duration_min: targets[0]?.durationMin ?? DEFAULT_SESSION_MIN
      });
      setStep('PAYMENT');
    }
  };

  // 3. 상품 매대에서 구매 상품 선택 완료
  const handleProductSelected = async (prod: Product) => {
    // 🛡️ BUG-S03: 성별 전용 상품 결제 진입 전 선제 검증
    const rawTargetGender = String(
      prod.target_gender || prod.access_rules?.restricted_gender || prod.rules_detail?.restricted_gender || 'ALL'
    ).toUpperCase();
    const targetGenderNorm = rawTargetGender === 'MALE' ? 'M' : rawTargetGender === 'FEMALE' ? 'F' : rawTargetGender;
    if ((targetGenderNorm === 'M' || targetGenderNorm === 'F') && authMember?.gender) {
      const normMemG = String(authMember.gender).toUpperCase();
      const memG = normMemG === 'MALE' || normMemG === '남' ? 'M' : normMemG === 'FEMALE' || normMemG === '여' ? 'F' : normMemG;
      if (memG && memG !== targetGenderNorm) {
        const reqLabel = targetGenderNorm === 'F' ? '여성' : '남성';
        showErrorModal(`선택하신 상품은 [${reqLabel} 회원 전용] 상품입니다. 다른 상품을 선택해 주세요.`, '성별 제한 상품 안내');
        return;
      }
    }

    if (purpose === 'ALLOCATE_DAILY' && selectedBayNo) {
      // ⏰ [일일권 결제 전 중간 빈타석 한도 및 마감시간 사전 점검 (SSOT)]
      const now = TimeMaster.getSyncedDate();
      const diffMin = TimeMaster.getMinutesUntilClose(storeCloseTime, now);

      // [P0-07 & P2-2] 대기 타석 잔여시간(waitMin) 및 종료 시각 계산: TimeMaster SSOT 파서 사용
      const selectedBay = bays.find(b => b.bay_no === selectedBayNo);
      const prodDuration =
        prod.duration_min ??
        prod.time_min ??
        prod.access_rules?.duration_min ??
        prod.rules_detail?.duration_min ??
        DEFAULT_SESSION_MIN;

      // 1) 중간 빈타석(또는 뒤 예약)으로 인한 최대 가용 시간(max_assignable_min) 초과 사전 차단 (일일권 초과 결제 원천 방어)
      if (
        selectedBay &&
        typeof selectedBay.max_assignable_min === 'number' &&
        selectedBay.max_assignable_min > 0 &&
        prodDuration > selectedBay.max_assignable_min
      ) {
        const limitMin = selectedBay.max_assignable_min;
        const nextStartStr = selectedBay.next_limit_res_start_time || '예정';
        showErrorModal(
          `선택하신 타석은 다음 예약(${nextStartStr})으로 인해 최대 [${limitMin}분]까지만 이용 가능합니다.\n\n${limitMin}분 이하 일일권을 선택하시거나, 다른 타석을 선택해 주세요.`,
          '이용 가능 시간 초과 안내'
        );
        return;
      }

      let waitMin = 0;
      let currentEndTime = '';
      if (selectedBay && (selectedBay.status === 'OCCUPIED' || selectedBay.status === 'PREPARE')) {
        waitMin = TimeMaster.getTotalWaitMinutes(selectedBay, now);
        currentEndTime = TimeMaster.formatAvailableFromTime(selectedBay);
      }

      // 결제 소요 버퍼: 카드 투입 및 통신에 약 1~2분 소요되므로 백엔드 409 및 망취소 방어를 위해 2분 버퍼 확보
      const PAYMENT_BUFFER_MIN = 2;
      const prepareMin = 3;
      const totalOffsetMin = waitMin + prepareMin + PAYMENT_BUFFER_MIN;
      const maxUserMin = Math.max(0, diffMin - totalOffsetMin);

      if (diffMin < prodDuration + waitMin + prepareMin) {
        if (maxUserMin < 10) {
          showErrorModal(`영업 마감시간(${storeCloseTime}) 임박(최소 이용시간 10분 미만)으로 일일권을 구매하여 배정할 수 없습니다.`);
          return;
        }
        const waitNotice = currentEndTime ? ` (앞사람 종료: ${currentEndTime})` : '';
        setClosingPromptModal({
          isVisible: true,
          maxMin: maxUserMin,
          closeTime: storeCloseTime,
          reason: 'STORE_CLOSING_LIMIT',
          title: '⏰ 영업 마감 이용시간 안내',
          message: `영업 마감시각(${storeCloseTime})${waitNotice}까지 이용 가능한 시간은 [${maxUserMin}분]입니다.\n\n${maxUserMin}분으로 단축하여 결제 및 배정을 진행하시겠습니까?`,
          noticeText: '※ 결제 금액은 정상 요금으로 결제되며, 단축된 잔여 시간에 대한 부분 환불은 불가합니다.',
          onConfirm: () => {
            setClosingPromptModal(null);
            setSelectedProduct({
              ...prod,
              duration_min: maxUserMin
            });
            setStep('PAYMENT');
          },
          onCancel: () => {
            setClosingPromptModal(null);
          }
        });
        return;
      }
    }

    setSelectedProduct(prod);
    setStep('PAYMENT');
  };

  // 4. 라카 연장/대여 상품 선택 및 결제 트리거
  const handleLockerPaymentTriggered = async (
    lockerNo: number,
    prod: Product,
    extendDays: number,
    displayLockerNo?: number | string
  ) => {
    const targetLockerId = lockerNo || authMember?.locker_info?.locker_id || Number(authMember?.locker_info?.locker_no) || 0;
    const resolvedDisplayNo = String(displayLockerNo || targetLockerId || authMember?.locker_info?.locker_no || '').trim();
    setSelectedLockerNo(targetLockerId || resolvedDisplayNo);
    setSelectedLockerDisplayNo(resolvedDisplayNo || null);
    setSelectedProduct({ ...prod, days: extendDays || prod.days });
    setSelectedBayNo(null);
    setSelectedBayNos([]);
    setPurpose('EXTEND_LOCKER');
    // [BUG-01 FIX] HOLD 예약(ReservationMaster.pay_amt)에는 등급할인 차감 전 상품 기준가(rawLockerPrice)를 저장하여
    // PaymentTerminal에서 쿠폰/포인트 복합 사용 시 백엔드 웹훅에서 등급할인이 이중 차감(400 Mismatch)되는 현상을 원천 차단
    const rawLockerPrice =
      prod.sale_price !== undefined && prod.sale_price !== null && prod.sale_price > 0
        ? prod.sale_price
        : prod.standard_price;
    try {
      const holdRes = await api.holdLockerExtension(
        targetLockerId,
        rawLockerPrice,
        prod.prod_cd,
        authMember?.member_no,
        resolvedDisplayNo || targetLockerId
      );
      const heldResId = holdRes?.resId || holdRes?.res_id;
      if (!holdRes?.success || !heldResId) {
        showErrorModal(holdRes?.message || '라카 연장 예약 생성에 실패했습니다. 직원을 호출해 주세요.');
        return;
      }
      setCurrentHoldResId(heldResId);
      currentHoldResIdRef.current = heldResId;
      setStep('PAYMENT');
    } catch (e: any) {
      console.warn('Locker hold failed:', e);
      showErrorModal(e?.message || '라카 연장 예약 생성 중 통신 오류가 발생했습니다.');
      return;
    }
  };

  // 5. 결제 및 배정 완전 성공 (영수증 출력 후 메인 복귀)
  const executeAutoReversal = async (
    cardApproval: CardApprovalResult | undefined,
    payAmount: number,
    reason: string
  ): Promise<{ success: boolean; message: string }> => {
    return executeKioskAutoReversal({
      cardApproval,
      payAmount,
      reason,
      isTaxFree: selectedProduct?.vat_yn === 'N',
      terminalId: settings.terminalId,
    });
  };

  const handlePaymentCompleted = async (payResult?: { 
    apprNo: string; 
    tradeDate: string; 
    amount: number; 
    usedPoints?: number;
    discountAmount?: number;
    couponNo?: string;
    couponDiscount?: number;
    installmentMonths?: number;
    cardApproval?: CardApprovalResult 
  }) => {
    if (isAllocatingRef.current) return;
    isAllocatingRef.current = true;
    showToast('모든 처리가 안전하게 완료되었습니다. 이용권을 챙겨주세요!');
    
    let hasCustomModal = false;
    try {
      // [BUG-1 FIX] 일일권 배정: allocateBay + processPaymentWebhook 이중 호출 제거
      // 통합 API(POST /api/v1/kiosk/allocate-bay)로 단일 처리 (CoreEngine 2회 호출 방지)
      if (purpose === 'ALLOCATE_DAILY' && selectedBayNo && selectedProduct) {
        hasCustomModal = true;
        const effectiveDailyBasePrice =
          selectedProduct.sale_price !== undefined && selectedProduct.sale_price !== null && selectedProduct.sale_price > 0
            ? selectedProduct.sale_price
            : selectedProduct.standard_price;
        const actualPaidAmount = payResult?.amount ?? (
          authMember?.discount_rate && authMember.discount_rate > 0
            ? Math.max(0, effectiveDailyBasePrice - Math.round(effectiveDailyBasePrice * (authMember.discount_rate / 100)))
            : effectiveDailyBasePrice
        );
        try {
          const finalDuration = selectedProduct.duration_min ?? (selectedProduct as any).durationMin ?? selectedProduct.time_min ?? DEFAULT_SESSION_MIN;
          const couponDiscount = payResult?.couponDiscount || 0;
          const gradeDiscount = Math.max(0, (payResult?.discountAmount || 0) - couponDiscount);
          const allocResult = await api.allocateBay(
            selectedBayNo,
            finalDuration,
            authMember?.member_no,
            authMember?.member_name || '비회원',
            authMember?.hp || '010-0000-0000',
            undefined,       // member_item_id — 일일권은 null
            'CARD',          // [BUG-3 FIX] payment_method 명시
            actualPaidAmount, // [SSOT] 등급 할인 및 쿠폰 할인 반영 실제 결제 금액 전달
            payResult?.cardApproval,          // [VAN Financial Integration] 승인 메타데이터 전달
            payResult?.couponNo,              // [COUPON] 적용 쿠폰 번호
            couponDiscount,                   // [COUPON] 쿠폰 할인액 (중복 차감 방지)
            {
              usedPoints: payResult?.usedPoints || 0,
              gradeDiscountAmount: gradeDiscount,
              prodCd: selectedProduct.prod_cd,
              acceptClosingTruncate: true
            }
          );
          if (allocResult) {
            if (!allocResult.success) {
              hasCustomModal = false;
              // 🚨 2-Phase Commit 보상 트랜잭션 (자동 망취소)
              let cancelInfo = '';
              if (payResult?.cardApproval) {
                const cancelRes = await executeAutoReversal(payResult.cardApproval, actualPaidAmount, allocResult.message || '타석 배정 실패');
                cancelInfo = `\n\n[결제 취소 결과] ${cancelRes.message}`;
              }
              showErrorModal(
                (allocResult.message || '일일권 타석 배정에 실패했습니다. 카운터 직원을 호출해 주세요.') + cancelInfo,
                '타석 배정 실패 및 결제 취소',
                false,
                undefined,
                () => handleLogoutToHome()
              );
              return;
            } else {
              if (allocResult.hardware_success === false) {
                setHwFailAlert({ bayNo: selectedBayNo, resId: allocResult.res_id || '' });
                showErrorModal(`${selectedBayNo}번 타석 결제는 완료되었으나 센서 기기 가동에 실패했습니다. 직원을 호출해주세요.`, '타석 기기 시작 확인 필요', true);
              }
              
              const allocatedBayNo = selectedBayNo;
              const confirmedMemberName = authMember?.member_name || '비회원';
              // 🔒 [1차 방어막] 카드 결제 배정 성공 직후 세션 및 선점 타석 상태 즉시 완전 파기
              setAuthMember(null);
              setSelectedAssetId(null);
              setSelectedBayNo(null);
              selectedBayNoRef.current = null;
              
              setStep('PRACTICE_SELECT');
              setCompletedAllocationInfo({
                bayNo: allocatedBayNo,
                durationMin: (allocResult as any).duration_min ?? finalDuration,
                startTime: (allocResult as any).start_time || (allocResult as any).startTime,
                endTime: (allocResult as any).end_time || (allocResult as any).endTime,
                resId: allocResult.res_id,
                memberName: confirmedMemberName,
                payAmount: actualPaidAmount,
                originalAmount: effectiveDailyBasePrice,
                discountAmount: payResult?.discountAmount ?? (gradeDiscount + couponDiscount),
                usedPoints: payResult?.usedPoints || 0,
                cardIssuer: payResult?.cardApproval?.issuer_name,
                cardNoMasked: payResult?.cardApproval?.card_no_masked,
                terminalId: payResult?.cardApproval?.terminal_id,
                authNo: payResult?.apprNo || payResult?.cardApproval?.auth_code,
                installmentMonths: payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
                vatYn: selectedProduct.vat_yn || 'Y',
              });
            }
          }
        } catch (err: any) {
          console.error('[BUG-1 FIX] 일일권 타석 배정 실패:', err);
          hasCustomModal = false;
          // 🚨 2-Phase Commit 보상 트랜잭션 (자동 망취소)
          let cancelInfo = '';
          if (payResult?.cardApproval) {
            const cancelRes = await executeAutoReversal(payResult.cardApproval, actualPaidAmount, err?.message || '통신 오류');
            cancelInfo = `\n\n[결제 취소 결과] ${cancelRes.message}`;
          }
          showErrorModal(
            (err?.message || '타석 배정 중 오류가 발생했습니다. 직원에게 문의해주세요.') + cancelInfo,
            '타석 배정 오류 및 결제 취소',
            false,
            undefined,
            () => handleLogoutToHome()
          );
          return;
        }
      }

      // 동반자 일괄 결제 완료 시점에 반영
      if (companionTargets.length > 0) {
        hasCustomModal = true;
        try {
          const groupCouponDiscount = payResult?.couponDiscount || 0;
          const groupGradeDiscount = Math.max(0, (payResult?.discountAmount || 0) - groupCouponDiscount);
          const groupRes = await api.allocateGroupBays(
            companionTargets.map(t => ({
              bayNo: t.bayNo,
              durationMin: t.durationMin ?? DEFAULT_SESSION_MIN,
              memberNo: t.memberNo,
              memberName: t.memberName,
              hp: t.hp,
              memberItemId: t.memberItemId,
              paymentMethod: t.price > 0 ? 'CARD' : 'TICKET',
              amount: t.price
            })),
            payResult?.cardApproval,
            {
              acceptClosingTruncate: true,
              couponNo: payResult?.couponNo,
              discountAmount: groupCouponDiscount,
              usedPoints: payResult?.usedPoints || 0,
              gradeDiscountAmount: groupGradeDiscount
            }
          );
          if (!groupRes.success) {
            throw new Error(groupRes.message || '동반자 타석 배정 실패');
          }
          const firstRes = groupRes.results?.[0] || {};
          const leaderName = authMember?.member_name || companionTargets[0]?.memberName || '회원';
          const groupOrigAmt = companionTargets.reduce((sum, c) => sum + (c.price || 0), 0);
          const groupPaidAmt = payResult?.cardApproval?.amount ?? payResult?.amount ?? groupOrigAmt;
          const allocatedSummary = `${leaderName} 외 ${companionTargets.length - 1}명 (${companionTargets.map(t => t.bayNo).join(', ')}번)`;
          const firstBayNo = companionTargets.length > 1 ? companionTargets.map(t => t.bayNo).join(', ') : companionTargets[0].bayNo;
          const firstDuration = firstRes.duration_min ?? companionTargets[0].durationMin ?? DEFAULT_SESSION_MIN;

          setCompanionTargets([]);
          setAuthMember(null);
          setSelectedAssetId(null);
          setSelectedBayNo(null);
          selectedBayNoRef.current = null;
          setSelectedBayNos([]);
          selectedBayNosRef.current = [];
          setStep('PRACTICE_SELECT');
          showToast(lang === 'KO' ? '동반자 타석 결제 및 배정이 완료되었습니다!' : 'Group allocation & payment completed!');
          setCompletedAllocationInfo({
            bayNo: firstBayNo,
            durationMin: firstDuration,
            startTime: firstRes.start_time || firstRes.startTime,
            endTime: firstRes.end_time || firstRes.endTime,
            resId: firstRes.res_id,
            memberName: allocatedSummary,
            payAmount: groupPaidAmt,
            originalAmount: groupOrigAmt,
            discountAmount: payResult?.discountAmount ?? (groupGradeDiscount + groupCouponDiscount),
            usedPoints: payResult?.usedPoints || 0,
            cardIssuer: payResult?.cardApproval?.issuer_name,
            cardNoMasked: payResult?.cardApproval?.card_no_masked,
            terminalId: payResult?.cardApproval?.terminal_id,
            authNo: payResult?.apprNo || payResult?.cardApproval?.auth_code,
            installmentMonths: payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
            vatYn: selectedProduct?.vat_yn || 'Y',
          });
        } catch (err: any) {
          console.error('동반자 결제 후 배정 실패:', err);
          hasCustomModal = false;
          // 🚨 [P1-13] 통합 카드 결제 자동 망취소: 실제 카드 승인 금액 최우선 사용
          let cancelInfo = '';
          if (payResult?.cardApproval) {
            const actualPaidAmt = payResult?.cardApproval?.amount ?? payResult?.amount ?? companionTargets.reduce((sum, c) => sum + (c.price || 0), 0);
            const cancelRes = await executeAutoReversal(payResult.cardApproval, actualPaidAmt, err?.message || '동반자 배정 오류');
            cancelInfo = `\n\n[결제 취소 결과] ${cancelRes.message}`;
          }
          showErrorModal(
            (err?.message || '동반자 타석 배정 처리 중 오류가 발생했습니다.') + cancelInfo,
            '동반자 배정 실패 및 결제 취소',
            false,
            undefined,
            () => handleLogoutToHome()
          );
          return;
        }
      }

      // 일반 회원권 구매 성공인 경우
      if (purpose === 'PURCHASE_PRODUCT' && authMember && selectedProduct) {
        hasCustomModal = true;
        const effectiveProductBasePrice =
          selectedProduct.sale_price !== undefined && selectedProduct.sale_price !== null && selectedProduct.sale_price > 0
            ? selectedProduct.sale_price
            : selectedProduct.standard_price;
        const actualProductPaid = payResult?.amount ?? (
          authMember?.discount_rate && authMember.discount_rate > 0
            ? Math.max(0, effectiveProductBasePrice - Math.round(effectiveProductBasePrice * (authMember.discount_rate / 100)))
            : effectiveProductBasePrice
        );
        try {
          const gradeOnlyDisc = Math.max(0, (payResult?.discountAmount || 0) - (payResult?.couponDiscount || 0));
          const res: any = await api.purchaseProduct(
            authMember.member_no, 
            selectedProduct.prod_cd, 
            actualProductPaid,
            payResult?.apprNo,
            payResult?.cardApproval?.van_tr_no,
            payResult?.couponNo,
            payResult?.couponDiscount || 0,
            payResult?.usedPoints || 0,
            gradeOnlyDisc,
            payResult?.cardApproval
          );
          if (res && res.success === false) {
            throw new Error(res.message || '회원권 전산 등록에 실패했습니다.');
          }
          // 🛡️ BUG-S08: 키오스크 감사 로그 적재
          await api.writeKioskLog(
            'PRODUCT_PURCHASE',
            `회원권/상품 구매 완료 (${selectedProduct.prod_nm}, 결제금액: ${actualProductPaid.toLocaleString()}원)`,
            authMember.member_no
          );
          const resolvedDays = selectedProduct.days ?? selectedProduct.access_rules?.days ?? selectedProduct.rules_detail?.days;
          const resolvedTotalCount = selectedProduct.total_count ?? selectedProduct.access_rules?.total_count ?? selectedProduct.rules_detail?.total_count;
          setCompletedPurchaseInfo({
            memberNo: authMember.member_no,
            memberName: authMember.member_name,
            memberHp: authMember.hp,
            productName: selectedProduct.meta_data?.display_nm || selectedProduct.prod_nm,
            amount: actualProductPaid,
            originalAmount: effectiveProductBasePrice,
            discountAmount: payResult?.discountAmount ?? (gradeOnlyDisc + (payResult?.couponDiscount || 0)),
            usedPoints: payResult?.usedPoints || 0,
            apprNo: payResult?.apprNo || Math.floor(10000000 + Math.random() * 90000000).toString(),
            tradeDate: payResult?.tradeDate || TimeMaster.formatKstDateTime(new Date()),
            purchaseType: 'MEMBERSHIP',
            startDate: res?.start_date,
            endDate: res?.end_date ?? null,
            days: resolvedDays,
            totalCount: resolvedTotalCount,
            logicType: selectedProduct.logic_type,
            cardIssuer: payResult?.cardApproval?.issuer_name,
            cardNoMasked: payResult?.cardApproval?.card_no_masked,
            terminalId: payResult?.cardApproval?.terminal_id,
            installmentMonths: payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
            vatYn: selectedProduct.vat_yn || 'Y',
          } as any);
          setAuthMember(null);
          setStep('MAIN_DASHBOARD');
        } catch (err: any) {
          console.error('회원권 구매 등록 실패:', err);
          hasCustomModal = false;
          let cancelInfo = '';
          if (payResult?.cardApproval) {
            const cancelRes = await executeAutoReversal(payResult.cardApproval, actualProductPaid, err?.message || '회원권 등록 실패');
            cancelInfo = `\n\n[결제 취소 결과] ${cancelRes.message}`;
          }
          showErrorModal(
            (err?.message || '회원권 전산 등록 중 오류가 발생했습니다.') + cancelInfo,
            '회원권 구매 실패 및 결제 취소',
            false,
            undefined,
            () => handleLogoutToHome()
          );
          return;
        }
      }

      // 라카 연장/대여 결제 완료 시점에 반영
      if (purpose === 'EXTEND_LOCKER' && selectedLockerNo && selectedProduct && authMember) {
        hasCustomModal = true;
        const effectiveLockerBasePrice =
          selectedProduct.sale_price !== undefined && selectedProduct.sale_price !== null && selectedProduct.sale_price > 0
            ? selectedProduct.sale_price
            : selectedProduct.standard_price;
        const defaultGradeDisc =
          authMember?.discount_rate && authMember.discount_rate > 0
            ? Math.round(effectiveLockerBasePrice * (authMember.discount_rate / 100))
            : 0;
        const actualLockerPaid =
          payResult?.cardApproval?.amount ??
          payResult?.amount ??
          Math.max(0, effectiveLockerBasePrice - defaultGradeDisc - (payResult?.couponDiscount || 0) - (payResult?.usedPoints || 0));
        try {
          const lockerGradeOnlyDisc = Math.max(0, (payResult?.discountAmount || defaultGradeDisc) - (payResult?.couponDiscount || 0));
          const res: any = await api.extendLocker(
            selectedLockerNo, 
            selectedProduct.days || 30, 
            actualLockerPaid,
            currentHoldResId || undefined,
            payResult?.couponNo,
            payResult?.couponDiscount || 0,
            payResult?.usedPoints || 0,
            lockerGradeOnlyDisc,
            {
              ...(payResult?.cardApproval || {}),
              prodCd: selectedProduct.prod_cd,
            }
          );
          if (res && res.success === false) {
            throw new Error(res.message || '라카 연장 전산 등록에 실패했습니다.');
          }
          const finalLockerLabel = res?.locker_no || selectedLockerDisplayNo || selectedLockerNo || authMember?.locker_info?.locker_no;
          setCompletedPurchaseInfo({
            memberName: authMember.member_name,
            memberNo: authMember.member_no,
            memberHp: authMember.hp,
            productName: `${finalLockerLabel}번 개인 사물함 (라카 ${selectedProduct.days || 30}일 대여)`,
            days: selectedProduct.days || 30,
            amount: actualLockerPaid,
            originalAmount: effectiveLockerBasePrice,
            discountAmount: payResult?.discountAmount ?? (lockerGradeOnlyDisc + (payResult?.couponDiscount || 0)),
            usedPoints: payResult?.usedPoints || 0,
            apprNo: payResult?.apprNo || Math.floor(10000000 + Math.random() * 90000000).toString(),
            tradeDate: payResult?.tradeDate || TimeMaster.formatKstDateTime(new Date()),
            purchaseType: 'LOCKER',
            startDate: res?.start_date,
            endDate: res?.end_date,
            cardIssuer: payResult?.cardApproval?.issuer_name,
            cardNoMasked: payResult?.cardApproval?.card_no_masked,
            terminalId: payResult?.cardApproval?.terminal_id,
            installmentMonths: payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
            vatYn: selectedProduct.vat_yn || 'Y',
          } as any);
          setAuthMember(null);
          setStep('MAIN_DASHBOARD');
        } catch (err: any) {
          console.error('라카 연장 등록 실패:', err);
          hasCustomModal = false;
          const holdToCancel = currentHoldResId || currentHoldResIdRef.current;
          if (holdToCancel) {
            await api.cancelHoldReservation(holdToCancel).catch(console.error);
            setCurrentHoldResId(null);
            currentHoldResIdRef.current = null;
          }
          let cancelInfo = '';
          if (payResult?.cardApproval) {
            const cancelRes = await executeAutoReversal(payResult.cardApproval, actualLockerPaid, err?.message || '라카 연장 등록 실패');
            cancelInfo = `\n\n[결제 취소 결과] ${cancelRes.message}`;
          }
          showErrorModal(
            (err?.message || '라카 연장 전산 등록 중 오류가 발생했습니다.') + cancelInfo,
            '라카 연장 실패 및 결제 취소',
            false,
            undefined,
            () => handleLogoutToHome()
          );
          return;
        }
      }

      // 성공적으로 배정된 타석 변수 초기화 (중복 release 락 해제 방지)
      setSelectedBayNo(null);
      setSelectedBayNos([]);
      selectedBayNoRef.current = null;
      selectedBayNosRef.current = [];

      // 최신 타석 상태 재조회
      await loadBays();

      setCurrentHoldResId(null);
      currentHoldResIdRef.current = null;

      if (!hasCustomModal) {
        handleLogoutToHome();
      }
    } finally {
      isAllocatingRef.current = false;
    }
  };

  return (
    <div className="kiosk-container" style={{ zoom: zoomScale }}>
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

      {/* 🔒 좌측 상단 5회 연속 탭 히든 관리자 진입 구역 (고객 비노출) */}
      <div
        onClick={() => handleHiddenTap(handleSecretTrigger)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '120px',
          height: '120px',
          zIndex: 140,
          cursor: 'default',
        }}
        title="Admin Zone"
      />

      {/* 🚧 임시 점검 모드 오버레이 */}
      <MaintenanceOverlay
        isVisible={settings.isMaintenanceMode || !isKioskActive}
        noticeMessage={inactiveNotice}
        onHiddenTap={() => handleHiddenTap(handleSecretTrigger)}
      />

      {/* 🔒 관리자 PIN 모달 */}
      <AdminPinModal
        isOpen={isAdminPinOpen}
        onClose={() => setIsAdminPinOpen(false)}
        onSuccess={() => {
          setIsAdminPinOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* ⚙️ 키오스크 환경설정 모달 */}
      <KioskSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        kioskMenuConfigs={kioskMenuConfigs}
        checkinPolicy={checkinPolicy}
        faceTerminalEnabled={faceTerminalEnabled}
      />

      {/* A. 인트로 광고 화면 단계 */}
      {step === 'INTRO' && (
        <IntroScreen
          onStart={handleStartKiosk}
          storeName={storeName}
          bays={bays}
          photoUrl={photoUrl}
          logoUrl={logoUrl}
        />
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
              padding: (step === 'MAIN_DASHBOARD' || step === 'PAYMENT') ? '30px' : '30px 30px 130px 30px',
              transition: 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
          >
            
            {/* 최상단 지점 및 세션 네비게이션 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              {step === 'MAIN_DASHBOARD' ? (
                <div 
                  style={{ cursor: 'pointer', width: '120px', height: '40px' }}
                  onClick={() => handleLogout()}
                />
              ) : (
                <div style={{ width: '120px', height: '40px' }} />
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

                  {/* 🔍 [상단 줌 컨트롤러] 화면 확대/축소 [- 100% +] 버튼 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(0,0,0,0.04)',
                    padding: '3px 8px',
                    borderRadius: '16px',
                    border: '1px solid rgba(0,0,0,0.08)'
                  }}>
                    <button
                      onClick={handleZoomOut}
                      title="화면 축소"
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: 'none',
                        background: '#ffffff',
                        color: '#1d1d1f',
                        fontSize: '16px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                      }}
                    >
                      -
                    </button>

                    <span 
                      onClick={handleZoomReset}
                      title="클릭 시 100% 기본 비율로 초기화"
                      style={{
                        fontSize: '13px',
                        fontWeight: 900,
                        color: '#059669',
                        padding: '0 6px',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      {Math.round(zoomScale * 100)}%
                    </span>

                    <button
                      onClick={handleZoomIn}
                      title="화면 확대"
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        border: 'none',
                        background: '#ffffff',
                        color: '#1d1d1f',
                        fontSize: '16px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                      }}
                    >
                      +
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
            {step === 'MAIN_DASHBOARD' && completedAllocationInfo === null && feedbackCountdown === null && (
              <KioskMainDashboard 
                lang={lang}
                kioskMenuConfigs={kioskMenuConfigs}
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
                onSignUp={() => {
                  setPurpose(null);
                  setAuthMember(null);
                  setStep('MEMBER_REGISTER');
                }}
                onCheckin={checkinPolicy !== 'DISABLED' ? () => {
                  setPurpose('CHECKIN_RESERVATION');
                  setInitialAuthMode('SMART_TAG');
                  if (authMember) {
                    setStep('CHECKIN_SELECT');
                  } else {
                    setStep('MEMBER_AUTH');
                  }
                } : undefined}
                onMenuClick={(menuId, zoneIds) => {
                  const zIds = zoneIds || [];
                  setSelectedZoneIds(zIds);
                  const builtinIds = ['ALLOCATE_DAILY', 'PAR3', 'PURCHASE_PRODUCT', 'LOCKER', 'MOVE_BAY', 'SIGNUP'];
                  if (!builtinIds.includes(menuId)) {
                    const customMenu = kioskMenuConfigs.find((m: any) => m.menu_id === menuId);
                    if (customMenu) {
                      if (zIds.length > 0) {
                        setPurpose('ALLOCATE_DAILY');
                        setStep('PRACTICE_SELECT');
                      } else {
                        setCustomMenuNotice({
                          title: customMenu.menu_name || '서비스 안내',
                          desc: customMenu.description || '선택하신 서비스에 대한 안내입니다.'
                        });
                      }
                    }
                  }
                }}
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
                  onCheckinSuccess={(
                    bayNo: number | string,
                    resId: string,
                    durationMin?: number,
                    startTime?: string,
                    endTime?: string,
                    message?: string,
                    checkinMode?: string
                  ) => {
                    const numericBay = typeof bayNo === 'number' ? bayNo : (parseInt(String(bayNo).replace(/[^0-9]/g, ''), 10) || 1);
                    setSelectedBayNo(numericBay);
                    setCheckinResId(resId);
                    setPurpose('CHECKIN_RESERVATION');
                    showToast(message || (lang === 'KO' ? `${bayNo}번 타석 체크인이 완료되었습니다.` : `Bay ${bayNo} check-in completed.`));
                    setCompletedAllocationInfo({
                      bayNo: bayNo,
                      durationMin: durationMin ?? DEFAULT_SESSION_MIN,
                      startTime,
                      endTime,
                      resId: resId,
                      memberName: authMember?.member_name || '회원',
                      payAmount: 0,
                      checkinMode,
                      noticeMessage: message
                    });
                    setAuthMember(null);
                    setStep('MAIN_DASHBOARD');
                  }}
                  onCancel={handleGoHome}
                />
              )
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2: 회원인증 (안면 / 폰번호 / QR 스캔)
                ---------------------------------------------------------------- */}
            {(step === 'MEMBER_AUTH' && ((purpose as string) === 'ALLOCATE_MEMBERSHIP' || (purpose as string) === 'ALLOCATE_DAILY')) && (
               <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9000 }}>
                 <MemberAuth
                   initialAuthMode={initialAuthMode}
                   faceTerminalEnabled={effectiveFaceTerminalEnabled}
                   onAuthSuccess={handleAuthSuccess}
                   onCancel={handleGoBack}
                   onSignUpClick={() => setStep('MEMBER_REGISTER')}
                   onAuthError={(code, detail) => {
                     const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                     if (bayToRelease !== null) {
                       api.releaseBay(bayToRelease).catch(console.error);
                       setSelectedBayNo(null);
                       selectedBayNoRef.current = null;
                     }
                     const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
                     if (baysToRelease.length > 0) {
                       api.releaseBays(baysToRelease).catch(console.error);
                       setSelectedBayNos([]);
                       selectedBayNosRef.current = [];
                     }
                     const trace = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
                     setErrorMasterCard({
                       code,
                       detail,
                       traceId: trace
                     });
                     api.writeKioskLog('AUTH_ERROR', `${detail} (Trace ID: ${trace})`);
                     setPurpose(null);
                     setStep('MAIN_DASHBOARD');
                   }}
                 />
               </div>
            )}
            
            {step === 'MEMBER_AUTH' && !((purpose as string) === 'ALLOCATE_MEMBERSHIP' || (purpose as string) === 'ALLOCATE_DAILY') && (
              <MemberAuth
                initialAuthMode={initialAuthMode}
                faceTerminalEnabled={effectiveFaceTerminalEnabled}
                onAuthSuccess={handleAuthSuccess}
                onCancel={handleGoHome}
                onSignUpClick={purpose === 'CHECKIN_RESERVATION' || purpose === 'MOVE_BAY' || purpose === 'EXTEND_LOCKER' ? undefined : () => setStep('MEMBER_REGISTER')}
                onAuthError={(code, detail) => {
                  const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                  if (bayToRelease !== null) {
                    api.releaseBay(bayToRelease).catch(console.error);
                    setSelectedBayNo(null);
                    selectedBayNoRef.current = null;
                  }
                  const baysToRelease = selectedBayNos.length > 0 ? selectedBayNos : selectedBayNosRef.current;
                  if (baysToRelease.length > 0) {
                    api.releaseBays(baysToRelease).catch(console.error);
                    setSelectedBayNos([]);
                    selectedBayNosRef.current = [];
                  }
                  const trace = `TR-${Math.floor(100000 + Math.random() * 900000)}`;
                  setErrorMasterCard({
                    code,
                    detail,
                    traceId: trace
                  });
                  api.writeKioskLog('AUTH_ERROR', `${detail} (Trace ID: ${trace})`);
                  setPurpose(null);
                  setStep('MAIN_DASHBOARD');
                }}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.5: 신규 즉석 회원가입 (한글 오토마타 가상키보드 연동)
                ---------------------------------------------------------------- */}
            {step === 'MEMBER_REGISTER' && (
              <div style={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                zIndex: 9000,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '40px 20px'
              }}>
                <MemberRegister
                  onRegisterSuccess={handleRegisterSuccess}
                  onCancel={handleGoBack}
                  faceTerminalEnabled={effectiveFaceTerminalEnabled}
                  lang={lang}
                />
              </div>
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 2.7: 연습타석배정 (실시간 현황판 + 층별 상세 그리드 및 분기)
                - 배정 퍼널 진행 중 및 배정 완료 5초 확인 동안 100% 배경에 상시 유지
                ---------------------------------------------------------------- */}
            {(step === 'PRACTICE_SELECT' || 
              (completedAllocationInfo !== null && step !== 'TEEBOX_MAP') || 
              (feedbackCountdown !== null && step !== 'TEEBOX_MAP') ||
              (((purpose as string) === 'ALLOCATE_MEMBERSHIP' || (purpose as string) === 'ALLOCATE_DAILY') && 
               (step === 'MEMBER_AUTH' || step === 'MEMBER_REGISTER' || step === 'ASSET_SELECT' || step === 'PRODUCT_SHOP'))) && (
              <PracticeSelect
                bays={bays}
                lang={lang}
                initialSelectedBayNo={selectedBayNo}
                externalSelectedBayNos={selectedBayNos}
                justAllocatedBayNo={justAllocatedBayNo}
                feedbackCountdown={feedbackCountdown}
                onCancelCountdown={cancelFeedbackCountdown}
                onBaySelected={handlePracticeSelectConfirm}
                onGroupBaySelected={handleGroupBaySelected}
                onCancel={handleGoHome}
                onRefreshBays={loadBays}
                selectedZoneIds={selectedZoneIds}
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
                selectedDurationMin={selectedProduct?.duration_min || (selectedProduct ? ((selectedProduct as any).access_rules?.duration_min || (selectedProduct as any).rules_detail?.duration_min) : 0) || DEFAULT_SESSION_MIN}
                onConfirm={handleCompanionConfirm}
                onCancel={() => {
                  setShowCompanionModal(false);
                  api.releaseBays(selectedBayNos).catch(console.error);
                  setSelectedBayNos([]);
                  selectedBayNosRef.current = [];
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
                justAllocatedBayNo={justAllocatedBayNo}
                feedbackCountdown={feedbackCountdown}
                onCancelCountdown={cancelFeedbackCountdown}
                onBaySelected={handleBaySelected}
                onCancel={handleGoHome}
                bays={bays}
                onRefreshBays={loadBays}
                selectedZoneIds={selectedZoneIds}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 4: 회원권 / 일일권 상품 매대 (일일권 배정 시 모달 오버레이로 렌더링)
                ---------------------------------------------------------------- */}
            {step === 'PRODUCT_SHOP' && (
              purpose === 'ALLOCATE_DAILY' ? (
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(10px)',
                  zIndex: 9000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px'
                }}>
                  <div style={{ maxWidth: '1000px', width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {!authMember && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          data-testid="product-shop-member-auth-btn"
                          onClick={() => {
                            authReturnStepRef.current = 'PRODUCT_SHOP';
                            setInitialAuthMode('SMART_TAG');
                            setStep('MEMBER_AUTH');
                          }}
                          style={{
                            height: '48px',
                            padding: '0 22px',
                            borderRadius: '999px',
                            background: '#1d1d1f',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '15px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <UserCheck size={18} />
                          <span>회원 인증 / 로그인</span>
                        </button>
                      </div>
                    )}
                    <ProductShop
                      memberNo={authMember?.member_no}
                      memberName={authMember?.member_name}
                      memberGender={authMember?.gender}
                      discountRate={authMember?.discount_rate}
                      gradeName={authMember?.member_grade || authMember?.grade_cd}
                      purposeType={purpose as 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT'}
                      maxAssignableMin={bays.find(b => b.bay_no === selectedBayNo)?.max_assignable_min}
                      nextLimitResStartTime={bays.find(b => b.bay_no === selectedBayNo)?.next_limit_res_start_time}
                      onProductSelected={handleProductSelected}
                      onCancel={() => {
                        const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                        if (bayToRelease !== null) {
                          api.releaseBay(bayToRelease).catch(console.error);
                          setSelectedBayNo(null);
                          selectedBayNoRef.current = null;
                        }
                        setStep('PRACTICE_SELECT');
                      }}
                    />
                  </div>
                </div>
              ) : (
                <ProductShop
                  memberNo={authMember?.member_no}
                  memberName={authMember?.member_name}
                  memberGender={authMember?.gender}
                  discountRate={authMember?.discount_rate}
                  gradeName={authMember?.member_grade || authMember?.grade_cd}
                  purposeType={purpose as 'ALLOCATE_DAILY' | 'PURCHASE_PRODUCT'}
                  maxAssignableMin={bays.find(b => b.bay_no === selectedBayNo)?.max_assignable_min}
                  nextLimitResStartTime={bays.find(b => b.bay_no === selectedBayNo)?.next_limit_res_start_time}
                  onProductSelected={handleProductSelected}
                  onCancel={handleGoHome}
                />
              )
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 5: 라카 조회 및 연장/구매
                ---------------------------------------------------------------- */}
            {step === 'LOCKER_EXTEND' && authMember && (
              <LockerExtend
                memberNo={authMember.member_no}
                memberName={authMember.member_name}
                member={authMember}
                discountRate={authMember.discount_rate || 0}
                lang={lang}
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
                faceTerminalEnabled={effectiveFaceTerminalEnabled}
                selectedZoneIds={selectedZoneIds}
                lang={lang}
                onVanBusyChange={(busy) => {
                  isVanBusyRef.current = busy;
                }}
                onBookingSelected={(prod) => {
                  setSelectedProduct(prod);
                  setStep('PAYMENT');
                }}
                onCancel={handleGoHome}
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 6: 가상 결제 단말기 & 영수증 인출 (풀스크린 Bento Grid 레이아웃)
                ---------------------------------------------------------------- */}
            {step === 'PAYMENT' && (
              <PaymentTerminal
                productName={
                  selectedProduct
                    ? (selectedProduct.meta_data?.display_nm || selectedProduct.prod_nm)
                    : ((purpose as string) === 'ALLOCATE_MEMBERSHIP'
                      ? '회원권 타석 배정'
                      : ((purpose as string) === 'CHECKIN_RESERVATION'
                        ? '사전 예약 타석 체크인'
                        : '라카 연장 대여'))
                }
                amount={
                  selectedProduct
                    ? (selectedProduct.sale_price !== undefined && selectedProduct.sale_price !== null && selectedProduct.sale_price > 0
                        ? selectedProduct.sale_price
                        : selectedProduct.standard_price)
                    : 0
                }
                assignedBayNo={selectedBayNo}
                assignedBayNos={selectedBayNos}
                assignedLockerNo={selectedLockerDisplayNo || selectedLockerNo}
                resId={purpose === 'EXTEND_LOCKER' ? null : (currentHoldResId || checkinResId)}
                memberName={authMember?.member_name}
                memberNo={authMember?.member_no}
                memberPoint={authMember?.total_point || 0}
                discountRate={authMember?.discount_rate || 0}
                discountableAmount={
                  companionTargets.length > 0
                    ? companionTargets
                        .filter(t => Boolean(t.memberNo && authMember?.member_no && t.memberNo === authMember.member_no))
                        .reduce((sum, t) => sum + (t.price || 0), 0)
                    : undefined
                }
                productCategory={selectedProduct?.logic_type || (selectedProduct as any)?.category}
                gradeName={authMember?.member_grade || authMember?.grade_cd}
                proId={(selectedProduct as any)?.pro_id || null}
                onVanBusyChange={(busy) => { isVanBusyRef.current = busy; }}
                {...({
                  vatYn: selectedProduct?.vat_yn,
                  businessUnitType: selectedProduct?.business_unit_type,
                  businessMerchantId: selectedProduct?.business_merchant_id,
                } as any)}
                onPaymentSuccess={handlePaymentCompleted}
                onCancel={handlePaymentCancel}
                onRequestMemberAuth={
                  purpose === 'ALLOCATE_DAILY' && !authMember
                    ? () => {
                        authReturnStepRef.current = 'PAYMENT';
                        setStep('MEMBER_AUTH');
                      }
                    : undefined
                }
              />
            )}

            {/* ----------------------------------------------------------------
                📥 STEP 7: 보유 회원권 및 이용권 선택 (Asset Select - 모달 오버레이로 렌더링)
                ---------------------------------------------------------------- */}
            {step === 'ASSET_SELECT' && authMember && (
              <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(10px)',
                zIndex: 9000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
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
                    maxWidth: '680px',
                    boxSizing: 'border-box',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                        {lang === 'KO' ? '보유 이용권 선택' : 'Select Active Pass'}
                      </h2>
                    </div>

                    {/* 🌟 회원이름 시각적 강화를 위한 대형 프로필 뱃지 */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(52, 199, 89, 0.12) 0%, rgba(5, 150, 105, 0.06) 100%)',
                      border: '1.5px solid rgba(52, 199, 89, 0.35)',
                      padding: '16px 20px',
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 15px rgba(52, 199, 89, 0.08)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ background: '#059669', padding: '10px', borderRadius: '50%', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)' }}>
                          <UserCheck size={26} />
                        </div>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 900, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#059669', textDecoration: 'underline', textUnderlineOffset: '4px' }}>{authMember.member_name}</span> 님
                            <span style={{ fontSize: '13px', background: '#059669', color: '#ffffff', padding: '3px 10px', borderRadius: '10px', fontWeight: 800, letterSpacing: '0.5px' }}>
                              인증 성공
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', color: '#6b7280', fontWeight: 600, marginTop: '2px' }}>
                            회원번호: {authMember.member_no} {authMember.member_grade ? `| 등급: ${authMember.member_grade}` : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: '16px', color: '#4b5563', fontWeight: 700, margin: 0 }}>
                      {lang === 'KO' 
                        ? `배정에 사용할 유효 이용권을 터치해 주세요.`
                        : `Please select the pass to allocate.`}
                    </p>

                    {(() => {
                      const currentBayObj = bays.find(b => b.bay_no === selectedBayNo);
                      if (currentBayObj && typeof currentBayObj.max_assignable_min === 'number' && currentBayObj.max_assignable_min > 0) {
                        return (
                          <div style={{
                            background: '#fffbeb',
                            border: '1.5px solid #fcd34d',
                            borderRadius: '14px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}>
                            <span style={{ fontSize: '14px', fontWeight: 800, color: '#b45309', lineHeight: 1.4 }}>
                              ⚠️ 선택하신 {currentBayObj.bay_no}번 타석은 다음 예약({currentBayObj.next_limit_res_start_time || '예정'}) 전까지 최대 [{currentBayObj.max_assignable_min}분] 이용 가능합니다.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAssetId(null);
                                const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                                if (bayToRelease !== null) {
                                  api.releaseBay(bayToRelease).catch(console.error);
                                  setSelectedBayNo(null);
                                  selectedBayNoRef.current = null;
                                }
                                keepAuthAfterPurchaseRef.current = true;
                                setStep('PRACTICE_SELECT');
                              }}
                              style={{
                                padding: '8px 14px',
                                borderRadius: '10px',
                                background: '#d97706',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '13px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              다른 타석 선택
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Asset List Grid */}
                  <div 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      maxHeight: '450px',
                      overflowY: 'auto',
                      paddingRight: '6px'
                    }}
                  >
                    {(() => {
                      const targetZoneCode = bays.find(b => b.bay_no === selectedBayNo)?.zone_code?.toUpperCase() || 'BAY';
                      
                      const validAssets = (authMember.assets || []).filter(asset => {
                        if (asset.is_assignable === false) return false;
                        const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
                        if (logicType === 'COUNT' || logicType === 'COUPON') {
                          const cnt = asset.remain_cnt ?? asset.rem_count ?? 0;
                          if (cnt <= 0) return false;
                        } else if (logicType === 'TIME') {
                          const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
                          if (remMin <= 0) return false;
                        } else if (asset.remain_days !== undefined && asset.remain_days !== null && asset.remain_days < 0) {
                          return false;
                        }
                        if (!asset.allowed_categories || asset.allowed_categories.length === 0) return true;
                        const allowedUpper = asset.allowed_categories.map(c => c.toUpperCase());
                        return allowedUpper.includes(targetZoneCode);
                      });

                      if (validAssets.length === 0) {
                        const unassignableReasons = (authMember.assets || [])
                          .filter(a => a.is_assignable === false && a.unassignable_reason)
                          .map(a => `• ${(a as any).prod_nm || a.item_name}: ${a.unassignable_reason}`);
                        return (
                          <div 
                            style={{
                              padding: '32px',
                              textAlign: 'center',
                              color: '#86868b',
                              fontSize: '18px',
                              fontWeight: 700,
                              border: '1px dashed #dadce0',
                              borderRadius: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '16px'
                            }}
                          >
                            <div>
                              {lang === 'KO' ? '해당 타석에서 사용할 수 있는 이용권이 없습니다.' : 'No active pass items found for this zone.'}
                            </div>
                            {unassignableReasons.length > 0 && (
                              <div style={{ fontSize: '14px', color: '#dc2626', background: '#fef2f2', padding: '10px 16px', borderRadius: '10px', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
                                {unassignableReasons.map((r, idx) => (
                                  <div key={idx}>{r}</div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => {
                                setPurpose('ALLOCATE_DAILY');
                                setStep('PRODUCT_SHOP');
                              }}
                              style={{
                                padding: '14px 24px',
                                borderRadius: '12px',
                                background: '#059669',
                                color: '#ffffff',
                                fontSize: '16px',
                                fontWeight: 800,
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                              }}
                            >
                              {lang === 'KO' ? '💳 일일 타석권 결제로 전환' : 'Switch to Daily Pass Payment'}
                            </button>
                          </div>
                        );
                      }

                      // 이용권 서브 텍스트 정밀 파서 (Zero-Hardcoding: 오직 백엔드 logic_type 의존)
                      const getAssetSubtext = (asset: any) => {
                        const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
                        
                        // 유효기간 만료일자 획득 (asset 우선 -> authMember.expiry_date 폴백)
                        const rawExpDate = asset.expiry_date || asset.end_date || asset.end_dt || authMember.expiry_date;
                        const expDateText = rawExpDate ? `~${rawExpDate}` : '상시 유효';

                        // 1. 기간제 회원권 (백엔드 마스터 플래그 PERIOD / MEMBERSHIP 의존)
                        if (logicType === 'PERIOD' || logicType === 'MEMBERSHIP') {
                          return lang === 'KO' 
                            ? `유효기간: ${expDateText}` 
                            : `Valid until: ${expDateText}`;
                        }

                        // 2. 쿠폰권 / 횟수권 (백엔드 마스터 플래그 COUNT / COUPON 의존)
                        const count = asset.remain_cnt ?? asset.rem_count;
                        if ((logicType === 'COUNT' || logicType === 'COUPON') && count > 0) {
                          return lang === 'KO' 
                            ? `남은 횟수: ${count}회 | 유효기간: ${expDateText}` 
                            : `Remaining: ${count} count(s) | Exp: ${expDateText}`;
                        }

                        // 3. 분 단위 시간권 (백엔드 마스터 플래그 TIME 의존)
                        if (logicType === 'TIME') {
                          const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
                          return lang === 'KO'
                            ? `남은 시간: ${remMin}분 | 유효기간: ${expDateText}`
                            : `Remaining: ${remMin} min(s) | Exp: ${expDateText}`;
                        }

                        // 4. 기타(일일권 등)
                        return lang === 'KO' 
                          ? `유효기간: ${expDateText}` 
                          : `Valid until: ${expDateText}`;
                      };

                      const currentBayObj = bays.find(b => b.bay_no === selectedBayNo);
                      const bayMaxMin = currentBayObj?.max_assignable_min;
                      const nextResStartStr = currentBayObj?.next_limit_res_start_time || '예정';

                      return validAssets.map((asset) => {
                        const isAssetSelected = selectedAssetId === parseInt(asset.member_item_id);
                        const assetDurationMin = asset.duration_min ?? DEFAULT_SESSION_MIN;
                        const isExceedingBayLimit = typeof bayMaxMin === 'number' && bayMaxMin > 0 && assetDurationMin > bayMaxMin;
                        return (
                          <div
                            key={asset.member_item_id}
                            onClick={() => setSelectedAssetId(parseInt(asset.member_item_id))}
                            style={{
                              padding: '20px 24px',
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
                                  {(asset as any).prod_nm || (asset as any).item_name}
                                </span>
                                <span style={{ 
                                  fontSize: '15px', 
                                  color: isAssetSelected ? '#059669' : '#6b7280',
                                  fontWeight: 700
                                }}>
                                  {getAssetSubtext(asset)}
                                </span>
                                {isExceedingBayLimit && (
                                  <span style={{
                                    display: 'inline-block',
                                    marginTop: '2px',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    color: '#b45309',
                                    background: '#fef3c7',
                                    border: '1px solid #fcd34d',
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    width: 'fit-content'
                                  }}>
                                    ⚠️ 현재 타석 최대 {bayMaxMin}분만 가능 (다음예약 {nextResStartStr} · {assetDurationMin - bayMaxMin}분 단축 소멸)
                                  </span>
                                )}
                              </div>
                            </div>

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
                        setAuthMember(null);
                        const bayToRelease = selectedBayNo ?? selectedBayNoRef.current;
                        if (bayToRelease !== null) {
                          api.releaseBay(bayToRelease).catch(console.error);
                          setSelectedBayNo(null);
                          selectedBayNoRef.current = null;
                        }
                        setStep('PRACTICE_SELECT');
                      }}
                    >
                      {lang === 'KO' ? '취소' : 'Cancel'}
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

      {/* 🛑 네트워크(인터넷/서버) 단절 대형 차단 모달 (Fail-Safe) */}
      {isNetworkOffline && (
        <div
          data-testid="network-offline-modal"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.58)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '36px',
              border: '1px solid #e5e5ea',
              padding: '48px 44px',
              maxWidth: '640px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              color: '#1d1d1f',
            }}
          >
            <div style={{ fontSize: '60px', marginBottom: '16px' }}>📡</div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', marginBottom: '14px', letterSpacing: '-0.6px' }}>
              {lang === 'KO' ? '⚠️ 네트워크 연결 장애 - 카운터 문의' : '⚠️ Network Connection Error - Please Contact Counter'}
            </h2>
            <p style={{ fontSize: '18px', color: '#48484a', fontWeight: 600, lineHeight: '1.6', marginBottom: '32px' }}>
              {lang === 'KO' ? (
                <>
                  서버 및 인터넷 통신 연결이 일시적으로 원활하지 않습니다.<br />
                  이중 결제 및 예약 오류를 방지하기 위해 키오스크 운영을 일시 중단합니다.<br />
                  <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>카운터(안내 데스크) 직원에게 문의해 주세요.</strong>
                </>
              ) : (
                <>
                  Temporary network disconnection to the server.<br />
                  Kiosk operations are paused to prevent double-billing.<br />
                  <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>Please contact the front desk staff.</strong>
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                type="button"
                data-testid="network-retry-button"
                onClick={async () => {
                  const conn = await api.checkConnection();
                  setIsNetworkOffline(!conn);
                  if (conn) {
                    showToast(lang === 'KO' ? '네트워크 연결이 복구되었습니다.' : 'Connection restored.');
                    recordKioskBlackBox('HW_STATUS', '[NETWORK_RETRY_SUCCESS] 연결 재시도 성공 - 정상 복귀');
                    loadBays();
                  } else {
                    showToast(lang === 'KO' ? '아직 네트워크 연결이 복구되지 않았습니다.' : 'Network still unreachable.', false);
                    recordKioskBlackBox('API_ERROR', '[NETWORK_RETRY_FAIL] 연결 재시도 실패');
                  }
                }}
                style={{
                  height: '64px',
                  padding: '0 44px',
                  borderRadius: '999px',
                  backgroundColor: '#1d1d1f',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '19px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
                }}
              >
                {lang === 'KO' ? '연결 재시도' : 'Retry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🛑 미들웨어 장애 점검 대형 차단 모달 (POS 표준) */}
      {isMiddlewareOffline && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.58)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '36px',
              border: '1px solid #e5e5ea',
              padding: '48px 44px',
              maxWidth: '640px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              color: '#1d1d1f',
            }}
          >
            <div style={{ fontSize: '60px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', marginBottom: '14px', letterSpacing: '-0.6px' }}>
              타석 장비 미들웨어 점검 중
            </h2>
            <p style={{ fontSize: '18px', color: '#48484a', fontWeight: 600, lineHeight: '1.6', marginBottom: '32px' }}>
              현재 센서 기기 제어 서버(미들웨어) 점검 및 통신 확인 중입니다.<br />
              안전한 영업을 위해 키오스크 배정이 일시 차단되었습니다.<br />
              <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>안내 데스크 직원에게 문의해 주세요.</strong>
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  api.writeKioskLog('STAFF_CALL', '미들웨어 점검 장애 화면에서 직원을 호출함');
                  showToast('안내 데스크로 직원 호출 알림이 전송되었습니다.');
                }}
                style={{
                  height: '64px',
                  padding: '0 44px',
                  borderRadius: '999px',
                  backgroundColor: '#1d1d1f',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '19px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
                }}
              >
                🔔 직원 호출
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🟢 타석 배정 완료 안내 팝업 (5초 자동 카운트다운 & 닫기 ➔ 기존 타석 선택 화면 제자리에서 5초 활성화 확인) */}
      {completedAllocationInfo && (
        <AllocationCompleteModal
          {...(completedAllocationInfo as any)}
          bayNo={completedAllocationInfo.bayNo}
          durationMin={completedAllocationInfo.durationMin}
          startTime={completedAllocationInfo.startTime}
          endTime={completedAllocationInfo.endTime}
          resId={completedAllocationInfo.resId}
          memberName={completedAllocationInfo.memberName}
          payAmount={completedAllocationInfo.payAmount}
          lang={lang}
          onClose={() => {
            // 🔒 [3차 방어막] 배정 완료 모달이 닫히면 (외부 클릭 등 강제 종료 시도 포함) 즉시 키오스크 세션 완전 파기 (Race Condition 차단)
            if (feedbackTimerRef.current) {
              clearInterval(feedbackTimerRef.current);
              feedbackTimerRef.current = null;
            }
            setCompletedAllocationInfo(null);
            setFeedbackCountdown(null);
            setJustAllocatedBayNo(null);
            handleLogoutToHome();
          }}
        />
      )}

      {/* 🟢 회원권/라카/상품 구매 완료 안내 팝업 (10초 자동 카운트다운 & 닫기 시 메인 복귀) */}
      {completedPurchaseInfo && (
        <PurchaseCompleteModal
          purchaseInfo={completedPurchaseInfo}
          lang={lang}
          onAllocateNow={
            completedPurchaseInfo.purchaseType === 'MEMBERSHIP' &&
            completedPurchaseInfo.memberNo &&
            !['GOODS', 'RETAIL', 'FNB', 'LESSON'].includes(String(completedPurchaseInfo.logicType || '').toUpperCase())
              ? async () => {
                  const targetMemberNo = completedPurchaseInfo.memberNo!;
                  setCompletedPurchaseInfo(null);
                  try {
                    const refreshedMember = await api.getMember(targetMemberNo);
                    if (refreshedMember) {
                      setAuthMember(refreshedMember);
                      keepAuthAfterPurchaseRef.current = true;
                    }
                  } catch (err) {
                    console.warn('Failed to refresh member after purchase:', err);
                  }
                  setPurpose('ALLOCATE_MEMBERSHIP');
                  setStep('PRACTICE_SELECT');
                }
              : undefined
          }
          onClose={() => {
            setCompletedPurchaseInfo(null);
            handleLogoutToHome();
          }}
        />
      )}

      {/* 📢 신규 커스텀 메뉴 서비스 안내 팝업 모달 */}
      {customMenuNotice && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.58)', backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '36px', padding: '44px 40px', maxWidth: '540px', width: '100%',
            textAlign: 'center', boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e5e5ea'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>📢</div>
            <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', marginBottom: '16px', letterSpacing: '-0.6px' }}>
              {customMenuNotice.title}
            </h3>
            <p style={{ fontSize: '18px', color: '#48484a', lineHeight: 1.6, marginBottom: '32px', fontWeight: 600 }}>
              {customMenuNotice.desc}
            </p>
            <button
              type="button"
              onClick={() => setCustomMenuNotice(null)}
              style={{
                width: '100%', height: '64px', borderRadius: '999px', background: '#1d1d1f', color: '#ffffff',
                fontSize: '19px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
              }}
            >
              확인 및 닫기
            </button>
          </div>
        </div>
      )}

      {/* ⏰ 영업 마감시간 임박 단축 배정 승낙 모달 (SSOT) */}
      {closingPromptModal && closingPromptModal.isVisible && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.58)', backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '36px', padding: '44px 40px', maxWidth: '560px', width: '100%',
            textAlign: 'center', boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e5e5ea'
          }}>
            <div style={{
              width: '76px', height: '76px', borderRadius: '50%', background: '#f5f5f7',
              color: '#1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', border: '1px solid #e5e5ea'
            }}>
              <Clock style={{ width: '36px', height: '36px' }} />
            </div>
            <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', marginBottom: '14px', letterSpacing: '-0.6px' }}>
              {closingPromptModal.title || (closingPromptModal.reason === 'NEXT_RESERVATION_LIMIT' ? '⚠️ 다음 예약 이용시간 안내' : '⏰ 영업 마감 이용시간 안내')}
            </h3>
            <p style={{ fontSize: '18px', color: '#48484a', lineHeight: 1.6, marginBottom: '20px', fontWeight: 600, whiteSpace: 'pre-line' }}>
              {closingPromptModal.message || `영업 마감시각(${closingPromptModal.closeTime})까지 이용 가능한 시간은 [${closingPromptModal.maxMin}분]입니다.\n\n${closingPromptModal.maxMin}분으로 단축하여 배정을 진행하시겠습니까?`}
            </p>
            {closingPromptModal.noticeText && (
              <div style={{
                padding: '14px 18px', background: '#f5f5f7', borderRadius: '16px',
                marginBottom: '28px', fontSize: '14px', color: '#48484a', fontWeight: 700,
                border: '1px solid #e5e5ea', textAlign: 'center'
              }}>
                {closingPromptModal.noticeText}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <button
                type="button"
                onClick={closingPromptModal.onCancel}
                style={{
                  height: '62px', borderRadius: '999px', background: '#f5f5f7', color: '#1d1d1f',
                  fontSize: '18px', fontWeight: 800, border: '1px solid #d2d2d7', cursor: 'pointer'
                }}
              >
                {closingPromptModal.reason === 'NEXT_RESERVATION_LIMIT' ? '취소 (다른 타석 선택)' : '취소'}
              </button>
              <button
                type="button"
                onClick={closingPromptModal.onConfirm}
                style={{
                  height: '62px', borderRadius: '999px', background: '#1d1d1f', color: '#ffffff',
                  fontSize: '18px', fontWeight: 900, border: 'none', cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
                }}
              >
                {closingPromptModal.maxMin}분으로 배정 진행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⏳ 무조작 초기화 10초 전 사전 카운트다운 알림창 (화면 어디든 터치 시 즉시 연장) */}
      {inactivityCountdown !== null && step !== 'INTRO' && (
        <div
          data-testid="inactivity-warning-modal"
          onClick={() => setInactivityCountdown(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'pointer'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '36px',
              padding: '44px 40px',
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 32px 80px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '18px'
            }}
          >
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: '#f5f5f7',
                border: '1px solid #e5e5ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                fontWeight: 950,
                color: '#1d1d1f',
                letterSpacing: '-1px'
              }}
            >
              {inactivityCountdown}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.6px' }}>
                {lang === 'KO' ? `${inactivityCountdown}초 후 처음 화면으로 돌아갑니다` : `Returning to home in ${inactivityCountdown}s`}
              </h3>
              <p style={{ fontSize: '16px', color: '#86868b', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                {lang === 'KO'
                  ? '계속 이용하시려면 화면을 터치해 주세요.'
                  : 'Touch anywhere on the screen to continue.'}
              </p>
            </div>
            <button
              type="button"
              data-testid="inactivity-continue-btn"
              onClick={() => setInactivityCountdown(null)}
              style={{
                width: '100%',
                height: '64px',
                marginTop: '6px',
                borderRadius: '999px',
                background: '#1d1d1f',
                color: '#ffffff',
                fontSize: '19px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
              }}
            >
              {lang === 'KO' ? '계속 이용하기' : 'Continue Session'}
            </button>
          </div>
        </div>
      )}

      {/* 🟢 하단 전역 내비게이션 바 (처음으로 / 이전) */}
      <KioskBottomBar
        lang={lang}
        step={step}
        onGoHome={handleGoHome}
        onGoBack={handleGoBack}
      />
    </div>
  );
}
