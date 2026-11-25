import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, MapPin, Printer, RefreshCw, Ticket } from 'lucide-react';
import { api, type DispenserPassSummary, type KioskStoreInfo } from '../../services/api';
import { kioskHardwareBridge } from '../../services/hardware/services/HardwareBridgeClient';
import { useKioskSettings } from '../../stores/kioskSettings';
import { TimeMaster } from '../../utils/timeMaster';

export interface DispenserReceiptContext {
  saleId?: string;
  productName: string;
  amount: number;
  vatYn?: string;
  apprNo?: string;
  tradeDate?: string;
  cardIssuer?: string;
  cardNoMasked?: string;
  installmentMonths?: number;
  terminalId?: string;
}

interface DispenserCompleteModalProps {
  passInfo: DispenserPassSummary;
  reused?: boolean;
  receiptContext?: DispenserReceiptContext | null;
  onDone: () => void;
}

const AUTO_CLOSE_SEC = 15;

export const DispenserCompleteModal: React.FC<DispenserCompleteModalProps> = ({
  passInfo,
  reused = false,
  receiptContext = null,
  onDone,
}) => {
  const { settings } = useKioskSettings();
  const [countdown, setCountdown] = useState<number>(AUTO_CLOSE_SEC);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [hasPrintError, setHasPrintError] = useState<boolean>(false);
  const storeInfoRef = useRef<KioskStoreInfo | null>(null);
  const isPrintingRef = useRef<boolean>(false);
  const hasAutoPrintedRef = useRef<boolean>(false);

  const handlePrintReceipt = useCallback(async () => {
    if (!receiptContext || isPrintingRef.current) return;
    isPrintingRef.current = true;
    setIsPrinting(true);
    setHasPrintError(false);
    setPrintStatus('영수증 출력 중...');
    try {
      const info = storeInfoRef.current || (await api.getStoreInfo().catch(() => null));
      if (info) storeInfoRef.current = info;

      const totalAmt = Math.max(0, Number(receiptContext.amount || 0));
      const isTaxFree = String(receiptContext.vatYn || 'Y').toUpperCase() === 'N';
      const vat = isTaxFree ? 0 : Math.round(totalAmt / 11);
      const supply = isTaxFree ? 0 : totalAmt - vat;
      const taxFreeAmt = isTaxFree ? totalAmt : 0;
      const safeApprNo = receiptContext.apprNo || `DISP-${Date.now().toString().slice(-6)}`;
      const tradeDtStr = receiptContext.tradeDate || TimeMaster.formatKstDateTime(new Date());
      const quotaSummary =
        passInfo.total_quota === null || passInfo.total_quota === undefined
          ? '당일 무제한 볼 배급'
          : `1·2층 볼 배급 ${passInfo.total_quota}회 (당일 유효)`;

      const res = await kioskHardwareBridge.printReceipt({
        sale_id: receiptContext.saleId || `SALE-${safeApprNo}`,
        receipt_no: `RC-${safeApprNo.slice(-6)}`,
        trade_dt: tradeDtStr,
        client_type: 'KIOSK',
        member_name: passInfo.member_name || '일일방문객',
        member_no: passInfo.member_no,
        pay_method: totalAmt > 0 ? 'CARD' : 'FREE',
        store_info: {
          store_name: info?.store_nm || settings.deviceName || '골포스 스마트 키오스크',
          biz_no: info?.biz_no || info?.biz_reg_no || '',
          ceo_name: info?.ceo_name || info?.owner_name || '',
          tel: info?.tel || '',
          address: info?.address || '',
        },
        items: [
          {
            name: receiptContext.productName || passInfo.prod_nm || '일일 볼배급권',
            qty: 1,
            unit_price: totalAmt,
            amount: totalAmt,
            discount_amt: 0,
            is_tax_free: isTaxFree,
          },
        ],
        tax_summary: {
          supply_amt: supply,
          tax_amt: vat,
          tax_free_amt: taxFreeAmt,
          total_amt: totalAmt,
          discount_amt: 0,
          pay_amt: totalAmt,
        },
        card_info:
          totalAmt > 0
            ? {
                issuer_name: receiptContext.cardIssuer || '신용카드',
                card_no_masked: receiptContext.cardNoMasked || '신용카드',
                approval_no: safeApprNo,
                installment_months: receiptContext.installmentMonths ?? 0,
                terminal_id: receiptContext.terminalId || settings.terminalId || api.getTerminalId(),
              }
            : undefined,
        footer_message: `${quotaSummary}\n임시번호: ${passInfo.member_no} (소진 시 안면 자동 파기)`,
      });

      if (res?.success) {
        setPrintStatus('영수증 출력 완료');
        setHasPrintError(false);
      } else {
        const msg = res?.message || '';
        setHasPrintError(true);
        setPrintStatus(
          msg.includes('용지')
            ? '프린터 용지 부족'
            : msg.includes('커버')
              ? '프린터 커버 열림'
              : '프린터 미연결'
        );
      }
    } catch {
      setHasPrintError(true);
      setPrintStatus('프린터 미연결');
    } finally {
      isPrintingRef.current = false;
      setIsPrinting(false);
    }
  }, [passInfo.member_name, passInfo.member_no, passInfo.prod_nm, passInfo.total_quota, receiptContext, settings.deviceName, settings.terminalId]);

  useEffect(() => {
    if (!receiptContext) return;
    const autoPrint = settings.autoPrintReceipt ?? true;
    if (autoPrint && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      void handlePrintReceipt();
    }
  }, [handlePrintReceipt, receiptContext, settings.autoPrintReceipt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onDone]);

  const quotaText =
    passInfo.total_quota === null || passInfo.total_quota === undefined
      ? '오늘 무제한 이용 가능'
      : `오늘 가능 횟수: ${passInfo.used_count} / ${passInfo.total_quota}회`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 24px 90px 24px',
        boxSizing: 'border-box',
        zIndex: 9060,
      }}
    >
      <div
        style={{
          width: '940px',
          maxWidth: 'calc(100vw - 48px)',
          overflow: 'hidden',
          borderRadius: '40px',
          border: '2px solid #a7f3d0',
          backgroundColor: '#ffffff',
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.3)',
          animation: 'fadeUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
            padding: '38px 42px',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <CheckCircle2 size={58} style={{ color: '#d1fae5', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#d1fae5' }}>
                {reused ? '당일 배급권 확인 완료' : '입실 배정 완료'}
              </p>
              <h2
                style={{
                  margin: '6px 0 0 0',
                  fontSize: '42px',
                  fontWeight: 950,
                  letterSpacing: '-1px',
                  lineHeight: 1.2,
                }}
              >
                {passInfo.member_name || passInfo.member_no} 님, 준비되었습니다!
              </h2>
            </div>
          </div>
          <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
            <span
              style={{
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.22)',
                padding: '10px 22px',
                fontSize: '22px',
                fontWeight: 900,
              }}
            >
              {passInfo.prod_nm || '골프 볼 배급권'}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '999px',
                background: '#fcd34d',
                padding: '10px 22px',
                fontSize: '22px',
                fontWeight: 950,
                color: '#0f172a',
              }}
            >
              <Ticket size={22} />
              {quotaText}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '34px 42px' }}>
          <div
            style={{
              borderRadius: '28px',
              border: '2px solid #86efac',
              background: '#ecfdf5',
              padding: '28px 34px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#065f46' }}>
              <MapPin size={32} style={{ color: '#059669' }} />
              <h3 style={{ margin: 0, fontSize: '29px', fontWeight: 950, letterSpacing: '-0.6px' }}>
                1층 · 2층 볼 배급기 이용 안내
              </h3>
            </div>
            <ol
              style={{
                margin: '20px 0 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                fontSize: '24px',
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              {[
                '1·2층 볼 배급기 배출구 아래에 바구니를 먼저 올려 주세요.',
                '안면인식기 화면의 [인증]을 누르고 얼굴을 비춰 주세요.',
                '신호음에 맞춰 볼이 자동 배출되면 빈 타석에서 연습하세요.',
              ].map((stepText, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <span
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#059669',
                      color: '#ffffff',
                      fontSize: '21px',
                      fontWeight: 950,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ lineHeight: 1.45, wordBreak: 'keep-all' }}>{stepText}</span>
                </li>
              ))}
            </ol>
          </div>

          {receiptContext && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                borderRadius: '20px',
                border: hasPrintError ? '2px solid #fca5a5' : '2px solid #e2e8f0',
                background: hasPrintError ? '#fef2f2' : '#f8fafc',
                padding: '18px 24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Printer size={26} style={{ color: hasPrintError ? '#dc2626' : '#334155', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
                    {printStatus || '결제 영수증 출력 가능'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#475569', marginTop: '2px' }}>
                    {receiptContext.amount.toLocaleString()}원 · 승인번호 {receiptContext.apprNo || '-'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={isPrinting}
                onClick={() => void handlePrintReceipt()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '16px',
                  border: '2px solid #cbd5e1',
                  background: '#ffffff',
                  padding: '12px 22px',
                  fontSize: '19px',
                  fontWeight: 900,
                  color: '#0f172a',
                  cursor: isPrinting ? 'wait' : 'pointer',
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={20} />
                {isPrinting ? '출력 중' : '영수증 출력'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onDone}
            style={{
              width: '100%',
              borderRadius: '24px',
              border: 'none',
              background: '#0f172a',
              padding: '26px 32px',
              fontSize: '28px',
              fontWeight: 950,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 14px 28px rgba(15, 23, 42, 0.22)',
            }}
          >
            처음으로 돌아가기 ({countdown}초)
          </button>
        </div>
      </div>
    </div>
  );
};

export default DispenserCompleteModal;
