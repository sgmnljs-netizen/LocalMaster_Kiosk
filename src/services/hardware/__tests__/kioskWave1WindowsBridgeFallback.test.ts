import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WindowsBridgePrinterAdapter,
  WindowsBridgeScannerAdapter,
} from '../adapters/WindowsBridgeAdapter';
import { kioskEscPosPrinter } from '../../printer/escpos_printer';
import type { HardwareConfig, ReceiptPrintData } from '../types/hardware_types';

class MockScannerWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockScannerWebSocket[] = [];

  public url: string;
  public readyState = MockScannerWebSocket.CONNECTING;
  public onmessage: ((evt: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public close = vi.fn(() => {
    this.readyState = MockScannerWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(url: string) {
    this.url = url;
    MockScannerWebSocket.instances.push(this);
  }
}

const mockConfig = (): HardwareConfig => ({
  printerMode: 'WINDOWS_BRIDGE',
  scannerMode: 'WINDOWS_BRIDGE',
  bridgeHost: 'http://127.0.0.1',
  bridgePort: 18080,
  autoPrintReceipt: true,
  paperWidthMm: 80,
});

describe('Wave 1 [W1-4]: WindowsBridgeAdapter ESC/POS 할부·승인일시 보존 및 스캐너 WS 중복연결 방어', () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    vi.useFakeTimers();
    MockScannerWebSocket.instances = [];
    globalThis.WebSocket = MockScannerWebSocket as unknown as typeof WebSocket;
    (globalThis as Record<string, unknown>).window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it('브릿지 데몬 연결 실패로 ESC/POS 폴백 출력 시 할부 개월수(installment_months)와 승인일시(approval_dt)를 누락 없이 전달한다', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const printSpy = vi
      .spyOn(kioskEscPosPrinter, 'printReceipt')
      .mockResolvedValue({ success: true, message: 'ESC/POS 폴백 성공' });

    const adapter = new WindowsBridgePrinterAdapter(mockConfig);
    const receipt: ReceiptPrintData = {
      sale_id: 'S-20261106-01',
      receipt_no: 'R-20261106-01',
      trade_dt: '2026-11-06 18:45:00',
      pay_method: 'CARD',
      store_info: {
        store_name: '골포스 본점',
        biz_no: '123-45-67890',
        ceo_name: '홍길동',
        tel: '02-1566-0000',
        address: '서울시 강남구',
      },
      items: [{ name: '3개월 정기권', qty: 1, unit_price: 330000, amount: 330000 }],
      tax_summary: {
        supply_amt: 300000,
        tax_amt: 30000,
        tax_free_amt: 0,
        total_amt: 330000,
        discount_amt: 0,
        pay_amt: 330000,
      },
      card_info: {
        issuer_name: '현대카드',
        card_no_masked: '4321-****-****-9876',
        approval_no: '77665544',
        approval_dt: '2026-11-06 18:44:58',
        installment_months: 6,
        terminal_id: 'TID-8801',
      },
    };

    const res = await adapter.printReceipt(receipt);
    expect(res.success).toBe(true);
    expect(printSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cardInfo: {
          issuerName: '현대카드',
          cardNoMasked: '4321-****-****-9876',
          approvalNo: '77665544',
          terminalId: 'TID-8801',
          installmentMonths: 6,
          approvalDt: '2026-11-06 18:44:58',
        },
      })
    );
  });

  it('스캐너 어댑터 구독 시 이미 연결 중인 소켓이 있으면 중복 생성하지 않고, 마지막 핸들러 해제 시 재연결 타이머 없이 즉시 종료한다', async () => {
    const scanner = new WindowsBridgeScannerAdapter(mockConfig);
    expect(MockScannerWebSocket.instances.length).toBe(1);

    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = scanner.onScan(h1);
    const unsub2 = scanner.onScan(h2);

    // CONNECTING(0) 상태에서 onScan 추가 등록 시 중복 소켓이 생성되지 않아야 함
    expect(MockScannerWebSocket.instances.length).toBe(1);

    const ws = MockScannerWebSocket.instances[0];
    ws.readyState = MockScannerWebSocket.OPEN;
    ws.onmessage?.({ data: JSON.stringify({ barcode: ' CPN-9988 ' }) });
    expect(h1).toHaveBeenCalledWith('CPN-9988');
    expect(h2).toHaveBeenCalledWith('CPN-9988');

    unsub1();
    unsub2();
    expect(ws.close).toHaveBeenCalledTimes(1);

    // 10초 경과 후에도 불필요한 재연결 소켓이 생성되지 않아야 함
    await vi.advanceTimersByTimeAsync(10000);
    expect(MockScannerWebSocket.instances.length).toBe(1);
  });
});
