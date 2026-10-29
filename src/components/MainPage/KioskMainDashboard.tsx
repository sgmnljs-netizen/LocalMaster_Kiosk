import React from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, KeyRound, 
  Play, UserPlus, Flag, Target, ShoppingBag, Grid
} from 'lucide-react';
import {
  useKioskSettings,
  isKioskMenuEnabled,
  KioskMenuVisibilityMap,
} from '../../stores/kioskSettings';

const TRANSLATIONS = {
  KO: {
    welcome: '원하시는 서비스를 선택해 주세요',
    subWelcome: '터치 한 번으로 빠르게 회원인증 및 타석을 배정받으실 수 있습니다.',
    recommend: '가장 빠른 예약',
    practiceTeebox: '연습타석 배정',
    practiceTeeboxSub: '보유 중인 회원권 또는 일일 타석권을 배정받아 연습을 시작합니다.',
    par3Course: '파3 코스 배정',
    par3CourseSub: '천연 잔디 파3 연습 라운딩 코스를 간편하게 예약하고 배정받습니다.',
    purchaseMembership: '회원권/상품 구매',
    purchaseMembershipSub: '1개월/3개월 정기 회원권 및 횟수권 상품을 신규 구매합니다.',
    moveBay: '타석 이동',
    moveBaySub: '현재 이용 중인 타석을 다른 비어있는 빈 타석으로 즉시 변경합니다.',
    lockerExtend: '라카 대여/연장',
    lockerExtendSub: '이용 중인 개인 사물함(라카)의 만료 기간을 즉시 연장 결제합니다.',
    signUp: '회원가입',
    signUpSub: '휴대폰 번호로 3초 만에 간편 등록 후 즉시 타석을 배정받으세요.',
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
  }
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
  onPracticeTeebox: () => void;
  onCheckin?: () => void;
  onPar3Allocation: () => void;
  onPurchaseMembership: () => void;
  onMoveBay: () => void;
  onLockerExtend: () => void;
  onSignUp: () => void;
  kioskMenuConfigs?: any[];
  menuOverrides?: KioskMenuVisibilityMap;
  onMenuClick?: (menuId: string, zoneIds: (string | number)[]) => void;
}

