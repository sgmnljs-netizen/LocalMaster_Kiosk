import { describe, it, expect, vi } from 'vitest';
import {
  buildKioskBayAllocationSlipPayload,
  buildKioskLockerSlipPayload,
  formatKioskHhMm,
  formatKioskYmd,
} from '../kioskSlipPrinter';
import { KioskHardwareBridgeClient } from '../../services/hardware/services/HardwareBridgeClient';
import { HardwareAdapterFactory } from '../../services/hardware/adapters/HardwareAdapterFactory';
import { WindowsBridgePrinterAdapter } from '../../services/hardware/adapters/WindowsBridgeAdapter';
import { kioskEscPosPrinter } from '../../services/printer/escpos_printer';

describe('kioskSlipPrinter & KioskHardwareBridgeClient FIFO Queue', () => {
  const mockStoreInfo = {
    store_name: '국립군산대학교 골프학습장',
    biz_no: '401-83-01667',
    ceo_name: '엄기욱',
    tel: '063-469-4114',
    address: '전북 군산시 대학로 558',
  };

  it('formats time and date strings accurately', () => {
    expect(formatKioskHhMm('1430')).toBe('14:30');
    expect(formatKioskHhMm('14:30:00')).toBe('14:30');
    expect(formatKioskYmd('20261029')).toBe('2026-10-29');
    expect(formatKioskYmd('2026-10-29T00:00:00')).toBe('2026-10-29');
  });

  it('builds bay allocation slip payload with ALLOCATION_SLIP and zero tax fields', () => {
    const payload = buildKioskBayAllocationSlipPayload({
      bayNo: 7,
      floor: '2F',
      resId: 'RES-20261029-001',
      memberName: '홍길동',
      memberNo: 'M00123',
      productName: '1개월 종일 회원권',
      actionLabel: '회원권 타석 배정',
      durationMin: 70,
      startTime: '14:00',
      endTime: '15:10',
      remainInfo: '유효만료: 2026-11-28',
      storeInfo: mockStoreInfo,
      tradeDt: '2026-10-29 14:00:00',
    });

    expect(payload.pay_method).toBe('ALLOCATION_SLIP');
    expect(payload.client_type).toBe('KIOSK');
    expect(payload.tax_summary.pay_amt).toBe(0);
    expect(payload.slip_meta?.title).toContain('타 석 배 정 표');
    expect(payload.slip_meta?.badge_text).toBe('2F - 07번 타석');
    expect(payload.slip_meta?.action_label).toBe('회원권 타석 배정');
    expect(payload.slip_meta?.product_name).toBe('1개월 종일 회원권');
    expect(payload.slip_meta?.time_range).toBe('14:00 ~ 15:10');
    expect(payload.slip_meta?.duration_label).toBe('70분');
    expect(payload.slip_meta?.remain_info).toBe('유효만료: 2026-11-28');
    expect(payload.barcode_text).toBe('BAY-7-1400');

    // ESC/POS fallback buffer should NOT contain 0원 tax lines for ALLOCATION_SLIP
    const textPreview = new TextDecoder().decode(
      kioskEscPosPrinter.buildReceiptBuffer({
        storeName: mockStoreInfo.store_name,
        bizNo: mockStoreInfo.biz_no,
        ceoName: mockStoreInfo.ceo_name,
        storeTel: mockStoreInfo.tel,
        address: mockStoreInfo.address,
        receiptNo: payload.receipt_no,
        tradeDate: payload.trade_dt,
        memberName: payload.member_name,
        memberNo: payload.member_no,
        payMethod: payload.pay_method,
        slipMeta: payload.slip_meta || undefined,
        items: payload.items,
        payAmount: 0,
        supplyAmt: 0,
        vatAmt: 0,
        taxFreeAmt: 0,
        discountAmt: 0,
      }),
    );

    expect(textPreview).toContain('2F - 07번 타석');
    expect(textPreview).toContain('회원권 타석 배정');
    expect(textPreview).not.toContain('공급가액');
    expect(textPreview).not.toContain('결제금액');
  });

  it('builds waitlist booking slip with WAITLIST_ASSIGNED header, footer, and normalized HH:mm from backend 4-digit HHmm', () => {
    const payload = buildKioskBayAllocationSlipPayload({
      bayNo: 8,
      floor: '1F',
      resId: 'KSK_20261114_WAIT',
      memberName: '이종섭',
      memberNo: 'M1001',
      productName: '프리미엄 6개월',
      checkinMode: 'WAITLIST_ASSIGNED',
      durationMin: 60,
      startTime: '1501',
      endTime: '1603',
      storeInfo: mockStoreInfo,
      tradeDt: '2026-11-14 14:35:00',
    });

    expect(payload.slip_meta?.title).toBe('★ [ 타 석 대 기 예 약 표 ] ★');
    expect(payload.slip_meta?.action_label).toBe('타석 대기 예약');
    expect(payload.slip_meta?.badge_text).toBe('1F - 08번 타석');
    expect(payload.slip_meta?.time_range).toBe('15:01 ~ 16:03');
    expect(payload.footer_message).toContain('앞 타임 종료 후 지정 시각부터 입장해 주십시오.');
  });

  it('builds slim eco bay allocation slip with 5mm barcode (GS h 40) and 1-line feed', () => {
    const rawBuffer = kioskEscPosPrinter.buildReceiptBuffer({
      storeName: mockStoreInfo.store_name,
      receiptNo: 'BAY-06-122015',
      tradeDate: '2026-10-29 12:20:15',
      bayNo: 6,
      useMinutes: 60,
      startTime: '12:20',
      endTime: '13:20',
      memberName: '이종섭',
      memberNo: '10101',
      payMethod: 'ALLOCATION_SLIP',
      slipMeta: {
        title: '★ [ 타 석 배 정 표 ] ★',
        badge_text: '06번 타석',
        action_label: '타석 배정',
        product_name: '일일타석',
        time_range: '12:20 ~ 13:20',
        duration_label: '60분',
      },
      barcodeText: 'BAY-06-122015',
      payAmount: 0,
    });

    const textPreview = new TextDecoder().decode(rawBuffer);

    // 1) Text content checks
    expect(textPreview).toContain('국립군산대학교 골프학습장');
    expect(textPreview).toContain('06번 타석 (60분)');
    expect(textPreview).toContain('12:20 ~ 13:20');
    expect(textPreview).toContain('이종섭 (10101)');
    expect(textPreview).toContain('BAY-06-122015 [게이트출입]');
    // No redundant greetings
    expect(textPreview).not.toContain('배정된 타석으로 이동해 주시기 바랍니다');
    expect(textPreview).not.toContain('이용해 주셔서 감사합니다');

    // 2) Binary ESC/POS command checks
    // GS h 40 (0x1d 0x68 0x28 = 40 dots = 5mm barcode height)
    let foundSlimBarcodeHeight = false;
    for (let i = 0; i < rawBuffer.length - 2; i++) {
      if (rawBuffer[i] === 0x1d && rawBuffer[i + 1] === 0x68 && rawBuffer[i + 2] === 0x28) {
        foundSlimBarcodeHeight = true;
        break;
      }
    }
    expect(foundSlimBarcodeHeight).toBe(true);

    // Feed 1 line (0x1b 0x64 0x01) before cut (0x1d 0x56 0x41 0x00)
    let foundFeed1Line = false;
    for (let i = 0; i < rawBuffer.length - 2; i++) {
      if (rawBuffer[i] === 0x1b && rawBuffer[i + 1] === 0x64 && rawBuffer[i + 2] === 0x01) {
        foundFeed1Line = true;
        break;
      }
    }
    expect(foundFeed1Line).toBe(true);
  });

  it('builds slim credit card sales slip without gate barcode and with 1-line feed', () => {
    const rawBuffer = kioskEscPosPrinter.buildReceiptBuffer({
      storeName: mockStoreInfo.store_name,
      bizNo: mockStoreInfo.biz_no,
      ceoName: mockStoreInfo.ceo_name,
      storeTel: mockStoreInfo.tel,
      receiptNo: 'RC-123456',
      tradeDate: '2026-10-29 12:20:15',
      payMethod: 'CARD',
      payAmount: 10000,
      supplyAmt: 9091,
      vatAmt: 909,
      itemName: '일일타석 [06번] (60분)',
      cardInfo: {
        issuerName: '신한카드',
        cardNoMasked: '5417-****',
        approvalNo: '12345678',
        installmentMonths: 0,
        terminalId: '10101',
      },
    });

    const textPreview = new TextDecoder().decode(rawBuffer);

    // 1) Text content checks
    expect(textPreview).toContain('신용카드 매출전표');
    expect(textPreview).toContain('고객용');
    expect(textPreview).toContain('국립군산대학교 골프학습장 / 401-83-01667 / 엄기욱');
    expect(textPreview).toContain('신한카드 (5417-****)');
    expect(textPreview).toContain('12345678');
    expect(textPreview).toContain('일일타석 [06번] (60분)');
    expect(textPreview).toContain('9,091원 / 909원');
    expect(textPreview).toContain('10,000원');

    // 🚨 Must NOT contain gate barcode text or barcode command
    expect(textPreview).not.toContain('출입 게이트 태깅 바코드');
    expect(textPreview).not.toContain('[게이트출입]');
    let foundBarcodeCmd = false;
    for (let i = 0; i < rawBuffer.length - 2; i++) {
      if (rawBuffer[i] === 0x1d && rawBuffer[i + 1] === 0x6b) {
        foundBarcodeCmd = true;
        break;
      }
    }
    expect(foundBarcodeCmd).toBe(false);

    // Feed 1 line (0x1b 0x64 0x01) before cut
    let foundFeed1Line = false;
    for (let i = 0; i < rawBuffer.length - 2; i++) {
      if (rawBuffer[i] === 0x1b && rawBuffer[i + 1] === 0x64 && rawBuffer[i + 2] === 0x01) {
        foundFeed1Line = true;
        break;
      }
    }
    expect(foundFeed1Line).toBe(true);
  });

  it('builds bay move slip payload with oldBayNo → bayNo badge', () => {
    const payload = buildKioskBayAllocationSlipPayload({
      bayNo: 12,
      oldBayNo: 5,
      checkinMode: 'MOVE_BAY',
      memberName: '김철수',
      durationMin: 45,
      startTime: '15:00',
      endTime: '15:45',
      remainInfo: '보전 잔여시간: 45분',
      storeInfo: mockStoreInfo,
      tradeDt: '2026-10-29 15:00:00',
    });

    expect(payload.pay_method).toBe('ALLOCATION_SLIP');
    expect(payload.slip_meta?.title).toContain('타 석 이 동 확 인 표');
    expect(payload.slip_meta?.badge_text).toBe('05번 → 12번 타석');
    expect(payload.slip_meta?.remain_info).toBe('보전 잔여시간: 45분');
  });

  it('builds locker slip payload with LOCKER_SLIP and start/end dates', () => {
    const payload = buildKioskLockerSlipPayload({
      lockerNo: 108,
      memberName: '이영희',
      memberNo: 'M00999',
      productName: '라카 3개월 (108번)',
      actionLabel: '라카 신규 대여',
      startDate: '2026-10-29',
      endDate: '2027-01-28',
      days: 90,
      storeInfo: mockStoreInfo,
      tradeDt: '2026-10-29 16:00:00',
    });

    expect(payload.pay_method).toBe('LOCKER_SLIP');
    expect(payload.client_type).toBe('KIOSK');
    expect(payload.slip_meta?.title).toContain('라 카 배 정 확 인 증');
    expect(payload.slip_meta?.badge_text).toBe('라카 NO. 108번');
    expect(payload.slip_meta?.start_date).toBe('2026-10-29');
    expect(payload.slip_meta?.end_date).toBe('2027-01-28');
    expect(payload.slip_meta?.duration_label).toBe('90일');
    expect(payload.barcode_text).toBe('LCK-108');
  });

  it('executes back-to-back printReceipt calls strictly in FIFO order', async () => {
    const executionOrder: string[] = [];
    const spy = vi.spyOn(HardwareAdapterFactory, 'createPrinter').mockReturnValue({
      checkHealth: vi.fn().mockResolvedValue(true),
      printReceipt: vi.fn().mockImplementation(async (data: any) => {
        executionOrder.push(`START:${data.pay_method}`);
        await new Promise((r) => setTimeout(r, data.pay_method === 'CARD' ? 40 : 5));
        executionOrder.push(`END:${data.pay_method}`);
        return { success: true, message: 'OK' };
      }),
    } as any);

    try {
      const client = new KioskHardwareBridgeClient({ printMode: 'AUTO' });

      const cardPromise = client.printReceipt({
        sale_id: 'SALE-1',
        receipt_no: 'RC-1',
        trade_dt: '2026-10-29 14:00:00',
        pay_method: 'CARD',
        store_info: mockStoreInfo,
        items: [{ name: '일일타석', qty: 1, unit_price: 15000, amount: 15000 }],
        tax_summary: {
          supply_amt: 13636,
          tax_amt: 1364,
          tax_free_amt: 0,
          total_amt: 15000,
          discount_amt: 0,
          pay_amt: 15000,
        },
      });

      const slipPromise = client.printReceipt(
        buildKioskBayAllocationSlipPayload({
          bayNo: 3,
          storeInfo: mockStoreInfo,
        }),
      );

      await Promise.all([cardPromise, slipPromise]);

      expect(executionOrder).toEqual([
        'START:CARD',
        'END:CARD',
        'START:ALLOCATION_SLIP',
        'END:ALLOCATION_SLIP',
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('prevents duplicate fallback printing when :18080 returns HTTP 500 or TimeoutError', async () => {
    const fallbackSpy = vi.spyOn(kioskEscPosPrinter, 'printReceipt').mockResolvedValue({
      success: true,
      message: 'FALLBACK',
    });
    const origFetch = globalThis.fetch;

    try {
      const adapter = new WindowsBridgePrinterAdapter(() => ({
        bridgeHost: 'http://127.0.0.1',
        bridgePort: 18080,
        isMock: false,
        printMode: 'AUTO',
        drawerAutoOpen: false,
      }));

      // 1) HTTP 500 from :18080 -> should NOT trigger fallbackEscPosPrint
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false, message: 'COM5 프린터 용지 부족' }),
      } as any);

      const res500 = await adapter.printReceipt(
        buildKioskBayAllocationSlipPayload({ bayNo: 1, storeInfo: mockStoreInfo }),
      );
      expect(res500.success).toBe(false);
      expect(res500.message).toContain('COM5 프린터 용지 부족');
      expect(fallbackSpy).not.toHaveBeenCalled();

      // 2) TimeoutError -> should NOT trigger fallbackEscPosPrint
      const timeoutErr = new Error('The operation timed out.');
      timeoutErr.name = 'TimeoutError';
      globalThis.fetch = vi.fn().mockRejectedValue(timeoutErr);

      const resTimeout = await adapter.printReceipt(
        buildKioskBayAllocationSlipPayload({ bayNo: 1, storeInfo: mockStoreInfo }),
      );
      expect(resTimeout.success).toBe(false);
      expect(resTimeout.message).toContain('시간 초과');
      expect(fallbackSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
      fallbackSpy.mockRestore();
    }
  });
});
