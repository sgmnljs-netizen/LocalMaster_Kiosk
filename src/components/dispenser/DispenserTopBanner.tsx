import React, { useEffect, useState } from 'react';
import { ChevronRight, Clock, Flag, ScanFace, Tablet } from 'lucide-react';
import { api } from '../../services/api';
import { KioskLiveClock } from '../KioskLiveClock';

interface DispenserTopBannerProps {
  lang: 'KO' | 'EN';
  openTime?: string;
  closeTime?: string;
  is24h?: boolean;
}

const PLC_POLL_INTERVAL_MS = 30000;

export const DispenserTopBanner: React.FC<DispenserTopBannerProps> = ({
  lang,
  openTime = '06:00',
  closeTime = '23:00',
  is24h = false,
}) => {
  const [plcOnline, setPlcOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const st = await api.getDispenserPlcStatus();
      if (active) {
        setPlcOnline(st.online);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), PLC_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const hoursLabel = is24h
    ? lang === 'KO'
      ? '24시간 운영'
      : 'Open 24H'
    : `${openTime} ~ ${closeTime}`;

  const steps =
    lang === 'KO'
      ? [
          {
            no: 'STEP 01',
            title: '키오스크 배정',
            sub: '회원권 · 일일권',
            Icon: Tablet,
          },
          {
            no: 'STEP 02',
            title: '볼 배급기',
            sub: '1·2층 안면 인식',
            Icon: ScanFace,
          },
          {
            no: 'STEP 03',
            title: '자유 타석',
            sub: '빈 타석 바로 이용',
            Icon: Flag,
          },
        ]
      : [
          {
            no: 'STEP 01',
            title: 'Kiosk Check-In',
            sub: 'Pass · Daily Ticket',
            Icon: Tablet,
          },
          {
            no: 'STEP 02',
            title: 'Ball Dispenser',
            sub: '1F · 2F Face Scan',
            Icon: ScanFace,
          },
          {
            no: 'STEP 03',
            title: 'Open Bay',
            sub: 'Use Any Open Bay',
            Icon: Flag,
          },
        ];

  const isHealthy = plcOnline !== false;
  const dotColor = plcOnline === null ? '#64748b' : isHealthy ? '#22c55e' : '#f59e0b';
  const statusTextColor = plcOnline === null ? '#94a3b8' : isHealthy ? '#cbd5e1' : '#fcd34d';

  return (
    <section
      aria-label={lang === 'KO' ? '연습장 이용 안내' : 'How To Use'}
      style={{
        width: '100%',
        height: 'auto',
        backgroundColor: '#141920',
        borderRadius: '0 0 36px 36px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.14)',
        display: 'flex',
        flexDirection: 'column',
        padding: '26px 36px 24px 36px',
        boxSizing: 'border-box',
        gap: '22px',
        position: 'relative',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* 1단 헤더: 절제된 안내 타이틀 · 영업시간 · 배급기 상태 · 시계 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          width: '100%',
          paddingBottom: '18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.09)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <h2
            style={{
              fontSize: '25px',
              fontWeight: 800,
              color: '#f8fafc',
              letterSpacing: '-0.6px',
              margin: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'KO' ? '연습장 이용 안내' : 'How To Use'}
          </h2>
          <span
            style={{
              width: '1px',
              height: '18px',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '17px',
              fontWeight: 600,
              color: '#cbd5e1',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            <Clock size={16} strokeWidth={2} style={{ color: '#94a3b8' }} />
            <span>{hoursLabel}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: 700,
              color: statusTextColor,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: dotColor,
                flexShrink: 0,
              }}
            />
            {isHealthy
              ? lang === 'KO'
                ? '1·2층 배급기 정상'
                : '1F · 2F Ready'
              : lang === 'KO'
                ? '배급기 점검 중'
                : 'Dispenser Check'}
          </span>
          <KioskLiveClock lang={lang} variant="dark" />
        </div>
      </div>

      {/* 2단: 비버튼형 3단계 안내 사인 (박스·그림자·컬러 아이콘 배제 -> 오터치 0%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          padding: '8px 4px',
        }}
      >
        {steps.map((step, idx) => {
          const StepIcon = step.Icon;
          return (
            <React.Fragment key={step.no}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '10px',
                  padding: '6px 8px',
                }}
              >
                <span
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.12em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {step.no}
                </span>

                <StepIcon
                  size={40}
                  strokeWidth={1.7}
                  style={{ color: '#e2e8f0', margin: '2px 0 4px 0' }}
                  aria-hidden="true"
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span
                    style={{
                      fontSize: '30px',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.7px',
                      lineHeight: 1.15,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.title}
                  </span>
                  <span
                    style={{
                      fontSize: '18px',
                      fontWeight: 500,
                      color: '#94a3b8',
                      letterSpacing: '-0.2px',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.sub}
                  </span>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingTop: '14px',
                  }}
                >
                  <ChevronRight size={30} strokeWidth={1.6} style={{ color: '#475569' }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 3단: 절제된 하단 한 줄 안내 */}
      <div
        style={{
          width: '100%',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          textAlign: 'center',
          fontSize: '18px',
          fontWeight: 600,
          color: '#cbd5e1',
          letterSpacing: '-0.3px',
          wordBreak: 'keep-all',
        }}
      >
        {lang === 'KO'
          ? '1·2층 어느 배급기에서나 안면인식 즉시 볼이 배출됩니다.'
          : 'Scan your face at either 1F or 2F dispenser to receive balls immediately.'}
      </div>
    </section>
  );
};

export default DispenserTopBanner;
