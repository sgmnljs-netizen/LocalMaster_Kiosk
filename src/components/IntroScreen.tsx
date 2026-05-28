import React, { useEffect, useState } from 'react';
import { Play, ShieldAlert, Sparkles, Tv } from 'lucide-react';
import { api } from '../services/api';

interface IntroScreenProps {
  onStart: () => void;
}

const ADS = [
  {
    type: 'image',
    url: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1080&q=80',
    title: 'LocalMaster Premium Golf Club',
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

export const IntroScreen: React.FC<IntroScreenProps> = ({ onStart }) => {
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
            <div style={{ padding: '40px', paddingBottom: '60px' }}>
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: 'rgba(99, 102, 241, 0.25)', 
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  width: 'fit-content',
                  marginBottom: '16px',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <Tv size={16} className="glow-text-indigo" />
                <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '2px', color: '#818cf8' }}>PROMOTION</span>
              </div>
              <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '10px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                {ad.title}
              </h2>
              <p style={{ fontSize: '18px', color: 'var(--text-secondary)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {ad.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 2. 하단 본격 키오스크 터치 유도 영역 */}
      <div 
        className="kiosk-terminal-area" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '80px 40px'
        }}
      >
        {/* 매장 로고 및 상단 웰컴 메시지 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
            <span style={{ fontSize: '48px' }}>⛳</span>
            <h1 style={{ fontSize: '46px', fontWeight: 900, letterSpacing: '-1px', color: '#fff' }}>
              Local<span style={{ color: 'var(--neon-indigo)', textShadow: '0 0 15px var(--neon-indigo-glow)' }}>Master</span>
            </h1>
          </div>
          <p style={{ fontSize: '24px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            무인 운영 골프 스튜디오에 오신 것을 환영합니다.
          </p>
        </div>

        {/* 터치 스크린 시작 버튼 (화려한 펄스 네온 글로우) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
          <div 
            className="glass-panel glass-panel-glow animate-pulse-glow"
            style={{
              width: '420px',
              height: '420px',
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              border: '2px solid rgba(99, 102, 241, 0.4)',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, rgba(10, 12, 16, 0.8) 100%)',
              gap: '16px'
            }}
          >
            <div 
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'var(--neon-indigo)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 30px var(--neon-indigo-glow)'
              }}
            >
              <Play size={48} fill="#fff" style={{ marginLeft: '6px' }} />
            </div>
            <span style={{ fontSize: '32px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
              화면 터치 시작
            </span>
            <span className="animate-blink" style={{ fontSize: '18px', color: 'var(--neon-indigo)', fontWeight: 700 }}>
              TOUCH TO START
            </span>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
            <div className="glass-panel" style={{ padding: '16px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} style={{ color: 'var(--neon-amber)' }} />
              <span style={{ fontSize: '16px', fontWeight: 600 }}>타석 자동 배정</span>
            </div>
            <div className="glass-panel" style={{ padding: '16px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} style={{ color: 'var(--neon-green)' }} />
              <span style={{ fontSize: '16px', fontWeight: 600 }}>회원권/라카 신속 결제</span>
            </div>
          </div>
        </div>

        {/* 하단 시스템 스태터스 바 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: '1px solid var(--bg-tertiary)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div 
              style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                backgroundColor: isOnline ? 'var(--neon-green)' : 'var(--neon-amber)',
                boxShadow: isOnline ? '0 0 10px var(--neon-green-glow)' : '0 0 10px var(--neon-amber-glow)'
              }} 
            />
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isOnline ? 'Cloud Sync Online' : 'Hybrid Edge DB Mode (장애 대비 무중단 가동)'}
            </span>
          </div>
          {!isOnline && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--neon-amber)' }}>
              <ShieldAlert size={16} />
              <span style={{ fontSize: '14px', fontWeight: 700 }}>오프라인 대응 활성화</span>
            </div>
          )}
          <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>ID: {api.getTerminalId()}</span>
        </div>
      </div>
    </div>
  );
};
