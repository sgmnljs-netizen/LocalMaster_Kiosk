import React from 'react';
import { UserCheck, Check, X, AlertTriangle, CreditCard, Hand, Clock, Calendar, RefreshCw } from 'lucide-react';
import { Member, MemberAsset, Bay } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';
import { parseNullableFloorNumber } from '../utils/floorUtils';
import { normalizeYmdDigits } from '../utils/kioskPurchaseEligibility';

const DEFAULT_SESSION_MIN = 60;

/** 샴페인 플래티넘 메탈 스마트 IC 칩 (EMV Chip) 그래픽 */
const EmvChip: React.FC = () => (
  <svg width="36" height="26" viewBox="0 0 36 26" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <rect width="36" height="26" rx="5" fill="url(#chip-grad)" stroke="#ca8a04" strokeWidth="1.2" />
    <path d="M11 0V26M25 0V26M0 13H36M11 8H25M11 18H25" stroke="#a16207" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
    <rect x="13" y="8.5" width="10" height="9" rx="2" fill="#fef9c3" stroke="#ca8a04" strokeWidth="0.8" />
    <defs>
      <linearGradient id="chip-grad" x1="0" y1="0" x2="36" y2="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fef9c3" />
        <stop offset="0.5" stopColor="#fef08a" />
        <stop offset="1" stopColor="#fde047" />
      </linearGradient>
    </defs>
  </svg>
);

