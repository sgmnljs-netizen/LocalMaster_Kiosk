import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import type { Product } from '../../../services/api';
import {
  buildDispenserPaymentDetails,
  filterDailyDispenserProducts,
  resolveDailyBasketCount,
  resolveDailyProductPrice,
} from '../dispenserFlowUtils';
import { DispenserFlowModal } from '../DispenserFlowModal';
import { DispenserCompleteModal } from '../DispenserCompleteModal';

const storageMap = new Map<string, string>();
(globalThis as unknown as { localStorage: Record<string, unknown> }).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('[W3][P0-1] 키오스크 볼 배급기 플로우(DispenserFlowModal) 안전 가드 및 순수 로직 검증', () => {
  it('DP-01: 일일권 상품 필터링은 DAILY 로직타입과 일일 카테고리만 추출하고 정기권/락카/레슨을 제외한다', () => {
    const products = [
      { prod_cd: 'P1', prod_nm: '1일 볼 2바구니', logic_type: 'DAILY', category: 'GOLF', sale_price: 15000, standard_price: 18000, total_count: 2 },
      { prod_cd: 'P2', prod_nm: '당일 방문 일일권', logic_type: 'COUNT', category: '일일방문', sale_price: 0, standard_price: 20000, total_count: 3 },
      { prod_cd: 'P3', prod_nm: '3개월 정기권', logic_type: 'PERIOD', category: 'MEMBERSHIP', sale_price: 300000, standard_price: 300000, total_count: 0 },
      { prod_cd: 'P4', prod_nm: '락카 1개월', logic_type: 'LOCKER', category: 'FACILITY', sale_price: 30000, standard_price: 30000, total_count: 0 },
    ] as unknown as Product[];

    const filtered = filterDailyDispenserProducts(products);
    expect(filtered.map((p) => p.prod_cd)).toEqual(['P1', 'P2']);
  });

  it('DP-02: 일일권 단가 및 바구니 횟수 계산은 0원/음수/NaN 경계값에서도 안전하게 폴백한다', () => {
    expect(resolveDailyProductPrice({ sale_price: 15000, standard_price: 18000 })).toBe(15000);
    expect(resolveDailyProductPrice({ sale_price: 0, standard_price: 18000 })).toBe(18000);
    expect(resolveDailyProductPrice({ sale_price: -5000, standard_price: -1000 })).toBe(0);
    expect(resolveDailyBasketCount({ total_count: 3 })).toBe(3);
    expect(resolveDailyBasketCount({ total_count: 0 })).toBe(1);
    expect(resolveDailyBasketCount({ total_count: -4 })).toBe(1);
    expect(resolveDailyBasketCount({ total_count: undefined })).toBe(1);
  });

  it('DP-03: VAN 결제 상세 빌더는 apprNo 누락 시 cardApproval.auth_code/apprNo 순으로 폴백한다', () => {
    const details = buildDispenserPaymentDetails({
      apprNo: '',
      tradeDate: '20261125',
      amount: 15000,
      cardApproval: {
        success: true,
        auth_code: '98765432',
        van_tr_no: 'TR-001',
        card_no_masked: '4579-73**-****-1234',
        issuer_name: '신한카드',
        acquirer_name: '신한카드',
        terminal_id: 'CAT01',
        merchant_no: 'M001',
        installment_months: 0,
      },
    });
    expect(details.approval_no).toBe('98765432');
    expect(details.van_tr_no).toBe('TR-001');
    expect(details.issuer_name).toBe('신한카드');
    expect(details.installment_months).toBe(0);
  });

  it('DP-04: DispenserFlowModal과 DispenserCompleteModal이 기본 2분할 선택 및 완료 안내 UI를 정상 SSR 렌더링한다', () => {
    const flowHtml = renderToStaticMarkup(
      React.createElement(DispenserFlowModal, {
        faceTerminalEnabled: true,
        onExecuteAutoReversal: async () => ({ success: true, message: 'ok' }),
        onClose: () => {},
      })
    );
    expect(flowHtml).toContain('회원 입실 배정');
    expect(flowHtml).toContain('일일권 구매');

    const completeHtml = renderToStaticMarkup(
      React.createElement(DispenserCompleteModal, {
        passInfo: {
          pass_id: 'pass-1',
          store_cd: 'JG001',
          member_no: 'G261125ABCD',
          member_name: '일일방문객',
          prod_nm: '1일 볼 2바구니',
          pass_type: 'DAILY_TEMP',
          issue_date_kst: '2026-11-25',
          total_quota: 2,
          used_count: 0,
          remaining_count: 2,
          status_cd: 'ACTIVE',
        },
        receiptContext: {
          saleId: 'sale-1',
          productName: '1일 볼 2바구니',
          amount: 15000,
          apprNo: '12345678',
        },
        onDone: () => {},
      })
    );
    expect(completeHtml).toContain('입실 배정 완료');
    expect(completeHtml).toContain('오늘 가능 횟수: 0 / 2회');
    expect(completeHtml).toContain('영수증 출력');
  });

  it('DP-05: DispenserFlowModal은 더블서밋 락·생체이미지 메모리 초기화·언마운트 가드·언마운트 무관 자동 망취소 불변식을 유지한다', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DispenserFlowModal.tsx'),
      'utf-8'
    );
    expect(src).toContain('dailyPaymentSubmittingRef.current');
    expect(src).toContain('issuingItemRef.current');
    expect(src).toContain('mountedRef.current');
    expect(src).toContain('clearDailyBiometricState');
    // 자동 망취소(onExecuteAutoReversal) 호출은 mountedRef 반환보다 먼저 수행되어야 함
    const reversalIdx = src.indexOf('await onExecuteAutoReversal(');
    const catchMountedIdx = src.indexOf('if (!mountedRef.current) return;', reversalIdx);
    expect(reversalIdx).toBeGreaterThan(0);
    expect(catchMountedIdx).toBeGreaterThan(reversalIdx);
  });
});
