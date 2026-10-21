import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CreditCard, Printer, ShieldAlert, Sparkles, ShieldCheck, RefreshCw, Ticket, CheckCircle2, UserCheck, X, ArrowLeft, Hand } from 'lucide-react';
import { api, STORE_CODE } from '../services/api';
import { useKioskSettings } from '../stores/kioskSettings';
import { useKioskVanPayment } from '../hooks/useKioskVanPayment';
import { kioskVanClient } from '../services/van/van_client';
import type { CardApprovalResult } from '../services/van/van_types';
import { useHardwareScanner } from '../services/hardware/hooks/useHardwareScanner';


import { TimeMaster } from '../utils/timeMaster';

export const MIN_INSTALLMENT_AMOUNT = 50000;
export const INSTALLMENT_MONTH_OPTIONS = [0, 2, 3, 4, 5, 6, 12] as const;

interface PaymentTerminalProps {
  productName: string;
  amount: number;
  discountableAmount?: number;
  productCategory?: string;
  assignedBayNo?: number | null;
  assignedBayNos?: number[];
  assignedLockerNo?: number | string | null;
  resId?: string | null;
  memberName?: string;
  memberNo?: string;
  memberPoint?: number;
  discountRate?: number;
  gradeName?: string;
  vatYn?: string;
  businessUnitType?: string;
  businessMerchantId?: string;
  proId?: string | null;
  onVanBusyChange?: (busy: boolean) => void;
  onRequestMemberAuth?: () => void;
  onPaymentSuccess: (payResult?: { 
    apprNo: string; 
    tradeDate: string; 
    amount: number; 
    usedPoints?: number; 
    discountAmount?: number; 
    couponNo?: string;
    couponDiscount?: number;
    installmentMonths?: number;
    cardApproval?: CardApprovalResult 
  }) => void;
  onCancel: () => void;
}

