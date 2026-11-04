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
  const raw = String(floorInput ?? '1F').trim().toUpperCase();
  return raw.endsWith('F') ? raw : `${raw}F`;
}


