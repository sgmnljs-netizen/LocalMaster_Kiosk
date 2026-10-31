import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveDefaultVanPort,
  resolveVanStatusEndpointPath,
  KIOSK_DEVICE_OPTIONS,
  saveKioskSettings,
  setKioskAdminSessionToken,
  clearKioskAdminSession,
  getKioskAdminSessionToken,
} from '../../stores/kioskSettings';
import { probeKioskHardwareHealthOnce } from '../../hooks/useKioskHardwareHeartbeat';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const KIOSK_ROOT = path.resolve(__dirname, '../../..');

const storageMap = new Map<string, string>();
const localStoragePolyfill = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).localStorage = localStoragePolyfill;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: {
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '8000',
      pathname: '/kiosk',
      search: '',
      origin: 'http://127.0.0.1:8000',
    },
    navigator: {
      userAgent: 'Mozilla/5.0',
      platform: 'MacIntel',
      webdriver: false,
    },
    localStorage: localStoragePolyfill,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('Kiosk P3 Pre-Commercialization: Windows Ops, Multi-VAN Heartbeat & Admin Session Guards', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    clearKioskAdminSession();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearKioskAdminSession();
    vi.restoreAllMocks();
  });

  it('[P3-1 & P3-2] enforces CRLF on Windows scripts, Electron priority in run_kiosk_app.bat, and registry/firewall fixes in golfos_bootstrap.bat', () => {
    const winScripts = [
      path.join(KIOSK_ROOT, 'scripts/windows/run_kiosk_app.bat'),
      path.join(KIOSK_ROOT, 'scripts/windows/install_kiosk_shortcut.bat'),
      path.join(KIOSK_ROOT, 'scripts/windows/update_kiosk.ps1'),
      path.join(WORKSPACE_ROOT, 'LocalMaster_Ops/bootstrap/golfos_bootstrap.bat'),
    ];

    for (const filePath of winScripts) {
      const rawBuf = fs.readFileSync(filePath);
      const crlfCount = rawBuf.toString('binary').split('\r\n').length - 1;
      const stripped = rawBuf.toString('binary').replace(/\r\n/g, '');
      const bareLfCount = stripped.split('\n').length - 1;
      expect(crlfCount, `${path.basename(filePath)} must contain CRLF`).toBeGreaterThan(10);
      expect(bareLfCount, `${path.basename(filePath)} must have 0 bare LF`).toBe(0);
    }

    const kioskGitAttr = fs.readFileSync(path.join(KIOSK_ROOT, '.gitattributes'), 'utf-8');
    const opsGitAttr = fs.readFileSync(path.join(WORKSPACE_ROOT, 'LocalMaster_Ops/.gitattributes'), 'utf-8');
    expect(kioskGitAttr).toContain('*.bat text eol=crlf');
    expect(opsGitAttr).toContain('*.bat text eol=crlf');

    const runBat = fs.readFileSync(path.join(KIOSK_ROOT, 'scripts/windows/run_kiosk_app.bat'), 'utf-8');
    expect(runBat).toContain('C:\\GolfOS\\bin\\kiosk_server_url.txt');
    expect(runBat).toContain('C:\\GolfOS\\runtime\\electron\\electron.exe');
    expect(runBat).toContain('C:\\GolfOS\\electron\\main.cjs');

    const updatePs1 = fs.readFileSync(path.join(KIOSK_ROOT, 'scripts/windows/update_kiosk.ps1'), 'utf-8');
    expect(updatePs1).toContain('kiosk_server_url.txt');
    expect(updatePs1).toContain('@("ONLINE", "DEGRADED")');
    expect(updatePs1).toContain('Register-ScheduledTask');
    expect(updatePs1).toContain('Start-Process');
    // Must stay pure ASCII so Windows PowerShell 5.1 never breaks on UTF-8 without BOM
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7F]*$/.test(updatePs1)).toBe(true);

    const deployEdge = fs.readFileSync(path.join(WORKSPACE_ROOT, 'scripts/deploy_edge.sh'), 'utf-8');
    expect(deployEdge).toContain('${DIR_KIOSK}/scripts/windows/run_kiosk_app.bat');
    expect(deployEdge).toContain('${DIR_KIOSK}/electron/main.cjs');

    const bootstrapBat = fs.readFileSync(
      path.join(WORKSPACE_ROOT, 'LocalMaster_Ops/bootstrap/golfos_bootstrap.bat'),
      'utf-8'
    );
    expect(bootstrapBat).not.toContain('reg add "Registry::HKEY_USERS');
    expect(bootstrapBat).toContain('reg add "HKU\\.DEFAULT\\Control Panel\\Desktop"');
    expect(bootstrapBat).toContain('localport=8088,8089,8090,9099,18090');
  });

  it('[P3-4] maps multi-VAN default ports & status paths and removes unimplemented KOCES_VAN from UI options', () => {
    expect(resolveDefaultVanPort('KCP_VAN')).toBe('9099');
    expect(resolveDefaultVanPort('NICE_VAN')).toBe('8088');
    expect(resolveDefaultVanPort('SMARTRO_VAN')).toBe('8089');

    expect(resolveVanStatusEndpointPath('KCP_VAN')).toBe('/vcat/status');
    expect(resolveVanStatusEndpointPath('NICE_VAN')).toBe('/nice/status');
    expect(resolveVanStatusEndpointPath('SMARTRO_VAN')).toBe('/smartro/status');

    expect(KIOSK_DEVICE_OPTIONS.some((opt) => opt.providerType === 'KOCES_VAN')).toBe(false);

    const modalSrc = fs.readFileSync(
      path.join(KIOSK_ROOT, 'src/components/KioskSettingsModal.tsx'),
      'utf-8'
    );
    expect(modalSrc).not.toContain('value="KOCES_VAN"');
    expect(modalSrc).toContain('resolveDefaultVanPort(');
  });

  it('[P3-4] useKioskHardwareHeartbeat probes SMARTRO /smartro/status and detects :18080/health 200 DEGRADED (PAPER_OUT)', async () => {
    saveKioskSettings(
      {
        storeCode: 'S-P3-HB',
        deviceId: 'DEV_K2',
        providerType: 'SMARTRO_VAN',
        vcatPort: '8089',
      },
      { syncRemote: false }
    );

    const calledUrls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calledUrls.push(url);
      if (url === 'http://127.0.0.1:8089/smartro/status') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ isOnline: true, status: 'ONLINE' }),
        } as Response;
      }
      if (url === 'http://127.0.0.1:18080/health') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'DEGRADED',
            printer_status: 'PAPER_OUT',
            message: '감열지 소진(Paper Out) 상태입니다.',
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    const probeRes = await probeKioskHardwareHealthOnce();

    expect(calledUrls).toContain('http://127.0.0.1:8089/smartro/status');
    expect(calledUrls).toContain('http://127.0.0.1:18080/health');

    expect(probeRes.nextVcat).toBe('ONLINE');
    expect(probeRes.nextPrinter).toBe('OFFLINE');
    expect(probeRes.nextPrinterReason).toContain('감열지 소진');
  });

  it('[P3-5] pushKioskDeviceSettingsToServer snapshots X-Kiosk-Admin-Token before clearKioskAdminSession on modal close', async () => {
    let capturedPutHeaders: Record<string, string> | undefined;
    let resolveFetch!: (val: Response) => void;

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/kiosk/device-settings') && init?.method === 'PUT') {
        capturedPutHeaders = init.headers as Record<string, string>;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
    });

    setKioskAdminSessionToken('1999999999.OWNER.mock_hmac_sig');
    expect(getKioskAdminSessionToken()).toBe('1999999999.OWNER.mock_hmac_sig');

    saveKioskSettings(
      {
        storeCode: 'S-P3-SEC',
        deviceId: 'DEV_K1',
        terminalId: 'TID_K1',
        apiUrl: 'http://127.0.0.1:8000',
      },
      { syncRemote: true }
    );

    // Immediately clear session (simulating modal close right after save)
    clearKioskAdminSession();
    expect(getKioskAdminSessionToken()).toBeNull();

    resolveFetch({ ok: true, status: 200, json: async () => ({ has_saved_settings: true }) } as Response);
    await Promise.resolve();

    expect(capturedPutHeaders?.['X-Kiosk-Admin-Token']).toBe('1999999999.OWNER.mock_hmac_sig');
  });

  it('[P3-Audit] verifies SSH Session 0 guard in update_kiosk.ps1, server_url fallback in electron/main.cjs, HTTP 429 PIN lock propagation, and offline phone masking', async () => {
    const updatePs1Path = path.resolve(__dirname, '../../../scripts/windows/update_kiosk.ps1');
    const electronMainPath = path.resolve(__dirname, '../../../electron/main.cjs');
    const updatePs1Buf = fs.readFileSync(updatePs1Path);
    const updatePs1Str = updatePs1Buf.toString('utf8');
    // CRLF + pure ASCII + Session 0 guard
    expect(updatePs1Str.replace(/\r\n/g, '')).not.toContain('\n');
    expect([...updatePs1Buf].every((b) => b <= 0x7f)).toBe(true);
    expect(updatePs1Str).toContain('$currentSessionId -ne 0');

    const electronMainStr = fs.readFileSync(electronMainPath, 'utf8');
    expect(electronMainStr).toContain('kiosk_server_url.txt');

    const { api } = await import('../api');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: '관리자 PIN 연속 입력 오류로 59초간 잠금되었습니다.' }),
    } as Response);

    const pinRes = await api.verifyAdminPin('0000');
    expect(pinRes.valid).toBe(false);
    expect(pinRes.locked).toBe(true);
    expect(pinRes.message).toContain('59초');

    // Offline EdgeDB candidate phone masking & 1-char non-numeric rejection
    vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
    localStorage.setItem(
      'LM_MEMBERS',
      JSON.stringify([
        { member_no: 'M_OFF_1', member_name: '박가족일', masked_name: '박**일', hp: '010-2468-1357', status_cd: '10', use_yn: 'Y' },
        { member_no: 'M_OFF_2', member_name: '박가족이', masked_name: '박**이', hp: '01024681357', status_cd: '10', use_yn: 'Y' },
      ])
    );

    await expect(api.getMember('박')).rejects.toMatchObject({ status: 400 });
    await expect(api.getMember('24681357')).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EXACT_PHONE',
      candidates: [
        expect.objectContaining({ member_no: 'M_OFF_1', hp: '010-****-1357' }),
        expect.objectContaining({ member_no: 'M_OFF_2', hp: '010-****-1357' }),
      ],
    });
  });
});
