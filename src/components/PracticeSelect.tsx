import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeftRight, Check, Compass, Layers, ShieldAlert, Timer, UserCheck, CreditCard, X } from 'lucide-react';
import { api, Bay } from '../services/api';
import { TopTeeboxDashboard } from './TopTeeboxDashboard';
import { TeeboxTileCard } from './TeeboxTileCard';

interface PracticeSelectProps {
  bays: Bay[];
  lang: 'KO' | 'EN';
  initialSelectedBayNo?: number | null;
  onBaySelected: (bayNo: number, purposeType: 'ALLOCATE_MEMBERSHIP' | 'ALLOCATE_DAILY') => void;
  onGroupBaySelected?: (bayNos: number[]) => void;
  onCancel: () => void;
  onRefreshBays: () => void;
}

export const PracticeSelect: React.FC<PracticeSelectProps> = ({
  bays,
  lang,
  initialSelectedBayNo,
  onBaySelected,
  onGroupBaySelected,
  onCancel,
  onRefreshBays
}) => {
  // 연쇄 배정 정밀 시각 안내 정보 상태
  const [chainedInfo, setChainedInfo] = useState<{ startTimeStr: string; minutesWait: number } | null>(null);
  const [allocMode, setAllocMode] = useState<'SINGLE' | 'GROUP'>('SINGLE');
  const [activeFloor, setActiveFloor] = useState<string>('1F');
  const [filterChip, setFilterChip] = useState<'ALL' | 'LEFT' | 'GDR' | 'LESSON' | 'AVAILABLE'>('ALL');
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(initialSelectedBayNo || null);
  const [selectedBayNos, setSelectedBayNos] = useState<number[]>(initialSelectedBayNo ? [initialSelectedBayNo] : []);
  const [preoccupyLoading, setPreoccupyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState<number>(60);
  
  // 회원/비회원 배정 방식 선택 모달 상태 (이전 화면에서 돌아왔을 때 복원 지원)
  const [showDecisionModal, setShowDecisionModal] = useState<boolean>(!!initialSelectedBayNo);

  // 정상적인 단계 이동(Confirm) 시에만 언마운트 클린업 락 해제를 스킵하기 위한 Ref
  const isConfirmedRef = useRef(false);

  // 선점 락 제한시간 1초 간격 갱신
  useEffect(() => {
    const activeList = allocMode === 'SINGLE' ? (selectedBayNo !== null ? [selectedBayNo] : []) : selectedBayNos;
    if (activeList.length === 0) return;
    
    setCountdown(allocMode === 'GROUP' ? 120 : 60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleReleaseAll();
          setErrorMsg(lang === 'KO' ? '선점 유효 시간이 초과되어 타석 선택이 자동 취소되었습니다.' : 'Selection timeout. Teebox released.');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedBayNo, selectedBayNos, allocMode, lang]);

  // 컴포넌트 언마운트 시 비정상 이탈(예: 광고 복귀, 홈 이동 등)인 경우 선점 락을 자동으로 즉시 해제하는 Cleanup Guard
  useEffect(() => {
    return () => {
      const activeList = allocMode === 'SINGLE' ? (selectedBayNo !== null ? [selectedBayNo] : []) : selectedBayNos;
      if (activeList.length > 0 && !isConfirmedRef.current) {
        api.releaseBays(activeList).catch(err => console.error('Cleanup release failed:', err));
      }
    };
  }, [selectedBayNo, selectedBayNos, allocMode]);

  // bays 데이터로부터 동적으로 존재하는 층 목록 추출 (1F, 2F, 3F 등 문자열 기준 정렬)
  const floorList = Array.from(new Set(bays.map(b => b.floor || (b.floor_no ? `${b.floor_no}F` : '1F')))).sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
    const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
    return numA - numB;
  });

  // 첫 진입 시 동적으로 추출된 층의 첫 번째 값으로 설정
  useEffect(() => {
    if (floorList.length > 0 && !floorList.includes(activeFloor)) {
      setActiveFloor(floorList[0]);
    }
  }, [bays]);

  // 타석별 동반자 배정 허용 여부 체크 헬퍼
  const isCompanionAllowed = (bayObj: any) => {
    if (bayObj.allow_companion === true) return true;
    if (bayObj.config_json) {
      try {
        const cfg = typeof bayObj.config_json === 'string' ? JSON.parse(bayObj.config_json) : bayObj.config_json;
        if (cfg && cfg.allow_companion === true) return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  // 매장/구역 전체 타석 중 동반자 배정 허용 타석이 1개라도 존재하는지 체크
  const hasAnyCompanionBay = React.useMemo(() => {
    return bays.some(b => isCompanionAllowed(b));
  }, [bays]);

  // 동반자 허용 타석이 없으면 무조건 1인 단일 타석 모드로 강제 고정
  useEffect(() => {
    if (!hasAnyCompanionBay && allocMode === 'GROUP') {
      setAllocMode('SINGLE');
      handleReleaseAll();
    }
  }, [hasAnyCompanionBay, allocMode]);

  // 타석 터치 - 단일 및 다중 원자적 선점(Pre-emption) 락 시도
  const handleBayTouch = async (bayNo: number) => {
    const bay = bays.find(b => b.bay_no === bayNo);
    if (!bay) return;
    if (bay.status === 'UNDER_MAINTENANCE') return;

    // 이용 중인 타석 선택 시 ➔ 원래 배정 팝업에 연쇄 배정 정밀 시각 안내 바인딩
    if (bay.status === 'OCCUPIED' || (bay as any).status === 'USE') {
      let mwMin = 0;
      if (bay.config_json) {
        try {
          const cfg = typeof bay.config_json === 'string' ? JSON.parse(bay.config_json) : bay.config_json;
          if (cfg && cfg.remaining_time !== undefined) {
            mwMin = parseInt(cfg.remaining_time, 10) || 0;
          }
        } catch {}
      }

      const currentRemMin = mwMin > 0 ? mwMin : (bay.minutes_left || 0);
      const extendMin = (bay as any).extend_min || 0;
      const waitingCount = (bay as any).waiting_res_count || 0;
      const waitingMin = (bay as any).waiting_res_total_min || 0;
      const bufferGapMin = waitingCount > 0 ? (waitingCount * 1) : 1; // 1분 정비 갭

      const totalWaitMin = currentRemMin + extendMin + waitingMin + bufferGapMin;

      const now = new Date();
      const startDate = new Date(now.getTime() + totalWaitMin * 60 * 1000);
      const startTimeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

      setChainedInfo({ startTimeStr, minutesWait: totalWaitMin });
      setSelectedBayNo(bayNo);
      setSelectedBayNos([bayNo]);
      setShowDecisionModal(true);
      return;
    } else {
      setChainedInfo(null);
    }
    
    // 이미 타인에 의해 선점된 경우
    if (bay.status === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
      setErrorMsg(lang === 'KO' ? '이미 다른 고객님께서 선택 중인 타석입니다.' : 'This teebox is currently being selected by another user.');
      return;
    }

    if (allocMode === 'SINGLE') {
      // --- 1인 단일 타석 모드 ---
      if (selectedBayNo === bayNo) {
        handleReleaseAll();
        return;
      }
      if (selectedBayNo !== null) {
        await api.releaseBay(selectedBayNo);
      }

      setErrorMsg('');
      setPreoccupyLoading(true);

      try {
        const success = await api.preoccupyBay(bayNo);
        if (success) {
          setSelectedBayNo(bayNo);
          setSelectedBayNos([bayNo]);
          const bayFloor = bay.floor || (bay.floor_no ? `${bay.floor_no}F` : '1F');
          if (bayFloor !== activeFloor) setActiveFloor(bayFloor);
          // 타석 클릭 즉시 배정 방식 선택 모달 팝업
          setShowDecisionModal(true);
        } else {
          setErrorMsg(lang === 'KO' ? '타석 선점에 실패했습니다. 다시 시도해 주세요.' : 'Failed to secure teebox.');
        }
      } catch {
        setErrorMsg(lang === 'KO' ? '타석 선점 중 오류가 발생했습니다.' : 'Error occurred while securing teebox.');
      } finally {
        setPreoccupyLoading(false);
        onRefreshBays();
      }
    } else {
      // --- 👥 동반자 다중 타석 배정 모드 ---
      setErrorMsg('');

      // 선택하려는 타석이 1인 전용 타석인 경우 동반자 배정 불가 처리
      if (!isCompanionAllowed(bay)) {
        setErrorMsg(lang === 'KO' ? '선택하신 타석은 1인 전용 타석으로 동반자 동시 배정이 불가능합니다.' : 'This teebox is designated for single player only and cannot be assigned to groups.');
        return;
      }
      
      // 이미 선택된 타석이면 선택 해제
      if (selectedBayNos.includes(bayNo)) {
        const nextList = selectedBayNos.filter(n => n !== bayNo);
        await api.releaseBay(bayNo);
        setSelectedBayNos(nextList);
        onRefreshBays();
        return;
      }

      // 최대 4개 제한
      if (selectedBayNos.length >= 4) {
        setErrorMsg(lang === 'KO' ? '동반자 배정은 한 번에 최대 4개 타석까지만 가능합니다.' : 'Maximum 4 teeboxes allowed per group allocation.');
        return;
      }

      // 층 다름 제약 체크
      if (selectedBayNos.length > 0) {
        const firstBay = bays.find(b => b.bay_no === selectedBayNos[0]);
        const firstFloor = firstBay?.floor || (firstBay?.floor_no ? `${firstBay.floor_no}F` : '1F');
        const targetFloor = bay.floor || (bay.floor_no ? `${bay.floor_no}F` : '1F');
        if (firstFloor !== targetFloor) {
          setErrorMsg(lang === 'KO' ? `동반자 타석은 동일한 층(${firstFloor})에서만 동시 선택 가능합니다.` : `Group teeboxes must be selected from the same floor (${firstFloor}).`);
          return;
        }
      }

      setPreoccupyLoading(true);
      const nextList = [...selectedBayNos, bayNo];
      try {
        const success = await api.preoccupyBays(nextList);
        if (success) {
          setSelectedBayNos(nextList);
        } else {
          setErrorMsg(lang === 'KO' ? '타석 다중 선점에 실패했습니다.' : 'Failed to secure group teeboxes.');
        }
      } catch {
        setErrorMsg(lang === 'KO' ? '다중 선점 처리 중 오류가 발생했습니다.' : 'Error securing group teeboxes.');
      } finally {
        setPreoccupyLoading(false);
        onRefreshBays();
      }
    }
  };

  // 선점 전체 수동 해제
  const handleReleaseAll = async () => {
    const activeList = allocMode === 'SINGLE' ? (selectedBayNo !== null ? [selectedBayNo] : []) : selectedBayNos;
    if (activeList.length > 0) {
      await api.releaseBays(activeList);
      setSelectedBayNo(null);
      setSelectedBayNos([]);
      onRefreshBays();
    }
  };

  // 선택 완료 버튼 클릭 -> 분기 의사결정 모달 노출 또는 동반자 설정
  const handleConfirmClick = () => {
    if (allocMode === 'SINGLE' && selectedBayNo !== null) {
      setShowDecisionModal(true);
    } else if (allocMode === 'GROUP' && selectedBayNos.length > 0) {
      isConfirmedRef.current = true;
      if (onGroupBaySelected) {
        onGroupBaySelected(selectedBayNos);
      }
    }
  };

  // 최종 분기 선택 완료 (회원권 배정 vs 일일권 결제)
  const handleDecisionConfirm = (type: 'MEMBERSHIP' | 'DAILY') => {
    if (selectedBayNo === null) return;
    isConfirmedRef.current = true;
    setShowDecisionModal(false);
    
    const purposeType = type === 'MEMBERSHIP' ? 'ALLOCATE_MEMBERSHIP' : 'ALLOCATE_DAILY';
    onBaySelected(selectedBayNo, purposeType);
  };

  // 현재 활성 층 타석 필터링
  const floorBays = bays.filter(b => (b.floor || (b.floor_no ? `${b.floor_no}F` : '1F')) === activeFloor);
  const filteredBays = floorBays.filter(b => {
    if (filterChip === 'LEFT') {
      const h = b.handedness || (b.type === 'LEFT' ? 'LEFT' : 'RIGHT');
      return h === 'LEFT' || h === 'BOTH';
    }
    if (filterChip === 'GDR') return (b.simulator_type || 'GDR_PLUS') === 'GDR_PLUS';
    if (filterChip === 'LESSON') return !!b.is_lesson_only;
    if (filterChip === 'AVAILABLE') return b.status === 'AVAILABLE';
    return true;
  });

  // 모달 표기용 선택 타석 정보 추출
  const selectedBay = selectedBayNo !== null ? bays.find(b => b.bay_no === selectedBayNo) : null;
  const isOccupied = selectedBay?.status === 'OCCUPIED';

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '24px',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      {/* 0. 애플 모션 스타일 전용 CSS 스타일 태그 주입 */}
      <style>{`
        @keyframes rippleWave {
          0% {
            transform: scale(0.96);
            opacity: 0.9;
            box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.6);
          }
          100% {
            transform: scale(1.24);
            opacity: 0;
            box-shadow: 0 0 0 20px rgba(52, 199, 89, 0);
          }
        }
        @keyframes softBlink {
          0% {
            opacity: 0.35;
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes modalSmoothPopIn {
          0% {
            opacity: 0;
            transform: scale(0.94) translateY(12px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes overlaySmoothFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        /* 추가: 타일 액티브(터치) GPU 가속 애니메이션 */
        .luxury-tile {
          transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.15s ease;
        }
        .luxury-tile:active {
          transform: scale(0.96) !important;
          box-shadow: inset 0 4px 12px rgba(0,0,0,0.05) !important;
        }
      `}</style>

      {/* 1. 상단 실시간 타석 종합 전광판 (Apple Bento Panel) */}
      <div style={{ width: '100%', background: '#ffffff', borderRadius: '24px', border: '1px solid rgba(229, 229, 234, 0.8)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)' }}>
        <TopTeeboxDashboard 
          bays={bays} 
          onBayClick={handleBayTouch} 
          lang={lang} 
        />
      </div>

      {/* 2. 하단 조작 영역 컨테이너 (Apple Minimalist Bento Box) */}
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid rgba(229, 229, 234, 0.8)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
          padding: '28px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        {/* 배정 모드 토글 스위치 (iOS Segmented Control Style) */}
        {hasAnyCompanionBay ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: '#f4f4f5', padding: '5px', borderRadius: '16px', border: '1px solid #e4e4e7' }}>
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              <button
                onClick={() => {
                  if (allocMode !== 'SINGLE') {
                    handleReleaseAll();
                    setAllocMode('SINGLE');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  background: allocMode === 'SINGLE' ? '#ffffff' : 'transparent',
                  color: allocMode === 'SINGLE' ? '#111827' : '#71717a',
                  boxShadow: allocMode === 'SINGLE' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                🎯 1인 단일 타석
              </button>
              <button
                onClick={() => {
                  if (allocMode !== 'GROUP') {
                    handleReleaseAll();
                    setAllocMode('GROUP');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  background: allocMode === 'GROUP' ? '#ffffff' : 'transparent',
                  color: allocMode === 'GROUP' ? '#111827' : '#71717a',
                  boxShadow: allocMode === 'GROUP' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                👥 동반자 다중 배정 (최대 4석)
              </button>
            </div>

            {allocMode === 'GROUP' && (
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', paddingRight: '12px', whiteSpace: 'nowrap' }}>
                선택: <strong>{selectedBayNos.length}</strong> / 4석
              </div>
            )}
          </div>
        ) : null}

        {/* 층 전환 iOS Segmented Control 탭바 & 퀵 필터 칩 바 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', padding: '4px', borderRadius: '16px', background: '#f4f4f5', gap: '4px', flexWrap: 'nowrap', overflowX: 'auto', border: '1px solid #e4e4e7' }}>
              {floorList.map(f => {
                return (
                  <button
                    key={f}
                    onClick={() => setActiveFloor(f)}
                    style={{
                      minWidth: '120px',
                      padding: '10px 24px',
                      fontSize: '18px',
                      fontWeight: 800,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      color: activeFloor === f ? '#111827' : '#71717a',
                      background: activeFloor === f ? '#ffffff' : 'transparent',
                      border: 'none',
                      outline: 'none',
                      boxShadow: activeFloor === f ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      whiteSpace: 'nowrap',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ⚡ 퀵 필터 칩 바 (Apple Pill Chips) */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            {[
              { id: 'ALL', label: '전체' },
              { id: 'AVAILABLE', label: '🟢 이용 가능만' },
              { id: 'LEFT', label: '⛳ 좌타석' },
              { id: 'GDR', label: '⚡ GDR+' },
              { id: 'LESSON', label: '🎓 레슨전용' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setFilterChip(chip.id as any)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: filterChip === chip.id ? '1px solid #111827' : '1px solid #e5e5ea',
                  backgroundColor: filterChip === chip.id ? '#111827' : '#ffffff',
                  color: filterChip === chip.id ? '#ffffff' : '#4b5563',
                  boxShadow: filterChip === chip.id ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 6px rgba(0, 0, 0, 0.02)',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* 에러 피드백 메세지 */}
        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', padding: '12px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#991b1b' }}>{errorMsg}</span>
          </div>
        )}

        {/* 실시간 상세 타석 카드 그리드 (Apple Pearl Grid) */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '16px',
            padding: '20px',
            background: '#f5f5f7',
            borderRadius: '20px',
            border: '1px solid #e5e5ea',
            minHeight: '340px'
          }}
        >
          {filteredBays.length === 0 ? (
            <div style={{ gridColumn: 'span 5', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#9ca3af', fontSize: '16px', fontWeight: 700 }}>
              조건에 일치하는 타석이 없습니다.
            </div>
          ) : (
            filteredBays.map((bay) => {
              const selectedIdx = allocMode === 'SINGLE' 
                ? (selectedBayNo === bay.bay_no ? 1 : null) 
                : (selectedBayNos.indexOf(bay.bay_no) !== -1 ? selectedBayNos.indexOf(bay.bay_no) + 1 : null);
              const isSelected = selectedIdx !== null;

              return (
                <TeeboxTileCard
                  key={bay.bay_no}
                  bay={bay}
                  isSelected={isSelected}
                  selectionIndex={allocMode === 'GROUP' ? selectedIdx : null}
                  lang={lang}
                  onSelect={(bayNo) => handleBayTouch(bayNo)}
                />
              );
            })
          )}
        </div>


        {/* 3. 하단 액션 컨트롤러 바 */}
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderTop: '1px solid var(--bg-tertiary)', 
            paddingTop: '18px',
            marginTop: '8px'
          }}
        >
          <div>
            {(allocMode === 'SINGLE' ? selectedBayNo !== null : selectedBayNos.length > 0) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div 
                  style={{ 
                    background: 'rgba(5, 150, 105, 0.08)', 
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    padding: '8px 16px', 
                    borderRadius: '12px', 
                    fontSize: '16px', 
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={16} style={{ color: '#059669' }} />
                  <span style={{ color: '#111827' }}>
                    {lang === 'KO' ? '선택된 타석:' : 'Selected:'}{' '}
                    <strong style={{ color: '#059669', fontSize: '20px' }}>
                      {allocMode === 'SINGLE' ? selectedBayNo : selectedBayNos.join(', ')}
                    </strong>
                    {lang === 'KO' ? '번' : ''}
                  </span>
                </div>
                <span style={{ fontSize: '14px', color: '#ea580c', fontWeight: 700 }}>
                  ({lang === 'KO' ? `배정 제한시간: ${countdown}초` : `Limit: ${countdown}s`})
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {lang === 'KO' ? '배정받으실 빈 타석 타일을 클릭해 주세요.' : 'Please tap an available teebox tile.'}
              </span>
            )}
          </div>

          {/* Main Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="kiosk-btn" 
              style={{ width: '130px', height: '56px', borderRadius: '10px', fontSize: '16px', fontWeight: 800 }}
              onClick={async () => {
                await handleReleaseAll();
                onCancel();
              }}
            >
              {lang === 'KO' ? '돌아가기' : 'Back'}
            </button>
            
            <button
              onClick={handleConfirmClick}
              disabled={selectedBayNo === null || preoccupyLoading}
              className="kiosk-btn"
              style={{ 
                background: 'linear-gradient(135deg, #031510 0%, #022c22 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255,255,255,0.05)',
                color: '#ffffff',
                width: '180px', 
                height: '56px', 
                borderRadius: '10px', 
                fontSize: '18px', 
                fontWeight: 800 
              }}
            >
              {preoccupyLoading 
                ? (lang === 'KO' ? '선점 중...' : 'Securing...') 
                : (lang === 'KO' ? '선택 완료' : 'Select Complete')}
            </button>
          </div>
        </div>
      </div>

      {/* 4. 회원권 배정 vs 일일권 분기 모달 (Light & Glass 리뉴얼) */}
      {/* 4. 회원권 배정 vs 일일권 분기 모달 (Premium Light Glass Theme) */}
      {showDecisionModal && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'transparent',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'overlaySmoothFadeIn 0.22s ease-out'
          }}
        >
          <div 
            className="premium-glass-card"
            style={{
              width: '780px',
              padding: '56px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: '40px',
              position: 'relative',
              borderRadius: '32px',
              boxShadow: '0 30px 80px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08)',
              animation: 'modalSmoothPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
                {lang === 'KO' ? '배정 방식을 선택해 주세요' : 'Select Allocation Type'}
              </h3>
              <p style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 500, margin: 0 }}>
                {lang === 'KO' 
                  ? '선택하신 타석의 이용 방식을 선택합니다.' 
                  : 'Please select the allocation type for the teebox.'}
              </p>
            </div>

            {/* Double Check 티켓 (라이트 글래스) */}
            {selectedBay && (
              <div 
                className="glass-panel"
                style={{
                  padding: '24px 32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: '24px',
                  background: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                {/* 1. 타석 번호 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '선택 타석' : 'Selected Bay'}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1 }}>{selectedBay.bay_no}</span>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>{lang === 'KO' ? '번' : ''}</span>
                  </div>
                </div>
                
                {/* 세로선 */}
                <div style={{ width: '1px', height: '48px', background: 'var(--glass-border)' }} />

                {/* 2. 시작 시간 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '이용 시작 시간' : 'Start Time'}</span>
                  {!isOccupied ? (
                    <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--system-blue)', letterSpacing: '-0.5px' }}>
                      {lang === 'KO' ? '결제 완료 즉시 (NOW)' : 'Start Immediately'}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--system-orange)', letterSpacing: '-0.5px' }}>
                        {chainedInfo?.startTimeStr 
                          ? (lang === 'KO' ? `약 ${chainedInfo.startTimeStr} 예상` : `Around ${chainedInfo.startTimeStr}`)
                          : (selectedBay.end_time 
                              ? (lang === 'KO' 
                                  ? `약 ${selectedBay.end_time.includes(':') 
                                      ? (selectedBay.end_time.split(' ')[1] || selectedBay.end_time).slice(0, 5) 
                                      : `${selectedBay.end_time.slice(0, 2)}:${selectedBay.end_time.slice(2, 4)}`} 예상` 
                                  : `Around ${selectedBay.end_time}`)
                              : (lang === 'KO' ? '대기 시간 발생' : 'Wait Required'))}
                      </span>
                      {(chainedInfo?.minutesWait !== undefined || selectedBay.minutes_left !== undefined) && (
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--system-orange)', marginTop: '2px', opacity: 0.8 }}>
                          {lang === 'KO' 
                            ? `(약 ${chainedInfo?.minutesWait ?? selectedBay.minutes_left}분 대기)` 
                            : `(Approx. ${chainedInfo?.minutesWait ?? selectedBay.minutes_left}m wait)`}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 세로선 */}
                <div style={{ width: '1px', height: '48px', background: 'var(--glass-border)' }} />

                {/* 3. 배정 유형 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{lang === 'KO' ? '이용 유형' : 'Type'}</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: !isOccupied ? 'var(--system-blue)' : 'var(--system-orange)', letterSpacing: '-0.5px' }}>
                    {!isOccupied 
                      ? (lang === 'KO' ? '✨ 즉시 배정' : 'Instant Allocation') 
                      : (lang === 'KO' ? '👥 대기 예약' : 'Waitlist Booking')}
                  </span>
                </div>
              </div>
            )}

            {/* ⏰ 연쇄 배정 정밀 시각 일원화 안내 배너 */}
            {chainedInfo && (
              <div
                style={{
                  backgroundColor: '#f0fdf4',
                  border: '2px solid #22c55e',
                  borderRadius: '20px',
                  padding: '16px 24px',
                  marginBottom: '24px',
                  textAlign: 'center',
                  boxShadow: '0 8px 20px -4px rgba(34, 197, 94, 0.12)',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803d', marginBottom: '2px' }}>
                  이용 중 타석 연쇄 배정 (앞 세션 종료 1분 후 자동 시작)
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#15803d', letterSpacing: '-0.5px' }}>
                  ⏰ {chainedInfo.startTimeStr} 시작 예정 ({chainedInfo.minutesWait}분 뒤 입장)
                </div>
              </div>
            )}

            {/* Card Buttons (프리미엄 럭셔리 스타일) */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '20px' }}>
              {/* Type 1: 회원권 */}
              <div 
                onClick={() => handleDecisionConfirm('MEMBERSHIP')}
                className="glass-panel"
                style={{
                  flex: 1,
                  padding: '40px 24px',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '20px',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
                  transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.2s'
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
              >
                <div style={{ background: 'var(--text-primary)', padding: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCheck size={36} style={{ color: '#ffffff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {lang === 'KO' ? '보유 회원권으로 배정' : 'Membership Pass'}
                  </span>
                  <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {lang === 'KO' 
                      ? '보유 중인 회원권(기간/횟수제)으로\n회원 인증 후 즉시 배정합니다.' 
                      : 'Authenticate with your active membership pass.'}
                  </span>
                </div>
              </div>

              {/* Type 2: 일일권 */}
              <div 
                onClick={() => handleDecisionConfirm('DAILY')}
                className="glass-panel"
                style={{
                  flex: 1,
                  padding: '40px 24px',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '20px',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
                  transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.2s'
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = 'rgba(240, 240, 245, 0.9)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.85)'; }}
              >
                <div style={{ background: 'var(--text-primary)', padding: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CreditCard size={36} style={{ color: '#ffffff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {lang === 'KO' ? '일일권 즉시 결제' : 'Daily Pass Payment'}
                  </span>
                  <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {lang === 'KO' 
                      ? '비회원 또는 정보 입력 없이\n일일 타석권을 현장 결제합니다.' 
                      : 'Purchase a daily pass directly.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
              <button 
                className="kiosk-btn"
                onClick={() => {
                  handleReleaseAll();
                  setShowDecisionModal(false);
                }}
                style={{ 
                  width: '200px', 
                  height: '56px', 
                  borderRadius: '28px', 
                  fontSize: '18px',
                  fontWeight: 700,
                  background: 'rgba(0, 0, 0, 0.05)',
                  color: 'var(--text-secondary)',
                  border: 'none'
                }}
              >
                {lang === 'KO' ? '취소 후 돌아가기' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
