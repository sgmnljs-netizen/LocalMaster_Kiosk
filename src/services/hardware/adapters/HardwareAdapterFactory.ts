/**
 * [키오스크 하드웨어 어댑터 팩토리]
 */

import type {
  IPrinterAdapter,
  IScannerAdapter,
  HardwareConfig,
} from '../types/hardware_types';
import { MockPrinterAdapter, MockScannerAdapter } from './MockHardwareAdapter';
import {
  WindowsBridgePrinterAdapter,
  WindowsBridgeScannerAdapter,
} from './WindowsBridgeAdapter';

export const getIsMockHardware = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('HW_MOCK');
  if (stored !== null) return stored === 'true';
  const isRealWindows =
    window.navigator.userAgent.includes('Windows') &&
    Boolean(window.navigator.platform && window.navigator.platform.startsWith('Win')) &&
    !window.navigator.webdriver;
  return !isRealWindows;
};

export const DEFAULT_HARDWARE_CONFIG: HardwareConfig = {
  bridgeHost: 'http://127.0.0.1',
  bridgePort: 18080,
  isMock: getIsMockHardware(),
  printMode: 'AUTO',
  drawerAutoOpen: false,
};

export class HardwareAdapterFactory {
  private static printerInstance: IPrinterAdapter | null = null;
  private static scannerInstance: IScannerAdapter | null = null;

  public static createPrinter(getConfig: () => HardwareConfig): IPrinterAdapter {
    const cfg = getConfig();
    if (cfg.isMock) {
      if (!this.printerInstance || !(this.printerInstance instanceof MockPrinterAdapter)) {
        this.printerInstance = new MockPrinterAdapter();
      }
      return this.printerInstance;
    }

    if (!this.printerInstance || !(this.printerInstance instanceof WindowsBridgePrinterAdapter)) {
      this.printerInstance = new WindowsBridgePrinterAdapter(getConfig);
    }
    return this.printerInstance;
  }

  public static createScanner(getConfig: () => HardwareConfig): IScannerAdapter {
    const cfg = getConfig();
    if (cfg.isMock) {
      if (!this.scannerInstance || !(this.scannerInstance instanceof MockScannerAdapter)) {
        this.scannerInstance = new MockScannerAdapter();
      }
      return this.scannerInstance;
    }

    if (!this.scannerInstance || !(this.scannerInstance instanceof WindowsBridgeScannerAdapter)) {
      this.scannerInstance = new WindowsBridgeScannerAdapter(getConfig);
    }
    return this.scannerInstance;
  }

  public static clearInstances(): void {
    this.printerInstance = null;
    this.scannerInstance = null;
  }
}
