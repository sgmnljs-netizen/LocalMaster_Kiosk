import { describe, it, expect } from 'vitest';
import { TimeMaster, isBayAvailable, isBayOccupied, isBayBlocked } from '../timeMaster';

describe('TimeMaster & Bay Status Guards (Commercial Kiosk Audit)', () => {
  it('parses ISO-8601 end_time strings accurately without corrupting 2026 year into 20:26', () => {
    const isoStr = '2026-10-16T15:30:00+09:00';
    expect(TimeMaster.formatEndTime(isoStr)).toBe('15:30');

    const nowMs = new Date('2026-10-16T15:00:00+09:00').getTime();
    expect(TimeMaster.getRemainingMinutes(isoStr, nowMs)).toBe(30);
  });

  it('parses HHMM and HH:MM strings accurately', () => {
    expect(TimeMaster.formatEndTime('1845')).toBe('18:45');
    expect(TimeMaster.formatEndTime('09:15')).toBe('09:15');
  });

  it('classifies available, occupied, and blocked bays accurately', () => {
    expect(isBayAvailable({ status: 'AVAILABLE', is_active: true })).toBe(true);
    expect(isBayAvailable({ status: 'AVAILABLE', is_active: false })).toBe(false);
    expect(isBayOccupied({ status: 'USE', is_active: true })).toBe(true);
    expect(isBayOccupied({ status: 'PREPARE', is_active: true })).toBe(true);
    expect(isBayBlocked({ status: 'BUFFER', is_active: true })).toBe(true);
    expect(isBayBlocked({ status: 'HOLD', is_active: true })).toBe(true);
    expect(isBayBlocked({ status: 'MAINTENANCE', is_active: true })).toBe(true);
    expect(isBayBlocked({ status: 'AVAILABLE', is_active: false })).toBe(true);
  });
});
