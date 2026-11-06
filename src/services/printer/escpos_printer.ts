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
  memberNo?: string;
  payMethod?: string;
  headerMessage?: string;
  footerMessage?: string;
  slipMeta?: {
    title?: string;
    badge_text?: string;
    target_label?: string;
    action_label?: string;
    product_name?: string;
    time_range?: string;
    duration_label?: string;
    remain_info?: string;
    start_date?: string;
    end_date?: string;
    extra_note?: string;
  };
  itemName?: string;
  items?: Array<{
    name: string;
    qty: number;
    unit_price: number;
    amount: number;
    discount_amt?: number;
    is_tax_free?: boolean;
  }>;
  useMinutes?: number;
  startTime?: string;
  endTime?: string;
  payAmount: number;
  supplyAmt?: number;
  vatAmt?: number;
  taxFreeAmt?: number;
  discountAmt?: number;
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
    installmentMonths?: number;
    approvalDt?: string;
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

    // 2. 모드 판별
    const normalizedMethod = String(data.payMethod || '').toUpperCase();
    const isSlipMode = normalizedMethod === 'ALLOCATION_SLIP' || normalizedMethod === 'LOCKER_SLIP';
    const isLockerSlip = normalizedMethod === 'LOCKER_SLIP';

    if (isSlipMode) {
      // ===== [타석 배정표 / 라카 확인증 에코 다이어트 (약 5.0~5.5cm)] =====
      // 1) 상단 컴팩트 헤더: 매장명 (좌) + 발행일시 (우)
      appendBytes(0x1b, 0x61, 0x00); // Left Align
      const tradeShort = data.tradeDate
        ? (data.tradeDate.length > 16 ? data.tradeDate.slice(5, 16) : data.tradeDate)
        : '';
      append(`${formatTwoCol(data.storeName, tradeShort, colWidth)}\n`);
      append(`${divider}\n`);

      // 2) 메인 히어로: 배정 타석/라카 (2배 크기) + 이용시간
      const badgeLabel = data.slipMeta?.badge_text || (data.bayNo ? `${data.bayNo}번 타석` : '');
      const rawDuration = data.slipMeta?.duration_label || (data.useMinutes ? `${data.useMinutes}분` : '');
      const durationLabel = rawDuration ? (rawDuration.startsWith('(') ? rawDuration : `(${rawDuration})`) : '';
      const heroLine = durationLabel ? `${badgeLabel} ${durationLabel}` : badgeLabel;

      appendBytes(0x1b, 0x61, 0x01); // Center Align
      appendBytes(0x1d, 0x21, 0x11); // Double Size (Width & Height)
      append(`${heroLine}\n`);
      appendBytes(0x1d, 0x21, 0x00); // Normal Size

      if (isLockerSlip && data.slipMeta) {
        if (data.slipMeta.start_date && data.slipMeta.end_date) {
          append(`${data.slipMeta.start_date} ~ ${data.slipMeta.end_date}\n`);
        }
      } else if (data.slipMeta?.time_range) {
        append(`${data.slipMeta.time_range}\n`);
      } else if (data.startTime && data.endTime) {
        append(`${data.startTime} ~ ${data.endTime}\n`);
      }
      append(`${divider}\n`);

      // 3) 회원 정보 및 배정 구분 (컴팩트 1줄)
      appendBytes(0x1b, 0x61, 0x00); // Left Align
      if (data.memberName) {
        const custStr = data.memberNo && !data.memberName.includes(data.memberNo)
          ? `${data.memberName} (${data.memberNo})`
          : data.memberName;
        const rightLabel = data.slipMeta?.action_label || data.slipMeta?.product_name || '타석이용';
        append(`${formatTwoCol(`회원: ${custStr}`, rightLabel, colWidth)}\n`);
      } else if (data.slipMeta?.action_label) {
        append(`${formatTwoCol('구분', data.slipMeta.action_label, colWidth)}\n`);
      }

      if (data.slipMeta?.remain_info) {
        append(`${formatTwoCol('잔여', data.slipMeta.remain_info, colWidth)}\n`);
      }
      if (data.slipMeta?.extra_note) {
        append(`${formatTwoCol('안내', data.slipMeta.extra_note, colWidth)}\n`);
      }
      append(`${divider}\n`);

      // 4) [Code128 5mm 슬림 출입 바코드] (스캔 인식 100% 보장)
      const barcode = data.barcodeText || (data.bayNo ? `BAY-${data.bayNo}-${data.receiptNo.slice(-6)}` : undefined);
      if (barcode) {
        appendBytes(0x1b, 0x61, 0x01); // Center Align
        // 5mm 슬림 바코드: GS h 40 (0x28), GS w 2
        appendBytes(0x1d, 0x68, 0x28); // 바코드 높이 40 dot (약 5mm)
        appendBytes(0x1d, 0x77, 0x02); // 바코드 폭 2
        appendBytes(0x1d, 0x48, 0x00); // HRI 문자 내장 출력 비활성화
        
        const bBytes = encoder.encode(barcode);
        const code128Payload = [0x7b, 0x42, ...Array.from(bBytes)];
        appendBytes(0x1d, 0x6b, 0x49, code128Payload.length, ...code128Payload);
        append(`\n${barcode} [게이트출입]\n`);
      }

      // 5) 절단 여백 1줄 최소화 (Feed 1 line) + Full Cut
      appendBytes(0x1b, 0x64, 0x01); // Feed 1 line
      appendBytes(0x1d, 0x56, 0x41, 0x00); // Full Cut
    } else {
      // ===== [신용카드 매출전표 / 현금영수증 슬림화 (약 6.0cm)] =====
      // 1) 헤더 및 가맹점 사업자 정보 (컴팩트 압축)
      appendBytes(0x1b, 0x61, 0x00); // Left Align
      const headerTitle = data.headerMessage || (data.cashInfo ? '[ 현금영수증 (고객용) ]' : '[ 신용카드 매출전표 (고객용) ]');
      append(`${formatTwoCol(headerTitle, '고객용', colWidth)}\n`);

      const bizParts = [data.storeName, data.bizNo, data.ceoName].filter(Boolean);
      if (bizParts.length > 0) {
        append(`${bizParts.join(' / ')}\n`);
      }
      if (data.storeTel) {
        append(`TEL: ${data.storeTel}\n`);
      }
      append(`${divider}\n`);

      // 2) 카드 승인 / 거래 정보
      const resolvedIssuer = data.cardInfo?.issuerName || data.cardIssuer || '신용카드';
      const resolvedCardNo = data.cardInfo?.cardNoMasked || data.cardNoMasked || '****';
      const resolvedApprNo = data.cardInfo?.approvalNo || data.approvalNo || '-';
      const resolvedTermId = data.cardInfo?.terminalId || data.terminalId;
      const installment = (data.cardInfo?.installmentMonths ?? 0) > 0 ? `${data.cardInfo?.installmentMonths}개월` : '일시불';

      if (data.cashInfo) {
        append(`${formatTwoCol('현금영수증', data.cashInfo.receiptType || '소득공제', colWidth)}\n`);
        append(`${formatTwoCol('승인번호', data.cashInfo.approvalNo || '-', colWidth)}\n`);
      } else {
        append(`${formatTwoCol('카드종류', `${resolvedIssuer} (${resolvedCardNo})`, colWidth)}\n`);
        append(`${formatTwoCol('승인번호', resolvedApprNo, colWidth)}\n`);
      }
      if (resolvedTermId) {
        append(`${formatTwoCol('단말기ID', resolvedTermId, colWidth)}\n`);
      }
      append(`${formatTwoCol('거래일시', `${data.tradeDate} (${installment})`, colWidth)}\n`);
      append(`${divider}\n`);

      // 3) 금액 내역
      const resolvedItemName = data.itemName || (data.items && data.items.length > 0 ? data.items.map((i) => i.name).join(', ') : '타석 이용');
      append(`${formatTwoCol('상 품 명', resolvedItemName, colWidth)}\n`);
      if (data.discountAmt !== undefined && data.discountAmt > 0) {
        append(`${formatTwoCol('할인금액', `-${data.discountAmt.toLocaleString()}원`, colWidth)}\n`);
      }
      if (data.supplyAmt !== undefined && data.vatAmt !== undefined) {
        append(`${formatTwoCol('공급가/세액', `${data.supplyAmt.toLocaleString()}원 / ${data.vatAmt.toLocaleString()}원`, colWidth)}\n`);
      }

      appendBytes(0x1d, 0x21, 0x01); // Double Height
      append(`${formatTwoCol('합계금액', `${data.payAmount.toLocaleString()}원`, colWidth)}\n`);
      appendBytes(0x1d, 0x21, 0x00); // Normal Size
      append(`${dblDivider}\n`);

      // 🚨 영수증에는 출입 게이트 바코드를 출력하지 않음! (바코드는 배정표에만 존재)
      // 절단 여백 1줄 최소화 (Feed 1 line) + Full Cut
      appendBytes(0x1b, 0x64, 0x01); // Feed 1 line
      appendBytes(0x1d, 0x56, 0x41, 0x00); // Full Cut
    }

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
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const okJson = await res.json().catch(() => ({ success: true }));
          if (okJson && okJson.success === false) {
            return { success: false, message: okJson.message || `프린터 출력 실패 (포트 ${port})` };
          }
          return { success: true, message: `키오스크 서멀 프린터 출력 완료 (포트 ${port})` };
        }
        // 브릿지 데몬이 응답했으나 용지 소진/커버 열림/오프라인(HTTP 500)인 경우 중복 재전송 없이 즉시 사유 반환
        const errJson = await res.json().catch(() => null);
        if (errJson?.message) {
          return { success: false, message: errJson.message };
        }
        return { success: false, message: `프린터 출력 실패 (HTTP ${res.status})` };
      } catch (err: unknown) {
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'TimeoutError' || errName === 'AbortError') {
          return { success: false, message: '프린터 출력 응답 대기 시간 초과' };
        }
        // 연결 거부(데몬 미구동 포트)인 경우에만 다음 포트 시도
      }
    }

    // 2. WebSerial API 시도 (직접 연결 프린터, 3000ms 타임아웃 + 안전 리소스 해제)
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      try {
        // @ts-expect-error WebSerial experimental
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
          const port = ports[0];
          interface SerialPortWriter {
            write: (chunk: Uint8Array) => Promise<void>;
            releaseLock: () => void;
          }
          let writer = null as SerialPortWriter | null;
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          try {
            await Promise.race([
              (async () => {
                await port.open({ baudRate: 9600 });
                const serialWriter = port.writable.getWriter() as SerialPortWriter;
                writer = serialWriter;
                await serialWriter.write(buffer);
              })(),
              new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('WebSerial print timeout (3000ms)')), 3000);
              }),
            ]);
            return { success: true, message: '서멀 프린터(WebSerial) 출력 완료' };
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            if (writer) {
              try {
                writer.releaseLock();
              } catch {
                // ignore releaseLock error
              }
            }
            await port.close().catch(() => {});
          }
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
