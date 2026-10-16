/**
 * [키오스크 전용 ESC/POS 감열식 서멀 영수증/배정표 프린터 드라이버]
 * 58mm / 80mm 감열식 영수증 프린터 지원
 */

export interface KioskReceiptPrintData {
  storeName: string;
  storeTel?: string;
  bizNo?: string;
  ceoName?: string;
  address?: string;
  receiptNo: string;
  tradeDate: string;
  bayNo?: number | string;
  memberName?: string;
  itemName?: string;
  useMinutes?: number;
  startTime?: string;
  endTime?: string;
  payAmount: number;
  supplyAmt?: number;
  vatAmt?: number;
  taxFreeAmt?: number;
  cardIssuer?: string;
  cardNoMasked?: string;
  terminalId?: string;
  approvalNo?: string;
  barcodeText?: string;
  purchaseType?: 'MEMBERSHIP' | 'LOCKER' | 'DAILY' | 'PRODUCT';
  cardInfo?: {
    issuerName: string;
    cardNoMasked: string;
    approvalNo: string;
    terminalId: string;
  };
  cashInfo?: {
    approvalNo: string;
    receiptType?: string;
  };
}

export function getTextLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    len += code > 0x7f ? 2 : 1;
  }
  return len;
}

export function formatTwoCol(left: string, right: string, totalWidth: number = 42): string {
  const leftLen = getTextLength(left);
  const rightLen = getTextLength(right);
  const spaces = Math.max(1, totalWidth - leftLen - rightLen);
  return `${left}${' '.repeat(spaces)}${right}`;
}

export function formatRow(
  cols: Array<{ text: string; width: number; align?: 'left' | 'right' | 'center' }>
): string {
  return cols
    .map(({ text, width, align = 'left' }) => {
      const len = getTextLength(text);
      const pad = Math.max(0, width - len);
      if (align === 'right') return `${' '.repeat(pad)}${text}`;
      if (align === 'center') {
        const leftPad = Math.floor(pad / 2);
        const rightPad = pad - leftPad;
        return `${' '.repeat(leftPad)}${text}${' '.repeat(rightPad)}`;
      }
      return `${text}${' '.repeat(pad)}`;
    })
    .join('');
}

export class KioskEscPosPrinterService {
  private width: 58 | 80 = 80;

  constructor(width: 58 | 80 = 80) {
    this.width = width;
  }

  public getTextLength(str: string): number {
    return getTextLength(str);
  }

  public formatTwoCol(left: string, right: string, totalWidth?: number): string {
    return formatTwoCol(left, right, totalWidth ?? (this.width === 58 ? 32 : 42));
  }