export interface AssetSelectModalProps {
  authMember: Member;
  selectedBayNo: number | null;
  bays: Bay[];
  lang?: 'KO' | 'EN';
  selectedAssetId: number | null;
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

export const AssetSelectModal: React.FC<AssetSelectModalProps> = ({
  authMember,
  selectedBayNo,
  bays,
  lang = 'KO',
  selectedAssetId,
  onSelectAsset,
  onConfirm,
  onCancel,
  onSwitchToDaily,
  onChangeBay
}) => {
  const currentBayObj = bays.find(b => b.bay_no === selectedBayNo);
  const targetZoneCode = currentBayObj?.zone_code?.toUpperCase() || 'BAY';
  const rawFloor = currentBayObj?.floor_no ?? currentBayObj?.floor;
  const bayMaxMin = currentBayObj?.max_assignable_min;
  const nextResStartStr = currentBayObj?.next_limit_res_start_time || '예정';

  const todayDigits = normalizeYmdDigits(TimeMaster.getKstYmd(TimeMaster.getSyncedDate()));

  const getFloorMismatchReason = (asset: MemberAsset): string | null =>
    evaluateAssetFloorMismatchReason(asset, rawFloor);

  // 1. 유효 배정 가능 이용권 필터링 (SSOT logic_type / access_rules / 미래 개시일 이중 방어)
  const validAssets = (authMember.assets || []).filter(asset => {
    if (asset.is_assignable === false) return false;
    const startDigits = normalizeYmdDigits(asset.start_date);
    if (todayDigits && startDigits && startDigits > todayDigits) return false;
    const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
    if (logicType === 'COUNT' || logicType === 'COUPON') {
      const cnt = asset.remain_cnt ?? asset.rem_count ?? 0;
      if (cnt <= 0) return false;
    } else if (logicType === 'TIME') {
      const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
      if (remMin <= 0) return false;
    } else if (asset.remain_days !== undefined && asset.remain_days !== null && asset.remain_days < 0) {
      return false;
    }
    if (getFloorMismatchReason(asset) !== null) return false;
    if (!asset.allowed_categories || asset.allowed_categories.length === 0) return true;
    const allowedUpper = asset.allowed_categories.map(c => c.toUpperCase());
    return allowedUpper.includes(targetZoneCode);
  });

  // 배정 불가(제약 위반 및 층 불일치) 이용권 목록
  const disabledAssets = (authMember.assets || []).flatMap(asset => {
    if (asset.is_assignable === false && Boolean(asset.unassignable_reason)) {
      return [asset];
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box'
      }}
    >
      {/* 🍏 애플 미니멀 럭셔리 대형 Bento 화이트 솔리드 시트 (940px) */}
      <div 
        style={{
          width: '940px',
          maxWidth: '96%',
          background: '#ffffff',
          borderRadius: '40px',
          border: '1.5px solid #e5e5ea',
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.25)',
          padding: '44px 44px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          color: '#1d1d1f',
          position: 'relative',
          boxSizing: 'border-box'
        }}
      >
        {/* 상단 헤더: 타이틀 + 안내문 + 우측 상단 56px 원형 닫기 버튼 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-1px', margin: 0 }}>
              {lang === 'KO' ? '보유 이용권 선택' : 'Select Active Pass'}
            </h2>
            <p style={{ fontSize: '18px', color: '#86868b', fontWeight: 600, margin: 0 }}>
              {lang === 'KO' 
                ? '배정에 사용할 멤버십 회원권을 터치해 주세요.' 
                : 'Please touch your VIP membership card to allocate.'}
            </p>
          </div>

          {/* 닫기 버튼 (56px 애플 볼드 원형 버튼) */}
          <button
            onClick={onCancel}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#f5f5f7',
              border: '1.5px solid #e5e5ea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#1d1d1f',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
              flexShrink: 0
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = '#e5e5ea'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
          >
            <X size={28} strokeWidth={2.4} />
          </button>
        </div>

        {/* 🌟 회원이름 시각적 강화를 위한 대형 프로필 뱃지 */}
        <div 
          style={{
            background: 'linear-gradient(135deg, rgba(52, 199, 89, 0.12) 0%, rgba(5, 150, 105, 0.06) 100%)',
            border: '1.5px solid rgba(52, 199, 89, 0.35)',
            padding: '18px 24px',
            borderRadius: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 15px rgba(52, 199, 89, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{ 
                background: '#059669', 
                padding: '12px', 
                borderRadius: '50%', 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                boxShadow: '0 6px 16px rgba(5, 150, 105, 0.32)' 
              }}
            >
              <UserCheck size={28} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#111827', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#059669', textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                  {authMember.member_name}
                </span> 님
                <span style={{ fontSize: '14px', background: '#059669', color: '#ffffff', padding: '4px 12px', borderRadius: '12px', fontWeight: 800, letterSpacing: '0.5px' }}>
                  {lang === 'KO' ? '인증 성공' : 'Verified'}
                </span>
              </div>
              <div style={{ fontSize: '15px', color: '#6b7280', fontWeight: 600, marginTop: '3px' }}>
                회원번호: {authMember.member_no} {authMember.member_grade ? `| 등급: ${authMember.member_grade}` : ''}
              </div>
            </div>
          </div>

          {selectedBayNo && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>선택 타석</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1d1d1f' }}>{selectedBayNo}번 타석</div>
            </div>
          )}
        </div>

        {/* 연쇄 배정 시간 제약 안내 바 */}
        {currentBayObj && typeof currentBayObj.max_assignable_min === 'number' && currentBayObj.max_assignable_min > 0 && (
          <div 
            style={{
              background: '#fffbeb',
              border: '1.5px solid #fcd34d',
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
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#b45309', lineHeight: 1.4 }}>
                선택하신 {currentBayObj.bay_no}번 타석은 다음 예약({currentBayObj.next_limit_res_start_time || '예정'}) 전까지 최대 [{currentBayObj.max_assignable_min}분] 이용 가능합니다.
              </span>
            </div>
            <button
              type="button"
              onClick={onChangeBay}
              style={{
                padding: '10px 18px',
                borderRadius: '999px',
                background: '#d97706',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)'
              }}
            >
              다른 타석 선택
            </button>
          </div>
        )}

        {/* 💳 실제 신용카드 황금비(1.58 : 1) 가로 2열 나란히 덱 영역 */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: validAssets.length === 1 ? 'minmax(0, 440px)' : 'repeat(2, 1fr)',
            justifyContent: 'center',
            gap: '18px',
            maxHeight: '560px',
            overflowY: 'auto',
            padding: '8px 8px',
            boxSizing: 'border-box'
          }}
        >
          {validAssets.length === 0 ? (
            <div 
              style={{
                gridColumn: '1 / -1',
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
                background: '#fafafc'
              }}
            >
              <CreditCard size={48} strokeWidth={1.8} style={{ color: '#cbd5e1' }} />
              <div>
                {lang === 'KO' 
                  ? '해당 타석에서 사용할 수 있는 이용권이 없습니다.' 
                  : 'No active pass items found for this zone.'}
              </div>
              {(() => {
                const unassignableReasons = (authMember.assets || [])
                  .filter(a => a.is_assignable === false && a.unassignable_reason)
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
                onClick={onSwitchToDaily}
                style={{
                  padding: '16px 36px',
                  borderRadius: '999px',
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '18px',
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
              {validAssets.map((asset) => {
                const isAssetSelected = selectedAssetId === parseInt(asset.member_item_id);
                const assetDurationMin = asset.duration_min ?? DEFAULT_SESSION_MIN;
                const isExceedingBayLimit = typeof bayMaxMin === 'number' && bayMaxMin > 0 && assetDurationMin > bayMaxMin;
                const logicType = (asset.logic_type || 'PERIOD').toUpperCase();
                const remCount = asset.remain_cnt ?? asset.rem_count ?? 0;
                const totalCount = asset.total_count ?? 0;
                const remMin = asset.remain_min ?? asset.remain_cnt ?? asset.rem_count ?? 0;
                const remainDays = asset.remain_days;
                const daysLabel = asset.available_days_label || (lang === 'KO' ? '매일 이용' : 'Everyday');
                const timeLabel = asset.available_time_label || (lang === 'KO' ? '전 시간(종일)' : 'All Day');
                const dailyLimit = asset.daily_limit_count;
                const startStr = asset.start_date || asset.start_dt;
                const expiryStr = asset.expiry_date || asset.end_date || asset.end_dt || authMember.expiry_date || '~';
                const fullValidityText = startStr ? `${startStr} ~ ${expiryStr}` : `~ ${expiryStr}`;

                return (
                  <div
                    key={asset.member_item_id}
                    onClick={() => onSelectAsset(parseInt(asset.member_item_id))}
                    style={{
                      height: '258px',
                      borderRadius: '22px',
                      cursor: 'pointer',
                      border: isAssetSelected 
                        ? '2.5px solid #059669' 
                        : '1.5px solid #e2e8f0',
                      background: isAssetSelected
                        ? '#ffffff'
                        : 'linear-gradient(135deg, #ffffff 0%, #fbfcfd 45%, #f4f6f8 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '20px 22px 16px 22px',
                      boxSizing: 'border-box',
                      transition: 'all 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
                      boxShadow: isAssetSelected 
                        ? '0 16px 36px rgba(5, 150, 105, 0.16), 0 2px 8px rgba(0, 0, 0, 0.04)' 
                        : '0 8px 24px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.03)',
                      transform: isAssetSelected ? 'translateY(-3px)' : 'none',
                      position: 'relative'
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.985)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = isAssetSelected ? 'translateY(-3px)' : 'none'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = isAssetSelected ? 'translateY(-3px)' : 'none'; }}
                  >
                    {/* [1단: 카드 헤더 — 플래티넘 스마트 IC 칩 & 각인 & 선택 배지] */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <EmvChip />
                        <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', letterSpacing: '1.2px' }}>
                          VIP PASS
                        </span>
                      </div>

                      {isAssetSelected ? (
                        <div 
                          style={{ 
                            padding: '6px 14px',
                            borderRadius: '999px', 
                            background: '#059669',
                            color: '#ffffff',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            gap: '5px',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.32)',
                            flexShrink: 0
                          }}
                        >
                          <Check size={14} strokeWidth={3.2} style={{ color: '#ffffff' }} />
                          <span style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
                            {lang === 'KO' ? '선택됨' : 'Selected'}
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: '5px 12px',
                            borderRadius: '999px',
                            border: '1.5px solid #d2d2d7',
                            background: '#ffffff',
                            color: '#86868b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            flexShrink: 0
                          }}
                        >
                          <div style={{ width: '11px', height: '11px', borderRadius: '50%', border: '1.5px solid #c7c7cc' }} />
                          <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {lang === 'KO' ? '선택' : 'Select'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* [2단: 카드 본체 — 볼드 상품명 & 1회 배정시간 시그니처 뱃지 & 1열 혜택 라인] */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', marginTop: '4px' }}>
                      {/* 타이틀 행: 상품명 + 1회 배정시간 뱃지 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ 
                          fontSize: '24px', 
                          fontWeight: 900, 
                          color: '#0f172a',
                          letterSpacing: '-0.6px',
                          lineHeight: 1.2
                        }}>
                          {asset.prod_nm || asset.item_name}
                        </span>

                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          background: isAssetSelected ? '#ecfdf5' : '#f1f5f9',
                          color: isAssetSelected ? '#047857' : '#1e293b',
                          border: isAssetSelected ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                          flexShrink: 0
                        }}>
                          <Clock size={13} strokeWidth={2.4} style={{ color: '#059669' }} />
                          <span>1회 {assetDurationMin}분 배정</span>
                        </span>
                      </div>

                      {/* 1열 가로 시원한 혜택 나열 라인 (더이상 뭉치지 않고 1열로 쭉 펼침) */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '7px',
                        flexWrap: 'nowrap',
                        whiteSpace: 'nowrap',
                        fontSize: '12.5px', 
                        color: '#475569', 
                        fontWeight: 700,
                        padding: '2px 0'
                      }}>
                        {(logicType === 'COUNT' || logicType === 'COUPON') && (
                          <span>🎫 잔여 <strong style={{ color: '#047857' }}>{remCount}회</strong>{totalCount > 0 ? `/${totalCount}회` : ''}</span>
                        )}
                        {(logicType === 'PERIOD' || logicType === 'MEMBERSHIP') && remainDays !== undefined && remainDays !== null && (
                          <span>📅 잔여 <strong style={{ color: '#047857' }}>{remainDays}일</strong></span>
                        )}
                        {logicType === 'TIME' && (
                          <span>⏳ 잔여 <strong style={{ color: '#047857' }}>{remMin}분</strong></span>
                        )}
                        <span style={{ color: '#cbd5e1' }}>·</span>
                        <span>📆 {daysLabel.replace(' 이용', '')}</span>
                        <span style={{ color: '#cbd5e1' }}>·</span>
                        <span>⏰ {timeLabel.replace('(종일)', '').replace('전 시간', '종일')}</span>
                        {typeof dailyLimit === 'number' && dailyLimit > 0 && (
                          <>
                            <span style={{ color: '#cbd5e1' }}>·</span>
                            <span>🔄 1일 {dailyLimit}회</span>
                          </>
                        )}
                      </div>

                      {isExceedingBayLimit && (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#b45309',
                          background: '#fef3c7',
                          border: '1px solid #fcd34d',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          width: 'fit-content'
                        }}>
                          ⚠️ 최대 {bayMaxMin}분 가능 (다음예약 {nextResStartStr})
                        </span>
                      )}
                    </div>

                    {/* [3단: 카드 푸터 — 명확한 한글 유효기간 풀 표기 (HOLDER 제거)] */}
                    <div 
                      style={{ 
                        borderTop: '1px solid #f1f5f9', 
                        paddingTop: '10px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        width: '100%'
                      }}
                    >
                      <div style={{ 
                        fontSize: '13.5px', 
                        fontWeight: 800, 
                        color: isAssetSelected ? '#047857' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Calendar size={14} strokeWidth={2.4} style={{ color: isAssetSelected ? '#059669' : '#94a3b8' }} />
                        <span>유효기간:</span>
                        <span style={{ color: '#0f172a' }}>{fullValidityText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 배정 불가 이용권 카드 */}
              {disabledAssets.map((asset) => (
                <div
                  key={`disabled-${asset.member_item_id}`}
                  style={{
                    height: '258px',
                    borderRadius: '22px',
                    border: '1.5px dashed #cbd5e1',
                    background: '#f8fafc',
                    opacity: 0.7,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '20px 22px 16px 22px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <EmvChip />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1px' }}>VIP PASS</span>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontSize: '12px',
                      fontWeight: 800
                    }}>
                      선택 불가
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#64748b' }}>
                      {asset.prod_nm || asset.item_name}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
                      ⚠️ {asset.unassignable_reason}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
                    유효기간: {asset.expiry_date || '~'}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 🔘 하단 액션 버튼 영역 (애플 999px 풀와이드 알약 버튼) */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '6px', width: '100%' }}>
          <button 
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: '72px',
              borderRadius: '999px',
              background: '#f5f5f7',
              color: '#1d1d1f',
              border: '1.5px solid #d2d2d7',
              fontSize: '20px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.background = '#e5e5ea'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.background = '#f5f5f7'; }}
          >
            {lang === 'KO' ? '취소' : 'Cancel'}
          </button>

          <button 
            type="button"
            disabled={selectedAssetId === null}
            onClick={() => selectedAssetId !== null && onConfirm(selectedAssetId)}
            style={{
              flex: 2.2,
              height: '72px',
              borderRadius: '999px',
              background: selectedAssetId !== null ? '#1d1d1f' : '#cbd5e1',
              color: '#ffffff',
              border: 'none',
              fontSize: '22px',
              fontWeight: 900,
              letterSpacing: '-0.5px',
              cursor: selectedAssetId !== null ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: selectedAssetId !== null ? '0 12px 28px rgba(0, 0, 0, 0.24)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
            onMouseDown={(e) => {
              if (selectedAssetId !== null) {
                e.currentTarget.style.transform = 'scale(0.97)';
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseUp={(e) => {
              if (selectedAssetId !== null) {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.opacity = '1';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedAssetId !== null) {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.opacity = '1';
              }
            }}
          >
            {selectedAssetId !== null && (
              <Hand size={24} className="animate-hand-tap" style={{ color: '#34c759', flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedAssetName
                ? (lang === 'KO'
                    ? `[${selectedAssetName} · ${selectedAssetMin}분] 선택 완료 — 배정하기`
                    : `Allocate [${selectedAssetName} · ${selectedAssetMin}m]`)
                : (lang === 'KO' ? '멤버십 카드를 먼저 선택해 주세요' : 'Select a VIP Card First')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
