/**
 * [키오스크 통합 하드웨어 브릿지 인터페이스 및 데이터 타입 정의]
 */

export interface ReceiptItemData {
  name: string;
  qty: number;
  unit_price: number;
  amount: number;
  discount_amt?: number;
  is_tax_free?: boolean;
}

export interface ReceiptStoreData {
  store_name: string;
  biz_no: string;
  ceo_name: string;
  tel: string;
  address: string;
  logo_url?: string | null;
}

export interface ReceiptTaxData {
  supply_amt: number;
  tax_amt: number;
  tax_free_amt: number;
  total_amt: number;
  discount_amt: number;
  pay_amt: number;
}

export interface ReceiptCardData {
  issuer_name: string;
  acquirer_name?: string;
  card_no_masked: string;
  approval_no: string;
  approval_dt?: string;
  installment_months: number;
  terminal_id: string;
  merchant_no?: string;
  van_tr_no?: string;
}

export interface ReceiptCashData {
  receipt_type: string;
  identity_no_masked: string;
  approval_no: string;
}

export interface ReceiptPrintData {
  sale_id: string;
  receipt_no: string;
  trade_dt: string;
  member_name?: string;
  member_no?: string;
  pay_method: string;
  store_info: ReceiptStoreData;
  items: ReceiptItemData[];
  tax_summary: ReceiptTaxData;
  card_info?: ReceiptCardData | null;
  cash_receipt_info?: ReceiptCashData | null;
  barcode_text?: string;
  header_message?: string;
  footer_message?: string;
  print_mode?: 'AUTO' | 'PROMPT' | 'NONE';
  open_cash_drawer?: boolean;
  copies?: number;
}

export interface HardwareConfig {
  bridgeHost: string;
  bridgePort: number;
  isMock: boolean;
  printMode: 'AUTO' | 'PROMPT' | 'NONE';
  drawerAutoOpen: boolean;
}

export interface PrintResult {
  success: boolean;
  message?: string;
  error_code?: string;
}

export interface IPrinterAdapter {
  printReceipt(data: ReceiptPrintData): Promise<PrintResult>;
  checkHealth(): Promise<boolean>;
}

export type BarcodeScanHandler = (barcode: string) => void;

export interface IScannerAdapter {
  onScan(handler: BarcodeScanHandler): () => void;
}

export interface IHardwareBridgeClient {
  setConfig(config: Partial<HardwareConfig>): void;
  getConfig(): HardwareConfig;
  printReceipt(data: ReceiptPrintData): Promise<PrintResult>;
  subscribeScanner(handler: BarcodeScanHandler): () => void;
  checkBridgeHealth(): Promise<{ isOnline: boolean; message: string }>;
}
