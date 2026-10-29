import { kioskHardwareBridge } from '../services/hardware/services/HardwareBridgeClient';
import type { ReceiptPrintData, ReceiptStoreData, PrintResult } from '../services/hardware/types/hardware_types';
import { TimeMaster } from './timeMaster';

export interface KioskBayAllocationSlipOptions {
  bayNo: number | string;
  oldBayNo?: number | string;
  floor?: string | number | null;
  resId?: string;
  memberName?: string;
  memberNo?: string | null;
  productName?: string;
  actionLabel?: string;
  checkinMode?: string;
  durationMin?: number;
  startTime?: string | null;
  endTime?: string | null;
  remainInfo?: string;
  extraNote?: string;
  storeInfo: ReceiptStoreData;
  tradeDt?: string;
}

export interface KioskLockerSlipOptions {
  lockerNo: number | string;
  memberName?: string;
  memberNo?: string | null;
  productName?: string;
  actionLabel?: string;
  startDate?: string | null;
  endDate?: string | null;
  days?: number;
  extraNote?: string;
  storeInfo: ReceiptStoreData;
  tradeDt?: string;
}

export function formatKioskHhMm(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}:${trimmed.slice(2, 4)}`;
  }
  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }
  return trimmed;
}

export function formatKioskYmd(raw?: string | null): string {
  if (!raw) return '-';
  const clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return String(raw).slice(0, 10);
}

export function buildKioskBayAllocationSlipPayload(options: KioskBayAllocationSlipOptions): ReceiptPrintData {
  const nowStr = options.tradeDt || TimeMaster.formatKstDateTime(new Date());
  const startHhMm = formatKioskHhMm(options.startTime) || nowStr.slice(11, 16);
  const endHhMm = formatKioskHhMm(options.endTime);

  const isMoveBay = options.checkinMode === 'MOVE_BAY';
  const isPreCheckin = options.checkinMode === 'PRE_CHECKIN';
  const isPendingWait = options.checkinMode === 'PENDING_WAIT';
  const isReprint = options.checkinMode === 'REPRINT';

  const headerMessage = isMoveBay
    ? '★ [ 타 석 이 동 확 인 표 ] ★'
    : isPreCheckin
      ? '★ [ 사 전 체 크 인 확 인 표 ] ★'
      : isPendingWait
        ? '★ [ 체 크 인 대 기 확 인 표 ] ★'
        : isReprint
          ? '★ [ 타 석 배 정 표 (재출력) ] ★'
          : '★ [ 타 석 배 정 표 ] ★';

  const floorStr = options.floor
    ? String(options.floor).toUpperCase().endsWith('F') || String(options.floor).includes('층')
      ? String(options.floor)
      : `${options.floor}F`
    : '';

  const bayStr = !isNaN(Number(options.bayNo))
    ? `${String(options.bayNo).padStart(2, '0')}번 타석`
    : String(options.bayNo);

  const oldBayStr = options.oldBayNo !== undefined && options.oldBayNo !== null
    ? (!isNaN(Number(options.oldBayNo)) ? `${String(options.oldBayNo).padStart(2, '0')}번` : String(options.oldBayNo))
    : '';

  const badgeText = isMoveBay && oldBayStr
    ? `${oldBayStr} → ${bayStr}`
    : (floorStr && !bayStr.includes(floorStr) ? `${floorStr} - ${bayStr}` : bayStr);

  const resolvedActionLabel = options.actionLabel || (
    isMoveBay
      ? '타석 이동'
      : isPreCheckin
        ? '사전예약 체크인'
        : isPendingWait
          ? '체크인 대기'
          : isReprint
            ? '배정표 재출력'
            : '타석 배정'
  );

  const timeRangeStr = endHhMm ? `${startHhMm} ~ ${endHhMm}` : `${startHhMm} ~ 종료시`;
  const durationLabelStr = options.durationMin && options.durationMin > 0 ? `${options.durationMin}분` : '';

  const footerMessage = isMoveBay
    ? `변경된 ${bayStr}으로 이동하여 연습을 계속해 주십시오.`
    : isPreCheckin
      ? '예약시간 정각에 타석 전원이 자동 가동됩니다.'
      : isPendingWait
        ? '앞 타임 종료 즉시 타석이 가동됩니다.'
        : '';

  const cleanTimeToken = startHhMm.replace(/[^0-9]/g, '') || nowStr.slice(11, 16).replace(/[^0-9]/g, '');
  const cleanBayToken = String(options.bayNo).replace(/[^0-9A-Za-z]/g, '') || '0';

  return {
    sale_id: options.resId ? `SLIP-${options.resId}` : `SLIP-BAY-${cleanBayToken}-${Date.now()}`,
    receipt_no: options.resId ? `TICK-${options.resId.slice(-6)}` : `BAY-${cleanBayToken}-${cleanTimeToken}`,
    trade_dt: nowStr,
    bay_no: options.bayNo,
    bayNo: options.bayNo,
    use_minutes: options.durationMin,
    useMinutes: options.durationMin,
    start_time: startHhMm,
    startTime: startHhMm,
    end_time: endHhMm || undefined,
    endTime: endHhMm || undefined,
    member_name: options.memberName || '회원',
    member_no: options.memberNo || undefined,
    pay_method: 'ALLOCATION_SLIP',
    client_type: 'KIOSK',
    store_info: options.storeInfo,
    items: [
      {
        name: badgeText,
        qty: 1,
        unit_price: 0,
        amount: 0,
      },
    ],
    tax_summary: {
      supply_amt: 0,
      tax_amt: 0,
      tax_free_amt: 0,
      total_amt: 0,
      discount_amt: 0,
      pay_amt: 0,
    },
    slip_meta: {
      title: headerMessage,
      badge_text: badgeText,
      action_label: resolvedActionLabel,
      product_name: options.productName || '타석 이용',
      time_range: timeRangeStr,
      duration_label: durationLabelStr,
      remain_info: options.remainInfo || '',
      extra_note: options.extraNote || '',
    },
    barcode_text: `BAY-${cleanBayToken}-${cleanTimeToken}`,
    header_message: headerMessage,
    footer_message: footerMessage,
    print_mode: 'AUTO',
    open_cash_drawer: false,
  };
}

export async function printKioskBayAllocationSlip(options: KioskBayAllocationSlipOptions): Promise<PrintResult> {
  const payload = buildKioskBayAllocationSlipPayload(options);
  return kioskHardwareBridge.printReceipt(payload);
}

export function buildKioskLockerSlipPayload(options: KioskLockerSlipOptions): ReceiptPrintData {
  const nowStr = options.tradeDt || TimeMaster.formatKstDateTime(new Date());
  const startDateStr = formatKioskYmd(options.startDate);
  const endDateStr = formatKioskYmd(options.endDate);
  const cleanLockerStr = String(options.lockerNo).replace(/번$/, '').trim();
  const badgeText = `라카 NO. ${cleanLockerStr}번`;
  const durationLabel = options.days && options.days > 0 ? `${options.days}일` : '';

  return {
    sale_id: `SLIP-LOCKER-${cleanLockerStr}-${Date.now()}`,
    receipt_no: `LCK-${cleanLockerStr}-${nowStr.slice(11, 16).replace(':', '')}`,
    trade_dt: nowStr,
    member_name: options.memberName || '회원',
    member_no: options.memberNo || undefined,
    pay_method: 'LOCKER_SLIP',
    client_type: 'KIOSK',
    store_info: options.storeInfo,
    items: [
      {
        name: badgeText,
        qty: 1,
        unit_price: 0,
        amount: 0,
      },
    ],
    tax_summary: {
      supply_amt: 0,
      tax_amt: 0,
      tax_free_amt: 0,
      total_amt: 0,
      discount_amt: 0,
      pay_amt: 0,
    },
    slip_meta: {
      title: '★ [ 라 카 배 정 확 인 증 ] ★',
      badge_text: badgeText,
      action_label: options.actionLabel || '라카 대여/연장',
      product_name: options.productName || `${cleanLockerStr}번 개인 사물함`,
      start_date: startDateStr,
      end_date: endDateStr,
      duration_label: durationLabel,
      extra_note: options.extraNote || '',
    },
    barcode_text: `LCK-${cleanLockerStr}`,
    header_message: '★ [ 라 카 배 정 확 인 증 ] ★',
    footer_message: '기간 만료 후 미연장 시 보관 물품이 회수될 수 있으니 만료일을 확인해 주세요.',
    print_mode: 'AUTO',
    open_cash_drawer: false,
  };
}

export async function printKioskLockerSlip(options: KioskLockerSlipOptions): Promise<PrintResult> {
  const payload = buildKioskLockerSlipPayload(options);
  return kioskHardwareBridge.printReceipt(payload);
}
