/**
 * [키오스크 자동 전원 관리(ON/OFF) 무소음 부팅 체크인]
 * - 키오스크 부팅 시 로컬 하드웨어 브릿지(vcat_bridge.py :18080/health)에서
 *   유선 물리 NIC MAC 주소 및 매장 사설 LAN IPv4를 수집합니다.
 * - 백엔드 POST /api/v1/terminals/wol-checkin으로 자동 등록하고,
 *   응답받은 매장 전용 종료 인증키(power_control_key)를 루프백 브릿지
 *   POST /api/v1/system/register-power-key에 저장합니다.
 * - UI 변화 0px / 네트워크·브릿지 미연결 시 완전 무소음 무시 (키오스크 영업 무영향).
 */

import { api } from '../api';
import { getKioskSettings } from '../../stores/kioskSettings';

const DEFAULT_BRIDGE_ORIGIN = 'http://127.0.0.1:18080';

interface BridgeHealthNetworkPayload {
  network?: {
    mac_address?: string | null;
    lan_ip?: string | null;
    adapter_name?: string | null;
  };
  power_key_configured?: boolean;
}

interface WolCheckinResponsePayload {
  success?: boolean;
  matched_device_id?: string | null;
  mac_address?: string | null;
  lan_ip?: string | null;
  updated?: boolean;
  power_control_key?: string | null;
}

let lastCheckedStoreCd: string | null = null;
let inFlightCheckin = false;

export function resetKioskPowerCheckinState(): void {
  lastCheckedStoreCd = null;
  inFlightCheckin = false;
}

export async function runKioskPowerNetworkCheckin(options?: {
  bridgeOrigin?: string;
  force?: boolean;
}): Promise<boolean> {
  const settings = getKioskSettings();
  const storeCd = (settings.storeCode || api.getStoreCd() || '').trim();
  if (!storeCd) return false;

  if (!options?.force && (inFlightCheckin || lastCheckedStoreCd === storeCd)) {
    return false;
  }

  const bridgeOrigin = (options?.bridgeOrigin || DEFAULT_BRIDGE_ORIGIN).replace(/\/+$/, '');
  inFlightCheckin = true;

  try {
    const healthRes = await fetch(`${bridgeOrigin}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    if (!healthRes.ok) {
      return false;
    }
    const healthJson = (await healthRes.json().catch(() => ({}))) as BridgeHealthNetworkPayload;
    const macAddress =
      typeof healthJson?.network?.mac_address === 'string'
        ? healthJson.network.mac_address.trim()
        : '';
    const lanIp =
      typeof healthJson?.network?.lan_ip === 'string'
        ? healthJson.network.lan_ip.trim()
        : '';

    const checkinRes = await fetch(`${api.getBaseUrl()}/v1/terminals/wol-checkin`, {
      method: 'POST',
      headers: api.getSecureHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        device_id: settings.deviceId || undefined,
        device_type: 'KIOSK',
        terminal_id: settings.terminalId || undefined,
        mac_address: macAddress || undefined,
        lan_ip: lanIp || undefined,
        store_cd: storeCd,
      }),
      signal: AbortSignal.timeout(3500),
    });
    if (!checkinRes.ok) {
      return false;
    }

    const checkinJson = (await checkinRes.json().catch(() => ({}))) as WolCheckinResponsePayload;
    const powerKey =
      typeof checkinJson?.power_control_key === 'string'
        ? checkinJson.power_control_key.trim()
        : '';

    if (powerKey && (!healthJson?.power_key_configured || options?.force)) {
      await fetch(`${bridgeOrigin}/api/v1/system/register-power-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ power_control_key: powerKey }),
        signal: AbortSignal.timeout(2500),
      }).catch(() => undefined);
    }

    // 브릿지 부팅 직후 NIC 백그라운드 워밍업 중(mac/lan_ip 미수집)이었다면 3초 뒤 1회 재시도해 완전 등록 보장
    if (!macAddress && !lanIp && !options?.force) {
      setTimeout(() => {
        void runKioskPowerNetworkCheckin({ bridgeOrigin, force: true });
      }, 3000);
      return true;
    }

    lastCheckedStoreCd = storeCd;
    return true;
  } catch {
    return false;
  } finally {
    inFlightCheckin = false;
  }
}
