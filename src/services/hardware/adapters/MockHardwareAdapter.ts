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
  private boundListener: EventListener | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.boundListener = ((e: CustomEvent<{ barcode?: string }>) => {
        if (e.detail?.barcode) {
          this.handlers.forEach((h) => h(e.detail.barcode as string));
        }
      }) as EventListener;
      window.addEventListener('lm-kiosk-mock-barcode-scan', this.boundListener);
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

  public dispose(): void {
    if (
      this.boundListener &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('lm-kiosk-mock-barcode-scan', this.boundListener);
    }
    this.boundListener = null;
    this.handlers.clear();
  }
}
