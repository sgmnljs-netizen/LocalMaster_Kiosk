import { describe, it, expect } from 'vitest';
import { TimeMaster } from '../timeMaster';
import { formatKioskLiveClock } from '../../components/KioskLiveClock';
import { isBayTrulyAvailableForKiosk } from '../bayStatusGuard';
import type { Bay } from '../../services/api';

describe('Wave 1 [W1-7]: 호스트 타임존 독립 KST(UTC+9) 시각 산출 및 레슨전용 타석 가드 일원화', () => {
  it('UTC Z 타임스탬프가 자정을 걸칠 때(2026-10-31T15:05:00Z = KST 11.01 00:05) 호스트 타임존과 무관하게 정확한 KST 날짜/요일/시각을 산출한다', () => {
    const utcCrossMidnight = new Date('2026-10-31T15:05:00.000Z');
    expect(TimeMaster.getKstYmd(utcCrossMidnight)).toBe('2026-11-01');
    expect(TimeMaster.getKstHhMm(utcCrossMidnight)).toBe('0005');
    expect(TimeMaster.formatKstDateTime(utcCrossMidnight, false)).toBe('2026.11.01 00:05');

    const clockKo = formatKioskLiveClock(utcCrossMidnight, 'KO');
    expect(clockKo).toEqual({
      dateLabel: '11.01 (일)',
      timeLabel: '00:05',
      hours: '00',
      minutes: '05',
    });
  });

  it('TimeMaster.formatEndTime은 UTC Z 문자열, +09:00 오프셋 문자열, 타임존 없는 백엔드 Naive KST 문자열을 모두 동일한 KST HH:mm으로 정규화한다', () => {
    expect(TimeMaster.formatEndTime('2026-11-06T09:45:00.000Z')).toBe('18:45');
    expect(TimeMaster.formatEndTime('2026-11-06T18:45:00+09:00')).toBe('18:45');
    expect(TimeMaster.formatEndTime('2026-11-06T18:45:00')).toBe('18:45');
  });

  it('MiniTeeboxMonitor 등 모든 가용 타석 판별에서 레슨 전용(is_lesson_only) 및 볼회수 일시정지 타석이 빈 타석으로 집계되지 않는다', () => {
    const normalBay: Bay = { bay_no: 1, status: 'AVAILABLE', is_active: true };
    const lessonBay: Bay = { bay_no: 2, status: 'AVAILABLE', is_active: true, is_lesson_only: true };
    const globalPausedBay: Bay = { bay_no: 3, status: 'AVAILABLE', is_active: true, is_global_paused: true };

    expect(isBayTrulyAvailableForKiosk(normalBay)).toBe(true);
    expect(isBayTrulyAvailableForKiosk(lessonBay)).toBe(false);
    expect(isBayTrulyAvailableForKiosk(globalPausedBay)).toBe(false);
  });
});
