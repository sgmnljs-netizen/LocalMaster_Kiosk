/**
 * [키오스크 가상 하드웨어 어댑터]
 * - 브라우저(window) 및 Node(테스트) 환경 모두에서 안전하게 작동
 */

import type {
  IPrinterAdapter,
  IScannerAdapter,
  ReceiptPrintData,
  PrintResult,
  BarcodeScanHandler,
} from '../types/hardware_types';

export class MockPrinterAdapter implements IPrinterAdapter {
  public async checkHealth(): Promise<boolean> {
    return true;
  }

  public async printReceipt(data: ReceiptPrintData): Promise<PrintResult> {
    console.log('[Kiosk MockPrinter] 키오스크 가상 영수증/배정표 인쇄:', data);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('lm-kiosk-mock-receipt', {
          detail: data,
        })
      );
    }
    return {
      success: true,
      message: '키오스크 가상 영수증 출력 완료',
    };
  }
}

export class MockScannerAdapter implements IScannerAdapter {
  private handlers: Set<BarcodeScanHandler> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('lm-kiosk-mock-barcode-scan', ((e: any) => {
        if (e.detail?.barcode) {
          this.handlers.forEach((h) => h(e.detail.barcode));
        }
      }) as EventListener);
    }
  }

  public onScan(handler: BarcodeScanHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** 가상 테스트용 수동 트리거 */
  public emitScan(barcode: string): void {
    this.handlers.forEach((h) => h(barcode));
  }
}
