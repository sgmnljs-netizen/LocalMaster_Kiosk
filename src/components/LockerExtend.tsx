import React, { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, KeyRound, ShieldAlert } from 'lucide-react';
import { api, Locker, Member, Product } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';

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

const getLockerKey = (locker: Locker): string => {
  const idPart = (locker as any)?.locker_id;
  const noPart = (locker as any)?.display_no || locker.locker_no;
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
      const memberLockerInfo = (member as any)?.locker_info;

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
              group_id: memberLockerInfo.group_id,
              zone_name: memberLockerInfo.zone_name,
              status: rawStatus === 'EXPIRED' ? 'EXPIRED' : 'OCCUPIED',
              member_no: effMemberNo,
              member_name: member?.member_name || memberName,
              end_dt: memberLockerInfo.end_dt || memberLockerInfo.expiry_date || '',
              ...({ display_no: rawDisplayNo } as any)
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

      // 2. 라카 연장 전용 상품 목록 로드 (일일 타석/파3 FACILITY 상품 혼입 차단)
      const allProds = await api.getProducts();
      const lockerProds = allProds.filter(p => {
        const lt = (p.logic_type || '').toUpperCase();
        const nm = (p.prod_nm || '').toLowerCase();
        const cd = (p.prod_cd || '').toUpperCase();
        if (lt === 'RENTAL') return true;
        if (nm.includes('라카') || nm.includes('락커') || nm.includes('사물함') || cd.startsWith('LC') || cd.startsWith('RNT')) {
          return true;
        }
        if (lt === 'FACILITY' && (p.days ?? 0) > 0 && !nm.includes('일일') && !nm.includes('당일') && !nm.includes('타석') && !nm.includes('par3') && !nm.includes('파3')) {
          return true;
        }
        return false;
      });
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
    const allowedZones = prod.access_rules?.allowed_zones;
    if (Array.isArray(allowedZones) && allowedZones.length > 0 && selectedLockerObj?.group_id) {
      const normalizedAllowed = allowedZones.map(z => String(z).trim().toUpperCase());
      const lockerGroup = String(selectedLockerObj.group_id).trim().toUpperCase();
      if (!normalizedAllowed.includes(lockerGroup)) {
        return false;
      }
    }
    const memberGender = normalizeGenderCode(member?.gender);
    const prodGender = normalizeGenderCode(prod.access_rules?.restricted_gender || prod.target_gender);
    if (memberGender && prodGender && memberGender !== prodGender) {
      return false;
    }
    return true;
  });

  const todayKstYmd = TimeMaster.getKstYmd(new Date());
  const todayDate = parseLocalYmd(todayKstYmd) || new Date();
  todayDate.setHours(0, 0, 0, 0);

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

    // 🛡️ [BUG-L01 FIX] 다중 라카 보유 시 member.locker_info(첫 번째 라카)가 아닌 사용자가 선택한 라카(selectedObj)를 최우선 참조
    const displayLockerNo = String(
      (selectedObj as any)?.display_no ||
      selectedObj.locker_no ||
      (selectedObj as any)?.locker_id ||
      ''
    ).trim();

    const numericDigits = displayLockerNo.replace(/[^0-9]/g, '');
    const targetLockerId =
      Number((selectedObj as any)?.locker_id) ||
      Number(selectedObj.locker_no) ||
      (numericDigits ? Number(numericDigits) : 0);

    if (!targetLockerId && !displayLockerNo) {
      setErrorMsg(isEn ? 'Please select a locker to extend.' : '연장할 라카를 선택해주세요.');
      return;
    }

    isSubmittingRef.current = true;
    try {
      await onLockerPaymentTriggered(targetLockerId, prod, prod.days || 30, displayLockerNo || String(targetLockerId));
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <div 
      style={{
        width: '1000px',
        margin: '40px auto 120px auto',
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* 헤더 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            background: '#0071e3', 
            borderRadius: '50%', 
            width: '56px', height: '56px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 113, 227, 0.3)'
          }}>
            <KeyRound size={28} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
              {isEn ? 'Locker Extension' : '개인 사물함 연장'}
            </h2>
            <p style={{ fontSize: '17px', color: '#86868b', margin: '4px 0 0 0', fontWeight: 500 }}>
              <strong style={{ color: '#1d1d1f' }}>{memberName}</strong> {isEn ? '— Active Lockers' : '님의 이용 중인 라카'}
            </p>
          </div>
        </div>

        <button 
          onClick={onCancel}
          style={{
            background: '#f5f5f7',
            border: 'none',
            color: '#1d1d1f',
            padding: '12px 24px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
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
        padding: '20px 24px', 
        borderRadius: '16px', 
        border: '1px solid rgba(0, 113, 227, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ width: '4px', height: '100%', background: '#0071e3', borderRadius: '2px' }}></div>
        <p style={{ fontSize: '16px', color: '#1d1d1f', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
          {isEn ? (
            <>
              <strong style={{ color: '#0071e3' }}>Notice: </strong>Only <strong>period extensions</strong> for currently assigned lockers are available at the kiosk. <br/>
              <span style={{ color: '#86868b' }}>(For new locker assignments or relocation, please visit the front desk.)</span>
            </>
          ) : (
            <>
              <strong style={{ color: '#0071e3' }}>안내: </strong>키오스크에서는 기존 이용 중인 라카의 <strong>기간 연장</strong>만 가능합니다. <br/>
              <span style={{ color: '#86868b' }}>(신규 라카 배정 및 자리 이동은 안내 데스크를 이용해 주세요.)</span>
            </>
          )}
        </p>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div style={{ background: '#fff0f0', padding: '16px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #ffc2c2' }}>
          <ShieldAlert size={20} color="#ff3b30" />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#ff3b30' }}>{errorMsg}</span>
        </div>
      )}

      {/* 로딩 표시 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', fontSize: '18px', color: '#86868b', fontWeight: 500 }}>
          {isEn ? 'Loading locker information...' : '라카 정보를 불러오는 중입니다...'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '32px' }}>
          
          {/* 좌측: 사물함 현황 */}
          <div style={{ 
            padding: '32px', 
            borderRadius: '24px', 
            background: '#fbfbfd',
            border: '1px solid #e5e5ea',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
          }}>
            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: '0 0 24px 0', letterSpacing: '-0.3px' }}>
              {isEn ? 'My Lockers' : '이용 중인 라카'}
            </h4>
            
            {myLockers.length > 0 ? (
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
                  const badgeLabel = String((locker as any).display_no || locker.locker_no);
                  const zoneLabel = locker.zone_name || locker.group_id;

                  return (
                    <div 
                      key={lockerKey}
                      data-testid={`locker-item-${badgeLabel}`}
                      onClick={() => setSelectedLockerKey(lockerKey)}
                      style={{
                        padding: '20px',
                        borderRadius: '20px',
                        background: '#ffffff',
                        border: isSelected ? '2px solid #0071e3' : '1px solid #e5e5ea',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: isSelected ? '0 8px 24px rgba(0, 113, 227, 0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                        transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          minWidth: '56px',
                          height: '56px',
                          padding: '0 10px',
                          borderRadius: '16px',
                          background: isSelected ? '#0071e3' : '#f5f5f7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: badgeLabel.length > 3 ? '17px' : '22px',
                          fontWeight: 800,
                          color: isSelected ? '#ffffff' : '#1d1d1f',
                          transition: 'all 0.2s ease'
                        }}>
                          {badgeLabel}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 500 }}>
                              {isEn ? 'Expires' : '만료일'}
                            </span>
                            {zoneLabel && (
                              <span style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#0071e3',
                                background: 'rgba(0, 113, 227, 0.08)',
                                padding: '2px 8px',
                                borderRadius: '6px'
                              }}>
                                {zoneLabel}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '17px', fontWeight: 700, color: isExpired ? '#ff3b30' : '#1d1d1f', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{formattedEndDt}</span>
                            {isExpired ? (
                              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#fff0f0', color: '#ff3b30', borderRadius: '6px', fontWeight: 700 }}>
                                {isEn ? 'Expired' : '만료됨'}
                              </span>
                            ) : diffDays !== null ? (
                              <span style={{
                                fontSize: '12px',
                                padding: '2px 8px',
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
                        <div style={{ background: '#0071e3', borderRadius: '50%', padding: '4px' }}>
                           <Check size={20} color="#ffffff" strokeWidth={3} />
                        </div>
                      ) : (
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #e5e5ea' }}></div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 0' }}>
                <ShieldAlert size={48} color="#d2d2d7" />
                <p style={{ fontSize: '17px', color: '#86868b', fontWeight: 500 }}>
                  {isEn ? 'No active lockers found.' : '이용 중인 라카가 없습니다.'}
                </p>
              </div>
            )}
          </div>

          {/* 우측: 연장 상품 매대 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: 0, letterSpacing: '-0.3px' }}>
              {isEn ? 'Select Extension Plan' : '연장 상품 선택'}
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {visibleLockerProducts.length > 0 ? visibleLockerProducts.map(prod => {
                const canExtend = myLockers.length > 0;
                const extendDays = prod.days || 30;
                const effectivePrice =
                  prod.sale_price !== undefined && prod.sale_price !== null && prod.sale_price > 0
                    ? prod.sale_price
                    : prod.standard_price;
                const finalPrice =
                  effDiscountRate > 0
                    ? Math.max(0, effectivePrice - Math.round(effectivePrice * (effDiscountRate / 100)))
                    : effectivePrice;
                const hasSaleDiscount = prod.standard_price > finalPrice;
                const projected = canExtend ? computeProjectedEndYmd(selectedLockerObj, extendDays) : null;
                
                return (
                  <div
                    key={prod.prod_cd}
                    data-testid="locker-prod-card"
                    className="locker-product-card"
                    onClick={() => handleExtendClick(prod)}
                    style={{
                      padding: '24px',
                      borderRadius: '24px',
                      background: '#ffffff',
                      border: '1px solid #e5e5ea',
                      cursor: canExtend ? 'pointer' : 'not-allowed',
                      opacity: canExtend ? 1 : 0.6,
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
                        e.currentTarget.style.borderColor = '#d2d2d7';
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ background: '#f5f5f7', padding: '12px', borderRadius: '16px' }}>
                        <CalendarRange size={28} color="#0071e3" strokeWidth={2} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#1d1d1f', margin: '0 0 4px 0' }}>
                          {prod.meta_data?.display_nm || prod.prod_nm}
                        </h4>
                        <p style={{ fontSize: '15px', color: '#86868b', margin: 0, fontWeight: 500 }}>
                          {isEn
                            ? `Extend ${extendDays} days${effDiscountRate > 0 ? ` (${effDiscountRate}% grade discount)` : ''}`
                            : `사물함 ${extendDays}일 연장${effDiscountRate > 0 ? ` (${effDiscountRate}% 등급할인 적용)` : ''}`}
                        </p>
                        {projected && (
                          <p style={{ fontSize: '13px', color: '#0071e3', margin: '6px 0 0 0', fontWeight: 600 }}>
                            {isEn
                              ? `New Expiry: ${projected.currentYmd} → ${projected.nextYmd}`
                              : `연장 후 만료예정일: ${projected.currentYmd} → ${projected.nextYmd}`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      {hasSaleDiscount && (
                        <span style={{ fontSize: '13px', color: '#86868b', textDecoration: 'line-through', fontWeight: 600 }}>
                          {prod.standard_price.toLocaleString()}{isEn ? ' KRW' : '원'}
                        </span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                        <span style={{ fontSize: '28px', fontWeight: 800, color: hasSaleDiscount ? '#059669' : '#1d1d1f', letterSpacing: '-1px' }}>
                          {finalPrice.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: '#86868b', marginLeft: '2px' }}>
                          {isEn ? 'KRW' : '원'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{
                  padding: '40px 24px',
                  borderRadius: '24px',
                  background: '#fbfbfd',
                  border: '1px dashed #d2d2d7',
                  textAlign: 'center',
                  color: '#86868b',
                  fontSize: '16px',
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
