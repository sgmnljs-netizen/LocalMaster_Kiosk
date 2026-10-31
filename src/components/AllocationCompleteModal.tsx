import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Check, Printer, ArrowRight, RefreshCw } from 'lucide-react';
import { kioskHardwareBridge } from '../services/hardware/services/HardwareBridgeClient';
import { printKioskBayAllocationSlip } from '../utils/kioskSlipPrinter';
import { useKioskSettings } from '../stores/kioskSettings';
import { TimeMaster } from '../utils/timeMaster';
import { api } from '../services/api';
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
  const [storeInfo, setStoreInfo] = useState<{ store_nm: string; address: string; tel: string; biz_no?: string; ceo_name?: string } | null>(null);
  const hasAutoPrintedRef = useRef(false);
  const isPrintingRef = useRef(false);
  const cardReceiptDoneRef = useRef(false);
  const slipDoneRef = useRef(false);

  useEffect(() => {
    api.getStoreInfo().then((info) => {
      if (info) setStoreInfo(info);
    }).catch(console.error);
  }, []);

  const handlePrint = useCallback(async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    setIsPrinting(true);
    setHasPrintError(false);
    setPrintStatus(lang === 'KO' ? '출력 중...' : 'Printing...');
    try {
      const nowStr = TimeMaster.formatKstDateTime(new Date());
      const startStr = startTime || nowStr.slice(11, 16);
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
        biz_no: (info as any)?.biz_no || (info as any)?.biz_reg_no || '',
        ceo_name: (info as any)?.ceo_name || (info as any)?.owner_name || '',
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
          end_time: endTime,
          endTime,
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

  return (
    <div 
      data-testid="allocation-complete-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '24px'
      }}
    >
      {/* Apple Snow White Ticket Card */}
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#ffffff',
          borderRadius: '32px',
          border: '1px solid #e5e5ea',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15)',
          padding: '44px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: '#1d1d1f',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Apple Minimal Green Circle Icon */}
        <div style={{ marginBottom: '20px' }}>
          <div 
            style={{ 
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(52, 199, 89, 0.12)',
              border: '1px solid rgba(52, 199, 89, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(52, 199, 89, 0.15)'
            }}
          >
            <Check size={40} style={{ color: '#34c759', strokeWidth: 2.5 }} />
          </div>
        </div>

        {/* 100% 한글 애플 타이포그래피 */}
        <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-1px' }}>
          {checkinMode === 'MOVE_BAY'
            ? (lang === 'KO' ? '타석 이동 확인표' : 'Bay Relocation Confirmation Slip')
            : checkinMode === 'PRE_CHECKIN'
            ? (lang === 'KO' ? '사전 체크인 접수 확인표' : 'Pre-Checkin Confirmation Slip')
            : checkinMode === 'PENDING_WAIT'
            ? (lang === 'KO' ? '타석 체크인 대기 확인표' : 'Check-in Waiting Slip')
            : checkinMode === 'REPRINT'
            ? (lang === 'KO' ? '골프 타석 배정표 (재출력)' : 'Bay Assignment Ticket (Reprint)')
            : (lang === 'KO' ? '골프 타석 배정표' : 'Golf Bay Assignment Ticket')}
        </h2>
        
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isPrinting ? '#eff6ff' : isPrinterOffline ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${isPrinting ? '#bfdbfe' : isPrinterOffline ? '#fecdd3' : '#bbf7d0'}`,
            padding: '8px 18px',
            borderRadius: '999px',
            color: isPrinting ? '#1d4ed8' : isPrinterOffline ? '#dc2626' : '#15803d',
            fontSize: '15px',
            fontWeight: 700,
            marginBottom: isPrinterOffline ? '12px' : (noticeMessage ? '16px' : '28px'),
            letterSpacing: '-0.3px'
          }}
        >
          <Printer size={18} style={{ color: isPrinting ? '#0071e3' : isPrinterOffline ? '#dc2626' : '#15803d' }} />
          <span>
            {printStatus 
              ? `${lang === 'KO' ? '영수증 인쇄 상태' : 'Print Status'}: ${printStatus}` 
              : (lang === 'KO' ? '영수증 및 확인표가 현장에서 출력 중입니다.' : 'Printing receipt and confirmation ticket...')}
          </span>
        </div>

        {isPrinterOffline && (
          <div
            data-testid="printer-offline-warning"
            style={{
              width: '100%',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '16px',
              padding: '12px 16px',
              marginBottom: noticeMessage ? '12px' : '20px',
              fontSize: '14px',
              fontWeight: 700,
              color: '#be123c',
              lineHeight: 1.45,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span>
              {lang === 'KO'
                ? '⚠️ 프린터 용지 부족 또는 연결 지연으로 확인표가 출력되지 않았습니다. 타석 배정은 정상 완료되었으니 아래 배정 타석 번호를 확인하신 뒤 바로 입장하시거나 [영수증 재출력]을 눌러주세요.'
                : '⚠️ Ticket printing failed due to paper shortage or printer offline. Your bay is assigned—please check your bay number below or tap [Reprint].'}
            </span>
            <Code128BarcodeSvg
              value={String(resId || `BAY-${bayNo}`).slice(0, 24)}
              width={210}
              barHeight={42}
              testId="allocation-offline-barcode"
            />
          </div>
        )}

        {noticeMessage && (
          <div style={{
            width: '100%',
            background: checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '#eff6ff' : '#ecfdf5',
            border: checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '1px solid #bfdbfe' : '1px solid #a7f3d0',
            borderRadius: '14px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '15px',
            fontWeight: 700,
            color: checkinMode === 'PRE_CHECKIN' || checkinMode === 'PENDING_WAIT' ? '#1d4ed8' : '#047857',
            lineHeight: 1.4
          }}>
            {noticeMessage}
          </div>
        )}

        {/* 한글 데이터 그리드 티켓 카딩 */}
        <div 
          style={{ 
            width: '100%', 
            background: '#f5f5f7', 
            borderRadius: '24px', 
            border: '1px solid #e5e5ea', 
            padding: '24px 28px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '18px', 
            marginBottom: '32px'
          }}
        >
          {/* 배정 타석 번호 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e5ea', paddingBottom: '16px' }}>
            <span style={{ fontSize: '17px', color: '#86868b', fontWeight: 600, letterSpacing: '-0.3px' }}>
              {checkinMode === 'MOVE_BAY' ? (lang === 'KO' ? '이동 내역' : 'Relocated Bay') : (lang === 'KO' ? '배정 위치' : 'Assigned Bay')}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              {checkinMode === 'MOVE_BAY' && oldBayNo !== undefined && oldBayNo !== null && (
                <>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: '#86868b', textDecoration: 'line-through' }}>
                    {!isNaN(Number(oldBayNo)) ? `${String(oldBayNo).padStart(2, '0')}번` : String(oldBayNo)}
                  </span>
                  <span style={{ fontSize: '24px', fontWeight: 900, color: '#10b981' }}>➔</span>
                </>
              )}
              <span style={{ fontSize: !isNaN(Number(bayNo)) ? '52px' : '34px', fontWeight: 950, color: '#000000', letterSpacing: '-1.5px' }}>
                {!isNaN(Number(bayNo)) ? String(bayNo).padStart(2, '0') : String(bayNo)}
              </span>
              {!isNaN(Number(bayNo)) && (
                <span style={{ fontSize: '22px', fontWeight: 800, color: '#1d1d1f' }}>
                  {lang === 'KO' ? '번 타석' : ''}
                </span>
              )}
            </div>
          </div>

          {/* 이용 시간 & 이용 시간대 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center', border: '1px solid #e5e5ea' }}>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                {checkinMode === 'MOVE_BAY' ? (lang === 'KO' ? '보전 잔여 시간' : 'Remaining Time') : (lang === 'KO' ? '이용 시간' : 'Duration')}
              </span>
              <span style={{ fontSize: '26px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                {durationMin}{lang === 'KO' ? '분' : ' min'}
              </span>
            </div>

            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center', border: '1px solid #e5e5ea' }}>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                {lang === 'KO' ? '이용 시간대' : 'Time Interval'}
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#0071e3', letterSpacing: '-0.5px' }}>
                {startDisplay} ~ {endDisplay}
              </span>
            </div>
          </div>
        </div>

        {/* 버튼 영역: 재출력 버튼 + 확인 버튼 */}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            style={{
              flex: '1',
              height: '64px',
              borderRadius: '999px',
              background: '#f5f5f7',
              color: '#1d1d1f',
              border: '1px solid #d2d2d7',
              fontSize: '18px',
              fontWeight: 700,
              cursor: isPrinting ? 'not-allowed' : 'pointer',
              opacity: isPrinting ? 0.55 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
          >
            <Printer size={20} style={{ color: '#0071e3' }} />
            <span>{lang === 'KO' ? '영수증 재출력' : 'Reprint'}</span>
          </button>

          <button
            onClick={onClose}
            style={{
              flex: '2',
              height: '64px',
              borderRadius: '999px',
              background: '#1d1d1f',
              color: '#ffffff',
              border: 'none',
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.opacity = '0.9'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
          >
            <span>
              {lang === 'KO' 
                ? `확인 (${countdown}s)` 
                : `Confirm (${countdown}s)`}
            </span>
            <ArrowRight size={22} style={{ color: '#ffffff' }} />
          </button>
        </div>
      </div>
    </div>
  );
};
