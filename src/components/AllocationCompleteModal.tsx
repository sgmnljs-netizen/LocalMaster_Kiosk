import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Check, Printer, ArrowRight, Clock } from 'lucide-react';
import { kioskHardwareBridge } from '../services/hardware/services/HardwareBridgeClient';
import { printKioskBayAllocationSlip, formatKioskHhMm } from '../utils/kioskSlipPrinter';
import { useKioskSettings } from '../stores/kioskSettings';
import { TimeMaster, formatBayFloorLabel } from '../utils/timeMaster';
import { api, type KioskStoreInfo } from '../services/api';
import { Code128BarcodeSvg } from './common/Code128BarcodeSvg';

interface AllocationCompleteModalProps {
  bayNo: number | string;
  oldBayNo?: number | string;
  floor?: string | number | null;
  durationMin: number;
  startTime?: string;
  endTime?: string;
  resId?: string;
  memberName?: string;
  memberNo?: string;
  productName?: string;
  actionLabel?: string;
  remainInfo?: string;
  payAmount?: number;
  originalAmount?: number;
  discountAmount?: number;
  usedPoints?: number;
  vatYn?: string;
  cardIssuer?: string;
  cardNoMasked?: string;
  terminalId?: string;
  authNo?: string;
  installmentMonths?: number;
  checkinMode?: string;
  noticeMessage?: string;
  pauseCountdown?: boolean;
  lang?: 'KO' | 'EN';
  onClose: () => void;
}

