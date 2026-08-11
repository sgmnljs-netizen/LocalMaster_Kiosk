import React, { useEffect, useState } from 'react';
import { CheckCircle2, Printer, ArrowRight, CreditCard, Calendar, User, ShoppingBag, ShieldCheck } from 'lucide-react';
import { TimeMaster } from '../utils/timeMaster';

export interface CompletedPurchaseInfo {
  memberName: string;
  memberHp?: string;
  productName: string;
  amount: number;
  apprNo: string;
  tradeDate: string;
  startDate?: string;
  endDate?: string;
  purchaseType?: 'MEMBERSHIP' | 'LOCKER' | 'PRODUCT';
}

interface PurchaseCompleteModalProps {
  purchaseInfo: CompletedPurchaseInfo;
  lang?: 'KO' | 'EN';
  onClose: () => void;
}

export const PurchaseCompleteModal: React.FC<PurchaseCompleteModalProps> = ({
  purchaseInfo,
  lang = 'KO',
  onClose
}) => {
  const [countdown, setCountdown] = useState(10);
  const [isPrinting, setIsPrinting] = useState(true);

  useEffect(() => {
    // 영수증 인쇄 3초 애니메이션
    const printTimer = setTimeout(() => {
      setIsPrinting(false);
    }, 3000);

    // 10초 카운트다운 타이머
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

    return () => {
      clearTimeout(printTimer);
      clearInterval(timer);
    };
  }, [onClose]);

  // 오늘 날짜 및 30일/90일 유효기간 자동 계산 (TimeMaster SSOT 적용)
  const ONE_DAY_MS = 86400000;
  const todayStr = TimeMaster.getKstYmd(new Date());
  const defaultEndDateStr = TimeMaster.getKstYmd(new Date(Date.now() + 30 * ONE_DAY_MS));
  const startDate = purchaseInfo.startDate || todayStr;
  const endDate = purchaseInfo.endDate || defaultEndDateStr;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '24px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: '#ffffff',
          borderRadius: '32px',
          border: '1px solid #e5e5ea',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2)',
          padding: '40px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: '#1d1d1f',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* 상단 체크 및 프린팅 성공 아이콘 */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(52, 199, 89, 0.12)',
              border: '2px solid rgba(52, 199, 89, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(52, 199, 89, 0.25)'
            }}
          >
            <CheckCircle2 size={48} style={{ color: '#34c759', strokeWidth: 2.5 }} />
          </div>
        </div>

        {/* 타이틀 헤더 */}
        <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', marginBottom: '8px', letterSpacing: '-1px' }}>
          {lang === 'KO' ? '결제 및 등록이 완료되었습니다!' : 'Payment & Purchase Completed!'}
        </h2>

        {/* 영수증 인출 상태 안내 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: isPrinting ? '#eff6ff' : '#f0fdf4',
            border: `1px solid ${isPrinting ? '#bfdbfe' : '#bbf7d0'}`,
            padding: '10px 20px',
            borderRadius: '20px',
            color: isPrinting ? '#1d4ed8' : '#15803d',
            fontSize: '15px',
            fontWeight: 700,
            marginBottom: '28px'
          }}
        >
          <Printer size={20} className={isPrinting ? 'animate-bounce' : ''} />
          <span>
            {isPrinting
              ? (lang === 'KO' ? '영수증이 인출기에서 인쇄 중입니다...' : 'Printing receipt...')
              : (lang === 'KO' ? '영수증 출력이 완료되었습니다. 영수증을 챙겨주세요!' : 'Receipt printed successfully!')}
          </span>
        </div>

        {/* 구매 및 결제 세부 명세 카드 */}
        <div
          style={{
            width: '100%',
            background: '#f8fafc',
            borderRadius: '24px',
            border: '1px solid #e2e8f0',
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '32px',
            textAlign: 'left'
          }}
        >
          {/* 구매 상품 헤더 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e2e8f0',
              paddingBottom: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={20} style={{ color: '#047857' }} />
              <span style={{ fontSize: '16px', color: '#64748b', fontWeight: 600 }}>구매 상품</span>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
              {purchaseInfo.productName}
            </span>
          </div>

          {/* 구매 상세 항목 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                <User size={16} />
                <span>구매 회원</span>
              </div>
              <span style={{ fontWeight: 800, color: '#1e293b' }}>
                {purchaseInfo.memberName} 님 {purchaseInfo.memberHp ? `(${purchaseInfo.memberHp})` : ''}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                <Calendar size={16} />
                <span>유효 기간</span>
              </div>
              <span style={{ fontWeight: 800, color: '#047857' }}>
                {startDate} ~ {endDate}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                <CreditCard size={16} />
                <span>결제 수단 / 승인번호</span>
              </div>
              <span style={{ fontWeight: 700, color: '#334155' }}>
                신용카드 IC ({purchaseInfo.apprNo})
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>결제 일시</span>
              <span style={{ fontWeight: 600, color: '#64748b', fontSize: '14px' }}>
                {purchaseInfo.tradeDate}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px dashed #cbd5e1',
                paddingTop: '12px',
                marginTop: '4px'
              }}
            >
              <span style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>총 결제 금액</span>
              <span style={{ fontSize: '26px', fontWeight: 950, color: '#047857' }}>
                {purchaseInfo.amount.toLocaleString()} <span style={{ fontSize: '18px', fontWeight: 800 }}>원</span>
              </span>
            </div>
          </div>
        </div>

        {/* 확인 및 복귀 버튼 */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: '64px',
            borderRadius: '999px',
            background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
            color: '#ffffff',
            border: 'none',
            fontSize: '20px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 10px 25px rgba(5, 150, 105, 0.35)',
            transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span>{lang === 'KO' ? `확인 및 메인으로 이동 (${countdown}s)` : `Confirm & Go Home (${countdown}s)`}</span>
          <ArrowRight size={22} style={{ color: '#ffffff' }} />
        </button>
      </div>
    </div>
  );
};
