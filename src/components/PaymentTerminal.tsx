import React, { useEffect, useState } from 'react';
import { CreditCard, Printer, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../services/api';

const STORE_CODE = 'H01-SE-001';

interface PaymentTerminalProps {
  productName: string;
  amount: number;
  assignedBayNo?: number | null;
  assignedLockerNo?: number | null;
  resId?: string | null;
  onPaymentSuccess: () => void;
  onCancel: () => void;
}

export const PaymentTerminal: React.FC<PaymentTerminalProps> = ({
  productName,
  amount,
  assignedBayNo,
  assignedLockerNo,
  resId,
  onPaymentSuccess,
  onCancel
}) => {
  const [payStep, setPayStep] = useState<'INSERT_CARD' | 'PROCESSING' | 'PRINT_RECEIPT'>('INSERT_CARD');
  const [appNo, setAppNo] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 임의의 카드 삽입/감지 시뮬레이션
  const triggerSimulation = async () => {
    setPayStep('PROCESSING');
    setErrorMsg('');
    
    // 승인번호 및 영수증 날짜 선제 생성
    setAppNo(Math.floor(10000000 + Math.random() * 90000000).toString());
    const now = new Date();
    setReceiptDate(
      `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    );

    try {
      // 2-Phase Commit: 백엔드 결제 완료 웹훅 API 호출
      if (resId) {
        const res = await api.processPaymentWebhook(resId, amount);
        if (!res.success) {
          throw new Error(res.message);
        }
      } else {
        // Fallback: 엣지/가상 모드일 때 가상 딜레이
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      setPayStep('PRINT_RECEIPT');
    } catch (err: any) {
      setPayStep('INSERT_CARD');
      setErrorMsg(err.message || '결제 처리 중 서버 승인 오류가 발생했습니다.');
    }
  };

  // 2. 카드 자동 투입 시뮬레이터 (사용자 대기용)
  useEffect(() => {
    const timer = setTimeout(triggerSimulation, 4500); // 4.5초 뒤 알아서 시뮬레이션 작동
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className="glass-panel" 
      style={{
        width: '800px',
        margin: '30px auto',
        padding: '50px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '40px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 1단계: 카드 삽입 대기 */}
      {payStep === 'INSERT_CARD' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', width: '100%' }}>
          {errorMsg && (
            <div 
              className="neon-border-red"
              style={{ 
                background: 'rgba(239, 68, 68, 0.08)', 
                padding: '16px', 
                borderRadius: '12px', 
                textAlign: 'center',
                color: '#fca5a5',
                fontSize: '18px',
                fontWeight: 700,
                width: '480px'
              }}
            >
              {errorMsg}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#fff', marginBottom: '10px' }}>신용카드 결제 진행</h2>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>IC 카드를 아래의 단말기 투입구에 깊숙이 꽂아 주세요.</p>
          </div>

          {/* 결제 요약 금액 명세서 */}
          <div className="glass-panel" style={{ width: '480px', padding: '24px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>구매 상품</span>
              <strong style={{ color: '#fff' }}>{productName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', borderTop: '1px solid var(--bg-tertiary)', paddingTop: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>결제 금액</span>
              <strong style={{ color: 'var(--neon-green)', fontSize: '26px' }}>{amount.toLocaleString()} 원</strong>
            </div>
          </div>

          {/* 단말기 투입구 모사 애니메이션 */}
          <div className="card-terminal-wrap" style={{ width: '480px', gap: '20px' }}>
            {/* 단말기 투입구 */}
            <div style={{ width: '220px', height: '20px', background: '#000', borderRadius: '4px', border: '1px solid var(--glass-border)', boxShadow: '0 0 10px rgba(0,0,0,1)' }} />
            
            {/* 카드 투입 모션 */}
            <div className="animate-card-slide" style={{ position: 'relative' }}>
              <div 
                style={{
                  width: '140px',
                  height: '220px',
                  borderRadius: '12px',
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

            <span className="animate-blink" style={{ fontSize: '16px', color: 'var(--neon-indigo)', fontWeight: 700, marginTop: '10px' }}>
              카드 자동 삽입을 대기하고 있습니다...
            </span>
          </div>

          <div style={{ display: 'flex', gap: '20px', width: '480px' }}>
            <button className="kiosk-btn" style={{ flex: 1, height: '60px' }} onClick={onCancel}>결제 취소</button>
            <button className="kiosk-btn kiosk-btn-primary" style={{ flex: 1, height: '60px' }} onClick={triggerSimulation}>즉시 결제 테스트</button>
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
              border: '6px solid var(--bg-tertiary)',
              borderTopColor: 'var(--neon-indigo)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>신용카드 결제 승인 중</h2>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
              금융사 네트워크 승인을 요청하고 있습니다. 카드를 빼지 마세요.
            </p>
          </div>
        </div>
      )}

      {/* 3단계: 영수증 출력 완료 */}
      {payStep === 'PRINT_RECEIPT' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', width: '100%' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div 
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid var(--neon-green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--neon-green)'
              }}
            >
              <Printer size={32} />
            </div>
            <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#fff' }}>결제 완료 & 영수증 발행</h2>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
              아래 출구에서 영수증을 반드시 챙겨서 이용해 주시기 바랍니다.
            </p>
          </div>

          {/* 지지직 인쇄되는 영수증 종이 */}
          <div className="receipt-paper">
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '14px', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px' }}>⛳ 무인 골프 스튜디오</h3>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>프리미엄 골프 아카데미 무인점</p>
              <p style={{ fontSize: '12px', color: '#555' }}>지점코드: {STORE_CODE}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>단말기번호:</span>
                <strong>{api.getTerminalId()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>거래일시:</span>
                <strong>{receiptDate}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>구매상품:</span>
                <strong>{productName}</strong>
              </div>
              
              {assignedBayNo !== undefined && assignedBayNo !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #000', padding: '6px', margin: '6px 0', background: '#f8fafc' }}>
                  <span>배정 타석:</span>
                  <strong style={{ fontSize: '16px' }}>{assignedBayNo}번 타석 (즉시입실)</strong>
                </div>
              )}

              {assignedLockerNo !== undefined && assignedLockerNo !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #000', padding: '6px', margin: '6px 0', background: '#f8fafc' }}>
                  <span>대여 라카:</span>
                  <strong style={{ fontSize: '16px' }}>{assignedLockerNo}번 개인 사물함</strong>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '10px', marginTop: '4px' }}>
                <span>판매금액:</span>
                <span>{(amount - Math.floor(amount * 0.1)).toLocaleString()} 원</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>부 가 세:</span>
                <span>{Math.floor(amount * 0.1).toLocaleString()} 원</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 0' }}>
                <span>합계금액:</span>
                <span>{amount.toLocaleString()} 원</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span>결제수단:</span>
                <span>신용카드 (IC)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>카드번호:</span>
                <span>9410-12**-****-****</span>
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
            className="kiosk-btn kiosk-btn-success" 
            style={{ width: '380px', height: '64px', borderRadius: '12px', fontSize: '20px', fontWeight: 800, display: 'flex', gap: '8px' }}
            onClick={onPaymentSuccess}
          >
            <Sparkles size={20} />
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
