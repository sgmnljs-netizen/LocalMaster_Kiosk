import React, { useMemo } from 'react';
import { encodeCode128B } from '../../utils/code128Barcode';

export interface Code128BarcodeSvgProps {
  /** 바코드로 인코딩할 실제 식별 문자열 (예약번호, 승인번호 등) */
  value: string;
  /** 렌더링 가로 폭 (px 또는 %) */
  width?: number | string;
  /** 바(Bar) 영역 세로 높이 (px) */
  barHeight?: number;
  /** 하단 가독 텍스트 노출 여부 */
  showLabel?: boolean;
  /** 하단 커스텀 표시 텍스트 (생략 시 정규화된 value 노출) */
  labelText?: string;
  /** 테스트 식별용 data-testid */
  testId?: string;
}

export const Code128BarcodeSvg: React.FC<Code128BarcodeSvgProps> = ({
  value,
  width = 240,
  barHeight = 48,
  showLabel = true,
  labelText,
  testId = 'code128-barcode-svg',
}) => {
  const encoded = useMemo(() => encodeCode128B(value), [value]);
  const displayLabel = labelText ?? encoded.normalizedText;

  return (
    <div
      data-testid={testId}
      data-barcode-value={encoded.normalizedText}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        background: '#ffffff',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid #dcdcd8',
      }}
    >
      <svg
        width={width}
        height={barHeight}
        viewBox={`0 0 ${encoded.totalModules} ${barHeight}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`출입 바코드 ${encoded.normalizedText}`}
        style={{ display: 'block', background: '#ffffff' }}
      >
        <rect x={0} y={0} width={encoded.totalModules} height={barHeight} fill="#ffffff" />
        <g fill="#000000">
          {encoded.bars.map((bar, idx) => (
            <rect key={`${bar.x}-${idx}`} x={bar.x} y={0} width={bar.width} height={barHeight} />
          ))}
        </g>
      </svg>
      {showLabel && (
        <span
          style={{
            fontSize: '12px',
            fontWeight: 800,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            letterSpacing: '1.5px',
            color: '#111111',
            lineHeight: 1.2,
          }}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
};
