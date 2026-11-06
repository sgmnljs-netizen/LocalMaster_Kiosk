import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeftRight, Check, Compass, ShieldAlert, Timer } from 'lucide-react';
import { api, Bay, Member } from '../services/api';
import { TeeboxTileCard } from './TeeboxTileCard';
import { TimeMaster } from '../utils/timeMaster';
import { evaluateBayHardwareState } from '../utils/bayStatusGuard';
import { sortBaysByNumber, formatFloorDisplayLabel } from '../utils/floorUtils';

interface TeeboxMapProps {
  member?: Member | null;
  memberNo?: string;
  memberName?: string;
  isMoveMode?: boolean; // 타석 이동 모드 여부
  lang?: 'KO' | 'EN';
  justAllocatedBayNo?: number | null;
  feedbackCountdown?: number | null;
  onCancelCountdown?: () => void;
  onBaySelected: (bayNo: number, sourceBayNo?: number) => void;
  onCancel: () => void;
  onGoPractice?: () => void;
  bays: Bay[];
  onRefreshBays: () => void;
  selectedZoneIds?: (string | number)[];
}

// 🛡️ 시각 표시 KST 친절 정규화 헬퍼 (ISO UTC 원시 문자열 방어)
const formatEndTime = (timeStr?: string | null): string => {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }
  if (/^\d{4}$/.test(timeStr)) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr.slice(0, 5);
  }
  return timeStr;
};

