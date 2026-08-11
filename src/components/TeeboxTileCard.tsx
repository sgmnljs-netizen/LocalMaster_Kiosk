import React from 'react';
import { Bay } from '../services/api';
import { Lock, Wrench, Clock } from 'lucide-react';

interface TeeboxTileCardProps {
  bay: Bay;
  isSelected: boolean;
  onSelect: (bayNo: number) => void;
  lang?: 'KO' | 'EN';
  selectionIndex?: number | null;
  isJustAllocated?: boolean;
}

export const TeeboxTileCard: React.FC<TeeboxTileCardProps> = ({
  bay,
  isSelected,
  onSelect,
  lang = 'KO',
  selectionIndex = null,
  isJustAllocated = false,
}) => {
  // 🧮 5대 시간 변수 누적 합산 정밀 계산 함수 (Master Total Availability Calculation)
  const canonicalStatus = (bay as any).status_info?.code || bay.status;
  const isOccupied = canonicalStatus === 'OCCUPIED' || canonicalStatus === 'USE';
  const isPreOccupied = canonicalStatus === 'PRE_OCCUPIED';
  const isPrepare = canonicalStatus === 'PREPARE';
  const isMaintenance = canonicalStatus === 'UNDER_MAINTENANCE' || canonicalStatus === 'REPAIR' || canonicalStatus === 'ERROR';
  const isAvailable = canonicalStatus === 'AVAILABLE' && !isOccupied && !isPreOccupied && !isPrepare && !isMaintenance;

  const totalRemainingMin = (bay as any).status_info?.minutes_left ?? bay.minutes_left ?? 0;
  const finalEndTimeStr = bay.end_time ? (bay.end_time.includes(':') ? bay.end_time : `${bay.end_time.slice(0, 2)}:${bay.end_time.slice(2, 4)}`) : '종료';

  const progressPercent = totalRemainingMin >= 60
    ? 100
    : Math.max(0, Math.min(100, (totalRemainingMin / 60) * 100));

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
        transform: isJustAllocated ? 'scale(1.05) translateY(-4px)' : isSelected ? 'scale(1.03) translateY(-4px)' : 'scale(1)',
        
        // 애플 스타일 미니멀 패널
        backgroundColor: isJustAllocated
          ? 'linear-gradient(135deg, #064e3b 0%, #047857 100%)'
          : isSelected
          ? '#047857'
          : isAvailable
          ? '#ffffff'
          : isOccupied
          ? '#f4f4f5'
          : isPreOccupied
          ? '#fafafa'
          : '#fef2f2',
        
        border: isJustAllocated
          ? '3px solid #10b981'
          : isSelected
          ? '2px solid #10b981'
          : isAvailable
          ? '1px solid rgba(229, 229, 234, 0.8)'
          : isOccupied
          ? '1px solid #e4e4e7'
          : isPreOccupied
          ? '1.5px dashed #a1a1aa'
          : '1px solid #fecdd3',
        
        boxShadow: isJustAllocated
          ? '0 0 24px rgba(16, 185, 129, 0.6), 0 16px 36px rgba(4, 120, 87, 0.4)'
          : isSelected
          ? '0 16px 36px rgba(4, 120, 87, 0.3), 0 2px 8px rgba(0, 0, 0, 0.08)'
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
            top: '12px',
            right: '12px',
            background: '#10b981',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 900,
            padding: '4px 10px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            zIndex: 10
          }}
        >
          ✨ 내 타석
        </div>
      )}

      {/* 동반자 다중 선택 순서 배지 */}
      {selectionIndex && !isJustAllocated && (
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
              {bay.simulator_type === 'GDR_PLUS' ? 'GDR+' : bay.simulator_type === 'QED' ? 'QED' : bay.simulator_type === 'SG_GOLF' ? 'SG' : bay.simulator_type === 'LM' ? 'LM' : bay.simulator_type === 'STR' ? 'STR' : bay.simulator_type === 'VIP' ? 'VIP' : bay.simulator_type}
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
                  backgroundColor: totalRemainingMin <= 15 ? '#d97706' : '#059669',
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
