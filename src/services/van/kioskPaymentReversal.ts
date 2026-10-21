/**
 * [키오스크 VAN 결제 자동 망취소(Auto-Reversal) 및 고아 결제(Ghost Charge) DLQ 보고 모듈]
 * 2-Phase Commit 보상 트랜잭션:
 * 1. 백엔드 타석 배정 실패 시 즉시 단말기 자동 망취소 실행 (동일 원거래 승인번호, 승인일자, TID, 금액 매칭)
 * 2. 0원 결제 / 무료 쿠폰(FREE-) / 전액 포인트(POINT-) / 회원권은 망취소 및 DLQ 대상에서 자동 제외
 * 3. 단말기 망취소 실패(거절 또는 통신 두절) 시 데드레터 큐(PaymentDLQ)로 즉시 긴급 리포트
 */

import { kioskVanClient } from './van_client';
import { api } from '../api';
import { TimeMaster } from '../../utils/timeMaster';
import type { CardApprovalResult } from './van_types';

export interface ExecuteAutoReversalParams {
  cardApproval: CardApprovalResult | undefined;
  payAmount: number;
  reason: string;
  isTaxFree?: boolean;
  terminalId?: string;
  storeCd?: string;
}

export interface AutoReversalResult {
  success: boolean;
  message: string;
  dlqReported?: boolean;
  dlqId?: string;
  reversalAttempted: boolean;
}

export async function executeKioskAutoReversal(
  params: ExecuteAutoReversalParams
): Promise<AutoReversalResult> {
  const { cardApproval, payAmount, reason, isTaxFree = false, terminalId, storeCd } = params;
  const apprStr = String((cardApproval as any)?.apprNo || cardApproval?.auth_code || '');

  // 1. 0원 결제, 무료 쿠폰(FREE-), 전액 포인트(POINT-), 회원권(MEMBERSHIP) 등은 망취소 대상 아님
  if (
    !cardApproval ||
    !apprStr ||
    apprStr.startsWith('FREE-') ||
    apprStr.startsWith('POINT-') ||
    apprStr === 'MEMBERSHIP' ||
    (cardApproval.amount !== undefined && cardApproval.amount <= 0) ||
    payAmount <= 0
  ) {
    return {
      success: false,
      reversalAttempted: false,
      message: '0원 결제 또는 카드 승인 정보가 없어 자동 취소를 생략합니다.',
    };
  }

  // 2. VAN 단말기 망취소 시도 (2-Phase Commit 보상 트랜잭션)
  try {
    const orgDate =
      (cardApproval.approved_at || '').replace(/[^0-9]/g, '').slice(0, 8) ||
      TimeMaster.getKstYmd(new Date()).replace(/-/g, '');
    const cancelRes = await kioskVanClient.cancelCardPayment({
      amount: payAmount || cardApproval.amount,
      orgAuthCode: cardApproval.auth_code,
      orgApprovedDate: orgDate,
      terminalId: cardApproval.terminal_id || terminalId,
      vanTrNo: cardApproval.van_tr_no,
      installmentMonths: cardApproval.installment_months || 0,
      isTaxFree,
      reason: `무인 키오스크 장애: ${reason}`,
    });

    if (cancelRes.success) {
      return {
        success: true,
        reversalAttempted: true,
        message: '전산 처리 오류로 카드 결제가 자동 취소(망취소)되었습니다. 카드를 챙겨주세요.',
      };
    } else {
      // 🚨 [고아 결제(Ghost Charge) 긴급 DLQ 보고]
      let dlqId: string | undefined;
      let dlqReported = false;
      try {
        const dlqRes = await api.reportGhostCharge({
          store_cd: storeCd,
          terminalId: cardApproval.terminal_id || terminalId || 'KIOSK-01',
          deviceType: 'KIOSK',
          authNo: cardApproval.auth_code,
          amount: payAmount || cardApproval.amount,
          cardName: cardApproval.issuer_name || '',
          cardNoMasked: cardApproval.card_no_masked || '',
          vanTrNo: cardApproval.van_tr_no,
          approvedAt: cardApproval.approved_at,
          backendErrorReason: reason,
          reversalErrorReason: cancelRes.error_message || '단말기 미응답/거절',
        });
        dlqReported = Boolean(dlqRes?.success);
        dlqId = dlqRes?.dlq_id;
      } catch (err) {
        console.error('[DLQ] report error:', err);
      }

      return {
        success: false,
        reversalAttempted: true,
        dlqReported,
        dlqId,
        message: `카드 자동 취소 실패 (${cancelRes.error_message || '단말기 미응답'}). 관제 시스템에 긴급 접수되었습니다. 영수증을 지참하여 직원에게 문의하세요.`,
      };
    }
  } catch (err: any) {
    // 🚨 [고아 결제(Ghost Charge) 긴급 DLQ 보고: 망취소 통신 예외 발생 시]
    let dlqId: string | undefined;
    let dlqReported = false;
    try {
      const dlqRes = await api.reportGhostCharge({
        store_cd: storeCd,
        terminalId: cardApproval.terminal_id || terminalId || 'KIOSK-01',
        deviceType: 'KIOSK',
        authNo: cardApproval.auth_code,
        amount: payAmount || cardApproval.amount,
        cardName: cardApproval.issuer_name || '',
        cardNoMasked: cardApproval.card_no_masked || '',
        vanTrNo: cardApproval.van_tr_no,
        approvedAt: cardApproval.approved_at,
        backendErrorReason: reason,
        reversalErrorReason: `망취소 통신 오류: ${err?.message || '단말기 연결 실패'}`,
      });
      dlqReported = Boolean(dlqRes?.success);
      dlqId = dlqRes?.dlq_id;
    } catch (dlqErr) {
      console.error('[DLQ] report error:', dlqErr);
    }

    return {
      success: false,
      reversalAttempted: true,
      dlqReported,
      dlqId,
      message: `망취소 통신 오류: ${err?.message || '단말기 연결 실패'}. 관제 시스템에 긴급 접수되었습니다.`,
    };
  }
}
