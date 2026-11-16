import React from 'react';
import { api, Bay } from '../services/api';
import { Lock, Wrench, Clock } from 'lucide-react';
import { TimeMaster } from '../utils/timeMaster';
import {
  evaluateBayHardwareState,
  isBayTrulyAvailableForKiosk,
  resolveCanonicalBayStatus,
} from '../utils/bayStatusGuard';

interface TeeboxTileCardProps {
  bay: Bay;
  isSelected: boolean;
  onSelect: (bayNo: number) => void;
  lang?: 'KO' | 'EN';
  selectionIndex?: number | null;
  isJustAllocated?: boolean;
  isCurrentMyBay?: boolean; // ✨ 타석 이동 모드: 본인 현재 이용 타석
  isMoveMode?: boolean; // ✨ 타석 이동 모드 여부
}

export const TeeboxTileCard: React.FC<TeeboxTileCardProps> = ({
  bay,
  isSelected,
  onSelect,
  lang = 'KO',
  selectionIndex = null,
  isJustAllocated = false,
  isCurrentMyBay = false,
  isMoveMode = false,
}) => {
  const hwState = evaluateBayHardwareState(bay);
  const canonicalStatus = resolveCanonicalBayStatus(bay);
  const isOccupied = ['OCCUPIED', 'USE', 'IN_USE'].includes(canonicalStatus);
  const isPreOccupied = canonicalStatus === 'PRE_OCCUPIED';
  const isPrepare = canonicalStatus === 'PREPARE';
  const isMaintenance = hwState.isBlocked;
  const isLessonOnly = Boolean(bay.is_lesson_only);
  const isAvailable = isBayTrulyAvailableForKiosk(bay);
  const isSelfLocked = isPreOccupied && (isSelected || (!!bay.lock_terminal_id && bay.lock_terminal_id === api.getTerminalId()));
  const isClickable = !isMaintenance && (isAvailable || isOccupied || isPrepare || isSelected || isSelfLocked || isLessonOnly || isCurrentMyBay);

  const totalRemainingMin = TimeMaster.getTotalWaitMinutes(bay);
  const finalEndTimeStr = TimeMaster.formatAvailableFromTime(bay);

  const progressPercent = totalRemainingMin >= 60
    ? 100
    : Math.max(0, Math.min(100, (totalRemainingMin / 60) * 100));

  // 스펙 텍스트 라벨 (좌타/장비 - 우타는 기본값이므로 시각적 소음 제거를 위해 미노출)
  const handed = bay.handedness || (bay.type === 'LEFT' ? 'LEFT' : 'RIGHT');
  const isSpecialHanded = handed === 'LEFT' || handed === 'BOTH';
  const validSimulatorType = bay.simulator_type && !['STANDARD', 'NONE', ''].includes(String(bay.simulator_type).toUpperCase()) ? bay.simulator_type : null;

  return (
    <div
      onClick={() => isClickable && onSelect(bay.bay_no)}
      style={{
        position: 'relative',
        borderRadius: '20px',
        padding: '10px 8px 9px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        aspectRatio: '1 / 1.22',
        cursor: isCurrentMyBay ? 'default' : (isClickable ? 'pointer' : 'not-allowed'),
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isJustAllocated ? 'scale(1.04) translateY(-3px)' : isSelected ? 'scale(1.02) translateY(-3px)' : 'scale(1)',
        boxSizing: 'border-box',
        
        // 애플 스타일 순백색 & 딥 차콜 고대비 패널 / 내 타석 에메랄드 하이라이트
        backgroundColor: isJustAllocated
          ? 'linear-gradient(135deg, #064e3b 0%, #047857 100%)'
          : isSelected
          ? '#047857'
          : isCurrentMyBay
          ? '#ecfdf5'
          : isAvailable
          ? '#ffffff'
          : (isOccupied || isPrepare)
          ? '#eef2f6'
          : isPreOccupied
          ? '#fafafa'
          : '#fef2f2',
        
        border: isJustAllocated
          ? '3px solid #10b981'
          : isSelected
          ? '2.5px solid #10b981'
          : isCurrentMyBay
          ? '2.5px solid #059669'
          : isAvailable
          ? '1.5px solid rgba(16, 185, 129, 0.28)'
          : (isOccupied || isPrepare)
          ? '1.5px solid #cbd5e1'
          : isPreOccupied
          ? '1.5px dashed #f59e0b'
          : '1.5px solid #fecaca',
        
        boxShadow: isJustAllocated
          ? '0 0 24px rgba(16, 185, 129, 0.6), 0 16px 36px rgba(4, 120, 87, 0.4)'
          : isSelected
          ? '0 16px 36px rgba(4, 120, 87, 0.3), 0 2px 8px rgba(0, 0, 0, 0.08)'
          : isCurrentMyBay
          ? '0 6px 18px rgba(5, 150, 105, 0.18)'
          : isAvailable
          ? '0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
          : '0 2px 8px rgba(0, 0, 0, 0.02)',
        
        overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* ✨ 방금 배정 완료된 타석인 경우 내 타석 배지 표시 */}
      {isJustAllocated && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: '#10b981',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 900,
            padding: '3px 8px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            zIndex: 10
          }}
        >
          ✨ 내 타석
        </div>
      )}

      {/* ⛳ 타석 이동 시 현재 이용 중인 본인 타석 배지 표시 */}
      {isCurrentMyBay && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: '#059669',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 900,
            padding: '3px 8px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
            zIndex: 10
          }}
        >
          ⛳ 현재 내 타석
        </div>
      )}

      {/* 동반자 다중 선택 순서 배지 */}
      {selectionIndex && !isJustAllocated && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            backgroundColor: isSelected ? '#ffffff' : '#047857',
            color: isSelected ? '#047857' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '14px',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
            zIndex: 10,
          }}
        >
          {selectionIndex}
        </div>
      )}

      {/* 1. 상단 헤더(26px): 좌측 스펙 배지 & 우측 상태 인디케이터 (1줄 고정) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: '26px', gap: '4px', flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
          {/* 특수 타석 방향만 강조 표출 (우타는 디폴트이므로 노이즈 방지를 위해 완전 미노출) */}
          {isSpecialHanded && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '3px 7px',
                borderRadius: '6px',
                backgroundColor: isSelected
                  ? 'rgba(255,255,255,0.16)'
                  : (isOccupied || isPrepare)
                  ? '#ffffff'
                  : handed === 'LEFT'
                  ? '#e0f2fe'
                  : '#f3e8ff',
                color: isSelected ? '#ffffff' : (handed === 'LEFT' ? '#0369a1' : '#7e22ce'),
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {handed === 'LEFT' ? '좌타' : '양타'}
            </span>
          )}

          {/* 유효한 장비종만 동적 표출 ('NONE' 제외) */}
          {validSimulatorType && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#1d1d1f',
                color: '#ffffff',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {validSimulatorType === 'GDR_PLUS'
                ? 'GDR+'
                : validSimulatorType === 'KAKAO_VX'
                ? 'VX'
                : validSimulatorType === 'QED'
                ? 'QED'
                : validSimulatorType === 'SDR'
                ? 'SDR'
                : validSimulatorType === 'SG_GOLF'
                ? 'SG'
                : validSimulatorType === 'LM'
                ? 'LM'
                : validSimulatorType === 'STR'
                ? 'STR'
                : validSimulatorType === 'VIP'
                ? 'VIP'
                : validSimulatorType}
            </span>
          )}

          {/* 스크린 규격 배지 */}
          {bay.screen_spec && !['STANDARD', 'NONE'].includes(String(bay.screen_spec).toUpperCase()) && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.16)' : '#f2f2f7',
                color: isSelected ? '#ffffff' : '#48484a',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {bay.screen_spec === 'WIDE_16_9' ? '16:9' : '커브드'}
            </span>
          )}

          {/* 동반자 허용 배지 */}
          {bay.allow_companion && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.16)' : '#ecfeff',
                color: isSelected ? '#ffffff' : '#0e7490',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              동반자
            </span>
          )}

          {/* 레슨 전용 배지 */}
          {bay.is_lesson_only && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.16)' : '#fef3c7',
                color: isSelected ? '#ffffff' : '#b45309',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              레슨
            </span>
          )}

          {/* 점검 / 볼부족 상태 배지 */}
          {isMaintenance && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: '6px',
                backgroundColor: hwState.isBallEmpty ? '#fef3c7' : '#fee2e2',
                color: hwState.isBallEmpty ? '#b45309' : '#dc2626',
                border: hwState.isBallEmpty ? '1px solid #fde68a' : '1px solid #fecaca',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {hwState.isBallEmpty ? '공부족' : hwState.shortLabel || '점검중'}
            </span>
          )}
        </div>

        {/* 우측 상단: 상태별 인디케이터 (가능 / 사용중 / 선점중 / 점검) */}
        {!selectionIndex && !isJustAllocated && !isCurrentMyBay && (
          <>
            {(isAvailable || isSelected) && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: isSelected ? '#34d399' : '#059669',
                  fontSize: '15px',
                  fontWeight: 800,
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#34d399' : '#10b981',
                    boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)',
                    flexShrink: 0,
                  }}
                />
                <span>{isSelected ? '선택됨' : '가능'}</span>
              </div>
            )}
            {!isSelected && !isMaintenance && (isOccupied || isPrepare) && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: isSelected ? '#ffffff' : '#475569',
                  fontSize: '14px',
                  fontWeight: 800,
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#34d399' : '#64748b',
                    flexShrink: 0,
                  }}
                />
                <span>
                  {isSelected
                    ? (lang === 'KO' ? '대기선택' : 'Select')
                    : ((bay.waiting_res_count && bay.waiting_res_count > 0)
                        ? (lang === 'KO' ? `대기 ${bay.waiting_res_count}명` : `Wait ${bay.waiting_res_count}`)
                        : (lang === 'KO' ? '사용중' : 'In Use'))}
                </span>
              </div>
            )}
            {!isSelected && !isMaintenance && isPreOccupied && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: isSelected ? '#ffffff' : '#d97706',
                  fontSize: '14px',
                  fontWeight: 800,
                  letterSpacing: '-0.3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#f59e0b',
                    flexShrink: 0,
                  }}
                />
                <span>선점중</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. 정중앙(Center Hero): 대칭형 타석 번호 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, margin: '0' }}>
        <span
          style={{
            fontSize: isAvailable ? '58px' : '48px',
            fontWeight: 800,
            letterSpacing: '-1.5px',
            lineHeight: 1,
            color: (isJustAllocated || isSelected)
              ? '#ffffff'
              : isCurrentMyBay
              ? '#047857'
              : isAvailable
              ? '#111827'
              : (isOccupied || isPrepare)
              ? '#334155'
              : '#9ca3af',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", Roboto, sans-serif',
          }}
        >
          {String(bay.bay_no).padStart(2, '0')}
        </span>
      </div>

      {/* 3. 하단(고시인성 정보 박스): 상하 2단 풀폭 카드형(사용중) & 대형 상태 배지 */}
      <div style={{ minHeight: '84px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {isCurrentMyBay && (
          <div
            style={{
              height: '52px',
              borderRadius: '12px',
              backgroundColor: '#d1fae5',
              border: '1.5px solid #6ee7b7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#047857',
              fontSize: '15px',
              fontWeight: 900,
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'KO' ? '현재 내 타석 (보전)' : 'Current Teebox (Keep)'}
          </div>
        )}

        {!isCurrentMyBay && (isAvailable || isSelected) && (
          <div
            style={{
              height: '52px',
              borderRadius: '12px',
              backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e6f9ed',
              border: isSelected ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid #86efac',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSelected ? '#ffffff' : '#047857',
              fontSize: '16.5px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            {isSelected 
              ? (isMoveMode ? (lang === 'KO' ? '이동 선택 완료' : 'Move Selected') : (lang === 'KO' ? '선택 완료' : 'Selected')) 
              : (isMoveMode ? (lang === 'KO' ? '즉시 이동 가능' : 'Move Available') : (lang === 'KO' ? '즉시 배정 가능' : 'Available'))}
          </div>
        )}

        {!isCurrentMyBay && !isSelected && !isMaintenance && (isOccupied || isPrepare) && (
          <div
            style={{
              backgroundColor: isSelected ? 'rgba(255,255,255,0.14)' : '#ffffff',
              borderRadius: '14px',
              border: isSelected ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid #cbd5e1',
              boxShadow: isSelected ? 'none' : '0 4px 10px rgba(15, 23, 42, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            {/* 1단(상단 풀폭): 남은 대기 시간 강조 (좌우 정렬 · 14px 라벨 + 27px 볼드 수치) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '4px',
                padding: '7px 11px 6px 11px',
                backgroundColor: isSelected
                  ? 'transparent'
                  : bay.is_paused
                  ? 'rgba(255, 237, 213, 0.8)'
                  : totalRemainingMin <= 15
                  ? 'rgba(254, 243, 199, 0.8)'
                  : 'rgba(236, 253, 245, 0.85)',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: isSelected
                    ? 'rgba(255,255,255,0.9)'
                    : bay.is_paused
                    ? '#c2410c'
                    : '#475569',
                  letterSpacing: '-0.4px',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {bay.is_paused
                  ? (lang === 'KO' ? '일시 정지' : 'Paused')
                  : (lang === 'KO' ? '남은 대기' : 'Wait Time')}
              </span>
              <span
                style={{
                  fontSize: bay.is_paused ? '16px' : (totalRemainingMin > 0 ? '27px' : '19px'),
                  fontWeight: 900,
                  color: isSelected
                    ? '#ffffff'
                    : bay.is_paused
                    ? '#ea580c'
                    : totalRemainingMin <= 15
                    ? '#d97706'
                    : '#059669',
                  letterSpacing: '-0.7px',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {bay.is_paused
                  ? (lang === 'KO' ? '볼회수중' : 'Hold')
                  : totalRemainingMin > 0
                  ? (lang === 'KO' ? `${totalRemainingMin}분` : `${totalRemainingMin}m`)
                  : (lang === 'KO' ? '1분 미만' : '< 1m')}
              </span>
            </div>

            {/* 수평 1px 구분선 */}
            <div
              style={{
                width: '100%',
                height: '1px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                flexShrink: 0,
              }}
            />

            {/* 2단(하단 풀폭): 시작 시각 고대비 표출 (좌우 정렬 · 14px 라벨 + 23px 볼드 시각) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '4px',
                padding: '6px 11px',
                backgroundColor: isSelected ? 'transparent' : '#ffffff',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: isSelected ? 'rgba(255,255,255,0.9)' : '#64748b',
                  letterSpacing: '-0.4px',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {lang === 'KO' ? '시작 시각' : 'Start At'}
              </span>
              <span
                style={{
                  fontSize: bay.is_paused ? '16px' : '23px',
                  fontWeight: 900,
                  color: isSelected ? '#ffffff' : (bay.is_paused ? '#ea580c' : '#0f172a'),
                  letterSpacing: '-0.6px',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {bay.is_paused ? (lang === 'KO' ? '정지중' : 'Paused') : finalEndTimeStr}
              </span>
            </div>

            {/* 하단 7px 일체형 매립 프로그레스 바 (Graph Bar) */}
            <div style={{ width: '100%', height: '7px', backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#f1f5f9', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: isSelected
                    ? '#ffffff'
                    : (bay.is_paused ? '#f97316' : totalRemainingMin <= 15 ? '#f59e0b' : 'linear-gradient(90deg, #10b981 0%, #059669 100%)'),
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        {!isCurrentMyBay && !isSelected && !isMaintenance && isPreOccupied && (
          <div
            style={{
              height: '48px',
              borderRadius: '12px',
              backgroundColor: isSelected ? 'rgba(255,255,255,0.18)' : '#fef3c7',
              border: isSelected ? '1px solid rgba(255,255,255,0.3)' : '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              color: isSelected ? '#ffffff' : '#b45309',
              fontSize: '14.5px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            <Lock size={14} />
            <span>결제 진행 중</span>
          </div>
        )}

        {!isCurrentMyBay && isMaintenance && (
          <div
            style={{
              height: '48px',
              borderRadius: '12px',
              backgroundColor: hwState.isBallEmpty ? '#fef3c7' : '#fee2e2',
              border: hwState.isBallEmpty ? '1px solid #fde68a' : '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              color: hwState.isBallEmpty ? '#b45309' : '#dc2626',
              fontSize: '14.5px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {hwState.isBallEmpty ? (
              <>
                <span style={{ fontSize: '13px' }}>⚠️</span>
                <span>공부족 (점검)</span>
              </>
            ) : (
              <>
                <Wrench size={13} />
                <span>{hwState.shortLabel || '점검 중'}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
