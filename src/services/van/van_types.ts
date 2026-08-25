/**
 * [무인 키오스크 다중 VAN 단말기 전문 및 통신 인터페이스 표준 정의]
 * NHN KCP, KOCES, NICE, SMARTRO, MOCK 등 오프라인 결제 단말기 공통 규약
 */

/** 결제 진행 상태 머신 */
export type VanPaymentState =
  | 'IDLE' // 대기 상태
  | 'READY' // 단말기 통신 준비
  | 'WAITING_CARD' // 단말기 IC 카드 삽입 대기 ("카드를 꽂아주세요")
  | 'REQUESTING' // VAN 서버 승인 통신 중
  | 'APPROVED' // 결제 승인 완료
  | 'REJECTED' // 결제 거절 (잔액부족, 한도초과 등)
  | 'TIMEOUT' // 시간 초과 (카드 미삽입/응답없음)
  | 'CANCELLED' // 사용자 강제 취소
  | 'ERROR'; // 단말기 미연결 또는 네트워크 오류

/** 에러 코드 정규화 */
export type VanErrorCode =
  | 'E_NONE'
  | 'E_DEVICE_NOT_FOUND' // 단말기 미연결 (77777원 Mock)
  | 'E_INSUFFICIENT_FUNDS' // 잔액 부족 (99999원 Mock)
  | 'E_TIMEOUT' // 단말기 응답 시간 초과 (88888원 Mock)
  | 'E_USER_CANCEL' // 사용자 취소
  | 'E_INVALID_AMOUNT' // 유효하지 않은 금액
  | 'E_INVALID_AUTH_NO' // 취소 시 승인번호 불일치
  | 'E_NETWORK_ERROR' // VAN사 통신망 장애
  | 'E_UNKNOWN';

/** 단말기 결제 요청 파라미터 */
export interface CardPaymentRequestParams {
  amount: number; // 결제 금액 (원)
  installmentMonths?: number; // 할부 개월수 (0: 일시불, 2~12: 할부)
  taxFreeAmount?: number; // 면세 금액 (기본 0)
  vatAmount?: number; // 부가세 (미지정 시 자동 계산)
  orderId?: string; // 고유 주문/거래 번호
  customerName?: string; // 고객명 (선택)
  productName?: string; // 상품명 (선택)
  timeoutSeconds?: number; // 단말기 대기 타임아웃 (기본 30초)
}

/** 단말기 결제 승인 결과 */
export interface CardApprovalResult {
  success: boolean;
  auth_code: string; // 승인번호 (8자리)
  approved_at: string; // 승인일시 (ISO 8601 or YYYYMMDDHHmmss)
  card_no_masked: string; // 마스킹 카드번호 (예: 9410-****-****-1234)
  issuer_code?: string; // 발급사 코드
  issuer_name: string; // 발급사명 (예: 신한카드, 국민카드)
  acquirer_code?: string; // 매입사 코드
  acquirer_name: string; // 매입사명 (예: 비씨카드, KB국민카드)
  terminal_id: string; // 단말기 번호 (TID)
  merchant_no?: string; // 가맹점 번호
  amount: number; // 승인 금액
  installment_months: number; // 할부 개월 (0: 일시불)
  van_tr_no?: string; // VAN사 고유 거래 일련번호
  raw_response?: Record<string, unknown>; // 원본 전문 (디버깅용)
  error_code?: VanErrorCode;
  error_message?: string;
}

/** 단말기 결제 취소 요청 파라미터 */
export interface CardCancelRequestParams {
  amount: number; // 취소 금액
  orgAuthCode: string; // 원거래 승인번호 (필수)
  orgApprovedDate: string; // 원거래 승인일자 (YYYYMMDD, 필수)
  terminalId?: string; // 원거래 단말기 TID
  vanTrNo?: string; // 원거래 VAN 거래번호
  reason?: string; // 취소 사유
}

/** 단말기 결제 취소 결과 */
export interface CardCancelResult {
  success: boolean;
  cancel_auth_code?: string; // 취소 승인번호
  canceled_at: string; // 취소일시
  canceled_amount: number; // 취소된 금액
  raw_response?: Record<string, unknown>;
  error_code?: VanErrorCode;
  error_message?: string;
}

/** VAN 통신사 종류 */
export type VanProviderType = 'KCP' | 'KOCES' | 'NICE' | 'SMARTRO' | 'KIS' | 'MOCK';

/** 현금영수증 발행 종류 */
export type CashReceiptType = 'PERSONAL' | 'BUSINESS' | 'VOLUNTARY';

/** 현금영수증 요청 파라미터 */
export interface CashReceiptRequestParams {
  amount: number;
  supplyAmount?: number;
  vatAmount?: number;
  receiptType: CashReceiptType;
  identityNo?: string;
  terminalId?: string;
  timeoutSeconds?: number;
}

/** 현금영수증 취소 요청 파라미터 */
export interface CashReceiptCancelParams {
  orgAuthCode: string;
  orgApprovedDate: string;
  amount: number;
  terminalId?: string;
  vanTrNo?: string;
  reason?: string;
}

/** 현금영수증 승인/취소 결과 */
export interface CashReceiptResult {
  success: boolean;
  auth_code: string;
  approved_at: string;
  receipt_type: CashReceiptType;
  identity_no_masked: string;
  amount: number;
  terminal_id: string;
  van_tr_no?: string;
  raw_response?: Record<string, unknown>;
  error_code?: VanErrorCode;
  error_message?: string;
}

/** 단말기 헬스체크 결과 */
export interface TerminalHealthResult {
  isOnline: boolean;
  message: string;
  provider?: VanProviderType;
  statusCode?: number;
}

/** 단말기 설정 */
export interface VanConfig {
  provider: VanProviderType; // VAN 통신사
  vcatHost: string; // VCAT/데몬 로컬 주소 (기본: http://127.0.0.1)
  vcatPort: number; // VCAT/데몬 포트 (기본: 8090)
  terminalId: string; // 가맹점 단말기 TID
  isMock: boolean; // Mac 개발용 Mock 모드 여부
  timeoutSeconds: number; // 대기 시간 (초)
}

/** 다중 VAN사 표준 어댑터 인터페이스 */
export interface IVanTerminalAdapter {
  readonly provider: VanProviderType;
  setConfig(config: Partial<VanConfig>): void;
  getConfig(): VanConfig;
  checkHealth(): Promise<boolean>;
  checkTerminalHealth(): Promise<TerminalHealthResult>;
  requestCardPayment(
    params: CardPaymentRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CardApprovalResult>;
  cancelCardPayment(params: CardCancelRequestParams): Promise<CardCancelResult>;
  requestCashReceipt(
    params: CashReceiptRequestParams,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult>;
  issueCashReceiptAuto(
    amount: number,
    onStateChange?: (state: VanPaymentState) => void
  ): Promise<CashReceiptResult>;
  cancelCashReceipt(params: CashReceiptCancelParams): Promise<CashReceiptResult>;
  cancelCurrentRequest(): void;
}

export type IVanAdapter = IVanTerminalAdapter;
