import React, { useEffect, useState } from 'react';
import { ChevronRight, Hand, Play, ShieldAlert, Sparkles, Tv } from 'lucide-react';
import { api } from '../services/api';

interface IntroScreenProps {
  onStart: () => void;
  storeName: string;
}

const ADS = [
  {
    type: 'image',
    url: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1080&q=80',
    title: 'PREMIUM GOLF CLUB',
    subtitle: '국내 최고 수준의 프리미엄 프라이빗 GDR 골프 연습장'
  },
  {
    type: 'image',
    url: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=1080&q=80',
    title: 'Professional 1:1 Lessons',
    subtitle: 'KPGA/KLPGA 투어 출신 강사진의 고품격 분석 레슨'
  },
  {
    type: 'image',
    url: 'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?auto=format&fit=crop&w=1080&q=80',
    title: 'Smart Unattended Operation',
    subtitle: '24시간 모바일 앱 및 키오스크 연동 무인 자동화 타석 배정'
  }
];

export const IntroScreen: React.FC<IntroScreenProps> = ({ onStart, storeName }) => {
  const [currentAdIdx, setCurrentAdIdx] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // 5초 간격으로 상단 FHD 광고 이미지 슬라이드 롤링
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAdIdx((prev) => (prev + 1) % ADS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // 백엔드 통신 상태 실시간 모니터링
  useEffect(() => {
    const checkNet = async () => {
      const conn = await api.checkConnection();
      setIsOnline(conn);
    };
    checkNet();
    const netTimer = setInterval(checkNet, 10000);
    return () => clearInterval(netTimer);
  }, []);

  return (
    <div className="kiosk-container" style={{ position: 'relative' }} onClick={onStart}>
      {/* 1. 상단 FHD 광고 영역 (16:9) */}
      <div className="kiosk-ad-area">
        {ADS.map((ad, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: idx === currentAdIdx ? 1 : 0,
              transition: 'opacity 1.2s ease-in-out',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              background: `linear-gradient(to top, rgba(10, 12, 16, 0.95) 10%, rgba(10,12,16,0.3) 50%, rgba(0,0,0,0) 100%), url(${ad.url}) center/cover no-repeat`
            }}
          >
            <div style={{ padding: '30px 40px', paddingBottom: '50px', width: '100%' }}>
              <div 
                style={{ 
                  background: 'rgba(10, 12, 16, 0.7)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  padding: '24px 30px',
                  width: 'fit-content',
                  maxWidth: '85%',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)'
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    background: 'rgba(16, 185, 129, 0.08)', 
                    border: '0.5px solid var(--neon-indigo)',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    width: 'fit-content',
                    marginBottom: '16px',
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <Tv size={16} style={{ color: 'var(--neon-indigo)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '2px', color: 'var(--text-secondary)' }}>PROMOTION</span>
                </div>
                <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '10px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  {ad.title}
                </h2>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {ad.subtitle}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. 하단 본격 키오스크 터치 유도 영역 */}
      {/* 2. 하단 터치 유도 영역 (Apple-inspired Vibrant Luxury Web) */}
      <div 
        className="kiosk-terminal-area-luxury animate-fluid-gradient" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center',
          alignItems: 'center',
          padding: '120px 60px 80px 60px',
          background: 'linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(10,12,16,1) 100%)'
        }}
      >
        
        {/* 거대한 상호명 타이포그래피 (High Contrast) */}
        <div style={{ textAlign: 'center', width: '100%', marginBottom: '60px' }}>
          <h1 style={{ fontSize: '72px', letterSpacing: '-3px', color: '#fff', display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 900 }}>{storeName.split(' ')[0] || 'SGM'}</span>
            <span style={{ fontWeight: 200, color: 'rgba(255, 255, 255, 0.75)' }}>
              {storeName.split(' ').slice(1).join(' ') || 'Golf Academy'}
            </span>
          </h1>
          <p style={{ fontSize: '24px', color: '#86868b', fontWeight: 600, letterSpacing: '-0.5px', marginTop: '16px' }}>
            The Next Generation of Golf Club.
          </p>
        </div>

        {/* 메인 액션 탭 (거대한 텍스트와 애니메이션 손가락 그래픽) */}
        <div 
          onClick={onStart}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '50px 40px',
            borderRadius: '40px',
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            transition: 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
            position: 'relative',
            width: '100%',
            maxWidth: '780px',
            marginBottom: '40px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            {/* 3D 느낌 맥박 손가락 그래픽 */}
            <Hand 
              size={120} 
              color="#10b981" 
              strokeWidth={1.5} 
              className="animate-hand-tap"
              style={{
                filter: 'drop-shadow(0 10px 20px rgba(16, 185, 129, 0.4))'
              }}
            />
          </div>
          
          <h2 
            className="animate-glow-text"
            style={{ 
              fontSize: '48px', 
              fontWeight: 900, 
              letterSpacing: '-1.5px', 
              margin: 0,
              whiteSpace: 'nowrap'
            }}
          >
            화면을 터치하여 시작하세요
          </h2>
          <p style={{ color: 'var(--neon-indigo)', fontSize: '20px', fontWeight: 700, marginTop: '12px', letterSpacing: '-0.5px', opacity: 0.85 }}>
            Touch the screen to start
          </p>
        </div>

        {/* 하단 시스템 스태터스 바 (애플의 차분한 풋터 마감) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: '0.5px solid rgba(255, 255, 255, 0.08)', paddingTop: '24px', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div 
              style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: isOnline ? '#34c759' : '#ff3b30',
                transition: 'all 0.2s ease',
                boxShadow: `0 0 8px ${isOnline ? 'rgba(52, 199, 89, 0.5)' : 'rgba(255, 59, 48, 0.5)'}`
              }} 
            />
            <span style={{ fontSize: '15px', color: '#86868b', fontWeight: 600 }}>
              {isOnline ? 'Cloud Sync Online' : 'Hybrid Edge DB Mode (무중단 가동)'}
            </span>
          </div>
          {!isOnline && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff3b30' }}>
              <ShieldAlert size={15} />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>오프라인 모드 작동 중</span>
            </div>
          )}
          <span style={{ fontSize: '15px', color: '#86868b' }}>ID: {api.getTerminalId()}</span>
        </div>
      </div>
    </div>
  );
};