export const AllocationCompleteModal: React.FC<AllocationCompleteModalProps> = ({
  bayNo,
  oldBayNo,
  floor,
  durationMin,
  startTime,
  endTime,
  resId,
  memberName,
  memberNo,
  productName,
  actionLabel,
  remainInfo,
  payAmount = 0,
  originalAmount,
  discountAmount,
  usedPoints,
  vatYn = 'Y',
  cardIssuer,
  cardNoMasked,
  terminalId,
  authNo,
  installmentMonths = 0,
  checkinMode,
  noticeMessage,
  pauseCountdown = false,
  lang = 'KO',
  onClose
}) => {
  const { settings } = useKioskSettings();
  const storeName = settings.deviceName || '골포스 스마트 키오스크';
  const autoPrintReceipt = settings.autoPrintReceipt ?? true;
  const [countdown, setCountdown] = useState(6);
  const [isPrinting, setIsPrinting] = useState<boolean>(autoPrintReceipt);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [hasPrintError, setHasPrintError] = useState<boolean>(false);
  const [storeInfo, setStoreInfo] = useState<KioskStoreInfo | null>(null);
  const hasAutoPrintedRef = useRef(false);
  const isPrintingRef = useRef(false);
  const cardReceiptDoneRef = useRef(false);
  const slipDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.getStoreInfo().then((info) => {
      if (!cancelled && info) setStoreInfo(info);
    }).catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrint = useCallback(async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    setIsPrinting(true);
    setHasPrintError(false);
    setPrintStatus(lang === 'KO' ? '출력 중...' : 'Printing...');
    try {
      const nowStr = TimeMaster.formatKstDateTime(new Date());
      const startStr = formatKioskHhMm(startTime) || nowStr.slice(11, 16);
      const endStr = formatKioskHhMm(endTime) || endTime;
      const resolvedDiscount = (discountAmount ?? 0) + (usedPoints ?? 0);
      const resolvedUnitPrice = originalAmount ?? (payAmount + resolvedDiscount);
      const isTaxFree = String(vatYn || 'Y').toUpperCase() === 'N';
      const vat = isTaxFree ? 0 : Math.round(payAmount / 11);
      const supply = isTaxFree ? 0 : payAmount - vat;
      const taxFreeAmt = isTaxFree ? payAmount : 0;

      const info = storeInfo || (await api.getStoreInfo().catch(() => null));
      if (info && !storeInfo) setStoreInfo(info);

      const resolvedStoreInfo = {
        store_name: info?.store_nm || storeName,
        biz_no: info?.biz_no || info?.biz_reg_no || '',
        ceo_name: info?.ceo_name || info?.owner_name || '',
        tel: info?.tel || '',
        address: info?.address || '',
      };

      // 이전 시도에서 두 항목 모두 성공했었다면 수동 전체 재출력으로 간주하고, 부분 실패 상태였다면 미완료 항목만 선별 재출력
      const bothPreviouslySucceeded = (payAmount <= 0 || cardReceiptDoneRef.current) && slipDoneRef.current;
      const shouldPrintCardReceipt = payAmount > 0 && (bothPreviouslySucceeded || !cardReceiptDoneRef.current);
      const shouldPrintSlip = bothPreviouslySucceeded || !slipDoneRef.current;

      let cardReceiptOk = payAmount <= 0 || cardReceiptDoneRef.current;
      let failureDetail = '';
      if (shouldPrintCardReceipt) {
        const cardRes = await kioskHardwareBridge.printReceipt({
          sale_id: resId || `ALLOC-${Date.now()}`,
          receipt_no: resId ? `RC-${resId.slice(-6)}` : `RC-${Date.now().toString().slice(-6)}`,
          trade_dt: nowStr,
          bay_no: bayNo,
          bayNo,
          use_minutes: durationMin,
          useMinutes: durationMin,
          start_time: startStr,
          startTime: startStr,
          end_time: endStr,
          endTime: endStr,
          member_name: memberName || '비회원',
          member_no: memberNo,
          client_type: 'KIOSK',
          pay_method: 'CARD',
          store_info: resolvedStoreInfo,
          items: [
            {
              name: productName || `일일타석 [${bayNo}번] (${durationMin}분)`,
              qty: 1,
              unit_price: resolvedUnitPrice,
              amount: payAmount,
              discount_amt: resolvedDiscount,
              is_tax_free: isTaxFree,
            },
          ],
          tax_summary: {
            supply_amt: supply,
            tax_amt: vat,
            tax_free_amt: taxFreeAmt,
            total_amt: resolvedUnitPrice,
            discount_amt: resolvedDiscount,
            pay_amt: payAmount,
          },
          card_info: {
            issuer_name: cardIssuer || '신용카드',
            card_no_masked: cardNoMasked || '신용카드',
            approval_no: authNo || resId || '00000000',
            installment_months: installmentMonths ?? 0,
            terminal_id: terminalId || settings.terminalId || api.getTerminalId(),
          },
          header_message: '[ 신용카드 매출전표 ]',
        });
        cardReceiptOk = Boolean(cardRes?.success);
        cardReceiptDoneRef.current = cardReceiptOk;
        if (!cardReceiptOk && cardRes?.message) {
          failureDetail = cardRes.message;
        }
      }

      let slipOk = slipDoneRef.current;
      if (shouldPrintSlip) {
        const slipRes = await printKioskBayAllocationSlip({
          bayNo,
          oldBayNo,
          floor,
          resId,
          memberName: memberName || (payAmount > 0 ? '일일타석 고객' : '회원'),
          memberNo,
          productName: productName || (payAmount > 0 ? `일일타석 (${durationMin}분)` : '회원권/쿠폰 타석 이용'),
          actionLabel,
          checkinMode,
          durationMin,
          startTime: startStr,
          endTime,
          remainInfo,
          extraNote: noticeMessage,
          storeInfo: resolvedStoreInfo,
          tradeDt: nowStr,
        });
        slipOk = Boolean(slipRes?.success);
        slipDoneRef.current = slipOk;
        if (!slipOk && slipRes?.message && !failureDetail) {
          failureDetail = slipRes.message;
        }
      }

      const finalOk = cardReceiptOk && slipOk;
      setHasPrintError(!finalOk);
      if (finalOk) {
        setPrintStatus(lang === 'KO' ? '출력 완료' : 'Printed');
        setCountdown((prev) => Math.max(prev, 6));
      } else {
        setPrintStatus(
          failureDetail && failureDetail.includes('용지')
            ? (lang === 'KO' ? '프린터 용지 부족' : 'Paper Out')
            : failureDetail && failureDetail.includes('커버')
              ? (lang === 'KO' ? '프린터 커버 열림' : 'Cover Open')
              : (lang === 'KO' ? '프린터 미연결' : 'Printer Offline')
        );
        // 프린터 출력 실패 시 고객이 화면의 타석 번호를 확인하거나 재출력을 누를 수 있도록 20초로 자동 연장
        setCountdown(20);
      }
    } catch {
      setHasPrintError(true);
      setPrintStatus(lang === 'KO' ? '프린터 미연결' : 'Printer Offline');
      setCountdown(20);
    } finally {
      isPrintingRef.current = false;
      setIsPrinting(false);
    }
  }, [bayNo, oldBayNo, floor, durationMin, startTime, endTime, resId, memberName, memberNo, productName, actionLabel, remainInfo, payAmount, originalAmount, discountAmount, usedPoints, vatYn, cardIssuer, cardNoMasked, terminalId, authNo, installmentMonths, checkinMode, noticeMessage, lang, storeName, storeInfo, settings.terminalId]);

  // 마운트 시 자동 인쇄 (단 1회 보장)
  useEffect(() => {
    if (autoPrintReceipt && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      handlePrint();
    } else if (!autoPrintReceipt) {
      setIsPrinting(false);
    }
  }, [autoPrintReceipt, handlePrint]);

  // 6초 자동 카운트다운 (인쇄 진행 중이거나 상위 하드웨어 재가동 안내 배너 표출 중에는 대기)
  useEffect(() => {
    if (isPrinting || pauseCountdown) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose, isPrinting, pauseCountdown]);

  // 시각 포맷팅 (HH:mm)
  const formatTime = (timeStr?: string) => {
    if (!timeStr) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      return `${hours}:${mins}`;
    }
    if (timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins}`;
      }
    }
    // "1455" 또는 "900" 포맷 처리
    const cleanStr = timeStr.trim().padStart(4, '0');
    if (cleanStr.length === 4 && !isNaN(Number(cleanStr))) {
      return `${cleanStr.slice(0, 2)}:${cleanStr.slice(2, 4)}`;
    }
    return timeStr;
  };

  const startDisplay = formatTime(startTime);
  let endDisplay = formatTime(endTime) || '종료시';

  const isPrinterOffline = !isPrinting && hasPrintError;
  const isWaitlist = checkinMode === 'WAITLIST_ASSIGNED';
  const floorLabel = formatBayFloorLabel({ floor });
  const modeAccent = isWaitlist ? '#d97706' : '#059669';
  const modeBadgeBg = isWaitlist ? '#fef3c7' : '#d1fae5';
  const modeBadgeBorder = isWaitlist ? '#f59e0b' : '#10b981';
  const modeBadgeTextColor = isWaitlist ? '#92400e' : '#065f46';
  const modeBadgeLabel = (() => {
    if (checkinMode === 'MOVE_BAY') return lang === 'KO' ? '타석 이동 완료' : 'Relocated';
    if (checkinMode === 'PRE_CHECKIN') return lang === 'KO' ? '사전 체크인' : 'Pre-Checkin';
    if (checkinMode === 'PENDING_WAIT') return lang === 'KO' ? '체크인 대기' : 'Pending';
    if (isWaitlist) return lang === 'KO' ? '대기 예약 완료' : 'Waitlist Booked';
    if (checkinMode === 'REPRINT') return lang === 'KO' ? '배정표 재출력' : 'Reprint';
    return lang === 'KO' ? '즉시 배정 완료' : 'Assigned Now';
  })();
  const titleText = (() => {
    if (checkinMode === 'MOVE_BAY') return lang === 'KO' ? '타석 이동 확인표' : 'Bay Relocation Confirmation Slip';
    if (checkinMode === 'PRE_CHECKIN') return lang === 'KO' ? '사전 체크인 접수 확인표' : 'Pre-Checkin Confirmation Slip';
    if (checkinMode === 'PENDING_WAIT') return lang === 'KO' ? '타석 체크인 대기 확인표' : 'Check-in Waiting Slip';
    if (isWaitlist) return lang === 'KO' ? '타석 대기 예약 확인표' : 'Waitlist Booking Confirmation';
    if (checkinMode === 'REPRINT') return lang === 'KO' ? '골프 타석 배정표 (재출력)' : 'Bay Assignment Ticket (Reprint)';
    return lang === 'KO' ? '골프 타석 즉시 배정표' : 'Golf Bay Assignment Ticket';
  })();

  return (
    <div 
      data-testid="allocation-complete-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.44)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '24px 24px 132px 24px'
      }}
    >
      {/* Apple HIG 920px 초대형 디지털 배정표 시트 */}
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: 'calc(100vh - 156px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '38px',
          border: '1.5px solid #e5e5ea',
          boxShadow: '0 28px 72px rgba(0, 0, 0, 0.22)',
          padding: '44px 42px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: '#1d1d1f',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* 상단 시맨틱 상태 서클 + 모드 배지 (이모지 제거 · Apple HIG 고대비) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
          <div 
            style={{ 
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              background: isWaitlist ? '#fffbeb' : '#ecfdf5',
              border: `2.5px solid ${modeBadgeBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isWaitlist
                ? '0 10px 24px rgba(217, 119, 6, 0.20)'
                : '0 10px 24px rgba(5, 150, 105, 0.18)'
            }}
          >
            {isWaitlist ? (
              <Clock size={46} style={{ color: '#d97706', strokeWidth: 2.8 }} />
            ) : (
              <Check size={48} style={{ color: '#059669', strokeWidth: 3 }} />
            )}
          </div>

          <span
            data-testid="allocation-complete-mode-badge"
            style={{
              padding: '7px 20px',
              borderRadius: '999px',
              background: modeBadgeBg,
              border: `1.5px solid ${modeBadgeBorder}`,
              color: modeBadgeTextColor,
              fontSize: '20px',
              fontWeight: 900,
              letterSpacing: '-0.3px',
            }}
          >
            {modeBadgeLabel}
          </span>
        </div>

        {/* 100% 한글 애플 초대형 타이틀 */}
        <h2
          style={{
            fontSize: '46px',
            fontWeight: 900,
            color: isWaitlist ? '#b45309' : '#1d1d1f',
            margin: '0 0 14px 0',
            letterSpacing: '-1.2px',
            lineHeight: 1.15,
            wordBreak: 'keep-all',
          }}
        >
          {titleText}
        </h2>
        
        {autoPrintReceipt && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              background: isPrinting ? '#eff6ff' : isPrinterOffline ? '#fef2f2' : '#f5f5f7',
              border: `1.5px solid ${isPrinting ? '#bfdbfe' : isPrinterOffline ? '#fecdd3' : '#e5e7eb'}`,
              padding: '10px 24px',
              borderRadius: '999px',
              color: isPrinting ? '#1d4ed8' : isPrinterOffline ? '#dc2626' : '#374151',
              fontSize: '21px',
              fontWeight: 800,
              marginBottom: isPrinterOffline ? '18px' : (noticeMessage ? '18px' : '28px'),
              letterSpacing: '-0.3px'
            }}
          >
            <Printer size={22} style={{ color: isPrinting ? '#0071e3' : isPrinterOffline ? '#dc2626' : '#059669' }} />
            <span>
              {printStatus 
                ? `${lang === 'KO' ? (payAmount > 0 ? '영수증·배정표 인쇄 상태' : '배정표 인쇄 상태') : 'Print Status'}: ${printStatus}` 
                : (lang === 'KO'
                    ? (payAmount > 0 ? '영수증 및 배정표가 자동 출력 중입니다.' : '타석 배정표가 자동 출력 중입니다.')
                    : 'Printing confirmation ticket...')}
            </span>
          </div>
        )}

        {isPrinterOffline && (
          <div
            data-testid="printer-offline-warning"
            style={{
              width: '100%',
              background: '#fff1f2',
              border: '1.5px solid #fecdd3',
              borderRadius: '20px',
              padding: '18px 22px',
              marginBottom: noticeMessage ? '16px' : '24px',
              fontSize: '18px',
              fontWeight: 800,
              color: '#be123c',
              lineHeight: 1.5,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box',
            }}
          >
            <span>
              {lang === 'KO'
                ? '⚠️ 프린터 용지 부족 또는 연결 지연으로 확인표가 출력되지 않았습니다. 타석 배정은 정상 완료되었으니 아래 배정 타석 번호를 확인하신 뒤 바로 입장해 주세요. (종이 확인표가 필요하시면 프런트에 말씀해 주세요.)'
                : '⚠️ Ticket printing was skipped due to paper shortage or printer offline. Your bay is assigned—please check your bay number below and proceed directly (ask the front desk if you need a printed slip).'}
            </span>
            <Code128BarcodeSvg
              value={String(resId || `BAY-${bayNo}`).slice(0, 24)}
              width={260}
              barHeight={52}
              testId="allocation-offline-barcode"
            />
          </div>
        )}

        {noticeMessage && (
          <div
            style={{
              width: '100%',
              background: isWaitlist
                ? '#fffbeb'
                : (checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '#eff6ff' : '#ecfdf5'),
              border: isWaitlist
                ? '2px solid #f59e0b'
                : (checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '1.5px solid #bfdbfe' : '1.5px solid #a7f3d0'),
              borderRadius: '20px',
              padding: '18px 24px',
              marginBottom: '24px',
              fontSize: '21px',
              fontWeight: 800,
              color: isWaitlist
                ? '#b45309'
                : (checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '#1d4ed8' : '#047857'),
              lineHeight: 1.45,
              boxSizing: 'border-box',
              wordBreak: 'keep-all',
            }}
          >
            {noticeMessage}
          </div>
        )}

        {/* 한글 데이터 그리드 초대형 티켓 카드 */}
        <div 
          style={{ 
            width: '100%', 
            background: '#f5f5f7', 
            borderRadius: '28px', 
            border: '1.5px solid #e5e5ea', 
            padding: '28px 32px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            marginBottom: '30px',
            boxSizing: 'border-box',
          }}
        >
          {/* 배정 타석 히어로 박스 (원거리 시인성 극대화) */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '22px',
              border: '1.5px solid #e5e5ea',
              padding: '24px 30px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '22px', color: '#6e6e73', fontWeight: 700, letterSpacing: '-0.4px' }}>
                {checkinMode === 'MOVE_BAY' ? (lang === 'KO' ? '이동 타석' : 'Relocated Bay') : (lang === 'KO' ? '배정 위치' : 'Assigned Bay')}
              </span>
              {floorLabel && (
                <span
                  style={{
                    padding: '4px 14px',
                    borderRadius: '10px',
                    background: '#f5f5f7',
                    border: '1px solid #e5e7eb',
                    fontSize: '22px',
                    fontWeight: 900,
                    color: '#1d1d1f',
                  }}
                >
                  {floorLabel}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {checkinMode === 'MOVE_BAY' && oldBayNo !== undefined && oldBayNo !== null && (
                <>
                  <span style={{ fontSize: '42px', fontWeight: 800, color: '#86868b', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                    {!isNaN(Number(oldBayNo)) ? `${String(oldBayNo).padStart(2, '0')}번` : String(oldBayNo)}
                  </span>
                  <span style={{ fontSize: '34px', fontWeight: 900, color: '#059669' }}>➔</span>
                </>
              )}
              <span style={{ fontSize: !isNaN(Number(bayNo)) ? '84px' : '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-2.5px', lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>
                {!isNaN(Number(bayNo)) ? String(bayNo).padStart(2, '0') : String(bayNo)}
              </span>
              {!isNaN(Number(bayNo)) && (
                <span style={{ fontSize: '36px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.8px' }}>
                  {lang === 'KO' ? '번 타석' : ''}
                </span>
              )}
            </div>
          </div>

          {/* 이용 시간 & 이용 시간대 2열 대형 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '18px' }}>
            <div style={{ background: '#ffffff', padding: '24px 20px', borderRadius: '22px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center', border: '1.5px solid #e5e5ea' }}>
              <span style={{ fontSize: '20px', color: '#6e6e73', fontWeight: 700 }}>
                {checkinMode === 'MOVE_BAY' ? (lang === 'KO' ? '보전 잔여 시간' : 'Remaining Time') : (lang === 'KO' ? '이용 시간' : 'Duration')}
              </span>
              <span style={{ fontSize: '44px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {durationMin}{lang === 'KO' ? '분' : ' min'}
              </span>
            </div>

            <div style={{ background: '#ffffff', padding: '24px 20px', borderRadius: '22px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center', border: '1.5px solid #e5e5ea' }}>
              <span style={{ fontSize: '20px', color: '#6e6e73', fontWeight: 700 }}>
                {isWaitlist
                  ? (lang === 'KO' ? '이용 예정 시간대' : 'Expected Time')
                  : (lang === 'KO' ? '이용 시간대' : 'Time Interval')}
              </span>
              <span style={{ fontSize: '40px', fontWeight: 900, color: modeAccent, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {startDisplay} ~ {endDisplay}
              </span>
            </div>
          </div>
        </div>

        {/* 하단 대형 단일 확인 CTA 버튼 (96px 풀와이드 · 자동 출력되므로 중복 재출력 버튼 배제) */}
        <div style={{ display: 'flex', width: '100%' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              height: '96px',
              borderRadius: '999px',
              background: isWaitlist ? '#d97706' : '#1d1d1f',
              color: '#ffffff',
              border: 'none',
              fontSize: '32px',
              fontWeight: 900,
              letterSpacing: '-0.6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: isWaitlist
                ? '0 14px 32px rgba(217, 119, 6, 0.28)'
                : '0 14px 32px rgba(0, 0, 0, 0.22)',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; e.currentTarget.style.opacity = '0.9'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
          >
            <span>
              {lang === 'KO' 
                ? `확인 (${countdown}s)` 
                : `Confirm (${countdown}s)`}
            </span>
            <ArrowRight size={30} style={{ color: '#ffffff' }} />
          </button>
        </div>
      </div>
    </div>
  );
};
