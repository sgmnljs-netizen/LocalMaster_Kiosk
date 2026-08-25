/**
 * [키오스크 통합 하드웨어 브릿지 클라이언트 (Facade)]
 */

import type {
  IHardwareBridgeClient,
  ReceiptPrintData,
  PrintResult,
  BarcodeScanHandler,
  HardwareConfig,
} from '../types/hardware_types';
import { HardwareAdapterFactory, DEFAULT_HARDWARE_CONFIG } from '../adapters/HardwareAdapterFactory';

export class KioskHardwareBridgeClient implements IHardwareBridgeClient {
  private config: HardwareConfig;

  constructor(customConfig?: Partial<HardwareConfig>) {
    this.config = { ...DEFAULT_HARDWARE_CONFIG, ...customConfig };
  }

  public setConfig(newConfig: Partial<HardwareConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): HardwareConfig {
    return { ...this.config };
  }

  private get printer() {
    return HardwareAdapterFactory.createPrinter(() => this.config);
  }

  private get scanner() {
    return HardwareAdapterFactory.createScanner(() => this.config);
  }

  public async printReceipt(data: ReceiptPrintData): Promise<PrintResult> {
    const mode = data.print_mode || this.config.printMode;
    if (mode === 'NONE') {
      return { success: true, message: '미출력 정책 적용' };
    }
    return this.printer.printReceipt(data);
  }

  public subscribeScanner(handler: BarcodeScanHandler): () => void {
    return this.scanner.onScan(handler);
  }

  public async checkBridgeHealth(): Promise<{ isOnline: boolean; message: string }> {
    const isOnline = await this.printer.checkHealth();
    return {
      isOnline,
      message: isOnline ? '하드웨어 브릿지 정상 연결' : '하드웨어 데몬 미연결 (Mock 모드 동작 중)',
    };
  }
}

export const kioskHardwareBridge = new KioskHardwareBridgeClient();
