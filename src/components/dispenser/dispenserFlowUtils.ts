import type { Product } from '../../services/api';
import type { CardApprovalResult } from '../../services/van/van_types';

export interface DailyPaymentResultInput {
  apprNo: string;
  tradeDate: string;
  amount: number;
  installmentMonths?: number;
  cardApproval?: CardApprovalResult;
}

/**
 * 키오스크 볼 배급 일일권(DAILY) 상품 필터링 (Zero-Hardcoding: logic_type 또는 category 기준).
 */
export function filterDailyDispenserProducts(allProducts: Product[]): Product[] {
  return allProducts.filter((p) => {
    const lt = String(p.logic_type || '').trim().toUpperCase();
    const cat = String(p.category || '').trim().toUpperCase();
    return lt === 'DAILY' || cat.includes('DAILY') || cat.includes('일일');
  });
}

/**
 * 일일권 실결제 단가 계산 (sale_price > 0 우선, 미설정/0원이면 standard_price 폴백, 음수 0 클램핑).
 */
export function resolveDailyProductPrice(prod: Pick<Product, 'sale_price' | 'standard_price'>): number {
  const sale = Number(prod.sale_price ?? 0);
  if (Number.isFinite(sale) && sale > 0) return sale;
  const std = Number(prod.standard_price ?? 0);
  return Number.isFinite(std) && std > 0 ? std : 0;
}

/**
 * 일일권 바구니 횟수 정규화 (최소 1회 보장).
 */
export function resolveDailyBasketCount(prod: Pick<Product, 'total_count'>): number {
  const raw = Number(prod.total_count || 1);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

/**
 * VAN 승인 결과로부터 백엔드 `v1/dispenser/purchase-daily`용 payment_details 생성.
 */
export function buildDispenserPaymentDetails(payResult?: DailyPaymentResultInput): Record<string, unknown> {
  return {
    approval_no:
      payResult?.apprNo ||
      payResult?.cardApproval?.auth_code ||
      payResult?.cardApproval?.apprNo ||
      '',
    trade_date: payResult?.tradeDate || '',
    installment_months:
      payResult?.installmentMonths ?? payResult?.cardApproval?.installment_months ?? 0,
    van_tr_no: payResult?.cardApproval?.van_tr_no || '',
    card_no_masked: payResult?.cardApproval?.card_no_masked || '',
    issuer_name: payResult?.cardApproval?.issuer_name || '',
    acquirer_name: payResult?.cardApproval?.acquirer_name || '',
    terminal_id: payResult?.cardApproval?.terminal_id || '',
    merchant_no: payResult?.cardApproval?.merchant_no || '',
  };
}
