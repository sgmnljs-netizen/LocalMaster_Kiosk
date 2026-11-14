import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import {
  extractBayNumberOrderFromMeta,
  sortBaysByNumber,
} from '../floorUtils';
import { buildBayAllocationPreview, TimeMaster } from '../timeMaster';
import type { BayMaster } from '../../types';

const requireCjs = createRequire(import.meta.url);
const electronMain = requireCjs('../../../electron/main.cjs') as {
  KIOSK_BASE_WIDTH: number;
  KIOSK_BASE_HEIGHT: number;
  computeMonitorFitMetrics: (
    display: unknown,
    options?: { isKioskMode?: boolean }
  ) => {
    scale: number;
    isCompactMonitor: boolean;
    contentWidth: number;
    contentHeight: number;
    area: { x: number; y: number; width: number; height: number };
  };
  computeMonitorZoomFactor: (contentW: unknown, contentH: unknown) => number | null;
};

describe('Wave 3 (20261115) Kiosk Utils & Electron Fit Boundary Audit', () => {
  it('Electron computeMonitorFitMetrics: null/손상된 디스플레이 정보에서도 NaN 없이 FHD(1080x1920) 폴백을 보장한다', () => {
    const nullFit = electronMain.computeMonitorFitMetrics(null, { isKioskMode: true });
    expect(nullFit.scale).toBe(1);
    expect(nullFit.isCompactMonitor).toBe(false);
    expect(nullFit.contentWidth).toBe(1080);
    expect(nullFit.contentHeight).toBe(1920);
    expect(nullFit.area).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });

    const brokenFit = electronMain.computeMonitorFitMetrics(
      { bounds: { x: Number.NaN, y: undefined, width: 0, height: -200 } },
      { isKioskMode: true }
    );
    expect(Number.isFinite(brokenFit.scale)).toBe(true);
    expect(brokenFit.contentWidth).toBe(1080);
    expect(brokenFit.contentHeight).toBe(1920);
  });

  it('Electron computeMonitorFitMetrics & computeMonitorZoomFactor: 소형 모니터 축소 및 0.25~1.5 클램프를 준수한다', () => {
    const compactWindowed = electronMain.computeMonitorFitMetrics(
      { workArea: { x: 10, y: 20, width: 1366, height: 728 }, bounds: { x: 0, y: 0, width: 1366, height: 768 } },
      { isKioskMode: false }
    );
    expect(compactWindowed.isCompactMonitor).toBe(true);
    // availHeight = 728 - 44 = 684 -> 684 / 1920 = 0.35625 -> 0.356
    expect(compactWindowed.scale).toBe(0.356);
    expect(compactWindowed.contentWidth).toBe(Math.round(1080 * 0.356));
    expect(compactWindowed.contentHeight).toBe(Math.round(1920 * 0.356));

    expect(electronMain.computeMonitorZoomFactor(0, 1920)).toBeNull();
    expect(electronMain.computeMonitorZoomFactor(Number.NaN, 1080)).toBeNull();
    expect(electronMain.computeMonitorZoomFactor(540, 960)).toBe(0.5);
    expect(electronMain.computeMonitorZoomFactor(100, 100)).toBe(0.25);
    expect(electronMain.computeMonitorZoomFactor(5000, 5000)).toBe(1.5);
  });

  it('floorUtils: camelCase/최상위 bayNumberOrder 추출 및 비수치 타석번호(VIP-1, VIP-2, VIP-10) 결정론적 정렬', () => {
    expect(
      extractBayNumberOrderFromMeta({ operation: { bayNumberOrder: 'desc' } })
    ).toBe('DESC');
    expect(
      extractBayNumberOrderFromMeta(JSON.stringify({ bay_number_order: 'DESC' }))
    ).toBe('DESC');
    expect(
      extractBayNumberOrderFromMeta({ bayNumberOrder: 'asc' })
    ).toBe('ASC');

    const vipBays = [{ bay_no: 'VIP-10' }, { bay_no: 'VIP-2' }, { bay_no: 'VIP-1' }];
    expect(sortBaysByNumber(vipBays, 'ASC').map((b) => b.bay_no)).toEqual([
      'VIP-1',
      'VIP-2',
      'VIP-10',
    ]);
    expect(sortBaysByNumber(vipBays, 'DESC').map((b) => b.bay_no)).toEqual([
      'VIP-10',
      'VIP-2',
      'VIP-1',
    ]);
  });

  it('timeMaster buildBayAllocationPreview: 비수치 타석번호(VIP-1)에서 NaN번 타석이 노출되지 않는다', () => {
    const refNow = TimeMaster.parseIsoAsKstDate('2026-11-15T14:00:00+09:00');
    const preview = buildBayAllocationPreview({
      bay: {
        bay_no: 'VIP-1' as unknown as number,
        status: 'IDLE',
        floor: '2F',
      } as BayMaster,
      durationMin: 50,
      prepareMin: 5,
      now: refNow,
    });

    expect(preview.hasTargetBay).toBe(true);
    expect(preview.bayDisplayLabel).not.toContain('NaN');
    expect(preview.bayDisplayLabel).toBe('VIP-1 타석');
    expect(preview.bayWithFloorLabel).toBe('2F · VIP-1 타석');
  });

  it('timeMaster buildBayAllocationPreview: 다중 타석(그룹 대기) 시 가장 늦게 비는 점유 타석 시각을 기준으로 시작시각을 산출한다', () => {
    const refNow = TimeMaster.parseIsoAsKstDate('2026-11-15T14:00:00+09:00');
    const refMs = refNow.getTime();
    const bays: BayMaster[] = [
      {
        bay_no: 1,
        status: 'OCCUPIED',
        available_from_epoch_ms: refMs + 10 * 60 * 1000,
        end_time: '2026-11-15T14:10:00+09:00',
      } as BayMaster,
      {
        bay_no: 2,
        status: 'OCCUPIED',
        available_from_epoch_ms: refMs + 40 * 60 * 1000,
        end_time: '2026-11-15T14:40:00+09:00',
      } as BayMaster,
    ];

    const preview = buildBayAllocationPreview({
      bays,
      bayNos: [1, 2],
      durationMin: 50,
      prepareMin: 5,
      now: refNow,
    });

    expect(preview.isGroupMode).toBe(true);
    expect(preview.isWaitlist).toBe(true);
    expect(preview.startHhmm).toBe('14:40');
    expect(preview.endHhmm).toBe('15:35');
  });
});
