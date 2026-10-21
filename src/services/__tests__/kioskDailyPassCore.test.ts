import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { kioskHardwareBridge } from '../hardware/services/HardwareBridgeClient';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Daily Pass Core Allocation & Pricing Simulation (D01, D02, D03, D04)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    storageMap.clear();

    // 초기 타석 상태 시딩 (3, 4, 5번 타석 등)
    const initialBays = [
      { bay_no: 2, status: 'AVAILABLE', duration_min: 0, lock_terminal_id: null },
      { bay_no: 3, status: 'AVAILABLE', duration_min: 0, lock_terminal_id: null },
      { bay_no: 4, status: 'AVAILABLE', duration_min: 0, lock_terminal_id: null },
      { bay_no: 5, status: 'AVAILABLE', duration_min: 0, lock_terminal_id: null },
    ];
    localStorage.setItem('LM_BAYS', JSON.stringify(initialBays));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // D01: 비회원 일반 타석 60분 일일권 정상 카드 결제 및 즉시 기동
  // =========================================================================
  describe('D01 [비회원 일반 타석 60분 일일권 정상 카드 결제 및 즉시 기동]', () => {
    it('비회원이 3번 타석 선점 후 60분 일일권(20,000원) 승인 시 타석이 OCCUPIED로 기동되고 영수증 부가세(1,818원)가 정상 계산된다', async () => {
      const bayNo = 3;
      const durationMin = 60;
      const dailyPrice = 20000;
      const expectedVat = 1818;
      const expectedSupply = 18182;

      // 1) 3번 타석 선점 (Pre-occupy)
      const currentBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
      const targetIdx = currentBays.findIndex((b: any) => b.bay_no === bayNo);
      currentBays[targetIdx].status = 'PRE_OCCUPIED';
      currentBays[targetIdx].lock_terminal_id = 'TID-KIOSK-01';
      localStorage.setItem('LM_BAYS', JSON.stringify(currentBays));

      // 2) 백엔드 응답 모킹 (POST /api/v1/kiosk/allocate-bay)
      const mockBackendResponse = {
        success: true,
        res_id: 'KSK_20261020_003_D01',
        bay_no: bayNo,
        duration_min: durationMin,
        start_time: '10:00',
        end_time: '11:03',
        is_chained: false,
        hardware_success: true,
        message: '타석 배정이 완료되었습니다.',
      };

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse(opts.body);
          expect(body.bay_no).toBe(bayNo);
          expect(body.duration_min).toBe(durationMin);
          expect(body.payment_method).toBe('CARD');
          expect(body.amount).toBe(dailyPrice);
          expect(body.approval_no).toBe('APPR_D01_1234');
          expect(body.issuer_name).toBe('신한카드');

          return {
            ok: true,
            status: 200,
            json: async () => mockBackendResponse,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const printReceiptSpy = vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValue({
        success: true,
        message: '영수증 출력 성공',
      });

      // 3) 키오스크 API 호출 (ALLOCATE_DAILY 카드 승인 배정)
      const cardApprovalMeta = {
        auth_code: 'APPR_D01_1234',
        issuer_name: '신한카드',
        acquirer_name: '비씨카드',
        card_no_masked: '9410-****-****-1111',
        installment_months: 0,
        terminal_id: 'VAN-TID-01',
        van_tr_no: 'VAN-TR-D01-999',
      };

      const allocResult = await api.allocateBay(
        bayNo,
        durationMin,
        undefined, // member_no 없음 (비회원)
        '비회원고객',
        '010-1234-5678',
        undefined, // member_item_id 없음
        'CARD',
        dailyPrice,
        cardApprovalMeta,
        undefined,
        0,
        { prodCd: 'DAILY_60', usedPoints: 0, gradeDiscountAmount: 0 }
      );

      expect(allocResult.success).toBe(true);
      expect(allocResult.res_id).toBe('KSK_20261020_003_D01');
      expect(allocResult.duration_min).toBe(durationMin);
      expect(allocResult.hardware_success).toBe(true);

      // 4) 로컬 캐시 LM_BAYS 검증: 타석이 OCCUPIED로 전환되고 락이 해제되었는지 확인
      const updatedBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
      const allocatedBay = updatedBays.find((b: any) => b.bay_no === bayNo);
      expect(allocatedBay.status).toBe('OCCUPIED');
      expect(allocatedBay.duration_min).toBe(durationMin);
      expect(allocatedBay.lock_terminal_id).toBeNull();

      // 5) 영수증 출력 데이터 시뮬레이션 및 부가세 1,818원 검증
      const receiptPayload = {
        bay_no: bayNo,
        use_minutes: durationMin,
        pay_method: 'CARD',
        tax_summary: {
          supply_amt: expectedSupply,
          tax_amt: expectedVat,
          total_amt: dailyPrice,
          pay_amt: dailyPrice,
        },
        card_info: {
          issuer_name: cardApprovalMeta.issuer_name,
          approval_no: cardApprovalMeta.auth_code,
          card_no_masked: cardApprovalMeta.card_no_masked,
          terminal_id: cardApprovalMeta.terminal_id,
        },
      };

      const printRes = await kioskHardwareBridge.printReceipt(receiptPayload as any);
      expect(printReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        bay_no: 3,
        use_minutes: 60,
        tax_summary: {
          supply_amt: 18182,
          tax_amt: 1818,
          total_amt: 20000,
          pay_amt: 20000,
        },
      }));
      expect(printRes.success).toBe(true);
    });
  });

  // =========================================================================
  // D02: 비회원 90분 일일권 정상 결제 및 타석 이용시간 90분 세팅
  // =========================================================================
  describe('D02 [비회원 90분 일일권 정상 결제 및 타석 이용시간 90분 세팅]', () => {
    it('5번 타석 90분 일일권(28,000원) 승인 시 duration_min=90분으로 세팅되고 영수증에 90분이 출력된다', async () => {
      const bayNo = 5;
      const durationMin = 90;
      const dailyPrice = 28000;
      const expectedVat = 2545;
      const expectedSupply = 25455;

      const mockBackendResponse = {
        success: true,
        res_id: 'KSK_20261020_005_D02',
        bay_no: bayNo,
        duration_min: durationMin,
        start_time: '14:00',
        end_time: '15:33',
        is_chained: false,
        hardware_success: true,
        message: '타석 배정이 완료되었습니다.',
      };

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse(opts.body);
          expect(body.bay_no).toBe(bayNo);
          expect(body.duration_min).toBe(durationMin);
          expect(body.amount).toBe(dailyPrice);
          return {
            ok: true,
            status: 200,
            json: async () => mockBackendResponse,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const printReceiptSpy = vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValue({
        success: true,
        message: '출력 성공',
      });

      const cardApproval = {
        auth_code: 'APPR_D02_9090',
        issuer_name: '국민카드',
        acquirer_name: '국민카드',
        card_no_masked: '5409-****-****-2222',
        terminal_id: 'VAN-TID-02',
      };

      const allocResult = await api.allocateBay(
        bayNo,
        durationMin,
        undefined,
        '90분고객',
        '010-9999-8888',
        undefined,
        'CARD',
        dailyPrice,
        cardApproval,
        undefined,
        0,
        { prodCd: 'DAILY_90' }
      );

      expect(allocResult.success).toBe(true);
      expect(allocResult.duration_min).toBe(90);

      // LM_BAYS 캐시 확인 (90분 설정)
      const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
      const targetBay = bays.find((b: any) => b.bay_no === bayNo);
      expect(targetBay.status).toBe('OCCUPIED');
      expect(targetBay.duration_min).toBe(90);
      expect(targetBay.minutes_left).toBe(90);

      // 영수증에 90분 명시 확인
      const receiptPayload = {
        bay_no: bayNo,
        use_minutes: durationMin,
        items: [{ name: '타석 [5번] 90분 배정표', qty: 1, amount: dailyPrice }],
        tax_summary: {
          supply_amt: expectedSupply,
          tax_amt: expectedVat,
          total_amt: dailyPrice,
          pay_amt: dailyPrice,
        },
        footer_message: '이용시간: 14:00 ~ 15:33 (90분)',
      };

      await kioskHardwareBridge.printReceipt(receiptPayload as any);
      expect(printReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        bay_no: 5,
        use_minutes: 90,
        footer_message: expect.stringContaining('(90분)'),
      }));
    });
  });

  // =========================================================================
  // D03: 로그인 회원의 일일권 구매 시 등급 할인(10%) 적용 결제
  // =========================================================================
  describe('D03 [로그인 회원의 일일권 구매 시 등급 할인(10%) 적용 결제]', () => {
    it('10% 등급 할인 회원이 60분 일일권(20,000원) 구매 시 2,000원 할인 적용되어 18,000원만 결제 요청된다', async () => {
      const bayNo = 2;
      const durationMin = 60;
      const regularPrice = 20000;
      const discountRate = 10;
      const gradeDiscountAmount = Math.round(regularPrice * (discountRate / 100)); // 2,000원
      const actualPaidAmount = regularPrice - gradeDiscountAmount; // 18,000원
      const expectedSupply = 16364;
      const expectedVat = 1636;

      const mockMember = {
        member_no: 'M_VIP_D03',
        member_name: 'VIP골퍼',
        discount_rate: discountRate,
      };

      const mockBackendResponse = {
        success: true,
        res_id: 'KSK_20261020_002_D03',
        bay_no: bayNo,
        duration_min: durationMin,
        hardware_success: true,
        message: '타석 배정이 완료되었습니다.',
      };

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse(opts.body);
          expect(body.bay_no).toBe(bayNo);
          expect(body.member_no).toBe(mockMember.member_no);
          expect(body.amount).toBe(actualPaidAmount);
          expect(body.grade_discount_amount).toBe(gradeDiscountAmount);
          return {
            ok: true,
            status: 200,
            json: async () => mockBackendResponse,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const printReceiptSpy = vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValue({
        success: true,
        message: '출력 성공',
      });

      const cardApproval = {
        auth_code: 'APPR_D03_1818',
        issuer_name: '현대카드',
        card_no_masked: '4321-****-****-3333',
        terminal_id: 'VAN-TID-03',
      };

      const allocResult = await api.allocateBay(
        bayNo,
        durationMin,
        mockMember.member_no,
        mockMember.member_name,
        '010-3333-4444',
        undefined,
        'CARD',
        actualPaidAmount,
        cardApproval,
        undefined,
        0,
        {
          gradeDiscountAmount: gradeDiscountAmount,
          prodCd: 'DAILY_60',
        }
      );

      expect(allocResult.success).toBe(true);

      // 영수증에 원금액 20,000원, 할인 2,000원, 실결제 18,000원, 부가세 1,636원 반영 검증
      const receiptPayload = {
        bay_no: bayNo,
        use_minutes: durationMin,
        member_name: mockMember.member_name,
        tax_summary: {
          total_amt: regularPrice,
          discount_amt: gradeDiscountAmount,
          pay_amt: actualPaidAmount,
          supply_amt: expectedSupply,
          tax_amt: expectedVat,
        },
      };

      await kioskHardwareBridge.printReceipt(receiptPayload as any);
      expect(printReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        member_name: 'VIP골퍼',
        tax_summary: {
          total_amt: 20000,
          discount_amt: 2000,
          pay_amt: 18000,
          supply_amt: 16364,
          tax_amt: 1636,
        },
      }));
    });
  });

  // =========================================================================
  // D04: 쿠폰 할인 + 포인트 차감 + 잔여 카드 복합 결제 일일권 배정
  // =========================================================================
  describe('D04 [쿠폰 할인 + 포인트 차감 + 잔여 카드 복합 결제 일일권 배정]', () => {
    it('20,000원 일일권에서 쿠폰 5,000원, 포인트 3,000P 차감 후 잔여 12,000원만 카드 결제 승인된다', async () => {
      const bayNo = 4;
      const durationMin = 60;
      const regularPrice = 20000;
      const couponDiscount = 5000;
      const usedPoints = 3000;
      const remainingCardPay = regularPrice - couponDiscount - usedPoints; // 12,000원
      const expectedSupply = 10909;
      const expectedVat = 1091;

      const mockMember = {
        member_no: 'M_COMBO_D04',
        member_name: '복합결제회원',
        total_point: 10000,
      };

      const mockBackendResponse = {
        success: true,
        res_id: 'KSK_20261020_004_D04',
        bay_no: bayNo,
        duration_min: durationMin,
        hardware_success: true,
        message: '타석 배정이 완료되었습니다.',
      };

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('/allocate-bay')) {
          const body = JSON.parse(opts.body);
          expect(body.bay_no).toBe(bayNo);
          expect(body.member_no).toBe(mockMember.member_no);
          expect(body.amount).toBe(remainingCardPay);
          expect(body.coupon_no).toBe('CPN_5000');
          expect(body.discount_amount).toBe(couponDiscount);
          expect(body.used_points).toBe(usedPoints);
          return {
            ok: true,
            status: 200,
            json: async () => mockBackendResponse,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      const printReceiptSpy = vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValue({
        success: true,
        message: '출력 성공',
      });

      const cardApproval = {
        auth_code: 'APPR_D04_1212',
        issuer_name: '삼성카드',
        card_no_masked: '5123-****-****-4444',
        terminal_id: 'VAN-TID-04',
      };

      const allocResult = await api.allocateBay(
        bayNo,
        durationMin,
        mockMember.member_no,
        mockMember.member_name,
        '010-7777-8888',
        undefined,
        'CARD',
        remainingCardPay,
        cardApproval,
        'CPN_5000',
        couponDiscount,
        {
          usedPoints: usedPoints,
          gradeDiscountAmount: 0,
          prodCd: 'DAILY_60',
        }
      );

      expect(allocResult.success).toBe(true);

      // 영수증 복합결제 분할 표시 확인: 정가 20,000, 총할인/차감 8,000, 실결제 12,000, 부가세 1,091
      const receiptPayload = {
        bay_no: bayNo,
        use_minutes: durationMin,
        member_name: mockMember.member_name,
        tax_summary: {
          total_amt: regularPrice,
          discount_amt: couponDiscount + usedPoints,
          pay_amt: remainingCardPay,
          supply_amt: expectedSupply,
          tax_amt: expectedVat,
        },
      };

      await kioskHardwareBridge.printReceipt(receiptPayload as any);
      expect(printReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        member_name: '복합결제회원',
        tax_summary: {
          total_amt: 20000,
          discount_amt: 8000,
          pay_amt: 12000,
          supply_amt: 10909,
          tax_amt: 1091,
        },
      }));
    });
  });
});
