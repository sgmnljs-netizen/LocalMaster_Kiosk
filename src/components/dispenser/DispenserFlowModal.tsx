import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Loader2,
  Ticket,
  UserCheck,
  X,
} from 'lucide-react';
import {
  api,
  type DispenserEligibleItem,
  type DispenserPassSummary,
  type Member,
  type Product,
} from '../../services/api';
import type { CardApprovalResult } from '../../services/van/van_types';
import { MemberAuth } from '../MemberAuth';
import { PaymentTerminal } from '../PaymentTerminal';
import { DispenserDailyFaceCaptureModal } from './DispenserDailyFaceCaptureModal';
import { DispenserCompleteModal, type DispenserReceiptContext } from './DispenserCompleteModal';
import {
  buildDispenserPaymentDetails,
  filterDailyDispenserProducts,
  resolveDailyBasketCount,
  resolveDailyProductPrice,
} from './dispenserFlowUtils';

export interface DispenserFlowModalProps {
  faceTerminalEnabled: boolean;
  storeOpenTime?: string | null;
  storeCloseTime?: string | null;
  isStore24h?: boolean;
  onExecuteAutoReversal: (
    cardApproval: CardApprovalResult | undefined,
    amount: number,
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  onClose: () => void;
}

type FlowStage =
  | 'CHOICE'
  | 'MEMBER_AUTH'
  | 'ASSET_SELECT'
  | 'DAILY_PRODUCT_SELECT'
  | 'DAILY_FACE_CAPTURE'
  | 'DAILY_PAYMENT'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'ERROR';

export const DispenserFlowModal: React.FC<DispenserFlowModalProps> = ({
  faceTerminalEnabled,
  storeOpenTime,
  storeCloseTime,
  isStore24h,
  onExecuteAutoReversal,
  onClose,
}) => {
  const [stage, setStage] = useState<FlowStage>('CHOICE');
  const [authMember, setAuthMember] = useState<Member | null>(null);
  const [eligibleItems, setEligibleItems] = useState<DispenserEligibleItem[]>([]);
  const [dailyProducts, setDailyProducts] = useState<Product[]>([]);
  const [selectedDailyProduct, setSelectedDailyProduct] = useState<Product | null>(null);
  const [capturedFaceB64, setCapturedFaceB64] = useState<string>('');
  const [completedPass, setCompletedPass] = useState<DispenserPassSummary | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<DispenserReceiptContext | null>(null);
  const [isReusedPass, setIsReusedPass] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loadingText, setLoadingText] = useState<string>('처리 중입니다...');

  const preloadDailyPromiseRef = useRef<Promise<Product[]> | null>(null);
  const preloadedDailyProductsRef = useRef<Product[] | null>(null);
  const mountedRef = useRef<boolean>(true);
  const issuingItemRef = useRef<boolean>(false);
  const dailyPaymentSubmittingRef = useRef<boolean>(false);

  const clearDailyBiometricState = useCallback(() => {
    setCapturedFaceB64('');
    setSelectedDailyProduct(null);
  }, []);

