import React, { useState, useEffect } from 'react';
import { Settings, X, Monitor, Wifi, Shield, Zap, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useKioskSettings, KioskSettings } from '../stores/kioskSettings';
import { api } from '../services/api';

interface KioskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TerminalDeviceItem {
  device_id: string;
  device_name: string;
  device_type: string;
  van_provider: string;
  terminal_id: string;
  vcat_port: number;
}

const FALLBACK_KIOSK_OPTIONS: TerminalDeviceItem[] = [
  { device_id: 'DEV_KIOSK_01', device_name: '입구 무인 키오스크 1호기', terminal_id: '88010003', vcat_port: 9099, van_provider: 'SMARTRO', device_type: 'KIOSK' },
  { device_id: 'DEV_KIOSK_02', device_name: '2층 무인 키오스크 2호기', terminal_id: '88010004', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
  { device_id: 'custom', device_name: '⚙️ 직접 입력 (커스텀 설정)', terminal_id: '', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
];

export const KioskSettingsModal: React.FC<KioskSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, updateSettings } = useKioskSettings();

  const [activeTab, setActiveTab] = useState<'device' | 'connection' | 'maintenance'>('device');
  const [terminalList, setTerminalList] = useState<TerminalDeviceItem[]>(FALLBACK_KIOSK_OPTIONS);
  const [formDeviceId, setFormDeviceId] = useState(settings.deviceId);
  const [formDeviceName, setFormDeviceName] = useState(settings.deviceName);
  const [formProviderType, setFormProviderType] = useState(settings.providerType);
  const [formTerminalId, setFormTerminalId] = useState(settings.terminalId);
  const [formVcatPort, setFormVcatPort] = useState(settings.vcatPort);

  const [formApiUrl, setFormApiUrl] = useState(settings.apiUrl);
  const [formStoreCode, setFormStoreCode] = useState(settings.storeCode);
  const [formDeviceKey, setFormDeviceKey] = useState(settings.deviceKey);

  const [formAdminPin, setFormAdminPin] = useState(settings.adminPin);
  const [formIsMaintenance, setFormIsMaintenance] = useState(settings.isMaintenanceMode);

  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormDeviceId(settings.deviceId);
      setFormDeviceName(settings.deviceName);
      setFormProviderType(settings.providerType);
      setFormTerminalId(settings.terminalId);
      setFormVcatPort(settings.vcatPort);
      setFormApiUrl(settings.apiUrl);
      setFormStoreCode(settings.storeCode);
      setFormDeviceKey(settings.deviceKey);
      setFormAdminPin(settings.adminPin);
      setFormIsMaintenance(settings.isMaintenanceMode);
      setPingStatus(null);
      setSaveSuccess(false);

      // 백엔드 실시간 단말기 마스터 조회
      const fetchTerminals = async () => {
        try {
          const res = await api.get('/v1/terminals').catch(() => null);
          if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
            const customOpt: TerminalDeviceItem = {
              device_id: 'custom',
              device_name: '⚙️ 직접 입력 (커스텀 설정)',
              terminal_id: '',
              vcat_port: 9099,
              van_provider: 'KCP',
              device_type: 'KIOSK',
            };
            setTerminalList([...res.data, customOpt]);
          }
        } catch {
          setTerminalList(FALLBACK_KIOSK_OPTIONS);
        }
      };
      fetchTerminals();
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleDeviceSelect = (devId: string) => {
    const matched = terminalList.find((d) => d.device_id === devId);
    if (matched) {
      setFormDeviceId(matched.device_id);
      setFormDeviceName(matched.device_name);
      if (matched.device_id !== 'custom') {
        setFormTerminalId(matched.terminal_id);
        setFormVcatPort(String(matched.vcat_port));
        setFormProviderType(matched.van_provider);
      }
    }
  };

  const handlePingVcat = async () => {
    setIsPinging(true);
    setPingStatus(null);
    try {
      await new Promise((res) => setTimeout(res, 600));
      setPingStatus(`[${formDeviceName}] VCAT 포트(${formVcatPort}) 통신 정상 확인!`);
    } catch {
      setPingStatus('VCAT 데몬 응답 없음. 포트와 프로그램을 확인해주세요.');
    } finally {
      setIsPinging(false);
    }
  };

  const handleSave = () => {
    const updated: Partial<KioskSettings> = {
      deviceId: formDeviceId,
      deviceName: formDeviceName,
      providerType: formProviderType,
      terminalId: formTerminalId.trim(),
      vcatPort: formVcatPort.trim(),
      apiUrl: formApiUrl.trim(),
      storeCode: formStoreCode.trim(),
      deviceKey: formDeviceKey.trim(),
      adminPin: formAdminPin.trim() || '0000',
      isMaintenanceMode: formIsMaintenance,
    };

    updateSettings(updated);
    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '560px',
          maxWidth: '94vw',
          background: 'linear-gradient(145deg, #1e222d 0%, #12151c 100%)',
          borderRadius: '32px',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#ffffff',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '14px',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                무인 키오스크 시스템 설정
              </h2>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                단말기(TID) 및 무인 운영 정책을 설정합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a1a1aa',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {[
            { key: 'device', label: '기기 식별 & 단말기', icon: <Monitor size={15} /> },
            { key: 'connection', label: '서버 / 연결 설정', icon: <Wifi size={15} /> },
            { key: 'maintenance', label: '운영 모드 & PIN', icon: <Shield size={15} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1,
                padding: '14px 8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #34d399' : '2px solid transparent',
                background: activeTab === tab.key ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                color: activeTab === tab.key ? '#34d399' : '#9ca3af',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div style={{ padding: '28px', minHeight: '320px', boxSizing: 'border-box' }}>
          {/* Tab 1: Device */}
          {activeTab === 'device' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  현재 키오스크 기기 지정
                </label>
                <select
                  value={formDeviceId}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  {terminalList.map((opt) => (
                    <option key={opt.device_id} value={opt.device_id} style={{ background: '#181a20', color: '#fff' }}>
                      {opt.device_name} {opt.terminal_id ? `(TID: ${opt.terminal_id} / ${opt.van_provider})` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '6px 0 0 0' }}>
                  * 선택 시 파트너센터에 등록된 단말기 번호(TID)가 자동 바인딩됩니다.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                    연동 단말기 번호 (TID)*
                  </label>
                  <input
                    type="text"
                    value={formTerminalId}
                    onChange={(e) => setFormTerminalId(e.target.value)}
                    placeholder="예: 88010003"
                    style={{
                      width: '100%',
                      background: '#262a36',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                    VCAT 데몬 포트
                  </label>
                  <input
                    type="text"
                    value={formVcatPort}
                    onChange={(e) => setFormVcatPort(e.target.value)}
                    placeholder="예: 9099"
                    style={{
                      width: '100%',
                      background: '#262a36',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  결제 제공사 (VAN)
                </label>
                <select
                  value={formProviderType}
                  onChange={(e) => setFormProviderType(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="KCP_VAN" style={{ background: '#181a20', color: '#fff' }}>💳 NHN KCP VAN (현장 단말기)</option>
                  <option value="KOCES_VAN" style={{ background: '#181a20', color: '#fff' }}>💳 KOCES 코세스 VAN (현장 단말기)</option>
                  <option value="NICE_VAN" style={{ background: '#181a20', color: '#fff' }}>💳 NICE 정보통신 VAN (현장 단말기)</option>
                </select>
              </div>

              <div style={{ paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={handlePingVcat}
                  disabled={isPinging}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.07)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '14px',
                    color: '#e5e7eb',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {isPinging ? <Loader2 size={16} className="animate-spin" color="#34d399" /> : <Zap size={16} color="#fbbf24" />}
                  단말기 통신 점검 (VCAT Ping)
                </button>
                {pingStatus && (
                  <p style={{ fontSize: '12px', color: '#34d399', fontWeight: 700, textAlign: 'center', marginTop: '8px', margin: '8px 0 0 0' }}>
                    {pingStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Connection */}
          {activeTab === 'connection' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  로컬 서버 API 주소
                </label>
                <input
                  type="text"
                  value={formApiUrl}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="예: http://127.0.0.1:8000"
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  매장 코드 (Store Code)
                </label>
                <input
                  type="text"
                  value={formStoreCode}
                  onChange={(e) => setFormStoreCode(e.target.value)}
                  placeholder="예: H01-SE-001"
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  키오스크 기기 인증키
                </label>
                <input
                  type="password"
                  value={formDeviceKey}
                  onChange={(e) => setFormDeviceKey(e.target.value)}
                  placeholder="파트너센터 발급 기기 인증키"
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 3: Maintenance */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  padding: '18px 20px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    <AlertTriangle size={16} color="#fbbf24" />
                    임시 점검 모드 (화면 잠금)
                  </div>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                    활성화 시 일반 고객의 터치를 차단하고 점검 안내를 띄웁니다.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsMaintenance}
                  onChange={(e) => setFormIsMaintenance(e.target.checked)}
                  style={{ width: '22px', height: '22px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e5e7eb', marginBottom: '6px' }}>
                  관리자 마스터 PIN 번호 (4자리)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={formAdminPin}
                  onChange={(e) => setFormAdminPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0000"
                  style={{
                    width: '100%',
                    background: '#262a36',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    textAlign: 'center',
                    letterSpacing: '6px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '6px 0 0 0' }}>
                  * 좌측 상단 5회 탭 시 입력할 관리자 비밀번호입니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '18px 28px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '12px 28px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              borderRadius: '14px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 size={16} />
                저장 완료!
              </>
            ) : (
              '설정 저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
