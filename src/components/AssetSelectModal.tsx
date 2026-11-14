import React from 'react';
import { Check, X, AlertTriangle, CreditCard, ShieldAlert, ArrowRight } from 'lucide-react';
import { Member, MemberAsset, Bay, isPeriodMembershipAsset } from '../services/api';
import { useKioskSettings } from '../stores/kioskSettings';
import { TimeMaster } from '../utils/timeMaster';
import { parseNullableFloorNumber } from '../utils/floorUtils';
import { normalizeYmdDigits } from '../utils/kioskPurchaseEligibility';

const DEFAULT_SESSION_MIN = 60;

const COUNT_BASED_LOGIC_TYPES = new Set([
  'COUNT',
  'COUPON',
  'TICKET',
  'DAILY',
  'ONE_DAY',
  'ONEDAY',
  'SINGLE',
  'PASS',
]);

const PERIOD_BASED_LOGIC_TYPES = new Set([
  'PERIOD',
  'MEMBERSHIP',
  'MEMBERSHIP_PERIOD',
]);

function isLessonAsset(asset: MemberAsset): boolean {
  const logicType = String(asset.logic_type || '').trim().toUpperCase();
  const passType = String(asset.pass_type || '').trim().toUpperCase();
  return logicType === 'LESSON' || passType === 'LESSON';
}

function isTimeBasedAsset(asset: MemberAsset): boolean {
  const logicType = String(asset.logic_type || '').trim().toUpperCase();
  const passType = String(asset.pass_type || '').trim().toUpperCase();
  return logicType === 'TIME' || passType === 'TIME';
}

function isCountBasedAsset(asset: MemberAsset): boolean {
  if (isTimeBasedAsset(asset) || isLessonAsset(asset)) return false;
  const logicType = String(asset.logic_type || 'PERIOD').trim().toUpperCase();
  const passType = String(asset.pass_type || '').trim().toUpperCase();
  if (COUNT_BASED_LOGIC_TYPES.has(logicType) || COUNT_BASED_LOGIC_TYPES.has(passType)) {
    return true;
  }
  return !PERIOD_BASED_LOGIC_TYPES.has(logicType) && (asset.total_count ?? 0) > 0;
}

function isExhaustedCountOrTimeAsset(asset: MemberAsset): boolean {
  if (isTimeBasedAsset(asset)) {
    const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
    return remMin <= 0;
  }
  if (isCountBasedAsset(asset)) {
    const cnt = asset.remain_cnt ?? asset.rem_count ?? 0;
    return cnt <= 0;
  }
  return false;
}

export interface AssetSelectModalProps {
  authMember: Member;
  selectedBayNo: number | null;
  bays: Bay[];
  lang?: 'KO' | 'EN';
  selectedAssetId: number | null;
  prepareMin?: number;
  storeCloseTime?: string | null;
  storeOpenTime?: string | null;
  isStore24h?: boolean;
  now?: Date;
  onSelectAsset: (memberItemId: number) => void;
  onConfirm: (memberItemId: number) => void;
  onCancel: () => void;
  onSwitchToDaily: () => void;
  onChangeBay: () => void;
}

export function evaluateAssetFloorMismatchReason(
  asset: MemberAsset,
  rawFloor?: number | string | null
): string | null {
  const targetFloorNo = parseNullableFloorNumber(rawFloor);
  if (targetFloorNo === null || !Array.isArray(asset.allowed_floors) || asset.allowed_floors.length === 0) {
    return null;
  }
  const allowedFloorNums = asset.allowed_floors
    .map((f) => parseNullableFloorNumber(f))
    .filter((n): n is number => n !== null);
  if (allowedFloorNums.length > 0 && !allowedFloorNums.includes(targetFloorNo)) {
    const formattedFloors = allowedFloorNums.map((f) => (f < 0 ? `B${Math.abs(f)}` : String(f)));
    return `${formattedFloors.join('·')}층 전용 이용권입니다.`;
  }
  return null;
}

