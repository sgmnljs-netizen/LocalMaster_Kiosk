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
  listeners.forEach((listener) => listener({ ...healthState }));
}

export function getKioskHardwareHealth(): KioskHardwareHealthState {
  return { ...healthState };
}

export function setKioskHardwareHealth(partial: Partial<KioskHardwareHealthState>) {
  healthState = { ...healthState, ...partial };
  notify();
}

export function setKioskHealthStatus(
  vcatStatus: DeviceHealthStatus,
  printerStatus: DeviceHealthStatus,
  vcatError: string | null = null,
  printerError: string | null = null
) {
  healthState = {
    ...healthState,
    vcatStatus,
    printerStatus,
    vcatErrorMessage: vcatError,
    printerErrorMessage: printerError,
    lastCheckedAt: Date.now(),
  };
  notify();
}

export function useKioskHardwareHealthStore() {
  const [state, setState] = useState<KioskHardwareHealthState>(healthState);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    setVcatStatus: (status: DeviceHealthStatus, error: string | null = null) => {
      setKioskHardwareHealth({ vcatStatus: status, vcatErrorMessage: error });
    },
    setPrinterStatus: (status: DeviceHealthStatus, error: string | null = null) => {
      setKioskHardwareHealth({ printerStatus: status, printerErrorMessage: error });
    },
    setLastCheckedAt: (timestamp: number) => {
      setKioskHardwareHealth({ lastCheckedAt: timestamp });
    },
  };
}
