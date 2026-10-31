/**
 * ISO/IEC 15417 Code 128 (Code Set B) 무의존성 순수 바코드 인코더
 * - 가짜 장식용 SVG <rect> 목업을 배제하고 실제 1D 레이저 / 2D 광학 리더기로 100% 판독되는
 *   표준 바/스페이스 모듈 배열을 생성합니다.
 */

export interface Code128BarSegment {
  /** 좌측 Quiet Zone을 포함한 시작 모듈 좌표 */
  x: number;
  /** 연속된 흑색 바(Bar) 모듈 폭 */
  width: number;
}

export interface EncodedCode128Result {
  /** 정규화된 인코딩 대상 ASCII 문자열 */
  normalizedText: string;
  /** 흑색 바 세그먼트 목록 */
  bars: Code128BarSegment[];
  /** 좌우 Quiet Zone을 포함한 전체 모듈 폭 */
  totalModules: number;
  /** Modulo-103 체크섬 심볼 값 (0..102) */
  checksum: number;
  /** 인코딩된 전체 심볼 인덱스 시퀀스 [START_B(104), ...data, checksum, STOP(106)] */
  symbolValues: number[];
}

const START_CODE_B = 104;
const STOP_CODE = 106;
const DEFAULT_QUIET_ZONE_MODULES = 10;

/**
 * ISO/IEC 15417 표준 107개 심볼 패턴 테이블 (0..105: 6엘리먼트 11모듈, 106 STOP: 7엘리먼트 13모듈)
 */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

/**
 * Code 128 Set B 허용 문자(ASCII 32~126)로 안전 정규화합니다.
 */
export function normalizeCode128Text(raw: string, fallback = 'GOLFOS'): string {
  const cleaned = Array.from(String(raw || '').trim())
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join('')
    .slice(0, 32);

  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * 입력 문자열을 표준 Code 128B 모듈 좌표로 인코딩합니다.
 */
export function encodeCode128B(
  rawValue: string,
  quietZoneModules: number = DEFAULT_QUIET_ZONE_MODULES
): EncodedCode128Result {
  const safeQuiet = Math.max(10, Math.floor(quietZoneModules));
  const normalizedText = normalizeCode128Text(rawValue);

  const dataValues: number[] = [];
  let weightedSum = START_CODE_B;

  for (let i = 0; i < normalizedText.length; i += 1) {
    const val = normalizedText.charCodeAt(i) - 32;
    dataValues.push(val);
    weightedSum += val * (i + 1);
  }

  const checksum = weightedSum % 103;
  const symbolValues = [START_CODE_B, ...dataValues, checksum, STOP_CODE];

  const bars: Code128BarSegment[] = [];
  let cursor = safeQuiet;

  for (const symVal of symbolValues) {
    const pattern = CODE128_PATTERNS[symVal];
    for (let idx = 0; idx < pattern.length; idx += 1) {
      const moduleWidth = Number(pattern[idx]);
      const isBar = idx % 2 === 0;
      if (isBar && moduleWidth > 0) {
        bars.push({ x: cursor, width: moduleWidth });
      }
      cursor += moduleWidth;
    }
  }

  const totalModules = cursor + safeQuiet;

  return {
    normalizedText,
    bars,
    totalModules,
    checksum,
    symbolValues,
  };
}