  public formatRow(cols: Array<{ text: string; width: number; align?: 'left' | 'right' | 'center' }>): string {
    return formatRow(cols);
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

    // 2. 헤더 및 가맹점 사업자 정보
    appendBytes(0x1b, 0x61, 0x01); // Center Align
    appendBytes(0x1d, 0x21, 0x11); // Double Size
    append(`${data.storeName}\n`);
    appendBytes(0x1d, 0x21, 0x00); // Normal Size
    append(`[타석 배정표 및 영수증]\n`);
    if (data.bizNo || data.ceoName) {
      append(`사업자: ${data.bizNo || '-'} / 대표: ${data.ceoName || '-'}\n`);
    }
    if (data.storeTel) {
      append(`TEL: ${data.storeTel}\n`);
    }
    if (data.address) {
      append(`${data.address}\n`);
    }
    append(`\n`);

    // 3. 배정 타석 정보 (크고 굵게)
    if (data.bayNo) {
      appendBytes(0x1d, 0x21, 0x11); // Double Size
      append(`타석 번호: [ ${data.bayNo}번 ]\n`);
      appendBytes(0x1d, 0x21, 0x00); // Normal Size
      append(`${dblDivider}\n`);
    }

    // 4. 이용 시간 / 고객 정보
    appendBytes(0x1b, 0x61, 0x00); // Left Align
    if (data.memberName) append(`${formatTwoCol('회 원 명', data.memberName, colWidth)}\n`);
    if (data.itemName) append(`${formatTwoCol('상 품 명', data.itemName, colWidth)}\n`);
    if (data.useMinutes) append(`${formatTwoCol('이용시간', `${data.useMinutes}분`, colWidth)}\n`);
    if (data.startTime && data.endTime) append(`${formatTwoCol('이용구간', `${data.startTime} ~ ${data.endTime}`, colWidth)}\n`);
    append(`${formatTwoCol('거래일시', data.tradeDate, colWidth)}\n`);
    append(`${formatTwoCol('영수증No', data.receiptNo, colWidth)}\n`);
    append(`${divider}\n`);

    // 5. 과세/면세 세액 및 결제 금액
    if (data.supplyAmt !== undefined) {
      append(`${formatTwoCol('공급가액', `${data.supplyAmt.toLocaleString()}원`, colWidth)}\n`);
    }
    if (data.vatAmt !== undefined) {
      append(`${formatTwoCol('부 가 세', `${data.vatAmt.toLocaleString()}원`, colWidth)}\n`);
    }
    if (data.taxFreeAmt !== undefined && data.taxFreeAmt > 0) {
      append(`${formatTwoCol('면세금액', `${data.taxFreeAmt.toLocaleString()}원`, colWidth)}\n`);
    }
    append(`${formatTwoCol('결제금액', `${data.payAmount.toLocaleString()}원`, colWidth)}\n`);

    const resolvedIssuer = data.cardInfo?.issuerName || data.cardIssuer;
    const resolvedCardNo = data.cardInfo?.cardNoMasked || data.cardNoMasked;
    const resolvedApprNo = data.cardInfo?.approvalNo || data.approvalNo;
    const resolvedTermId = data.cardInfo?.terminalId || data.terminalId;

    if (resolvedIssuer || resolvedCardNo || resolvedApprNo || resolvedTermId) {
      append(`${divider}\n`);
      if (resolvedIssuer || resolvedCardNo) {
        append(`${formatTwoCol('카드정보', `${resolvedIssuer || '신용카드'} (${resolvedCardNo || '****'})`, colWidth)}\n`);
      }
      if (resolvedApprNo) {
        append(`${formatTwoCol('승인번호', resolvedApprNo, colWidth)}\n`);
      }
      if (resolvedTermId) {
        append(`${formatTwoCol('단말기ID', resolvedTermId, colWidth)}\n`);
      }
    } else if (data.cashInfo) {
      append(`${divider}\n`);
      append(`${formatTwoCol('현금영수증', data.cashInfo.receiptType || '소득공제', colWidth)}\n`);
      append(`${formatTwoCol('승인번호', data.cashInfo.approvalNo, colWidth)}\n`);
    }
    append(`${dblDivider}\n`);

    // 6. [Code128 출입 바코드] (게이트 통과용)
    const barcode = data.barcodeText || (data.bayNo ? `BAY-${data.bayNo}-${data.receiptNo.slice(-6)}` : undefined);
    if (barcode) {
      appendBytes(0x1b, 0x61, 0x01); // Center Align
      append(`[출입 게이트 태깅 바코드]\n`);
      
      // Code128 바코드 커맨드: GS h 80, GS w 2, GS H 2, GS k 73 {n} {data}
      appendBytes(0x1d, 0x68, 0x50); // 바코드 높이 80 dot
      appendBytes(0x1d, 0x77, 0x02); // 바코드 폭 2
      appendBytes(0x1d, 0x48, 0x02); // HRI 문자 바코드 아래 인쇄
      
      // Code128-B 인코딩 ({B prefix = 0x7B, 0x42)
      const bBytes = encoder.encode(barcode);
      const code128Payload = [0x7b, 0x42, ...Array.from(bBytes)];
      appendBytes(0x1d, 0x6b, 0x49, code128Payload.length, ...code128Payload);
      append(`\n\n`);
    }

    // 7. 푸터
    appendBytes(0x1b, 0x61, 0x01); // Center Align
    append(`배정된 타석으로 이동해 주시기 바랍니다.\n이용해 주셔서 감사합니다.\n\n`);

    // 8. 용지 절단 (Full Cut)
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

    // 1. VCAT 8090 및 9099 포트 순차 시도
    const targetPorts = [8090, 9099];
    for (const port of targetPorts) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/vcat/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer as unknown as BodyInit,
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          return { success: true, message: `키오스크 서멀 프린터 출력 완료 (포트 ${port})` };
        }
      } catch {
        // 다음 포트 시도
      }
    }

    // 2. WebSerial API 시도 (직접 연결 프린터)
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      try {
        // @ts-expect-error WebSerial experimental
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
          const port = ports[0];
          await port.open({ baudRate: 9600 });
          const writer = port.writable.getWriter();
          await writer.write(buffer);
          writer.releaseLock();
          await port.close();
          return { success: true, message: '서멀 프린터(WebSerial) 출력 완료' };
        }
      } catch (e) {
        console.warn('[KioskPrinter] WebSerial print error:', e);
      }
    }

    console.warn('[KioskPrinter] Printer daemon unreachable on ports 8090/9099. Falling back silently.');
    return { success: false, message: '프린터 데몬 미동작 또는 용지 부족/연결 불량 상태입니다.' };
  }
}

export const kioskEscPosPrinter = new KioskEscPosPrinterService(80);
