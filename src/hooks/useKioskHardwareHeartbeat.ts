import { useEffect, useRef, useCallback } from 'react';
import { useKioskHardwareHealthStore } from '../stores/useKioskHardwareHealthStore';
import { getKioskSettings } from '../stores/kioskSettings';
import { getIsMockHardware } from '../services/hardware/adapters/HardwareAdapterFactory';
import { api } from '../services/api';

const HEARTBEAT_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 1500;

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

    const checkHealth = useCallback(async () => {
        const currentSettings = getKioskSettings();
        const port = parseInt(currentSettings.vcatPort, 10) || 9099;
        const isMock = getIsMockHardware();
        setLastCheckedAt(Date.now());

        // 1. VCAT 단말기 체크
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
            const res = await fetch(`http://127.0.0.1:${port}/vcat/status`, {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timer);

            let nextVcat: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
            let nextVcatReason: string | null = null;

            if (res && res.ok) {
                nextVcat = 'ONLINE';
            } else if (isMock && !res) {
                nextVcat = 'ONLINE';
            } else {
                nextVcat = 'OFFLINE';
                nextVcatReason = `VCAT 포트(${port}) 응답 없음`;
            }

            if (lastVcatRef.current !== nextVcat) {
                api.writeKioskLog(
                    'HW_HEARTBEAT_VCAT',
                    `VCAT 단말기 상태 전환: ${lastVcatRef.current} -> ${nextVcat}${nextVcatReason ? ` (${nextVcatReason})` : ''}`
                ).catch(() => {});
                lastVcatRef.current = nextVcat;
            }
            setVcatStatus(nextVcat, nextVcatReason);
        } catch (err) {
            if (lastVcatRef.current !== 'OFFLINE') {
                api.writeKioskLog('HW_HEARTBEAT_VCAT', `VCAT 단말기 상태 전환: ${lastVcatRef.current} -> OFFLINE (${String(err)})`).catch(() => {});
                lastVcatRef.current = 'OFFLINE';
            }
            setVcatStatus('OFFLINE', String(err));
        }

        // 2. 프린터 데몬 체크
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
            const res = await fetch('http://127.0.0.1:18080/health', {
                method: 'GET',
                signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timer);

            let nextPrinter: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
            let nextPrinterReason: string | null = null;

            if (res && res.ok) {
                nextPrinter = 'ONLINE';
            } else if (isMock && !res) {
                nextPrinter = 'ONLINE';
            } else {
                nextPrinter = 'OFFLINE';
                nextPrinterReason = '브릿지 데몬(:18080) 응답 없음';
            }

            if (lastPrinterRef.current !== nextPrinter) {
                api.writeKioskLog(
                    'HW_HEARTBEAT_PRINTER',
                    `프린터 브릿지 상태 전환: ${lastPrinterRef.current} -> ${nextPrinter}${nextPrinterReason ? ` (${nextPrinterReason})` : ''}`
                ).catch(() => {});
                lastPrinterRef.current = nextPrinter;
            }
            setPrinterStatus(nextPrinter, nextPrinterReason);
        } catch (err) {
            if (lastPrinterRef.current !== 'OFFLINE') {
                api.writeKioskLog('HW_HEARTBEAT_PRINTER', `프린터 브릿지 상태 전환: ${lastPrinterRef.current} -> OFFLINE (${String(err)})`).catch(() => {});
                lastPrinterRef.current = 'OFFLINE';
            }
            setPrinterStatus('OFFLINE', String(err));
        }
    }, [setVcatStatus, setPrinterStatus, setLastCheckedAt]);

    useEffect(() => {
        checkHealth();
        const intervalId = setInterval(checkHealth, HEARTBEAT_INTERVAL_MS);
        const handleFocus = () => checkHealth();
        const handleSettingsChanged = () => checkHealth();
        window.addEventListener('focus', handleFocus);
        window.addEventListener('kiosk-settings-changed', handleSettingsChanged);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('kiosk-settings-changed', handleSettingsChanged);
        };
    }, [checkHealth]);

    return { checkHealth };
}
