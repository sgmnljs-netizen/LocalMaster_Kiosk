import React, { useState, useEffect } from 'react';
import { UserPlus, Timer, X, AlertCircle, UserCheck } from 'lucide-react';
import { api, Member, Bay } from '../services/api';

export interface CompanionTargetItem {
  bayNo: number;
  isLeader: boolean;
  memberNo?: string;
  memberName?: string;
  hp?: string;
  isGuest: boolean;
  ticketType: 'MEMBERSHIP' | 'DAILY';
  memberItemId?: number;
  ticketName?: string;
  durationMin: number;
  price: number;
}

interface CompanionSetupModalProps {
  selectedBayNos: number[];
  bays: Bay[];
  leaderMember: Member;
  lang: 'KO' | 'EN';
  selectedDurationMin?: number;
  defaultDailyPrice?: number;
  onConfirm: (targets: CompanionTargetItem[]) => void;
  onCancel: () => void;
}

const getAssignableAssets = (member?: Member | null, bay?: Bay | null) => {
  const targetZoneCode = bay?.zone_code?.toUpperCase() || 'BAY';
  return (member?.assets || []).filter((a) => {
    if (a.is_assignable === false) return false;
    const logicType = (a.logic_type || 'PERIOD').toUpperCase();
    if (logicType === 'COUNT' || logicType === 'COUPON') {
      const cnt = (a as any).remain_cnt ?? a.rem_count ?? 0;
      if (cnt <= 0) return false;
    } else {
      if (a.rem_count !== null && a.rem_count !== undefined && a.rem_count <= 0) return false;
      if ((a as any).remain_cnt !== null && (a as any).remain_cnt !== undefined && (a as any).remain_cnt <= 0) return false;
      if (a.remain_days !== undefined && a.remain_days !== null && a.remain_days < 0) return false;
    }
    if (!a.allowed_categories || a.allowed_categories.length === 0) return true;
    const allowedUpper = a.allowed_categories.map((c: string) => String(c).toUpperCase());
    return allowedUpper.includes(targetZoneCode);
  });
};

const getFirstAssignableAsset = (member?: Member | null, bay?: Bay | null) => {
  return getAssignableAssets(member, bay)[0];
};

const resolveAssetTicketName = (asset?: any): string => {
  return asset?.product_nm || asset?.item_name || asset?.prod_nm || '정기 회원권 / 잔여 횟수 차감';
};

