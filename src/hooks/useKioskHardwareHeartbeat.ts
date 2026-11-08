import { useEffect, useRef, useCallback } from 'react';
import { useKioskHardwareHealthStore } from '../stores/useKioskHardwareHealthStore';
import {
    getKioskSettings,
    resolveDefaultVanPort,
    resolveVanStatusEndpointPath,
} from '../stores/kioskSettings';
import { getIsMockHardware } from '../services/hardware/adapters/HardwareAdapterFactory';
import { api } from '../services/api';
import { sanitizeVanPort } from './useKioskVanPayment';

const HEARTBEAT_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 1500;

export interface HardwareProbeResult {
    nextVcat: 'ONLINE' | 'OFFLINE';
    nextVcatReason: string | null;
    nextPrinter: 'ONLINE' | 'OFFLINE';
    nextPrinterReason: string | null;
}

export async function probeKioskHardwareHealthOnce(): Promise<HardwareProbeResult> {
    const currentSettings = getKioskSettings();
    const defaultPort = sanitizeVanPort(resolveDefaultVanPort(currentSettings.providerType), 9099);
    const port = sanitizeVanPort(currentSettings.vcatPort, defaultPort);
    const statusPath = resolveVanStatusEndpointPath(currentSettings.providerType);
    const isMock = getIsMockHardware();

    let nextVcat: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
    let nextVcatReason: string | null = null;
    {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        try {
            const res = await fetch(`http://127.0.0.1:${port}${statusPath}`, {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);

            if (res && res.ok) {
                let vcatBody: Record<string, unknown> | null = null;
                if (typeof res.json === 'function') {
                    vcatBody = await res.json().catch(() => null);
                }
                const vcatSt = vcatBody?.status ? String(vcatBody.status).toUpperCase() : '';
                if (vcatBody?.isOnline === false || vcatSt === 'OFFLINE') {
                    nextVcat = 'OFFLINE';
                    nextVcatReason =
                        (typeof vcatBody?.message === 'string' && vcatBody.message.trim()) ||
                        `VCAT 단말기 오프라인(${port}${statusPath})`;
                } else {
                    nextVcat = 'ONLINE';
                }
            } else if (isMock && !res) {
                nextVcat = 'ONLINE';
            } else {
                nextVcat = 'OFFLINE';
                nextVcatReason = `VCAT 포트(${port}${statusPath}) 응답 없음`;
            }
        } catch (err) {
            nextVcat = 'OFFLINE';
            nextVcatReason = String(err);
        } finally {
            clearTimeout(timer);
        }
    }

    let nextPrinter: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
    let nextPrinterReason: string | null = null;
    {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        try {
            const res = await fetch('http://127.0.0.1:18080/health', {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);

            if (res && res.ok) {
                let healthBody: Record<string, unknown> | null = null;
                if (typeof res.json === 'function') {
                    healthBody = await res.json().catch(() => null);
                }
                const rawPrinterSt = healthBody?.printer_status ? String(healthBody.printer_status).toUpperCase() : '';
                const rawDaemonSt = healthBody?.status ? String(healthBody.status).toUpperCase() : '';
                if (
                    (rawPrinterSt && rawPrinterSt !== 'ONLINE') ||
                    rawDaemonSt === 'DEGRADED' ||
                    rawDaemonSt === 'OFFLINE'
                ) {
                    nextPrinter = 'OFFLINE';
                    nextPrinterReason =
                        (typeof healthBody?.message === 'string' && healthBody.message.trim()) ||
                        `프린터 상태 이상 (${rawPrinterSt || rawDaemonSt})`;
                } else {
                    nextPrinter = 'ONLINE';
                }
            } else if (isMock && !res) {
                nextPrinter = 'ONLINE';
            } else {
                nextPrinter = 'OFFLINE';
                nextPrinterReason = '브릿지 데몬(:18080) 응답 없음';
            }
        } catch (err) {
            nextPrinter = 'OFFLINE';
            nextPrinterReason = String(err);
        } finally {
            clearTimeout(timer);
        }
    }

    return { nextVcat, nextVcatReason, nextPrinter, nextPrinterReason };
}

export function useKioskHardwareHeartbeat() {
    const { 
        vcatStatus, 
        printerStatus, 
        setVcatStatus, 
        setPrinterStatus, 
        setLastCheckedAt 
    } = useKioskHardwareHealthStore();

    const lastVcatRef = useRef(vcatStatus);
    const lastPrinterRef = useRef(printerStatus);
    const inFlightPromiseRef = useRef<Promise<void> | null>(null);
    const pendingRecheckRef = useRef(false);
    const isMountedRef = useRef(true);

    const checkHealth = useCallback((): Promise<void> => {
        if (inFlightPromiseRef.current) {
            pendingRecheckRef.current = true;
            return inFlightPromiseRef.current;
        }

        const runProbeLoop = async () => {
            try {
                do {
                    pendingRecheckRef.current = false;
                    if (!isMountedRef.current) break;

                    setLastCheckedAt(Date.now());
                    const { nextVcat, nextVcatReason, nextPrinter, nextPrinterReason } =
                        await probeKioskHardwareHealthOnce();
                    if (!isMountedRef.current) break;

                    if (lastVcatRef.current !== nextVcat) {
                        api.writeKioskLog(
                            'HW_HEARTBEAT_VCAT',
                            `VCAT 단말기 상태 전환: ${lastVcatRef.current} -> ${nextVcat}${nextVcatReason ? ` (${nextVcatReason})` : ''}`
                        ).catch(() => {});
                        lastVcatRef.current = nextVcat;
                    }
                    setVcatStatus(nextVcat, nextVcatReason);

                    if (lastPrinterRef.current !== nextPrinter) {
                        api.writeKioskLog(
                            'HW_HEARTBEAT_PRINTER',
                            `프린터 브릿지 상태 전환: ${lastPrinterRef.current} -> ${nextPrinter}${nextPrinterReason ? ` (${nextPrinterReason})` : ''}`
                        ).catch(() => {});
                        lastPrinterRef.current = nextPrinter;
                    }
                    setPrinterStatus(nextPrinter, nextPrinterReason);
                } while (pendingRecheckRef.current && isMountedRef.current);
            } finally {
                inFlightPromiseRef.current = null;
                pendingRecheckRef.current = false;
            }
        };

        inFlightPromiseRef.current = runProbeLoop();
        return inFlightPromiseRef.current;
    }, [setVcatStatus, setPrinterStatus, setLastCheckedAt]);

    useEffect(() => {
        isMountedRef.current = true;
        void checkHealth();
        const intervalId = setInterval(() => {
            void checkHealth();
        }, HEARTBEAT_INTERVAL_MS);
        const handleFocus = () => {
            void checkHealth();
        };
        const handleSettingsChanged = () => {
            void checkHealth();
        };
        window.addEventListener('focus', handleFocus);
        window.addEventListener('kiosk-settings-changed', handleSettingsChanged);

        return () => {
            isMountedRef.current = false;
            pendingRecheckRef.current = false;
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('kiosk-settings-changed', handleSettingsChanged);
        };
    }, [checkHealth]);

    return { checkHealth };
}