  const resetToChoice = useCallback(() => {
    clearDailyBiometricState();
    setAuthMember(null);
    setEligibleItems([]);
    setErrorMessage('');
    setStage('CHOICE');
  }, [clearDailyBiometricState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchFilteredDailyProducts = useCallback(async (): Promise<Product[]> => {
    const allProducts = await api.getProducts();
    return filterDailyDispenserProducts(allProducts);
  }, []);

  // 2분할 모달이 열리자마자 일일권 상품 목록 백그라운드 프리로드 -> [일일권 구매] 클릭 시 0ms 즉시 표시
  useEffect(() => {
    let active = true;
    const req = fetchFilteredDailyProducts()
      .then((list) => {
        if (active) {
          preloadedDailyProductsRef.current = list;
        }
        return list;
      })
      .catch(() => {
        preloadDailyPromiseRef.current = null;
        return [] as Product[];
      });
    preloadDailyPromiseRef.current = req;
    return () => {
      active = false;
    };
  }, [fetchFilteredDailyProducts]);

  const loadDailyProducts = useCallback(async () => {
    clearDailyBiometricState();
    const cached = preloadedDailyProductsRef.current;
    if (cached && cached.length > 0) {
      setDailyProducts(cached);
      setStage('DAILY_PRODUCT_SELECT');
      return;
    }

    setLoadingText('일일권 상품을 불러오는 중입니다...');
    setStage('PROCESSING');
    try {
      const inflight = preloadDailyPromiseRef.current;
      let filtered = inflight ? await inflight : await fetchFilteredDailyProducts();
      if (filtered.length === 0 && inflight) {
        filtered = await fetchFilteredDailyProducts();
      }
      if (!mountedRef.current) return;
      if (filtered.length === 0) {
        void api.writeKioskLog('DISPENSER_DAILY_LOAD_EMPTY', '일일권 상품 목록 0건 (등록된 일일권 없음)');
        setErrorMessage('현재 키오스크에 등록된 일일권 상품이 없습니다. 카운터에 문의해 주세요.');
        setStage('ERROR');
        return;
      }
      preloadedDailyProductsRef.current = filtered;
      setDailyProducts(filtered);
      setStage('DAILY_PRODUCT_SELECT');
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : '일일권 상품 목록을 불러오지 못했습니다.';
      void api.writeKioskLog('DISPENSER_DAILY_LOAD_FAIL', `일일권 상품 목록 조회 실패: ${msg}`);
      setErrorMessage(msg);
      setStage('ERROR');
    }
  }, [clearDailyBiometricState, fetchFilteredDailyProducts]);

  const issueForItem = useCallback(async (memberNo: string, itemId?: number) => {
    if (issuingItemRef.current) return;
    issuingItemRef.current = true;
    setLoadingText('1·2층 볼 배급기 입실 배정을 진행하고 있습니다...');
    setStage('PROCESSING');
    try {
      const res = await api.issueDispenserPass(memberNo, itemId);
      if (!mountedRef.current) return;
      if (res.pass) {
        setCompletedPass(res.pass);
        setCompletedReceipt(null);
        setIsReusedPass(Boolean(res.reused));
        setStage('COMPLETE');
      } else {
        void api.writeKioskLog('DISPENSER_ISSUE_EMPTY', `배급권 응답 데이터 누락 (item_id=${itemId ?? '-'})`, memberNo);
        setErrorMessage('배급권 응답 데이터가 비어 있습니다. 카운터에 문의해 주세요.');
        setStage('ERROR');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : '볼 배급권 발급에 실패했습니다.';
      void api.writeKioskLog('DISPENSER_ISSUE_FAIL', `회원권 입실 배정 실패 (item_id=${itemId ?? '-'}): ${msg}`, memberNo);
      setErrorMessage(msg);
      setStage('ERROR');
    } finally {
      issuingItemRef.current = false;
    }
  }, []);

  const handleMemberAuthSuccess = useCallback(
    async (member: Member) => {
      if (issuingItemRef.current) return;
      setAuthMember(member);
      setLoadingText('보유 중인 골프 이용권을 확인하고 있습니다...');
      setStage('PROCESSING');
      try {
        const res = await api.getDispenserEligibleItems(member.member_no);
        if (!mountedRef.current) return;
        if (res.items.length === 0) {
          void api.writeKioskLog('DISPENSER_NO_ELIGIBLE_ITEM', '1·2층 볼 배급 적격 이용권 없음', member.member_no);
          setErrorMessage(
            '1·2층 볼 배급에 사용할 수 있는 유효한 골프 이용권이 없습니다.\n(기간 만료·휴회·잔여 소진 또는 3층 전용권은 이용 불가)'
          );
          setStage('ERROR');
          return;
        }
        if (res.items.length === 1) {
          await issueForItem(member.member_no, res.items[0].item_id);
          return;
        }
        setEligibleItems(res.items);
        setStage('ASSET_SELECT');
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : '이용권 조회 중 오류가 발생했습니다.';
        void api.writeKioskLog('DISPENSER_ELIGIBLE_FAIL', `적격 이용권 조회 실패: ${msg}`, member.member_no);
        setErrorMessage(msg);
        setStage('ERROR');
      }
    },
    [issueForItem]
  );

  const handleDailyPaymentSuccess = useCallback(
    async (payResult?: {
      apprNo: string;
      tradeDate: string;
      amount: number;
      installmentMonths?: number;
      cardApproval?: CardApprovalResult;
    }) => {
      if (dailyPaymentSubmittingRef.current) return;
      if (!selectedDailyProduct || !capturedFaceB64) {
        setErrorMessage('일일권 정보 또는 안면 촬영 데이터가 유실되었습니다.');
        setStage('ERROR');
        return;
      }
      dailyPaymentSubmittingRef.current = true;
      const productSnapshot = selectedDailyProduct;
      const faceSnapshot = capturedFaceB64;
      const price = resolveDailyProductPrice(productSnapshot);
      const actualPaid = payResult?.amount ?? price;

      setLoadingText('결제 확인 및 1·2층 볼 배급기 임시 안면 등록 중입니다...');
      setStage('PROCESSING');

      try {
        const paymentDetails = buildDispenserPaymentDetails(payResult);
        const res = await api.purchaseDailyDispenserPass({
          prodCd: productSnapshot.prod_cd,
          faceImageBase64: faceSnapshot,
          payMethod: 'CARD',
          paidAmount: actualPaid,
          paymentDetails,
        });
        if (res.pass) {
          if (!mountedRef.current) return;
          // 결제 및 임시 안면 전송 완료 즉시 브라우저 메모리의 생체 이미지 버퍼 파기
          setCapturedFaceB64('');
          setCompletedPass(res.pass);
          setCompletedReceipt({
            saleId: res.sale_id,
            productName: productSnapshot.prod_nm,
            amount: actualPaid,
            vatYn: productSnapshot.vat_yn,
            apprNo:
              payResult?.apprNo ||
              payResult?.cardApproval?.auth_code ||
              payResult?.cardApproval?.apprNo ||
              '',
            tradeDate: payResult?.tradeDate || '',
            cardIssuer: payResult?.cardApproval?.issuer_name || '신용카드',
            cardNoMasked: payResult?.cardApproval?.card_no_masked || '',
            installmentMonths:
              payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
            terminalId: payResult?.cardApproval?.terminal_id || '',
          });
          setIsReusedPass(false);
          setStage('COMPLETE');
          return;
        }
        throw new Error(res.message || '일일권 배급권 생성 응답이 올바르지 않습니다.');
      } catch (err) {
        const baseErr =
          err instanceof Error ? err.message : '일일권 배급권 등록 중 오류가 발생했습니다.';
        const apprCode =
          payResult?.apprNo ||
          payResult?.cardApproval?.auth_code ||
          payResult?.cardApproval?.apprNo ||
          '-';
        void api.writeKioskLog(
          'DISPENSER_DAILY_PURCHASE_FAIL',
          `일일권 등록/안면전송 실패 (prod=${productSnapshot.prod_cd}, amt=${actualPaid}, appr=${apprCode}): ${baseErr}`,
          'DAILY_GUEST'
        );
        let reversalSuffix = '';
        if (payResult?.cardApproval) {
          // Why: 모달 언마운트 여부와 무관하게 카드 승인 자동 망취소는 끝까지 완료하여 미매칭 결제를 원천 차단한다.
          const rev = await onExecuteAutoReversal(
            payResult.cardApproval,
            actualPaid,
            baseErr
          );
          void api.writeKioskLog(
            rev.success ? 'DISPENSER_AUTO_REVERSAL_OK' : 'DISPENSER_AUTO_REVERSAL_FAIL',
            `자동 망취소 ${rev.success ? '성공' : '실패'} (appr=${apprCode}, amt=${actualPaid}): ${rev.message} | 원인=${baseErr}`,
            'DAILY_GUEST'
          );
          reversalSuffix = `\n\n[자동 결제 취소] ${rev.message}`;
        }
        if (!mountedRef.current) return;
        setCapturedFaceB64('');
        setErrorMessage(`${baseErr}${reversalSuffix}`);
        setStage('ERROR');
      } finally {
        dailyPaymentSubmittingRef.current = false;
      }
    },
    [capturedFaceB64, onExecuteAutoReversal, selectedDailyProduct]
  );

  const handleDailyFaceCaptured = useCallback((b64: string) => {
    setCapturedFaceB64(b64);
    setStage('DAILY_PAYMENT');
  }, []);

  const handleDailyFaceCancel = useCallback(() => {
    setCapturedFaceB64('');
    setStage('DAILY_PRODUCT_SELECT');
  }, []);

  // ESC key support in dev/kiosk admin debug
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage === 'CHOICE') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, stage]);