export const CompanionSetupModal: React.FC<CompanionSetupModalProps> = ({
  selectedBayNos,
  bays = [],
  leaderMember,
  lang,
  selectedDurationMin = 60,
  defaultDailyPrice,
  onConfirm,
  onCancel
}) => {
  const [activeBayIdx, setActiveBayIdx] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(120); // 120초 락 확장
  const [searchHp, setSearchHp] = useState<string>('');
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');
  const [dailyPrice, setDailyPrice] = useState<number>(defaultDailyPrice || 15000);
  const [companionMembers, setCompanionMembers] = useState<Record<number, Member>>({});

  // 🛡️ [BUG-P02 Fix] selectedDurationMin이 0으로 전달되더라도 대표자 유효 이용권 시간 또는 60분으로 안전 폴백
  const leaderFirstBay = bays.find(b => b.bay_no === selectedBayNos[0]);
  const leaderDefaultAsset = getFirstAssignableAsset(leaderMember, leaderFirstBay);
  const effectiveDurationMin =
    selectedDurationMin && selectedDurationMin > 0
      ? selectedDurationMin
      : Number((leaderDefaultAsset as any)?.duration_min) > 0
        ? Number((leaderDefaultAsset as any)?.duration_min)
        : 60;

  // 각 타석별 배정 설정 상태
  const [targets, setTargets] = useState<CompanionTargetItem[]>(() => {
    const initialDailyPrice = defaultDailyPrice || 15000;
    return selectedBayNos.map((bayNo, idx) => {
      const targetBay = bays.find(b => b.bay_no === bayNo);
      if (idx === 0) {
        // 대표자 타석
        const validAsset = getFirstAssignableAsset(leaderMember, targetBay);
        const assetDur = Number((validAsset as any)?.duration_min);
        const durMin = assetDur > 0 ? assetDur : effectiveDurationMin;
        const parsedId = validAsset ? Number(validAsset.member_item_id || (validAsset as any).id) : undefined;
        return {
          bayNo,
          isLeader: true,
          memberNo: leaderMember.member_no,
          memberName: leaderMember.member_name,
          hp: leaderMember.hp,
          isGuest: false,
          ticketType: validAsset && parsedId ? 'MEMBERSHIP' : 'DAILY',
          memberItemId: validAsset && parsedId ? parsedId : undefined,
          ticketName: validAsset && parsedId ? resolveAssetTicketName(validAsset) : `일일 타석권 ${durMin}분`,
          durationMin: durMin,
          price: validAsset && parsedId ? 0 : initialDailyPrice
        };
      } else {
        // 동반자 타석 (디폴트: 비회원 일일권, 대표자와 동일 시간 상속)
        return {
          bayNo,
          isLeader: false,
          memberName: `동반자 ${idx}`,
          hp: '',
          isGuest: true,
          ticketType: 'DAILY',
          ticketName: `일일 타석권 ${effectiveDurationMin}분`,
          durationMin: effectiveDurationMin,
          price: initialDailyPrice
        };
      }
    });
  });

  // 백엔드 일일권 상품 단가 동적 조회
  useEffect(() => {
    let mounted = true;
    api.getProducts().then((prods) => {
      if (!mounted || !Array.isArray(prods)) return;
      const dailyProds = prods.filter(
        (p) => (p.logic_type || '').toUpperCase() === 'DAILY' || (p.prod_nm || '').includes('일일')
      );
      const matched =
        dailyProds.find((p) => Number(p.duration_min) === Number(effectiveDurationMin)) || dailyProds[0];
      const resolvedPrice = Number(matched?.sale_price || matched?.standard_price || defaultDailyPrice || 0);
      const matchedDur = Number(matched?.duration_min) > 0 ? Number(matched?.duration_min) : effectiveDurationMin;
      if (resolvedPrice > 0) {
        setDailyPrice(resolvedPrice);
        setTargets((prev) =>
          prev.map((t) =>
            t.ticketType === 'DAILY'
              ? {
                  ...t,
                  price: resolvedPrice,
                  durationMin: t.durationMin > 0 ? t.durationMin : matchedDur,
                  ticketName: `일일 타석권 ${t.durationMin > 0 ? t.durationMin : matchedDur}분`,
                }
              : t
          )
        );
      }
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [effectiveDurationMin, defaultDailyPrice]);

  // 120초 타이머 및 30초 주기 Heartbeat 락 갱신
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 30초마다 preoccupyBays Heartbeat 백그라운드 갱신 (BUG-P08: false 반환 감지 보강)
    const hbInterval = setInterval(() => {
      api.preoccupyBays(selectedBayNos)
        .then(ok => {
          if (!ok) {
            setSearchError(lang === 'KO' ? '네트워크 지연 또는 시간 초과로 일부 타석의 선점 락이 만료되었습니다. 다시 선택해 주세요.' : 'Teebox lock expired. Please re-select.');
          }
        })
        .catch(err => {
          console.error('Heartbeat lock extension failed:', err);
          setSearchError(lang === 'KO' ? '네트워크 상태 불안정으로 선점 락 갱신이 지연되고 있습니다.' : 'Network unstable. Lock extension delayed.');
        });
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(hbInterval);
    };
  }, [selectedBayNos, onCancel, lang]);

  // 특정 타석의 설정 값 업데이트
  const updateTarget = (idx: number, patch: Partial<CompanionTargetItem>) => {
    setTargets(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // 동반자 회원 검색 (정규화 헬퍼 및 409 중복 뒷번호 대응 적용)
  const handleSearchCompanion = async () => {
    const cleanHp = searchHp.replace(/[^0-9]/g, '');
    if (!cleanHp || (cleanHp.length !== 4 && cleanHp.length < 10)) {
      setSearchError(lang === 'KO' ? '휴대폰 번호 뒷 4자리 또는 전체 11자리를 입력해주세요.' : 'Enter 4-digit suffix or full 11-digit phone number.');
      return;
    }
    setSearchError('');
    setSearchLoading(true);

    try {
      const member = await api.getMemberByHp(cleanHp);
      if (member) {
        const slotBayNo = targets[activeBayIdx]?.bayNo;
        const targetBay = bays.find(b => b.bay_no === slotBayNo);
        if (slotBayNo !== undefined) {
          setCompanionMembers(prev => ({ ...prev, [slotBayNo]: member }));
        }
        const memberHpClean = (member.hp || '').replace(/[^0-9]/g, '');
        const alreadyAssignedSlot = targets.find(
          (t, i) =>
            i !== activeBayIdx &&
            (t.memberNo === member.member_no ||
              (!t.memberNo && memberHpClean && (t.hp || '').replace(/[^0-9]/g, '') === memberHpClean))
        );
        const validAsset = getFirstAssignableAsset(member, targetBay);
        const parsedId = validAsset ? Number(validAsset.member_item_id || (validAsset as any).id) : undefined;
        const assetLogic = String((validAsset as any)?.logic_type || '').toUpperCase();
        const assetRemCnt = Number(validAsset?.rem_count ?? (validAsset as any)?.remain_cnt ?? 0);
        const isCountAsset = (assetLogic === 'COUNT' || assetLogic === 'COUPON') || assetRemCnt > 0;

        // 동일 회원이 이미 다른 슬롯에 등록되어 있고 횟수권 다회 보유자가 아닌 경우 회원권 중복 차감 차단
        const usedCountForSameAsset = parsedId
          ? targets.filter((t, i) => i !== activeBayIdx && t.ticketType === 'MEMBERSHIP' && t.memberItemId === parsedId).length
          : 0;
        const canUseMembership = Boolean(
          validAsset &&
          parsedId &&
          (!alreadyAssignedSlot || (isCountAsset && assetRemCnt > usedCountForSameAsset))
        );
        const companionAssetDur = Number((validAsset as any)?.duration_min);
        const resolvedCompanionDur =
          canUseMembership && companionAssetDur > 0 ? companionAssetDur : effectiveDurationMin;

        updateTarget(activeBayIdx, {
          isGuest: false,
          memberNo: member.member_no,
          memberName: member.member_name,
          hp: member.hp,
          ticketType: canUseMembership ? 'MEMBERSHIP' : 'DAILY',
          memberItemId: canUseMembership ? parsedId : undefined,
          ticketName: canUseMembership && validAsset ? resolveAssetTicketName(validAsset) : `일일 타석권 ${resolvedCompanionDur}분`,
          durationMin: resolvedCompanionDur,
          price: canUseMembership ? 0 : dailyPrice
        });
        if (alreadyAssignedSlot && !canUseMembership) {
          setSearchError(lang === 'KO' ? '이미 다른 타석에 선택된 회원권이므로 일일 타석권 결제로 자동 설정되었습니다.' : 'Membership already used in another slot; set to Daily Pass.');
        }
        setSearchHp('');
      } else {
        setSearchError(lang === 'KO' ? '일치하는 회원을 찾을 수 없습니다. 번호를 다시 확인하거나 비회원으로 진행해주세요.' : 'Member not found.');
      }
    } catch (err: any) {
      if (err?.inactive || err?.status === 403) {
        setSearchError(err.message || '현재 휴면 또는 이용 제한(일시정지/탈퇴) 상태인 회원입니다.');
      } else if (err?.duplicate || err?.status === 409) {
        setSearchError(err.message || '동일한 뒷번호 회원이 2명 이상 존재합니다. 휴대폰 번호 전체(11자리)를 입력해 주세요.');
      } else {
        setSearchError(err?.message || (lang === 'KO' ? '회원 검색 중 오류가 발생했습니다.' : 'Failed to search member.'));
      }
    } finally {
      setSearchLoading(false);
    }
  };

  // 최종 확정 전 슬롯 무결성 검증
  const handleConfirmAll = () => {
    // 이용권별 총 사용 횟수 초과 검증
    const usageByItemId = new Map<number, number>();
    for (const t of targets) {
      if (t.ticketType === 'MEMBERSHIP') {
        if (!t.memberItemId || !t.memberNo) {
          setSearchError(`${t.bayNo}번 타석의 회원 인증 또는 유효 이용권이 확인되지 않았습니다. 회원 조회 후 이용하거나 일일 타석권을 선택해 주세요.`);
          return;
        }
        usageByItemId.set(t.memberItemId, (usageByItemId.get(t.memberItemId) || 0) + 1);
      }
    }

    // 대표자 및 동반자 자산과 대조하여 기간권 중복 사용 또는 횟수권 초과 사용 검증
    const allKnownAssets = [
      ...(leaderMember.assets || []),
      ...Object.values(companionMembers).flatMap(m => m?.assets || [])
    ];
    for (const [itemId, usedCount] of usageByItemId.entries()) {
      if (usedCount > 1) {
        const matchedAsset = allKnownAssets.find(
          a => Number(a.member_item_id || (a as any).id) === itemId
        );
        if (matchedAsset) {
          const logicType = String(matchedAsset.logic_type || '').toUpperCase();
          const remCnt = Number(matchedAsset.rem_count ?? (matchedAsset as any).remain_cnt ?? 0);
          if ((logicType === 'PERIOD' || logicType === 'MEMBERSHIP') && remCnt <= 0) {
            setSearchError('기간제 정기 회원권은 1인 1타석만 배정 가능합니다. 동반자 타석은 횟수권 또는 일일 타석권을 선택해 주세요.');
            return;
          }
          if (remCnt > 0 && usedCount > remCnt) {
            setSearchError(`보유하신 이용권의 잔여 횟수(${remCnt}회)보다 많은 타석(${usedCount}석)에 적용할 수 없습니다.`);
            return;
          }
        }
      }
    }

    onConfirm(targets);
  };

  const currentTarget = targets[activeBayIdx];
  const currentSlotMember = currentTarget
    ? (currentTarget.isLeader ? leaderMember : companionMembers[currentTarget.bayNo])
    : undefined;
  const currentSlotBay = currentTarget
    ? bays.find(b => b.bay_no === currentTarget.bayNo)
    : undefined;
  const currentAssignableAssets = getAssignableAssets(currentSlotMember, currentSlotBay);
  const selectedAsset = currentAssignableAssets.find(
    a => Number(a.member_item_id || (a as any).id) === Number(currentTarget?.memberItemId)
  ) || currentAssignableAssets[0];
  const totalPrice = targets.reduce((sum, t) => sum + t.price, 0);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '920px',
          background: '#ffffff',
          borderRadius: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}
      >
        {/* Header */}
        <div 
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #e5e5ea',
            padding: '28px 36px',
            color: '#1d1d1f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: '#f5f5f7', border: '1px solid #e5e5ea', padding: '12px', borderRadius: '16px' }}>
              <UserPlus size={28} color="#1d1d1f" />
            </div>
            <div>
              <h2 style={{ fontSize: '26px', fontWeight: 900, margin: 0, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                {lang === 'KO' ? '👥 동반자 타석 동시 배정 설정' : '👥 Companion Bay Allocation Setup'}
              </h2>
              <p style={{ fontSize: '15px', color: '#6e6e73', fontWeight: 600, margin: '4px 0 0 0' }}>
                {lang === 'KO' ? `선택하신 ${selectedBayNos.length}개 타석의 사용 정보를 설정해주세요.` : `Configure details for ${selectedBayNos.length} selected teeboxes.`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Countdown Badge */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#f5f5f7',
                border: '1px solid #e5e5ea',
                color: '#1d1d1f',
                padding: '8px 16px',
                borderRadius: '999px',
                fontSize: '16px',
                fontWeight: 800
              }}
            >
              <Timer size={18} color="#1d1d1f" />
              <span>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</span>
            </div>
            <button 
              type="button"
              onClick={onCancel}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#f5f5f7',
                border: '1px solid #e5e5ea',
                color: '#48484a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '32px 36px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 타석 선택 탭 */}
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '6px', background: '#f5f5f7', borderRadius: '20px', border: '1px solid #e5e5ea' }}>
            {targets.map((t, idx) => {
              const isActive = idx === activeBayIdx;
              return (
                <button
                  type="button"
                  key={t.bayNo}
                  onClick={() => {
                    setActiveBayIdx(idx);
                    setSearchError('');
                    setSearchHp('');
                  }}
                  style={{
                    flex: 1,
                    minWidth: '140px',
                    padding: '14px 20px',
                    borderRadius: '16px',
                    border: 'none',
                    background: isActive ? '#1d1d1f' : 'transparent',
                    color: isActive ? '#ffffff' : '#6e6e73',
                    fontWeight: 800,
                    fontSize: '18px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: isActive ? '0 4px 12px rgba(0, 0, 0, 0.14)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '12px', color: isActive ? 'rgba(255, 255, 255, 0.78)' : '#86868b', fontWeight: 700 }}>
                    {t.isLeader ? '[대표자]' : `[동반자 ${idx}]`}
                  </span>
                  <span>{t.bayNo}번 타석</span>
                </button>
              );
            })}
          </div>

          {/* Active Bay Detail Form */}
          {currentTarget && (
            <div style={{ background: '#f5f5f7', borderRadius: '24px', padding: '28px', border: '1px solid #e5e5ea', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: '#1d1d1f', letterSpacing: '-0.4px' }}>
                  📌 {currentTarget.bayNo}번 타석 설정 ({currentTarget.isLeader ? '대표자' : `동반자 ${activeBayIdx}`})
                </h3>
                {currentTarget.isLeader ? (
                  <span style={{ background: '#1d1d1f', color: '#ffffff', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 800 }}>
                    인증 회원 ({currentTarget.memberName})
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', background: '#ffffff', padding: '4px', borderRadius: '999px', border: '1px solid #d2d2d7' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchError('');
                        updateTarget(activeBayIdx, { isGuest: false, memberName: currentTarget.memberNo ? currentTarget.memberName : '동반자 회원' });
                      }}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '999px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        background: !currentTarget.isGuest ? '#1d1d1f' : 'transparent',
                        color: !currentTarget.isGuest ? '#ffffff' : '#6e6e73',
                        cursor: 'pointer'
                      }}
                    >
                      <UserCheck size={15} style={{ display: 'inline', marginRight: '4px' }} /> 회원
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchError('');
                        setSearchHp('');
                        updateTarget(activeBayIdx, { isGuest: true, memberNo: undefined, memberItemId: undefined, memberName: `비회원 ${activeBayIdx}`, ticketType: 'DAILY', price: dailyPrice });
                      }}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '999px',
                        fontSize: '14px',
                        fontWeight: 800,
                        border: 'none',
                        background: currentTarget.isGuest ? '#1d1d1f' : 'transparent',
                        color: currentTarget.isGuest ? '#ffffff' : '#6e6e73',
                        cursor: 'pointer'
                      }}
                    >
                      비회원
                    </button>
                  </div>
                )}
              </div>

              {/* 회원 검색 폼 + 터치 숫자 키패드 (동반자 회원 선택 시) */}
              {!currentTarget.isLeader && !currentTarget.isGuest && (
                <div style={{ background: '#ffffff', padding: '18px', borderRadius: '18px', border: '1px solid #e5e5ea', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input 
                      type="text"
                      readOnly
                      placeholder={lang === 'KO' ? '휴대폰 번호 뒷 4자리 또는 11자리 터치 입력' : 'Tap 4 or 11 digits'}
                      value={searchHp}
                      style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #1d1d1f', fontSize: '20px', fontWeight: 900, letterSpacing: '2px', color: '#1d1d1f', background: '#f5f5f7' }}
                    />
                    <button
                      type="button"
                      onClick={handleSearchCompanion}
                      disabled={searchLoading}
                      style={{ padding: '14px 28px', background: '#1d1d1f', color: '#fff', border: 'none', borderRadius: '999px', fontSize: '16px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {searchLoading ? '검색 중...' : '회원 조회'}
                    </button>
                  </div>

                  {/* 키오스크 전용 인라인 터치 숫자 패드 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '←', '초기화'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSearchError('');
                          if (key === '초기화') setSearchHp('');
                          else if (key === '←') setSearchHp((prev) => prev.slice(0, -1));
                          else if (searchHp.length < 11) setSearchHp((prev) => prev + key);
                        }}
                        style={{
                          height: '46px',
                          borderRadius: '12px',
                          border: '1px solid #e5e5ea',
                          background: key === '초기화' || key === '←' ? '#e8e8ed' : '#f5f5f7',
                          color: '#1d1d1f',
                          fontSize: key === '초기화' ? '14px' : '18px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {key}
                      </button>
                    ))}
                  </div>

                  {currentTarget.memberNo && (
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1d1d1f', background: '#f5f5f7', border: '1px solid #d2d2d7', padding: '10px 14px', borderRadius: '12px' }}>
                      ✅ 조회된 동반 회원: {currentTarget.memberName} ({currentTarget.hp || currentTarget.memberNo})
                    </div>
                  )}
                </div>
              )}
              {searchError && (
                <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} /> {searchError}
                </div>
              )}

              {/* 이용권 / 상품 지정 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '15px', fontWeight: 800, color: '#48484a' }}>배정 및 이용 방식 선택</label>
                {!currentTarget.isGuest && currentAssignableAssets.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {currentAssignableAssets.map((asset) => {
                      const assetId = Number(asset.member_item_id || (asset as any).id);
                      const isSelectedAsset = currentTarget.ticketType === 'MEMBERSHIP' && Number(currentTarget.memberItemId) === assetId;
                      const assetName = resolveAssetTicketName(asset);
                      const remCnt = (asset as any).remain_cnt ?? asset.rem_count;
                      return (
                        <button
                          key={assetId}
                          type="button"
                          onClick={() => {
                            setSearchError('');
                            updateTarget(activeBayIdx, {
                              ticketType: 'MEMBERSHIP',
                              memberItemId: assetId,
                              price: 0,
                              ticketName: assetName,
                              durationMin: Number((asset as any).duration_min || currentTarget.durationMin || effectiveDurationMin)
                            });
                          }}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '999px',
                            fontSize: '13px',
                            fontWeight: 800,
                            border: isSelectedAsset ? '1.5px solid #1d1d1f' : '1px solid #d2d2d7',
                            background: isSelectedAsset ? '#1d1d1f' : '#ffffff',
                            color: isSelectedAsset ? '#ffffff' : '#48484a',
                            cursor: 'pointer'
                          }}
                        >
                          🎟️ {assetName}{remCnt !== undefined && remCnt !== null ? ` (잔여 ${remCnt}회)` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* 이용권 차감 옵션 */}
                  <button
                    type="button"
                    onClick={() => {
                      const resolvedAssetId = currentTarget.memberItemId || (selectedAsset ? Number(selectedAsset.member_item_id || (selectedAsset as any).id) : undefined);
                      if (currentTarget.isGuest || !resolvedAssetId) {
                        setSearchError(lang === 'KO' ? '사용 가능한 회원권이 없습니다. 회원 조회 후 이용하거나 일일 타석권을 선택해 주세요.' : 'No valid membership found.');
                        return;
                      }
                      setSearchError('');
                      updateTarget(activeBayIdx, {
                        ticketType: 'MEMBERSHIP',
                        memberItemId: resolvedAssetId,
                        price: 0,
                        ticketName: resolveAssetTicketName(selectedAsset)
                      });
                    }}
                    disabled={currentTarget.isGuest || (!currentTarget.memberItemId && !selectedAsset)}
                    style={{
                      padding: '20px',
                      borderRadius: '18px',
                      textAlign: 'left',
                      border: currentTarget.ticketType === 'MEMBERSHIP' ? '2px solid #1d1d1f' : '1px solid #d2d2d7',
                      background: '#ffffff',
                      cursor: (currentTarget.isGuest || (!currentTarget.memberItemId && !selectedAsset)) ? 'not-allowed' : 'pointer',
                      opacity: (currentTarget.isGuest || (!currentTarget.memberItemId && !selectedAsset)) ? 0.5 : 1,
                      boxShadow: currentTarget.ticketType === 'MEMBERSHIP' ? '0 6px 16px rgba(0, 0, 0, 0.08)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: '17px', color: '#1d1d1f' }}>🎟️ 회원권 차감</div>
                    <div style={{ fontSize: '13px', color: '#6e6e73', fontWeight: 600, marginTop: '4px' }}>
                      {selectedAsset ? `${resolveAssetTicketName(selectedAsset)} (0원)` : '보유 중인 회원 이용권으로 배정 (0원)'}
                    </div>
                  </button>

                  {/* 일일 이용권 결제 옵션 */}
                  <button
                    type="button"
                    onClick={() => updateTarget(activeBayIdx, { ticketType: 'DAILY', price: dailyPrice, ticketName: `일일 타석권 ${currentTarget.durationMin}분` })}
                    style={{
                      padding: '20px',
                      borderRadius: '18px',
                      textAlign: 'left',
                      border: currentTarget.ticketType === 'DAILY' ? '2px solid #1d1d1f' : '1px solid #d2d2d7',
                      background: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: currentTarget.ticketType === 'DAILY' ? '0 6px 16px rgba(0, 0, 0, 0.08)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: '17px', color: '#1d1d1f' }}>💳 일일 타석권 결제</div>
                    <div style={{ fontSize: '13px', color: '#1d1d1f', fontWeight: 800, marginTop: '4px' }}>{dailyPrice.toLocaleString()} 원 ({currentTarget.durationMin}분 이용)</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div 
          style={{
            padding: '24px 36px',
            borderTop: '1px solid #e5e5ea',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 700 }}>총 결제 필요 금액</span>
            <div style={{ fontSize: '30px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-0.8px' }}>
              {totalPrice.toLocaleString()} <span style={{ fontSize: '20px', fontWeight: 800 }}>원</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '14px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                height: '60px',
                padding: '0 32px',
                borderRadius: '999px',
                border: '1px solid #d2d2d7',
                background: '#f5f5f7',
                color: '#1d1d1f',
                fontSize: '18px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              이전으로
            </button>
            <button
              type="button"
              onClick={handleConfirmAll}
              style={{
                height: '60px',
                padding: '0 40px',
                borderRadius: '999px',
                border: 'none',
                background: '#1d1d1f',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
              }}
            >
              {totalPrice > 0 ? '일괄 결제 진행' : '다중 배정 확정'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
