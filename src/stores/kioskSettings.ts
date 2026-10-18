import { useState, useEffect } from 'react';

export interface KioskSettings {
  deviceId: string;
  deviceName: string;
  terminalId: string;
  vcatPort: string;
  providerType: string;
  apiUrl: string;
  storeCode: string;
  deviceKey: string;
  adminPin: string;
  isMaintenanceMode: boolean;
  autoPrintReceipt?: boolean;
}

export const KIOSK_DEVICE_OPTIONS = [
  { id: 'dev-3', name: '입구 무인 키오스크 1호기', terminalId: '88010003', vcatPort: '9099', providerType: 'KCP_VAN' },
  { id: 'dev-4', name: '2층 무인 키오스크 2호기', terminalId: '88010004', vcatPort: '9099', providerType: 'KCP_VAN' },
  { id: 'dev-5', name: '야외 연습장 키오스크 3호기', terminalId: '88010005', vcatPort: '9099', providerType: 'KOCES_VAN' },
  { id: 'custom', name: '⚙️ 직접 입력 (커스텀 설정)', terminalId: '', vcatPort: '9099', providerType: 'KCP_VAN' },
];

export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  deviceId: 'dev-3',
  deviceName: '입구 무인 키오스크 1호기',
  terminalId: '88010003',
  vcatPort: '9099',
  providerType: 'KCP_VAN',
  apiUrl: 'http://127.0.0.1:8000',
  storeCode: 'H01-SE-001',
  deviceKey: '',
  adminPin: '0000',
  isMaintenanceMode: false,
};

const STORAGE_KEY = 'lm-kiosk-settings';

export function normalizeApiUrl(rawUrl?: string): string {
  const base = (rawUrl || DEFAULT_KIOSK_SETTINGS.apiUrl || 'http://127.0.0.1:8000')
    .trim()
    .replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function getKioskSettings(): KioskSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_KIOSK_SETTINGS;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    const fallbackStoreCd = localStorage.getItem('LM_STORE_CD') || DEFAULT_KIOSK_SETTINGS.storeCode;
    if (!raw) {
      return { ...DEFAULT_KIOSK_SETTINGS, storeCode: fallbackStoreCd };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_KIOSK_SETTINGS,
      ...parsed,
      storeCode: parsed.storeCode || fallbackStoreCd,
      apiUrl: (parsed.apiUrl || DEFAULT_KIOSK_SETTINGS.apiUrl).trim().replace(/\/+$/, ''),
    };
  } catch {
    return DEFAULT_KIOSK_SETTINGS;
  }
}

export function saveKioskSettings(settings: Partial<KioskSettings>): KioskSettings {
  const current = getKioskSettings();
  const next: KioskSettings = {
    ...current,
    ...settings,
    apiUrl: (settings.apiUrl ?? current.apiUrl ?? DEFAULT_KIOSK_SETTINGS.apiUrl).trim().replace(/\/+$/, ''),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (next.storeCode) {
    localStorage.setItem('LM_STORE_CD', next.storeCode);
  }
  if (next.terminalId) {
    localStorage.setItem('LM_KIOSK_TERMINAL_ID', next.terminalId);
  }
  window.dispatchEvent(new Event('kiosk-settings-changed'));
  return next;
}

let bootstrapPromise: Promise<KioskSettings | null> | null = null;

export async function bootstrapLocalKioskSettings(): Promise<KioskSettings | null> {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const isLoopback = host === '127.0.0.1' || host === 'localhost';
  if (!isLoopback) return null;

  const current = getKioskSettings();
  const hasExplicitSettings = Boolean(localStorage.getItem(STORAGE_KEY) && current.deviceKey);
  if (hasExplicitSettings) {
    return current;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const baseUrl = (
        window.location.port === '8000'
          ? window.location.origin
          : current.apiUrl || DEFAULT_KIOSK_SETTINGS.apiUrl
      )
        .trim()
        .replace(/\/+$/, '');
      const existingStoreCd = localStorage.getItem('LM_STORE_CD') || '';
      const query = existingStoreCd ? `?store_cd=${encodeURIComponent(existingStoreCd)}` : '';
      const res = await fetch(`${baseUrl}/api/v1/kiosk/local-bootstrap${query}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.store_cd) return null;

      return saveKioskSettings({
        apiUrl: baseUrl,
        storeCode: existingStoreCd || data.store_cd,
        deviceKey: data.device_key || current.deviceKey,
        deviceId: data.device_id || current.deviceId,
        deviceName: data.device_name || current.deviceName,
        terminalId: data.terminal_id || current.terminalId,
        vcatPort: data.vcat_port || current.vcatPort,
        providerType: data.provider_type || current.providerType,
      });
    } catch {
      return null;
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

export function useKioskSettings() {
  const [settings, setSettings] = useState<KioskSettings>(getKioskSettings());

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getKioskSettings());
    };
    window.addEventListener('kiosk-settings-changed', handleUpdate);
    void bootstrapLocalKioskSettings();
    return () => window.removeEventListener('kiosk-settings-changed', handleUpdate);
  }, []);

  const updateSettings = (newSettings: Partial<KioskSettings>) => {
    const updated = saveKioskSettings(newSettings);
    setSettings(updated);
  };

  return { settings, updateSettings };
}
