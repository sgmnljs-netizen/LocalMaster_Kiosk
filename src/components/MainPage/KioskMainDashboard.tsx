import React from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, KeyRound, 
  Play, UserPlus, Flag, Target, ShoppingBag, Grid
} from 'lucide-react';

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
  onMenuClick
}: KioskMainDashboardProps) {
  const t = TRANSLATIONS[lang];

  // 기본 6대 표준 메뉴 폴백 리스트
  const defaultMenus = [
    { menu_id: 'ALLOCATE_DAILY', menu_name: t.practiceTeebox, description: t.practiceTeeboxSub, zone_ids: [], is_active: true, sort_order: 1, icon_type: 'TARGET' },
    { menu_id: 'PAR3', menu_name: t.par3Course, description: t.par3CourseSub, zone_ids: [], is_active: true, sort_order: 2, icon_type: 'PAR3' },
    { menu_id: 'PURCHASE_PRODUCT', menu_name: t.purchaseMembership, description: t.purchaseMembershipSub, zone_ids: [], is_active: true, sort_order: 3, icon_type: 'SHOP' },
    { menu_id: 'LOCKER', menu_name: t.lockerExtend, description: t.lockerExtendSub, zone_ids: [], is_active: true, sort_order: 4, icon_type: 'LOCKER' },
    { menu_id: 'MOVE_BAY', menu_name: t.moveBay, description: t.moveBaySub, zone_ids: [], is_active: true, sort_order: 5, icon_type: 'REPEAT' },
    { menu_id: 'SIGNUP', menu_name: t.signUp, description: t.signUpSub, zone_ids: [], is_active: true, sort_order: 6, icon_type: 'USER_PLUS' }
  ];

  // 활성화된 메뉴 목록 동적 필터링 및 정렬
  const rawMenus = (kioskMenuConfigs && kioskMenuConfigs.length > 0) ? kioskMenuConfigs : defaultMenus;
  const activeMenus = rawMenus
    .filter((m: any) => m.is_active !== false)
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99));

  // 메뉴 클릭 핸들러 (통합 onMenuClick 및 레거시 핸들러 하이브리드 지원)
  const handleCardClick = (menuId: string, zoneIds: (string | number)[] = []) => {
    if (onMenuClick) {
      onMenuClick(menuId, zoneIds);
    }
    if (menuId === 'ALLOCATE_DAILY') onPracticeTeebox();
    else if (menuId === 'PAR3') onPar3Allocation();
    else if (menuId === 'PURCHASE_PRODUCT') onPurchaseMembership();
    else if (menuId === 'MOVE_BAY') onMoveBay();
    else if (menuId === 'LOCKER') onLockerExtend();
    else if (menuId === 'SIGNUP') onSignUp();
  };

  // 연습타석(ALLOCATE_DAILY) 및 회원가입(SIGNUP) 메뉴 분리
  const heroMenu = activeMenus.find((m: any) => m.menu_id === 'ALLOCATE_DAILY');
  const signupMenu = activeMenus.find((m: any) => m.menu_id === 'SIGNUP');
  const gridSubMenus = activeMenus.filter((m: any) => m.menu_id !== 'ALLOCATE_DAILY' && m.menu_id !== 'SIGNUP');

  // 서브 메뉴별 전용 3D 스쿼클 테마 컬러 매핑
  const getSubMenuTheme = (menuId: string) => {
    switch (menuId) {
      case 'PAR3':
        return {
          iconBg: 'linear-gradient(145deg, #059669 0%, #047857 100%)',
          iconColor: '#ffffff',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          badgeText: '⛳ BEST 야외 코스'
        };
      case 'PRODUCTS':
      case 'MEMBERSHIP':
        return {
          iconBg: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)',
          iconColor: '#0071e3',
          border: '1px solid rgba(0, 113, 227, 0.15)',
          badgeText: ''
        };
      case 'LOCKER':
        return {
          iconBg: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)',
          iconColor: '#d97706',
          border: '1px solid rgba(217, 119, 6, 0.15)',
          badgeText: ''
        };
      case 'CHANGE_BAY':
      default:
        return {
          iconBg: 'linear-gradient(145deg, #ecfeff 0%, #cffafe 100%)',
          iconColor: '#0891b2',
          border: '1px solid rgba(8, 145, 178, 0.15)',
          badgeText: ''
        };
    }
  };

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        justifyContent: 'center',
        width: '100%',
        padding: '10px 20px 30px 20px'
      }}
    >
      {/* 헤더 섹션: Apple SF Pro Display Typography */}
      <div className="animate-fade-up" style={{ textAlign: 'center', margin: '4px 0 6px 0', animationDelay: '0.1s' }}>
        <h2 style={{ fontSize: '40px', fontWeight: 950, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-1.5px' }}>
          {t.welcome}
        </h2>
        <p style={{ fontSize: '18px', color: '#86868b', fontWeight: 600, letterSpacing: '-0.3px' }}>
          {t.subWelcome}
        </p>
      </div>

      {/* 🍱 2026 Tactile Depth Bento Box Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '1040px' }}>
        
        {/* Row 1: 2대 메인 히어로 (좌측: 예약 타석 체크인 / 우측: 1순위 연습타석 배정) */}
        {(onCheckin || heroMenu) && (
          <div 
            className="animate-fade-up" 
            style={{ 
              animationDelay: '0.2s', 
              display: 'grid', 
              gridTemplateColumns: (onCheckin && heroMenu) ? '1fr 1fr' : '1fr', 
              gap: '20px' 
            }}
          >
            {/* 📌 좌측: 예약 타석 체크인 (더 깊고 묵직한 딥 볼드 포레스트 그린 패널) */}
            {onCheckin && (
              <div
                onClick={onCheckin}
                style={{
                  height: '255px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(145deg, #064e3b 0%, #022c22 100%)',
                  borderRadius: '28px',
                  padding: '28px',
                  border: '1.5px solid rgba(16, 185, 129, 0.4)',
                  boxShadow: '0 16px 36px rgba(2, 44, 34, 0.3), inset 0 1px 1.5px rgba(255, 255, 255, 0.25)',
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
                      fontSize: '12px', 
                      fontWeight: 900, 
                      background: 'rgba(16, 185, 129, 0.25)', 
                      color: '#6ee7b7', 
                      padding: '5px 12px', 
                      borderRadius: '999px',
                      letterSpacing: '0.3px',
                      border: '0.5px solid rgba(16, 185, 129, 0.45)'
                    }}
                  >
                    📌 QUICK CHECK-IN
                  </span>
                  <div style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '50%' }}>
                    <Play size={18} fill="#ffffff" strokeWidth={0} style={{ color: '#ffffff', marginLeft: '2px' }} />
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '28px', fontWeight: 950, color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '-0.8px' }}>
                    {lang === 'KO' ? '예약 타석 체크인' : 'Reservation Check-in'}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#a7f3d0', margin: '0 0 16px 0', lineHeight: 1.4, fontWeight: 500 }}>
                    {lang === 'KO' ? '사전 예약하신 분은 본인 인증 후 체크인을 완료하세요.' : 'Check-in quickly with member verification.'}
                  </p>

                  {/* 퓨어 화이트 필 액션 버튼 */}
                  <div 
                    style={{
                      height: '46px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#022c22',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontWeight: 950,
                      fontSize: '15px',
                      boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
                      letterSpacing: '-0.3px'
                    }}
                  >
                    <span>{lang === 'KO' ? '체크인 시작하기' : 'Start Check-in'}</span>
                    <span style={{ fontSize: '16px' }}>→</span>
                  </div>
                </div>
              </div>
            )}

            {/* 🎯 우측: 1순위 메인! 연습타석 배정 (압도적인 애플 스페이스 블랙 럭셔리 패널) */}
            {heroMenu && (
              <div
                onClick={() => handleCardClick(heroMenu.menu_id, heroMenu.zone_ids || [])}
                style={{
                  height: '255px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(145deg, #1f1f21 0%, #161617 100%)',
                  borderRadius: '28px',
                  padding: '28px',
                  border: '1.5px solid rgba(255, 255, 255, 0.16)',
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
                      fontSize: '12px', 
                      fontWeight: 950, 
                      background: 'rgba(255, 255, 255, 0.15)', 
                      color: '#ffffff', 
                      padding: '5px 12px', 
                      borderRadius: '999px', 
                      letterSpacing: '0.3px', 
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    ⚡ {lang === 'KO' ? '빠른 타석 배정' : 'FAST ASSIGN'}
                  </span>
                  <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.12)', borderRadius: '50%' }}>
                    <Target size={22} strokeWidth={2.6} style={{ color: '#ffffff' }} />
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '30px', fontWeight: 950, color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '-0.8px' }}>
                    {heroMenu.menu_name || t.practiceTeebox}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#a1a1a6', margin: '0 0 16px 0', lineHeight: 1.4, fontWeight: 500 }}>
                    {heroMenu.description || t.practiceTeeboxSub}
                  </p>

                  {/* 🌟 1순위 퓨어 화이트 필 액션 버튼 */}
                  <div 
                    style={{
                      height: '46px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#000000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontWeight: 950,
                      fontSize: '16px',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                      letterSpacing: '-0.3px'
                    }}
                  >
                    <span>{lang === 'KO' ? '타석 배정하기' : 'Allocate Teebox'}</span>
                    <span style={{ fontSize: '18px', fontWeight: 950 }}>→</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 2: 2x2 서브 카드 (2.5D 강화유리 림라이트 + 3D 스쿼클 아이콘 + 마이크로 버튼) */}
        {gridSubMenus.length > 0 && (
          <div 
            className="animate-fade-up" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
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
                    height: '215px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '24px 26px',
                    background: isPar3 
                      ? 'linear-gradient(145deg, #059669 0%, #047857 50%, #064e3b 100%)' 
                      : '#ffffff',
                    borderRadius: '24px',
                    border: isPar3 
                      ? '1.5px solid rgba(52, 211, 153, 0.4)' 
                      : '1px solid rgba(0, 0, 0, 0.06)',
                    boxShadow: isPar3 
                      ? '0 14px 32px rgba(6, 78, 59, 0.22), inset 0 1px 1.5px rgba(255, 255, 255, 0.3)' 
                      : '0 6px 20px rgba(0, 0, 0, 0.025), inset 0 1px 1.5px rgba(255, 255, 255, 0.9), 0 1px 3px rgba(0, 0, 0, 0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                  }}
                  className="apple-card-hover"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 3D 스쿼클 아이콘 타일 */}
                    <div 
                      style={{ 
                        width: '46px', 
                        height: '46px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        background: isPar3 ? 'rgba(255, 255, 255, 0.18)' : theme.iconBg, 
                        borderRadius: '14px',
                        border: isPar3 ? '1px solid rgba(255, 255, 255, 0.3)' : theme.border,
                        boxShadow: isPar3 
                          ? '0 3px 8px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.4)' 
                          : '0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.6)'
                      }}
                    >
                      <IconComp size={22} strokeWidth={2.4} style={{ color: '#ffffff' }} />
                    </div>

                    {isPar3 ? (
                      <span 
                        style={{ 
                          fontSize: '12px', 
                          fontWeight: 900, 
                          color: '#ffffff', 
                          background: 'rgba(255, 255, 255, 0.2)', 
                          padding: '5px 12px', 
                          borderRadius: '999px', 
                          letterSpacing: '0.3px',
                          border: '0.5px solid rgba(255, 255, 255, 0.35)' 
                        }}
                      >
                        ⛳ BEST 야외 코스
                      </span>
                    ) : (
                      theme.badgeText && (
                        <span 
                          style={{ 
                            fontSize: '12px', 
                            fontWeight: 800, 
                            color: '#059669', 
                            background: 'rgba(5, 150, 105, 0.08)', 
                            padding: '4px 10px', 
                            borderRadius: '999px', 
                            border: '1px solid rgba(5, 150, 105, 0.15)' 
                          }}
                        >
                          {theme.badgeText}
                        </span>
                      )
                    )}
                  </div>

                  <div>
                    <h3 style={{ fontSize: '24px', fontWeight: 950, color: isPar3 ? '#ffffff' : '#1d1d1f', marginBottom: '4px', letterSpacing: '-0.5px' }}>
                      {menu.menu_name}
                    </h3>
                    <p style={{ fontSize: '13px', color: isPar3 ? '#a7f3d0' : '#86868b', fontWeight: isPar3 ? 500 : 600, lineHeight: 1.4, margin: '0 0 12px 0' }}>
                      {menu.description}
                    </p>

                    {/* 액션 버튼 */}
                    {isPar3 ? (
                      /* 🌟 파3 전용 대형 퓨어 화이트 필 액션 버튼 */
                      <div 
                        style={{ 
                          height: '42px',
                          borderRadius: '999px',
                          background: '#ffffff',
                          color: '#064e3b', 
                          display: 'flex',
                          alignItems: 'center', 
                          justifyContent: 'center',
                          gap: '6px', 
                          fontWeight: 950, 
                          fontSize: '14px',
                          boxShadow: '0 3px 10px rgba(0, 0, 0, 0.18)',
                          letterSpacing: '-0.3px'
                        }}
                      >
                        <span>{lang === 'KO' ? '파3 배정하기' : 'Book Par 3'}</span>
                        <span style={{ fontSize: '16px', fontWeight: 950 }}>→</span>
                      </div>
                    ) : (
                      /* 일반 서브 슬릭 마이크로 알약 버튼 */
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div 
                          style={{ 
                            display: 'inline-flex',
                            alignItems: 'center', 
                            gap: '4px', 
                            background: '#f5f5f7',
                            color: '#1d1d1f', 
                            padding: '5px 12px',
                            borderRadius: '999px',
                            fontWeight: 800, 
                            fontSize: '13px',
                            border: '1px solid rgba(0, 0, 0, 0.04)',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                          }}
                        >
                          <span>{lang === 'KO' ? '바로가기' : 'Explore'}</span>
                          <span style={{ fontSize: '14px', marginLeft: '2px' }}>›</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Row 3: 하단 독립형 플로팅 신규 회원가입 배너 */}
        <div 
          className="animate-fade-up apple-card-hover"
          onClick={() => signupMenu ? handleCardClick(signupMenu.menu_id, signupMenu.zone_ids || []) : onSignUp()}
          style={{ 
            animationDelay: '0.4s',
            height: '96px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            background: 'linear-gradient(145deg, #ffffff 0%, #fbfbfc 100%)',
            borderRadius: '26px',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.035), inset 0 1px 1.5px rgba(255, 255, 255, 0.9), 0 1px 3px rgba(0, 0, 0, 0.04)',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div 
              style={{ 
                width: '52px', 
                height: '52px', 
                borderRadius: '16px', 
                background: 'linear-gradient(145deg, #f5f5f7 0%, #e5e5ea 100%)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.8)'
              }}
            >
              <UserPlus size={26} strokeWidth={2.4} style={{ color: '#1d1d1f' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '20px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                  {lang === 'KO' ? '신규 회원이신가요?' : 'New Member?'}
                </span>
                <span 
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: 900, 
                    color: '#0071e3', 
                    background: 'rgba(0, 113, 227, 0.08)', 
                    padding: '3px 8px', 
                    borderRadius: '999px',
                    border: '1px solid rgba(0, 113, 227, 0.15)'
                  }}
                >
                  {lang === 'KO' ? '⚡ 3초 간편등록' : 'Quick Join'}
                </span>
              </div>
              <p style={{ fontSize: '14px', color: '#86868b', fontWeight: 600, margin: 0 }}>
                {lang === 'KO' ? '휴대폰 번호로 3초 만에 간편 등록 후 즉시 타석을 배정받으세요.' : 'Register in 3 seconds to assign your teebox.'}
              </p>
            </div>
          </div>

          <div 
            style={{ 
              height: '48px',
              padding: '0 22px',
              borderRadius: '999px',
              background: '#f5f5f7',
              color: '#1d1d1f',
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontWeight: 900, 
              fontSize: '15px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
            }}
          >
            <span>{lang === 'KO' ? '회원가입 시작하기' : 'Sign Up'}</span>
            <span style={{ fontSize: '16px', fontWeight: 900 }}>↗</span>
          </div>
        </div>

      </div>
    </div>
  );
}
