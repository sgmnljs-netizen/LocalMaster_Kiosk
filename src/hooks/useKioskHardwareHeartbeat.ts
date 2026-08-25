import { useEffect, useRef, useCallback } from 'react';
import { useKioskHardwareHealthStore } from '../stores/useKioskHardwareHealthStore';
import { useKioskSettings } from '../stores/kioskSettings';

const HEARTBEAT_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 1500;

export function useKioskHardwareHeartbeat() {
    const { settings } = useKioskSettings();
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
        const port = parseInt(settings.vcatPort, 10) || 8090;
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

            if (res && res.ok) {
                setVcatStatus('ONLINE', null);
                lastVcatRef.current = 'ONLINE';
            } else {
                const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                if (isDev && !res) {
                    setVcatStatus('ONLINE', null);
                    lastVcatRef.current = 'ONLINE';
                } else {
                    setVcatStatus('OFFLINE', `VCAT 포트(${port}) 응답 없음`);
                    lastVcatRef.current = 'OFFLINE';
                }
            }
        } catch (err) {
            setVcatStatus('OFFLINE', String(err));
            lastVcatRef.current = 'OFFLINE';
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

            if (res && res.ok) {
                setPrinterStatus('ONLINE', null);
                lastPrinterRef.current = 'ONLINE';
            } else {
                const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                if (isDev && !res) {
                    setPrinterStatus('ONLINE', null);
                    lastPrinterRef.current = 'ONLINE';
                } else {
                    setPrinterStatus('OFFLINE', '브릿지 데몬(:18080) 응답 없음');
                    lastPrinterRef.current = 'OFFLINE';
                }
            }
        } catch (err) {
            setPrinterStatus('OFFLINE', String(err));
            lastPrinterRef.current = 'OFFLINE';
        }
    }, [settings.vcatPort, setVcatStatus, setPrinterStatus, setLastCheckedAt]);

    useEffect(() => {
        checkHealth();
        const intervalId = setInterval(checkHealth, HEARTBEAT_INTERVAL_MS);
        const handleFocus = () => checkHealth();
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [checkHealth]);

    return { checkHealth };
}
