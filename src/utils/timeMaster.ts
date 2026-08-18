/**
 * [SSOT] LocalMaster_Kiosk 전용 TimeMaster 클래스
 * - 한국 표준시(KST UTC+9) 날짜 추출 (toISOString UTC 오용 방지)
 * - HH:mm / HHmm 종료시간 파싱 및 자정 경과(+24h) 보정
 * - 백엔드 minutes_left SSOT 기반 잔여시간 산출
 */
export class TimeMaster {
  private static serverOffsetMs: number = 0;

  /** 백엔드 server_epoch_ms를 기반으로 클라이언트-서버 시계 오차 동기화 */
  static syncServerTime(serverEpochMs?: number | null): void {
    if (serverEpochMs && typeof serverEpochMs === 'number') {
      TimeMaster.serverOffsetMs = serverEpochMs - Date.now();
    }
  }

  /** 서버 보정 현재 시각 (ms) */
  static getSyncedNowMs(): number {
    return Date.now() + TimeMaster.serverOffsetMs;
  }

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

  /** 서버 보정 현재 Date 객체 */
  static getSyncedDate(): Date {
    return new Date(TimeMaster.getSyncedNowMs());
  }

  /** 대기시간 잔여 (초) 산출 (prepare_expired_epoch_ms SSOT 최우선) */
  static getPrepareRemainingSec(
    bay?: { prepare_remaining_sec?: number; prepare_expired_epoch_ms?: number | null } | null
  ): number {
    if (!bay) return 0;
    if (bay.prepare_expired_epoch_ms && typeof bay.prepare_expired_epoch_ms === 'number') {
      const diffMs = bay.prepare_expired_epoch_ms - TimeMaster.getSyncedNowMs();
      return Math.max(0, Math.ceil(diffMs / 1000));
    }
    return bay.prepare_remaining_sec ?? 0;
  }

  /** 잔여 시간 산출 (실시간 end_epoch_ms 연산 최우선) */
  static getRemainingMinutes(
    bay?: { minutes_left?: number; end_time?: string | null; end_epoch_ms?: number | null } | null,
    now: Date = new Date()
  ): number {
    if (!bay) return 0;
    if (bay.end_epoch_ms && typeof bay.end_epoch_ms === 'number') {
      const diffMs = bay.end_epoch_ms - TimeMaster.getSyncedNowMs();
      return Math.max(0, Math.ceil(diffMs / 1000 / 60));
    }
    if (bay.end_time) {
      const endDt = TimeMaster.parseSessionEnd(bay.end_time, now);
      if (endDt) {
        const diffMs = endDt.getTime() - TimeMaster.getSyncedNowMs();
        return Math.max(0, Math.ceil(diffMs / 1000 / 60));
      }
    }
    return bay.minutes_left ?? 0;
  }

  /** 타석 종료 시각 (HH:mm) 안전 포맷팅 */
  static formatEndTime(
    bay?: { end_time?: string | null; end_epoch_ms?: number | null } | null
  ): string {
    if (!bay) return '종료';
    if (bay.end_epoch_ms && typeof bay.end_epoch_ms === 'number') {
      const d = new Date(bay.end_epoch_ms);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    if (!bay.end_time) return '종료';
    const clean = String(bay.end_time).replace(/[^0-9]/g, '');
    if (clean.length >= 4) {
      return `${clean.substring(0, 2)}:${clean.substring(2, 4)}`;
    }
    return String(bay.end_time);
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
