import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CreditCard, Printer, ShieldAlert, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { api, STORE_CODE } from '../services/api';
import { useKioskSettings } from '../stores/kioskSettings';
import { useKioskVanPayment } from '../hooks/useKioskVanPayment';
import { kioskVanClient } from '../services/van/van_client';
import type { CardApprovalResult } from '../services/van/van_types';


interface PaymentTerminalProps {
  productName: string;
  amount: number;
  assignedBayNo?: number | null;
  assignedBayNos?: number[];
  assignedLockerNo?: number | null;
  resId?: string | null;
  memberName?: string;
  memberNo?: string;
  onPaymentSuccess: (payResult?: { apprNo: string; tradeDate: string; amount: number; cardApproval?: CardApprovalResult }) => void;
  onCancel: () => void;
}

export const PaymentTerminal: React.FC<PaymentTerminalProps> = ({
  productName,
  amount,
  assignedBayNo,
  assignedBayNos,
  assignedLockerNo,
  resId,
  memberName,
  memberNo,
  onPaymentSuccess,
  onCancel
}) => {
  const { settings } = useKioskSettings();
  const { state: vanState, isProcessing, remainingSeconds, error: vanError, startPayment, cancelPayment } = useKioskVanPayment();

  const [payStep, setPayStep] = useState<'INSERT_CARD' | 'PROCESSING' | 'PRINT_RECEIPT'>('INSERT_CARD');
  const [appNo, setAppNo] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [cardIssuer, setCardIssuer] = useState('');
  const [maskedCard, setMaskedCard] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const isPayRequested = useRef(false);

  // 결제 실행 핸들러
  const handleExecutePayment = useCallback(async () => {
    if (isPayRequested.current) return;
    isPayRequested.current = true;

    if (amount === 0) {
      setPayStep('PRINT_RECEIPT');
      const now = new Date();
      const generatedTradeDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const generatedAppNo = String(Math.floor(10000000 + Math.random() * 90000000));
      setReceiptDate(generatedTradeDate);
      setAppNo(generatedAppNo);
      onPaymentSuccess({ apprNo: generatedAppNo, tradeDate: generatedTradeDate, amount: 0 });
      return;
    }

    setPayStep('INSERT_CARD');
    setErrorMsg('');

    const res = await startPayment({
      amount,
      productName,
      customerName: memberName,
      timeoutSeconds: 30,
    });

    if (res.success) {
      setAppNo(res.auth_code);
      setReceiptDate(res.approved_at);
      setCardIssuer(res.issuer_name || '신용카드');
      setMaskedCard(res.card_no_masked || '9410-****-****-****');
      setPayStep('PROCESSING');

      try {
        if (resId) {
          const webhookRes = await api.processPaymentWebhook(resId, amount);
          if (!webhookRes.success) {
            throw new Error(webhookRes.message);
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        setPayStep('PRINT_RECEIPT');
        onPaymentSuccess({ apprNo: res.auth_code, tradeDate: res.approved_at, amount, cardApproval: res });
      } catch (err: any) {
        // 🚨 2-Phase Commit 보상 트랜잭션 (자동 망취소)
        try {
          const orgDate = res.approved_at ? res.approved_at.replace(/[^0-9]/g, '').slice(0, 8) : '';
          await kioskVanClient.cancelCardPayment({
            amount,
            orgAuthCode: res.auth_code,
            orgApprovedDate: orgDate,
            terminalId: res.terminal_id,
            vanTrNo: res.van_tr_no,
            reason: '타석 배정 전산 오류로 인한 자동 망취소',
          });
          setErrorMsg('타석 배정 처리 실패로 카드 결제가 자동 취소(망취소)되었습니다. 카드를 회수해 주세요.');
        } catch {
          setErrorMsg(err.message || '결제 후 배정 처리 중 오류가 발생했습니다.');
        }
        setPayStep('INSERT_CARD');
        isPayRequested.current = false;
      }
    } else {
      setPayStep('INSERT_CARD');
      setErrorMsg(res.error_message || '결제가 승인되지 않았습니다. 카드를 다시 확인해 주세요.');
      isPayRequested.current = false;
    }
  }, [amount, productName, memberName, resId, startPayment, onPaymentSuccess]);

  useEffect(() => {
    handleExecutePayment();
  }, []);

  const handleUserCancel = () => {
    cancelPayment();
    onCancel();
  };


  return (
    <div 
      style={{
        width: '100%',
        maxWidth: '720px',
        margin: '0 auto',
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '32px',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* 1단계: 카드 삽입 대기 */}
      {payStep === 'INSERT_CARD' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px', width: '100%' }}>
          {errorMsg && (
            <div 
              style={{ 
                background: '#fff0f0', 
                border: '1px solid #ffc2c2',
                padding: '16px', 
                borderRadius: '16px', 
                textAlign: 'center',
                color: '#ff3b30',
                fontSize: '16px',
                fontWeight: 700,
                width: '100%'
              }}
            >
              {errorMsg}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-0.5px' }}>신용카드 결제 진행</h2>
            <p style={{ fontSize: '17px', color: '#86868b', margin: 0, fontWeight: 500 }}>IC 카드를 아래의 단말기 투입구에 깊숙이 꽂아 주세요.</p>
          </div>

          {/* 결제 요약 금액 명세서 */}
          <div style={{ width: '100%', padding: '24px 28px', background: '#f5f5f7', borderRadius: '20px', border: '1px solid #e5e5ea', display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '17px' }}>
              <span style={{ color: '#86868b', fontWeight: 600 }}>구매 상품</span>
              <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>{productName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '17px', borderTop: '1px solid #e5e5ea', paddingTop: '14px' }}>
              <span style={{ color: '#86868b', fontWeight: 600 }}>결제 금액</span>
              <strong style={{ color: '#0071e3', fontSize: '26px', fontWeight: 900, letterSpacing: '-0.5px' }}>{amount.toLocaleString()} 원</strong>
            </div>
          </div>

          {/* 단말기 투입구 모사 애니메이션 */}
          <div className="card-terminal-wrap" style={{ width: '100%', background: '#1d1d1f', padding: '28px 20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', boxSizing: 'border-box', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)' }}>
            {/* 단말기 투입구 */}
            <div style={{ width: '220px', height: '20px', background: '#000000', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 0 10px rgba(0,0,0,0.8)' }} />
            
            {/* 카드 투입 모션 */}
            <div className="animate-card-slide" style={{ position: 'relative' }}>
              <div 
                style={{
                  width: '140px',
                  height: '220px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                  border: '1.5px solid rgba(99, 102, 241, 0.4)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ width: '36px', height: '28px', background: '#fbbf24', borderRadius: '4px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }} />
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '13px', letterSpacing: '1px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>PREMIUM CARD</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span className="animate-blink" style={{ fontSize: '16px', color: '#60a5fa', fontWeight: 800 }}>
                {vanState === 'REQUESTING'
                  ? '금융사 승인 처리 중입니다...'
                  : `단말기에 IC 카드를 꽂아주세요 (${remainingSeconds}초)`}
              </span>
              <span style={{ fontSize: '12px', color: '#86868b', fontFamily: 'monospace' }}>
                단말기: {settings.deviceName} (TID: {settings.terminalId})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
            <button 
              onClick={handleUserCancel}
              style={{
                flex: 1,
                height: '60px',
                borderRadius: '16px',
                background: '#f5f5f7',
                border: '1px solid #e5e5ea',
                color: '#1d1d1f',
                fontSize: '18px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              결제 취소
            </button>
            {errorMsg && (
              <button 
                onClick={handleExecutePayment}
                style={{
                  flex: 1,
                  height: '60px',
                  borderRadius: '16px',
                  background: '#0071e3',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(0, 113, 227, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                <RefreshCw size={20} />
                다시 시도
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2단계: 승인 요청 중 */}
      {payStep === 'PROCESSING' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', padding: '60px 0' }}>
          <div 
            style={{
              width: '120px',
              height: '120px',
              border: '6px solid #e5e5ea',
              borderTopColor: '#0071e3',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', marginBottom: '8px' }}>신용카드 결제 승인 중</h2>
            <p style={{ fontSize: '18px', color: '#86868b' }}>
              금융사 네트워크 승인을 요청하고 있습니다. 카드를 빼지 마세요.
            </p>
          </div>
        </div>
      )}

      {/* 3단계: 영수증 출력 완료 */}
      {payStep === 'PRINT_RECEIPT' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px', width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
              {amount > 0 ? '결제 완료 & 영수증 발행' : '타석 배정 완료 & 배정표 발행'}
            </h2>
            <p style={{ fontSize: '17px', color: '#86868b', marginTop: '6px', margin: '6px 0 0 0', fontWeight: 500 }}>
              {amount > 0 
                ? '아래 출구에서 영수증을 반드시 챙겨서 이용해 주시기 바랍니다.'
                : '아래 출구에서 타석 배정표를 반드시 챙겨서 입장해 주시기 바랍니다.'}
            </p>
          </div>

          {/* 지지직 인쇄되는 영수증 또는 배정표 종이 */}
          <div className="receipt-paper" style={{ boxShadow: '0 15px 35px rgba(0, 0, 0, 0.12)' }}>
            {amount > 0 ? (
              // 일일이용권 결제 영수증
              <>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '14px', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px' }}>⛳ 무인 골프 스튜디오</h3>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>프리미엄 골프 아카데미 무인점</p>
                  <p style={{ fontSize: '12px', color: '#555' }}>지점코드: {STORE_CODE}</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>단말기번호:</span>
                    <strong>{settings.terminalId || api.getTerminalId()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>거래일시:</span>
                    <strong>{receiptDate}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>구매상품:</span>
                    <strong>{productName}</strong>
                  </div>

                  {(assignedBayNos && assignedBayNos.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #000', padding: '8px', margin: '6px 0', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>배정 타석 목록 ({assignedBayNos.length}석):</span>
                        <strong style={{ fontSize: '16px', color: '#047857' }}>{assignedBayNos.join(', ')}번 타석</strong>
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>* 동반자별 입실 티켓 및 출입 바코드가 아래에 각각 인출됩니다.</span>
                    </div>
                  ) : (assignedBayNo !== undefined && assignedBayNo !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #000', padding: '6px', margin: '6px 0', background: '#f8fafc' }}>
                      <span>배정 타석:</span>
                      <strong style={{ fontSize: '16px' }}>{assignedBayNo}번 타석 (즉시입실)</strong>
                    </div>
                  ))}

                  {assignedLockerNo !== undefined && assignedLockerNo !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #000', padding: '6px', margin: '6px 0', background: '#f8fafc' }}>
                      <span>대여 라카:</span>
                      <strong style={{ fontSize: '16px' }}>{assignedLockerNo}번 개인 사물함</strong>
                    </div>
                  )}

                  {(() => {
                    const supplyAmount = Math.round(amount / 1.1);
                    const vatAmount = amount - supplyAmount;
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '10px', marginTop: '4px' }}>
                          <span>판매금액:</span>
                          <span>{supplyAmount.toLocaleString()} 원</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>부 가 세:</span>
                          <span>{vatAmount.toLocaleString()} 원</span>
                        </div>
                      </>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 0' }}>
                    <span>합계금액:</span>
                    <span>{amount.toLocaleString()} 원</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>결제수단:</span>
                    <span>{cardIssuer || '신용카드 (IC)'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>카드번호:</span>
                    <span>{maskedCard || '9410-12**-****-****'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>승인번호:</span>
                    <strong style={{ fontSize: '14px' }}>{appNo}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '14px', marginTop: '14px', fontSize: '12px', color: '#444' }}>
                  <p>이용권 유효기간 내에만 타석 사용이 보장됩니다.</p>
                  <p style={{ marginTop: '4px', fontWeight: 700 }}>이용해 주셔서 대단히 감사합니다.</p>
                </div>
              </>
            ) : (
              // 회원권/이용권 타석 배정표 (Ticket)
              <>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '14px', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '1px', color: '#111' }}>🎫 타석 배정표</h3>
                  <p style={{ fontSize: '13px', marginTop: '4px', color: '#666' }}>프리미엄 골프 아카데미 무인점</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                  {/* 타석 번호 강조 */}
                  <div 
                    style={{ 
                      border: '2px solid #000', 
                      borderRadius: '8px',
                      padding: '16px', 
                      margin: '6px 0', 
                      background: '#f8fafc',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <span style={{ fontSize: '14px', color: '#555', fontWeight: 600 }}>배정 타석</span>
                    <strong style={{ fontSize: '32px', color: '#000', fontWeight: 900 }}>
                      {assignedBayNo}번 타석
                    </strong>
                    <span style={{ fontSize: '13px', color: '#059669', fontWeight: 800, background: '#e6f4ea', padding: '2px 8px', borderRadius: '12px', alignSelf: 'center', marginTop: '4px' }}>
                      즉시 입실 (60분 이용)
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #ccc', paddingBottom: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#555' }}>이용회원:</span>
                    <strong style={{ fontSize: '15px' }}>{memberName || '회원'} 님 {memberNo ? `(${memberNo})` : ''}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #ccc', paddingBottom: '8px' }}>
                    <span style={{ color: '#555' }}>배정일시:</span>
                    <strong>{receiptDate}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #ccc', paddingBottom: '8px' }}>
                    <span style={{ color: '#555' }}>차감 이용권:</span>
                    <strong>{productName}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px' }}>
                    <span style={{ color: '#555' }}>처리결과:</span>
                    <strong style={{ color: '#10b981', fontWeight: 800 }}>이용권 1회 차감 완료 (자동승인)</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'center', borderTop: '2px solid #000', paddingTop: '14px', marginTop: '14px', fontSize: '12px', color: '#444' }}>
                  <p>배정된 타석의 시간이 종료되면 자동으로 정지됩니다.</p>
                  <p style={{ marginTop: '4px', fontWeight: 700 }}>이용해 주셔서 대단히 감사합니다.</p>
                </div>
              </>
            )}

            {/* 게이트 출입용 실시간 가상 바코드 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', borderTop: '1px dashed #000', paddingTop: '14px', marginTop: '14px' }}>
              <span style={{ fontSize: '10px', color: '#666', letterSpacing: '1px', fontWeight: 700 }}>GATE ENTRY BARCODE</span>
              <svg style={{ width: '220px', height: '50px' }}>
                <rect x="0" y="0" width="8" height="50" fill="#000" />
                <rect x="12" y="0" width="3" height="50" fill="#000" />
                <rect x="20" y="0" width="6" height="50" fill="#000" />
                <rect x="30" y="0" width="10" height="50" fill="#000" />
                <rect x="45" y="0" width="3" height="50" fill="#000" />
                <rect x="52" y="0" width="8" height="50" fill="#000" />
                <rect x="64" y="0" width="5" height="50" fill="#000" />
                <rect x="74" y="0" width="12" height="50" fill="#000" />
                <rect x="90" y="0" width="3" height="50" fill="#000" />
                <rect x="98" y="0" width="8" height="50" fill="#000" />
                <rect x="110" y="0" width="6" height="50" fill="#000" />
                <rect x="122" y="0" width="10" height="50" fill="#000" />
                <rect x="136" y="0" width="5" height="50" fill="#000" />
                <rect x="146" y="0" width="8" height="50" fill="#000" />
                <rect x="158" y="0" width="3" height="50" fill="#000" />
                <rect x="166" y="0" width="6" height="50" fill="#000" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '3px' }}>
                *{appNo}*
              </span>
              <p style={{ fontSize: '9px', color: '#888', textAlign: 'center', marginTop: '2px', lineHeight: '1.4' }}>
                게이트 센서 스캐너에 본 바코드를<br />가볍게 스캔 터치해 주세요.
              </p>
            </div>
          </div>

          <button 
            onClick={() => onPaymentSuccess({ apprNo: appNo, tradeDate: receiptDate, amount })}
            style={{
              width: '100%',
              height: '60px',
              borderRadius: '16px',
              background: '#34c759',
              border: 'none',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(52, 199, 89, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Sparkles size={22} />
            이용 완료 (메인으로)
          </button>
        </div>
      )}

      {/* 회전 로딩용 CSS 인젝트 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
