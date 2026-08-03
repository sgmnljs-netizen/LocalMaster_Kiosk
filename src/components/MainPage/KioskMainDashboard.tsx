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

  // 연습타석(ALLOCATE_DAILY) 메뉴 추출 (히어로 카드로 최상단 배치)
  const heroMenu = activeMenus.find((m: any) => m.menu_id === 'ALLOCATE_DAILY');
  const subMenus = activeMenus.filter((m: any) => m.menu_id !== 'ALLOCATE_DAILY');

  return (
    <div 
      style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        gap: '48px',
        justifyContent: 'center',
        height: '100%',
        maxHeight: '1080px',
        padding: '20px 20px'
      }}
    >
      {/* 🔴 상단: 전체 타석 실시간 현황 모니터링 영역 - Fade Up 0.1s */}
      <div className="animate-fade-up" style={{ width: '100%', marginBottom: '48px', animationDelay: '0.1s' }}>
        {/* TopTeeboxDashboard Placeholder */}
      </div>

      {/* 헤더 섹션 - Fade Up 0.2s */}
      <div className="animate-fade-up" style={{ textAlign: 'center', marginBottom: '32px', animationDelay: '0.2s' }}>
        <h2 style={{ fontSize: '42px', fontWeight: 900, color: '#1d1d1f', marginBottom: '12px', letterSpacing: '-1px' }}>
          {t.welcome}
        </h2>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>
          {t.subWelcome}
        </p>
      </div>

      {/* 🍱 2026 Premium Bento Box 동적 레이아웃 (Soft UI & Liquid Glass) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '1080px' }}>
        
        {/* Row 1: 히어로 섹션 (예약 체크인 & 연습타석배정 2단 그리드) */}
        {(onCheckin || heroMenu) && (
          <div className="animate-fade-up" style={{ animationDelay: '0.3s', display: 'grid', gridTemplateColumns: (onCheckin && heroMenu) ? '1fr 1fr' : '1fr', gap: '20px' }}>
            
            {/* 📌 예약 타석 체크인 CTA 카드 */}
            {onCheckin && (
              <div
                onClick={onCheckin}
                className="bento-item liquid-glass-layer shimmer-effect breathing-glow"
                style={{
                  height: '240px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
                  borderRadius: '24px',
                  padding: '24px',
                  border: '2px solid #10b981',
                  boxShadow: '0 20px 40px rgba(6, 78, 59, 0.4)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                  <span style={{ fontSize: '14px', fontWeight: 900, background: '#10b981', color: '#ffffff', padding: '6px 14px', borderRadius: '16px' }}>
                    📌 QUICK CHECK-IN
                  </span>
                  <Play size={28} fill="currentColor" strokeWidth={0} style={{ color: '#10b981' }} />
                </div>
                <div style={{ zIndex: 10 }}>
                  <h3 style={{ fontSize: '30px', fontWeight: 900, color: '#ffffff', margin: '0 0 8px 0' }}>
                    {lang === 'KO' ? '예약 타석 체크인' : 'Reservation Check-in'}
                  </h3>
                  <p style={{ fontSize: '15px', color: '#a7f3d0', margin: 0, lineHeight: 1.4 }}>
                    {lang === 'KO' ? '사전 예약하신 분은 본인 인증 후 체크인을 완료하세요.' : 'Check-in quickly with member verification.'}
                  </p>
                </div>
              </div>
            )}

            {/* 연습타석배정 히어로 카드 */}
            {heroMenu && (
              <div
                onClick={() => handleCardClick(heroMenu.menu_id, heroMenu.zone_ids || [])}
                className="bento-item liquid-glass-layer shimmer-effect breathing-glow"
                style={{
                  width: '100%',
                  height: onCheckin ? '240px' : '280px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #031510 0%, #064e3b 50%, #022c22 100%)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255,255,255,0.08)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 10 }}>
                  <div style={{ width: '72px', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '50%', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                    <Play size={40} fill="currentColor" strokeWidth={0} style={{ color: '#ffffff', marginLeft: '6px' }} />
                  </div>
                  <span className="animate-pulse-ring" style={{ fontSize: '15px', fontWeight: 900, background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: '20px', letterSpacing: '1px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    {t.recommend}
                  </span>
                </div>
                <div style={{ position: 'relative', zIndex: 10 }}>
                  <h3 style={{ fontSize: '42px', fontWeight: 900, color: '#fff', marginBottom: '12px', letterSpacing: '-1px' }}>
                    {heroMenu.menu_name || t.practiceTeebox}
                  </h3>
                  <p style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, lineHeight: 1.5, maxWidth: '80%' }}>
                    {heroMenu.description || t.practiceTeeboxSub}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Row 2+: 나머지 서브 메뉴 항목 100% 동적 그리드 순회 렌더링 */}
        {subMenus.length > 0 && (
          <div 
            className="animate-fade-up" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: subMenus.length === 1 ? '1fr' : '1fr 1fr', 
              gap: '24px', 
              animationDelay: '0.4s' 
            }}
          >
            {subMenus.map((menu: any, index: number) => {
              const IconComp = ICON_MAP[menu.icon_type] || Target;
              const isPar3 = menu.menu_id === 'PAR3';
              const isLastSingle = subMenus.length % 2 === 1 && index === subMenus.length - 1;

              return (
                <div
                  key={menu.menu_id || index}
                  onClick={() => handleCardClick(menu.menu_id, menu.zone_ids || [])}
                  className="bento-item"
                  style={{
                    height: isLastSingle ? '160px' : '220px',
                    gridColumn: isLastSingle ? '1 / -1' : 'span 1',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: isLastSingle ? 'row' : 'column',
                    alignItems: isLastSingle ? 'center' : 'flex-start',
                    justifyContent: 'space-between',
                    gap: '20px',
                    padding: '28px 32px',
                    background: isPar3 
                      ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.04) 0%, rgba(5, 150, 105, 0.12) 100%)' 
                      : 'rgba(255, 255, 255, 0.9)',
                    border: isPar3 
                      ? '1px solid rgba(5, 150, 105, 0.3)' 
                      : '1px solid rgba(5, 150, 105, 0.12)',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: isLastSingle ? 'row' : 'column', gap: '8px', flex: 1, alignItems: isLastSingle ? 'center' : 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isLastSingle ? '0' : '12px' }}>
                      <div 
                        style={{ 
                          width: '52px', 
                          height: '52px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: isPar3 ? '#059669' : 'rgba(5, 150, 105, 0.08)', 
                          borderRadius: '50%',
                          border: '1px solid rgba(5, 150, 105, 0.1)' 
                        }}
                      >
                        <IconComp size={28} strokeWidth={2.5} style={{ color: isPar3 ? '#ffffff' : '#059669' }} />
                      </div>
                      {isPar3 && (
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669', background: 'rgba(255,255,255,0.9)', padding: '4px 12px', borderRadius: '16px', border: '1px solid rgba(5,150,105,0.2)' }}>
                          인기 코스
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '28px', fontWeight: 900, color: isPar3 ? '#064e3b' : '#1d1d1f', marginBottom: '6px', letterSpacing: '-0.5px' }}>
                        {menu.menu_name}
                      </h3>
                      <p style={{ fontSize: '15px', color: isPar3 ? '#064e3b' : '#636366', fontWeight: 600, lineHeight: 1.4, opacity: isPar3 ? 0.9 : 1 }}>
                        {menu.description}
                      </p>
                    </div>
                  </div>

                  {isLastSingle && (
                    <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 150, 105, 0.06)', borderRadius: '20px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                      <IconComp size={32} strokeWidth={2.5} style={{ color: '#059669' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
