import React from 'react';
import { Bay } from '../services/api';
import { Lock, Wrench, Clock } from 'lucide-react';

interface TeeboxTileCardProps {
  bay: Bay;
  isSelected: boolean;
  onSelect: (bayNo: number) => void;
  lang?: 'KO' | 'EN';
  selectionIndex?: number | null;
}

export const TeeboxTileCard: React.FC<TeeboxTileCardProps> = ({
  bay,
  isSelected,
  onSelect,
  lang = 'KO',
  selectionIndex = null,
}) => {
  // 🧮 5대 시간 변수 누적 합산 정밀 계산 함수 (Master Total Availability Calculation)
  const calculateTotalFreeTime = () => {
    // 1. 미들웨어 실시간 타석 장비 전달 잔여시간 (config_json 1순위 파싱)
    let middlewareMin: number | null = null;
    if (bay.config_json) {
      try {
        const cfg = typeof bay.config_json === 'string' ? JSON.parse(bay.config_json) : bay.config_json;
        if (cfg) {
          if (cfg.remaining_time !== undefined && cfg.remaining_time !== null) {
            middlewareMin = parseInt(cfg.remaining_time, 10);
          } else if (cfg.remaining_min !== undefined && cfg.remaining_min !== null) {
            middlewareMin = parseInt(cfg.remaining_min, 10);
          }
        }
      } catch (e) {}
    }

    // 미들웨어 수신값이 있으면 1순위 (0분도 포함), 없으면 bay.minutes_left 사용
    let currentRemMin = middlewareMin !== null ? Math.max(0, middlewareMin) : (bay.minutes_left !== undefined ? bay.minutes_left : 0);

    // 🔄 [체크인 대기 보완] CHK/PREPARE/REQ 대기 상태이고 미들웨어 작동 전일 때 기본 배정 시간(60분) 적용
    const isPending = ['CHK', 'PREPARE', 'REQ', 'RSV', 'HOLD'].includes((bay as any).status_cd || bay.status);
    if (currentRemMin === 0 && isPending) {
      currentRemMin = (bay as any).duration_min || 0;
    }

    // 2. POS/Admin 서비스 연장분
    const extendMin = (bay as any).extend_min || (bay as any).bonus_min || 0;

    // 3. 후속 대기 세션 수 및 총 이용분 (waiting_res_count)
    const waitingCount = (bay as any).waiting_res_count || 0;
    const waitingMin = (bay as any).waiting_res_total_min || 0;

    // 4. 세션 전환 갭 (세션 당 1분 정비/대기 타임)
    const bufferGapMin = waitingCount > 0 ? (waitingCount * 1) : 0;

    // 5. 선점 홀드 타임 (preoccupy_hold_sec ➔ 분 변환)
    const holdSec = (bay as any).preoccupy_hold_sec || 0;
    const holdMin = Math.ceil(holdSec / 60);

    // 6. [대기시간(Prepare Time) 정밀 합산] PREPARE 상태이거나 대기시간 속성이 전달된 경우 반영
    let prepareMin = (bay as any).prepare_min || (bay as any).prepare_time || 0;
    if (((bay.status as string) === 'PREPARE' || (bay as any).status_cd === 'PREPARE') && prepareMin === 0) {
      prepareMin = 1; // 기본 대기시간 1분
    }

    // ➔ 5대 변수 누적 총 합산 잔여시간 (분)
    let totalRemainingMin = currentRemMin + extendMin + waitingMin + bufferGapMin + holdMin + prepareMin;

    // ➔ 백엔드 end_time(예: "09:44" 또는 "0944") 전달 시 현재 시각 기준 실제 남은 분(Minute) 정밀 동기화
    if (bay.end_time) {
      try {
        const cleanEndTime = bay.end_time.replace(':', '').trim();
        if (cleanEndTime.length === 4) {
          const endH = parseInt(cleanEndTime.substring(0, 2), 10);
          const endM = parseInt(cleanEndTime.substring(2, 4), 10);
          const now = new Date();
          const targetDate = new Date(now);
          targetDate.setHours(endH, endM, 0, 0);

          if (targetDate > now) {
            const diffMs = targetDate.getTime() - now.getTime();
            const diffMin = Math.ceil(diffMs / (60 * 1000));
            // end_time 기반 남은 분이 대기시간 미합산 분보다 크면 실제 end_time 남은 분(61분 등)을 최우선 반영
            if (diffMin > totalRemainingMin) {
              totalRemainingMin = diffMin;
            }
          }
        }
      } catch (e) {}
    }

    // ➔ 최종 빈 타석 예정 시각 도출 (현재 시각 KST 기준 + totalRemainingMin)
    const now = new Date();
    const finalFreeDate = new Date(now.getTime() + totalRemainingMin * 60 * 1000);
    const hours = String(finalFreeDate.getHours()).padStart(2, '0');
    const minutes = String(finalFreeDate.getMinutes()).padStart(2, '0');
    const finalEndTimeStr = `${hours}:${minutes}`;

    return {
      currentRemMin,
      totalRemainingMin,
      finalEndTimeStr,
    };
  };

  const { currentRemMin, totalRemainingMin, finalEndTimeStr } = calculateTotalFreeTime();

  // 🔄 [동기화 핵심 픽스] 체크인 대기/입장 대기/이용 중/대기 세션 상태 정밀 판정
  const isPendingState = ['CHK', 'PREPARE', 'REQ', 'RSV', 'HOLD', 'PENDING'].includes((bay as any).status_cd || bay.status);
  const hasWaitingSessions = ((bay as any).waiting_res_count || 0) > 0;
  const hasActiveRemainingTime = totalRemainingMin > 0;

  const rawAvailable = bay.status === 'AVAILABLE';
  const rawOccupied = bay.status === 'OCCUPIED' || (bay as any).status === 'USE' || isPendingState || hasWaitingSessions;

  // 체크인 대기중이거나 대기 세션이 있거나 잔여 시간이 있으면 무조건 사용중/배정대기중(isOccupied = true)
  const isOccupied = rawOccupied && (hasActiveRemainingTime || isPendingState || hasWaitingSessions);
  const isAvailable = rawAvailable && !isOccupied && !isPendingState && !hasWaitingSessions;
  const isPreOccupied = bay.status === 'PRE_OCCUPIED';
  const isMaintenance = bay.status === 'UNDER_MAINTENANCE' || (bay.status as any) === 'REPAIR' || (bay.status as any) === 'ERROR';

  const progressPercent = Math.max(0, Math.min(100, (totalRemainingMin / 120) * 100));

  // 스펙 텍스트 라벨 (좌타/장비)
  const handed = bay.handedness || (bay.type === 'LEFT' ? 'LEFT' : 'RIGHT');
  const simType = bay.simulator_type || 'GDR_PLUS';

  return (
    <div
      onClick={() => (isAvailable || isOccupied) && onSelect(bay.bay_no)}
      style={{
        position: 'relative',
        borderRadius: '24px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '170px',
        cursor: (isAvailable || isOccupied) ? 'pointer' : 'not-allowed',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isSelected ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
        
        // 애플 스타일 미니멀 패널
        backgroundColor: isSelected
          ? '#047857'
          : isAvailable
          ? '#ffffff'
          : isOccupied
          ? '#f4f4f5'
          : isPreOccupied
          ? '#fafafa'
          : '#fef2f2',
        
        border: isSelected
          ? '2px solid #10b981'
          : isAvailable
          ? '1px solid rgba(229, 229, 234, 0.8)'
          : isOccupied
          ? '1px solid #e4e4e7'
          : isPreOccupied
          ? '1.5px dashed #a1a1aa'
          : '1px solid #fecdd3',
        
        boxShadow: isSelected
          ? '0 16px 36px rgba(4, 120, 87, 0.3), 0 2px 8px rgba(0, 0, 0, 0.08)'
          : isAvailable
          ? '0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
          : '0 2px 8px rgba(0, 0, 0, 0.02)',
        
        overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* 동반자 다중 선택 순서 배지 */}
      {selectionIndex && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: isSelected ? '#ffffff' : '#047857',
            color: isSelected ? '#047857' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '15px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 10,
          }}
        >
          {selectionIndex}
        </div>
      )}

      {/* 1. 상단: 미니멀 스펙 배지 & 🟢 가능 도트 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* 스펙 태그 (기본 우타 표시) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* 타석 방향 (기본값: 우타) */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : (handed === 'LEFT' ? '#e0f2fe' : handed === 'BOTH' ? '#f3e8ff' : '#f4f4f5'),
              color: isSelected ? '#ffffff' : (handed === 'LEFT' ? '#0284c7' : handed === 'BOTH' ? '#7e22ce' : '#52525b'),
              border: isSelected ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(0,0,0,0.06)',
              letterSpacing: '-0.2px',
            }}
          >
            {handed === 'LEFT' ? '좌타' : handed === 'BOTH' ? '양타' : '우타'}
          </span>

          {/* DB에 실제 입력되어 있는 장비종만 동적 표출 */}
          {bay.simulator_type && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e4e4e7',
                color: isSelected ? '#ffffff' : '#3f3f46',
                letterSpacing: '-0.2px',
              }}
            >
              {bay.simulator_type === 'GDR_PLUS' ? 'GDR+' : bay.simulator_type === 'QED' ? 'QED' : bay.simulator_type === 'SG_GOLF' ? 'SG' : bay.simulator_type}
            </span>
          )}

          {/* DB에 입력된 레슨 전용 배지 */}
          {bay.is_lesson_only && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#fef3c7',
                color: isSelected ? '#ffffff' : '#d97706',
                letterSpacing: '-0.2px',
              }}
            >
              레슨
            </span>
          )}
        </div>

        {/* 🟢 이용 가능 도트 뱃지 */}
        {isAvailable && !selectionIndex && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              color: isSelected ? '#ffffff' : '#059669',
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isSelected ? '#34d399' : '#10b981',
                boxShadow: isSelected ? '0 0 8px #34d399' : '0 0 6px #10b981',
              }}
            />
            <span>{isSelected ? '선택됨' : '가능'}</span>
          </div>
        )}
      </div>

      {/* 2. 중앙: SF Pro 타이포그래피 대형 타석 번호 */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0' }}>
        <span
          style={{
            fontSize: '46px',
            fontWeight: 800,
            letterSpacing: '-1.5px',
            lineHeight: 1,
            color: isSelected ? '#ffffff' : isAvailable ? '#111827' : isOccupied ? '#059669' : '#9ca3af',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
          }}
        >
          {String(bay.bay_no).padStart(2, '0')}
        </span>
      </div>

      {/* 3. 하단: 5대 시간 변수 누적 합산 표출 (상단 크고 굵게 / 하단에 작게) */}
      <div>
        {isAvailable && (
          <div style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : '#9ca3af', fontSize: '13px', fontWeight: 600 }}>
            {isSelected ? '선택 완료' : '이용 가능'}
          </div>
        )}

        {isOccupied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {/* 1. 상단 대형 강세: 누적 실질 잔여시간 (크고 굵게) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={15} color="#059669" />
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#059669', letterSpacing: '-0.4px' }}>
                {totalRemainingMin > 0 ? `${totalRemainingMin}분 남음` : '1분 미만'}
              </span>
            </div>

            {/* 2. 하단 서브: 그 아래 정밀 계산된 최종 빈 타석 예정 시각 (작게) */}
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#71717a', letterSpacing: '-0.2px', paddingLeft: '2px' }}>
              {finalEndTimeStr} 빈타석 예정
            </div>

            {/* 잔여시간 누적 프로그레스 게이지 바 */}
            <div style={{ width: '100%', height: '5px', backgroundColor: '#e4e4e7', borderRadius: '3px', overflow: 'hidden', marginTop: '2px' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: '#059669',
                  borderRadius: '3px',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        )}

        {isPreOccupied && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6366f1', fontSize: '13px', fontWeight: 700 }}>
            <Lock size={13} />
            <span>결제 진행 중</span>
          </div>
        )}

        {isMaintenance && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>
            <Wrench size={13} />
            <span>점검 중</span>
          </div>
        )}
      </div>
    </div>
  );
};
