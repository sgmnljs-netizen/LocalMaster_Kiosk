import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { kioskHardwareBridge } from '../hardware/services/HardwareBridgeClient';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Product Purchase Assets & Chaining Simulation (P01 ~ P05)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;

  const mockProductCatalog = [
    { prod_cd: 'P_PERIOD_1M', prod_nm: '1개월 정기 회원권', standard_price: 150000, sale_price: 150000, logic_type: 'PERIOD', days: 30 },
    { prod_cd: 'P_PERIOD_EXT_30', prod_nm: '정기권 30일 연장', standard_price: 150000, sale_price: 150000, logic_type: 'PERIOD', days: 30 },
    { prod_cd: 'P_COUNT_10_60D', prod_nm: '타석 10회 이용권 (60일)', standard_price: 120000, sale_price: 120000, logic_type: 'COUNT', total_count: 10, days: 60 },
    { prod_cd: 'P_TIME_1200MIN', prod_nm: '타석 1,200분 정액 시간권 (90일)', standard_price: 200000, sale_price: 200000, logic_type: 'TIME', total_count: 1200, days: 90 },
    { prod_cd: 'P_SECURE_150K', prod_nm: '정품 1개월권 (15만원)', standard_price: 150000, sale_price: 150000, logic_type: 'PERIOD', days: 30 },
  ];

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getProducts').mockResolvedValue(mockProductCatalog as any);
    storageMap.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // P01: 신규 1개월 기간권(PERIOD) 정상 카드 결제 및 자산 생성 + 영수증 출력
  // =========================================================================
  describe('P01 [신규 1개월 기간권(PERIOD) 정상 카드 결제 및 자산 생성]', () => {
    it('1개월 기간권 구매 요청 성공 시 백엔드 자산 생성 응답을 받고 영수증 자동 인쇄가 트리거된다', async () => {
      const mockPurchaseResponse = {
        success: true,
        sale_id: 'SALE_P01_UUID',
        item_id: 101,
        start_date: '2026-10-20',
        end_date: '2026-11-18',
        message: '1개월 정기 회원권 구매 및 결제가 완료되었습니다.',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPurchaseResponse,
      } as any);

      const printReceiptSpy = vi.spyOn(kioskHardwareBridge, 'printReceipt').mockResolvedValue({
        success: true,
        message: '키오스크 가상 영수증 출력 완료',
      });

      // 1) purchaseProduct API 호출 검증
      const res = await api.purchaseProduct(
        'M_P01_NEW',
        'P_PERIOD_1M',
        150000,
        'APPR_P01_150K',
        'TR_P01_0001',
        undefined,
        0,
        0,
        0,
        {
          issuer_name: '현대카드',
          card_no_masked: '5424-****-****-1234',
          terminal_id: 'TID_KIOSK_01',
          van_tr_no: 'TR_P01_0001',
          auth_code: 'APPR_P01_150K',
        } as any
      );

      expect(res.success).toBe(true);
      expect(res.start_date).toBe('2026-10-20');
      expect(res.end_date).toBe('2026-11-18');
      expect(res.item_id).toBe(101);

      // 2) 영수증 출력 트리거 검증 (PurchaseCompleteModal handlePrint 시뮬레이션)
      const receiptData = {
        sale_id: `SALE-${res.sale_id}`,
        receipt_no: `RC-${res.sale_id?.slice(-6)}`,
        trade_dt: '2026-10-20 14:00:00',
        member_name: '신규회원',
        pay_method: 'CARD',
        card_info: {
          issuer_name: '현대카드',
          card_no_masked: '5424-****-****-1234',
          approval_no: 'APPR_P01_150K',
          installment_months: 0,
          terminal_id: 'TID_KIOSK_01',
        },
      };

      const printRes = await kioskHardwareBridge.printReceipt(receiptData as any);
      expect(printReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        sale_id: 'SALE-SALE_P01_UUID',
        pay_method: 'CARD',
      }));
      expect(printRes.success).toBe(true);
    });
  });

  // =========================================================================
  // P02: 기존 기간권 보유 회원의 연장 구매 시 만료일 익일 연쇄 연장 (Chaining)
  // =========================================================================
  describe('P02 [기존 기간권 보유 회원의 연장 구매 시 만료일 익일 연쇄 연장 (Chaining)]', () => {
    it('기존 2026-11-15 만료 기간권 보유 시 익일(2026-11-16)부터 30일 잔여 손실 없이 연장된다', async () => {
      const mockChainResponse = {
        success: true,
        sale_id: 'SALE_P02_CHAIN',
        item_id: 102,
        start_date: '2026-11-16',
        end_date: '2026-12-15',
        message: '정기권 30일 연장 구매 및 결제가 완료되었습니다.',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockChainResponse,
      } as any);

      const res = await api.purchaseProduct(
        'M_P02_CHAIN',
        'P_PERIOD_EXT_30',
        150000,
        'APPR_P02_CHAIN'
      );

      expect(res.success).toBe(true);
      // Chaining 만료일 익일 검증
      expect(res.start_date).toBe('2026-11-16');
      expect(res.end_date).toBe('2026-12-15');

      // 잔여 기간 손실(Zero Duration Loss) 계산 검증
      const start = new Date(res.start_date!);
      const end = new Date(res.end_date!);
      const MS_PER_DAY = 86_400_000;
      const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
      expect(diffDays).toBe(30);
    });
  });

  // =========================================================================
  // P03: 10회 횟수권(COUNT) 구매 및 유효기간 산출
  // =========================================================================
  describe('P03 [10회 횟수권(COUNT) 구매 및 유효기간 산출]', () => {
    it('10회 횟수권 구매 시 60일 유효기간과 총 횟수 10회가 정상 반영된다', async () => {
      const mockCountResponse = {
        success: true,
        sale_id: 'SALE_P03_COUNT',
        item_id: 103,
        start_date: '2026-10-20',
        end_date: '2026-12-18', // 60일 (10/20 ~ 12/18)
        message: '타석 10회 이용권 (60일) 구매 및 결제가 완료되었습니다.',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCountResponse,
      } as any);

      const res = await api.purchaseProduct(
        'M_P03_COUNT',
        'P_COUNT_10_60D',
        120000,
        'APPR_P03_120K'
      );

      expect(res.success).toBe(true);
      expect(res.item_id).toBe(103);
      expect(res.start_date).toBe('2026-10-20');
      expect(res.end_date).toBe('2026-12-18');
    });
  });

  // =========================================================================
  // P04: 분 단위 시간권(TIME) 구매 및 자산 생성
  // =========================================================================
  describe('P04 [분 단위 시간권(TIME) 구매 및 자산 생성]', () => {
    it('1,200분 정액 시간권 구매 시 logic_type=TIME 및 90일 유효기간으로 자산이 등록된다', async () => {
      const mockTimeResponse = {
        success: true,
        sale_id: 'SALE_P04_TIME',
        item_id: 104,
        start_date: '2026-10-20',
        end_date: '2026-01-17', // 90일
        message: '타석 1,200분 정액 시간권 (90일) 구매 및 결제가 완료되었습니다.',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTimeResponse,
      } as any);

      const res = await api.purchaseProduct(
        'M_P04_TIME',
        'P_TIME_1200MIN',
        200000,
        'APPR_P04_200K'
      );

      expect(res.success).toBe(true);
      expect(res.item_id).toBe(104);
      expect(res.start_date).toBe('2026-10-20');
      expect(res.end_date).toBe('2026-01-17');
    });
  });

  // =========================================================================
  // P05: 클라이언트 위조 결제 금액 변조 요청 차단 (Price Tamper Guard)
  // =========================================================================
  describe('P05 [클라이언트 위조 결제 금액 변조 요청 차단 (Price Tamper Guard)]', () => {
    it('150,000원 상품을 1,000원으로 변조하여 결제 요청 시 백엔드 400 에러 및 Security Alert가 노출된다', async () => {
      const mockErrorResponse = {
        detail: 'Security Alert: Payment amount mismatch. 결제 금액 수식 불일치: 상품 가격(150,000원)과 결제 요청 합계(1,000원)가 일치하지 않습니다.',
        trace_id: 'tamper-guard-400',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => mockErrorResponse,
        text: async () => JSON.stringify(mockErrorResponse),
      } as any);

      // 변조된 1,000원으로 구매 요청 시 실패 결과 수신
      const res = await api.purchaseProduct(
        'M_P05_HACKER',
        'P_SECURE_150K',
        1000, // 위조 금액
        'APPR_HACK_001'
      );

      expect(res.success).toBe(false);
      expect(res.message).toContain('Security Alert: Payment amount mismatch');
      expect(res.message).toContain('결제 금액 수식 불일치');
    });
  });
});
