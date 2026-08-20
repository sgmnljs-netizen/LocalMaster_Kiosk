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

export function getKioskSettings(): KioskSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KIOSK_SETTINGS;
    return { ...DEFAULT_KIOSK_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_KIOSK_SETTINGS;
  }
}

export function saveKioskSettings(settings: Partial<KioskSettings>): KioskSettings {
  const current = getKioskSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('kiosk-settings-changed'));
  return next;
}

export function useKioskSettings() {
  const [settings, setSettings] = useState<KioskSettings>(getKioskSettings());

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(getKioskSettings());
    };
    window.addEventListener('kiosk-settings-changed', handleUpdate);
    return () => window.removeEventListener('kiosk-settings-changed', handleUpdate);
  }, []);

  const updateSettings = (newSettings: Partial<KioskSettings>) => {
    const updated = saveKioskSettings(newSettings);
    setSettings(updated);
  };

  return { settings, updateSettings };
}