export default function KioskMainDashboard({
  lang,
  onPracticeTeebox,
  onCheckin,
  onPar3Allocation,
  onPurchaseMembership,
  onMoveBay,
  onLockerExtend,
  onSignUp,
  kioskMenuConfigs,
  menuOverrides,
  onMenuClick
}: KioskMainDashboardProps) {
  const t = TRANSLATIONS[lang];
  const { settings } = useKioskSettings();
  const effectiveOverrides = menuOverrides ?? settings.menuOverrides;

  // 기본 6대 표준 메뉴 폴백 리스트
  const defaultMenus = [
    { menu_id: 'ALLOCATE_DAILY', menu_name: t.practiceTeebox, description: t.practiceTeeboxSub, zone_ids: [], is_active: true, sort_order: 1, icon_type: 'TARGET' },
    { menu_id: 'PAR3', menu_name: t.par3Course, description: t.par3CourseSub, zone_ids: [], is_active: true, sort_order: 2, icon_type: 'PAR3' },
    { menu_id: 'PURCHASE_PRODUCT', menu_name: t.purchaseMembership, description: t.purchaseMembershipSub, zone_ids: [], is_active: true, sort_order: 3, icon_type: 'SHOP' },
    { menu_id: 'LOCKER', menu_name: t.lockerExtend, description: t.lockerExtendSub, zone_ids: [], is_active: true, sort_order: 4, icon_type: 'LOCKER' },
    { menu_id: 'MOVE_BAY', menu_name: t.moveBay, description: t.moveBaySub, zone_ids: [], is_active: true, sort_order: 5, icon_type: 'REPEAT' },
    { menu_id: 'SIGNUP', menu_name: t.signUp, description: t.signUpSub, zone_ids: [], is_active: true, sort_order: 6, icon_type: 'USER_PLUS' }
  ];

  // 활성화된 메뉴 목록 동적 필터링 및 정렬 (파트너센터 설정 + 기기별 로컬 오버라이드 결합)
  const rawMenus = (kioskMenuConfigs && kioskMenuConfigs.length > 0) ? kioskMenuConfigs : defaultMenus;
  const activeMenus = rawMenus
    .filter((m: any) => isKioskMenuEnabled(m.menu_id, effectiveOverrides, m.is_active !== false))
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99));

  const effectiveOnCheckin =
    onCheckin && isKioskMenuEnabled('CHECKIN', effectiveOverrides, true)
      ? onCheckin
      : undefined;

  // 메뉴 클릭 핸들러 (통합 onMenuClick 및 레거시 핸들러 하이브리드 지원)
  const handleCardClick = (menuId: string, zoneIds: (string | number)[] = []) => {
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
  const heroMenu = activeMenus.find((m: any) => m.menu_id === 'ALLOCATE_DAILY' || m.menu_id === 'ALLOCATION');
  const signupMenu = activeMenus.find((m: any) => m.menu_id === 'SIGNUP' || m.menu_id === 'REGISTER');
  const gridSubMenus = activeMenus.filter(
    (m: any) =>
      m.menu_id !== 'ALLOCATE_DAILY' &&
      m.menu_id !== 'ALLOCATION' &&
      m.menu_id !== 'SIGNUP' &&
      m.menu_id !== 'REGISTER' &&
      !(effectiveOnCheckin && m.menu_id === 'CHECKIN')
  );

  // 서브 메뉴별 전용 3D 스쿼클 테마 컬러 및 액션 문구 매핑
  const getSubMenuTheme = (menuId: string) => {
    const memberOnlyBadge = {
      badgeText: lang === 'KO' ? '👤 회원전용' : '👤 MEMBER ONLY',
      badgeColor: '#334155',
      badgeBg: '#f1f5f9',
      badgeBorder: '1px solid #cbd5e1',
    };

    switch (menuId) {
      case 'PAR3':
        return {
          iconBg: 'linear-gradient(145deg, #059669 0%, #047857 100%)',
          iconColor: '#ffffff',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          badgeText: lang === 'KO' ? '⛳ BEST 야외 코스' : '⛳ PAR-3 COURSE',
          badgeColor: '#ffffff',
          badgeBg: 'rgba(255, 255, 255, 0.2)',
          badgeBorder: '1px solid rgba(255, 255, 255, 0.35)',
          actionLabel: lang === 'KO' ? '파3 배정하기' : 'Book Par 3',
        };
      case 'PURCHASE_PRODUCT':
      case 'PRODUCTS':
      case 'MEMBERSHIP':
        return {
          iconBg: 'linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%)',
          iconColor: '#0071e3',
          border: '1px solid rgba(0, 113, 227, 0.2)',
          ...memberOnlyBadge,
          actionLabel: lang === 'KO' ? '상품 구매하기' : 'Purchase Pass',
        };
      case 'LOCKER':
        return {
          iconBg: 'linear-gradient(145deg, #fef3c7 0%, #fde68a 100%)',
          iconColor: '#d97706',
          border: '1px solid rgba(217, 119, 6, 0.22)',
          ...memberOnlyBadge,
          actionLabel: lang === 'KO' ? '라카 연장하기' : 'Extend Locker',
        };
      case 'MOVE_BAY':
      case 'CHANGE_BAY':
      default:
        return {
          iconBg: 'linear-gradient(145deg, #cffafe 0%, #a5f3fc 100%)',
          iconColor: '#0891b2',
          border: '1px solid rgba(8, 145, 178, 0.22)',
          ...memberOnlyBadge,
          actionLabel: lang === 'KO' ? '타석 이동하기' : 'Change Teebox',
        };
    }
  };

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        justifyContent: 'space-between',
        width: '100%',
        flex: 1,
        padding: '4px 10px 10px 10px'
      }}
    >
      {/* 헤더 섹션: Windows ClearType 최적화 고선명 대형 타이포그래피 */}
      <div className="animate-fade-up" style={{ textAlign: 'center', margin: '2px 0 4px 0', animationDelay: '0.1s' }}>
        <h2 style={{ fontSize: '46px', fontWeight: 800, color: '#111827', marginBottom: '8px', letterSpacing: '-1px', lineHeight: 1.2 }}>
          {t.welcome}
        </h2>
        <p style={{ fontSize: '23px', color: '#4b5563', fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>
          {t.subWelcome}
        </p>
      </div>

      {/* 🍱 2026 High-Visibility Kiosk Bento Box Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '1040px', flex: 1, justifyContent: 'space-between' }}>
        
        {/* Row 1: 2대 메인 히어로 (좌측: 예약 타석 체크인 / 우측: 1순위 연습타석 배정) */}
        {(effectiveOnCheckin || heroMenu) && (
          <div 
            className="animate-fade-up" 
            style={{ 
              animationDelay: '0.2s', 
              display: 'grid', 
              gridTemplateColumns: (effectiveOnCheckin && heroMenu) ? '1fr 1fr' : '1fr', 
              gap: '20px' 
            }}
          >
            {/* 📌 좌측: 예약 타석 체크인 (딥 포레스트 그린 패널) */}
            {effectiveOnCheckin && (
              <div
                onClick={effectiveOnCheckin}
                style={{
                  minHeight: '295px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(145deg, #064e3b 0%, #022c22 100%)',
                  borderRadius: '30px',
                  padding: '30px 32px',
                  border: '1.5px solid rgba(16, 185, 129, 0.45)',
                  boxShadow: '0 16px 36px rgba(2, 44, 34, 0.28), inset 0 1px 1.5px rgba(255, 255, 255, 0.25)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                }}
                className="apple-card-hover"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    style={{ 
                      fontSize: '17px', 
                      fontWeight: 800, 
                      background: 'rgba(16, 185, 129, 0.25)', 
                      color: '#6ee7b7', 
                      padding: '7px 16px', 
                      borderRadius: '999px',
                      letterSpacing: '-0.2px',
                      border: '1px solid rgba(16, 185, 129, 0.45)'
                    }}
                  >
                    📌 {lang === 'KO' ? '모바일 예약 회원' : 'MOBILE BOOKING'}
                  </span>
                  <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.14)', borderRadius: '50%' }}>
                    <Play size={24} fill="#ffffff" strokeWidth={0} style={{ color: '#ffffff', marginLeft: '2px' }} />
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '40px', fontWeight: 800, color: '#ffffff', margin: '0 0 8px 0', letterSpacing: '-0.8px', lineHeight: 1.2 }}>
                    {lang === 'KO' ? '예약 타석 체크인' : 'Reservation Check-in'}
                  </h3>
                  <p style={{ fontSize: '20px', color: '#d1fae5', margin: '0 0 20px 0', lineHeight: 1.4, fontWeight: 600, letterSpacing: '-0.5px', wordBreak: 'keep-all' }}>
                    {lang === 'KO' ? '회원권으로 모바일 예약하신 분은 체크인이 필요합니다.' : 'Check-in required for mobile app reservations.'}
                  </p>

                  {/* 퓨어 화이트 필 액션 버튼 (특대형) */}
                  <div 
                    style={{
                      height: '62px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#022c22',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontWeight: 800,
                      fontSize: '23px',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                      letterSpacing: '-0.4px'
                    }}
                  >
                    <span>{lang === 'KO' ? '체크인 시작하기' : 'Start Check-in'}</span>
                    <span style={{ fontSize: '24px', fontWeight: 900 }}>→</span>
                  </div>
                </div>
              </div>
            )}

            {/* 🎯 우측: 1순위 메인! 연습타석 배정 (애플 스페이스 블랙 패널) */}
            {heroMenu && (
              <div
                onClick={() => handleCardClick(heroMenu.menu_id, heroMenu.zone_ids || [])}
                style={{
                  minHeight: '295px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(145deg, #1f1f21 0%, #141415 100%)',
                  borderRadius: '30px',
                  padding: '30px 32px',
                  border: '1.5px solid rgba(255, 255, 255, 0.18)',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.25), inset 0 1px 1.5px rgba(255, 255, 255, 0.25)',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                }}
                className="apple-card-hover"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    style={{ 
                      fontSize: '17px', 
                      fontWeight: 800, 
                      background: 'rgba(255, 255, 255, 0.16)', 
                      color: '#ffffff', 
                      padding: '7px 16px', 
                      borderRadius: '999px', 
                      letterSpacing: '-0.2px', 
                      border: '1px solid rgba(255, 255, 255, 0.28)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    ⚡ {lang === 'KO' ? '빠른 타석 배정' : 'FAST ASSIGN'}
                  </span>
                  <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.14)', borderRadius: '50%' }}>
                    <Target size={28} strokeWidth={2.5} style={{ color: '#ffffff' }} />
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '40px', fontWeight: 800, color: '#ffffff', margin: '0 0 8px 0', letterSpacing: '-0.8px', lineHeight: 1.2 }}>
                    {heroMenu.menu_name || t.practiceTeebox}
                  </h3>
                  <p style={{ fontSize: '20px', color: '#e5e7eb', margin: '0 0 20px 0', lineHeight: 1.4, fontWeight: 600, letterSpacing: '-0.5px', wordBreak: 'keep-all' }}>
                    {heroMenu.description || t.practiceTeeboxSub}
                  </p>

                  {/* 🌟 1순위 퓨어 화이트 필 액션 버튼 (특대형) */}
                  <div 
                    style={{
                      height: '62px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontWeight: 800,
                      fontSize: '23px',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                      letterSpacing: '-0.4px'
                    }}
                  >
                    <span>{lang === 'KO' ? '타석 배정하기' : 'Allocate Teebox'}</span>
                    <span style={{ fontSize: '24px', fontWeight: 900 }}>→</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 2: 2x2 서브 카드 (4개 카드 모두 대형 타이틀 34px + 설명 19px + 56px 풀바 버튼 통일) */}
        {gridSubMenus.length > 0 && (
          <div 
            className="animate-fade-up" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: gridSubMenus.length === 1 ? '1fr' : '1fr 1fr', 
              gap: '20px', 
              animationDelay: '0.3s' 
            }}
          >
            {gridSubMenus.map((menu: any, index: number) => {
              const IconComp = ICON_MAP[menu.icon_type] || Target;
              const theme = getSubMenuTheme(menu.menu_id);
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
                    padding: '26px 30px',
                    background: isPar3 
                      ? 'linear-gradient(145deg, #059669 0%, #047857 50%, #064e3b 100%)' 
                      : '#ffffff',
                    borderRadius: '28px',
                    border: isPar3 
                      ? '1.5px solid rgba(52, 211, 153, 0.45)' 
                      : '1.5px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: isPar3 
                      ? '0 14px 32px rgba(6, 78, 59, 0.22), inset 0 1px 1.5px rgba(255, 255, 255, 0.3)' 
                      : '0 8px 24px rgba(0, 0, 0, 0.04), inset 0 1px 1.5px rgba(255, 255, 255, 0.9)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                  }}
                  className="apple-card-hover"
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
                          : '0 3px 8px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.7)'
                      }}
                    >
                      <IconComp size={30} strokeWidth={2.4} style={{ color: isPar3 ? '#ffffff' : theme.iconColor }} />
                    </div>

                    {theme.badgeText && (
                      <span 
                        style={{ 
                          fontSize: '16px', 
                          fontWeight: 800, 
                          color: theme.badgeColor, 
                          background: theme.badgeBg, 
                          padding: '6px 14px', 
                          borderRadius: '999px', 
                          letterSpacing: '-0.2px',
                          border: (theme as any).badgeBorder || (isPar3 ? '1px solid rgba(255, 255, 255, 0.35)' : theme.border)
                        }}
                      >
                        {theme.badgeText}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 style={{ fontSize: '34px', fontWeight: 800, color: isPar3 ? '#ffffff' : '#111827', marginBottom: '6px', letterSpacing: '-0.6px', lineHeight: 1.2 }}>
                      {menu.menu_name}
                    </h3>
                    <p style={{ fontSize: '19px', color: isPar3 ? '#d1fae5' : '#4b5563', fontWeight: 600, lineHeight: 1.4, margin: '0 0 16px 0', letterSpacing: '-0.3px', wordBreak: 'keep-all' }}>
                      {menu.description}
                    </p>

                    {/* 통일된 56px 대형 액션 필 버튼 */}
                    <div 
                      style={{ 
                        height: '56px',
                        borderRadius: '999px',
                        background: isPar3 ? '#ffffff' : '#f3f4f6',
                        color: isPar3 ? '#064e3b' : '#111827', 
                        border: isPar3 ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
                        display: 'flex',
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '8px', 
                        fontWeight: 800, 
                        fontSize: '20px',
                        boxShadow: isPar3 ? '0 3px 10px rgba(0, 0, 0, 0.18)' : '0 2px 6px rgba(0, 0, 0, 0.03)',
                        letterSpacing: '-0.3px'
                      }}
                    >
                      <span>{theme.actionLabel}</span>
                      <span style={{ fontSize: '21px', fontWeight: 900 }}>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 3: 하단 독립형 플로팅 신규 회원가입 배너 (124px 대형화 + 딥 차콜 반전 버튼) */}
        {signupMenu && (
          <div 
            className="animate-fade-up apple-card-hover"
            onClick={() => handleCardClick(signupMenu.menu_id, signupMenu.zone_ids || [])}
            style={{ 
              animationDelay: '0.4s',
              minHeight: '124px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 34px',
              background: '#ffffff',
              borderRadius: '28px',
              border: '1.5px solid rgba(0, 0, 0, 0.09)',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.04), inset 0 1px 1.5px rgba(255, 255, 255, 0.9)',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div 
                style={{ 
                  width: '66px', 
                  height: '66px', 
                  borderRadius: '20px', 
                  background: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '1px solid rgba(0, 113, 227, 0.2)',
                  boxShadow: '0 3px 8px rgba(0, 113, 227, 0.08)'
                }}
              >
                <UserPlus size={34} strokeWidth={2.4} style={{ color: '#0071e3' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 800, color: '#111827', letterSpacing: '-0.6px' }}>
                    {lang === 'KO' ? (signupMenu.menu_name || '신규 회원가입') : 'New Member Sign Up'}
                  </span>
                  <span 
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: 800, 
                      color: '#0071e3', 
                      background: 'rgba(0, 113, 227, 0.1)', 
                      padding: '5px 12px', 
                      borderRadius: '999px',
                      border: '1px solid rgba(0, 113, 227, 0.2)'
                    }}
                  >
                    {lang === 'KO' ? '⚡ 3초 간편등록' : 'Quick Join'}
                  </span>
                </div>
                <p style={{ fontSize: '19px', color: '#4b5563', fontWeight: 600, margin: 0 }}>
                  {lang === 'KO' ? (signupMenu.description || '휴대폰 번호 인증으로 손쉽게 신규 회원 등록합니다.') : 'Register in 3 seconds to assign your teebox.'}
                </p>
              </div>
            </div>

            <div 
              style={{ 
                height: '62px',
                padding: '0 28px',
                borderRadius: '999px',
                background: '#1d1d1f',
                color: '#ffffff',
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontWeight: 800, 
                fontSize: '21px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
                flexShrink: 0
              }}
            >
              <span>{lang === 'KO' ? '회원가입 시작하기' : 'Sign Up'}</span>
              <span style={{ fontSize: '22px', fontWeight: 900 }}>→</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
