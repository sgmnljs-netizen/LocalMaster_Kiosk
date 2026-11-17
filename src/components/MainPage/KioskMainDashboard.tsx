import React, { useRef } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  BookmarkCheck,
  Calendar,
  Compass,
  Flag,
  Grid,
  KeyRound,
  MapPin,
  Play,
  ShoppingBag,
  Target,
  UserCheck,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  useKioskSettings,
  isKioskMenuEnabled,
  KioskMenuVisibilityMap,
} from '../../stores/kioskSettings';
import type { Bay, KioskMenuConfig } from '../../services/api';
import { isBayTrulyAvailableForKiosk } from '../../utils/bayStatusGuard';

const TRANSLATIONS = {
  KO: {
    welcome: '원하시는 서비스를 선택해 주세요',
    subWelcome: '터치 한 번으로 빠르게 회원인증 및 타석을 배정받으실 수 있습니다.',
    recommend: '가장 빠른 예약',
    practiceTeebox: '연습타석 배정',
    practiceTeeboxSub: '원하시는 타석을 직접 선택하거나 자동 배정받습니다.',
    par3Course: '파3 코스 배정',
    par3CourseSub: '천연 잔디 파3 연습 라운딩 코스를 간편하게 예약하고 배정받습니다.',
    purchaseMembership: '회원권/상품 구매',
    purchaseMembershipSub: '정기 회원권 및 횟수권 상품을 신규 구매합니다.',
    moveBay: '타석 이동',
    moveBaySub: '이용 중인 타석을 다른 빈 타석으로 이동 변경합니다.',
    lockerExtend: '라카 연장',
    lockerExtendSub: '이용 중인 개인 사물함(라카)의 만료 기간을 즉시 연장 결제합니다.',
    signUp: '회원가입',
    signUpSub: '휴대폰 번호 인증으로 손쉽게 신규 회원 등록합니다.',
  },
  EN: {
    welcome: 'Please select a service',
    subWelcome: 'Quickly authenticate and assign your teebox with a single touch.',
    recommend: 'FASTEST BOOKING',
    practiceTeebox: 'Practice Teebox',
    practiceTeeboxSub: 'Assign your teebox instantly using active membership pass or daily ticket.',
    par3Course: 'Par-3 Course Booking',
    par3CourseSub: 'Quickly reserve and get assigned for natural grass Par-3 practice roundings.',
    purchaseMembership: 'Purchase Pass',
    purchaseMembershipSub: 'Purchase 1-month or 3-month full-day club memberships.',
    moveBay: 'Change Teebox',
    moveBaySub: 'Move your current active teebox to another vacant teebox space.',
    lockerExtend: 'Locker Extend',
    lockerExtendSub: 'Extend your locker expiration date immediately with card payment.',
    signUp: 'Sign Up',
    signUpSub: 'Not a member yet? Register easily on site to enjoy exclusive club benefits.',
  },
};

const ICON_MAP: Record<string, React.ElementType> = {
  TARGET: Target,
  PAR3: Flag,
  SHOP: ShoppingBag,
  LOCKER: KeyRound,
  REPEAT: ArrowLeftRight,
  USER_PLUS: UserPlus,
  COMPASS: Compass,
  CALENDAR: Calendar,
  GRID: Grid,
};

interface KioskMainDashboardProps {
  lang: 'KO' | 'EN';
  bays?: Bay[];
  storeName?: string;
  onReturnToIntro?: () => void;
  onPracticeTeebox: () => void;
  onCheckin?: () => void;
  onPar3Allocation: () => void;
  onPurchaseMembership: () => void;
  onMoveBay: () => void;
  onLockerExtend: () => void;
  onSignUp: () => void;
  kioskMenuConfigs?: KioskMenuConfig[];
  menuOverrides?: KioskMenuVisibilityMap;
  onMenuClick?: (menuId: string, zoneIds: (string | number)[]) => void;
}

export function sortKioskDashboardMenus(menus: ReadonlyArray<KioskMenuConfig>): KioskMenuConfig[] {
  return [...menus].sort((a, b) => {
    const orderA = typeof a.sort_order === 'number' && Number.isFinite(a.sort_order) ? a.sort_order : 99;
    const orderB = typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : 99;
    return orderA - orderB;
  });
}

