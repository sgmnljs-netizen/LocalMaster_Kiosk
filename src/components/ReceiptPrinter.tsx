import React, { useEffect, useState } from 'react';
import { Printer, CheckCircle, XCircle } from 'lucide-react';

export interface ReceiptData {
  branchNm: string;
  address: string;
  tel: string;
  tradeDate: string;
  apprNo: string;
  prodNm: string;
  partySize: number;
  totalAmount: number;
  resId: string;
}

interface ReceiptPrinterProps {
  receiptData: ReceiptData;
  onClose: () => void;
}

export const ReceiptPrinter: React.FC<ReceiptPrinterProps> = ({ receiptData, onClose }) => {
  const [isPrinting, setIsPrinting] = useState(true);

  useEffect(() => {
    // 3초간 영수증 지지직 인쇄 모션 작동
    const timer = setTimeout(() => {
      setIsPrinting(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const formatAmount = (num: number) => {
    return num.toLocaleString();
  };

  // 과세공급가액 90%, 부가세 10% 연산
  const taxFreeAmount = Math.round(receiptData.totalAmount / 1.1);
  const vatAmount = receiptData.totalAmount - taxFreeAmount;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '1080px', // 키오스크 영역 가로 락킹
        height: '100vh',
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
          background: isPrinting ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `2px solid ${isPrinting ? 'var(--neon-indigo)' : 'var(--neon-green)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: isPrinting ? 'pulse 1.5s infinite' : 'none'
        }}>
          {isPrinting ? (
            <Printer size={38} style={{ color: 'var(--neon-indigo)', animation: 'wiggle 0.5s infinite' }} />
          ) : (
            <CheckCircle size={44} style={{ color: 'var(--neon-green)' }} />
          )}
        </div>
        
        <h3 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>
          {isPrinting ? '지지직... 영수증 인쇄 중...' : '결제 완료 및 영수증 발행 성공!'}
        </h3>
        <p style={{ fontSize: '18px', color: '#c8c8cd', margin: 0 }}>
          {isPrinting ? '영수증이 나올 때까지 잠시만 기다려 주십시오.' : '발행된 영수증을 받아 가시기 바랍니다.'}
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
            대표자: sgmn (에스지엠엔)
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
            <span>9410-****-****-****</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>승인번호:</span>
            <span style={{ fontWeight: 700, color: '#2e7559' }}>{receiptData.apprNo}</span>
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
            <span>과세 공급가액:</span>
            <span>₩{formatAmount(taxFreeAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span>부가가치세 (10%):</span>
            <span>₩{formatAmount(vatAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 900, marginTop: '4px' }}>
            <span>합계 금액:</span>
            <span style={{ color: '#2e7559' }}>₩{formatAmount(receiptData.totalAmount)}</span>
          </div>
        </div>

        {/* 하단 바코드 & QR 시각 렌더러 (입입장용 바코드 셰이프 SVG) */}
        <div style={{ textAlign: 'center', paddingTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#555555' }}>[ 게이트 출입 및 타석 배정용 QR ]</span>
          
          <svg width="220" height="74" viewBox="0 0 220 74" style={{ background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #dcdcd8' }}>
            {/* 모의 1D 바코드 SVG 드로잉 */}
            <g fill="#111111">
              <rect x="15" y="5" width="4" height="46" />
              <rect x="23" y="5" width="2" height="46" />
              <rect x="27" y="5" width="6" height="46" />
              <rect x="37" y="5" width="2" height="46" />
              <rect x="43" y="5" width="8" height="46" />
              <rect x="55" y="5" width="4" height="46" />
              <rect x="63" y="5" width="2" height="46" />
              <rect x="69" y="5" width="6" height="46" />
              <rect x="79" y="5" width="4" height="46" />
              <rect x="87" y="5" width="8" height="46" />
              <rect x="99" y="5" width="2" height="46" />
              <rect x="105" y="5" width="6" height="46" />
              <rect x="115" y="5" width="4" height="46" />
              <rect x="123" y="5" width="2" height="46" />
              <rect x="129" y="5" width="8" height="46" />
              <rect x="141" y="5" width="4" height="46" />
              <rect x="149" y="5" width="6" height="46" />
              <rect x="159" y="5" width="2" height="46" />
              <rect x="165" y="5" width="8" height="46" />
              <rect x="177" y="5" width="4" height="46" />
              <rect x="185" y="5" width="6" height="46" />
              <rect x="195" y="5" width="2" height="46" />
              <rect x="201" y="5" width="4" height="46" />
            </g>
            <text x="110" y="65" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#111111">
              {receiptData.resId.slice(0, 16)}
            </text>
          </svg>

          <span style={{ fontSize: '11px', color: '#777777', marginTop: '4px' }}>
            * 타석 입장 및 파3 코스 입장 시 바코드를 스캔해 주십시오.
          </span>
        </div>

        {/* 하단 톱니 절취선 데코레이션 */}
        <div className="zigzag-bottom" />
      </div>

      {/* 완료 확인 버튼 (인쇄 완료 후에만 터치 가능하도록 노출) */}
      {!isPrinting && (
        <button
          onClick={onClose}
          className="kiosk-btn kiosk-btn-success"
          style={{
            marginTop: '32px',
            height: '76px',
            fontSize: '24px',
            fontWeight: 900,
            padding: '0 64px',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
            cursor: 'pointer',
            zIndex: 3,
            animation: 'slideUp 0.3s ease-in-out'
          }}
        >
          확인 (처음으로)
        </button>
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
