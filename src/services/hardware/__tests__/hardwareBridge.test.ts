import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KioskHardwareBridgeClient } from '../services/HardwareBridgeClient';
import { HardwareAdapterFactory } from '../adapters/HardwareAdapterFactory';
import { MockPrinterAdapter, MockScannerAdapter } from '../adapters/MockHardwareAdapter';
import type { ReceiptPrintData } from '../types/hardware_types';

describe('KioskHardwareBridgeClient (Strategy & Factory Pattern)', () => {
  let bridge: KioskHardwareBridgeClient;

  beforeEach(() => {
    HardwareAdapterFactory.clearInstances();
    bridge = new KioskHardwareBridgeClient({ isMock: true, printMode: 'AUTO' });
  });

  describe('Factory & Adapter Creation', () => {
    it('isMock=true 일 때 Mock 어댑터들을 정상 생성해야 한다', () => {
      const printer = HardwareAdapterFactory.createPrinter(() => bridge.getConfig());
      const scanner = HardwareAdapterFactory.createScanner(() => bridge.getConfig());

      expect(printer).toBeInstanceOf(MockPrinterAdapter);
      expect(scanner).toBeInstanceOf(MockScannerAdapter);
    });
  });

  describe('Receipt & Assignment Slip Printing', () => {
    const mockReceiptData: ReceiptPrintData = {
      sale_id: 'KIOSK-SALE-001',
      receipt_no: 'RC-000001',
      trade_dt: '2026-08-25 14:30:00',
      pay_method: 'CARD',
      store_info: {
        store_name: '골포스 키오스크점',
        biz_no: '123-45-67890',
        ceo_name: '대표자',
        tel: '02-0000-0000',
        address: '서울시 강남구',
      },
      items: [
        {
          name: '타석 60분',
          qty: 1,
          unit_price: 15000,
          amount: 15000,
        },
      ],
      tax_summary: {
        supply_amt: 13636,
        tax_amt: 1364,
        tax_free_amt: 0,
        total_amt: 15000,
        discount_amt: 0,
        pay_amt: 15000,
      },
      card_info: {
        issuer_name: '국민카드',
        card_no_masked: '5424-****-****-9988',
        approval_no: '99887766',
        installment_months: 0,
        terminal_id: '88010003',
      },
      print_mode: 'AUTO',
    };

    it('키오스크 영수증 출력 요청 시 성공 결과를 반환해야 한다', async () => {
      const res = await bridge.printReceipt(mockReceiptData);
      expect(res.success).toBe(true);
      expect(res.message).toContain('완료');
    });

    it('미출력 정책(NONE)일 경우 출력을 스킵해야 한다', async () => {
      const res = await bridge.printReceipt({
        ...mockReceiptData,
        print_mode: 'NONE',
      });
      expect(res.success).toBe(true);
      expect(res.message).toContain('미출력 정책');
    });
  });

  describe('Barcode/QR Scanner Event Subscription', () => {
    it('키오스크 바코드 스캔 이벤트 수신 시 등록된 핸들러가 호출되어야 한다', () => {
      const handler = vi.fn();
      const unsubscribe = bridge.subscribeScanner(handler);

      const scanner = HardwareAdapterFactory.createScanner(() => bridge.getConfig()) as MockScannerAdapter;
      scanner.emitScan('QR-MEMBER-99001');

      expect(handler).toHaveBeenCalledWith('QR-MEMBER-99001');
      unsubscribe();
    });
  });
});
