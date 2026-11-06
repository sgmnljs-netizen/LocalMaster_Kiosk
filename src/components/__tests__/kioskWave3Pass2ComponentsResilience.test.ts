import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterCompanionAssignableAssets } from '../CompanionSetupModal';
import { evaluateAssetFloorMismatchReason } from '../AssetSelectModal';
import type { MemberAsset } from '../../services/api';

function makeAsset(overrides: Partial<MemberAsset> = {}): MemberAsset {
  return {
    member_item_id: '501',
    prod_cd: 'P_MEM_01',
    item_name: '정기 회원권',
    logic_type: 'PERIOD',
    remain_days: 30,
    is_assignable: true,
    ...overrides,
  };
}

describe('Wave 3 Pass 2 — Components Floor Parsing & Electron Kiosk Invariants', () => {
  it('filterCompanionAssignableAssets distinguishes basement B1F (-1) from 1F (+1) and ignores empty floor strings', () => {
    const basementAsset = makeAsset({
      member_item_id: '101',
      item_name: '지하1층 전용권',
      allowed_floors: [-1],
    });
    const firstFloorAsset = makeAsset({
      member_item_id: '102',
      item_name: '1층 전용권',
      allowed_floors: [1],
    });

    // B1F 타석 배정 시 지하1층(-1) 전용권만 허용하고 지상1층(+1) 전용권은 차단해야 함
    const onBasementBay = filterCompanionAssignableAssets(
      [basementAsset, firstFloorAsset],
      'BAY',
      '20261106',
      'B1F'
    );
    expect(onBasementBay.map((a) => a.member_item_id)).toEqual(['101']);

    // 지상 1F 타석 배정 시 지상1층(+1) 전용권만 허용하고 지하1층(-1) 전용권은 차단해야 함
    const onFirstFloorBay = filterCompanionAssignableAssets(
      [basementAsset, firstFloorAsset],
      'BAY',
      '20261106',
      '1F'
    );
    expect(onFirstFloorBay.map((a) => a.member_item_id)).toEqual(['102']);

    // 층 정보가 빈 문자열('')인 경우 0층으로 오인해 차단하지 않고 통과시켜야 함
    const onUnspecifiedFloorBay = filterCompanionAssignableAssets(
      [basementAsset, firstFloorAsset],
      'BAY',
      '20261106',
      ''
    );
    expect(onUnspecifiedFloorBay.map((a) => a.member_item_id)).toEqual(['101', '102']);
  });

  it('evaluateAssetFloorMismatchReason formats basement floors as B1층 and prevents empty-string 0층 false blocks', () => {
    const basementOnlyAsset = makeAsset({
      allowed_floors: [-1],
    });
    const multiFloorAsset = makeAsset({
      allowed_floors: [-1, 2],
    });

    // B1F 타석에 지하1층 전용권 사용 -> 사유 없음(정상 허용)
    expect(evaluateAssetFloorMismatchReason(basementOnlyAsset, 'B1F')).toBeNull();
    expect(evaluateAssetFloorMismatchReason(basementOnlyAsset, -1)).toBeNull();

    // 지상 1F 타석에 지하1층 전용권 사용 -> '-1층'이 아닌 'B1층 전용 이용권입니다.' 안내
    expect(evaluateAssetFloorMismatchReason(basementOnlyAsset, '1F')).toBe('B1층 전용 이용권입니다.');
    expect(evaluateAssetFloorMismatchReason(multiFloorAsset, '1F')).toBe('B1·2층 전용 이용권입니다.');

    // 빈 문자열('') 층 입력 시 Number('') === 0 오작동으로 인한 거짓 차단 방지
    expect(evaluateAssetFloorMismatchReason(basementOnlyAsset, '')).toBeNull();
    expect(evaluateAssetFloorMismatchReason(basementOnlyAsset, undefined)).toBeNull();
  });

  it('preserves Electron 24/7 kiosk security, PNA switches, ERR_ABORTED ignore, and crash-loop backoff invariants', () => {
    const electronMainPath = path.resolve(__dirname, '../../../electron/main.cjs');
    const source = fs.readFileSync(electronMainPath, 'utf8');

    expect(source).toContain('contextIsolation: true');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('BlockInsecurePrivateNetworkRequests');
    expect(source).toContain('if (errorCode === -3) return;');
    expect(source).toContain('crashTimestamps.filter((ts) => now - ts < 60000)');
    expect(source).toContain('crashTimestamps.length > 4 ? 10000 : 1500');
  });
});
