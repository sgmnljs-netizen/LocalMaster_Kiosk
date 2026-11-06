import React, { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, KeyRound, ShieldAlert } from 'lucide-react';
import { api, Locker, Member, Product } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';
import {
  evaluateLockerRenewalWindow,
  isKioskLockerExtensionProduct,
  resolveLockerExtendDays,
} from '../utils/kioskPurchaseEligibility';

interface LockerExtendProps {
  member?: Member | null;
  memberNo: string;
  memberName: string;
  discountRate?: number;
  lang?: 'KO' | 'EN';
  onLockerPaymentTriggered: (lockerNo: number, prod: Product, extendDays: number, displayLockerNo?: string) => Promise<void> | void;
  onCancel: () => void;
}

const formatYmdDisplay = (raw?: string | null): string => {
  const cleaned = String(raw || '').trim();
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }
  return cleaned || '-';
};

const parseLocalYmd = (raw?: string | null): Date | null => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6)) - 1;
  const d = Number(digits.slice(6, 8));
  const dt = new Date(y, m, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const normalizeGenderCode = (val?: string | null): 'M' | 'F' | '' => {
  const v = String(val || '').trim().toUpperCase();
  if (v === 'M' || v === 'MALE' || v === '남' || v === '남성' || v === '남자') return 'M';
  if (v === 'F' || v === 'FEMALE' || v === '여' || v === '여성' || v === '여자') return 'F';
  return '';
};

const parseProductJsonSafe = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const getLockerKey = (locker: Locker): string => {
  const idPart = locker.locker_id;
  const noPart = locker.display_no || locker.locker_no;
  return idPart !== undefined && idPart !== null ? `ID:${idPart}:NO:${noPart}` : `NO:${noPart}`;
};

export const LockerExtend: React.FC<LockerExtendProps> = ({
  member,
  memberNo,
  memberName,
  discountRate,
  lang = 'KO',
  onLockerPaymentTriggered,
  onCancel
}) => {
  const isEn = lang === 'EN';
  const [myLockers, setMyLockers] = useState<Locker[]>([]);
  const [lockerProducts, setLockerProducts] = useState<Product[]>([]);
  const [selectedLockerKey, setSelectedLockerKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isSubmittingRef = useRef(false);

  const effDiscountRate = discountRate ?? member?.discount_rate ?? 0;

  const loadLockerData = async () => {
    setLoading(true);
    try {
      const effMemberNo = member?.member_no || memberNo;
      // 1. 내 라카 찾기 (회원번호로 조회)
      let foundLockers = await api.getMemberLockers(effMemberNo);
      const memberLockerInfo = member?.locker_info;

      // 🛡️ [BUG-L02 FIX] 온라인 상태에서는 백엔드(/v1/kiosk/members/{member_no}/lockers)가 유예기간 경과 여부를 검증한 단일 진실 공급원(SSOT)이므로,
      // 오프라인 폴백 모드(!api.isOnline)일 때만 member.locker_info 캐시를 사용하고 상태값 및 알파뉴메릭 번호를 안전하게 보존한다.
      if ((!foundLockers || foundLockers.length === 0) && !api.isOnline && memberLockerInfo) {
        const rawStatus = String(memberLockerInfo.status || 'IN_USE').toUpperCase();
        const rawDisplayNo = String(memberLockerInfo.locker_no ?? memberLockerInfo.locker_id ?? '').trim();
        const numericDigits = rawDisplayNo.replace(/[^0-9]/g, '');
        const parsedId = Number(memberLockerInfo.locker_id || numericDigits || 0);
        if (rawDisplayNo && ['OCCUPIED', 'EXPIRED', 'IN_USE'].includes(rawStatus)) {
          foundLockers = [
            {
              locker_id: parsedId > 0 ? parsedId : undefined,
              locker_no: rawDisplayNo,
              display_no: rawDisplayNo,
              group_id: memberLockerInfo.group_id,
              zone_name: memberLockerInfo.zone_name,
              status: rawStatus === 'EXPIRED' ? 'EXPIRED' : 'OCCUPIED',
              member_no: effMemberNo,
              member_name: member?.member_name || memberName,
              end_dt: memberLockerInfo.end_dt || memberLockerInfo.expiry_date || '',
            }
          ];
        } else {
          foundLockers = [];
        }
      }
      setMyLockers(foundLockers);

      if (foundLockers.length > 0) {
        setSelectedLockerKey(getLockerKey(foundLockers[0]));
      } else {
        setSelectedLockerKey(null);
      }

      // 2. 라카 연장 전용 상품 목록 로드 (주차권 PARKING / 보관함 STORAGE / 단독 보증금 DEPOSIT / 일일 타석·파3 FACILITY 혼입 차단 + KIOSK 판매채널 검증)
      const allProds = await api.getProducts();
      const lockerProds = allProds.filter((p) => isKioskLockerExtensionProduct(p));
      setLockerProducts(lockerProds);

    } catch {
      setErrorMsg(isEn ? 'Failed to load locker data.' : '라카 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLockerData();
  }, [memberNo, member]);

  const selectedLockerObj: Locker | undefined =
    myLockers.find(l => getLockerKey(l) === selectedLockerKey) || myLockers[0];

  // 🛡️ [BUG-L04 FIX] 선택된 라카의 구역(group_id) 및 회원의 성별(gender)에 맞지 않는 상품은 사전 필터링하여 결제 후 망취소 방지
  const visibleLockerProducts = lockerProducts.filter(prod => {
    const rulesObj = parseProductJsonSafe(prod.access_rules);
    const allowedZones = rulesObj.allowed_zones;
    if (Array.isArray(allowedZones) && allowedZones.length > 0 && selectedLockerObj?.group_id) {
      const normalizedAllowed = allowedZones.map(z => String(z).trim().toUpperCase());
      const lockerGroup = String(selectedLockerObj.group_id).trim().toUpperCase();
      if (!normalizedAllowed.includes(lockerGroup)) {
        return false;
      }
    }
    const memberGender = normalizeGenderCode(member?.gender);
    const prodGender = normalizeGenderCode(rulesObj.restricted_gender || prod.target_gender);
    if (memberGender && prodGender && memberGender !== prodGender) {
      return false;
    }
    return true;
  });

  const todayKstYmd = TimeMaster.getKstYmd(new Date());
  const todayDate = parseLocalYmd(todayKstYmd) || new Date();
  todayDate.setHours(0, 0, 0, 0);

  const selectedLockerParsedEnd = parseLocalYmd(selectedLockerObj?.end_dt);
  const selectedLockerDiffDays = selectedLockerParsedEnd
    ? Math.round((selectedLockerParsedEnd.getTime() - todayDate.getTime()) / 86400000)
    : null;

  const computeProjectedEndYmd = (locker: Locker | undefined, extendDays: number): { currentYmd: string; nextYmd: string } => {
    const currentYmd = formatYmdDisplay(locker?.end_dt);
    const parsedEnd = parseLocalYmd(locker?.end_dt);
    const isUnexpired = Boolean(parsedEnd && parsedEnd.getTime() >= todayDate.getTime());
    const targetDate = new Date(todayDate);
    if (isUnexpired && parsedEnd) {
      targetDate.setTime(parsedEnd.getTime());
      targetDate.setDate(targetDate.getDate() + extendDays);
    } else {
      targetDate.setDate(targetDate.getDate() + Math.max(0, extendDays - 1));
    }
    return {
      currentYmd,
      nextYmd: TimeMaster.getKstYmd(targetDate)
    };
  };

  // 연장 실행 트리거 (한 번에 1개의 상품만 연장, 동기 Ref 가드로 연타 차단)
  const handleExtendClick = async (prod: Product) => {
    if (isSubmittingRef.current) return;
    setErrorMsg('');

    if (myLockers.length === 0) {
      setErrorMsg(
        isEn
          ? 'No active locker available for extension. Please contact the front desk.'
          : '연장할 수 있는 라카가 없습니다. 신규 대여는 데스크로 문의해주세요.'
      );
      return;
    }

    const selectedObj = selectedLockerObj;
    if (!selectedObj) {
      setErrorMsg(isEn ? 'Please select a locker to extend.' : '연장할 라카를 선택해주세요.');
      return;
    }

    // 🛡️ [P1-3-B] 어드민 연장 가능 기간(renewal_available_days) 사전 가드
    const renewalEval = evaluateLockerRenewalWindow(prod, selectedLockerDiffDays, lang);
    if (!renewalEval.canRenewNow) {
      setErrorMsg(
        renewalEval.reasonMessage ||
          (isEn
            ? 'This locker is not yet within the renewal window.'
            : '아직 연장 가능한 기간이 아닙니다.')
      );
      return;
    }

    // 🛡️ [BUG-L01 FIX] 다중 라카 보유 시 member.locker_info(첫 번째 라카)가 아닌 사용자가 선택한 라카(selectedObj)를 최우선 참조
    const displayLockerNo = String(
      selectedObj.display_no ||
      selectedObj.locker_no ||
      selectedObj.locker_id ||
      ''
    ).trim();

    const numericDigits = displayLockerNo.replace(/[^0-9]/g, '');
    const targetLockerId =
      Number(selectedObj.locker_id) ||
      Number(selectedObj.locker_no) ||
      (numericDigits ? Number(numericDigits) : 0);

    if (!targetLockerId && !displayLockerNo) {
      setErrorMsg(isEn ? 'Please select a locker to extend.' : '연장할 라카를 선택해주세요.');
      return;
    }

    const resolvedExtendDays = resolveLockerExtendDays(prod);
    isSubmittingRef.current = true;
    try {
      await onLockerPaymentTriggered(targetLockerId, prod, resolvedExtendDays, displayLockerNo || String(targetLockerId));
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <div 
      style={{
        width: '1000px',
        margin: '0 auto',
        padding: '52px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "맑은 고딕", sans-serif'
      }}
    >
      {/* 헤더 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ 
            background: '#0071e3', 
            borderRadius: '50%', 
            width: '60px', height: '60px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0, 113, 227, 0.35)'
          }}>
            <KeyRound size={30} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
              {isEn ? 'Locker Extension' : '개인 사물함 연장'}
            </h2>
            <p style={{ fontSize: '21px', color: '#4b5563', margin: '4px 0 0 0', fontWeight: 600 }}>
              <strong style={{ color: '#111827' }}>{memberName}</strong> {isEn ? '— Active Lockers' : '님의 이용 중인 라카'}
            </p>
          </div>
        </div>

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
          {isEn ? 'Go Back' : '이전으로 돌아가기'}
        </button>
      </div>

      {/* 안내 메시지 */}
      <div style={{ 
        background: 'rgba(0, 113, 227, 0.05)', 
        padding: '24px 28px', 
        borderRadius: '18px', 
        border: '1px solid rgba(0, 113, 227, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ width: '5px', height: '100%', minHeight: '40px', background: '#0071e3', borderRadius: '3px' }}></div>
        <p style={{ fontSize: '20px', color: '#111827', margin: 0, lineHeight: 1.6, fontWeight: 600 }}>
          {isEn ? (
            <>
              <strong style={{ color: '#0071e3', fontWeight: 800 }}>Notice: </strong>Only <strong style={{ color: '#0071e3' }}>period extensions</strong> for currently assigned lockers are available at the kiosk. <br/>
              <span style={{ color: '#1f2937', fontWeight: 700 }}>(For new locker assignments or relocation, please visit the <strong style={{ color: '#0071e3', textDecoration: 'underline' }}>front desk</strong>.)</span>
            </>
          ) : (
            <>
              <strong style={{ color: '#0071e3', fontWeight: 800 }}>안내: </strong>키오스크에서는 기존 이용 중인 라카의 <strong style={{ color: '#0071e3' }}>기간 연장</strong>만 가능합니다. <br/>
              <span style={{ color: '#1f2937', fontWeight: 700 }}>(신규 라카 배정 및 자리 이동은 <strong style={{ color: '#0071e3', textDecoration: 'underline' }}>안내 데스크</strong>를 이용해 주세요.)</span>
            </>
          )}
        </p>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div style={{ background: '#fff0f0', padding: '16px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #ffc2c2' }}>
          <ShieldAlert size={22} color="#ff3b30" />
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#ff3b30' }}>{errorMsg}</span>
        </div>
      )}

      {/* 로딩 및 메인 콘텐츠 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '360px', fontSize: '19px', color: '#86868b', fontWeight: 600 }}>
          {isEn ? 'Loading locker information...' : '라카 정보를 불러오는 중입니다...'}
        </div>
      ) : myLockers.length === 0 ? (
        /* 🛡️ 라카 미보유 회원 전용 Full-Width Empty State 안내 뷰 */
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
          gap: '24px'
        }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            background: 'rgba(255, 159, 10, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255, 159, 10, 0.25)',
            boxShadow: '0 8px 24px rgba(255, 159, 10, 0.15)'
          }}>
            <KeyRound size={48} color="#ea580c" strokeWidth={2.4} />
          </div>

          <div>
            <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
              {isEn ? 'No Active Lockers Assigned' : '현재 이용 중인 개인 라카가 없습니다'}
            </h3>
            <p style={{ fontSize: '23px', color: '#1f2937', lineHeight: 1.75, margin: 0, fontWeight: 600, maxWidth: '720px' }}>
              {isEn ? (
                <>
                  <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName}</strong> does not have an active locker at this store.<br/>
                  The kiosk only supports <strong style={{ color: '#0071e3' }}>period extensions</strong> for currently assigned lockers.<br/>
                  To register a new locker or select a spot, please visit the <strong style={{ color: '#ea580c', textDecoration: 'underline' }}>front desk</strong>.
                </>
              ) : (
                <>
                  <strong style={{ color: '#111827', fontWeight: 800 }}>{memberName}</strong> 회원님은 현재 매장에 등록된 개인 라카가 없습니다.<br/>
                  무인 키오스크에서는 기존 이용 중인 라카의 <strong style={{ color: '#0071e3' }}>기간 연장만</strong> 지원하오니,<br/>
                  신규 라카 배정 및 위치 선택은 <strong style={{ color: '#ea580c', textDecoration: 'underline' }}>안내 데스크(카운터)</strong>를 이용해 주시기 바랍니다.
                </>
              )}
            </p>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button
              onClick={onCancel}
              style={{
                background: '#1d1d1f',
                color: '#ffffff',
                border: 'none',
                padding: '20px 48px',
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
              <span style={{ fontSize: '24px' }}>⛳</span>
              <span>{isEn ? 'Return to Main Dashboard' : '메인 화면으로 돌아가기'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* 라카 보유 회원용 2열 Bento Grid */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '32px' }}>
          
          {/* 좌측: 사물함 현황 */}
          <div style={{ 
            padding: '32px', 
            borderRadius: '24px', 
            background: '#fbfbfd',
            border: '1px solid #e5e5ea',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '440px'
          }}>
            <h4 style={{ fontSize: '22px', fontWeight: 800, color: '#1d1d1f', margin: '0 0 24px 0', letterSpacing: '-0.3px' }}>
              {isEn ? 'My Lockers' : '이용 중인 라카'}
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {myLockers.map(locker => {
                const lockerKey = getLockerKey(locker);
                const isSelected = selectedLockerKey === lockerKey;
                const parsedEnd = parseLocalYmd(locker.end_dt);
                const diffDays = parsedEnd
                  ? Math.round((parsedEnd.getTime() - todayDate.getTime()) / 86400000)
                  : null;
                const isExpired = locker.status === 'EXPIRED' || (diffDays !== null && diffDays < 0);
                const formattedEndDt = formatYmdDisplay(locker.end_dt);
                const badgeLabel = String(locker.display_no || locker.locker_no);
                const zoneLabel = locker.zone_name || locker.group_id;

                return (
                  <div 
                    key={lockerKey}
                    data-testid={`locker-item-${badgeLabel}`}
                    onClick={() => {
                      setSelectedLockerKey(lockerKey);
                      setErrorMsg('');
                    }}
                    style={{
                      padding: '22px 24px',
                      borderRadius: '22px',
                      background: '#ffffff',
                      border: isSelected ? '2.5px solid #0071e3' : '1px solid #e5e5ea',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: isSelected ? '0 8px 24px rgba(0, 113, 227, 0.16)' : '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                      <div style={{
                        minWidth: '74px',
                        height: '74px',
                        padding: '0 12px',
                        borderRadius: '20px',
                        background: isSelected ? '#0071e3' : '#f5f5f7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: badgeLabel.length > 3 ? '22px' : '34px',
                        fontWeight: 900,
                        letterSpacing: '-1px',
                        color: isSelected ? '#ffffff' : '#1d1d1f',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 6px 16px rgba(0, 113, 227, 0.3)' : 'none'
                      }}>
                        {badgeLabel}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '17px', color: '#4b5563', fontWeight: 700 }}>
                            {isEn ? 'Expires' : '만료일'}
                          </span>
                          {zoneLabel && (
                            <span style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#0071e3',
                              background: 'rgba(0, 113, 227, 0.08)',
                              padding: '3px 10px',
                              borderRadius: '6px'
                            }}>
                              {zoneLabel}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: 900, color: isExpired ? '#ff3b30' : '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{formattedEndDt}</span>
                          {isExpired ? (
                            <span style={{ fontSize: '15px', padding: '4px 10px', background: '#fff0f0', color: '#ff3b30', borderRadius: '6px', fontWeight: 700 }}>
                              {isEn ? 'Expired' : '만료됨'}
                            </span>
                          ) : diffDays !== null ? (
                            <span style={{
                              fontSize: '15px',
                              padding: '4px 10px',
                              background: diffDays <= 7 ? '#fff7ed' : '#f0fdf4',
                              color: diffDays <= 7 ? '#ea580c' : '#16a34a',
                              borderRadius: '6px',
                              fontWeight: 700
                            }}>
                              {diffDays === 0 ? (isEn ? 'D-Day' : '오늘 만료') : `D-${diffDays}`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {isSelected ? (
                      <div style={{ background: '#0071e3', borderRadius: '50%', padding: '6px' }}>
                         <Check size={20} color="#ffffff" strokeWidth={3} />
                      </div>
                    ) : (
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '2px solid #e5e5ea' }}></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우측: 연장 상품 매대 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h4 style={{ fontSize: '22px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.3px' }}>
              {isEn ? 'Select Extension Plan' : '연장 상품 선택'}
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {visibleLockerProducts.length > 0 ? visibleLockerProducts.map(prod => {
                const renewalWindow = evaluateLockerRenewalWindow(prod, selectedLockerDiffDays, lang);
                const canExtend = myLockers.length > 0 && renewalWindow.canRenewNow;
                const extendDays = resolveLockerExtendDays(prod);
                const effectivePrice =
                  prod.sale_price !== undefined && prod.sale_price !== null && prod.sale_price > 0
                    ? prod.sale_price
                    : prod.standard_price;
                const finalPrice =
                  effDiscountRate > 0
                    ? Math.max(0, effectivePrice - Math.round(effectivePrice * (effDiscountRate / 100)))
                    : effectivePrice;
                const hasSaleDiscount = prod.standard_price > finalPrice;
                const projected = myLockers.length > 0 ? computeProjectedEndYmd(selectedLockerObj, extendDays) : null;
                
                return (
                  <div
                    key={prod.prod_cd}
                    data-testid="locker-prod-card"
                    data-disabled={canExtend ? 'false' : 'true'}
                    className="locker-product-card"
                    onClick={() => handleExtendClick(prod)}
                    style={{
                      padding: '26px 28px',
                      borderRadius: '24px',
                      background: '#ffffff',
                      border: '1.5px solid #e5e5ea',
                      cursor: canExtend ? 'pointer' : 'not-allowed',
                      opacity: canExtend ? 1 : 0.65,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }}
                    onMouseOver={(e) => {
                      if (canExtend) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                        e.currentTarget.style.borderColor = '#0071e3';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (canExtend) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.03)';
                        e.currentTarget.style.borderColor = '#e5e5ea';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                      <div style={{ background: '#f5f5f7', padding: '14px', borderRadius: '18px' }}>
                        <CalendarRange size={30} color={canExtend ? '#0071e3' : '#9ca3af'} strokeWidth={2} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '24px', fontWeight: 800, color: '#1d1d1f', margin: '0 0 4px 0' }}>
                          {prod.display_nm || parseProductJsonSafe(prod.meta_data).display_nm || parseProductJsonSafe(prod.meta_data).short_nm || prod.prod_nm}
                        </h4>
                        <p style={{ fontSize: '18px', color: '#4b5563', margin: 0, fontWeight: 600 }}>
                          {isEn
                            ? `Extend ${extendDays} days${effDiscountRate > 0 ? ` (${effDiscountRate}% grade discount)` : ''}`
                            : `사물함 ${extendDays}일 연장${effDiscountRate > 0 ? ` (${effDiscountRate}% 등급할인 적용)` : ''}`}
                        </p>
                        {renewalWindow.badgeText ? (
                          <p
                            data-testid="locker-renewal-window-badge"
                            style={{
                              fontSize: '15px',
                              color: '#ea580c',
                              background: '#fff7ed',
                              border: '1px solid #fed7aa',
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              margin: '8px 0 0 0',
                              fontWeight: 800,
                            }}
                          >
                            ⏳ {renewalWindow.badgeText}
                          </p>
                        ) : projected ? (
                          <p style={{ fontSize: '16px', color: '#0071e3', margin: '6px 0 0 0', fontWeight: 800 }}>
                            {isEn
                              ? `New Expiry: ${projected.currentYmd} → ${projected.nextYmd}`
                              : `연장 후 만료예정일: ${projected.currentYmd} → ${projected.nextYmd}`}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      {hasSaleDiscount && (
                        <span style={{ fontSize: '14px', color: '#86868b', textDecoration: 'line-through', fontWeight: 600 }}>
                          {prod.standard_price.toLocaleString()}{isEn ? ' KRW' : '원'}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                        <span style={{ fontSize: '38px', fontWeight: 900, color: hasSaleDiscount ? '#059669' : '#1d1d1f', letterSpacing: '-1.5px' }}>
                          {finalPrice.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: '#86868b', marginLeft: '3px' }}>
                          {isEn ? 'KRW' : '원'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{
                  padding: '48px 24px',
                  borderRadius: '24px',
                  background: '#fbfbfd',
                  border: '1px dashed #d2d2d7',
                  textAlign: 'center',
                  color: '#86868b',
                  fontSize: '17px',
                  fontWeight: 600
                }}>
                  {isEn
                    ? 'No locker extension plans are currently available. Please contact the front desk.'
                    : '현재 등록된 라카 연장 상품이 없습니다. 안내 데스크로 문의해 주세요.'}
                </div>
              )}
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