/**
 * [SSOT] 선택한 타석 및 인증 채널(QR 쿠폰 전용 모드 포함) 기준 유효 배정 가능 이용권 필터링
 * - AssetSelectModal, KioskApp, MemberAuth(본인 확인 프리뷰)에서 100% 동일 규약 공유
 */
export function filterValidAssignableAssets(
  authMember: Pick<Member, 'assets' | 'auth_channel'> | null | undefined,
  currentBayObj?: Pick<Bay, 'zone_code' | 'floor_no' | 'floor'> | null,
  options?: { qrCouponOnlyMode?: boolean; todayDigits?: string }
): MemberAsset[] {
  if (!authMember || !Array.isArray(authMember.assets)) return [];
  const isQrCouponOnly =
    authMember.auth_channel === 'QR' && options?.qrCouponOnlyMode !== false;
  const targetZoneCode = currentBayObj?.zone_code?.toUpperCase() || 'BAY';
  const rawFloor = currentBayObj?.floor_no ?? currentBayObj?.floor;
  const todayDigits =
    options?.todayDigits ??
    normalizeYmdDigits(TimeMaster.getKstYmd(TimeMaster.getSyncedDate()));

  return authMember.assets.filter((asset) => {
    if (isQrCouponOnly && isPeriodMembershipAsset(asset)) return false;
    if (asset.is_assignable === false) return false;
    // 프로 레슨 이용권(LESSON)은 키오스크 무인 연습타석 셀프 배정 목록에서 제외하여 오차감 방지
    if (isLessonAsset(asset)) return false;
    const startDigits = normalizeYmdDigits(asset.start_date);
    if (todayDigits && startDigits && startDigits > todayDigits) return false;
    // 횟수권·일일권(DAILY/TICKET/COUNT/COUPON 등) 및 시간권(TIME) 잔여 0 이하 소진분 제외 (MemberAssetService 1:1 정합)
    if (isExhaustedCountOrTimeAsset(asset)) return false;
    if (asset.remain_days !== undefined && asset.remain_days !== null && asset.remain_days < 0) {
      return false;
    }
    if (evaluateAssetFloorMismatchReason(asset, rawFloor) !== null) return false;
    if (!asset.allowed_categories || asset.allowed_categories.length === 0) return true;
    const allowedUpper = asset.allowed_categories.map((c) => c.toUpperCase());
    return allowedUpper.includes(targetZoneCode);
  });
}

/**
 * [SSOT] 보유 이용권 진입 초기 선택값 규칙 (2-Step 시선 릴레이 통일)
 * - 유효 이용권이 1건이어도 자동 선택하지 않고 항상 null(미선택)로 시작하여,
 *   1단계(유리 광택 1.6:1 카드 터치 유도) -> 2단계(하단 108px 배정 확정 버튼 헤일로·광택 점등) 2단 시선 릴레이가 일관되게 동작하도록 한다.
 *   (※ 단, 회원권 신규 구매 직후 [바로 타석 배정] 진입 시에는 KioskApp이 명시적 purchasedItemNum을 선지정함)
 */
export function resolveDefaultSelectedAssetId(
  _authMember: Pick<Member, 'assets' | 'auth_channel'> | null | undefined,
  _currentBayObj?: Pick<Bay, 'zone_code' | 'floor_no' | 'floor'> | null,
  _options?: { qrCouponOnlyMode?: boolean; todayDigits?: string }
): number | null {
  return null;
}

