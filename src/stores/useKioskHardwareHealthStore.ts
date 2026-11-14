import { useState, useEffect } from 'react';

export type DeviceHealthStatus = 'ONLINE' | 'OFFLINE' | 'CHECKING';

export interface KioskHardwareHealthState {
  vcatStatus: DeviceHealthStatus;
  printerStatus: DeviceHealthStatus;
  lastCheckedAt: number | null;
  vcatErrorMessage: string | null;
  printerErrorMessage: string | null;
}

let healthState: KioskHardwareHealthState = {
  vcatStatus: 'ONLINE',
  printerStatus: 'ONLINE',
  lastCheckedAt: null,
  vcatErrorMessage: null,
  printerErrorMessage: null,
};

const listeners = new Set<(state: KioskHardwareHealthState) => void>();

function notify() {
  Array.from(listeners).forEach((listener) => {
    try {
      listener({ ...healthState });
    } catch {
      // 개별 리스너 예외 격리
    }
  });
}

export function getKioskHardwareHealth(): KioskHardwareHealthState {
  return { ...healthState };
}

export function normalizeDeviceHealthStatus(
  raw: unknown,
  fallback: DeviceHealthStatus = 'ONLINE'
): DeviceHealthStatus {
  const token = String(raw ?? '').trim().toUpperCase();
  if (token === 'ONLINE' || token === 'OFFLINE' || token === 'CHECKING') {
    return token;
  }
  return fallback;
}

export function setKioskHardwareHealth(partial: Partial<KioskHardwareHealthState>) {
  const sanitized: Partial<KioskHardwareHealthState> = { ...partial };
  if (sanitized.vcatStatus !== undefined) {
    sanitized.vcatStatus = normalizeDeviceHealthStatus(sanitized.vcatStatus, healthState.vcatStatus);
  }
  if (sanitized.printerStatus !== undefined) {
    sanitized.printerStatus = normalizeDeviceHealthStatus(sanitized.printerStatus, healthState.printerStatus);
  }
  if (sanitized.lastCheckedAt !== undefined && sanitized.lastCheckedAt !== null) {
    sanitized.lastCheckedAt =
      typeof sanitized.lastCheckedAt === 'number' &&
      Number.isFinite(sanitized.lastCheckedAt) &&
      sanitized.lastCheckedAt > 0
        ? Math.floor(sanitized.lastCheckedAt)
        : Date.now();
  }
  if (sanitized.vcatErrorMessage !== undefined && sanitized.vcatErrorMessage !== null) {
    sanitized.vcatErrorMessage =
      typeof sanitized.vcatErrorMessage === 'string'
        ? sanitized.vcatErrorMessage
        : String((sanitized.vcatErrorMessage as { message?: unknown })?.message ?? sanitized.vcatErrorMessage);
  }
  if (sanitized.printerErrorMessage !== undefined && sanitized.printerErrorMessage !== null) {
    sanitized.printerErrorMessage =
      typeof sanitized.printerErrorMessage === 'string'
        ? sanitized.printerErrorMessage
        : String((sanitized.printerErrorMessage as { message?: unknown })?.message ?? sanitized.printerErrorMessage);
  }

  let changed = false;
  for (const key of Object.keys(sanitized) as (keyof KioskHardwareHealthState)[]) {
    if (healthState[key] !== sanitized[key]) {
      changed = true;
      break;
    }
  }
  if (changed) {
    healthState = { ...healthState, ...sanitized };
    notify();
  }
}

export function setKioskHealthStatus(
  vcatStatus: DeviceHealthStatus,
  printerStatus: DeviceHealthStatus,
  vcatError: string | null = null,
  printerError: string | null = null
) {
  setKioskHardwareHealth({
    vcatStatus,
    printerStatus,
    vcatErrorMessage: vcatError,
    printerErrorMessage: printerError,
    lastCheckedAt: Date.now(),
  });
}

export const setVcatStatus = (status: DeviceHealthStatus, error: string | null = null) => {
  setKioskHardwareHealth({ vcatStatus: status, vcatErrorMessage: error });
};

export const setPrinterStatus = (status: DeviceHealthStatus, error: string | null = null) => {
  setKioskHardwareHealth({ printerStatus: status, printerErrorMessage: error });
};

export const setLastCheckedAt = (timestamp: number) => {
  const safeTimestamp =
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
      ? Math.floor(timestamp)
      : Date.now();
  setKioskHardwareHealth({ lastCheckedAt: safeTimestamp });
};

export function useKioskHardwareHealthStore() {
  const [state, setState] = useState<KioskHardwareHealthState>(() => getKioskHardwareHealth());

  useEffect(() => {
    listeners.add(setState);
    setState(getKioskHardwareHealth());
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    setVcatStatus,
    setPrinterStatus,
    setLastCheckedAt,
  };
}