  if (stage === 'MEMBER_AUTH') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.38)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          boxSizing: 'border-box',
        }}
      >
        <MemberAuth
          initialAuthMode={faceTerminalEnabled ? 'FACE' : 'PHONE_KEYPAD'}
          faceTerminalEnabled={faceTerminalEnabled}
          storeOpenTime={storeOpenTime}
          storeCloseTime={storeCloseTime}
          isStore24h={isStore24h}
          onAuthSuccess={(m) => {
            void handleMemberAuthSuccess(m);
          }}
          onCancel={() => setStage('CHOICE')}
        />
      </div>
    );
  }

  if (stage === 'DAILY_FACE_CAPTURE' && selectedDailyProduct) {
    const unitPrice = resolveDailyProductPrice(selectedDailyProduct);
    return (
      <DispenserDailyFaceCaptureModal
        productName={selectedDailyProduct.prod_nm}
        basketCount={resolveDailyBasketCount(selectedDailyProduct)}
        price={unitPrice}
        onCaptured={handleDailyFaceCaptured}
        onCancel={handleDailyFaceCancel}
      />
    );
  }

  if (stage === 'DAILY_PAYMENT' && selectedDailyProduct) {
    const unitPrice = resolveDailyProductPrice(selectedDailyProduct);
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#f8fafc',
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <PaymentTerminal
          productName={selectedDailyProduct.prod_nm}
          productSpecSummary={`1·2층 볼 배급 ${resolveDailyBasketCount(selectedDailyProduct)}회 (당일 유효)`}
          amount={unitPrice}
          productCategory="DAILY"
          storeOpenTime={storeOpenTime}
          storeCloseTime={storeCloseTime}
          isStore24h={isStore24h}
          onPaymentSuccess={(payRes) => {
            void handleDailyPaymentSuccess(payRes);
          }}
          onCancel={() => {
            setCapturedFaceB64('');
            setStage('DAILY_PRODUCT_SELECT');
          }}
        />
      </div>
    );
  }

  if (stage === 'COMPLETE' && completedPass) {
    return (
      <DispenserCompleteModal
        passInfo={completedPass}
        reused={isReusedPass}
        receiptContext={completedReceipt}
        onDone={onClose}
      />
    );
  }

  const headerBadgeText =
    stage === 'CHOICE'
      ? '1·2층 자유타석 입실 배정'
      : stage === 'ASSET_SELECT'
        ? '보유 이용권 선택'
        : stage === 'DAILY_PRODUCT_SELECT'
          ? '비회원 일일권 상품 선택'
          : stage === 'PROCESSING'
            ? '입실 배정 처리 중'
            : '입실 배정 안내';

  const headerTitleText =
    stage === 'CHOICE'
      ? '이용 방식을 선택해 주세요'
      : stage === 'ASSET_SELECT'
        ? `${authMember?.member_name || '회원'}님, 사용하실 이용권을 선택해 주세요`
        : stage === 'DAILY_PRODUCT_SELECT'
          ? '구매하실 일일권을 선택해 주세요'
          : stage === 'PROCESSING'
            ? '잠시만 기다려 주세요'
            : '확인이 필요합니다';

  const headerSubText =
    stage === 'CHOICE'
      ? '회원권 배정 또는 비회원 일일권 구매 후 1·2층 볼 배급기에서 바로 이용합니다.'
      : stage === 'ASSET_SELECT'
        ? '선택하신 이용권으로 오늘 1·2층 볼 배급 권한을 즉시 열어드립니다.'
        : stage === 'DAILY_PRODUCT_SELECT'
          ? '상품 선택 후 1초 임시 안면 촬영과 카드 결제가 순서대로 진행됩니다.'
          : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.44)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 24px 100px 24px',
        boxSizing: 'border-box',
        zIndex: 9000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage === 'CHOICE') {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '960px',
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          backgroundColor: '#ffffff',
          padding: '44px 44px',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          position: 'relative',
          borderRadius: '40px',
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.28)',
          boxSizing: 'border-box',
          animation: 'fadeUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 좌측 상단 뒤로가기 버튼 (하위 단계 진입 시) */}
        {stage !== 'CHOICE' && stage !== 'PROCESSING' && (
          <button
            type="button"
            onClick={resetToChoice}
            aria-label="뒤로"
            style={{
              position: 'absolute',
              top: '28px',
              left: '28px',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#f1f5f9',
              border: '2px solid #cbd5e1',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 10,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ArrowLeft size={28} strokeWidth={2.6} />
          </button>
        )}

        {/* 우측 상단 60px 원형 [×] 닫기 버튼 */}
        {stage !== 'PROCESSING' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              position: 'absolute',
              top: '28px',
              right: '28px',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#f1f5f9',
              border: '2px solid #cbd5e1',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 10,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X size={30} strokeWidth={2.6} />
          </button>
        )}

        {/* 모달 상단 헤더 (GOLFOS 표준 초대형 고대비) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '12px',
            padding: '0 56px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 22px',
              borderRadius: '999px',
              background: stage === 'ERROR' ? '#fee2e2' : '#d1fae5',
              border: stage === 'ERROR' ? '2px solid #ef4444' : '2px solid #10b981',
              color: stage === 'ERROR' ? '#991b1b' : '#065f46',
              fontSize: '20px',
              fontWeight: 900,
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{headerBadgeText}</span>
          </div>
          <h2
            style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#1d1d1f',
              letterSpacing: '-1.1px',
              lineHeight: 1.18,
              margin: 0,
              wordBreak: 'keep-all',
            }}
          >
            {headerTitleText}
          </h2>
          {headerSubText && (
            <p
              style={{
                fontSize: '20px',
                color: '#4b5563',
                fontWeight: 700,
                margin: 0,
                wordBreak: 'keep-all',
                lineHeight: 1.4,
              }}
            >
              {headerSubText}
            </p>
          )}
        </div>

        {/* STAGE 1: 회원 배정 vs 일일권 구매 2분할 선택 (PracticeSelect 표준 3D 택타일 카드) */}
        {stage === 'CHOICE' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' }}>
            {/* 좌측: 기존 회원 입실 배정 */}
            <div
              role="button"
              tabIndex={0}
              className="decision-choice-card decision-card-emerald"
              onClick={() => setStage('MEMBER_AUTH')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setStage('MEMBER_AUTH');
              }}
              style={{
                padding: '34px 28px 28px 28px',
                borderRadius: '32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'center',
                gap: '20px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    padding: '6px 16px',
                    borderRadius: '999px',
                    backgroundColor: '#d1fae5',
                    color: '#065f46',
                    letterSpacing: '-0.2px',
                  }}
                >
                  정기권 · 쿠폰 회원
                </span>
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      background: 'linear-gradient(145deg, #10b981 0%, #059669 100%)',
                      padding: '22px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 10px 24px rgba(5, 150, 105, 0.28)',
                    }}
                  >
                    <UserCheck size={42} strokeWidth={2.4} style={{ color: '#ffffff' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '34px',
                    fontWeight: 900,
                    color: '#1d1d1f',
                    letterSpacing: '-0.9px',
                    lineHeight: 1.2,
                    wordBreak: 'keep-all',
                  }}
                >
                  회원 입실 배정
                </span>
                <span
                  style={{
                    fontSize: '19px',
                    color: '#515154',
                    fontWeight: 700,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line',
                    wordBreak: 'keep-all',
                  }}
                >
                  {'안면인식 또는 휴대폰 번호로 인증 후\n1·2층 볼 배급기 즉시 이용'}
                </span>
              </div>

              <div
                className="decision-tactile-btn decision-btn-emerald"
                style={{ '--decision-sheen-delay': '0s' } as React.CSSProperties}
              >
                <span style={{ position: 'relative', zIndex: 2 }}>회원권으로 배정</span>
                <ArrowRight
                  size={26}
                  strokeWidth={3}
                  className="decision-btn-arrow"
                  aria-hidden="true"
                  style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
                />
              </div>
            </div>

            {/* 우측: 비회원 일일권 구매 */}
            <div
              role="button"
              tabIndex={0}
              className="decision-choice-card decision-card-blue"
              onClick={() => {
                void loadDailyProducts();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  void loadDailyProducts();
                }
              }}
              style={{
                padding: '34px 28px 28px 28px',
                borderRadius: '32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'center',
                gap: '20px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    padding: '6px 16px',
                    borderRadius: '999px',
                    backgroundColor: '#dbeafe',
                    color: '#0058b9',
                    letterSpacing: '-0.2px',
                  }}
                >
                  비회원 · 당일 방문
                </span>
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '50%',
                    background: 'rgba(0, 113, 227, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      background: 'linear-gradient(145deg, #1a8cff 0%, #0071e3 100%)',
                      padding: '22px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 10px 24px rgba(0, 113, 227, 0.28)',
                    }}
                  >
                    <CreditCard size={42} strokeWidth={2.4} style={{ color: '#ffffff' }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '34px',
                    fontWeight: 900,
                    color: '#1d1d1f',
                    letterSpacing: '-0.9px',
                    lineHeight: 1.2,
                    wordBreak: 'keep-all',
                  }}
                >
                  일일권 구매
                </span>
                <span
                  style={{
                    fontSize: '19px',
                    color: '#515154',
                    fontWeight: 700,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-line',
                    wordBreak: 'keep-all',
                  }}
                >
                  {'1초 임시 안면 촬영 후 카드 결제하면\n1·2층 볼 배급기 바로 이용'}
                </span>
              </div>

              <div
                className="decision-tactile-btn decision-btn-blue"
                style={{ '--decision-sheen-delay': '0.9s' } as React.CSSProperties}
              >
                <span style={{ position: 'relative', zIndex: 2 }}>일일권 구매하기</span>
                <ArrowRight
                  size={26}
                  strokeWidth={3}
                  className="decision-btn-arrow"
                  aria-hidden="true"
                  style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STAGE 2: 보유 회원권 복수 선택 */}
        {stage === 'ASSET_SELECT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {eligibleItems.map((item) => (
              <button
                key={item.item_id}
                type="button"
                onClick={() => {
                  if (authMember) {
                    void issueForItem(authMember.member_no, item.item_id);
                  }
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '20px',
                  borderRadius: '26px',
                  border: '2px solid #cbd5e1',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  padding: '24px 28px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '18px',
                      background: '#ecfdf5',
                      border: '1.5px solid #a7f3d0',
                      color: '#047857',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Ticket size={30} strokeWidth={2.4} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '26px',
                        fontWeight: 900,
                        color: '#0f172a',
                        letterSpacing: '-0.6px',
                        lineHeight: 1.2,
                      }}
                    >
                      {item.prod_nm}
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#475569',
                      }}
                    >
                      {item.pass_type === 'COUNT'
                        ? `잔여 ${item.rem_count}회`
                        : item.end_dt
                          ? `만료일 ${item.end_dt}`
                          : '기간 정기권'}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    borderRadius: '16px',
                    background: 'linear-gradient(145deg, #10b981 0%, #059669 100%)',
                    padding: '14px 22px',
                    fontSize: '19px',
                    fontWeight: 900,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {item.computed_quota === null
                    ? '오늘 무제한'
                    : `오늘 최대 ${item.computed_quota}회`}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* STAGE 3: 일일권 상품 선택 */}
        {stage === 'DAILY_PRODUCT_SELECT' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {dailyProducts.map((prod) => {
              const price =
                prod.sale_price && prod.sale_price > 0 ? prod.sale_price : prod.standard_price;
              const baskets = Math.max(1, Number(prod.total_count || 1));
              return (
                <button
                  key={prod.prod_cd}
                  type="button"
                  onClick={() => {
                    setCapturedFaceB64('');
                    setSelectedDailyProduct(prod);
                    setStage('DAILY_FACE_CAPTURE');
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '20px',
                    borderRadius: '28px',
                    border: '2px solid #bae6fd',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
                    padding: '28px 28px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: '0 10px 24px rgba(2, 132, 199, 0.08)',
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        borderRadius: '999px',
                        background: '#dbeafe',
                        padding: '6px 14px',
                        fontSize: '15px',
                        fontWeight: 900,
                        color: '#0369a1',
                      }}
                    >
                      볼 {baskets}회 배급 · 당일 유효
                    </span>
                    <div
                      style={{
                        marginTop: '12px',
                        fontSize: '26px',
                        fontWeight: 900,
                        color: '#0f172a',
                        letterSpacing: '-0.6px',
                        lineHeight: 1.25,
                        wordBreak: 'keep-all',
                      }}
                    >
                      {prod.prod_nm}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '14px',
                      borderTop: '1px solid #e0f2fe',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '32px',
                        fontWeight: 950,
                        color: '#0071e3',
                        letterSpacing: '-0.8px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {price.toLocaleString()}원
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '14px',
                        background: '#0071e3',
                        color: '#ffffff',
                        padding: '10px 18px',
                        fontSize: '17px',
                        fontWeight: 900,
                      }}
                    >
                      선택 <ArrowRight size={18} strokeWidth={3} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* STAGE 4: 처리 중 로딩 */}
        {stage === 'PROCESSING' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '54px 20px',
              textAlign: 'center',
              gap: '22px',
            }}
          >
            <Loader2
              size={64}
              strokeWidth={2.5}
              style={{ color: '#059669', animation: 'spin 1s linear infinite' }}
            />
            <p
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color: '#1e293b',
                margin: 0,
                letterSpacing: '-0.5px',
              }}
            >
              {loadingText}
            </p>
          </div>
        )}

        {/* STAGE 5: 오류 안내 */}
        {stage === 'ERROR' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '20px 12px 8px 12px',
              textAlign: 'center',
              gap: '24px',
            }}
          >
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle size={46} strokeWidth={2.4} />
            </div>
            <p
              style={{
                margin: 0,
                whiteSpace: 'pre-line',
                fontSize: '22px',
                fontWeight: 800,
                lineHeight: 1.5,
                color: '#1e293b',
                wordBreak: 'keep-all',
              }}
            >
              {errorMessage}
            </p>
            <div style={{ display: 'flex', gap: '16px', width: '100%', maxWidth: '520px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={resetToChoice}
                style={{
                  flex: 1,
                  borderRadius: '20px',
                  border: '2px solid #cbd5e1',
                  background: '#ffffff',
                  padding: '20px 24px',
                  fontSize: '21px',
                  fontWeight: 900,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                다시 선택
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1.3,
                  borderRadius: '20px',
                  border: 'none',
                  background: '#0f172a',
                  padding: '20px 24px',
                  fontSize: '21px',
                  fontWeight: 900,
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                확인 및 처음으로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispenserFlowModal;
