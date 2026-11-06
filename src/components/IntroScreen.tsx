import React, { useEffect, useState } from 'react';
import { ChevronRight, Hand, Play, ShieldAlert, Sparkles, Tv } from 'lucide-react';
import { api, type Bay } from '../services/api';
import { isBayTrulyAvailableForKiosk } from '../utils/bayStatusGuard';
import { KioskLiveClock } from './KioskLiveClock';

interface IntroScreenProps {
  onStart: () => void;
  storeName: string;
  bays?: Bay[];
  photoUrl?: string;
  logoUrl?: string;
}

export interface KioskIntroSlide {
  type: 'image';
  url: string;
  title: string;
  subtitle?: string | null;
  tag?: string;
}

function buildOfflineGolfSlideDataUri(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 608" width="1080" height="608"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${primaryHex}"/><stop offset="55%" stop-color="${secondaryHex}"/><stop offset="100%" stop-color="#04120e"/></linearGradient><radialGradient id="glow" cx="78%" cy="24%" r="52%"><stop offset="0%" stop-color="${accentHex}" stop-opacity="0.32"/><stop offset="100%" stop-color="${accentHex}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="608" fill="url(#bg)"/><rect width="1080" height="608" fill="url(#glow)"/><path d="M-40 470 Q 320 350 680 430 T 1120 390 L 1120 608 L -40 608 Z" fill="#07261d" opacity="0.72"/><path d="M-40 520 Q 420 430 780 495 T 1120 470 L 1120 608 L -40 608 Z" fill="#041913" opacity="0.88"/><circle cx="840" cy="170" r="110" fill="none" stroke="${accentHex}" stroke-opacity="0.16" stroke-width="1.5"/><circle cx="840" cy="170" r="165" fill="none" stroke="${accentHex}" stroke-opacity="0.09" stroke-width="1"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEFAULT_ADS: KioskIntroSlide[] = [
  {
    type: 'image',
    url: buildOfflineGolfSlideDataUri('#06281e', '#0b3b2d', '#10b981'),
    title: 'PREMIUM GOLF CLUB',
    subtitle: '국내 최고 수준의 프리미엄 프라이빗 GDR 골프 연습장',
    tag: 'PROMOTION',
  },
  {
    type: 'image',
    url: buildOfflineGolfSlideDataUri('#0b2239', '#0a332b', '#34d399'),
    title: 'Professional 1:1 Lessons',
    subtitle: 'KPGA/KLPGA 투어 출신 강사진의 고품격 분석 레슨',
    tag: 'PROMOTION',
  },
  {
    type: 'image',
    url: buildOfflineGolfSlideDataUri('#111827', '#063226', '#fbbf24'),
    title: 'Smart Unattended Operation',
    subtitle: '24시간 모바일 앱 및 키오스크 연동 무인 자동화 타석 배정',
    tag: 'PROMOTION',
  }
];

export function resolveIntroBannerImageUrl(rawUrl: string, baseUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  const serverOrigin = (baseUrl || '').replace(/\/api\/?$/, '');
  if (trimmed.startsWith('/')) {
    return `${serverOrigin}${trimmed}`;
  }
  return `${serverOrigin}/${trimmed}`;
}

export function resolveIntroSlides(
  hqBanners: KioskIntroSlide[],
  photoUrl?: string,
  storeName?: string
): KioskIntroSlide[] {
  if (Array.isArray(hqBanners) && hqBanners.length > 0) {
    return hqBanners;
  }
  if (photoUrl && photoUrl.trim().length > 0) {
    return [
      {
        type: 'image',
        url: photoUrl,
        title: storeName || 'PREMIUM GOLF CLUB',
        subtitle: '국내 최고 수준의 프리미엄 골프 아카데미',
        tag: 'PROMOTION',
      },
      ...DEFAULT_ADS.slice(1)
    ];
  }
  return DEFAULT_ADS;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({
  onStart,
  storeName,
  bays = [],
  photoUrl,
  logoUrl
}) => {
  const [currentAdIdx, setCurrentAdIdx] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [hqBanners, setHqBanners] = useState<KioskIntroSlide[]>(() => {
    try {
      const storeCd = api.getStoreCd();
      const cached = localStorage.getItem(`LM_KIOSK_INTRO_BANNERS_${storeCd}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore localStorage parse error
    }
    return [];
  });

  // 본사(HQ) 파트너센터에서 설정한 키오스크 대기화면 배너(KIOSK_INTRO) 동기화
  useEffect(() => {
    let mounted = true;
    const fetchHqIntroBanners = async () => {
      try {
        const storeCd = api.getStoreCd();
        const baseUrl = api.getBaseUrl();
        const res = await fetch(
          `${baseUrl}/v1/kiosk/intro-banners?store_cd=${encodeURIComponent(storeCd)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || !mounted) return;
        const mapped: KioskIntroSlide[] = (data as Array<Record<string, unknown>>)
          .filter((item) => Boolean(item && item.image_url))
          .map((item) => ({
            type: 'image' as const,
            url: resolveIntroBannerImageUrl(String(item.image_url), baseUrl),
            title: String(item.title ?? ''),
            subtitle: item.subtitle ? String(item.subtitle) : '',
            tag: String(item.tag || 'PROMOTION'),
          }));
        setHqBanners(mapped);
        localStorage.setItem(
          `LM_KIOSK_INTRO_BANNERS_${storeCd}`,
          JSON.stringify(mapped)
        );
      } catch {
        // 오프라인 시 localStorage 캐시 유지
      }
    };
    fetchHqIntroBanners();
    const bannerTimer = setInterval(fetchHqIntroBanners, 60000);
    window.addEventListener('kiosk-settings-changed', fetchHqIntroBanners);
    return () => {
      mounted = false;
      clearInterval(bannerTimer);
      window.removeEventListener('kiosk-settings-changed', fetchHqIntroBanners);
    };
  }, []);

  const slides = React.useMemo(
    () => resolveIntroSlides(hqBanners, photoUrl, storeName),
    [hqBanners, photoUrl, storeName]
  );

  useEffect(() => {
    if (currentAdIdx >= slides.length) {
      setCurrentAdIdx(0);
    }
  }, [slides.length, currentAdIdx]);

  // 5초 간격으로 상단 FHD 광고 이미지 슬라이드 롤링
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAdIdx((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

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
      {/* 우측 상단 24시간제 실시간 시계 캡슐 */}
      <div
        style={{
          position: 'absolute',
          top: '26px',
          right: '32px',
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
        <KioskLiveClock lang="KO" variant="dark" />
      </div>

      {/* 1. 상단 FHD 광고 영역 (16:9) */}
      <div className="kiosk-ad-area">
        {slides.map((ad, idx) => {
          const hideTextOverlay =
            !ad.title ||
            ad.title.trim() === '' ||
            ad.title.trim() === '-' ||
            ad.title.trim().toUpperCase() === 'NONE';
          return (
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
                backgroundColor: '#071914',
                backgroundImage: hideTextOverlay
                  ? `url("${ad.url}")`
                  : `linear-gradient(to top, rgba(10, 12, 16, 0.95) 10%, rgba(10,12,16,0.3) 50%, rgba(0,0,0,0) 100%), url("${ad.url}")`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {!hideTextOverlay && (
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
                      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
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
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <Tv size={16} style={{ color: 'var(--neon-indigo)' }} />
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 900,
                          letterSpacing: '2px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {ad.tag || 'PROMOTION'}
                      </span>
                    </div>
                    <h2
                      style={{
                        fontSize: '36px',
                        fontWeight: 800,
                        color: '#fff',
                        marginBottom: ad.subtitle ? '10px' : '0px',
                        textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                      }}
                    >
                      {ad.title}
                    </h2>
                    {ad.subtitle && (
                      <p
                        style={{
                          fontSize: '18px',
                          color: 'var(--text-secondary)',
                          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        }}
                      >
                        {ad.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 하단 본격 키오스크 터치 유도 영역 */}
      <div 
        className="kiosk-terminal-area-luxury animate-fluid-gradient" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 60px 60px 60px',
          background: 'linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(10,12,16,1) 100%)'
        }}
      >
        
        {/* 🟢 [실시간 층별 타석 현황 럭셔리 요약 위젯] GOLF CLUB 로고 직상단 배치 */}
        {(() => {
          const practiceBays = (bays || []).filter(b => {
            const zCode = b.zone_code || b.zoneCode || '';
            return zCode !== 'PAR3' && zCode !== 'ROOM';
          });
          if (practiceBays.length === 0) return null;

          const isBayAvailable = (b: Bay) => isBayTrulyAvailableForKiosk(b);

          const floorMap: { [key: string]: { total: number; avail: number } } = {};
          practiceBays.forEach(b => {
            const fKey = b.floor ? String(b.floor) : (b.floor_no ? `${b.floor_no}F` : '1F');
            if (!floorMap[fKey]) floorMap[fKey] = { total: 0, avail: 0 };
            floorMap[fKey].total += 1;
            if (isBayAvailable(b)) floorMap[fKey].avail += 1;
          });

          const sortedFloorKeys = Object.keys(floorMap).sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
            return numA - numB;
          });

          const totalAvail = practiceBays.filter(isBayAvailable).length;

          return (
            <div 
              style={{
                marginBottom: '40px',
                padding: '20px 44px',
                borderRadius: '32px',
                background: 'rgba(255, 255, 255, 0.07)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1.5px solid rgba(16, 185, 129, 0.45)',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '24px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span 
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 12px #10b981'
                  }}
                  className="animate-pulse-ring"
                />
                <span style={{ fontSize: '22px', fontWeight: 900, color: '#10b981', letterSpacing: '-0.5px' }}>
                  LIVE 타석 현황
                </span>
              </div>

              <div style={{ width: '1.5px', height: '24px', background: 'rgba(255, 255, 255, 0.2)' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {sortedFloorKeys.map(fKey => (
                  <div key={fKey} style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.65)' }}>
                      {fKey}
                    </span>
                    <span style={{ fontSize: '30px', fontWeight: 950, color: '#ffffff', letterSpacing: '-0.5px' }}>
                      {floorMap[fKey].avail}
                    </span>
                    <span style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.4)', fontWeight: 700 }}>
                      /{floorMap[fKey].total}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ width: '1.5px', height: '24px', background: 'rgba(255, 255, 255, 0.2)' }} />

              <div style={{ fontSize: '20px', fontWeight: 800, color: '#a7f3d0' }}>
                총 <strong style={{ fontSize: '32px', color: '#10b981', fontWeight: 950 }}>{totalAvail}</strong>석 가능
              </div>
            </div>
          );
        })()}

        {/* 거대한 상호명 타이포그래피 (High Contrast) */}
        <div style={{ textAlign: 'center', width: '100%', marginBottom: '60px' }}>
          {logoUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <img
                src={logoUrl}
                alt={storeName}
                style={{
                  maxHeight: '80px',
                  maxWidth: '260px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
                  borderRadius: '12px'
                }}
              />
            </div>
          )}
          <h1 style={{ fontSize: '64px', letterSpacing: '-2px', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#ffffff', letterSpacing: '-1.5px', textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
              {storeName.replace(/^골포스\s*/, '').replace(/^로컬마스터\s*/, '').trim() || '골프 아카데미'}
            </span>
          </h1>
          <p style={{ fontSize: '24px', color: '#86868b', fontWeight: 600, letterSpacing: '-0.5px', marginTop: '14px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderTop: '0.5px solid rgba(255, 255, 255, 0.08)', paddingTop: '24px', zIndex: 2 }}>
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
            {!isOnline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff3b30', marginLeft: '12px' }}>
                <ShieldAlert size={15} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>오프라인 모드 작동 중</span>
              </div>
            )}
          </div>

          {/* 우측 GOLFOS SYSTEM & 공식 홈페이지 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                padding: '10px 22px', 
                borderRadius: '28px', 
                background: 'rgba(16, 185, 129, 0.08)', 
                border: '1px solid rgba(16, 185, 129, 0.3)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
              }}
            >
              <span style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '0.8px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                GOLFOS SYSTEM
              </span>
              <span style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.25)', fontWeight: 300 }}>|</span>
              <span style={{ fontSize: '20px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 700, letterSpacing: '0.4px' }}>
                www.golfos.co.kr
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>ID: {api.getTerminalId()}</span>
              <span style={{ fontSize: '11px', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}>
                {__APP_VERSION__}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