export const PaymentTerminal: React.FC<PaymentTerminalProps> = ({
  productName,
  amount,
  discountableAmount,
  productCategory,
  assignedBayNo,
  assignedBayNos,
  assignedLockerNo,
  resId,
  memberName,
  memberNo,
  memberPoint = 0,
  discountRate = 0,
  gradeName,
  vatYn = 'Y',
  businessUnitType = 'MAIN',
  businessMerchantId = 'MAIN',
  proId = null,
  onVanBusyChange,
  onRequestMemberAuth,
  onPaymentSuccess,
  onCancel
}) => {
  const { settings } = useKioskSettings();
  const { state: vanState, isProcessing, remainingSeconds, error: vanError, startPayment, cancelPayment } = useKioskVanPayment();

  const [usedPoints, setUsedPoints] = useState<number>(0);
  const [installmentMonths, setInstallmentMonths] = useState<number>(0);
  const [activeTerminalId, setActiveTerminalId] = useState<string>(settings.terminalId || '88010003');
  const [payStep, setPayStep] = useState<'INSERT_CARD' | 'PROCESSING' | 'PRINT_RECEIPT'>('INSERT_CARD');
  const [appNo, setAppNo] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [cardIssuer, setCardIssuer] = useState('');
  const [maskedCard, setMaskedCard] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const isPayRequested = useRef(false);
  const isSilentCancelRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const lastPayResultRef = useRef<any>(null);

  // [BUG-07 FIX] 언마운트 시 서브 가맹점/프로 TID 오버라이드를 메인 매장 기본 설정으로 즉시 원복
  useEffect(() => {
    setActiveTerminalId(settings.terminalId || '88010003');
    return () => {
      let rawProvider = (settings.providerType || 'KCP').toUpperCase();
      if (rawProvider.endsWith('_VAN')) {
        rawProvider = rawProvider.replace('_VAN', '');
      }
      kioskVanClient.setConfig({
        provider: rawProvider as any,
        terminalId: settings.terminalId || '88010003',
        vcatPort: parseInt(settings.vcatPort, 10) || 9099,
      });
    };
  }, [settings.terminalId, settings.vcatPort, settings.providerType]);

  useEffect(() => {
    const busy = vanState === 'WAITING_CARD' || vanState === 'REQUESTING' || payStep === 'PROCESSING';
    onVanBusyChange?.(busy);
    if (!busy) {
      return () => {
        onVanBusyChange?.(false);
      };
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      onVanBusyChange?.(false);
    };
  }, [vanState, payStep, onVanBusyChange]);

  const completePaymentOnce = useCallback((payload: any) => {
    lastPayResultRef.current = payload;
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    onPaymentSuccess(payload);
  }, [onPaymentSuccess]);

  // 🎟️ 쿠폰 관련 상태
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);

  // 등급 할인 및 쿠폰 할인 실시간 산출 (BUG-02: 동반자 그룹배정 시 회원 본인 슬롯 금액 기준 할인)
  const baseForGradeDiscount = discountableAmount !== undefined ? discountableAmount : amount;
  const gradeDiscountAmt = discountRate > 0 ? Math.round(baseForGradeDiscount * (discountRate / 100)) : 0;
  
  const isPercentCoupon = appliedCoupon && (appliedCoupon.benefit_type === 'RATE' || appliedCoupon.coupon_type === 'PERCENT');
  const couponBenefitVal = appliedCoupon ? (appliedCoupon.benefit_val ?? (isPercentCoupon ? appliedCoupon.discount_rate : appliedCoupon.discount_amount) ?? 0) : 0;

  const couponDiscountAmt = appliedCoupon ? (
    isPercentCoupon
      ? Math.min(
          Math.round(amount * (couponBenefitVal / 100)),
          appliedCoupon.max_discount_amt && appliedCoupon.max_discount_amt > 0 ? appliedCoupon.max_discount_amt : 999999999
        )
      : Math.min(couponBenefitVal, amount)
  ) : 0;

  const targetPayAmt = Math.max(0, amount - gradeDiscountAmt - couponDiscountAmt);
  const clampedUsedPoints = Math.min(usedPoints, targetPayAmt);
  const finalCardAmt = Math.max(0, targetPayAmt - clampedUsedPoints);
  const canSelectInstallment = finalCardAmt >= MIN_INSTALLMENT_AMOUNT;
  const effectiveInstallmentMonths = canSelectInstallment ? installmentMonths : 0;

  // [BUG-04 FIX] 쿠폰 적용 등으로 결제 대상 금액(targetPayAmt)이 줄어든 경우 기선택 포인트 및 할부 개월수가 초과/유지되지 않도록 즉시 보정
  useEffect(() => {
    if (usedPoints > targetPayAmt) {
      setUsedPoints(targetPayAmt);
    }
    if (installmentMonths !== 0 && !canSelectInstallment) {
      setInstallmentMonths(0);
    }
  }, [targetPayAmt, usedPoints, installmentMonths, canSelectInstallment]);

  // 🎟️ 쿠폰 검증 핸들러
  const handleVerifyCoupon = async (codeToVerify?: string) => {
    const targetCode = (codeToVerify || couponCode).trim();
    if (!targetCode) {
      setCouponError('쿠폰 번호를 입력해 주세요.');
      return;
    }
    setCouponError('');
    setIsVerifyingCoupon(true);
    try {
      let coupon: any;
      try {
        coupon = await api.verifyCoupon(targetCode);
      } catch (verifyErr: any) {
        // 🎯 일반 쿠폰 조회가 실패한 경우, 시리얼 쿠폰 자동 등록 시도
        if (memberNo) {
          try {
            const serialRes = await api.registerSerialCoupon(targetCode, memberNo);
            if (serialRes.success || serialRes.coupon_no) {
              coupon = serialRes;
            }
          } catch (serialErr: any) {
            throw new Error(serialErr.message || verifyErr.message);
          }
        } else {
          if (!targetCode.startsWith('CPN-')) {
            throw new Error('시리얼 쿠폰은 회원 전용입니다. 회원 로그인 후 이용해 주세요.');
          }
          throw verifyErr;
        }
      }

      if (!coupon) {
        throw new Error('유효하지 않은 쿠폰입니다.');
      }

      if (coupon.min_order_amt && amount < coupon.min_order_amt) {
        throw new Error(`최소 주문 금액(${coupon.min_order_amt.toLocaleString()}원) 이상일 때만 사용 가능합니다.`);
      }
      if (coupon.target_categories && Array.isArray(coupon.target_categories) && coupon.target_categories.length > 0) {
        const isBayAllocation = Boolean(assignedBayNo) || Boolean(assignedBayNos && assignedBayNos.length > 0);
        const normProdCat = String(productCategory || '').toUpperCase();
        const allowedCategories = assignedLockerNo 
          ? ['LOCKER', 'RENTAL', 'ALL'] 
          : (isBayAllocation || normProdCat === 'DAILY' || normProdCat === 'DAY'
              ? ['DAILY', 'BAY', 'PASS', 'ALL'] 
              : (normProdCat === 'PERIOD' || normProdCat === 'MEMBERSHIP')
                ? ['PERIOD', 'MEMBERSHIP', 'PASS', 'BAY', 'ALL']
                : (normProdCat === 'COUNT' || normProdCat === 'COUPON')
                  ? ['COUNT', 'COUPON', 'TICKET', 'PASS', 'BAY', 'ALL']
                  : normProdCat === 'LESSON'
                    ? ['LESSON', 'ALL']
                    : (normProdCat === 'GOODS' || normProdCat === 'FNB' || normProdCat === 'RETAIL')
                      ? ['GOODS', 'FNB', 'RETAIL', 'ALL']
                      : ['PERIOD', 'COUNT', 'PASS', 'BAY', 'LESSON', 'GOODS', 'ALL']);
        
        const isMatched = coupon.target_categories.some((cat: string) => allowedCategories.includes(String(cat).toUpperCase()));
        if (!isMatched) {
          const catLabels: Record<string, string> = {
            PERIOD: '정액(회원)권',
            COUNT: '쿠폰(횟수)권',
            DAILY: '일일권',
            LESSON: '레슨',
            LOCKER: '라카',
            GOODS: '매장상품',
            BAY: '타석전체',
          };
          const targetLabels = coupon.target_categories.map((c: string) => catLabels[c] || c).join(', ');
          throw new Error(`해당 쿠폰은 [${targetLabels}] 전용 쿠폰입니다.`);
        }
      }
      setAppliedCoupon(coupon);
      setCouponCode('');
      setCouponError('');
      // 이미 단말기 결제 대기 중이었던 경우 기존 승인 요청을 취소하고 변경된 금액으로 재요청 준비
      if (isPayRequested.current) {
        isSilentCancelRef.current = true;
        cancelPayment();
        isPayRequested.current = false;
      }
      setErrorMsg('');
      setIsReadyToPay(false);
    } catch (err: any) {
      setAppliedCoupon(null);
      setCouponError(err.message || '유효하지 않거나 이미 사용된 쿠폰입니다.');
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
    if (isPayRequested.current) {
      isSilentCancelRef.current = true;
      cancelPayment();
      isPayRequested.current = false;
    }
    setErrorMsg('');
    setIsReadyToPay(false);
  };

  // 📟 통합 하드웨어 바코드 스캐너 훅 (USB HID 및 브릿지 데몬)
  useHardwareScanner({
    onScan: (scannedCode) => {
      if (!scannedCode) return;
      setCouponCode(scannedCode);
      handleVerifyCoupon(scannedCode);
    },
    enabled: payStep === 'INSERT_CARD',
  });

  // 포인트 전액 사용 퀵 핸들러 (가맹점 최대 한도 적용 & 1~99원 카드 자투리 방지)
  const handleUseAllPoints = () => {
    if (memberPoint >= targetPayAmt) {
      // 보유 포인트가 결제 대상 금액 이상인 경우 1원 단위 자투리까지 전액 포인트 결제로 처리하여 1~9원 카드 결제 데드락 방지
      setUsedPoints(targetPayAmt);
      return;
    }
    const maxUsable = Math.min(memberPoint, targetPayAmt);
    let rounded = Math.floor(maxUsable / 10) * 10;
    const remainderCard = targetPayAmt - rounded;
    if (remainderCard > 0 && remainderCard < 100) {
      // 카드 잔여 결제액이 100원 미만이 되지 않도록 포인트 사용량 조정
      rounded = Math.max(0, Math.floor((targetPayAmt - 100) / 10) * 10);
    }
    setUsedPoints(rounded);
  };

  // 포인트 퀵 칩 가산 핸들러
  const handleAddPoints = (addAmt: number) => {
    const rawNext = Math.min(usedPoints + addAmt, memberPoint, targetPayAmt);
    if (rawNext >= targetPayAmt && memberPoint >= targetPayAmt) {
      setUsedPoints(targetPayAmt);
      return;
    }
    let rounded = Math.floor(rawNext / 10) * 10;
    const remainderCard = targetPayAmt - rounded;
    if (remainderCard > 0 && remainderCard < 100) {
      rounded = Math.max(0, Math.floor((targetPayAmt - 100) / 10) * 10);
    }
    setUsedPoints(rounded);
  };

  // 결제 실행 핸들러
  const handleExecutePayment = useCallback(async (actualPayAmt: number, ptsUsed: number, instMonths: number = 0) => {
    if (isPayRequested.current) return;
    isPayRequested.current = true;

    const totalDiscount = gradeDiscountAmt + couponDiscountAmt;
    const effectiveInst = actualPayAmt >= MIN_INSTALLMENT_AMOUNT ? instMonths : 0;

    if (actualPayAmt === 0) {
      setPayStep('PRINT_RECEIPT');
      const now = new Date();
      const generatedTradeDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const generatedAppNo = ptsUsed > 0 && !appliedCoupon
        ? `POINT-${String(Math.floor(10000000 + Math.random() * 90000000))}`
        : `FREE-${String(Math.floor(10000000 + Math.random() * 90000000))}`;
      setReceiptDate(generatedTradeDate);
      setAppNo(generatedAppNo);
      setCardIssuer(appliedCoupon ? '할인쿠폰 감면 결제' : '포인트 전액 결제');
      setMaskedCard(appliedCoupon ? '100% 할인 적용' : '100% 포인트 차감');
      completePaymentOnce({ 
        apprNo: generatedAppNo, 
        tradeDate: generatedTradeDate, 
        amount: 0,
        usedPoints: ptsUsed,
        discountAmount: totalDiscount,
        couponNo: appliedCoupon?.coupon_no,
        couponDiscount: couponDiscountAmt,
        installmentMonths: 0
      });
      return;
    }

    setPayStep('INSERT_CARD');
    setErrorMsg('');

    // 🏛️ 서브 가맹점 / 소속 프로 TID 라우팅 검증 (Fail-Fast)
    const unitUpper = String(businessUnitType || 'MAIN').toUpperCase();
    const isSubMerchant =
      ['PRO', 'SUB', 'LESSON', 'FNB'].includes(unitUpper) ||
      (Boolean(businessMerchantId) && businessMerchantId !== 'MAIN') ||
      Boolean(proId);
    if ((api as any).resolveTerminalRoute) {
      try {
        const route = await api.resolveTerminalRoute(
          settings.deviceId,
          businessMerchantId || 'MAIN',
          businessUnitType || 'MAIN',
          proId || null
        );
        if (!route || route.error || route.status === 422 || (isSubMerchant && !route.terminal_id)) {
          setErrorMsg(route?.message || '소속 프로/서브 가맹점 전용 단말기(TID) 라우팅 정보가 설정되지 않았습니다.');
          setPayStep('INSERT_CARD');
          isPayRequested.current = false;
          return;
        }
        if (route.terminal_id) {
          setActiveTerminalId(route.terminal_id);
          kioskVanClient.setConfig({
            provider: String(route.van_provider || settings.providerType || 'KCP').replace('_VAN', '') as any,
            ...({ providerType: route.van_provider || settings.providerType } as any),
            vcatPort: Number(route.vcat_port || settings.vcatPort) || 9099,
            terminalId: route.terminal_id,
          });
        }
      } catch (routeErr: any) {
        setErrorMsg(routeErr?.response?.data?.detail || routeErr?.message || '가맹점 단말기(TID) 라우팅 검증에 실패하여 결제가 차단되었습니다.');
        setPayStep('INSERT_CARD');
        isPayRequested.current = false;
        return;
      }
    } else if (isSubMerchant) {
      setErrorMsg('소속 프로/서브 가맹점 전용 단말기(TID) 라우팅을 확인할 수 없어 결제가 차단되었습니다.');
      setPayStep('INSERT_CARD');
      isPayRequested.current = false;
      return;
    }

    const isTaxFree = String(vatYn || 'Y').toUpperCase() === 'N';
    const vatAmt = isTaxFree ? 0 : Math.round(actualPayAmt / 11);
    const res = await startPayment({
      amount: actualPayAmt,
      productName,
      customerName: memberName,
      timeoutSeconds: 30,
      vatAmount: vatAmt,
      installmentMonths: effectiveInst,
      ...({
        taxFreeAmount: isTaxFree ? actualPayAmt : 0,
        vat_yn: isTaxFree ? 'N' : 'Y',
      } as any),
    });

    if (res.success) {
      setAppNo(res.auth_code);
      setReceiptDate(res.approved_at);
      setCardIssuer(res.issuer_name || '신용카드');
      setMaskedCard(res.card_no_masked || '9410-****-****-****');
      setPayStep('PROCESSING');

      try {
        if (resId) {
          const webhookRes = await api.processPaymentWebhook(resId, actualPayAmt, 'CARD', {
            ...res,
            installment_months: res.installment_months ?? effectiveInst,
            couponNo: appliedCoupon?.coupon_no,
            couponDiscount: couponDiscountAmt,
            usedPoints: ptsUsed,
            gradeDiscountAmount: gradeDiscountAmt,
          });
          if (!webhookRes.success) {
            throw new Error(webhookRes.message);
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        setPayStep('PRINT_RECEIPT');
        completePaymentOnce({ 
          apprNo: res.auth_code, 
          tradeDate: res.approved_at, 
          amount: actualPayAmt, 
          usedPoints: ptsUsed,
          discountAmount: totalDiscount,
          couponNo: appliedCoupon?.coupon_no,
          couponDiscount: couponDiscountAmt,
          installmentMonths: res.installment_months ?? effectiveInst,
          cardApproval: {
            ...res,
            installment_months: res.installment_months ?? effectiveInst,
          }
        });
      } catch (err: any) {
        // 🚨 2-Phase Commit 보상 트랜잭션 (자동 망취소 + 실패 시 유령결제 긴급 리포트)
        const orgDate = (res.approved_at || '').replace(/[^0-9]/g, '').slice(0, 8) || TimeMaster.getKstYmd(new Date()).replace(/-/g, '');
        const resolvedInst = res.installment_months ?? effectiveInst;
        try {
          const cancelRes = await kioskVanClient.cancelCardPayment({
            amount: actualPayAmt,
            orgAuthCode: res.auth_code,
            orgApprovedDate: orgDate,
            terminalId: res.terminal_id,
            vanTrNo: res.van_tr_no,
            installmentMonths: resolvedInst,
            isTaxFree,
            vat: vatAmt,
            reason: '타석 배정 전산 오류로 인한 자동 망취소',
            ...({
              vatAmount: vatAmt,
              taxFreeAmount: isTaxFree ? actualPayAmt : 0,
              orgAuthNo: res.auth_code,
              orgAuthDate: orgDate,
              orgVanTrNo: res.van_tr_no,
            } as any)
          });
          if (!cancelRes || !cancelRes.success) {
            const backendReason = err?.message || 'Webhook failed';
            const revReason = cancelRes?.error_message || 'Unknown';
            await api.reportGhostCharge({
              store_cd: STORE_CODE,
              member_no: memberNo,
              prod_cd: productName,
              amount: actualPayAmt,
              auth_code: res.auth_code,
              card_no_masked: res.card_no_masked || '',
              issuer_name: res.issuer_name || '',
              van_tr_no: res.van_tr_no || '',
              approvedAt: res.approved_at,
              terminal_id: res.terminal_id || activeTerminalId || settings.terminalId || '',
              backendErrorReason: backendReason,
              reversalErrorReason: revReason,
              error_reason: `${backendReason} / Cancel failed: ${revReason}`
            });
          }
          setErrorMsg('타석 배정 처리 실패로 카드 결제가 자동 취소(망취소)되었습니다. 카드를 회수해 주세요.');
        } catch (cancelErr: any) {
          const backendReason = err?.message || 'Webhook failed';
          const revReason = cancelErr?.message || String(cancelErr);
          await api.reportGhostCharge({
            store_cd: STORE_CODE,
            member_no: memberNo,
            prod_cd: productName,
            amount: actualPayAmt,
            auth_code: res.auth_code,
            card_no_masked: res.card_no_masked || '',
            issuer_name: res.issuer_name || '',
            van_tr_no: res.van_tr_no || '',
            approvedAt: res.approved_at,
            terminal_id: res.terminal_id || activeTerminalId || settings.terminalId || '',
            backendErrorReason: backendReason,
            reversalErrorReason: revReason,
            error_reason: `${backendReason} / Cancel exception: ${revReason}`
          });
          setErrorMsg(err.message || '결제 후 배정 처리 중 오류가 발생했습니다.');
        }
        setPayStep('INSERT_CARD');
        isPayRequested.current = false;
      }
    } else {
      setPayStep('INSERT_CARD');
      const errCode = (res as any).errorCode || res.error_code;
      if (errCode === 'E_USER_CANCEL' || isSilentCancelRef.current) {
        isSilentCancelRef.current = false;
        setErrorMsg('');
      } else {
        const vanErrMsg = res.error_message || '결제가 승인되지 않았습니다. 카드를 다시 확인해 주세요.';
        setErrorMsg(vanErrMsg);
        api.writeKioskLog(
          'VAN_ERROR',
          `카드 단말기 승인 실패 (${errCode || 'ERR'}): ${vanErrMsg}`,
          memberNo || undefined
        ).catch(() => {});
      }
      isPayRequested.current = false;
    }
  }, [productName, memberName, memberNo, resId, gradeDiscountAmt, couponDiscountAmt, appliedCoupon, vatYn, businessUnitType, businessMerchantId, proId, settings, activeTerminalId, startPayment, completePaymentOnce]);

  // 🛡️ 2단계 결제 확인: 진입 즉시 단말기를 깨우지 않고 할인·포인트·할부(5만원 이상) 확인 후 [카드 결제 시작] 터치 시 단말기 활성화
  const [isReadyToPay, setIsReadyToPay] = useState<boolean>(false);

  const handleStartPayment = () => {
    setIsReadyToPay(true);
    handleExecutePayment(finalCardAmt, clampedUsedPoints, effectiveInstallmentMonths);
  };

  const handleBackToOptions = () => {
    if (isPayRequested.current) {
      isSilentCancelRef.current = true;
      cancelPayment();
      isPayRequested.current = false;
    }
    setErrorMsg('');
    setIsReadyToPay(false);
  };

  const handleUserCancel = () => {
    isSilentCancelRef.current = true;
    cancelPayment();
    onCancel();
  };


  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1d1d1f',
        boxSizing: 'border-box',
        overflowY: 'auto',
        position: 'relative',
        padding: '20px 0'
      }}
    >
      {/* =========================================================================
          [1단계] 결제 옵션 확인 (애플 미니멀 중앙 플로팅 시트 - 940px 확장 뷰)
         ========================================================================= */}
      {payStep === 'INSERT_CARD' && !isReadyToPay && (
        <div
          style={{
            width: '100%',
            maxWidth: '940px',
            background: '#ffffff',
            borderRadius: '36px',
            border: '1px solid #e5e5ea',
            boxShadow: '0 28px 70px rgba(0, 0, 0, 0.09), 0 4px 18px rgba(0, 0, 0, 0.04)',
            padding: '44px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxSizing: 'border-box',
            position: 'relative'
          }}
        >
          {/* 상단 타이틀 & 캡슐 네비게이션 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: '#f5f5f7',
                  border: '1px solid #e5e5ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <CreditCard size={26} color="#1d1d1f" />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    color: '#1d1d1f',
                    margin: 0,
                    letterSpacing: '-0.5px'
                  }}
                >
                  결제 금액 확인
                </h1>
                <p
                  style={{
                    fontSize: '15px',
                    color: '#86868b',
                    fontWeight: 600,
                    margin: '3px 0 0 0'
                  }}
                >
                  주문 내역과 결제 옵션을 확인해 주세요.
                </p>
              </div>
            </div>

            {!isProcessing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleUserCancel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '50px',
                    padding: '0 22px',
                    borderRadius: '999px',
                    border: '1px solid #e5e5ea',
                    background: '#f5f5f7',
                    color: '#1d1d1f',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ArrowLeft size={17} />
                  이전 단계
                </button>
                <button
                  type="button"
                  onClick={handleUserCancel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '50px',
                    padding: '0 20px',
                    borderRadius: '999px',
                    border: '1px solid #e5e5ea',
                    background: '#f5f5f7',
                    color: '#86868b',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <X size={17} />
                  취소
                </button>
              </div>
            )}
          </div>

          {/* 에러 배너 */}
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '18px',
                padding: '14px 20px',
                color: '#b91c1c',
                fontSize: '15px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <ShieldAlert size={20} color="#b91c1c" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 주문 정보 요약 바 */}
          <div
            style={{
              background: '#f5f5f7',
              borderRadius: '22px',
              border: '1px solid #e5e5ea',
              padding: '22px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span
                style={{
                  background: '#1d1d1f',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 800,
                  padding: '8px 14px',
                  borderRadius: '12px',
                  letterSpacing: '-0.3px',
                  flexShrink: 0
                }}
              >
                {(assignedBayNos && assignedBayNos.length > 0)
                  ? `${assignedBayNos.join(', ')}번`
                  : (assignedBayNo !== undefined && assignedBayNo !== null)
                    ? `${assignedBayNo}번 타석`
                    : (assignedLockerNo !== undefined && assignedLockerNo !== null)
                      ? `${assignedLockerNo}호 라카`
                      : '이용권'}
              </span>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                  {productName}
                </div>
                <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 600, marginTop: '3px' }}>
                  {(assignedBayNos && assignedBayNos.length > 0)
                    ? `동반자 그룹 (${assignedBayNos.length}석)`
                    : (assignedBayNo !== undefined && assignedBayNo !== null)
                      ? '즉시 배정 · 타석 이용권'
                      : '정규 이용권'}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#86868b' }}>
                기준 금액
              </div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1d1d1f', marginTop: '2px', letterSpacing: '-0.5px' }}>
                {amount.toLocaleString()} <span style={{ fontSize: '19px', fontWeight: 700 }}>원</span>
              </div>
            </div>
          </div>

          {/* 회원 인증 & 포인트 (인라인 컴팩트 바) */}
          <div
            style={{
              background: '#f5f5f7',
              borderRadius: '22px',
              border: '1px solid #e5e5ea',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxSizing: 'border-box'
            }}
          >
            {!memberNo ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      border: '1px solid #e5e5ea',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1d1d1f',
                      flexShrink: 0
                    }}
                  >
                    <UserCheck size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#1d1d1f' }}>
                      회원 정보 및 혜택 조회
                    </div>
                    <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                      회원으로 이용하시려면 인증을 진행해 주세요.
                    </div>
                  </div>
                </div>

                {onRequestMemberAuth && (
                  <button
                    type="button"
                    data-testid="payment-member-auth-btn"
                    onClick={() => {
                      if (isPayRequested.current) {
                        isSilentCancelRef.current = true;
                        cancelPayment();
                        isPayRequested.current = false;
                      }
                      onRequestMemberAuth();
                    }}
                    style={{
                      height: '52px',
                      padding: '0 26px',
                      borderRadius: '999px',
                      background: '#1d1d1f',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '16px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <UserCheck size={20} />
                    <span>회원 인증 / 로그인</span>
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 900, color: '#1d1d1f' }}>
                      {memberName || '회원'} 님
                    </span>
                    <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
                      ({memberNo})
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#0071e3',
                        background: 'rgba(0, 113, 227, 0.08)',
                        padding: '3px 10px',
                        borderRadius: '6px'
                      }}
                    >
                      인증 완료
                    </span>
                  </div>
                  {discountRate > 0 && (
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#047857' }}>
                      ✨ 등급할인 {discountRate}% (-{gradeDiscountAmt.toLocaleString()}원)
                    </span>
                  )}
                </div>

                {/* 포인트 바 */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #e5e5ea',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600 }}>보유 포인트</span>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d1d1f' }}>
                        {memberPoint.toLocaleString()} P
                      </div>
                    </div>
                    <div style={{ width: '1px', height: '24px', background: '#e5e5ea' }} />
                    <div>
                      <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600 }}>사용 포인트</span>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: clampedUsedPoints > 0 ? '#0071e3' : '#86868b' }}>
                        -{clampedUsedPoints.toLocaleString()} P
                      </div>
                    </div>
                  </div>

                  {memberPoint > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        data-testid="use-all-points-btn"
                        onClick={handleUseAllPoints}
                        style={{
                          height: '42px',
                          padding: '0 16px',
                          borderRadius: '999px',
                          background: '#1d1d1f',
                          color: '#ffffff',
                          fontSize: '14px',
                          fontWeight: 800,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        전액 사용
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPoints(1000)}
                        style={{ height: '42px', padding: '0 12px', borderRadius: '999px', background: '#f5f5f7', border: '1px solid #d2d2d7', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >
                        +1천
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddPoints(5000)}
                        style={{ height: '42px', padding: '0 12px', borderRadius: '999px', background: '#f5f5f7', border: '1px solid #d2d2d7', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >
                        +5천
                      </button>
                      <button
                        type="button"
                        onClick={() => setUsedPoints(0)}
                        style={{ height: '42px', padding: '0 12px', borderRadius: '999px', background: '#ffffff', border: '1px solid #fecaca', color: '#ff3b30', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >
                        초기화
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 쿠폰 & 할부 2열 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* 할인 쿠폰 */}
            <div
              style={{
                background: '#f5f5f7',
                borderRadius: '22px',
                border: '1px solid #e5e5ea',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Ticket size={19} color="#1d1d1f" />
                  <span>할인 쿠폰</span>
                </div>
                <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600 }}>
                  바코드 스캔 / 입력
                </span>
              </div>

              {appliedCoupon ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#ffffff',
                    padding: '12px 18px',
                    borderRadius: '14px',
                    border: '1px solid #0071e3'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#1d1d1f' }}>
                      {appliedCoupon.coupon_nm || appliedCoupon.coupon_name || '할인 쿠폰'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#0071e3', fontWeight: 700, marginTop: '2px' }}>
                      -{couponDiscountAmt.toLocaleString()}원 적용
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="remove-coupon-btn"
                    onClick={handleRemoveCoupon}
                    style={{
                      background: '#f5f5f7',
                      border: '1px solid #e5e5ea',
                      color: '#ff3b30',
                      borderRadius: '999px',
                      height: '38px',
                      padding: '0 14px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    취소 ✕
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      data-testid="coupon-code-input"
                      value={couponCode}
                      onFocus={() => {
                        if (isPayRequested.current && (vanState === 'WAITING_CARD' || vanState === 'READY')) {
                          isSilentCancelRef.current = true;
                          cancelPayment();
                          isPayRequested.current = false;
                          setIsReadyToPay(false);
                          setErrorMsg('');
                        }
                      }}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        if (isPayRequested.current && (vanState === 'WAITING_CARD' || vanState === 'READY')) {
                          isSilentCancelRef.current = true;
                          cancelPayment();
                          isPayRequested.current = false;
                          setIsReadyToPay(false);
                          setErrorMsg('');
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyCoupon()}
                      placeholder="쿠폰 번호 입력"
                      style={{
                        flex: 1,
                        height: '52px',
                        padding: '0 16px',
                        borderRadius: '14px',
                        border: '1px solid #d2d2d7',
                        fontSize: '15px',
                        fontWeight: 700,
                        outline: 'none',
                        background: '#ffffff',
                        color: '#1d1d1f'
                      }}
                    />
                    <button
                      type="button"
                      data-testid="apply-coupon-btn"
                      onClick={() => handleVerifyCoupon()}
                      disabled={isVerifyingCoupon || !couponCode.trim()}
                      style={{
                        padding: '0 22px',
                        height: '52px',
                        borderRadius: '14px',
                        background: couponCode.trim() ? '#1d1d1f' : '#e5e5ea',
                        color: couponCode.trim() ? '#ffffff' : '#8e8e93',
                        fontSize: '15px',
                        fontWeight: 800,
                        border: 'none',
                        cursor: couponCode.trim() ? 'pointer' : 'default',
                        flexShrink: 0
                      }}
                    >
                      {isVerifyingCoupon ? '확인 중' : '적용'}
                    </button>
                  </div>
                  {couponError && (
                    <div style={{ fontSize: '12px', color: '#ff3b30', fontWeight: 700, marginTop: '6px' }}>
                      ⚠️ {couponError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 신용카드 할부 */}
            <div
              data-testid={canSelectInstallment ? 'installment-selector-panel' : undefined}
              style={{
                background: '#f5f5f7',
                borderRadius: '22px',
                border: '1px solid #e5e5ea',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={19} color="#1d1d1f" />
                  <span>신용카드 할부</span>
                </div>
                <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600 }}>
                  5만원 이상 선택 가능
                </span>
              </div>

              {canSelectInstallment ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {INSTALLMENT_MONTH_OPTIONS.map((months) => {
                    const isSelected = effectiveInstallmentMonths === months;
                    const label = months === 0 ? '일시불' : `${months}개월`;
                    return (
                      <button
                        key={months}
                        type="button"
                        data-testid={`installment-option-${months}`}
                        onClick={() => setInstallmentMonths(months)}
                        style={{
                          height: '46px',
                          borderRadius: '12px',
                          border: isSelected ? '1.5px solid #1d1d1f' : '1px solid #d2d2d7',
                          background: isSelected ? '#1d1d1f' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#1d1d1f',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    height: '52px',
                    background: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid #e5e5ea',
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#1d1d1f' }}>
                    일시불 결제
                  </span>
                  <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 600 }}>
                    (50,000원 이상 시 할부 가능)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 정산 내역 및 최종 결제 독 */}
          <div
            style={{
              borderTop: '1.5px solid #e5e5ea',
              paddingTop: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {/* 금액 4열 바 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <div style={{ background: '#f5f5f7', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e5e5ea' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#86868b' }}>정상 금액</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d1d1f', marginTop: '2px' }}>
                  {amount.toLocaleString()} 원
                </div>
              </div>

              <div style={{ background: '#f5f5f7', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e5e5ea' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#86868b' }}>등급 할인</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: gradeDiscountAmt > 0 ? '#0071e3' : '#8e8e93', marginTop: '2px' }}>
                  - {gradeDiscountAmt.toLocaleString()} 원
                </div>
              </div>

              <div style={{ background: '#f5f5f7', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e5e5ea' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#86868b' }}>쿠폰 할인</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: couponDiscountAmt > 0 ? '#0071e3' : '#8e8e93', marginTop: '2px' }}>
                  - {couponDiscountAmt.toLocaleString()} 원
                </div>
              </div>

              <div style={{ background: '#f5f5f7', borderRadius: '14px', padding: '12px 16px', border: '1px solid #e5e5ea' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#86868b' }}>포인트 사용</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: clampedUsedPoints > 0 ? '#0071e3' : '#8e8e93', marginTop: '2px' }}>
                  - {clampedUsedPoints.toLocaleString()} P
                </div>
              </div>
            </div>

            {/* 결제 최종 바 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#86868b' }}>
                    최종 결제 금액
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#1d1d1f',
                      background: '#f5f5f7',
                      border: '1px solid #e5e5ea',
                      padding: '3px 10px',
                      borderRadius: '999px'
                    }}
                  >
                    {finalCardAmt === 0
                      ? '0원 승인'
                      : effectiveInstallmentMonths > 0
                        ? `${effectiveInstallmentMonths}개월 할부`
                        : '일시불'}
                  </span>
                </div>
                <div style={{ fontSize: '48px', fontWeight: 950, color: '#1d1d1f', letterSpacing: '-1.5px', lineHeight: 1.1, marginTop: '2px' }}>
                  {finalCardAmt.toLocaleString()} <span style={{ fontSize: '26px', fontWeight: 800 }}>원</span>
                </div>
              </div>

              <button
                type="button"
                data-testid="start-card-payment-btn"
                onClick={handleStartPayment}
                style={{
                  height: '76px',
                  padding: '0 44px',
                  borderRadius: '999px',
                  background: '#1d1d1f',
                  color: '#ffffff',
                  fontSize: '22px',
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  letterSpacing: '-0.5px',
                  transition: 'all 0.15s ease'
                }}
              >
                {finalCardAmt === 0 ? (
                  <>
                    <Sparkles size={24} />
                    <span>0원 결제 완료하기</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={24} />
                    <span>
                      {finalCardAmt.toLocaleString()}원 카드 결제 시작
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          [2단계] 단말기 연동 및 IC 카드 투입 몰입 화면 (940px 확장 뷰)
         ========================================================================= */}
      {payStep === 'INSERT_CARD' && isReadyToPay && (
        <div
          style={{
            width: '100%',
            maxWidth: '940px',
            background: '#ffffff',
            borderRadius: '36px',
            border: '1px solid #e5e5ea',
            boxShadow: '0 28px 70px rgba(0, 0, 0, 0.09), 0 4px 18px rgba(0, 0, 0, 0.04)',
            padding: '44px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxSizing: 'border-box'
          }}
        >
          {/* 상단 타이틀 & 캡슐 네비게이션 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: '#f5f5f7',
                  border: '1px solid #e5e5ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <CreditCard size={26} color="#1d1d1f" />
              </div>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1d1d1f', margin: 0, letterSpacing: '-0.5px' }}>
                  신용카드 단말기 결제 대기
                </h1>
                <p style={{ fontSize: '15px', color: '#86868b', fontWeight: 600, margin: '3px 0 0 0' }}>
                  단말기 투입구에 카드를 끝까지 꽂아주세요.
                </p>
              </div>
            </div>

            {!isProcessing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleBackToOptions}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '50px',
                    padding: '0 22px',
                    borderRadius: '999px',
                    border: '1px solid #e5e5ea',
                    background: '#f5f5f7',
                    color: '#1d1d1f',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={17} />
                  옵션 변경
                </button>
                <button
                  type="button"
                  onClick={handleUserCancel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '50px',
                    padding: '0 20px',
                    borderRadius: '999px',
                    border: '1px solid #e5e5ea',
                    background: '#f5f5f7',
                    color: '#86868b',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <X size={17} />
                  취소
                </button>
              </div>
            )}
          </div>

          {/* 승인 요청 요약 바 */}
          <div
            style={{
              background: '#f5f5f7',
              borderRadius: '22px',
              border: '1px solid #e5e5ea',
              padding: '22px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#86868b' }}>
                결제 상품
              </span>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1d1d1f', marginTop: '3px' }}>
                {productName}
                {(assignedBayNos && assignedBayNos.length > 0)
                  ? ` (${assignedBayNos.join(', ')}번 타석)`
                  : assignedBayNo
                    ? ` (${assignedBayNo}번 타석)`
                    : assignedLockerNo
                      ? ` (라카 ${assignedLockerNo}호)`
                      : ''}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#86868b' }}>
                승인 요청 금액 ({effectiveInstallmentMonths > 0 ? `${effectiveInstallmentMonths}개월 할부` : '일시불'})
              </span>
              <div style={{ fontSize: '32px', fontWeight: 900, color: '#1d1d1f', marginTop: '2px', letterSpacing: '-0.5px' }}>
                {finalCardAmt.toLocaleString()} <span style={{ fontSize: '20px', fontWeight: 700 }}>원</span>
              </div>
            </div>
          </div>

          {/* 카드 투입 애니메이션 박스 */}
          <div
            className="card-terminal-wrap"
            style={{
              background: '#1d1d1f',
              borderRadius: '28px',
              padding: '40px 36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              color: '#ffffff',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
              <div
                style={{
                  width: '300px',
                  height: '18px',
                  background: '#050507',
                  borderRadius: '6px',
                  border: '1.5px solid rgba(255,255,255,0.2)'
                }}
              />
              <div className="animate-card-slide" style={{ position: 'relative' }}>
                <div
                  style={{
                    width: '160px',
                    height: '240px',
                    borderRadius: '18px',
                    background: 'linear-gradient(135deg, #2c2c2e 0%, #1c1c1e 100%)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 18px 45px rgba(0,0,0,0.6)'
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '30px',
                      background: '#fbbf24',
                      borderRadius: '6px'
                    }}
                  />
                  <div style={{ color: '#ffffff', fontWeight: 900, fontSize: '14px', letterSpacing: '1px' }}>
                    IC CARD
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {vanState === 'REQUESTING' ? (
                <>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#34c759' }}>
                    금융사 승인 처리 중입니다...
                  </div>
                  <div style={{ fontSize: '18px', color: '#ff453a', fontWeight: 800 }}>
                    카드를 절대 뽑지 마세요!
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '44px', fontWeight: 900, color: '#34c759', letterSpacing: '-1px' }}>
                    남은 시간 {remainingSeconds}초
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff' }}>
                    단말기 투입구에 카드를 끝까지 꽂아주세요
                  </div>
                  <div style={{ fontSize: '15px', color: '#a1a1a6', fontWeight: 600 }}>
                    IC칩이 앞면(위)을 향하도록 리더기에 삽입해 주십시오.
                  </div>
                </>
              )}
            </div>

            {errorMsg && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '620px',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1.5px solid #ef4444',
                  borderRadius: '18px',
                  padding: '16px 20px',
                  color: '#fca5a5',
                  fontSize: '15px',
                  fontWeight: 800,
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div>⚠️ {errorMsg}</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsReadyToPay(true);
                      handleExecutePayment(finalCardAmt, clampedUsedPoints, effectiveInstallmentMonths);
                    }}
                    style={{
                      height: '46px',
                      padding: '0 24px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#1d1d1f',
                      fontSize: '15px',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    다시 시도
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToOptions}
                    style={{
                      height: '46px',
                      padding: '0 24px',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      fontSize: '15px',
                      fontWeight: 800,
                      border: '1px solid rgba(255,255,255,0.25)',
                      cursor: 'pointer'
                    }}
                  >
                    옵션 변경
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          [승인 처리 중]
         ========================================================================= */}
      {payStep === 'PROCESSING' && (
        <div
          style={{
            width: '100%',
            maxWidth: '620px',
            background: '#ffffff',
            borderRadius: '32px',
            border: '1px solid #e5e5ea',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.08)',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            boxSizing: 'border-box'
          }}
        >
          <div 
            style={{
              width: '80px',
              height: '80px',
              border: '6px solid #e5e5ea',
              borderTopColor: '#1d1d1f',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '26px', fontWeight: 900, color: '#1d1d1f', margin: '0 0 8px 0' }}>
              신용카드 결제 승인 중입니다
            </h2>
            <p style={{ fontSize: '16px', color: '#ff3b30', fontWeight: 800, margin: 0 }}>
              금융사 네트워크 승인을 요청하고 있습니다. 카드를 절대 빼지 마세요!
            </p>
          </div>
        </div>
      )}

      {/* =========================================================================
          [3단계] 영수증 출력
         ========================================================================= */}
      {payStep === 'PRINT_RECEIPT' && (
        <div
          style={{
            width: '100%',
            maxWidth: '680px',
            background: '#ffffff',
            borderRadius: '32px',
            border: '1px solid #e5e5ea',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.08)',
            padding: '36px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            boxSizing: 'border-box'
          }}
        >
          {/* 인쇄 영수증 / 배정표 */}
          <div className="receipt-paper" style={{ boxShadow: '0 15px 35px rgba(0, 0, 0, 0.12)' }}>
            {amount > 0 ? (
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
                    const isTaxFree = String(vatYn || 'Y').toUpperCase() === 'N';
                    const supplyAmount = isTaxFree ? finalCardAmt : Math.round(finalCardAmt / 1.1);
                    const vatAmount = isTaxFree ? 0 : finalCardAmt - supplyAmount;
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '10px', marginTop: '4px' }}>
                          <span>{isTaxFree ? '면세공급가:' : '판매금액:'}</span>
                          <span>{supplyAmount.toLocaleString()} 원</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>부 가 세:</span>
                          <span>{vatAmount.toLocaleString()} 원</span>
                        </div>
                      </>
                    );
                  })()}
                  {gradeDiscountAmt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                      <span>등급할인:</span>
                      <span>-{gradeDiscountAmt.toLocaleString()} 원</span>
                    </div>
                  )}
                  {couponDiscountAmt > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6d28d9' }}>
                      <span>쿠폰할인:</span>
                      <span>-{couponDiscountAmt.toLocaleString()} 원</span>
                    </div>
                  )}
                  {usedPoints > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7' }}>
                      <span>포인트사용:</span>
                      <span>-{usedPoints.toLocaleString()} P</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '6px 0' }}>
                    <span>실결제금액:</span>
                    <span>{finalCardAmt.toLocaleString()} 원</span>
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
              <>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '14px', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '1px', color: '#111' }}>🎫 타석 배정표</h3>
                  <p style={{ fontSize: '13px', marginTop: '4px', color: '#666' }}>프리미엄 골프 아카데미 무인점</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
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
            onClick={() => completePaymentOnce(lastPayResultRef.current || { apprNo: appNo, tradeDate: receiptDate, amount: finalCardAmt, usedPoints, discountAmount: gradeDiscountAmt + couponDiscountAmt, couponNo: appliedCoupon?.coupon_no, couponDiscount: couponDiscountAmt })}
            style={{
              width: '100%',
              maxWidth: '440px',
              height: '64px',
              borderRadius: '999px',
              background: '#1d1d1f',
              border: 'none',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={22} />
            <span>이용 완료 (메인으로)</span>
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
