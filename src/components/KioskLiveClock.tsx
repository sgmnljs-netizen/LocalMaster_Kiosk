import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { TimeMaster } from '../utils/timeMaster';

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface FormattedKioskClock {
  dateLabel: string;
  timeLabel: string;
  hours: string;
  minutes: string;
}

/**
 * TimeMaster 서버 동기화 시각 기준 24시간제(HH:mm) 및 날짜/요일 포맷터
 */
export function formatKioskLiveClock(
  date: Date = TimeMaster.getSyncedDate(),
  lang: 'KO' | 'EN' = 'KO'
): FormattedKioskClock {
  const { month, day, weekday: weekdayIdx, hours, minutes } = TimeMaster.getKstParts(date);
  const weekday =
    lang === 'KO' ? KO_WEEKDAYS[weekdayIdx] : EN_WEEKDAYS[weekdayIdx];

  return {
    dateLabel: `${month}.${day} (${weekday})`,
    timeLabel: `${hours}:${minutes}`,
    hours,
    minutes,
  };
}

interface KioskLiveClockProps {
  lang?: 'KO' | 'EN';
  variant?: 'header' | 'dark' | 'compact';
}

export const KioskLiveClock: React.FC<KioskLiveClockProps> = ({
  lang = 'KO',
  variant = 'header',
}) => {
  const [now, setNow] = useState<Date>(() => TimeMaster.getSyncedDate());

  useEffect(() => {
    const tick = () => setNow(TimeMaster.getSyncedDate());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { dateLabel, hours, minutes } = formatKioskLiveClock(now, lang);

  if (variant === 'dark') {
    return (
      <div
        data-testid="kiosk-live-clock-dark"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 22px',
          borderRadius: '999px',
          background: 'rgba(10, 12, 16, 0.68)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <Clock size={19} color="#10b981" strokeWidth={2.4} />
        <span
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.78)',
            letterSpacing: '-0.2px',
          }}
        >
          {dateLabel}
        </span>
        <span
          style={{
            width: '1px',
            height: '15px',
            background: 'rgba(255, 255, 255, 0.22)',
          }}
        />
        <span
          style={{
            fontSize: '24px',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.4px',
            lineHeight: 1,
          }}
        >
          {hours}:{minutes}
        </span>
      </div>
    );
  }

  const isCompact = variant === 'compact';

  return (
    <div
      data-testid="kiosk-live-clock"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: isCompact ? '44px' : '50px',
        padding: isCompact ? '0 16px' : '0 18px',
        gap: '9px',
        borderRadius: '999px',
        background: '#f8fafc',
        border: '1.5px solid #cbd5e1',
        boxSizing: 'border-box',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <Clock size={isCompact ? 17 : 18} color="#059669" strokeWidth={2.4} />
      <span
        style={{
          fontSize: isCompact ? '15px' : '16px',
          fontWeight: 800,
          color: '#475569',
          letterSpacing: '-0.2px',
        }}
      >
        {dateLabel}
      </span>
      <span
        style={{
          width: '1.5px',
          height: '15px',
          background: '#cbd5e1',
        }}
      />
      <span
        style={{
          fontSize: isCompact ? '21px' : '24px',
          fontWeight: 900,
          color: '#0f172a',
          letterSpacing: '-0.5px',
          lineHeight: 1,
        }}
      >
        {hours}:{minutes}
      </span>
    </div>
  );
};
