/**
 * [키오스크 전용 ESC/POS 감열식 서멀 영수증/배정표 프린터 드라이버]
 * 58mm / 80mm 감열식 영수증 프린터 지원
 */

export interface KioskReceiptPrintData {
  storeName: string;
  storeTel?: string;
  receiptNo: string;
  tradeDate: string;
  bayNo?: number | string;
  memberName?: string;
  useMinutes?: number;
  startTime?: string;
  endTime?: string;
  payAmount: number;
  cardInfo?: {
    issuerName: string;
    cardNoMasked: string;
    approvalNo: string;
    terminalId: string;
  };
}

export class KioskEscPosPrinterService {
  private width: 58 | 80 = 80;

  constructor(width: 58 | 80 = 80) {
    this.width = width;
  }

  public buildReceiptBuffer(data: KioskReceiptPrintData): Uint8Array {
    const colWidth = this.width === 58 ? 32 : 42;
    const divider = '-'.repeat(colWidth);
    const dblDivider = '='.repeat(colWidth);

    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];

    const append = (str: string) => parts.push(encoder.encode(str));
    const appendBytes = (...bytes: number[]) => parts.push(new Uint8Array(bytes));

    // 1. 프린터 초기화
    appendBytes(0x1b, 0x40);

    // 2. 헤더
    appendBytes(0x1b, 0x61, 0x01); // Center Align
    appendBytes(0x1d, 0x21, 0x11); // Double Size
    append(`${data.storeName}\n`);
    appendBytes(0x1d, 0x21, 0x00); // Normal Size
    append(`[타석 배정표 및 영수증]\n\n`);

    // 3. 배정 타석 정보 (크고 굵게)
    if (data.bayNo) {
      appendBytes(0x1d, 0x21, 0x11); // Double Size
      append(`타석 번호: [ ${data.bayNo}번 ]\n`);
      appendBytes(0x1d, 0x21, 0x00); // Normal Size
      append(`${dblDivider}\n`);
    }

    // 4. 이용 시간
    appendBytes(0x1b, 0x61, 0x00); // Left Align
    if (data.memberName) append(`회 원 명: ${data.memberName}\n`);
    if (data.useMinutes) append(`이용시간: ${data.useMinutes}분\n`);
    if (data.startTime && data.endTime) append(`이용구간: ${data.startTime} ~ ${data.endTime}\n`);
    append(`거래일시: ${data.tradeDate}\n`);
    append(`영수증No: ${data.receiptNo}\n`);
    append(`${divider}\n`);

    // 5. 결제 금액
    append(`결제금액: ${data.payAmount.toLocaleString()}원\n`);
    if (data.cardInfo) {
      append(`카드정보: ${data.cardInfo.issuerName} (${data.cardInfo.cardNoMasked})\n`);
      append(`승인번호: ${data.cardInfo.approvalNo}\n`);
      append(`단말기ID: ${data.cardInfo.terminalId}\n`);
    }
    append(`${dblDivider}\n`);

    // 6. 푸터
    appendBytes(0x1b, 0x61, 0x01); // Center Align
    append(`배정된 타석으로 이동해 주시기 바랍니다.\n이용해 주셔서 감사합니다.\n\n`);

    // 7. 용지 절단
    appendBytes(0x1b, 0x64, 0x04); // Feed 4 lines
    appendBytes(0x1d, 0x56, 0x41, 0x00); // Full Cut

    const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of parts) {
      result.set(p, offset);
      offset += p.length;
    }
    return result;
  }

  public async printReceipt(data: KioskReceiptPrintData): Promise<{ success: boolean; message: string }> {
    const buffer = this.buildReceiptBuffer(data);

    // VCAT 9099 포트로 Raw Print 시도
    try {
      const res = await fetch('http://127.0.0.1:9099/vcat/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer as unknown as BodyInit,
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        return { success: true, message: '키오스크 서멀 프린터 출력 완료' };
      } else {
        return { success: false, message: `프린터 출력 실패 (상태: ${res.status})` };
      }
    } catch (err: unknown) {
      console.warn('[KioskPrinter] Printer daemon unreachable or print error:', err);
      return { success: false, message: '프린터 데몬 미동작 또는 용지 부족/연결 불량 상태입니다.' };
    }
  }
}

export const kioskEscPosPrinter = new KioskEscPosPrinterService(80);
