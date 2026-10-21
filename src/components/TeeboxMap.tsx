import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeftRight, Check, Compass, Layers, ShieldAlert, Timer } from 'lucide-react';
import { api, Bay, Member } from '../services/api';
import { TeeboxTileCard } from './TeeboxTileCard';
import { TimeMaster } from '../utils/timeMaster';

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
  bays: Bay[];
  onRefreshBays: () => void;
  selectedZoneIds?: (string | number)[];
}

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
        RSV: 4,
        RESERVED: 4,
      };
      const practiceReservations = resList
        .filter((r: any) => {
          const st = String(r.status_cd || '').toUpperCase();
          if (!(st in statusPriority)) return false;
          const facType = String(r.facility_type || r.resource_type || 'BAY').toUpperCase();
          if (facType !== 'BAY') return false;
          const catId = String(r.category_id || '').toUpperCase();
          if (['PAR3', 'SCREEN', 'ROOM'].includes(catId)) return false;
          const bNo = Number(r.bay_no ?? r.resource_no ?? 0);
          return bNo > 0 && bNo < 1000;
        })
        .sort((a: any, b: any) => {
          const pa = statusPriority[String(a.status_cd || '').toUpperCase()] ?? 99;
          const pb = statusPriority[String(b.status_cd || '').toUpperCase()] ?? 99;
          return pa - pb;
        });

      const activeRes = practiceReservations[0];
      if (activeRes && activeRes.bay_no) {
        const matchedBay = bays.find(b => Number(b.bay_no) === Number(activeRes.bay_no));
        const physStatus = String((matchedBay as any)?.status_info?.code || matchedBay?.status || '').toUpperCase();
        const physMemNo = String((matchedBay as any)?.current_member_no || matchedBay?.member_no || '').trim();
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
          const durMin = Number((activeRes as any).duration_min ?? fallbackMin) || fallbackMin;
          setFallbackMoveBay({
            bay_no: Number(activeRes.bay_no),
            floor_no: matchedBay?.floor_no || 1,
            status: resStatus as any,
            current_member_no: effMemberNo,
            current_user_name: effMemberName,
            member_name: effMemberName,
            minutes_left: durMin,
            duration_min: durMin,
            start_time: activeRes.start_time || '',
            end_time: activeRes.end_time || '',
            res_id: activeRes.res_id,
          } as any);
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
        const st = String((b as any).status_info?.code || b.status || '').toUpperCase();
        if (!['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(st)) return false;

        const bayMemberNo = String((b as any).current_member_no || (b as any).member_no || '').trim();
        if (bayMemberNo !== '') {
          return Boolean(effMemberNo && bayMemberNo === String(effMemberNo).trim());
        }
        if (effMemberNo && String(b.current_user_name || '').trim() === String(effMemberNo).trim()) {
          return true;
        }
        const bayUserName = String((b as any).member_name || b.current_user_name || '').trim();
        return effMemberName !== '' && bayUserName === effMemberName;
      })
    : null;

  // 2순위: 차기 예약(next_res)으로 대기 중인 타석 (앞사람 타석 잔여시간 오염 방지를 위해 CHK 가상 상태로 래핑)
  const nextReservedOwnedBay = isMoveMode && !activeOwnedBay && !fallbackMoveBay
    ? (() => {
        const found = bays.find(b => {
          const nextCheckinSt = String((b as any).next_res_checkin_status || '').toUpperCase();
          if (!['CHK', 'RSV', 'COMPLETED', 'PENDING', 'REQUESTED'].includes(nextCheckinSt)) return false;
          const nextMemNo = String((b as any).next_res_member_no || '').trim();
          if (nextMemNo !== '') {
            return Boolean(effMemberNo && nextMemNo === String(effMemberNo).trim());
          }
          const nextResName = String((b as any).next_res_name || '').trim();
          return effMemberName !== '' && nextResName === effMemberName;
        });
        if (!found) return null;
        const fallbackMin = Number(found.minutes_left ?? 0);
        const durMin = Number((found as any).next_res_duration_min ?? fallbackMin) || fallbackMin;
        return {
          ...found,
          status: 'CHK' as any,
          status_info: { code: 'CHK', is_transferable: true },
          current_member_no: effMemberNo,
          current_user_name: effMemberName,
          member_name: effMemberName,
          minutes_left: durMin,
          duration_min: durMin,
          end_time: (found as any).next_res_end_time || '',
          end_epoch_ms: undefined,
        } as Bay;
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
    const st = String((bay as any)?.status_info?.code || bay.status || '').toUpperCase();
    if (['CHK', 'RSV', 'RESERVED'].includes(st)) {
      const explicitMin = Number((bay as any).duration_min || bay.minutes_left || 0);
      if (explicitMin > 0) return explicitMin;
    }
    return TimeMaster.getRemainingMinutes(bay);
  }, []);

  const currentBayStatus = String((currentBay as any)?.status_info?.code || currentBay?.status || '').toUpperCase();
  const isReservedNotStarted = ['CHK', 'RSV', 'RESERVED'].includes(currentBayStatus);
  const currentRemMin = calculateRemMin(currentBay);
  const isGlobalPaused = Boolean(
    bays.some(b => Boolean((b as any).is_global_paused) || String((b as any).pause_type || '').toUpperCase() === 'GLOBAL')
  );
  const isTimeRestricted = Boolean(
    isMoveMode &&
    currentBay &&
    !isReservedNotStarted &&
    ((currentBay as any).status_info?.is_transferable === false || currentRemMin < 5)
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

    const canonicalStatus = String((bay as any).status_info?.code || bay.status || '').toUpperCase();
    const isBlocked =
      (bay as any).is_active === false ||
      (bay as any).is_paused === true ||
      (bay as any).is_global_paused === true ||
      ['UNDER_MAINTENANCE', 'MAINTENANCE', 'REPAIR', 'ERROR', 'DISABLED', 'OFFLINE', 'FAULT', 'OUT_OF_SERVICE', 'HOLD', 'BUFFER', 'RESERVED'].includes(canonicalStatus);
    if (isBlocked) return;
    if (['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(canonicalStatus)) return;
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

  // 🔄 [구역 카테고리 동적 격리] 명시적 매칭 구역(selectedZoneIds)이 있으면 최우선 반영(ROOM 등 포함), 미지정 시 기본 연습타석(PAR3/ROOM 제외) 표출
  const floorBays = bays.filter(b => {
    const zCode = String((b as any).zone_code || (b as any).zoneCode || '');
    if (zCode.toUpperCase() === 'PAR3') return false;

    if (selectedZoneIds && selectedZoneIds.length > 0) {
      const match = selectedZoneIds.some(zid => 
        String(zid).toUpperCase() === zCode.toUpperCase() || 
        String(zid).toUpperCase() === String((b as any).category_id || '').toUpperCase()
      );
      if (!match) return false;
    } else if (zCode.toUpperCase() === 'ROOM') {
      return false;
    }

    return b.floor_no === activeFloor;
  });

  const availableFloors = Array.from(
    new Set(
      bays
        .filter(b => String((b as any).zone_code || (b as any).zoneCode || '').toUpperCase() !== 'PAR3')
        .map(b => b.floor_no || 1)
    )
  ).sort((a, b) => a - b);
  const floorTabs = availableFloors.length > 0 ? availableFloors : [1];

  // [BUG-V07] 현재 이용 중인 타석 층으로 초기 탭 자동 포커싱 및 유효 층 동기화
  useEffect(() => {
    if (isMoveMode && currentBay?.floor_no && !hasAutoFocusedFloorRef.current) {
      if (floorTabs.includes(currentBay.floor_no)) {
        setActiveFloor(currentBay.floor_no);
        hasAutoFocusedFloorRef.current = true;
        return;
      }
    }
    if (floorTabs.length > 0 && !floorTabs.includes(activeFloor)) {
      setActiveFloor(floorTabs[0]);
    }
  }, [isMoveMode, currentBay?.floor_no, floorTabs, activeFloor]);

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
              width: '54px',
              height: '54px',
              borderRadius: '18px',
              background: '#f5f5f7',
              border: '1px solid #e5e5ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isMoveMode ? (
              <ArrowLeftRight size={28} style={{ color: '#1d1d1f' }} />
            ) : (
              <Compass size={28} style={{ color: '#1d1d1f' }} />
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.8px' }}>
              {isMoveMode ? '이동하실 타석 선택' : '이용하실 타석 선택'}
            </h2>
            {memberName && (
              <p style={{ fontSize: '15px', color: '#86868b', margin: '4px 0 0 0', fontWeight: 600 }}>
                회원명: <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>{memberName}</strong> 님
              </p>
            )}
          </div>
        </div>

        {/* 층별 탭 전환 스위치 */}
        <div
          style={{
            display: 'flex',
            padding: '6px',
            borderRadius: '18px',
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            gap: '4px'
          }}
        >
          {floorTabs.map(f => (
            <button
              key={f}
              onClick={() => setActiveFloor(f)}
              style={{
                padding: '10px 24px',
                fontSize: '16px',
                fontWeight: 800,
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                color: activeFloor === f ? '#ffffff' : '#86868b',
                background: activeFloor === f ? '#1d1d1f' : 'transparent',
                boxShadow: activeFloor === f ? '0 4px 12px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Layers size={16} />
              {f}층 타석
            </button>
          ))}
        </div>
      </div>

      {/* 타석 이동(MOVE_BAY) 전용 오버레이 헤더 패널 */}
      {isMoveMode && (
        <>
          {hasNoActiveBay ? (
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
                    현재 이용 중인 타석 내역이 없습니다
                  </h3>
                  <p style={{ fontSize: '14px', color: '#b91c1c', margin: '4px 0 0 0', fontWeight: 600 }}>
                    <strong>{memberName || '고객'}</strong> 님 명의로 점유 중인 타석을 찾을 수 없습니다. [연습타석배정] 메뉴에서 신규 배정을 진행해 주세요.
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
          ) : isGlobalPaused ? (
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
                borderRadius: '22px',
                padding: '20px 26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '16px',
                    border: '1px solid #e5e5ea',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <ArrowLeftRight size={26} style={{ color: '#059669' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        background: isReservedNotStarted ? '#fef3c7' : '#d1fae5',
                        color: isReservedNotStarted ? '#92400e' : '#065f46',
                        padding: '4px 10px',
                        borderRadius: '999px'
                      }}
                    >
                      {isReservedNotStarted ? '사전체크인/예약 대기 중' : '현재 이용 중'}
                    </span>
                    <h3 style={{ fontSize: '23px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
                      {currentBay?.bay_no}번 타석
                    </h3>
                    {selectedBayNo !== null && (
                      <>
                        <span style={{ fontSize: '18px', color: '#86868b', fontWeight: 900 }}>➔</span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            background: '#1d1d1f',
                            color: '#ffffff',
                            padding: '4px 10px',
                            borderRadius: '999px'
                          }}
                        >
                          이동 대상
                        </span>
                        <h3 style={{ fontSize: '23px', fontWeight: 900, color: '#059669', margin: 0, letterSpacing: '-0.5px' }}>
                          {selectedBayNo}번 타석
                        </h3>
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: '14px', color: '#515154', margin: '6px 0 0 0', fontWeight: 600 }}>
                    회원명: <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>{memberName}</strong> | {isReservedNotStarted ? '예정 이용 시간: ' : '이용 잔여 시간: '}
                    <strong style={{ color: '#059669', fontWeight: 800 }}>{currentRemMin}분</strong> {currentBay?.end_time ? `(종료: ${currentBay.end_time})` : ''}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', color: '#059669', fontWeight: 800 }}>잔여시간 100% 보전 (상품 호환)</div>
                <div style={{ fontSize: '13px', color: '#86868b', marginTop: '4px', fontWeight: 600 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#354238' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1d1d1f' }}>이용 가능</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#d2d2d7' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#515154' }}>이용 중</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#34c759' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#1d4e33' }}>선택 완료</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: '#ff453a' }} />
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
                const st = String((b as any).status_info?.code || b.status || '').toUpperCase();
                return st === 'AVAILABLE' && (b as any).is_active !== false && !isLessonOnlyBay(b);
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
      `}</style>

      {/* 실시간 타석 배치도 그리드 (Data Density 최적화) */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '18px',
          background: '#f5f5f7',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid #e5e5ea',
          minHeight: '400px'
        }}
      >
        {floorBays.map((bay) => {
          const canonicalStatus = String((bay as any).status_info?.code || bay.status || '').toUpperCase();
          const isSelected = selectedBayNo === bay.bay_no;
          const isCurrentMyBay = Boolean(isMoveMode && currentBay && Number(currentBay.bay_no) === Number(bay.bay_no));
          const isLessonOnly = isLessonOnlyBay(bay);
          const isPreOccupiedByOther = canonicalStatus === 'PRE_OCCUPIED' && bay.lock_terminal_id !== api.getTerminalId();
          const isOccupied = ['OCCUPIED', 'USE', 'IN_USE', 'PREPARE'].includes(canonicalStatus) && !isCurrentMyBay;
          const isUnderMaintenance =
            !isCurrentMyBay &&
            ((bay as any).is_active === false ||
            ['UNDER_MAINTENANCE', 'MAINTENANCE', 'REPAIR', 'ERROR', 'DISABLED', 'OFFLINE', 'FAULT', 'OUT_OF_SERVICE', 'HOLD', 'BUFFER', 'RESERVED'].includes(canonicalStatus));
          const isAvailable = canonicalStatus === 'AVAILABLE' && !isUnderMaintenance && !isCurrentMyBay && !isLessonOnly;

          // 1. 헤더 영역 스타일 (30% 높이)
          let headerBg = '#e5e5ea';
          let headerTextColor = '#86868b';

          if (isCurrentMyBay) {
            headerBg = '#059669';
            headerTextColor = '#ffffff';
          } else if (isAvailable) {
            headerBg = '#354238';
            headerTextColor = '#ffffff';
          } else if (isSelected) {
            headerBg = '#34c759'; // 고대비 맑은 애플 그린 헤더 복원
            headerTextColor = '#121419'; // 진하고 선명한 검정 폰트
          } else if (isLessonOnly) {
            headerBg = '#7e22ce';
            headerTextColor = '#ffffff';
          } else if (isOccupied) {
            headerBg = '#d2d2d7';
            headerTextColor = '#515154';
          } else if (isPreOccupiedByOther) {
            headerBg = '#e5e5ea';
            headerTextColor = '#86868b';
          } else if (isUnderMaintenance) {
            headerBg = '#ff453a';
            headerTextColor = '#ffffff';
          }

          // 2. 바디/컨테이너 영역 스타일 (70% 높이)
          let containerBorder = '1px solid #dadce0';
          let containerBg = '#ffffff';
          let statusText = '이용가능';
          let statusColor = '#354238';
          let cursorStyle = 'pointer';
          let opacity = '1';
          let pointerEvents: React.CSSProperties['pointerEvents'] = 'auto';
          let transform = 'none';
          let zIndex = 1;
          let boxShadow = 'none';

          if (isCurrentMyBay) {
            containerBorder = '2.5px solid #059669';
            containerBg = '#ecfdf5';
            statusText = isReservedNotStarted ? '예정 내 타석' : '현재 내 타석';
            statusColor = '#047857';
            cursorStyle = 'not-allowed';
            boxShadow = '0 6px 18px rgba(5, 150, 105, 0.18)';
          } else if (isAvailable) {
            containerBorder = '1.5px solid #dadce0';
            containerBg = '#ffffff';
            statusText = '이용가능';
            statusColor = '#354238';
          } else if (isSelected) {
            containerBorder = '2.5px solid #354238';
            containerBg = '#ffffff'; // 밝은 화이트 배경 복원
            statusText = '선택 완료';
            statusColor = '#1d4e33'; // 포레스트 그린 텍스트
            
            // 3D 입체 플로팅 효과 극대화
            transform = 'scale(1.05) translateY(-6px)';
            zIndex = 10;
            boxShadow = '0 12px 30px rgba(53, 66, 56, 0.22)';
          } else if (isLessonOnly) {
            containerBorder = '1.5px solid #d8b4fe';
            containerBg = '#faf5ff';
            statusText = '레슨전용';
            statusColor = '#7e22ce';
            cursorStyle = 'not-allowed';
            opacity = '0.65';
          } else if (isOccupied) {
            containerBorder = '1px solid #dadce0';
            containerBg = '#eaeaea';
            statusText = '이용중';
            statusColor = '#515154';
            cursorStyle = 'not-allowed';
          } else if (isPreOccupiedByOther) {
            containerBorder = '1px solid #e5e5ea';
            containerBg = '#f5f5f7';
            statusText = '선택 중';
            statusColor = '#86868b';
            cursorStyle = 'not-allowed';
            opacity = '0.35';
            pointerEvents = 'none';
          } else if (isUnderMaintenance) {
            containerBorder = '1.5px solid #ff453a';
            containerBg = '#fff5f5';
            statusText = '점검중';
            statusColor = '#ff453a';
            cursorStyle = 'not-allowed';
            opacity = '0.5';
            pointerEvents = 'none';
          }

          return (
            <div 
              key={bay.bay_no}
              style={{ position: 'relative', zIndex: zIndex }}
            >
              {/* --- RIPPLE LASER WAVE EFFECT (2중 동심원 방출) --- */}
              {isSelected && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: '12px',
                    border: '2.5px solid #34c759',
                    animation: 'rippleWave 1.8s infinite linear',
                    pointerEvents: 'none',
                    zIndex: -1
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: '12px',
                    border: '2.5px solid #34c759',
                    animation: 'rippleWave 1.8s infinite linear',
                    animationDelay: '0.9s',
                    pointerEvents: 'none',
                    zIndex: -1
                  }} />
                </>
              )}

              {/* --- CARD MAIN BODY --- */}
              <div
                onClick={() => (isAvailable || isSelected || isCurrentMyBay || isLessonOnly) && handleBayTouch(bay)}
                style={{
                  height: '130px',
                  borderRadius: '12px',
                  border: containerBorder,
                  background: containerBg,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: cursorStyle,
                  transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
                  transform: transform,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: opacity,
                  pointerEvents: pointerEvents,
                  boxShadow: boxShadow
                }}
              >
                {/* --- HEADER SECTION (30%) --- */}
                <div
                  style={{
                    flexBasis: '30%',
                    background: headerBg,
                    color: headerTextColor,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                    {bay.bay_no.toString().padStart(2, '0')}
                  </span>

                  {bay.type === 'LEFT' && (
                    <span 
                      style={{ 
                        position: 'absolute', 
                        top: '4px', 
                        right: '6px', 
                        fontSize: '9px', 
                        fontWeight: 900, 
                        background: isSelected ? 'rgba(0, 0, 0, 0.08)' : isAvailable ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.05)', 
                        color: isSelected ? '#121419' : isAvailable ? '#ffffff' : '#86868b', 
                        padding: '1px 4px', 
                        borderRadius: '3px',
                        border: '0.5px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      좌타
                    </span>
                  )}
                </div>

                {/* --- BODY SECTION (70%) --- */}
                <div
                  style={{
                    flexBasis: '70%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '8px',
                    boxSizing: 'border-box',
                    gap: '6px'
                  }}
                >
                  {isCurrentMyBay ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', width: '100%' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: statusColor }}>
                        {statusText}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#065f46' }}>
                        {currentRemMin}분 보전
                      </span>
                    </div>
                  ) : isOccupied ? (
                    (() => {
                      const remMin = TimeMaster.getRemainingMinutes(bay);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#515154', fontSize: '16px', fontWeight: 800 }}>
                            <Timer size={14} style={{ color: '#515154' }} />
                            <span>{remMin}분 남음</span>
                          </div>
                          <div style={{ width: '85%', height: '4px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                width: `${Math.min(100, (remMin / 60) * 100)}%`, 
                                height: '100%', 
                                backgroundColor: '#515154',
                                transition: 'width 0.5s ease'
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <span style={{ fontSize: '16px', fontWeight: 800, color: statusColor, letterSpacing: '-0.3px' }}>
                      {statusText}
                    </span>
                  )}

                  {isSelected && (
                    <span 
                      style={{ 
                        fontSize: '12px', 
                        fontWeight: 700, 
                        color: '#ff453a', 
                        marginTop: '-2px',
                        opacity: 0.9,
                        animation: 'softBlink 1s infinite alternate'
                      }}
                    >
                      {countdown}초 남음
                    </span>
                  )}

                  {/* 스펙 뱃지 바 (GDR+, VX, 좌타, 레슨전용 등) */}
                  {(() => {
                    const simType = bay.simulator_type || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).simulator_type; } catch { return null; } })() : null);
                    const handed = bay.handedness || bay.type || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).handedness; } catch { return null; } })() : null);
                    const lessonOnly = bay.is_lesson_only || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).is_lesson_only; } catch { return false; } })() : false);
                    const companionAllowed = bay.allow_companion || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).allow_companion; } catch { return false; } })() : false);
                    const screenSpec = bay.screen_spec || (bay.config_json ? (() => { try { return JSON.parse(bay.config_json).screen_spec; } catch { return null; } })() : null);

                    const hasBadges = (simType && simType !== 'NONE') || (handed && (handed === 'LEFT' || handed === 'BOTH')) || lessonOnly || companionAllowed || (screenSpec && screenSpec !== 'STANDARD');
                    if (!hasBadges) return null;

                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '2px' }}>
                        {simType && simType !== 'NONE' && (
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                            {simType === 'GDR_PLUS' ? 'GDR+' : simType === 'KAKAO_VX' ? 'VX' : simType === 'QED' ? 'QED' : simType === 'SDR' ? 'SDR' : simType === 'LM' ? 'LM' : simType === 'STR' ? 'STR' : simType === 'VIP' ? 'VIP' : simType}
                          </span>
                        )}
                        {handed && (handed === 'LEFT' || handed === 'BOTH') && (
                          <span style={{ fontSize: '9px', fontWeight: 900, padding: '1px 4px', borderRadius: '3px', background: handed === 'LEFT' ? '#ffe4e6' : '#f3e8ff', color: handed === 'LEFT' ? '#9f1239' : '#6b21a8', border: '1px solid #fecdd3' }}>
                            {handed === 'LEFT' ? '좌타 🎯' : '양타 ↔'}
                          </span>
                        )}
                        {lessonOnly && (
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: '#faf5ff', color: '#6b21a8', border: '1px solid #e9d5ff' }}>
                            레슨 🎓
                          </span>
                        )}
                        {companionAllowed && (
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px', background: '#ecfeff', color: '#155e75', border: '1px solid #a5f3fc' }}>
                            동반자 👥
                          </span>
                        )}
                        {screenSpec && screenSpec !== 'STANDARD' && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                            {screenSpec === 'WIDE_16_9' ? '16:9' : '커브드'}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })}
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
                  borderRadius: '18px',
                  padding: '12px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 700 }}>이전 타석</span>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#1d1d1f' }}>{currentBay.bay_no}번</span>
                </div>
                <ArrowLeftRight size={22} style={{ color: '#059669' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>이동할 타석</span>
                  <span style={{ fontSize: '21px', fontWeight: 900, color: '#059669' }}>{selectedBayNo}번</span>
                </div>
                <div style={{ width: '1px', height: '32px', background: '#e5e5ea', margin: '0 4px' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', color: '#1d1d1f', fontWeight: 800 }}>남은 {currentRemMin}분 100% 보전</span>
                  <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600 }}>선점 락: {countdown}초 남음</span>
                </div>
              </div>
            </div>
          ) : selectedBayNo !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  background: '#f5f5f7', 
                  border: '1.5px solid #e5e5ea',
                  padding: '10px 20px', 
                  borderRadius: '14px', 
                  fontSize: '17px', 
                  fontWeight: 800,
                  color: '#1d1d1f',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Check size={18} style={{ color: '#059669' }} />
                <span>선택된 타석: <strong style={{ color: '#059669', fontSize: '21px' }}>{selectedBayNo}</strong>번</span>
              </div>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 700 }}>
                (배정 대기 시간: {countdown}초 남음)
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '15px', color: (isTimeRestricted || isGlobalPaused) ? '#dc2626' : '#86868b', fontWeight: 700 }}>
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
              padding: '0 36px',
              height: '62px', 
              borderRadius: '999px', 
              fontSize: '19px', 
              fontWeight: 800,
              border: 'none',
              background: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? '#e5e5ea' : '#1d1d1f',
              color: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? '#86868b' : '#ffffff',
              boxShadow: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.14)',
              cursor: (selectedBayNo === null || preoccupyLoading || isTimeRestricted || hasNoActiveBay || isGlobalPaused) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {preoccupyLoading ? '선점 처리 중...' : isMoveMode ? '타석 이동 확정' : '선택 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};
