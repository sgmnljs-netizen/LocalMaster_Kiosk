import { describe, it, expect, beforeEach } from 'vitest';
import { 
    getKioskHardwareHealth, 
    setKioskHardwareHealth, 
    setKioskHealthStatus 
} from '../../../stores/useKioskHardwareHealthStore';

describe('useKioskHardwareHealthStore & Kiosk Health Lifecycle', () => {
    beforeEach(() => {
        setKioskHealthStatus('ONLINE', 'ONLINE', null, null);
    });

    it('키오스크 단말기 및 프린터 초기 상태는 ONLINE이어야 한다', () => {
        const state = getKioskHardwareHealth();
        expect(state.vcatStatus).toBe('ONLINE');
        expect(state.printerStatus).toBe('ONLINE');
    });

    it('키오스크 단말기 이상 시 OFFLINE 및 에러 메시지가 반영되어야 한다', () => {
        setKioskHardwareHealth({ vcatStatus: 'OFFLINE', vcatErrorMessage: '키오스크 VCAT 포트(9099) 미응답' });

        const state = getKioskHardwareHealth();
        expect(state.vcatStatus).toBe('OFFLINE');
        expect(state.vcatErrorMessage).toBe('키오스크 VCAT 포트(9099) 미응답');
    });

    it('키오스크 프린터 이상 시 OFFLINE 상태가 정상 반영되어야 한다', () => {
        setKioskHardwareHealth({ printerStatus: 'OFFLINE', printerErrorMessage: 'LM-Bridge 프린터 응답 없음' });

        const state = getKioskHardwareHealth();
        expect(state.printerStatus).toBe('OFFLINE');
        expect(state.printerErrorMessage).toBe('LM-Bridge 프린터 응답 없음');
    });
});
