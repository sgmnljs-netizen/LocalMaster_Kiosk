/**
 * [SSOT] LocalMaster_Kiosk 전용 TimeMaster 클래스
 * - 한국 표준시(KST UTC+9) 날짜 추출 (toISOString UTC 오용 방지)
 * - HH:mm / HHmm 종료시간 파싱 및 자정 경과(+24h) 보정
 * - 백엔드 minutes_left SSOT 기반 잔여시간 산출
 */
export class TimeMaster {
  /** KST 로컬 기준 YYYY-MM-DD 날짜 추출 (toISOString UTC -9h 오차 방지) */
  static getKstYmd(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 타석 종료시간(HH:mm / HHmm) 안전 파싱 및 자정 경과(+24h) 보정 */
  static parseSessionEnd(endTimeStr?: string | null, now: Date = new Date()): Date | null {
    if (!endTimeStr) return null;
    const cleanTime = String(endTimeStr).replace(/[^0-9]/g, '');
    if (cleanTime.length < 4) return null;
    const endHour = parseInt(cleanTime.substring(0, 2), 10);
    const endMin = parseInt(cleanTime.substring(2, 4), 10);
    let endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0, 0);
    // 자정 경과 세션 (예: 23:30 시작 ~ 00:30 종료 시 23시간 과거 산출 방지)
    if (endDt.getTime() < now.getTime() - 12 * 3600 * 1000) {
      endDt = new Date(endDt.getTime() + 24 * 3600 * 1000);
    }
    return endDt;
  }

  /** 잔여 시간 산출 (백엔드 minutes_left SSOT 최우선) */
  static getRemainingMinutes(bay: { minutes_left?: number; end_time?: string | null }, now: Date = new Date()): number {
    if (typeof bay.minutes_left === 'number') return bay.minutes_left;
    if (!bay.end_time) return 0;
    const endDt = TimeMaster.parseSessionEnd(bay.end_time, now);
    if (!endDt) return 0;
    const diffMs = endDt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / 1000 / 60));
  }

  /** 날짜 및 시각 포맷팅 (YYYY.MM.DD HH:mm:ss) */
  static formatKstDateTime(d: Date = new Date(), includeSeconds: boolean = true): string {
    const ymd = TimeMaster.getKstYmd(d).replace(/-/g, '.');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (!includeSeconds) {
      return `${ymd} ${hh}:${mm}`;
    }
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${ymd} ${hh}:${mm}:${ss}`;
  }
}