export const AssetSelectModal: React.FC<AssetSelectModalProps> = ({
  authMember,
  selectedBayNo,
  bays,
  lang = 'KO',
  selectedAssetId,
  prepareMin,
  storeCloseTime,
  storeOpenTime,
  isStore24h,
  now,
  onSelectAsset,
  onConfirm,
  onCancel,
  onSwitchToDaily,
  onChangeBay
}) => {
  const { settings } = useKioskSettings();
  const isQrCouponOnly = authMember.auth_channel === 'QR' && settings.qrCouponOnlyMode !== false;
  const currentBayObj = bays.find(b => b.bay_no === selectedBayNo);
  const rawFloor = currentBayObj?.floor_no ?? currentBayObj?.floor;
  const bayMaxMin = currentBayObj?.max_assignable_min;
  const nextResStartStr = currentBayObj?.next_limit_res_start_time || '예정';

  const refNow = now ?? TimeMaster.getSyncedDate();
  const todayDigits = normalizeYmdDigits(TimeMaster.getKstYmd(refNow));

  const getFloorMismatchReason = (asset: MemberAsset): string | null =>
    evaluateAssetFloorMismatchReason(asset, rawFloor);

  // 1. 유효 배정 가능 이용권 필터링 (SSOT logic_type / access_rules / 미래 개시일 / QR 쿠폰 전용 이중 방어)
  const validAssets = filterValidAssignableAssets(authMember, currentBayObj, {
    qrCouponOnlyMode: settings.qrCouponOnlyMode,
    todayDigits,
  });

  // 배정 불가(제약 위반 및 층 불일치) 이용권 목록 (레슨권 LESSON 및 기소진 0회 일일/횟수권은 제외)
  const disabledAssets = (authMember.assets || []).flatMap(asset => {
    if (isLessonAsset(asset)) {
      return [];
    }
    if (asset.is_assignable === false && Boolean(asset.unassignable_reason)) {
      return [asset];
    }
    if (isExhaustedCountOrTimeAsset(asset)) {
      return [];
    }
    const floorReason = getFloorMismatchReason(asset);
    if (floorReason) {
      return [{ ...asset, unassignable_reason: floorReason }];
    }
    return [];
  });

  // 현재 선택된 이용권 객체
  const selectedAssetObj = validAssets.find(a => parseInt(a.member_item_id) === selectedAssetId) || null;
  const selectedAssetName = selectedAssetObj
    ? (selectedAssetObj.prod_nm || selectedAssetObj.item_name)
    : null;
  const selectedAssetMin = selectedAssetObj ? (selectedAssetObj.duration_min ?? DEFAULT_SESSION_MIN) : DEFAULT_SESSION_MIN;

  // 타석 배정 시간 & 즉시/대기 요약 프리뷰 (선택 이용권 시간 동적 반영)
  const finalPreview = TimeMaster.buildBayAllocationPreview({
    bay: currentBayObj,
    bays,
    bayNoFallback: selectedBayNo,
    durationMin: selectedAssetObj ? selectedAssetMin : null,
    prepareMin,
    storeCloseTime,
    storeOpenTime,
    isStore24h,
    now: refNow,
  });

  const bayShortLabel = selectedBayNo !== null ? `${String(selectedBayNo).padStart(2, '0')}번 타석` : '선택 타석';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 24px 132px 24px',
        boxSizing: 'border-box'
      }}
    >
      {/* 애플 미니멀 화이트 시트 (1008px 초대형 고시인성) */}
      <div 
        style={{
          width: '1008px',
          maxWidth: '96%',
          maxHeight: 'calc(100vh - 156px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '38px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.26)',
          padding: '34px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          color: '#1d1d1f',
          position: 'relative',
          boxSizing: 'border-box'
        }}
      >
        {/* 상단 헤더: 직관적 초대형 타이틀 + 1줄 요약 컨텍스트 + 58px 닫기 버튼 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <h2
              data-testid="asset-step-guide-banner"
              style={{
                fontSize: '46px',
                fontWeight: 900,
                color: '#1d1d1f',
                letterSpacing: '-1.2px',
                lineHeight: 1.12,
                margin: 0,
              }}
            >
              {lang === 'KO' ? '사용할 보유 이용권을 선택하세요' : 'Select Your Pass'}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f' }}>
                {authMember.member_name} 님
              </span>
              {selectedBayNo !== null && (
                <>
                  <span style={{ fontSize: '24px', color: '#d1d5db', fontWeight: 700 }}>·</span>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums' }}>
                    {finalPreview.floorLabel ? `${finalPreview.floorLabel} · ` : ''}{selectedBayNo}번 타석
                  </span>
                  <span
                    data-testid="asset-allocation-mode-badge"
                    style={{
                      padding: '6px 16px',
                      borderRadius: '999px',
                      background: finalPreview.isWaitlist ? '#d97706' : '#059669',
                      color: '#ffffff',
                      fontSize: '20px',
                      fontWeight: 900,
                      letterSpacing: '-0.3px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {finalPreview.isWaitlist
                      ? `대기 예약 · 약 ${finalPreview.waitMinutes}분 대기`
                      : '즉시 배정'}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="닫기"
            onClick={onCancel}
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              background: '#f5f5f7',
              border: '1px solid #e5e5ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#1d1d1f',
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = '#e5e5ea'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
          >
            <X size={30} strokeWidth={2.5} />
          </button>
        </div>

        {/* 연쇄 배정 / 다음 예약 시간 제약 안내 바 */}
        {currentBayObj && typeof currentBayObj.max_assignable_min === 'number' && currentBayObj.max_assignable_min > 0 && (
          <div 
            style={{
              background: '#fffbeb',
              border: '1.5px solid #f59e0b',
              borderRadius: '18px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0 }} />
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#b45309', lineHeight: 1.35 }}>
                다음 예약({currentBayObj.next_limit_res_start_time || '예정'}) 전까지 최대 [{currentBayObj.max_assignable_min}분] 이용 가능
              </span>
            </div>
            <button
              type="button"
              onClick={onChangeBay}
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                background: '#d97706',
                color: '#ffffff',
                border: 'none',
                fontSize: '18px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              다른 타석 선택
            </button>
          </div>
        )}

        {/* 보유 이용권 1.6:1 황금 직사각형 카드 그리드 (1장 480x296 / 다중 2열 458x286 · 미선택 시 시차 글로우/유리광택 어포던스) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            maxHeight: '596px',
            overflowY: 'auto',
            padding: '14px 16px 18px 16px',
            margin: '0 -16px',
            boxSizing: 'border-box',
          }}
        >
          {validAssets.length === 0 ? (
            <div 
              style={{
                width: '100%',
                padding: '40px 24px',
                textAlign: 'center',
                color: '#86868b',
                fontSize: '19px',
                fontWeight: 700,
                border: '2px dashed #dadce0',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                background: '#fafafc',
                boxSizing: 'border-box',
              }}
            >
              <CreditCard size={48} strokeWidth={1.8} style={{ color: '#cbd5e1' }} />
              <div>
                {isQrCouponOnly && (authMember.qr_restricted_period_count || 0) > 0
                  ? '사용 가능한 쿠폰(횟수권·시간권)이 없습니다.'
                  : (lang === 'KO' 
                      ? '해당 타석에서 사용할 수 있는 이용권이 없습니다.' 
                      : 'No active pass items found for this zone.')}
              </div>
              {isQrCouponOnly && (authMember.qr_restricted_period_count || 0) > 0 && (
                <div
                  data-testid="qr-period-pass-restricted-banner"
                  style={{
                    fontSize: '15px',
                    color: '#92400e',
                    background: '#fffbeb',
                    border: '1.5px solid #fcd34d',
                    padding: '14px 20px',
                    borderRadius: '16px',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    lineHeight: 1.5,
                  }}
                >
                  <ShieldAlert size={24} style={{ color: '#d97706', flexShrink: 0 }} />
                  <div>
                    <strong>QR 인증은 쿠폰(횟수권·시간권) 전용입니다.</strong><br />
                    본인 전용 일반 정기권({authMember.qr_restricted_period_count}건)은 <strong>[AI 안면인식]</strong> 또는 <strong>[앱 스마트 체크인]</strong>으로 인증해 주세요.
                  </div>
                </div>
              )}
              {(() => {
                const unassignableReasons = (authMember.assets || [])
                  .filter(a => !isLessonAsset(a) && a.is_assignable === false && a.unassignable_reason)
                  .map(a => `• ${a.prod_nm || a.item_name}: ${a.unassignable_reason}`);
                if (unassignableReasons.length === 0) return null;
                return (
                  <div style={{ fontSize: '15px', color: '#dc2626', background: '#fef2f2', padding: '12px 18px', borderRadius: '14px', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
                    {unassignableReasons.map((r, idx) => (
                      <div key={idx} style={{ marginBottom: '4px' }}>{r}</div>
                    ))}
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={onSwitchToDaily}
                style={{
                  padding: '18px 38px',
                  borderRadius: '999px',
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '19px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(5, 150, 105, 0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <CreditCard size={22} />
                <span>{lang === 'KO' ? '💳 일일 타석권 결제로 전환' : 'Switch to Daily Pass Payment'}</span>
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    validAssets.length === 1 ? 'minmax(0, 480px)' : 'repeat(2, minmax(0, 1fr))',
                  justifyContent: 'center',
                  gap: '20px',
                  width: '100%',
                }}
              >
              {validAssets.map((asset, assetIdx) => {
                const parsedItemId = parseInt(asset.member_item_id, 10);
                const isAssetSelected = selectedAssetId === parsedItemId;
                const assetDurationMin = asset.duration_min ?? DEFAULT_SESSION_MIN;
                const isExceedingBayLimit = typeof bayMaxMin === 'number' && bayMaxMin > 0 && assetDurationMin > bayMaxMin;
                const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
                const remCount = asset.remain_cnt ?? asset.rem_count ?? 0;
                const totalCount = asset.total_count ?? 0;
                const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
                const remainDays = asset.remain_days;
                const daysLabel = (asset.available_days_label || (lang === 'KO' ? '매일 이용' : 'Everyday')).replace(' 이용', '');
                const timeLabel = (asset.available_time_label || (lang === 'KO' ? '전 시간(종일)' : 'All Day'))
                  .replace('(종일)', '')
                  .replace('전 시간', '종일');
                const dailyLimit = asset.daily_limit_count;
                const startStr = asset.start_date || asset.start_dt;
                const expiryStr = asset.expiry_date || asset.end_date || asset.end_dt || authMember.expiry_date || '~';
                const fullValidityText = startStr ? `${startStr} ~ ${expiryStr}` : `~ ${expiryStr}`;

                const passMeta = (() => {
                  if (isTimeBasedAsset(asset)) return { label: '시간 이용권', accent: '#4f46e5' };
                  if (logicType === 'DAILY' || logicType === 'ONE_DAY' || logicType === 'ONEDAY' || logicType === 'SINGLE') {
                    return { label: '일일 이용권', accent: '#0284c7' };
                  }
                  if (isCountBasedAsset(asset)) return { label: '회수 이용권', accent: '#0071e3' };
                  return { label: '정기 회원권', accent: '#059669' };
                })();

                const remainingText = (() => {
                  if (isTimeBasedAsset(asset)) return `잔여 ${remMin}분`;
                  if (isCountBasedAsset(asset)) {
                    return `잔여 ${remCount}회${totalCount > 0 ? ` / ${totalCount}회` : ''}`;
                  }
                  if (remainDays !== undefined && remainDays !== null) {
                    return `잔여 ${remainDays}일`;
                  }
                  return null;
                })();

                const cardPreview = TimeMaster.buildBayAllocationPreview({
                  bay: currentBayObj,
                  bays,
                  bayNoFallback: selectedBayNo,
                  durationMin: assetDurationMin,
                  prepareMin,
                  storeCloseTime,
                  storeOpenTime,
                  isStore24h,
                  now: refNow,
                });

                const shouldPulseHint = validAssets.length > 0 && selectedAssetId === null;
                const pulseClassName = shouldPulseHint
                  ? (finalPreview.isWaitlist ? 'asset-card-pulse-hint-amber' : 'asset-card-pulse-hint')
                  : undefined;

                return (
                  <div
                    key={asset.member_item_id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isAssetSelected}
                    className={pulseClassName}
                    onClick={() => onSelectAsset(parsedItemId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectAsset(parsedItemId);
                      }
                    }}
                    style={{
                      minHeight: validAssets.length === 1 ? '296px' : '286px',
                      borderRadius: '26px',
                      cursor: 'pointer',
                      ...(!shouldPulseHint
                        ? {
                            border: isAssetSelected
                              ? (finalPreview.isWaitlist ? '3px solid #d97706' : '3px solid #059669')
                              : '3px solid #e5e7eb',
                            background: isAssetSelected
                              ? (finalPreview.isWaitlist ? '#fffbeb' : '#ecfdf5')
                              : '#fafafa',
                            boxShadow: isAssetSelected
                              ? (finalPreview.isWaitlist
                                  ? '0 0 0 4px rgba(217, 119, 6, 0.22), 0 16px 34px rgba(217, 119, 6, 0.24)'
                                  : '0 0 0 4px rgba(5, 150, 105, 0.22), 0 16px 34px rgba(5, 150, 105, 0.24)')
                              : '0 2px 8px rgba(0, 0, 0, 0.03)',
                            opacity: isAssetSelected ? 1 : 0.78,
                          }
                        : ({
                            '--card-stagger': `${(assetIdx % 6) * 0.28}s`,
                          } as React.CSSProperties)),
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '22px 24px',
                      boxSizing: 'border-box',
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.985)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
                  >
                    {/* 1단: 정형화된 유형 라벨 + 우측 선택 상태 캡슐 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            background: isAssetSelected
                              ? (finalPreview.isWaitlist ? '#d97706' : '#059669')
                              : passMeta.accent,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#6e6e73', letterSpacing: '-0.2px' }}>
                          {passMeta.label}
                        </span>
                      </div>

                      {isAssetSelected ? (
                        <span
                          style={{
                            padding: '7px 16px',
                            borderRadius: '999px',
                            background: finalPreview.isWaitlist ? '#d97706' : '#059669',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '18px',
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Check size={18} strokeWidth={3.2} />
                          <span>{lang === 'KO' ? '선택됨' : 'Selected'}</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '7px 16px',
                            borderRadius: '999px',
                            border: shouldPulseHint
                              ? (finalPreview.isWaitlist ? '2px solid #f59e0b' : '2px solid #10b981')
                              : '2px solid #d1d5db',
                            background: shouldPulseHint
                              ? (finalPreview.isWaitlist ? '#fef3c7' : '#d1fae5')
                              : '#ffffff',
                            color: shouldPulseHint
                              ? (finalPreview.isWaitlist ? '#92400e' : '#065f46')
                              : '#6e6e73',
                            boxShadow: shouldPulseHint
                              ? (finalPreview.isWaitlist
                                  ? '0 3px 10px rgba(217, 119, 6, 0.16)'
                                  : '0 3px 10px rgba(5, 150, 105, 0.16)')
                              : 'none',
                            fontSize: '18px',
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                          }}
                        >
                          {lang === 'KO' ? '터치 선택' : 'Select'}
                        </span>
                      )}
                    </div>

                    {/* 2단: 대형 상품명 + 잔여 가치·1회 배정시간 KPI */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        style={{
                          fontSize: '30px',
                          fontWeight: 900,
                          color: '#1d1d1f',
                          letterSpacing: '-0.7px',
                          lineHeight: 1.2,
                          wordBreak: 'keep-all',
                        }}
                      >
                        {asset.prod_nm || asset.item_name}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                        {remainingText && (
                          <span
                            style={{
                              fontSize: '25px',
                              fontWeight: 900,
                              color: finalPreview.isWaitlist ? '#b45309' : '#059669',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {remainingText}
                          </span>
                        )}
                        {remainingText && (
                          <span style={{ fontSize: '22px', color: '#d1d5db', fontWeight: 700 }}>·</span>
                        )}
                        <span
                          style={{
                            fontSize: '23px',
                            fontWeight: 800,
                            color: '#1d1d1f',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          1회 {assetDurationMin}분
                        </span>
                      </div>

                      {isExceedingBayLimit && (
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 800,
                            color: '#b45309',
                            background: '#fef3c7',
                            border: '1px solid #fcd34d',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            width: 'fit-content',
                          }}
                        >
                          최대 {bayMaxMin}분 가능 (다음예약 {nextResStartStr})
                        </div>
                      )}
                    </div>

                    {/* 3단: 정형화 2열 스노우 푸터 — 좌(요일/유효기간) · 우(고정 예상시간) */}
                    <div
                      style={{
                        background: isAssetSelected ? '#ffffff' : '#f5f5f7',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        border: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                        <div style={{ fontSize: '15.5px', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {daysLabel} · {timeLabel}
                          {typeof dailyLimit === 'number' && dailyLimit > 0 ? ` · 1일 ${dailyLimit}회` : ''}
                        </div>
                        <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#6e6e73', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          유효기간 {fullValidityText}
                        </div>
                      </div>

                      {selectedBayNo !== null && cardPreview.endHhmm && (
                        <div
                          style={{
                            flexShrink: 0,
                            textAlign: 'right',
                            paddingLeft: '12px',
                            borderLeft: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#6e6e73', marginBottom: '2px' }}>
                            {cardPreview.isWaitlist ? '대기 예상' : '예상 시간'}
                          </div>
                          <div
                            style={{
                              fontSize: '20px',
                              fontWeight: 900,
                              color: cardPreview.isWaitlist ? '#b45309' : '#059669',
                              fontVariantNumeric: 'tabular-nums',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.1,
                            }}
                          >
                            {cardPreview.timeRangeLabel}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {/* 제약 위반으로 현재 배정 불가한 이용권 안내 카드 (1장 보유 시에도 전체 폭 균형 유지) */}
              {disabledAssets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  {disabledAssets.map((asset) => (
                    <div
                      key={`disabled-${asset.member_item_id}`}
                      style={{
                        width: '100%',
                        borderRadius: '22px',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f5f5f7',
                        opacity: 0.78,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        padding: '18px 24px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '24px', fontWeight: 800, color: '#4b5563' }}>
                          {asset.prod_nm || asset.item_name}
                        </span>
                        <span style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626' }}>
                          {asset.unassignable_reason}
                        </span>
                      </div>
                      <span style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 14px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        현재 선택 불가
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* [최종 배정 확인 서머리 독] — 카드 선택 시 시맨틱 틴트로 시선을 하단 확정 버튼으로 연결 */}
        {selectedBayNo !== null && validAssets.length > 0 && (
          <div
            data-testid="asset-final-confirmation-dock"
            style={{
              borderRadius: '26px',
              background: finalPreview.isWaitlist
                ? '#fffbeb'
                : (selectedAssetObj ? '#f0fdf6' : '#f5f5f7'),
              border: finalPreview.isWaitlist
                ? '2px solid #d97706'
                : (selectedAssetObj ? '2px solid #6ee7b7' : '1.5px solid #e5e7eb'),
              padding: '20px 26px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'background-color 200ms ease, border-color 200ms ease',
            }}
          >
            {(finalPreview.isWaitlist || (selectedAssetObj && finalPreview.isTruncated)) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                {finalPreview.isWaitlist && (
                  <span style={{ fontSize: '20px', fontWeight: 900, color: '#b45309' }}>
                    대기 예약 · 약 {finalPreview.waitMinutes}분 대기 후 {finalPreview.startHhmm} 시작
                  </span>
                )}
                {selectedAssetObj && finalPreview.isTruncated && (
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#b45309' }}>
                    {finalPreview.truncateReason === 'NEXT_RESERVATION' ? '다음 예약' : '영업 마감'} 일정으로 최대 {finalPreview.effectiveDurationMin}분 단축
                  </span>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
                background: '#ffffff',
                borderRadius: '20px',
                padding: '20px 26px',
                border: finalPreview.isWaitlist
                  ? '1.5px solid #fde68a'
                  : (selectedAssetObj ? '1.5px solid #a7f3d0' : '1.5px solid #e5e7eb'),
                transition: 'border-color 200ms ease',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: '#6e6e73' }}>배정 타석</span>
                <span style={{ fontSize: '44px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
                  {finalPreview.floorLabel ? `${finalPreview.floorLabel} · ` : ''}{bayShortLabel}
                </span>
              </div>

              <div style={{ width: '1.5px', height: '58px', background: '#e5e7eb', flexShrink: 0 }} />

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', gap: '4px' }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: '#6e6e73' }}>
                  {finalPreview.isWaitlist ? '대기 이용 시간' : '이용 시간'}
                </span>
                {selectedAssetObj && finalPreview.endHhmm ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span
                      data-testid="asset-final-time-range"
                      style={{
                        fontSize: '44px',
                        fontWeight: 900,
                        color: finalPreview.isWaitlist ? '#b45309' : '#059669',
                        letterSpacing: '-1px',
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1.05,
                      }}
                    >
                      {finalPreview.startHhmm} ~ {finalPreview.endHhmm}
                    </span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#4b5563' }}>
                      ({finalPreview.effectiveDurationMin}분{finalPreview.prepareMin > 0 ? ` + 준비 ${finalPreview.prepareMin}분` : ''})
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '28px', fontWeight: 800, color: '#86868b' }}>
                    이용권 선택 시 시간 표시
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 하단 초대형 액션 버튼 영역 (108px · 외곽 헤일로 링 잘림 방지를 위한 안전 패딩 확보) */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '2px',
            padding: '10px 8px 8px 4px',
            marginLeft: '-4px',
            marginRight: '-4px',
            width: 'calc(100% + 8px)',
            boxSizing: 'border-box',
          }}
        >
          <button 
            type="button"
            onClick={onCancel}
            style={{
              flex: 0.7,
              height: '108px',
              borderRadius: '999px',
              background: '#f5f5f7',
              color: '#1d1d1f',
              border: '1.5px solid #d1d5db',
              fontSize: '28px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease, transform 0.15s ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = '#e5e5ea'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = '#f5f5f7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = '#f5f5f7'; }}
          >
            {lang === 'KO' ? '취소' : 'Cancel'}
          </button>

          <button 
            key={selectedAssetId !== null ? `cta-ready-${selectedAssetId}` : 'cta-idle'}
            type="button"
            data-testid="asset-confirm-cta-btn"
            disabled={selectedAssetId === null}
            onClick={() => selectedAssetId !== null && onConfirm(selectedAssetId)}
            className={
              selectedAssetId !== null
                ? `asset-cta-btn ${finalPreview.isWaitlist ? 'asset-cta-ready-amber' : 'asset-cta-ready'}`
                : 'asset-cta-btn'
            }
            style={{
              flex: 2.5,
              height: '108px',
              borderRadius: '999px',
              ...(selectedAssetId === null
                ? {
                    background: '#f1f5f9',
                    border: '1.5px solid #e2e8f0',
                    boxShadow: 'none',
                  }
                : {
                    border: 'none',
                  }),
              color: selectedAssetId !== null ? '#ffffff' : '#64748b',
              fontSize: '30px',
              fontWeight: 900,
              letterSpacing: '-0.8px',
              cursor: selectedAssetId !== null ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 32px',
            }}
          >
            {selectedAssetId !== null && (
              <span className="asset-cta-sheen-clip" aria-hidden="true" />
            )}
            <span
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                maxWidth: '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAssetName
                  ? (lang === 'KO'
                      ? (selectedBayNo !== null && finalPreview.endHhmm
                          ? `${bayShortLabel} · ${finalPreview.timeRangeLabel} ${finalPreview.modeActionLabel}`
                          : `${selectedAssetName} (${selectedAssetMin}분) ${finalPreview.modeActionLabel}`)
                      : `Confirm ${finalPreview.modeCode} [${bayShortLabel} · ${finalPreview.timeRangeLabel}]`)
                  : (lang === 'KO' ? '위 보유 이용권을 눌러주세요' : 'Please tap a pass card above first')}
              </span>
              {selectedAssetId !== null && (
                <ArrowRight
                  size={32}
                  strokeWidth={3}
                  className="asset-cta-arrow"
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
