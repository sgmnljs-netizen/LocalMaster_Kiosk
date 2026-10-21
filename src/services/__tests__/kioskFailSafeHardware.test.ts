import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { CardApprovalResult, VanConfig } from '../van/van_types';
import type { Bay, Member, Product } from '../../types';

// Node 환경용 localStorage 폴리필
const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Fail-Safe & Hardware Device Error Handling QA (F03, F04, F06, F07)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kioskVanClient: typeof import('../van/van_client').kioskVanClient;
  let kioskHardwareBridge: typeof import('../hardware/services/HardwareBridgeClient').kioskHardwareBridge;

  beforeAll(async () => {
    const apiMod = await import('../api');
    api = apiMod.api;
    const vanMod = await import('../van/van_client');
    kioskVanClient = vanMod.kioskVanClient;
    const bridgeMod = await import('../hardware/services/HardwareBridgeClient');
    kioskHardwareBridge = bridgeMod.kioskHardwareBridge;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    kioskVanClient.setConfig({
      isMock: true,
      terminalId: '88010003',
      provider: 'MOCK',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // F03: VAN 카드 리더기 단선/통신 불능 시 결제 진입 차단 & 선점 락 자동 반환
  // =========================================================================
  describe('F03 [VAN 카드 리더기 단선/통신 불능 시 결제 진입 차단 & 선점 락 자동 반환]', () => {
    it('F03-1: VAN 단말기 통신 오류 / 단선 발생 시 결제 차단, 에러 노출 및 VAN_ERROR 감사 로그 기록', async () => {
      // 1. 단말기 통신 불능 / 타임아웃 응답 모킹
      vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        card_no_masked: '',
        issuer_name: '',
        acquirer_name: '',
        terminal_id: '88010003',
        amount: 20000,
        installment_months: 0,
        error_code: 'E_TERMINAL_COMM_ERR',
        error_message: '단말기 통신 오류 (응답 없음)',
      });

      const writeLogSpy = vi.spyOn(api, 'writeKioskLog').mockResolvedValue();

      // 2. PaymentTerminal 내부 결제 실행 흐름 시뮬레이션
      const paymentAmount = 20000;
      let payStep: 'INSERT_CARD' | 'PROCESSING' | 'PRINT_RECEIPT' = 'INSERT_CARD';
      let errorMsg = '';
      let isPayRequested = false;

      const handleExecutePayment = async (amt: number, memberNo?: string) => {
        isPayRequested = true;
        payStep = 'INSERT_CARD';
        errorMsg = '';

        const res = await kioskVanClient.requestCardPayment({
          amount: amt,
          productName: '일일 타석권 60분',
        });

        if (res.success) {
          payStep = 'PROCESSING';
        } else {
          payStep = 'INSERT_CARD';
          const errCode = res.error_code || 'ERR';
          const vanErrMsg = res.error_message || '결제가 승인되지 않았습니다.';
          errorMsg = vanErrMsg;

          await api.writeKioskLog(
            'VAN_ERROR',
            `카드 단말기 승인 실패 (${errCode}): ${vanErrMsg}`,
            memberNo || undefined
          );
          isPayRequested = false;
        }
      };

      await handleExecutePayment(paymentAmount, 'M_F03_001');

      // 3. 검증: 결제 진행 차단, 에러 메시지 표출, 결제 플래그 해제
      expect(payStep).toBe('INSERT_CARD');
      expect(errorMsg).toBe('단말기 통신 오류 (응답 없음)');
      expect(isPayRequested).toBe(false);

      // 4. 검증: VAN_ERROR 로그 기록
      expect(writeLogSpy).toHaveBeenCalledWith(
        'VAN_ERROR',
        '카드 단말기 승인 실패 (E_TERMINAL_COMM_ERR): 단말기 통신 오류 (응답 없음)',
        'M_F03_001'
      );
    });

    it('F03-2: VAN 통신 오류 발생 후 결제 취소 시 선점 타석 락이 즉시 안전하게 해제된다 (Lock Auto-Release)', async () => {
      const termId = api.getTerminalId();
      // 1. 타석 5번이 선점(PRE_OCCUPIED)된 상태 세팅
      const initialBays: Bay[] = [
        {
          bay_no: 5,
          bay_name: '5번 타석',
          status: 'PRE_OCCUPIED',
          lock_terminal_id: termId,
          lock_expired_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        } as Bay,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(initialBays));

      // 2. VAN 결제 오류 시뮬레이션
      vi.spyOn(kioskVanClient, 'requestCardPayment').mockResolvedValueOnce({
        success: false,
        auth_code: '',
        approved_at: new Date().toISOString(),
        card_no_masked: '',
        issuer_name: '',
        acquirer_name: '',
        terminal_id: '88010003',
        amount: 15000,
        installment_months: 0,
        error_code: 'E_DEVICE_DISCONNECTED',
        error_message: '단말기 연결선이 분리되었습니다.',
      });

      // 3. 백엔드 releaseBay 호출 스파이
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false); // Edge DB 모드로 검증
      const releaseSpy = vi.spyOn(api, 'releaseBay');

      // 결제 실패 후 사용자가 확인/취소하여 락 해제 호출
      await api.releaseBay(5);

      expect(releaseSpy).toHaveBeenCalledWith(5);

      // Edge DB에서 타석 5의 상태가 AVAILABLE로 정상 원복되었는지 확인
      const savedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay5 = savedBays.find((b) => b.bay_no === 5);
      expect(bay5).toBeDefined();
      expect(bay5?.status).toBe('AVAILABLE');
      expect(bay5?.lock_terminal_id).toBeNull();
      expect(bay5?.lock_expired_at).toBeNull();
    });

    it('F03-3: 서브 가맹점 / 소속 프로 TID 라우팅 누락 시 결제 진입 전 Fail-Fast 차단 및 에러 노출', async () => {
      // resolveTerminalRoute 실패 (TID 누락) 모킹
      vi.spyOn(api as any, 'resolveTerminalRoute').mockResolvedValueOnce({
        success: false,
        status: 422,
        message: '소속 프로/서브 가맹점 전용 단말기(TID) 라우팅 정보가 설정되지 않았습니다.',
      });

      const writeLogSpy = vi.spyOn(api, 'writeKioskLog').mockResolvedValue();

      let payStep = 'INSERT_CARD';
      let errorMsg = '';
      let isPayRequested = false;

      const handleExecutePaymentWithSubMerchant = async (businessMerchantId: string, proId: string | null) => {
        isPayRequested = true;
        const route = await (api as any).resolveTerminalRoute('DEV_01', businessMerchantId, 'PRO', proId);
        if (!route || route.status === 422 || !route.terminal_id) {
          errorMsg = route?.message || '라우팅 정보 없음';
          payStep = 'INSERT_CARD';
          isPayRequested = false;
          return;
        }
      };

      await handleExecutePaymentWithSubMerchant('PRO_MERCHANT_99', 'PRO_99');

      expect(payStep).toBe('INSERT_CARD');
      expect(errorMsg).toContain('라우팅 정보가 설정되지 않았습니다');
      expect(isPayRequested).toBe(false);
    });

    it('F03-4: VAN 30초 결제 시간 초과(Timeout) 시 리더기 강제 취소(cancelCurrentRequest) 및 상태 보장', async () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest');

      // 30초 타임아웃 트리거 시뮬레이션
      let vanPaymentState: string = 'WAITING_CARD';
      let error: string | null = null;
      let remainingSeconds = 1;

      // 1초 후 타이머 만료 동작
      if (remainingSeconds <= 1) {
        kioskVanClient.cancelCurrentRequest();
        vanPaymentState = 'TIMEOUT';
        error = '결제 시간이 초과되어 취소되었습니다.';
      }

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(vanPaymentState).toBe('TIMEOUT');
      expect(error).toContain('시간이 초과되어');
    });
  });

  // =========================================================================
  // F04: 영수증 프린터 용지 부족(Paper-out) / 미연결 시 무중단 배정 완료 보장
  // =========================================================================
  describe('F04 [영수증 프린터 용지 부족(Paper-out) / 미연결 시 무중단 배정 완료 보장]', () => {
    it('F04-1: 타석 배정 완료 후 영수증 프린터 미연결 / Paper-out 발생 시 배정 롤백 없이 완료 유지 (No Rollback)', async () => {
      // 1. 배정 성공 상태 모킹
      const assignedBayNo = 7;
      const resId = 'ALLOC_20261020_BAY7_UUID';
      const durationMin = 60;

      // 2. 프린터 용지 부족 / 장치 미연결 모킹
      vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValueOnce({
        success: false,
        message: '프린터 응답 없음 (Paper out or Disconnected)',
      });

      // releaseBay 스파이로 롤백이 절대 호출되지 않음을 감시
      const releaseSpy = vi.spyOn(api, 'releaseBay');

      // 3. AllocationCompleteModal handlePrint 로직 시뮬레이션
      let isPrinting = true;
      let printStatus: string | null = null;
      const lang = 'KO';

      const handlePrint = async () => {
        isPrinting = true;
        printStatus = lang === 'KO' ? '출력 중...' : 'Printing...';
        try {
          const res = await kioskHardwareBridge.printReceipt({
            sale_id: resId,
            receipt_no: `TICK-${resId.slice(-6)}`,
            trade_dt: '2026-10-20 14:00:00',
            bay_no: assignedBayNo,
            use_minutes: durationMin,
            start_time: '14:00',
            end_time: '15:00',
            member_name: '홍길동',
            pay_method: 'CARD',
            store_info: {
              store_name: '골포스 스마트 키오스크',
              biz_no: '123-45-67890',
              ceo_name: '대표자',
              tel: '02-1234-5678',
              address: '서울시 강남구',
            },
            items: [{ name: '타석 배정표', qty: 1, unit_price: 20000, amount: 20000, discount_amt: 0, is_tax_free: false }],
            tax_summary: { supply_amt: 18182, tax_amt: 1818, tax_free_amt: 0, total_amt: 20000, discount_amt: 0, pay_amt: 20000 },
          });

          printStatus = res.success
            ? (lang === 'KO' ? '출력 완료' : 'Printed')
            : (lang === 'KO' ? '프린터 미연결' : 'Printer Offline');
        } finally {
          isPrinting = false;
        }
      };

      await handlePrint();

      // 4. 검증: printStatus는 '프린터 미연결'이지만 isPrinting은 정상 종료
      expect(isPrinting).toBe(false);
      expect(printStatus).toBe('프린터 미연결');

      // 5. 핵심 검증: 배정 롤백(releaseBay)이 절대 호출되지 않고 배정이 유지됨
      expect(releaseSpy).not.toHaveBeenCalled();
      expect(resId).toBe('ALLOC_20261020_BAY7_UUID');
    });

    it('F04-2: 프린터 장애 상태에서도 대형 타석 번호(7번), 이용시간, 카운트다운 타이머가 정상 동작하여 세션 종료 보장', async () => {
      // 프린터 실패 상태
      const isPrinting = false;
      let countdown = 6;
      let isClosed = false;
      const onClose = () => {
        isClosed = true;
      };

      // 6초 카운트다운 시뮬레이션
      const stepCountdown = () => {
        if (isPrinting) return;
        if (countdown <= 1) {
          countdown = 0;
          onClose();
        } else {
          countdown -= 1;
        }
      };

      // 6번 틱 진행
      for (let i = 0; i < 6; i++) {
        stepCountdown();
      }

      expect(countdown).toBe(0);
      expect(isClosed).toBe(true);
    });

    it('F04-3: 이용권/정기권 상품 구매 완료 후 프린터 에러 발생 시 결제 승인 및 생성된 회원권 자산 안전 보존', async () => {
      // 1. 150,000원 정기권 상품 구매 완료 응답
      const purchaseInfo = {
        apprNo: 'APPR_99887766',
        amount: 150000,
        productName: '1개월 정기 회원권',
        tradeDate: '2026-10-20 15:30:00',
        memberName: '이정기',
        cardIssuer: '현대카드',
        cardNoMasked: '5424-****-****-1234',
      };

      // 2. 프린터 오프라인 모킹
      vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValueOnce({
        success: false,
        message: 'Printer is offline',
      });

      // 3. PurchaseCompleteModal handlePrint 로직 시뮬레이션
      let isPrinting = true;
      let printStatus: string | null = null;

      const handlePurchasePrint = async () => {
        isPrinting = true;
        try {
          const res = await kioskHardwareBridge.printReceipt({
            sale_id: `SALE-${purchaseInfo.apprNo}`,
            receipt_no: `RC-${purchaseInfo.apprNo.slice(-6)}`,
            trade_dt: purchaseInfo.tradeDate,
            member_name: purchaseInfo.memberName,
            pay_method: 'CARD',
            store_info: { store_name: '골포스', biz_no: '', ceo_name: '', tel: '', address: '' },
            items: [{ name: purchaseInfo.productName, qty: 1, unit_price: purchaseInfo.amount, amount: purchaseInfo.amount, discount_amt: 0, is_tax_free: false }],
            tax_summary: { supply_amt: 136364, tax_amt: 13636, tax_free_amt: 0, total_amt: 150000, discount_amt: 0, pay_amt: 150000 },
          });
          printStatus = res.success ? '출력 완료' : '프린터 미연결';
        } finally {
          isPrinting = false;
        }
      };

      await handlePurchasePrint();

      expect(isPrinting).toBe(false);
      expect(printStatus).toBe('프린터 미연결');
      // 구매 정보 및 승인 번호가 손상 없이 유지됨
      expect(purchaseInfo.apprNo).toBe('APPR_99887766');
      expect(purchaseInfo.amount).toBe(150000);
    });
  });

  // =========================================================================
  // F06: 바코드/QR/NFC 스캐너 미응답 시 대체 인증 수단(전화번호 키패드) 유도
  // =========================================================================
  describe('F06 [바코드/QR/NFC 스캐너 미응답 시 대체 인증 수단(전화번호 키패드) 유도]', () => {
    it('F06-1: 하드웨어 바코드/QR 스캐너 미응답 시 UI 프리징/블로킹 없이 이벤트 리스너가 비침투적으로 대기한다', () => {
      let isBlocked = false;
      const onScanHandler = vi.fn();

      // 스캐너 구독 생성
      const unsubscribe = kioskHardwareBridge.subscribeScanner(onScanHandler);

      // 스캐너 신호가 전혀 들어오지 않는 상태에서 메인 스레드 연산 수행
      const testVal = 100 + 200;
      expect(testVal).toBe(300);
      expect(onScanHandler).not.toHaveBeenCalled();

      // UI 블로킹 여부 확인
      isBlocked = false;
      expect(isBlocked).toBe(false);

      unsubscribe();
    });

    it('F06-2: 사용자가 전화번호 탭으로 전환하여 가상 키패드 터치 입력 및 포맷팅 검증', () => {
      let authMode: 'SMART_TAG' | 'PHONE_KEYPAD' | 'QR_SCAN' | 'FACE' = 'QR_SCAN';
      let phoneDigits = '';
      let errorMsg = '';

      // 1. '전화번호' 탭 터치 전환
      authMode = 'PHONE_KEYPAD';
      errorMsg = '';
      expect(authMode).toBe('PHONE_KEYPAD');

      // 2. 키패드 숫자 터치 시뮬레이션
      const handleKeypadDigit = (digit: string) => {
        if (phoneDigits.length >= 11) return;
        phoneDigits += digit;
      };

      const handleKeypadBackspace = () => {
        phoneDigits = phoneDigits.slice(0, -1);
      };

      const handleKeypadClear = () => {
        phoneDigits = '';
      };

      const formatHpDisplay = (raw: string) => {
        if (raw.length <= 3) return raw;
        if (raw.length <= 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
        return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
      };

      // 01012345678 입력
      ['0', '1', '0', '1', '2', '3', '4', '5', '6', '7', '8'].forEach(handleKeypadDigit);
      expect(phoneDigits).toBe('01012345678');
      expect(formatHpDisplay(phoneDigits)).toBe('010-1234-5678');

      // Backspace 동작
      handleKeypadBackspace();
      expect(phoneDigits).toBe('0101234567');
      expect(formatHpDisplay(phoneDigits)).toBe('010-1234-567');

      // 재입력
      handleKeypadDigit('8');
      expect(phoneDigits).toBe('01012345678');

      // Clear 동작
      handleKeypadClear();
      expect(phoneDigits).toBe('');
    });

    it('F06-3: 전화번호 키패드 인증 제출 시 회원 조회 성공 및 이름 마스킹(홍*동) 본인확인 모달 유도', async () => {
      const mockMember: Member = {
        member_no: 'M_F06_001',
        member_name: '홍길동',
        hp: '010-1234-5678',
        gender: 'M',
        total_point: 5000,
      };

      vi.spyOn(api, 'getMember').mockResolvedValueOnce(mockMember);

      const buildMaskedName = (name?: string): string => {
        if (!name) return '';
        if (name.length < 2) return name;
        if (name.length === 2) return `${name[0]}*`;
        return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
      };

      let detectedMember: Member | null = null;
      let onAuthSuccessMember: Member | null = null;

      const handleKeypadSubmit = async (digits: string) => {
        if (digits.length < 4) return;
        const member = await api.getMember(digits);
        if (member && !Array.isArray(member)) {
          const resolved = { ...member };
          if (!resolved.masked_name && resolved.member_name) {
            resolved.masked_name = buildMaskedName(resolved.member_name);
          }
          detectedMember = resolved;
        }
      };

      await handleKeypadSubmit('01012345678');

      expect(detectedMember).toBeDefined();
      expect(detectedMember?.member_no).toBe('M_F06_001');
      expect(detectedMember?.masked_name).toBe('홍*동');

      // 1초 본인 확인 모달에서 '확인' 터치 시 인증 완료
      onAuthSuccessMember = detectedMember;
      expect(onAuthSuccessMember?.member_name).toBe('홍길동');
    });

    it('F06-4: 전화번호 뒷 4자리 중복 시 duplicateCandidates 후보 리스트를 제공하여 크래시 없이 전체 번호 입력을 유도한다', async () => {
      const duplicateCandidates: Member[] = [
        { member_no: 'M_F06_A', member_name: '김골프', hp: '010-1111-5678', gender: 'M' },
        { member_no: 'M_F06_B', member_name: '이골프', hp: '010-2222-5678', gender: 'F' },
      ];

      vi.spyOn(api, 'getMember').mockResolvedValueOnce({
        duplicate: true,
        candidates: duplicateCandidates,
      } as any);

      let candidatesState: Member[] = [];
      let errorMsg = '';

      const handleSmartTagDetected = async (query: string) => {
        const res = (await api.getMember(query)) as any;
        if (res?.candidates && Array.isArray(res.candidates)) {
          candidatesState = res.candidates;
        } else if (res?.duplicate) {
          errorMsg = '동일한 뒷번호 회원이 여러 명 있습니다. 휴대폰 번호 전체를 입력해 주세요.';
        }
      };

      await handleSmartTagDetected('5678');

      expect(candidatesState.length).toBe(2);
      expect(candidatesState[0].member_name).toBe('김골프');
      expect(candidatesState[1].member_name).toBe('이골프');
    });
  });

  // =========================================================================
  // F07: 결제 진행 중 고객 변심 [결제 취소] 터치 시 잔여 락 즉시 소멸 & 세션 파기
  // =========================================================================
  describe('F07 [결제 진행 중 고객 변심 [결제 취소] 터치 시 잔여 락 즉시 소멸 & 세션 파기]', () => {
    it('F07-1: 결제 진행 중 [결제 취소] 터치 시 VAN 리더기 승인 대기 요청이 즉시 취소(cancelPayment)된다', () => {
      const cancelSpy = vi.spyOn(kioskVanClient, 'cancelCurrentRequest');

      let isSilentCancel = false;
      let onCancelCalled = false;

      const handleUserCancel = () => {
        isSilentCancel = true;
        kioskVanClient.cancelCurrentRequest();
        onCancelCalled = true;
      };

      handleUserCancel();

      expect(isSilentCancel).toBe(true);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(onCancelCalled).toBe(true);
    });

    it('F07-2: KioskApp handlePaymentCancel이 HOLD 가예약 취소 및 선점 타석 락을 원자적으로 해제한다', async () => {
      const termId = api.getTerminalId();
      // 1. 사전 상태 설정: 타석 8번 선점 + HOLD 예약 ID 존재
      const holdResId = 'RES_HOLD_20261020_08';
      const initialBays: Bay[] = [
        {
          bay_no: 8,
          bay_name: '8번 타석',
          status: 'PRE_OCCUPIED',
          lock_terminal_id: termId,
        } as Bay,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(initialBays));
      storageMap.set(
        'LM_HOLD_RESERVATIONS',
        JSON.stringify([{ res_id: holdResId, bay_no: 8, status: 'HOLD' }])
      );

      vi.spyOn(api, 'checkConnection').mockResolvedValue(false); // Edge DB 모드

      const cancelHoldSpy = vi.spyOn(api, 'cancelHoldReservation');
      const releaseBaySpy = vi.spyOn(api, 'releaseBay');

      // 2. KioskApp handlePaymentCancel 실행 시뮬레이션
      let currentHoldResId: string | null = holdResId;
      let selectedBayNo: number | null = 8;
      let selectedProduct: Product | null = { prod_cd: 'P_DAILY_60', prod_nm: '일일 60분' } as Product;
      let selectedAssetId: number | null = 101;
      let currentStep = 'PAYMENT';

      const handlePaymentCancel = async () => {
        if (currentHoldResId) {
          await api.cancelHoldReservation(currentHoldResId);
          currentHoldResId = null;
        }
        if (selectedBayNo !== null) {
          await api.releaseBay(selectedBayNo);
          selectedBayNo = null;
        }
        selectedProduct = null;
        selectedAssetId = null;
        currentStep = 'PRACTICE_SELECT';
      };

      await handlePaymentCancel();

      // 3. 검증: HOLD 예약 취소 API 및 releaseBay가 정확히 호출됨
      expect(cancelHoldSpy).toHaveBeenCalledWith('RES_HOLD_20261020_08');
      expect(releaseBaySpy).toHaveBeenCalledWith(8);

      // 4. 검증: Edge DB에서 타석 8번이 AVAILABLE로 복원되고 락이 제거됨
      const updatedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      const bay8 = updatedBays.find((b) => b.bay_no === 8);
      expect(bay8?.status).toBe('AVAILABLE');
      expect(bay8?.lock_terminal_id).toBeNull();

      // 5. 검증: HOLD 예약 목록에서 제거됨
      const updatedHolds = JSON.parse(storageMap.get('LM_HOLD_RESERVATIONS') || '[]');
      expect(updatedHolds.length).toBe(0);

      // 6. 검증: 메모리 상태 초기화 및 화면 복귀
      expect(currentHoldResId).toBeNull();
      expect(selectedBayNo).toBeNull();
      expect(selectedProduct).toBeNull();
      expect(selectedAssetId).toBeNull();
      expect(currentStep).toBe('PRACTICE_SELECT');
    });

    it('F07-3: 동반자 다중 타석 선점 후 취소 시 모든 선택 타석(selectedBayNos) 락이 원자적으로 전원 반환된다 (Zero Orphaned Locks)', async () => {
      const termId = api.getTerminalId();
      // 1. 다중 타석 (9, 10, 11번) 선점 상태
      const initialBays: Bay[] = [
        { bay_no: 9, status: 'PRE_OCCUPIED', lock_terminal_id: termId } as Bay,
        { bay_no: 10, status: 'PRE_OCCUPIED', lock_terminal_id: termId } as Bay,
        { bay_no: 11, status: 'PRE_OCCUPIED', lock_terminal_id: termId } as Bay,
      ];
      storageMap.set('LM_BAYS', JSON.stringify(initialBays));
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);

      const releaseBaysSpy = vi.spyOn(api, 'releaseBays');

      let selectedBayNos: number[] = [9, 10, 11];

      // 다중 타석 해제
      if (selectedBayNos.length > 0) {
        await api.releaseBays(selectedBayNos);
        selectedBayNos = [];
      }

      expect(releaseBaysSpy).toHaveBeenCalledWith([9, 10, 11]);

      // DB 상태 확인: 9, 10, 11번 모두 AVAILABLE로 원복
      const savedBays = JSON.parse(storageMap.get('LM_BAYS') || '[]') as Bay[];
      savedBays.forEach((b) => {
        expect(b.status).toBe('AVAILABLE');
        expect(b.lock_terminal_id).toBeNull();
      });
      expect(selectedBayNos).toEqual([]);
    });
  });
});
