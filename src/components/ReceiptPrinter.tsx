import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, CheckCircle, XCircle } from 'lucide-react';
import { kioskHardwareBridge } from '../services/hardware/services/HardwareBridgeClient';
import { printKioskBayAllocationSlip } from '../utils/kioskSlipPrinter';
import { api } from '../services/api';
import { Code128BarcodeSvg } from './common/Code128BarcodeSvg';

export interface ReceiptData {
  branchNm: string;
  address: string;
  tel: string;
  ownerNm?: string;
  bizNo?: string;
  tradeDate: string;
  apprNo: string;
  cardNo?: string;
  cardIssuer?: string;
  terminalId?: string;
  installmentMonths?: number;
  prodNm: string;
  partySize: number;
  totalAmount: number;
  resId: string;
  vatYn?: string;
}

interface ReceiptPrinterProps {
  receiptData: ReceiptData;
  onClose: () => void;
}

export const ReceiptPrinter: React.FC<ReceiptPrinterProps> = ({ receiptData, onClose }) => {
  const [isPrinting, setIsPrinting] = useState(true);
  const [hasPrintError, setHasPrintError] = useState(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<string>('');
  const [countdown, setCountdown] = useState(10);
  const [ownerNm, setOwnerNm] = useState(receiptData.ownerNm || '대표자');
  const hasAutoPrintedRef = useRef(false);
  const isPrintingRef = useRef(false);
  const cardReceiptDoneRef = useRef(false);
  const slipDoneRef = useRef(false);

  const handlePrint = useCallback(async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    setIsPrinting(true);
    setHasPrintError(false);
    let finalOk = false;
    let errDetail = '';

    try {
      const storeInfo = await api.getStoreInfo().catch(() => null);
      const resolvedOwner = receiptData.ownerNm || storeInfo?.owner_nm || storeInfo?.ceo_nm || storeInfo?.ceo_name || '';
      if (resolvedOwner) {
        setOwnerNm(resolvedOwner);
      }
      const isTaxFree = receiptData.vatYn === 'N';
      const supplyAmt = isTaxFree ? 0 : Math.round(receiptData.totalAmount / 1.1);
      const vatAmt = isTaxFree ? 0 : receiptData.totalAmount - supplyAmt;
      const taxFreeAmt = isTaxFree ? receiptData.totalAmount : 0;

      const resolvedStoreInfo = {
        store_name: receiptData.branchNm || storeInfo?.store_nm || 'GOLFOS',
        biz_no: receiptData.bizNo || storeInfo?.biz_no || storeInfo?.biz_reg_no || '',
        ceo_name: resolvedOwner,
        tel: receiptData.tel || storeInfo?.tel || storeInfo?.tel_no || '',
        address: receiptData.address || storeInfo?.address || '',
      };

      const tradeDtStr = receiptData.tradeDate || new Date().toLocaleString('ko-KR');

      const bothPreviouslySucceeded = (receiptData.totalAmount <= 0 || cardReceiptDoneRef.current) && slipDoneRef.current;
      const shouldPrintCardReceipt = receiptData.totalAmount > 0 && (bothPreviouslySucceeded || !cardReceiptDoneRef.current);
      const shouldPrintSlip = bothPreviouslySucceeded || !slipDoneRef.current;

      let cardOk = receiptData.totalAmount <= 0 || cardReceiptDoneRef.current;
      if (shouldPrintCardReceipt) {
        const cardRes = await kioskHardwareBridge.printReceipt({
          sale_id: receiptData.resId || `SALE-${Date.now()}`,
          receipt_no: receiptData.resId || `REC-${Date.now()}`,
          trade_dt: tradeDtStr,
          client_type: 'KIOSK',
          pay_method: 'CARD',
          store_info: resolvedStoreInfo,
          tax_summary: {
            supply_amt: supplyAmt,
            tax_amt: vatAmt,
            tax_free_amt: taxFreeAmt,
            total_amt: receiptData.totalAmount,
            discount_amt: 0,
            pay_amt: receiptData.totalAmount,
          },
          card_info: {
            issuer_name: receiptData.cardIssuer || '신용카드',
            card_no_masked: receiptData.cardNo || '신용카드',
            approval_no: receiptData.apprNo || '-',
            installment_months: receiptData.installmentMonths ?? 0,
            approval_dt: tradeDtStr,
            terminal_id: receiptData.terminalId || localStorage.getItem('LM_KIOSK_TERMINAL_ID') || api.getTerminalId(),
          },
          items: [
            {
              name: receiptData.prodNm,
              qty: receiptData.partySize || 1,
              unit_price: receiptData.totalAmount,
              amount: receiptData.totalAmount,
              is_tax_free: isTaxFree,
            },
          ],
          header_message: '[ 신용카드 매출전표 ]',
          footer_message: '파3 라운딩 결제가 완료되었습니다. 이어서 라운딩 배정표가 출력됩니다.',
        });
        cardOk = Boolean(cardRes?.success);
        cardReceiptDoneRef.current = cardOk;
        if (!cardOk && cardRes?.message) {
          errDetail = cardRes.message;
        }
      }

      let slipOk = slipDoneRef.current;
      if (shouldPrintSlip) {
        const slipRes = await printKioskBayAllocationSlip({
          bayNo: receiptData.prodNm || '파3 라운딩',
          resId: receiptData.resId,
          memberName: `파3 고객 (${receiptData.partySize || 1}명)`,
          productName: receiptData.prodNm,
          actionLabel: '파3 라운딩 접수',
          extraNote: `인원: ${receiptData.partySize || 1}명 / 코스 입장 시 바코드를 스캔해 주세요.`,
          storeInfo: resolvedStoreInfo,
          tradeDt: tradeDtStr,
        });
        slipOk = Boolean(slipRes?.success);
        slipDoneRef.current = slipOk;
        if (!slipOk && slipRes?.message && !errDetail) {
          errDetail = slipRes.message;
        }
      }

      finalOk = cardOk && slipOk;
    } catch (err) {
      console.warn('[ReceiptPrinter] Hardware print fallback:', err);
      finalOk = false;
    } finally {
      setHasPrintError(!finalOk);
      setPrintStatusMsg(
        finalOk
          ? '발행된 영수증과 배정표를 받아 가시기 바랍니다.'
          : errDetail && errDetail.includes('용지')
            ? '프린터 용지가 부족하여 영수증이 출력되지 않았습니다. 아래 내역을 확인하시거나 [영수증 재출력]을 눌러주세요.'
            : errDetail && errDetail.includes('커버')
              ? '프린터 커버가 열려 있어 영수증이 출력되지 않았습니다. 아래 내역을 확인하시거나 [영수증 재출력]을 눌러주세요.'
              : '프린터 연결 지연으로 영수증이 출력되지 않았습니다. 결제는 정상 완료되었으니 [영수증 재출력]을 눌러주세요.'
      );
      setCountdown(finalOk ? 10 : 20);
      isPrintingRef.current = false;
      setIsPrinting(false);
    }
  }, [receiptData]);

  useEffect(() => {
    if (!hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      handlePrint();
    }
  }, [handlePrint]);

  useEffect(() => {
    if (isPrinting) return;
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
  }, [isPrinting, onClose]);

  const formatAmount = (num: number) => {
    return num.toLocaleString();
  };

  // 과세/면세 공급가액 및 부가세 연산
  const isTaxFree = receiptData.vatYn === 'N';
  const taxFreeAmount = isTaxFree ? receiptData.totalAmount : Math.round(receiptData.totalAmount / 1.1);
  const vatAmount = isTaxFree ? 0 : receiptData.totalAmount - taxFreeAmount;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 상단 상태 가이드 */}
      <div 
        style={{ 
          textAlign: 'center', 
          marginBottom: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '12px',
          zIndex: 2
        }}
      >
        <div style={{
          width: '76px',
          height: '76px',
          borderRadius: '50%',
          background: isPrinting
            ? 'rgba(255, 255, 255, 0.12)'
            : hasPrintError
              ? 'rgba(239, 68, 68, 0.18)'
              : 'rgba(16, 185, 129, 0.15)',
          border: `2px solid ${isPrinting ? '#ffffff' : hasPrintError ? '#ef4444' : '#10b981'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: isPrinting ? 'pulse 1.5s infinite' : 'none'
        }}>
          {isPrinting ? (
            <Printer size={38} style={{ color: '#ffffff', animation: 'wiggle 0.5s infinite' }} />
          ) : hasPrintError ? (
            <XCircle size={44} style={{ color: '#ef4444' }} />
          ) : (
            <CheckCircle size={44} style={{ color: '#10b981' }} />
          )}
        </div>
        
        <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>
          {isPrinting
            ? '지지직... 영수증 인쇄 중...'
            : hasPrintError
              ? '결제 완료 (영수증 인쇄 지연 안내)'
              : '결제 완료 및 영수증 발행 성공!'}
        </h3>
        <p style={{ fontSize: '18px', color: hasPrintError ? '#fca5a5' : '#c8c8cd', margin: 0, maxWidth: '560px', lineHeight: 1.4 }}>
          {isPrinting
            ? '영수증이 나올 때까지 잠시만 기다려 주십시오.'
            : printStatusMsg || '발행된 영수증을 받아 가시기 바랍니다.'}
        </p>
      </div>

      {/* 가상 프린터 슬릿 (출구) */}
      <div 
        style={{
          width: '420px',
          height: '16px',
          background: '#07090e',
          borderRadius: '8px',
          border: '2.5px solid #2c323f',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          position: 'relative',
          zIndex: 3
        }}
      />

      {/* 인쇄되는 감열지 영수증 (Rollout CSS 애니메이션) */}
      <div 
        className={`receipt-paper ${isPrinting ? 'printing' : 'done'}`}
        style={{
          width: '390px',
          background: '#fafaf6', // 세련된 영수증 전용 미색
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          position: 'relative',
          zIndex: 1,
          transformOrigin: 'top center',
          boxSizing: 'border-box',
          padding: '24px 30px',
          color: '#111111',
          fontFamily: 'monospace, sans-serif',
          fontSize: '14px',
          borderLeft: '1px solid #e1e1d8',
          borderRight: '1px solid #e1e1d8',
          marginTop: '-4px' // 프린터 입구와 밀착
        }}
      >
        {/* 상단 톱니 절취선 데코레이션 */}
        <div className="zigzag-top" />

        {/* 영수증 본문 */}
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #a1a19b', paddingBottom: '16px' }}>
          <h4 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            [ 영 수 증 ]
          </h4>
          <span style={{ fontSize: '16px', fontWeight: 700 }}>{receiptData.branchNm}</span>
          <div style={{ fontSize: '12px', color: '#555555', marginTop: '6px', lineHeight: 1.4 }}>
            주소: {receiptData.address}<br />
            전화: {receiptData.tel}<br />
            대표자: {ownerNm}
          </div>
        </div>

        {/* 거래 및 승인 내역 */}
        <div style={{ padding: '14px 0', borderBottom: '1px dashed #a1a19b', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>거래일시:</span>
            <span style={{ fontWeight: 700 }}>{receiptData.tradeDate}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>카드번호:</span>
            <span>{receiptData.cardNo || '****-****-****-****'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>승인번호:</span>
            <span style={{ fontWeight: 700, color: '#1d1d1f' }}>{receiptData.apprNo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>예약번호:</span>
            <span>{receiptData.resId}</span>
          </div>
        </div>

        {/* 판매 물품 정보 */}
        <div style={{ padding: '16px 0', borderBottom: '1px dashed #a1a19b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, marginBottom: '10px', fontSize: '14px' }}>
            <span>상품명</span>
            <span>금액</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>{receiptData.prodNm}</span>
              <span>{formatAmount(receiptData.totalAmount)}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#555555' }}>
              수량: {receiptData.partySize}명
            </div>
          </div>
        </div>

        {/* 부가세 및 합계 금액 */}
        <div style={{ padding: '14px 0', borderBottom: '1px dashed #a1a19b', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>{isTaxFree ? '면세 공급가액:' : '과세 공급가액:'}</span>
            <span>₩{formatAmount(taxFreeAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>부가가치세 (10%):</span>
            <span>₩{formatAmount(vatAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 900, marginTop: '4px' }}>
            <span>합계 금액:</span>
            <span style={{ color: '#1d1d1f' }}>₩{formatAmount(receiptData.totalAmount)}</span>
          </div>
        </div>

        {/* 하단 표준 Code128B 스캔 바코드 렌더러 (게이트 출입 및 예약 확인용) */}
        <div style={{ textAlign: 'center', paddingTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#555555' }}>[ 게이트 출입 및 타석 확인용 바코드 ]</span>

          <Code128BarcodeSvg
            value={String(receiptData.resId || receiptData.apprNo || 'GOLFOS').slice(0, 24)}
            width={220}
            barHeight={46}
            labelText={String(receiptData.resId || receiptData.apprNo || '').slice(0, 20)}
            testId="receipt-printer-barcode"
          />

          <span style={{ fontSize: '11px', color: '#777777', marginTop: '4px' }}>
            * 타석 입장 및 파3 코스 입장 시 바코드를 스캔해 주십시오.
          </span>
        </div>

        {/* 하단 톱니 절취선 데코레이션 */}
        <div className="zigzag-bottom" />
      </div>

      {/* 완료 확인 및 재출력 버튼 (인쇄 완료 후에만 터치 가능하도록 노출) */}
      {!isPrinting && (
        <div
          style={{
            marginTop: '32px',
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            zIndex: 3,
            animation: 'slideUp 0.3s ease-in-out'
          }}
        >
          <button
            type="button"
            onClick={handlePrint}
            className="kiosk-btn"
            style={{
              height: '72px',
              fontSize: '20px',
              fontWeight: 800,
              padding: '0 36px',
              borderRadius: '999px',
              background: '#f5f5f7',
              color: '#1d1d1f',
              border: '1px solid #d2d2d7',
              boxShadow: '0 14px 32px rgba(0, 0, 0, 0.25)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <Printer size={22} style={{ color: '#0071e3' }} />
            <span>영수증 재출력</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="kiosk-btn"
            style={{
              height: '72px',
              fontSize: '22px',
              fontWeight: 900,
              padding: '0 52px',
              borderRadius: '999px',
              background: '#1d1d1f',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 14px 32px rgba(0, 0, 0, 0.35)',
              cursor: 'pointer'
            }}
          >
            {`확인 (처음으로) (${countdown}s)`}
          </button>
        </div>
      )}

      {/* 키프레임 및 영수증 롤아웃 인젝션 스타일 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        /* 영수증 프린트 지지직 흘러나오는 애니메이션 */
        .receipt-paper.printing {
          animation: rollout 3s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
        }
        .receipt-paper.done {
          max-height: 720px;
        }
        
        @keyframes rollout {
          0% {
            max-height: 0px;
            padding-top: 0px;
            padding-bottom: 0px;
            opacity: 0.8;
          }
          100% {
            max-height: 720px;
            padding-top: 24px;
            padding-bottom: 30px;
            opacity: 1;
          }
        }

        /* 지그재그 톱니 절취선 스타일 */
        .zigzag-top, .zigzag-bottom {
          position: absolute;
          left: 0;
          width: 100%;
          height: 8px;
          background-size: 16px 8px;
          z-index: 10;
        }
        .zigzag-top {
          top: -8px;
          background-image: linear-gradient(135deg, transparent 75%, #fafaf6 75%),
                            linear-gradient(225deg, transparent 75%, #fafaf6 75%);
        }
        .zigzag-bottom {
          bottom: -8px;
          background-image: linear-gradient(45deg, transparent 75%, #fafaf6 75%),
                            linear-gradient(315deg, transparent 75%, #fafaf6 75%);
        }
      `}</style>
    </div>
  );
};
