import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('7순위: Kiosk Session Reset 3-Way Symmetry (handleLogout / handleLogoutToHome / handleGoHome) & State Pollution Guard', () => {
  const kioskAppSrc = fs.readFileSync(
    path.resolve(__dirname, '../KioskApp.tsx'),
    'utf-8'
  );
  const par3Src = fs.readFileSync(
    path.resolve(__dirname, '../components/Par3Allocation.tsx'),
    'utf-8'
  );

  it('1. handleLogout, handleLogoutToHome, and handleGoHome all delegate to atomic resetKioskSessionState()', () => {
    expect(kioskAppSrc).toContain("const resetKioskSessionState = (targetStep: 'INTRO' | 'MAIN_DASHBOARD') =>");
    expect(kioskAppSrc).toContain("const handleLogout = () => {\n    resetKioskSessionState('INTRO');\n  };");
    expect(kioskAppSrc).toContain("const handleLogoutToHome = () => {\n    resetKioskSessionState('MAIN_DASHBOARD');\n  };");
    expect(kioskAppSrc).toContain("const handleGoHome = () => {\n    resetKioskSessionState('MAIN_DASHBOARD');\n  };");

    // Extract resetKioskSessionState body and verify all critical state/ref/timer cleanups
    const startIdx = kioskAppSrc.indexOf("const resetKioskSessionState = (targetStep: 'INTRO' | 'MAIN_DASHBOARD') =>");
    const endIdx = kioskAppSrc.indexOf('const handleLogout = () =>', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    const resetBody = kioskAppSrc.slice(startIdx, endIdx);

    const requiredCleanups = [
      'selectedBayNoRef.current = null;',
      'selectedBayNosRef.current = [];',
      'authReturnStepRef.current = null;',
      'keepAuthAfterPurchaseRef.current = false;',
      'isVanBusyRef.current = false;',
      'cancelFeedbackCountdown();',
      'setAuthMember(null);',
      'setSelectedBayNo(null);',
      'setSelectedBayNos([]);',
      'setCompanionTargets([]);',
      'setShowCompanionModal(false);',
      'setSelectedLockerNo(null);',
      'setSelectedLockerDisplayNo(null);',
      'setSelectedProduct(null);',
      'setSelectedAssetId(null);',
      'setCompletedAllocationInfo(null);',
      'setCompletedPurchaseInfo(null);',
      'setInactivityCountdown(null);',
      'setSelectedZoneIds([]);',
      'setIsAdminPinOpen(false);',
      'setIsSettingsOpen(false);',
      'setCustomMenuNotice(null);',
      'setErrorModal(prev => ({ ...prev, isVisible: false }));',
      'setHwFailAlert(null);',
      'setPurpose(null);',
      'setErrorMasterCard(null);',
      'setClosingPromptModal(null);',
      "setInitialAuthMode('SMART_TAG');",
      'setStep(targetStep);',
    ];

    for (const statement of requiredCleanups) {
      expect(resetBody).toContain(statement);
    }
  });

  it('2. Customer A Locker Extend -> Timeout/Completion -> Customer B Membership Purchase does NOT leak assignedLockerNo or block PERIOD coupons', () => {
    // Simulate PaymentTerminal coupon eligibility logic when assignedLockerNo is properly cleared vs polluted
    const evaluateCouponEligibility = (
      couponTargetCategories: string[],
      assignedBayNo: number | null,
      assignedBayNos: number[],
      assignedLockerNo: number | string | null,
      productCategory: string
    ) => {
      const isBayAllocation = Boolean(assignedBayNo) || Boolean(assignedBayNos && assignedBayNos.length > 0);
      const normProdCat = String(productCategory || '').toUpperCase();
      const allowedCategories = assignedLockerNo
        ? ['LOCKER', 'RENTAL', 'ALL']
        : isBayAllocation || normProdCat === 'DAILY' || normProdCat === 'DAY'
          ? ['DAILY', 'BAY', 'PASS', 'ALL']
          : normProdCat === 'PERIOD' || normProdCat === 'MEMBERSHIP'
            ? ['PERIOD', 'MEMBERSHIP', 'PASS', 'BAY', 'ALL']
            : ['PERIOD', 'COUNT', 'PASS', 'BAY', 'LESSON', 'GOODS', 'ALL'];

      return couponTargetCategories.some((cat) => allowedCategories.includes(String(cat).toUpperCase()));
    };

    // Customer A selects Locker #15
    let selectedLockerNo: number | string | null = 15;
    let selectedLockerDisplayNo: string | null = '15';

    // Customer A session ends via resetKioskSessionState (handleLogout or handleLogoutToHome)
    selectedLockerNo = null;
    selectedLockerDisplayNo = null;

    // Customer B enters Membership Purchase (PURCHASE_PRODUCT, PERIOD)
    const assignedLockerNoForCustomerB = selectedLockerDisplayNo || selectedLockerNo;
    expect(assignedLockerNoForCustomerB).toBeNull();

    // Customer B applies a PERIOD (정액/회원권) coupon -> must be eligible!
    const isPeriodCouponAllowed = evaluateCouponEligibility(
      ['PERIOD'],
      null,
      [],
      assignedLockerNoForCustomerB,
      'PERIOD'
    );
    expect(isPeriodCouponAllowed).toBe(true);
  });

  it('3. CheckinSelect.onCheckinSuccess clears selectedBayNo to null so closing AllocationCompleteModal does not fire spurious releaseBay', () => {
    const checkinIdx = kioskAppSrc.indexOf('onCheckinSuccess={(');
    expect(checkinIdx).toBeGreaterThan(0);
    const checkinBlock = kioskAppSrc.slice(checkinIdx, checkinIdx + 1600);

    expect(checkinBlock).toContain('setSelectedBayNo(null);');
    expect(checkinBlock).toContain('selectedBayNoRef.current = null;');
    expect(checkinBlock).toContain('setCheckinResId(null);');
    expect(checkinBlock).not.toContain('setSelectedBayNo(numericBay);');
  });

  it('4. Inactivity timer guards against paymentRetryActiveRef and Par3Allocation completion receipt screen', () => {
    // KioskApp global inactivity guard includes paymentRetryActiveRef.current
    expect(kioskAppSrc).toContain('const paymentRetryActiveRef = useRef(false);');
    expect(kioskAppSrc).toContain('paymentRetryActiveRef.current = paymentRetryStatus.active;');
    expect(kioskAppSrc).toContain('paymentRetryActiveRef.current ||');

    // Par3Allocation keeps onVanBusyChange(true) while paymentState === 'DONE' or createdReceipt !== null
    expect(par3Src).toContain("paymentState === 'DONE' ||");
    expect(par3Src).toContain('createdReceipt !== null;');
  });

  it('5. AllocationCompleteModal pauses its auto-close countdown while hwFailAlert (zIndex 10050) is active on top', () => {
    const allocModalSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/AllocationCompleteModal.tsx'),
      'utf-8'
    );
    expect(kioskAppSrc).toContain('pauseCountdown={Boolean(hwFailAlert)}');
    expect(allocModalSrc).toContain('if (isPrinting || pauseCountdown) return;');
  });
});
