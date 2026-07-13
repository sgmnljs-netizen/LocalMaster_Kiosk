import React from 'react';
import { 
  ArrowLeftRight, Calendar, Compass, KeyRound, 
  Play, UserPlus, Flag
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

interface KioskMainDashboardProps {
  lang: 'KO' | 'EN';
  onPracticeTeebox: () => void;
  onPar3Allocation: () => void;
  onPurchaseMembership: () => void;
  onMoveBay: () => void;
  onLockerExtend: () => void;
  onSignUp: () => void;
}

export default function KioskMainDashboard({
  lang,
  onPracticeTeebox,
  onPar3Allocation,
  onPurchaseMembership,
  onMoveBay,
  onLockerExtend,
  onSignUp
}: KioskMainDashboardProps) {
  const t = TRANSLATIONS[lang];

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
      {/* 🔴 상단: 전체 타석 실시간 현황 모니터링 (1/3 높이) - Fade Up 0.1s */}
      <div className="animate-fade-up" style={{ width: '100%', marginBottom: '48px', animationDelay: '0.1s' }}>
        {/* Placeholder for TopTeeboxDashboard */}
      </div>

      {/* 헤더 섹션 - Fade Up 0.2s */}
      <div className="animate-fade-up" style={{ textAlign: 'center', marginBottom: '48px', animationDelay: '0.2s' }}>
        <h2 style={{ fontSize: '42px', fontWeight: 900, color: '#1d1d1f', marginBottom: '12px', letterSpacing: '-1px' }}>
          {t.welcome}
        </h2>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>
          {t.subWelcome}
        </p>
      </div>

      {/* 🍱 2026 Premium Bento Box 레이아웃 (Soft UI & Liquid Glass) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Row 1: 메인 히어로 - 연습타석배정 - Fade Up 0.3s */}
        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div
            onClick={onPracticeTeebox}
            className="bento-item liquid-glass-layer shimmer-effect breathing-glow"
            style={{
              width: '100%',
              height: '280px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #031510 0%, #022c22 100%)', /* Midnight Stealth Green */
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255,255,255,0.05)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* 📸 Sharp Background Watermark Decal */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: '40%',
              backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Golfer_swing.jpg/960px-Golfer_swing.jpg")',
              backgroundSize: 'cover',
              backgroundPosition: 'right center',
              opacity: 0.25,
              mixBlendMode: 'luminosity',
              pointerEvents: 'none',
              maskImage: 'linear-gradient(to right, transparent 0%, black 80%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 80%)'
            }} />
            
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
                {t.practiceTeebox}
              </h3>
              <p style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500, lineHeight: 1.5, maxWidth: '80%' }}>
                {t.practiceTeeboxSub}
              </p>
            </div>
          </div>
        </div>

        {/* Row 2: 하프 블록 (파3배정 / 회원권 구매) - Fade Up 0.4s */}
        <div className="animate-fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animationDelay: '0.4s' }}>
          <div
            onClick={onPar3Allocation}
            className="bento-item"
            style={{
              height: '240px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '24px',
              background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.04) 0%, rgba(5, 150, 105, 0.12) 100%)',
              border: '1px solid rgba(5, 150, 105, 0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#059669', borderRadius: '50%', boxShadow: '0 8px 16px rgba(5, 150, 105, 0.2)' }}>
                <Flag size={32} strokeWidth={2.5} style={{ color: '#ffffff' }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669', background: 'rgba(255,255,255,0.8)', padding: '6px 14px', borderRadius: '20px', letterSpacing: '0.5px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                인기 코스
              </span>
            </div>
            <div>
              <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#064e3b', marginBottom: '10px', letterSpacing: '-0.5px' }}>
                {t.par3Course}
              </h3>
              <p style={{ fontSize: '16px', color: '#064e3b', fontWeight: 600, lineHeight: 1.4, opacity: 0.9 }}>
                {t.par3CourseSub}
              </p>
            </div>
          </div>

          <div
            onClick={onPurchaseMembership}
            className="bento-item"
            style={{
              height: '240px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '24px'
            }}
          >
            <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 150, 105, 0.08)', borderRadius: '50%', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
              <Compass size={32} strokeWidth={2.5} style={{ color: '#059669' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', marginBottom: '10px', letterSpacing: '-0.5px' }}>
                {t.purchaseMembership}
              </h3>
              <p style={{ fontSize: '16px', color: '#636366', fontWeight: 600, lineHeight: 1.4 }}>
                {t.purchaseMembershipSub}
              </p>
            </div>
          </div>
        </div>

        {/* Row 3: 하프 블록 (타석이동 / 라카연장) - Fade Up 0.5s */}
        <div className="animate-fade-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animationDelay: '0.5s' }}>
          <div
            onClick={onMoveBay}
            className="bento-item"
            style={{
              height: '200px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '20px'
            }}
          >
            <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 150, 105, 0.06)', borderRadius: '50%', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
              <ArrowLeftRight size={28} strokeWidth={2.5} style={{ color: '#059669' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                {t.moveBay}
              </h3>
              <p style={{ fontSize: '15px', color: '#636366', fontWeight: 600 }}>
                {t.moveBaySub}
              </p>
            </div>
          </div>

          <div
            onClick={onLockerExtend}
            className="bento-item"
            style={{
              height: '200px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '20px'
            }}
          >
            <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 150, 105, 0.06)', borderRadius: '50%', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
              <KeyRound size={28} strokeWidth={2.5} style={{ color: '#059669' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                {t.lockerExtend}
              </h3>
              <p style={{ fontSize: '15px', color: '#636366', fontWeight: 600 }}>
                {t.lockerExtendSub}
              </p>
            </div>
          </div>
        </div>

        {/* Row 4: 와이드 블록 (회원가입) - Frosted Glass 하이라이트 적용 */}
        <div
          onClick={onSignUp}
          className="bento-item"
          style={{
            width: '100%',
            height: '140px',
            padding: '32px 40px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(5, 150, 105, 0.1)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#064e3b', letterSpacing: '-0.5px' }}>
              {t.signUp}
            </h3>
            <p style={{ fontSize: '16px', color: '#047857', fontWeight: 600 }}>
              {t.signUpSub}
            </p>
          </div>
          <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 150, 105, 0.06)', borderRadius: '24px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
            <UserPlus size={32} strokeWidth={2.5} style={{ color: '#059669' }} />
          </div>
        </div>

      </div>
    </div>
  );
}
