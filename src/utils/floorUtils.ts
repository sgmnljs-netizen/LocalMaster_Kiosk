/**
 * 층수 파싱 및 정렬 유틸리티 (프런트포스 floorUtils.ts 1:1 SSOT 동기화)
 *
 * 골프장 건물 물리 구조 직관성 원칙:
 * 세로 적층형 타석 현황판(TopTeeboxDashboard, MiniTeeboxMonitor)에서는
 * 상위 층(예: 3F)이 화면 상단에, 하위 층(예: 1F, B1F)이 화면 제일 하단에 배치되도록 내림차순 정렬한다.
 * 정렬 순서 예: 4F -> 3F -> 2F -> 1F -> B1F -> B2F
 */

export function parseFloorNumber(floorStr?: string | null): number {
  if (!floorStr) return 1;
  const nullableParsed = parseNullableFloorNumber(floorStr);
  if (nullableParsed !== null) return nullableParsed;
  const clean = String(floorStr).trim().toUpperCase();
  if (clean.startsWith('B')) {
    const num = parseInt(clean.replace(/[^0-9]/g, ''), 10) || 1;
    return -num;
  }
  const num = parseInt(clean.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

export function sortFloorsDescending(floors: string[]): string[] {
  return [...floors].sort((a, b) => {
    const floorA = parseFloorNumber(a);
    const floorB = parseFloorNumber(b);
    if (floorA !== floorB) {
      return floorB - floorA; // 내림차순 (높은 층이 상단, 1층/지하층이 하단)
    }
    return b.localeCompare(a);
  });
}

export function sortFloorsAscending(floors: string[]): string[] {
  return [...floors].sort((a, b) => {
    const floorA = parseFloorNumber(a);
    const floorB = parseFloorNumber(b);
    if (floorA !== floorB) {
      return floorA - floorB; // 오름차순 (가로 탭: B1F -> 1F -> 2F -> 3F)
    }
    return a.localeCompare(b);
  });
}

export function sortBaysByNumber<T extends { bay_no?: number | string | null }>(bays: T[]): T[] {
  return [...bays].sort((a, b) => (Number(a.bay_no) || 0) - (Number(b.bay_no) || 0));
}

export function formatFloorDisplayLabel(floorInput: string | number): string {
  const normalized = normalizeFloorZoneToken(floorInput);
  if (normalized) return normalized;
  const raw = String(floorInput ?? '1F').trim().toUpperCase();
  return raw.endsWith('F') ? raw : `${raw}F`;
}

/**
 * 지하층('B1F', 'B1', '지하1층', -1) 및 지상층('2F', '2층', 2) 입력을 부호 있는 층 정수(-1, 2 등)로 안전 파싱합니다.
 * 빈 문자열('')이나 숫자가 없는 일반 구역명('VIP', 'PAR3')은 0으로 오인하지 않고 null을 반환합니다.
 */
export function parseNullableFloorNumber(raw?: number | string | null): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw !== 0 ? Math.trunc(raw) : null;
  }
  const clean = String(raw).trim().toUpperCase();
  if (!clean) return null;

  const basementMatch = clean.match(/^(?:B|지하)\s*(\d+)(?:F|층)?$/);
  if (basementMatch) {
    const num = parseInt(basementMatch[1], 10);
    return num > 0 ? -num : null;
  }

  const signedFloorMatch = clean.match(/^(-?\d+)\s*(?:F|층)?$/);
  if (signedFloorMatch) {
    const num = parseInt(signedFloorMatch[1], 10);
    return Number.isFinite(num) && num !== 0 ? num : null;
  }

  return null;
}

/**
 * 층 입력(-1, 'B1', 'B1F', '지하1층', 2, '2층', '2F')을 표준 구역 토큰('B1F', '2F')으로 정규화합니다.
 */
export function normalizeFloorZoneToken(raw?: number | string | null): string {
  const parsed = parseNullableFloorNumber(raw);
  if (parsed === null) return '';
  return parsed < 0 ? `B${Math.abs(parsed)}F` : `${parsed}F`;
}


