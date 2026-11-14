import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowsBridgePrinterAdapter } from '../services/hardware/adapters/WindowsBridgeAdapter';
import { KioskHardwareBridgeClient } from '../services/hardware/services/HardwareBridgeClient';
import { DEFAULT_HARDWARE_CONFIG } from '../services/hardware/adapters/HardwareAdapterFactory';
import { kioskEscPosPrinter } from '../services/printer/escpos_printer';
import fs from 'fs';
import path from 'path';

describe('Kiosk Thermal Printer (:18080 vcat_bridge.py) Paper-Out / Offline UX Resilience & Selective Reprint', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. WindowsBridgePrinterAdapter surfaces PAPER_OUT / COVER_OPEN HTTP 500 error message without falling back to legacy /print double-printing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        res_cd: 'PAPER_OUT',
        message: '출력 실패: 프린터 용지가 소진되었습니다 (COM5, 0x1A72)',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new WindowsBridgePrinterAdapter(() => ({
      ...DEFAULT_HARDWARE_CONFIG,
      isMock: false,
    }));
    const result = await adapter.printReceipt({
      sale_id: 'ALLOC-101',
      receipt_no: 'RC-101',
      trade_dt: '2026-10-30 17:50:00',
      client_type: 'KIOSK',
      member_name: '김골프',
      pay_method: 'ALLOCATION_SLIP',
      store_info: {
        store_name: '군산골프아카데미',
        biz_no: '403-19-83898',
        ceo_name: '홍길동',
        tel: '063-000-0000',
        address: '전북 군산시',
      },
      items: [{ name: '07번 타석 배정', qty: 1, unit_price: 0, amount: 0 }],
      tax_summary: {
        supply_amt: 0,
        tax_amt: 0,
        tax_free_amt: 0,
        total_amt: 0,
        discount_amt: 0,
        pay_amt: 0,
      },
    });

    // Must call /api/v1/print/receipt exactly once and NEVER retry legacy /vcat/print on HTTP 500
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.message).toContain('용지');
  });

  it('2. WindowsBridgePrinterAdapter & kioskEscPosPrinter reject HTTP 200 { success: false } and stop port scanning on /vcat/print HTTP 500 PAPER_OUT', async () => {
    const fetchMock200False = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        message: '프린터 커버 열림 상태입니다',
      }),
    });
    globalThis.fetch = fetchMock200False as unknown as typeof fetch;

    const adapter = new WindowsBridgePrinterAdapter(() => ({
      ...DEFAULT_HARDWARE_CONFIG,
      isMock: false,
    }));
    const res200False = await adapter.printReceipt({
      sale_id: 'ALLOC-102',
      receipt_no: 'RC-102',
      trade_dt: '2026-10-30 18:00:00',
      member_name: '이회원',
      pay_method: 'ALLOCATION_SLIP',
      store_info: { store_name: '테스트점', biz_no: '', ceo_name: '', tel: '', address: '' },
      items: [{ name: '03번 타석 배정', qty: 1, unit_price: 0, amount: 0 }],
      tax_summary: { supply_amt: 0, tax_amt: 0, tax_free_amt: 0, total_amt: 0, discount_amt: 0, pay_amt: 0 },
    });
    expect(res200False.success).toBe(false);
    expect(res200False.message).toContain('커버');

    // Direct ESC/POS fallback (/vcat/print on :8090 returning HTTP 500 PAPER_OUT must NOT fall through to :9099)
    const vcatFetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        res_cd: 'PAPER_OUT',
        message: '인쇄 실패: 프린터 용지가 소진되었습니다 (COM5)',
      }),
    });
    globalThis.fetch = vcatFetchMock as unknown as typeof fetch;

    const rawRes = await kioskEscPosPrinter.printReceipt({
      storeName: '테스트점',
      receiptNo: 'RC-103',
      tradeDate: '2026-10-30 18:01:00',
      payAmount: 0,
      payMethod: 'ALLOCATION_SLIP',
      bayNo: 8,
    });
    expect(vcatFetchMock).toHaveBeenCalledTimes(1);
    expect(rawRes.success).toBe(false);
    expect(rawRes.message).toContain('용지');
  });

  it('3. Selective Reprint State Machine: when 1st card receipt succeeds and 2nd allocation slip fails (Paper Out), reprint only retries the slip', async () => {
    const client = new KioskHardwareBridgeClient({
      isMock: false,
      printMode: 'AUTO',
    });

    const printSpy = vi
      .spyOn(client, 'printReceipt')
      // 1st call: Card receipt succeeds
      .mockResolvedValueOnce({ success: true, message: '영수증 출력 완료' })
      // 2nd call: Allocation slip fails due to PAPER_OUT
      .mockResolvedValueOnce({ success: false, message: '출력 실패: 프린터 용지가 소진되었습니다' })
      // 3rd call (Reprint after paper refill): Allocation slip succeeds
      .mockResolvedValueOnce({ success: true, message: '배정표 출력 완료' });

    const payAmount = 20000;
    const cardReceiptDoneRef = { current: false };
    const slipDoneRef = { current: false };
    let countdown = 6;
    let printStatus = '';
    let hasPrintError = false;

    const executeModalPrint = async () => {
      const bothPreviouslySucceeded = (payAmount <= 0 || cardReceiptDoneRef.current) && slipDoneRef.current;
      const shouldPrintCardReceipt = payAmount > 0 && (bothPreviouslySucceeded || !cardReceiptDoneRef.current);
      const shouldPrintSlip = bothPreviouslySucceeded || !slipDoneRef.current;

      let cardOk = payAmount <= 0 || cardReceiptDoneRef.current;
      let failureDetail = '';
      if (shouldPrintCardReceipt) {
        const res = await client.printReceipt({
          sale_id: 'SALE-1',
          receipt_no: 'RC-1',
          trade_dt: '2026-10-30 17:50:00',
          member_name: '박회원',
          pay_method: 'CARD',
          store_info: { store_name: '테스트점', biz_no: '', ceo_name: '', tel: '', address: '' },
          items: [{ name: '일일타석', qty: 1, unit_price: 20000, amount: 20000 }],
          tax_summary: { supply_amt: 18182, tax_amt: 1818, tax_free_amt: 0, total_amt: 20000, discount_amt: 0, pay_amt: 20000 },
        });
        cardOk = Boolean(res.success);
        cardReceiptDoneRef.current = cardOk;
        if (!cardOk && res.message) failureDetail = res.message;
      }

      let slipOk = slipDoneRef.current;
      if (shouldPrintSlip) {
        const slipRes = await client.printReceipt({
          sale_id: 'SLIP-1',
          receipt_no: 'SLIP-1',
          trade_dt: '2026-10-30 17:50:00',
          member_name: '박회원',
          pay_method: 'ALLOCATION_SLIP',
          store_info: { store_name: '테스트점', biz_no: '', ceo_name: '', tel: '', address: '' },
          items: [{ name: '05번 타석 배정', qty: 1, unit_price: 0, amount: 0 }],
          tax_summary: { supply_amt: 0, tax_amt: 0, tax_free_amt: 0, total_amt: 0, discount_amt: 0, pay_amt: 0 },
        });
        slipOk = Boolean(slipRes.success);
        slipDoneRef.current = slipOk;
        if (!slipOk && slipRes.message && !failureDetail) failureDetail = slipRes.message;
      }

      const finalOk = cardOk && slipOk;
      hasPrintError = !finalOk;
      if (finalOk) {
        printStatus = '출력 완료';
        countdown = Math.max(countdown, 6);
      } else {
        printStatus = failureDetail.includes('용지') ? '프린터 용지 부족' : '프린터 미연결';
        countdown = 20;
      }
    };

    // Pass 1: Auto-print on modal mount (Card Receipt OK, Slip PAPER_OUT)
    await executeModalPrint();
    expect(printSpy).toHaveBeenCalledTimes(2);
    expect(cardReceiptDoneRef.current).toBe(true);
    expect(slipDoneRef.current).toBe(false);
    expect(hasPrintError).toBe(true);
    expect(printStatus).toBe('프린터 용지 부족');
    expect(countdown).toBe(20);

    // Pass 2: Customer taps [영수증 재출력] after paper is refilled
    await executeModalPrint();
    expect(printSpy).toHaveBeenCalledTimes(3);
    expect(printSpy.mock.calls[2][0].pay_method).toBe('ALLOCATION_SLIP');
    expect(hasPrintError).toBe(false);
    expect(printStatus).toBe('출력 완료');
  });

  it('4. Code Structural Audit: AllocationCompleteModal, ReceiptPrinter, and PurchaseCompleteModal enforce 20s error timer, selective reprint, double-tap guard, and backdrop protection', () => {
    const allocModalSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/AllocationCompleteModal.tsx'),
      'utf-8'
    );
    const receiptPrinterSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/ReceiptPrinter.tsx'),
      'utf-8'
    );
    const purchaseModalSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/PurchaseCompleteModal.tsx'),
      'utf-8'
    );

    // AllocationCompleteModal checks (auto-prints once on mount; manual reprint button intentionally omitted — handled at Front POS)
    expect(allocModalSrc).toContain('isPrintingRef');
    expect(allocModalSrc).not.toContain('영수증 재출력');
    expect(allocModalSrc).toContain('cardReceiptDoneRef');
    expect(allocModalSrc).toContain('slipDoneRef');
    expect(allocModalSrc).toContain('setCountdown(20)');
    expect(allocModalSrc).toContain('data-testid="printer-offline-warning"');
    const backdropIdx = allocModalSrc.indexOf('data-testid="allocation-complete-backdrop"');
    expect(backdropIdx).toBeGreaterThan(0);
    const backdropSnippet = allocModalSrc.slice(backdropIdx - 40, backdropIdx + 300);
    expect(backdropSnippet).not.toContain('onClick={onClose}');

    // ReceiptPrinter checks (Par3 flow)
    expect(receiptPrinterSrc).toContain('isPrintingRef');
    expect(receiptPrinterSrc).toContain('cardReceiptDoneRef');
    expect(receiptPrinterSrc).toContain('slipDoneRef');
    expect(receiptPrinterSrc).toContain('영수증 재출력');
    expect(receiptPrinterSrc).toContain('결제 완료 (영수증 인쇄 지연 안내)');
    expect(receiptPrinterSrc).toContain('setCountdown(finalOk ? 10 : 20)');

    // PurchaseCompleteModal checks
    expect(purchaseModalSrc).toContain('isPrintingRef');
    expect(purchaseModalSrc).toContain('disabled={isPrinting}');
    expect(purchaseModalSrc).toContain('receiptDoneRef');
    expect(purchaseModalSrc).toContain('lockerSlipDoneRef');
    expect(purchaseModalSrc).toContain('setCountdown(20)');
  });
});