export function shouldAllowDashboardCardTap(
  lastTapAtMs: number,
  nowMs: number = Date.now(),
  cooldownMs: number = 350
): boolean {
  if (!Number.isFinite(lastTapAtMs) || lastTapAtMs <= 0) return true;
  return nowMs - lastTapAtMs >= cooldownMs;
}

export default function KioskMainDashboard({
  lang,
  bays,
  storeName,
  onReturnToIntro,
  onPracticeTeebox,
  onCheckin,
  onPar3Allocation,
  onPurchaseMembership,
  onMoveBay,
  onLockerExtend,
  onSignUp,
  kioskMenuConfigs,
  menuOverrides,
  onMenuClick,
}: KioskMainDashboardProps) {
  const t = TRANSLATIONS[lang];
  const { settings } = useKioskSettings();
  const effectiveOverrides = menuOverrides ?? settings.menuOverrides;
  const lastCardTapAtRef = useRef<number>(0);

  const cleanStoreLabel = (storeName || '')
    .replace(/^골포스\s*/, '')
    .replace(/^로컬마스터\s*/, '')
    .trim();

  const practiceBays = (bays || []).filter((bay) => {
    const zCode = String(bay.zone_code || bay.zoneCode || '').toUpperCase();
    return zCode !== 'PAR3';
  });
  const liveAvailableCount = practiceBays.filter(isBayTrulyAvailableForKiosk).length;

  // 기본 6대 표준 메뉴 폴백 리스트
  const defaultMenus = [
    { menu_id: 'ALLOCATE_DAILY', menu_name: t.practiceTeebox, description: t.practiceTeeboxSub, zone_ids: [], is_active: true, sort_order: 1, icon_type: 'TARGET' },
    { menu_id: 'PAR3', menu_name: t.par3Course, description: t.par3CourseSub, zone_ids: [], is_active: true, sort_order: 2, icon_type: 'PAR3' },
    { menu_id: 'PURCHASE_PRODUCT', menu_name: t.purchaseMembership, description: t.purchaseMembershipSub, zone_ids: [], is_active: true, sort_order: 3, icon_type: 'SHOP' },
    { menu_id: 'LOCKER', menu_name: t.lockerExtend, description: t.lockerExtendSub, zone_ids: [], is_active: true, sort_order: 4, icon_type: 'LOCKER' },
    { menu_id: 'MOVE_BAY', menu_name: t.moveBay, description: t.moveBaySub, zone_ids: [], is_active: true, sort_order: 5, icon_type: 'REPEAT' },
    { menu_id: 'SIGNUP', menu_name: t.signUp, description: t.signUpSub, zone_ids: [], is_active: true, sort_order: 6, icon_type: 'USER_PLUS' },
  ];

  // 활성화된 메뉴 목록 동적 필터링 및 정렬 (파트너센터 설정 + 기기별 로컬 오버라이드 결합)
  const rawMenus: KioskMenuConfig[] = kioskMenuConfigs && kioskMenuConfigs.length > 0 ? kioskMenuConfigs : defaultMenus;
  const activeMenus = sortKioskDashboardMenus(
    rawMenus.filter((m) => isKioskMenuEnabled(m.menu_id, effectiveOverrides, m.is_active !== false))
  );

  const effectiveOnCheckin =
    onCheckin && isKioskMenuEnabled('CHECKIN', effectiveOverrides, true)
      ? onCheckin
      : undefined;

  // 메뉴 클릭 핸들러 (350ms 따닥 디바운스 + 통합 onMenuClick/레거시 핸들러 하이브리드 지원)
  const handleCardClick = (menuId: string, zoneIds: (string | number)[] = []) => {
    const nowMs = Date.now();
    if (!shouldAllowDashboardCardTap(lastCardTapAtRef.current, nowMs)) {
      return;
    }
    lastCardTapAtRef.current = nowMs;
    if (onMenuClick) {
      onMenuClick(menuId, zoneIds);
    }
    if (menuId === 'ALLOCATE_DAILY' || menuId === 'ALLOCATION' || menuId === 'SCREEN_ROOM') onPracticeTeebox();
    else if (menuId === 'CHECKIN') effectiveOnCheckin?.();
    else if (menuId === 'PAR3') onPar3Allocation();
    else if (menuId === 'PURCHASE_PRODUCT' || menuId === 'MEMBERSHIP' || menuId === 'PRODUCTS') onPurchaseMembership();
    else if (menuId === 'MOVE_BAY' || menuId === 'CHANGE_BAY') onMoveBay();
    else if (menuId === 'LOCKER') onLockerExtend();
    else if (menuId === 'SIGNUP' || menuId === 'REGISTER') onSignUp();
  };

  // 연습타석(ALLOCATE_DAILY) 및 회원가입(SIGNUP) 메뉴 분리 (CHECKIN 중복 렌더링 방어 포함)
  const heroMenu = activeMenus.find((m) => m.menu_id === 'ALLOCATE_DAILY' || m.menu_id === 'ALLOCATION');
  const signupMenu = activeMenus.find((m) => m.menu_id === 'SIGNUP' || m.menu_id === 'REGISTER');
  const gridSubMenus = activeMenus.filter(
    (m) =>
      m.menu_id !== 'ALLOCATE_DAILY' &&
      m.menu_id !== 'ALLOCATION' &&
      m.menu_id !== 'SIGNUP' &&
      m.menu_id !== 'REGISTER' &&
      !(effectiveOnCheckin && m.menu_id === 'CHECKIN')
  );

  // 서브 메뉴별 전용 3D 스쿼클 테마 컬러 · 시맨틱 경량 택타일 CTA · 액션 문구 매핑 (Zero-Emoji)
  const getSubMenuTheme = (menuId: string) => {
    const memberOnlyBadge = {
      BadgeIcon: UserCheck,
      badgeText: lang === 'KO' ? '회원전용' : 'MEMBER ONLY',
      badgeColor: '#334155',
      badgeBg: '#f8fafc',
      badgeBorder: '1px solid #cbd5e1',
    };

    switch (menuId) {
      case 'PAR3':
        return {
          iconBg: 'linear-gradient(145deg, #059669 0%, #047857 100%)',
          iconColor: '#ffffff',
          border: '1px solid rgba(52, 211, 153, 0.45)',
          BadgeIcon: Flag,
          badgeText: lang === 'KO' ? 'BEST 야외 코스' : 'PAR-3 COURSE',
          badgeColor: '#ffffff',
          badgeBg: 'rgba(255, 255, 255, 0.18)',
          badgeBorder: '1px solid rgba(255, 255, 255, 0.35)',
          ctaBg: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
          ctaBorder: '1px solid rgba(167, 243, 208, 0.85)',
          ctaColor: '#064e3b',
          ctaShadow:
            'inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -3.5px 0 rgba(16, 185, 129, 0.28), 0 8px 18px rgba(2, 44, 34, 0.22)',
          actionLabel: lang === 'KO' ? '파3 배정하기' : 'Book Par 3',
        };
      case 'PURCHASE_PRODUCT':
      case 'PRODUCTS':
      case 'MEMBERSHIP':
        return {
          iconBg: 'linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%)',
          iconColor: '#0071e3',
          border: '1px solid rgba(0, 113, 227, 0.24)',
          ...memberOnlyBadge,
          ctaBg: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
          ctaBorder: '1.5px solid #93c5fd',
          ctaColor: '#0058b9',
          ctaShadow:
            'inset 0 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 -3px 0 rgba(0, 113, 227, 0.18), 0 4px 10px rgba(0, 113, 227, 0.08)',
          actionLabel: lang === 'KO' ? '상품 구매하기' : 'Purchase Pass',
        };
      case 'LOCKER':
        return {
          iconBg: 'linear-gradient(145deg, #fef3c7 0%, #fde68a 100%)',
          iconColor: '#d97706',
          border: '1px solid rgba(217, 119, 6, 0.28)',
          ...memberOnlyBadge,
          ctaBg: 'linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)',
          ctaBorder: '1.5px solid #fcd34d',
          ctaColor: '#b45309',
          ctaShadow:
            'inset 0 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 -3px 0 rgba(217, 119, 6, 0.18), 0 4px 10px rgba(217, 119, 6, 0.08)',
          actionLabel: lang === 'KO' ? '라카 연장하기' : 'Extend Locker',
        };
      case 'MOVE_BAY':
      case 'CHANGE_BAY':
        return {
          iconBg: 'linear-gradient(145deg, #cffafe 0%, #a5f3fc 100%)',
          iconColor: '#0891b2',
          border: '1px solid rgba(8, 145, 178, 0.26)',
          ...memberOnlyBadge,
          ctaBg: 'linear-gradient(180deg, #ecfeff 0%, #cffafe 100%)',
          ctaBorder: '1.5px solid #67e8f9',
          ctaColor: '#0e7490',
          ctaShadow:
            'inset 0 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 -3px 0 rgba(8, 145, 178, 0.18), 0 4px 10px rgba(8, 145, 178, 0.08)',
          actionLabel: lang === 'KO' ? '타석 이동하기' : 'Change Teebox',
        };
      default:
        return {
          iconBg: 'linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 100%)',
          iconColor: '#334155',
          border: '1px solid rgba(100, 116, 139, 0.24)',
          BadgeIcon: Compass,
          badgeText: lang === 'KO' ? '맞춤 서비스' : 'CUSTOM',
          badgeColor: '#334155',
          badgeBg: '#f8fafc',
          badgeBorder: '1px solid #cbd5e1',
          ctaBg: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          ctaBorder: '1.5px solid #cbd5e1',
          ctaColor: '#1e293b',
          ctaShadow:
            'inset 0 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 -3px 0 rgba(71, 85, 105, 0.14), 0 4px 10px rgba(15, 23, 42, 0.06)',
          actionLabel: lang === 'KO' ? '서비스 이용하기' : 'Select Service',
        };
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '18px',
        justifyContent: 'space-between',
        width: '100%',
        flex: 1,
        padding: '6px 10px 10px 10px',
      }}
    >
      {/* 헤더 섹션: 지점 Eyebrow 중앙 통합(전광판 노출 시) + ClearType 대형 타이틀 */}
      <div
        className="animate-fade-up"
        style={{
          textAlign: 'center',
          margin: '0 0 2px 0',
          animationDelay: '0.1s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        {cleanStoreLabel && onReturnToIntro && (
          <button
            type="button"
            onClick={onReturnToIntro}
            title={lang === 'KO' ? '대기화면으로 돌아가기' : 'Return to Intro'}
            style={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 18px',
              borderRadius: '999px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05), inset 0 1px 0 #ffffff',
              color: '#0f172a',
              fontSize: '16px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
            }}
          >
            <MapPin size={16} strokeWidth={2.6} style={{ color: '#059669', flexShrink: 0 }} />
            <span>{cleanStoreLabel}</span>
          </button>
        )}
        <h2 style={{ fontSize: '44px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-1.1px', lineHeight: 1.18, wordBreak: 'keep-all' }}>
          {t.welcome}
        </h2>
        <p style={{ fontSize: '21px', color: '#475569', fontWeight: 600, letterSpacing: '-0.3px', margin: 0, wordBreak: 'keep-all' }}>
          {t.subWelcome}
        </p>
      </div>

      {/* 🍱 2026 High-Visibility Kiosk Bento Box Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', maxWidth: '1040px', flex: 1, justifyContent: 'space-between' }}>

        {/* Row 1: 2대 메인 히어로 (좌측: 예약 타석 체크인 / 우측: 1순위 연습타석 배정) */}
        {(effectiveOnCheckin || heroMenu) && (
          <div
            className="animate-fade-up"
            style={{
              animationDelay: '0.2s',
              display: 'grid',
              gridTemplateColumns: (effectiveOnCheckin && heroMenu) ? '1fr 1fr' : '1fr',
              gap: '20px',
            }}
          >
            {/* 📌 좌측: 예약 타석 체크인 (딥 포레스트 에메랄드 글래스 + 크리스탈 화이트 3D CTA) */}
            {effectiveOnCheckin && (
              <div
                onClick={() => handleCardClick('CHECKIN')}
                style={{
                  minHeight: '292px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background:
                    'radial-gradient(circle at 88% 18%, rgba(52, 211, 153, 0.24) 0%, rgba(16, 185, 129, 0.04) 44%, transparent 66%), linear-gradient(145deg, #065f46 0%, #022c22 100%)',
                  borderRadius: '30px',
                  padding: '28px 32px',
                  border: '1.5px solid rgba(52, 211, 153, 0.48)',
                  boxShadow: '0 18px 38px rgba(2, 44, 34, 0.28), inset 0 1px 1.5px rgba(255, 255, 255, 0.28)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                }}
                className="apple-card-hover shop-tactile-card"
              >
                <BookmarkCheck
                  size={120}
                  strokeWidth={1.3}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: '26px',
                    top: '44px',
                    color: 'rgba(167, 243, 208, 0.08)',
                    pointerEvents: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      fontSize: '16px',
                      fontWeight: 800,
                      background: 'rgba(16, 185, 129, 0.24)',
                      color: '#a7f3d0',
                      padding: '7px 15px',
                      borderRadius: '999px',
                      letterSpacing: '-0.2px',
                      border: '1px solid rgba(52, 211, 153, 0.42)',
                    }}
                  >
                    <BookmarkCheck size={16} strokeWidth={2.5} aria-hidden="true" />
                    <span>{lang === 'KO' ? '모바일 예약 회원' : 'MOBILE BOOKING'}</span>
                  </span>
                  <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.14)', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.22)' }}>
                    <Play size={22} fill="#ffffff" strokeWidth={0} style={{ color: '#ffffff', marginLeft: '2px' }} />
                  </div>
                </div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h3 style={{ fontSize: '40px', fontWeight: 900, color: '#ffffff', margin: '0 0 8px 0', letterSpacing: '-0.9px', lineHeight: 1.18 }}>
                    {lang === 'KO' ? '예약 타석 체크인' : 'Reservation Check-in'}
                  </h3>
                  <p style={{ fontSize: '20px', color: '#d1fae5', margin: '0 0 22px 0', lineHeight: 1.4, fontWeight: 600, letterSpacing: '-0.4px', wordBreak: 'keep-all' }}>
                    {lang === 'KO' ? '회원권으로 모바일 예약하신 분은 체크인이 필요합니다.' : 'Check-in required for mobile app reservations.'}
                  </p>

                  {/* 3D 크리스탈 스노우 필 CTA */}
                  <div
                    className="decision-tactile-btn dashboard-hero-tactile-btn dashboard-hero-snow-btn"
                    style={{ '--decision-sheen-delay': '0.8s' } as React.CSSProperties}
                  >
                    <span style={{ position: 'relative', zIndex: 2 }}>
                      {lang === 'KO' ? '체크인 시작하기' : 'Start Check-in'}
                    </span>
                    <ArrowRight
                      size={24}
                      strokeWidth={3}
                      className="decision-btn-arrow"
                      aria-hidden="true"
                      style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 🎯 우측(또는 단독 플래그십): 1순위 메인! 연습타석 배정 (미드나잇 에메랄드 글래스 + 3D 에메랄드 주얼 CTA) */}
            {heroMenu && (
              <div
                onClick={() => handleCardClick(heroMenu.menu_id, heroMenu.zone_ids || [])}
                style={{
                  minHeight: '292px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background:
                    'radial-gradient(circle at 86% 18%, rgba(16, 185, 129, 0.24) 0%, rgba(16, 185, 129, 0.05) 40%, transparent 64%), linear-gradient(145deg, #1e2428 0%, #111417 100%)',
                  borderRadius: '30px',
                  padding: '28px 32px',
                  border: '1.5px solid rgba(52, 211, 153, 0.26)',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.24), inset 0 1px 1.5px rgba(255, 255, 255, 0.24)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                }}
                className="apple-card-hover shop-tactile-card"
              >
                <Target
                  size={128}
                  strokeWidth={1.25}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: '28px',
                    top: '42px',
                    color: 'rgba(52, 211, 153, 0.08)',
                    pointerEvents: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      fontSize: '16px',
                      fontWeight: 800,
                      background: 'rgba(16, 185, 129, 0.16)',
                      color: '#a7f3d0',
                      padding: '7px 15px',
                      borderRadius: '999px',
                      letterSpacing: '-0.2px',
                      border: '1px solid rgba(52, 211, 153, 0.36)',
                    }}
                  >
                    <Zap size={15} strokeWidth={2.6} fill="#34d399" style={{ color: '#34d399' }} aria-hidden="true" />
                    <span>{lang === 'KO' ? '빠른 타석 배정' : 'FAST ASSIGN'}</span>
                  </span>
                  {practiceBays.length > 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '16px',
                        fontWeight: 800,
                        color: liveAvailableCount > 0 ? '#ecfdf5' : '#fef3c7',
                        background: 'rgba(255, 255, 255, 0.09)',
                        padding: '7px 16px',
                        borderRadius: '999px',
                        border: liveAvailableCount > 0
                          ? '1px solid rgba(52, 211, 153, 0.38)'
                          : '1px solid rgba(251, 191, 36, 0.38)',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: liveAvailableCount > 0 ? '#10b981' : '#f59e0b',
                          boxShadow: liveAvailableCount > 0 ? '0 0 8px rgba(16, 185, 129, 0.8)' : 'none',
                        }}
                      />
                      <span>
                        {lang === 'KO'
                          ? (liveAvailableCount > 0 ? `즉시 이용 ${liveAvailableCount}석` : '대기 예약 가능')
                          : (liveAvailableCount > 0 ? `${liveAvailableCount} Available Now` : 'Waitlist Open')}
                      </span>
                    </span>
                  ) : (
                    <div style={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.12)', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                      <Target size={26} strokeWidth={2.4} style={{ color: '#6ee7b7' }} />
                    </div>
                  )}
                </div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h3 style={{ fontSize: '40px', fontWeight: 900, color: '#ffffff', margin: '0 0 8px 0', letterSpacing: '-0.9px', lineHeight: 1.18 }}>
                    {heroMenu.menu_name || t.practiceTeebox}
                  </h3>
                  <p style={{ fontSize: '20px', color: '#cbd5e1', margin: '0 0 22px 0', lineHeight: 1.4, fontWeight: 600, letterSpacing: '-0.4px', wordBreak: 'keep-all' }}>
                    {heroMenu.description || t.practiceTeeboxSub}
                  </p>

                  {/* 🌟 1순위 시그니처 3D 에메랄드 주얼 택타일 CTA */}
                  <div
                    className="decision-tactile-btn decision-btn-emerald dashboard-hero-tactile-btn"
                    style={{ '--decision-sheen-delay': '0s' } as React.CSSProperties}
                  >
                    <span style={{ position: 'relative', zIndex: 2 }}>
                      {lang === 'KO' ? '타석 배정하기' : 'Allocate Teebox'}
                    </span>
                    <ArrowRight
                      size={24}
                      strokeWidth={3}
                      className="decision-btn-arrow"
                      aria-hidden="true"
                      style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 2: 2x2 서브 카드 (선명한 순백 입체 카드 + 시맨틱 경량 3D CTA + Zero-Emoji) */}
        {gridSubMenus.length > 0 && (
          <div
            className="animate-fade-up"
            style={{
              display: 'grid',
              gridTemplateColumns: gridSubMenus.length === 1 ? '1fr' : '1fr 1fr',
              gap: '20px',
              animationDelay: '0.3s',
            }}
          >
            {gridSubMenus.map((menu, index: number) => {
              const IconComp = ICON_MAP[menu.icon_type || ''] || Target;
              const theme = getSubMenuTheme(menu.menu_id);
              const BadgeIcon = theme.BadgeIcon;
              const isPar3 = menu.menu_id === 'PAR3';

              return (
                <div
                  key={menu.menu_id || index}
                  onClick={() => handleCardClick(menu.menu_id, menu.zone_ids || [])}
                  style={{
                    minHeight: '262px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '26px 28px',
                    background: isPar3
                      ? 'linear-gradient(145deg, #059669 0%, #047857 50%, #064e3b 100%)'
                      : '#ffffff',
                    borderRadius: '28px',
                    border: isPar3
                      ? '1.5px solid rgba(52, 211, 153, 0.45)'
                      : '1.5px solid #e2e8f0',
                    boxShadow: isPar3
                      ? '0 14px 32px rgba(6, 78, 59, 0.22), inset 0 1px 1.5px rgba(255, 255, 255, 0.3)'
                      : '0 10px 26px rgba(15, 23, 42, 0.055), inset 0 1px 0 #ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                  }}
                  className="apple-card-hover shop-tactile-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 3D 스쿼클 아이콘 타일 (60x60px 대형화) */}
                    <div
                      style={{
                        width: '60px',
                        height: '60px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isPar3 ? 'rgba(255, 255, 255, 0.18)' : theme.iconBg,
                        borderRadius: '18px',
                        border: isPar3 ? '1px solid rgba(255, 255, 255, 0.35)' : theme.border,
                        boxShadow: isPar3
                          ? '0 3px 8px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.4)'
                          : '0 4px 10px rgba(15, 23, 42, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                      }}
                    >
                      <IconComp size={30} strokeWidth={2.4} style={{ color: isPar3 ? '#ffffff' : theme.iconColor }} />
                    </div>

                    {theme.badgeText && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '15px',
                          fontWeight: 800,
                          color: theme.badgeColor,
                          background: theme.badgeBg,
                          padding: '6px 14px',
                          borderRadius: '999px',
                          letterSpacing: '-0.2px',
                          border: theme.badgeBorder || (isPar3 ? '1px solid rgba(255, 255, 255, 0.35)' : theme.border),
                        }}
                      >
                        <BadgeIcon size={14} strokeWidth={2.6} aria-hidden="true" />
                        <span>{theme.badgeText}</span>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: '14px' }}>
                    <h3 style={{ fontSize: '34px', fontWeight: 900, color: isPar3 ? '#ffffff' : '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.7px', lineHeight: 1.2 }}>
                      {menu.menu_name}
                    </h3>
                    <p style={{ fontSize: '19px', color: isPar3 ? '#d1fae5' : '#475569', fontWeight: 600, lineHeight: 1.4, margin: '0 0 18px 0', letterSpacing: '-0.3px', wordBreak: 'keep-all' }}>
                      {menu.description}
                    </p>

                    {/* 시맨틱 경량 3D 택타일 액션 버튼 (메뉴별 고유 컬러 립 + ArrowRight 넛지) */}
                    <div
                      className="dashboard-sub-cta"
                      style={{
                        marginTop: 'auto',
                        background: theme.ctaBg,
                        color: theme.ctaColor,
                        border: theme.ctaBorder,
                        boxShadow: theme.ctaShadow,
                      }}
                    >
                      <span>{theme.actionLabel}</span>
                      <ArrowRight size={20} strokeWidth={2.8} className="decision-btn-arrow" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 3: 하단 독립형 신규 회원가입 배너 (3순위 위계: 소프트 블루 크리스탈 택타일 CTA + Zero-Emoji) */}
        {signupMenu && (
          <div
            className="animate-fade-up apple-card-hover shop-tactile-card"
            onClick={() => handleCardClick(signupMenu.menu_id, signupMenu.zone_ids || [])}
            style={{
              animationDelay: '0.4s',
              minHeight: '118px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              padding: '18px 30px',
              background: '#ffffff',
              borderRadius: '28px',
              border: '1.5px solid #e2e8f0',
              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.055), inset 0 1px 0 #ffffff',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: 0 }}>
              <div
                style={{
                  width: '62px',
                  height: '62px',
                  borderRadius: '18px',
                  background: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(0, 113, 227, 0.22)',
                  boxShadow: '0 4px 10px rgba(0, 113, 227, 0.08)',
                  flexShrink: 0,
                }}
              >
                <UserPlus size={30} strokeWidth={2.4} style={{ color: '#0071e3' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.6px' }}>
                    {lang === 'KO' ? (signupMenu.menu_name || '신규 회원가입') : 'New Member Sign Up'}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0071e3',
                      background: 'rgba(0, 113, 227, 0.08)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      border: '1px solid rgba(0, 113, 227, 0.22)',
                    }}
                  >
                    <Zap size={13} strokeWidth={2.6} fill="#0071e3" aria-hidden="true" />
                    <span>{lang === 'KO' ? '3초 간편등록' : 'Quick Join'}</span>
                  </span>
                </div>
                <p style={{ fontSize: '18px', color: '#475569', fontWeight: 600, margin: 0, wordBreak: 'keep-all' }}>
                  {lang === 'KO' ? (signupMenu.description || '휴대폰 번호 인증으로 손쉽게 신규 회원 등록합니다.') : 'Register in 3 seconds to assign your teebox.'}
                </p>
              </div>
            </div>

            <div
              className="decision-tactile-btn dashboard-signup-cta"
              style={{ '--decision-sheen-delay': '1.6s' } as React.CSSProperties}
            >
              <span style={{ position: 'relative', zIndex: 2 }}>
                {lang === 'KO' ? '회원가입 시작하기' : 'Sign Up'}
              </span>
              <ArrowRight
                size={20}
                strokeWidth={2.8}
                className="decision-btn-arrow"
                aria-hidden="true"
                style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