export const TeeboxMap: React.FC<TeeboxMapProps> = ({
  member,
  memberNo,
  memberName,
  isMoveMode = false,
  lang = 'KO',
  justAllocatedBayNo = null,
  feedbackCountdown = null,
  onCancelCountdown,
  onBaySelected,
  onCancel,
  onGoPractice,
  bays,
  onRefreshBays,
  selectedZoneIds = []
}) => {
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [selectedBayNo, setSelectedBayNo] = useState<number | null>(null);
  const [preoccupyLoading, setPreoccupyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState<number>(60); // 선점 락 카운트다운 (1분)
  const hasAutoFocusedFloorRef = useRef(false);
  const isLockingRef = useRef(false);

  const effMemberNo = member?.member_no || memberNo;
  const effMemberName = (member?.member_name || memberName || '').trim();

  const [fallbackMoveBay, setFallbackMoveBay] = useState<Bay | null>(null);

  useEffect(() => {
    if (!isMoveMode || !effMemberNo) {
      setFallbackMoveBay(null);
      return;
    }
    let mounted = true;
    api.getMemberCheckinReservations(effMemberNo).then((resList) => {
      if (!mounted || !Array.isArray(resList)) return;
      const statusPriority: Record<string, number> = {
        USE: 1,
        OCCUPIED: 1,
        IN_USE: 1,
        PREPARE: 2,
        CHK: 3,
        QUEUE: 3,
        QUEUED: 3,
        WAIT: 3,
        RSV: 4,
        CONFIRMED: 4,
        RESERVED: 4,
        REQ: 5,
      };
      const practiceReservations = resList
        .filter((r) => {
          const st = String(r.status_cd || '').toUpperCase();
          if (!(st in statusPriority)) return false;
          if (['HOLD', 'UNPAID'].includes(String(r.payment_status || '').toUpperCase())) return false;
          const facType = String(r.facility_type || r.resource_type || 'BAY').toUpperCase();
          if (facType !== 'BAY') return false;
          const catId = String(r.category_id || '').toUpperCase();
          if (['PAR3', 'SCREEN', 'ROOM'].includes(catId)) return false;
          const bNo = Number(r.bay_no ?? r.resource_no ?? 0);
          return bNo > 0 && bNo < 1000;
        })
        .sort((a, b) => {
          const pa = statusPriority[String(a.status_cd || '').toUpperCase()] ?? 99;
          const pb = statusPriority[String(b.status_cd || '').toUpperCase()] ?? 99;
          return pa - pb;
        });

      const activeRes = practiceReservations[0];
      const activeResBayNo = Number(activeRes?.bay_no ?? activeRes?.resource_no ?? 0);
      if (activeRes && activeResBayNo > 0) {
        const matchedBay = bays.find(b => Number(b.bay_no) === activeResBayNo);
        const physStatus = String(matchedBay?.status_info?.code || matchedBay?.status || '').toUpperCase();
        const physMemNo = String(matchedBay?.current_member_no || matchedBay?.member_no || '').trim();
        const isPhysicallyOwnedByMe =
          Boolean(matchedBay) &&
          ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(physStatus) &&
          Boolean(effMemberNo) &&
          (physMemNo === String(effMemberNo).trim() || String(matchedBay?.current_user_name || '').trim() === String(effMemberNo).trim());

        if (isPhysicallyOwnedByMe && matchedBay) {
          setFallbackMoveBay(matchedBay);
        } else {
          // [BUG-V03] CHK/RSV 예약 회원의 타석이 현재 AVAILABLE이거나 앞사람(타인)이 이용 중일 때
          // 물리 타석의 상태/잔여시간으로 오염되지 않도록 예약 원장 기준 가상 타석 정보 합성
          const resStatus = String(activeRes.status_cd || 'CHK').toUpperCase();
          const fallbackMin = Number(matchedBay?.minutes_left ?? 0);
          const durMin = Number(activeRes.duration_min ?? fallbackMin) || fallbackMin;
          setFallbackMoveBay({
            bay_id: matchedBay?.bay_id ?? activeResBayNo,
            bay_no: activeResBayNo,
            floor_no: matchedBay?.floor_no || 1,
            type: matchedBay?.type ?? 'RIGHT',
            status: resStatus,
            current_member_no: effMemberNo,
            current_user_name: effMemberName,
            member_name: effMemberName,
            minutes_left: durMin,
            duration_min: durMin,
            start_time: activeRes.start_time || '',
            end_time: activeRes.end_time || '',
            res_id: activeRes.res_id,
          });
        }
      } else {
        setFallbackMoveBay(null);
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isMoveMode, effMemberNo, effMemberName, bays]);

  // [BUG-V01] 이동 모드 시 현재 회원이 점유/예약 중인 타석 정밀 검색
  // 1순위: 본인 member_no(또는 member_no 미존재 시 성명)로 실제 가동 중인 타석 (동명이인 타인 member_no 절대 배제)
  const activeOwnedBay = isMoveMode
    ? bays.find(b => {
        const st = String(b.status_info?.code || b.status || '').toUpperCase();
        if (!['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(st)) return false;

        const bayMemberNo = String(b.current_member_no || b.member_no || '').trim();
        if (bayMemberNo !== '') {
          return Boolean(effMemberNo && bayMemberNo === String(effMemberNo).trim());
        }
        if (effMemberNo && String(b.current_user_name || '').trim() === String(effMemberNo).trim()) {
          return true;
        }
        const bayUserName = String(b.member_name || b.current_user_name || '').trim();
        return effMemberName !== '' && bayUserName === effMemberName;
      })
    : null;

  // 2순위: 차기 예약(next_res)으로 대기 중인 타석 (앞사람 타석 잔여시간 오염 방지를 위해 CHK 가상 상태로 래핑)
  const nextReservedOwnedBay = isMoveMode && !activeOwnedBay && !fallbackMoveBay
    ? (() => {
        const found = bays.find(b => {
          const nextCheckinSt = String(b.next_res_checkin_status || '').toUpperCase();
          if (!['CHK', 'RSV', 'CONFIRMED', 'QUEUE', 'QUEUED', 'WAIT', 'REQ', 'COMPLETED', 'PENDING', 'REQUESTED'].includes(nextCheckinSt)) return false;
          const nextMemNo = String(b.next_res_member_no || '').trim();
          if (nextMemNo !== '') {
            return Boolean(effMemberNo && nextMemNo === String(effMemberNo).trim());
          }
          const nextResName = String(b.next_res_name || '').trim();
          return effMemberName !== '' && nextResName === effMemberName;
        });
        if (!found) return null;
        const fallbackMin = Number(found.minutes_left ?? 0);
        const durMin = Number(found.next_res_duration_min ?? fallbackMin) || fallbackMin;
        const virtualBay: Bay = {
          ...found,
          status: 'CHK',
          status_info: { code: 'CHK', is_transferable: true },
          current_member_no: effMemberNo,
          current_user_name: effMemberName,
          member_name: effMemberName,
          minutes_left: durMin,
          duration_min: durMin,
          end_time: found.next_res_end_time || '',
          end_epoch_ms: undefined,
        };
        return virtualBay;
      })()
    : null;

  const currentBay = isMoveMode ? (activeOwnedBay || fallbackMoveBay || nextReservedOwnedBay) : null;

  const isLessonOnlyBay = useCallback((bay: Bay): boolean => {
    return Boolean(
      bay.is_lesson_only ||
      (bay.config_json ? (() => { try { return Boolean(JSON.parse(bay.config_json).is_lesson_only); } catch { return false; } })() : false)
    );
  }, []);

  // minutes_left 정밀 파싱 및 end_time/epoch SSOT fallback 계산
  const calculateRemMin = useCallback((bay: Bay | null | undefined): number => {
    if (!bay) return 0;
    const st = String(bay.status_info?.code || bay.status || '').toUpperCase();
    if (['CHK', 'RSV', 'CONFIRMED', 'RESERVED', 'QUEUE', 'QUEUED', 'WAIT', 'REQ'].includes(st)) {
      const explicitMin = Number(bay.duration_min || bay.minutes_left || 0);
      if (explicitMin > 0) return explicitMin;
    }
    return TimeMaster.getRemainingMinutes(bay);
  }, []);

  const currentBayStatus = String(currentBay?.status_info?.code || currentBay?.status || '').toUpperCase();
  const isReservedNotStarted = ['CHK', 'RSV', 'CONFIRMED', 'RESERVED', 'QUEUE', 'QUEUED', 'WAIT', 'REQ'].includes(currentBayStatus);
  const currentRemMin = calculateRemMin(currentBay);
  const isGlobalPaused = Boolean(
    bays.some(b => Boolean(b.is_global_paused) || String(b.pause_type || '').toUpperCase() === 'GLOBAL')
  );
  const isTimeRestricted = Boolean(
    isMoveMode &&
    currentBay &&
    !isReservedNotStarted &&
    (currentBay.status_info?.is_transferable === false || currentRemMin < 5)
  );
  const hasNoActiveBay = isMoveMode && !currentBay;

  // 컴포넌트 마운트 시 최신 타석 정보 강제 갱신
  useEffect(() => {
    onRefreshBays();
  }, [onRefreshBays]);

  // 선점 수동 해제 (useCallback 가딩)
  const handleRelease = useCallback(async () => {
    if (selectedBayNo !== null) {
      await api.releaseBay(selectedBayNo);
      setSelectedBayNo(null);
      onRefreshBays();
    }
  }, [selectedBayNo, onRefreshBays]);

  const isConfirmedRef = useRef(false);
  const selectedBayNoRef = useRef<number | null>(selectedBayNo);

  useEffect(() => {
    selectedBayNoRef.current = selectedBayNo;
  }, [selectedBayNo]);

  // 선점 락 제한시간 1초 간격 갱신
  useEffect(() => {
    if (selectedBayNo === null || isConfirmedRef.current) return;
    
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (isConfirmedRef.current) {
          clearInterval(timer);
          return prev;
        }
        if (prev <= 1) {
          // 선점 시간 초과 -> 자동 락 해제
          handleRelease();
          setErrorMsg(lang === 'KO' ? '선점 유효 시간이 초과되어 타석 선택이 자동 취소되었습니다.' : 'Pre-occupation lock expired.');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedBayNo, handleRelease, lang]);

  // 컴포넌트 실제 언마운트 시에만 미확정 선점 타석 자동 해제 Cleanup Guard
  useEffect(() => {
    return () => {
      if (selectedBayNoRef.current !== null && !isConfirmedRef.current) {
        api.releaseBay(selectedBayNoRef.current).catch(err => console.error('TeeboxMap cleanup release failed:', err));
      }
    };
  }, []);

  // 타석 터치 - 원자적 선점(Pre-emption) 락 시도 (useCallback 가딩)
  const handleBayTouch = useCallback(async (bay: Bay) => {
    if (isLockingRef.current || preoccupyLoading) return;
    if (isTimeRestricted || hasNoActiveBay || isGlobalPaused) return;

    // [BUG-V04] 본인 현재/예정 타석 선택 차단
    if (isMoveMode && currentBay && Number(bay.bay_no) === Number(currentBay.bay_no)) {
      setErrorMsg(lang === 'KO' ? '현재 배정되어 있는 본인 타석으로는 이동할 수 없습니다.' : 'Cannot move to your current teebox.');
      return;
    }

    // [BUG-V04] 레슨 전용 타석 일반 선택 차단
    if (isLessonOnlyBay(bay)) {
      setErrorMsg(lang === 'KO' ? '레슨 전용 타석으로는 일반 셀프 이동 및 배정을 할 수 없습니다.' : 'Lesson-only teebox cannot be selected.');
      return;
    }

    const hwState = evaluateBayHardwareState(bay);
    if (hwState.isBlocked) {
      setErrorMsg(
        hwState.isBallEmpty
          ? (lang === 'KO' ? `${bay.bay_no}번 타석은 볼 공급 부족(볼박스 비었음) 상태로 이동 및 배정할 수 없습니다.` : 'Cannot select teebox due to ball shortage.')
          : (lang === 'KO' ? `${bay.bay_no}번 타석은 기기 점검/오류 상태로 이동 및 배정할 수 없습니다.` : 'Cannot select teebox under maintenance.')
      );
      return;
    }

    const canonicalStatus = String(bay.status_info?.code || bay.status || '').toUpperCase();
    const isBlocked =
      bay.is_active === false ||
      bay.is_paused === true ||
      bay.is_global_paused === true ||
      ['UNDER_MAINTENANCE', 'MAINTENANCE', 'REPAIR', 'ERROR', 'DISABLED', 'OFFLINE', 'FAULT', 'OUT_OF_SERVICE', 'HOLD', 'BUFFER', 'RESERVED'].includes(canonicalStatus);
    if (isBlocked) return;
    if (['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(canonicalStatus)) {
      if (isMoveMode) {
        setErrorMsg(lang === 'KO' ? '이용 중인 타석으로는 즉시 이동할 수 없습니다. 빈 타석을 선택해 주세요.' : 'Cannot move to an occupied teebox. Please select an available teebox.');
      }
      return;
    }
    if (canonicalStatus === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId()) {
      setErrorMsg(lang === 'KO' ? '이미 다른 고객님께서 선택 중인 타석입니다.' : 'Teebox selected by another user.');
      return;
    }

    isLockingRef.current = true;
    try {
      // 동일 타석 재터치 시 선택 해제
      if (selectedBayNo === bay.bay_no) {
        await handleRelease();
        return;
      }

      // 기존에 선택했던 타석이 있었다면 해제
      if (selectedBayNo !== null) {
        await api.releaseBay(selectedBayNo);
      }

      isConfirmedRef.current = false;
      setErrorMsg('');
      setPreoccupyLoading(true);

      try {
        const success = await api.preoccupyBay(bay.bay_no);
        if (success) {
          setSelectedBayNo(bay.bay_no);
        } else {
          setErrorMsg(lang === 'KO' ? '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.' : 'This teebox is already being selected by another customer. Please choose another teebox.');
        }
      } catch {
        setErrorMsg(lang === 'KO' ? '이미 다른 고객님이 선택 중인 타석입니다. 다른 타석을 선택해 주세요.' : 'This teebox is already being selected by another customer. Please choose another teebox.');
      } finally {
        setPreoccupyLoading(false);
        onRefreshBays(); // 즉시 상태 갱신
      }
    } finally {
      isLockingRef.current = false;
    }
  }, [isTimeRestricted, hasNoActiveBay, isGlobalPaused, isMoveMode, currentBay, preoccupyLoading, selectedBayNo, onRefreshBays, lang, handleRelease]);

  // 배정 최종 확인 버튼 클릭 (useCallback 가딩)
  const handleConfirm = useCallback(async () => {
    if (selectedBayNo !== null && !isConfirmedRef.current && !isLockingRef.current) {
      isConfirmedRef.current = true;
      try {
        await onBaySelected(selectedBayNo, currentBay?.bay_no);
      } catch (err) {
        isConfirmedRef.current = false;
        throw err;
      }
    }
  }, [selectedBayNo, onBaySelected, currentBay?.bay_no]);

  const getBayFloorNo = (b: Bay): number => {
    if (b.floor_no && !isNaN(b.floor_no)) return b.floor_no;
    if (b.floor) {
      const parsed = parseInt(String(b.floor).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 1;
  };

  // 🔄 [구역 카테고리 동적 격리] 명시적 매칭 구역(selectedZoneIds)이 있으면 최우선 반영(ROOM 등 포함), 미지정 시 기본 연습타석(PAR3/ROOM 제외) 표출 및 타석 번호 오름차순 정렬
  const floorBays = sortBaysByNumber(
    bays.filter(b => {
      const zCode = String(b.zone_code || b.zoneCode || '');
      if (zCode.toUpperCase() === 'PAR3') return false;

      if (selectedZoneIds && selectedZoneIds.length > 0) {
        const match = selectedZoneIds.some(zid => 
          String(zid).toUpperCase() === zCode.toUpperCase() || 
          String(zid).toUpperCase() === String(b.category_id || '').toUpperCase()
        );
        if (!match) return false;
      } else if (zCode.toUpperCase() === 'ROOM') {
        return false;
      }

      return getBayFloorNo(b) === activeFloor;
    })
  );

  const availableFloors = Array.from(
    new Set(
      bays
        .filter(b => String(b.zone_code || b.zoneCode || '').toUpperCase() !== 'PAR3')
        .map(b => getBayFloorNo(b))
    )
  ).sort((a, b) => a - b);
  const floorTabs = availableFloors.length > 0 ? availableFloors : [1];

  // [BUG-V07] 현재 이용 중인 타석 층으로 초기 탭 자동 포커싱 및 유효 층 동기화
  useEffect(() => {
    const currentFloor = currentBay ? getBayFloorNo(currentBay) : null;
    if (isMoveMode && currentFloor && !hasAutoFocusedFloorRef.current) {
      if (floorTabs.includes(currentFloor)) {
        setActiveFloor(currentFloor);
        hasAutoFocusedFloorRef.current = true;
        return;
      }
    }
    if (floorTabs.length > 0 && !floorTabs.includes(activeFloor)) {
      setActiveFloor(floorTabs[0]);
    }
  }, [isMoveMode, currentBay, floorTabs, activeFloor]);

  return (
    <div 
      onClickCapture={() => {
        if (feedbackCountdown !== null && onCancelCountdown) {
          onCancelCountdown();
        }
      }}
      style={{
        width: '100%',
        maxWidth: '1020px',
        margin: '15px auto 120px auto',
        padding: '36px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        background: '#ffffff',
        borderRadius: '32px',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.1)',
        color: '#1d1d1f'
      }}
    >
      {/* 타석 맵 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '20px',
              background: '#0071e3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0, 113, 227, 0.35)'
            }}
          >
            {isMoveMode ? (
              <ArrowLeftRight size={30} style={{ color: '#ffffff' }} strokeWidth={2.5} />
            ) : (
              <Compass size={30} style={{ color: '#ffffff' }} strokeWidth={2.5} />
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.8px' }}>
              {isMoveMode ? (lang === 'KO' ? '타석 이동' : 'Move Teebox') : (lang === 'KO' ? '이용하실 타석 선택' : 'Select Practice Teebox')}
            </h2>
            {memberName && (
              <p style={{ fontSize: '21px', color: '#4b5563', margin: '4px 0 0 0', fontWeight: 600 }}>
                <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName}</strong> {isMoveMode ? (lang === 'KO' ? '님의 이용 중인 타석' : '— Active Teebox') : '님'}
              </p>
            )}
          </div>
        </div>

        {/* 우측 컨트롤 (미보유 시 돌아가기 버튼, 정상 시 층별 탭 전환 스위치) */}
        {isMoveMode && hasNoActiveBay ? (
          <button
            onClick={onCancel}
            style={{
              background: '#f5f5f7',
              border: 'none',
              color: '#1d1d1f',
              padding: '14px 28px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '17px',
              fontWeight: 700,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#e8e8ed'}
            onMouseOut={(e) => e.currentTarget.style.background = '#f5f5f7'}
          >
            {lang === 'KO' ? '이전으로 돌아가기' : 'Go Back'}
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              padding: '6px',
              borderRadius: '20px',
              background: '#f1f5f9',
              border: '1.5px solid #e2e8f0',
              gap: '8px',
              boxShadow: 'inset 0 2px 4px rgba(15, 23, 42, 0.04)',
            }}
          >
            {floorTabs.map(f => {
              const isFloorActive = activeFloor === f;

              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFloor(f)}
                  style={{
                    height: '56px',
                    minWidth: '124px',
                    padding: '0 24px',
                    fontSize: '22px',
                    fontWeight: 900,
                    borderRadius: '14px',
                    border: isFloorActive ? '2px solid #0f172a' : '1.5px solid #cbd5e1',
                    cursor: 'pointer',
                    color: isFloorActive ? '#ffffff' : '#334155',
                    background: isFloorActive
                      ? 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)'
                      : '#ffffff',
                    boxShadow: isFloorActive
                      ? '0 8px 20px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
                      : '0 2px 6px rgba(15, 23, 42, 0.05)',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    whiteSpace: 'nowrap',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {isFloorActive && (
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 10px #10b981',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{formatFloorDisplayLabel(f)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 🛡️ 타석 미보유 회원 전용 Full-Width Empty State 안내 뷰 */}
      {isMoveMode && hasNoActiveBay ? (
        <div style={{
          padding: '64px 40px',
          borderRadius: '24px',
          background: '#fbfbfd',
          border: '1px solid #e5e5ea',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '24px',
          minHeight: '440px'
        }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            background: 'rgba(234, 88, 12, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(234, 88, 12, 0.25)',
            boxShadow: '0 8px 24px rgba(234, 88, 12, 0.15)'
          }}>
            <ArrowLeftRight size={48} color="#ea580c" strokeWidth={2.4} />
          </div>

          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
              {lang === 'KO' ? '현재 이용 중인 타석이 없습니다' : 'No Active Teebox Found'}
            </h3>
            <p style={{ fontSize: '23px', color: '#1f2937', lineHeight: 1.75, margin: 0, fontWeight: 600, maxWidth: '720px' }}>
              {lang === 'KO' ? (
                <>
                  <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName || '고객'}</strong> 회원님 명의로 점유 중인 타석을 찾을 수 없습니다.<br/>
                  무인 키오스크의 <strong style={{ color: '#0071e3' }}>[타석 이동]</strong>은 현재 연습 중인 타석의 위치를 변경하는 메뉴입니다.<br/>
                  새로운 타석을 배정받으시려면 <strong style={{ color: '#059669', textDecoration: 'underline' }}>[연습타석 배정]</strong> 메뉴를 이용해 주세요.
                </>
              ) : (
                <>
                  <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName || 'Customer'}</strong> does not have an active teebox at this store.<br/>
                  <strong style={{ color: '#0071e3' }}>[Move Teebox]</strong> is only for changing your currently occupied practice spot.<br/>
                  To get a new teebox, please use the <strong style={{ color: '#059669', textDecoration: 'underline' }}>[Practice Teebox]</strong> menu.
                </>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
            {onGoPractice && (
              <button
                onClick={onGoPractice}
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  padding: '20px 44px',
                  borderRadius: '999px',
                  fontSize: '22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 8px 24px rgba(5, 150, 105, 0.25)',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <span style={{ fontSize: '24px' }}>⛳</span>
                <span>{lang === 'KO' ? '연습타석 배정하기' : 'Assign Practice Teebox'}</span>
              </button>
            )}
            <button
              onClick={onCancel}
              style={{
                background: '#1d1d1f',
                color: '#ffffff',
                border: 'none',
                padding: '20px 44px',
                borderRadius: '999px',
                fontSize: '22px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <span style={{ fontSize: '24px' }}>🏠</span>
              <span>{lang === 'KO' ? '메인 화면으로 돌아가기' : 'Return to Main Dashboard'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 타석 이동(MOVE_BAY) 전용 오버레이 헤더 패널 */}
          {isMoveMode && (
            <>
              {isGlobalPaused ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1.5px solid #fecaca',
                    borderRadius: '20px',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShieldAlert size={26} style={{ color: '#dc2626' }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '19px', fontWeight: 900, color: '#991b1b', margin: 0 }}>
                        ⏸️ 매장 볼회수(전체 일시정지) 중 타석 {isMoveMode ? '이동' : '배정'} 제한
                      </h3>
                      <p style={{ fontSize: '14px', color: '#b91c1c', margin: '4px 0 0 0', fontWeight: 600 }}>
                        현재 매장 볼회수(전체 일시정지)가 진행 중입니다. 볼회수 종료 후 타석 {isMoveMode ? '이동' : '배정'}을 이용해 주세요.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onCancel}
                    style={{
                      padding: '12px 22px',
                      borderRadius: '999px',
                      background: '#1d1d1f',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    메인으로 복귀
                  </button>
                </div>
              ) : isTimeRestricted ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1.5px solid #fecaca',
                    borderRadius: '20px',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShieldAlert size={26} style={{ color: '#dc2626' }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '19px', fontWeight: 900, color: '#991b1b', margin: 0 }}>
                        ⏱️ 타석 이동 불가 (잔여시간 5분 미만)
                      </h3>
                      <p style={{ fontSize: '14px', color: '#b91c1c', margin: '4px 0 0 0', fontWeight: 600 }}>
                        현재 이용 중인 <strong>{currentBay?.bay_no}번 타석</strong>의 남은 시간이 5분 미만(<strong>{currentRemMin}분 남음</strong>)이므로 자리 이동이 제한됩니다.
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: '#dc2626',
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      padding: '8px 16px',
                      borderRadius: '999px'
                    }}
                  >
                    이용 종료 임박
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    background: '#f5f5f7',
                    border: '1.5px solid #e5e5ea',
                    borderRadius: '24px',
                    padding: '24px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div
                      style={{
                        background: '#ffffff',
                        width: '64px',
                        height: '64px',
                        borderRadius: '20px',
                        border: '1.5px solid #e5e5ea',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                      }}
                    >
                      <ArrowLeftRight size={32} style={{ color: '#059669' }} />
                    </div>
                    <div style={{ minWidth: 0, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 800,
                            background: isReservedNotStarted ? '#fef3c7' : '#d1fae5',
                            color: isReservedNotStarted ? '#92400e' : '#065f46',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          {isReservedNotStarted ? '사전체크인/예약 대기 중' : '현재 이용 중'}
                        </span>
                        <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {currentBay?.bay_no}번 타석
                        </h3>
                        {selectedBayNo !== null && (
                          <>
                            <span style={{ fontSize: '22px', color: '#86868b', fontWeight: 900, flexShrink: 0 }}>➔</span>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: 800,
                                background: '#1d1d1f',
                                color: '#ffffff',
                                padding: '4px 12px',
                                borderRadius: '999px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                              }}
                            >
                              이동 대상
                            </span>
                            <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#059669', margin: 0, letterSpacing: '-0.5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {selectedBayNo}번 타석
                            </h3>
                          </>
                        )}
                      </div>
                      <p style={{ fontSize: '17px', color: '#374151', margin: '6px 0 0 0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        회원명: <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName}</strong> | {isReservedNotStarted ? '예정 이용 시간: ' : '이용 잔여 시간: '}
                        <strong style={{ color: '#059669', fontWeight: 800 }}>{currentRemMin}분</strong> {currentBay?.end_time ? `(${formatEndTime(currentBay.end_time)} 종료)` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '17px', color: '#059669', fontWeight: 800 }}>잔여시간 100% 보전 (상품 호환)</div>
                    <div style={{ fontSize: '16px', color: selectedBayNo !== null ? '#1d1d1f' : '#6b7280', marginTop: '6px', fontWeight: selectedBayNo !== null ? 700 : 600 }}>
                      {selectedBayNo !== null
                        ? `하단 [${isMoveMode ? '타석 이동 확정' : '선택 완료'}] 버튼을 누르면 즉시 이동됩니다.`
                        : '이동을 원하시는 빈 타석 카드를 선택해 주세요.'}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

      {/* ⏱ 5초 배정 완료 확인 안내 피드백 바 */}
      {feedbackCountdown !== undefined && feedbackCountdown !== null && (
        <div style={{
          width: '100%',
          background: '#ecfdf5',
          borderRadius: '18px',
          padding: '16px 24px',
          border: '1.5px solid #a7f3d0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#065f46'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>✨</span>
            <div>
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#065f46', display: 'block' }}>
                {lang === 'KO' ? `${justAllocatedBayNo}번 타석 배정이 성공적으로 완료되었습니다!` : `Bay ${justAllocatedBayNo} Allocation Confirmed!`}
              </span>
              <span style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>
                {lang === 'KO' ? '타석 타일에서 이용 중 상태를 확인하세요.' : 'Check active status on the tile below.'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>
              ⏱ {feedbackCountdown}초 후 메인으로
            </span>
            <button
              onClick={onCancel}
              style={{
                padding: '9px 18px',
                borderRadius: '999px',
                background: '#1d1d1f',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {lang === 'KO' ? '지금 메인으로' : 'Go Home Now'}
            </button>
          </div>
        </div>
      )}

      {/* 에러 또는 주의 알림 */}
      {errorMsg && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            padding: '12px 18px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <ShieldAlert size={20} style={{ color: '#dc2626' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#991b1b' }}>{errorMsg}</span>
        </div>
      )}

      {/* 상태 안내 범례 및 층별 장비 스펙 통합 바 */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: '#f5f5f7', 
          padding: '14px 20px', 
          borderRadius: '16px',
          border: '1px solid #e5e5ea' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#ffffff', border: '1.5px solid rgba(0,0,0,0.15)' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1d1d1f' }}>이용 가능</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#f4f4f6', border: '1px solid #d1d5db' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#515154' }}>이용 중 (잔여시간)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#ecfdf5', border: '2px solid #059669' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#047857' }}>현재 내 타석</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#047857', border: '2px solid #10b981' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#064e3b' }}>선택 완료</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#fee2e2', border: '1px solid #fecaca' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>점검/고장</span>
          </div>
        </div>

        <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 600 }}>
          ⛳ 층별 장비 스펙:{' '}
          <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>
            {(() => {
              if (!floorBays || floorBays.length === 0) return `${activeFloor}층 타석 정보 없음`;
              const minBay = Math.min(...floorBays.map((b) => b.bay_no));
              const maxBay = Math.max(...floorBays.map((b) => b.bay_no));
              const availCnt = floorBays.filter((b) => {
                const st = String(b.status_info?.code || b.status || '').toUpperCase();
                return st === 'AVAILABLE' && b.is_active !== false && !isLessonOnlyBay(b) && !evaluateBayHardwareState(b).isBlocked;
              }).length;
              const sims = Array.from(
                new Set(
                  floorBays
                    .map((b) => {
                      const st = b.simulator_type || (b.config_json ? (() => { try { return JSON.parse(b.config_json).simulator_type; } catch { return null; } })() : null);
                      if (!st || st === 'NONE') return null;
                      return st === 'GDR_PLUS' ? 'GDR+' : st === 'KAKAO_VX' ? 'Kakao VX' : st;
                    })
                    .filter(Boolean)
                )
              );
              const simLabel = sims.length > 0 ? sims.join(' / ') : '타석 센서';
              return `${activeFloor}층 ${simLabel} (${minBay}~${maxBay}번 · 빈 타석 ${availCnt}석)`;
            })()}
          </strong>
        </span>
      </div>


      {/* 실시간 타석 배치도 그리드 (TeeboxTileCard SSOT 100% 통합) */}
      <div 
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "16px",
          background: "#f5f5f7",
          padding: "20px",
          borderRadius: "20px",
          border: "1px solid #e5e5ea",
          minHeight: "340px"
        }}
      >
        {floorBays.length === 0 ? (
          <div style={{ gridColumn: "span 5", display: "flex", justifyContent: "center", alignItems: "center", height: "240px", color: "#9ca3af", fontSize: "18px", fontWeight: 700 }}>
            {lang === "KO" ? `${activeFloor}층에 가용한 타석 정보가 없습니다.` : `No teebox information available on floor ${activeFloor}.`}
          </div>
        ) : (
          floorBays.map((bay) => {
            const isSelected = selectedBayNo === bay.bay_no;
            const isCurrentMyBay = Boolean(isMoveMode && currentBay && Number(currentBay.bay_no) === Number(bay.bay_no));

            return (
              <TeeboxTileCard
                key={bay.bay_no}
                bay={bay}
                isSelected={isSelected}
                isCurrentMyBay={isCurrentMyBay}
                isMoveMode={isMoveMode}
                lang={lang}
                onSelect={(bayNo) => {
                  const target = floorBays.find((b) => b.bay_no === bayNo);
                  if (target) handleBayTouch(target);
                }}
              />
            );
          })
        )}
      </div>

      {/* 하단 최종 조작 액션 바 */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderTop: '1px solid #e5e5ea', 
          paddingTop: '20px' 
        }}
      >
        <div>
          {isMoveMode && currentBay && selectedBayNo !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  background: '#f5f5f7',
                  border: '1.5px solid #e5e5ea',
                  borderRadius: '20px',
                  padding: '16px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 700 }}>이전 타석</span>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f' }}>{currentBay.bay_no}번</span>
                </div>
                <ArrowLeftRight size={26} style={{ color: '#059669' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#059669', fontWeight: 700 }}>이동할 타석</span>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#059669' }}>{selectedBayNo}번</span>
                </div>
                <div style={{ width: '1px', height: '36px', background: '#e5e5ea', margin: '0 6px' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '17px', color: '#1d1d1f', fontWeight: 800 }}>남은 {currentRemMin}분 100% 보전</span>
                  <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>선점 락: {countdown}초 남음</span>
                </div>
              </div>
            </div>
          ) : selectedBayNo !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  background: '#f5f5f7', 
                  border: '1.5px solid #e5e5ea', 
                  padding: '14px 24px', 
                  borderRadius: '16px', 
                  fontSize: '19px', 
                  fontWeight: 800,
                  color: '#1d1d1f',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Check size={22} style={{ color: '#059669' }} />
                <span>선택된 타석: <strong style={{ color: '#059669', fontSize: '24px' }}>{selectedBayNo}</strong>번</span>
              </div>
              <span style={{ fontSize: '16px', color: '#86868b', fontWeight: 700 }}>
                (배정 대기 시간: {countdown}초 남음)
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '18px', color: (isTimeRestricted || isGlobalPaused) ? '#dc2626' : '#6b7280', fontWeight: 700 }}>
              {isMoveMode 
                ? isGlobalPaused
                  ? '⏸️ 매장 볼회수(전체 일시정지) 중에는 타석 이동이 제한됩니다.'
                  : isTimeRestricted 
                  ? '⏱️ 이용 종료 임박(5분 미만)으로 자리 이동이 불가능합니다.' 
                  : hasNoActiveBay 
                  ? '현재 이용 중인 타석이 없습니다.' 
                  : '이동하실 목적지 빈 타석을 선택해 주세요.'
                : '배정하실 타석 카드를 터치하여 선택해 주세요.'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '14px' }}>
          <button
            onClick={handleConfirm}
            disabled={selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused}
            style={{ 
              padding: '0 44px',
              height: '68px', 
              borderRadius: '999px', 
              fontSize: '22px', 
              fontWeight: 800,
              border: 'none',
              background: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? '#e5e5ea' : '#1d1d1f',
              color: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? '#86868b' : '#ffffff',
              boxShadow: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.16)',
              cursor: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {preoccupyLoading ? '선점 처리 중...' : isMoveMode ? '타석 이동 확정' : '선택 완료'}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
