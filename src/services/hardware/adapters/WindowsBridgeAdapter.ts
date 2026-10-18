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
import { kioskEscPosPrinter } from '../../printer/escpos_printer';

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

  private async fallbackEscPosPrint(data: ReceiptPrintData): Promise<PrintResult> {
    return kioskEscPosPrinter.printReceipt({
      storeName: data.store_info?.store_name || '골포스 스마트 키오스크',
      storeTel: data.store_info?.tel,
      bizNo: data.store_info?.biz_no,
      ceoName: data.store_info?.ceo_name,
      address: data.store_info?.address,
      receiptNo: data.receipt_no,
      tradeDate: data.trade_dt,
      bayNo: data.bayNo ?? data.bay_no,
      memberName: data.member_name,
      itemName: data.items?.map((i) => i.name).join(', ') || data.items?.[0]?.name,
      items: data.items,
      useMinutes: data.useMinutes ?? data.use_minutes,
      startTime: data.startTime ?? data.start_time,
      endTime: data.endTime ?? data.end_time,
      payAmount: data.tax_summary?.pay_amt ?? data.tax_summary?.total_amt ?? 0,
      supplyAmt: data.tax_summary?.supply_amt,
      vatAmt: data.tax_summary?.tax_amt,
      taxFreeAmt: data.tax_summary?.tax_free_amt,
      discountAmt: data.tax_summary?.discount_amt,
      barcodeText: data.barcode_text,
      cardIssuer: data.card_info?.issuer_name,
      cardNoMasked: data.card_info?.card_no_masked,
      terminalId: data.card_info?.terminal_id,
      approvalNo: data.card_info?.approval_no,
      cardInfo: data.card_info
        ? {
            issuerName: data.card_info.issuer_name,
            cardNoMasked: data.card_info.card_no_masked,
            approvalNo: data.card_info.approval_no,
            terminalId: data.card_info.terminal_id,
          }
        : undefined,
      cashInfo: data.cash_receipt_info
        ? {
            approvalNo: data.cash_receipt_info.approval_no,
            receiptType: data.cash_receipt_info.receipt_type,
          }
        : undefined,
    });
  }

  public async printReceipt(data: ReceiptPrintData): Promise<PrintResult> {
    const cfg = this.getConfig();
    try {
      const res = await fetch(`${cfg.bridgeHost}:${cfg.bridgePort}/api/v1/print/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const json = await res.json();
        return { success: true, message: json.message || '영수증 출력 완료' };
      }
      return await this.fallbackEscPosPrint(data);
    } catch {
      return await this.fallbackEscPosPrint(data);
    }
  }
}

export class WindowsBridgeScannerAdapter implements IScannerAdapter {
  private ws: WebSocket | null = null;
  private handlers: Set<BarcodeScanHandler> = new Set();
  private isListening: boolean = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private getConfig: () => HardwareConfig) {
    this.connectWebSocket();
  }

  private scheduleReconnect(): void {
    if (!this.isListening) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.isListening) {
        this.connectWebSocket();
      }
    }, 5000);
  }

  private connectWebSocket(): void {
    if (typeof window === 'undefined' || !this.isListening) return;
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
      this.ws.onclose = () => {
        this.ws = null;
        if (this.isListening) {
          this.scheduleReconnect();
        }
      };
      this.ws.onerror = () => {
        // handled by onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public onScan(handler: BarcodeScanHandler): () => void {
    this.isListening = true;
    this.handlers.add(handler);
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      this.connectWebSocket();
    }
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) {
        this.isListening = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
      }
    };
  }
}
