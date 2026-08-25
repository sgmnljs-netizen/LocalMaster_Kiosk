/**
 * [키오스크 윈도우 하드웨어 브릿지 어댑터]
 */

import type {
  IPrinterAdapter,
  IScannerAdapter,
  ReceiptPrintData,
  PrintResult,
  BarcodeScanHandler,
  HardwareConfig,
} from '../types/hardware_types';

export class WindowsBridgePrinterAdapter implements IPrinterAdapter {
  constructor(private getConfig: () => HardwareConfig) {}

  public async checkHealth(): Promise<boolean> {
    try {
      const cfg = this.getConfig();
      const res = await fetch(`${cfg.bridgeHost}:${cfg.bridgePort}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async printReceipt(data: ReceiptPrintData): Promise<PrintResult> {
    const cfg = this.getConfig();
    try {
      const res = await fetch(`${cfg.bridgeHost}:${cfg.bridgePort}/api/v1/print/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        return { success: true, message: json.message || '영수증 출력 완료' };
      }
      return { success: false, message: `프린터 데몬 오류 (HTTP ${res.status})` };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '윈도우 하드웨어 브릿지 데몬 미연결',
      };
    }
  }
}

export class WindowsBridgeScannerAdapter implements IScannerAdapter {
  private ws: WebSocket | null = null;
  private handlers: Set<BarcodeScanHandler> = new Set();

  constructor(private getConfig: () => HardwareConfig) {
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (typeof window === 'undefined') return;
    const cfg = this.getConfig();
    const wsUrl = `ws://${cfg.bridgeHost.replace(/^https?:\/\//, '')}:${cfg.bridgePort}/ws/scanner`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const barcode = data.barcode || data.code || String(data);
          if (barcode) {
            this.handlers.forEach((h) => h(barcode.trim()));
          }
        } catch {
          if (event.data) {
            this.handlers.forEach((h) => h(String(event.data).trim()));
          }
        }
      };
    } catch {
      // 재시도
    }
  }

  public onScan(handler: BarcodeScanHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
