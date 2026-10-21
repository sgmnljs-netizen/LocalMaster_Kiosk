import React, { useState, useEffect, useMemo } from 'react';
import { Settings, X, Monitor, Wifi, Shield, Zap, Loader2, CheckCircle2, AlertTriangle, LayoutGrid, RotateCcw, Star } from 'lucide-react';
import {
  useKioskSettings,
  KioskSettings,
  KioskAuthModeKey,
  KioskAuthMethodsConfig,
  KioskMenuVisibilityMap,
  DEFAULT_AUTH_METHODS,
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
} from '../stores/kioskSettings';
import { api } from '../services/api';
import { kioskVanClient } from '../services/van/van_client';

interface KioskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  kioskMenuConfigs?: any[];
  checkinPolicy?: string;
  faceTerminalEnabled?: boolean;
}

interface TerminalDeviceItem {
  device_id: string;
  device_name: string;
  device_type: string;
  van_provider: string;
  terminal_id: string;
  vcat_port: number;
}

const STANDARD_KIOSK_MENUS = [
  { id: 'CHECKIN', label: '예약 타석 체크인', desc: '사전 예약 본인인증 및 체크인', emoji: '📌' },
  { id: 'ALLOCATE_DAILY', label: '연습타석 배정', desc: '회원권/일일권 연습타석 배정', emoji: '🎯' },
  { id: 'PAR3', label: '파3 코스 배정', desc: '야외 파3 라운딩 티오프 예약', emoji: '⛳' },
  { id: 'PURCHASE_PRODUCT', label: '회원권/상품 구매', desc: '기간권·횟수권·일일권 구매', emoji: '🛍️' },
  { id: 'LOCKER', label: '라카 대여/연장', desc: '개인 사물함 기간 연장 결제', emoji: '🔑' },
  { id: 'MOVE_BAY', label: '타석 이동', desc: '이용 중인 타석 위치 변경', emoji: '🔄' },
  { id: 'SIGNUP', label: '신규 회원가입', desc: '30초 즉석 회원가입 배너/버튼', emoji: '👤' },
];

const AUTH_METHOD_ITEMS: { key: KioskAuthModeKey; label: string; desc: string; emoji: string }[] = [
  { key: 'SMART_TAG', label: '스마트폰 태그 (NFC/BLE)', desc: '안드로이드 NFC 및 아이폰 스마트 체크인', emoji: '📱' },
  { key: 'PHONE_KEYPAD', label: '전화번호 입력 (키패드)', desc: '휴대폰 뒷 4자리 / 전체 번호 키패드 조회', emoji: '🔢' },
  { key: 'QR_SCAN', label: '출입 QR / 바코드 스캔', desc: '하드웨어 리더기로 모바일/알림톡 QR 인식', emoji: '📷' },
  { key: 'FACE', label: 'AI 안면 인식 (카메라)', desc: '전면 카메라 비접촉 안면 인증 및 등록', emoji: '🙂' },
];

const FALLBACK_KIOSK_OPTIONS: TerminalDeviceItem[] = [
  { device_id: 'DEV_KIOSK_01', device_name: '입구 무인 키오스크 1호기', terminal_id: '88010003', vcat_port: 9099, van_provider: 'SMARTRO', device_type: 'KIOSK' },
  { device_id: 'DEV_KIOSK_02', device_name: '2층 무인 키오스크 2호기', terminal_id: '88010004', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
  { device_id: 'custom', device_name: '⚙️ 직접 입력 (커스텀 설정)', terminal_id: '', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
];

export const KioskSettingsModal: React.FC<KioskSettingsModalProps> = ({
  isOpen,
  onClose,
  kioskMenuConfigs = [],
  checkinPolicy = 'CHECKIN_REQUIRED',
  faceTerminalEnabled = true,
}) => {
  const { settings, updateSettings } = useKioskSettings();

  const [activeTab, setActiveTab] = useState<'device' | 'menus' | 'connection' | 'maintenance'>('device');
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

  const [formMenuOverrides, setFormMenuOverrides] = useState<KioskMenuVisibilityMap>(settings.menuOverrides || {});
  const [formAuthMethods, setFormAuthMethods] = useState<KioskAuthMethodsConfig>({
    ...DEFAULT_AUTH_METHODS,
    ...(settings.authMethods || {}),
  });
  const [formDefaultAuthMode, setFormDefaultAuthMode] = useState<KioskAuthModeKey>(
    settings.defaultAuthMode || 'SMART_TAG'
  );
  const [formMinGapMinutes, setFormMinGapMinutes] = useState<number>(
    settings.minGapMinutes ?? 60
  );
  const [policyGuardMsg, setPolicyGuardMsg] = useState<string | null>(null);

  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const configurableMenus = useMemo(() => {
    const builtinCanonicalSet = new Set(STANDARD_KIOSK_MENUS.map((m) => m.id));
    const customMenus = (kioskMenuConfigs || [])
      .filter((m: any) => m?.menu_id && !builtinCanonicalSet.has(canonicalizeKioskMenuId(m.menu_id)))
      .map((m: any) => ({
        id: String(m.menu_id),
        label: m.menu_name || String(m.menu_id),
        desc: m.description || '파트너센터 커스텀 메뉴',
        emoji: '✨',
      }));
    return [...STANDARD_KIOSK_MENUS, ...customMenus];
  }, [kioskMenuConfigs]);

  const getPartnerMenuDefault = (menuId: string): boolean => {
    const canonical = canonicalizeKioskMenuId(menuId);
    if (canonical === 'CHECKIN' && checkinPolicy === 'DISABLED') {
      return false;
    }
    if (kioskMenuConfigs && kioskMenuConfigs.length > 0) {
      const matched = kioskMenuConfigs.find(
        (m: any) => canonicalizeKioskMenuId(m.menu_id) === canonical || m.menu_id === menuId
      );
      if (matched) {
        return matched.is_active !== false;
      }
    }
    return true;
  };

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
      setFormMenuOverrides(settings.menuOverrides || {});
      setFormAuthMethods({
        ...DEFAULT_AUTH_METHODS,
        ...(settings.authMethods || {}),
      });
      setFormDefaultAuthMode(settings.defaultAuthMode || 'SMART_TAG');
      setFormMinGapMinutes(settings.minGapMinutes ?? 60);
      setPolicyGuardMsg(null);
      setPingStatus(null);
      setSaveSuccess(false);

      // 백엔드 실시간 단말기 마스터 조회
      const fetchTerminals = async () => {
        try {
          const res = (api as any).getKioskTerminals
            ? await (api as any).getKioskTerminals().catch(() => null)
            : await api.get('/v1/terminals').catch(() => null);
          const list = Array.isArray(res) ? res : (res?.data && Array.isArray(res.data) ? res.data : null);
          if (list && list.length > 0) {
            const customOpt: TerminalDeviceItem = {
              device_id: 'custom',
              device_name: '⚙️ 직접 입력 (커스텀 설정)',
              terminal_id: '',
              vcat_port: 9099,
              van_provider: 'KCP',
              device_type: 'KIOSK',
            };
            setTerminalList([...list, customOpt]);
          }
        } catch {
          setTerminalList(FALLBACK_KIOSK_OPTIONS);
        }
      };
      fetchTerminals();
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleToggleMenu = (menuId: string) => {
    setPolicyGuardMsg(null);
    const partnerDefault = getPartnerMenuDefault(menuId);
    const currentEnabled = isKioskMenuEnabled(menuId, formMenuOverrides, partnerDefault);
    const nextEnabled = !currentEnabled;

    if (!nextEnabled) {
      const enabledCount = configurableMenus.filter((m) =>
        isKioskMenuEnabled(m.id, formMenuOverrides, getPartnerMenuDefault(m.id))
      ).length;
      if (enabledCount <= 1) {
        setPolicyGuardMsg('최소 1개 이상의 메뉴는 활성화(ON)되어 있어야 합니다.');
        return;
      }
    }

    setFormMenuOverrides((prev) => ({
      ...prev,
      [menuId]: nextEnabled,
    }));
  };

  const handleResetMenuOverrides = () => {
    setPolicyGuardMsg(null);
    setFormMenuOverrides({});
  };

  const handleToggleAuthMethod = (key: KioskAuthModeKey) => {
    setPolicyGuardMsg(null);
    const currentEnabled = formAuthMethods[key] !== false;
    const nextEnabled = !currentEnabled;

    if (!nextEnabled) {
      const activeKeys = (['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'] as KioskAuthModeKey[]).filter(
        (k) => (k === key ? false : formAuthMethods[k] !== false && (k !== 'FACE' || faceTerminalEnabled !== false))
      );
      if (activeKeys.length === 0) {
        setPolicyGuardMsg('최소 1개 이상의 회원인증 방식은 활성화(ON)되어 있어야 합니다.');
        return;
      }
      if (formDefaultAuthMode === key) {
        setFormDefaultAuthMode(activeKeys[0]);
      }
    }

    setFormAuthMethods((prev) => ({
      ...prev,
      [key]: nextEnabled,
    }));
  };

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
      const res = await fetch(`http://127.0.0.1:${formVcatPort}/vcat/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setPingStatus(`[${formDeviceName}] VCAT 포트(${formVcatPort}) 통신 정상 확인!`);
    } catch {
      setPingStatus('VCAT 데몬 응답 없음. 포트와 프로그램을 확인해주세요.');
    } finally {
      setIsPinging(false);
    }
  };

  const handleSave = () => {
    const cleanStoreCd = formStoreCode.trim();
    const cleanDeviceId = formDeviceId.trim();
    const rawTerminalId = formTerminalId.trim();
    const cleanTerminalId = rawTerminalId === 'custom' ? '88010003' : (rawTerminalId || '88010003');
    const cleanVcatPort = formVcatPort.trim();

    const updated: Partial<KioskSettings> = {
      deviceId: cleanDeviceId,
      deviceName: formDeviceName,
      providerType: formProviderType,
      terminalId: cleanTerminalId,
      vcatPort: cleanVcatPort,
      apiUrl: formApiUrl.trim(),
      storeCode: cleanStoreCd,
      deviceKey: formDeviceKey.trim(),
      adminPin: formAdminPin.trim() || '0000',
      isMaintenanceMode: formIsMaintenance,
      menuOverrides: formMenuOverrides,
      authMethods: formAuthMethods,
      defaultAuthMode: formDefaultAuthMode,
      minGapMinutes: formMinGapMinutes,
    };

    try {
      if (cleanStoreCd) localStorage.setItem('LM_STORE_CD', cleanStoreCd);
      if (cleanDeviceId) localStorage.setItem('LM_KIOSK_DEVICE_ID', cleanDeviceId);
      if (cleanTerminalId) localStorage.setItem('LM_KIOSK_TERMINAL_ID', cleanTerminalId);
    } catch (e) {
      console.warn('[KioskSettingsModal] Failed to sync localStorage keys:', e);
    }

    kioskVanClient.setConfig({
      provider: formProviderType.replace('_VAN', '') as any,
      ...({ providerType: formProviderType } as any),
      vcatPort: Number(cleanVcatPort) || 9099,
      terminalId: cleanTerminalId,
    });

    updateSettings(updated);
    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div
      data-testid="kiosk-settings-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '9vh',
        paddingLeft: '24px',
        paddingRight: '24px',
        paddingBottom: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        data-testid="kiosk-settings-modal-card"
        style={{
          width: '680px',
          maxWidth: '94vw',
          maxHeight: '82vh',
          background: '#ffffff',
          borderRadius: '28px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18), 0 4px 16px rgba(15, 23, 42, 0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#0f172a',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Header (Fixed Top) */}
        <div
          data-testid="kiosk-settings-header"
          style={{
            flexShrink: 0,
            padding: '22px 28px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '14px',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                무인 키오스크 시스템 설정
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '3px 0 0 0', fontWeight: 500 }}>
                단말기(TID), 기기별 노출 메뉴 및 회원인증 방식을 설정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation (Fixed Top - Never shifts vertically on tab change) */}
        <div
          data-testid="kiosk-settings-tabbar"
          style={{
            flexShrink: 0,
            padding: '10px 20px',
            background: '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}
        >
          {[
            { key: 'device', label: '기기 식별 & 단말기', icon: <Monitor size={15} /> },
            { key: 'menus', label: '메뉴 & 인증 설정', icon: <LayoutGrid size={15} /> },
            { key: 'connection', label: '서버 / 연결 설정', icon: <Wifi size={15} /> },
            { key: 'maintenance', label: '운영 모드 & PIN', icon: <Shield size={15} /> },
          ].map((tab) => {
            const isTabActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                data-testid={`settings-tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  padding: '11px 8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  borderRadius: '12px',
                  border: isTabActive ? '1px solid #cbd5e1' : '1px solid transparent',
                  background: isTabActive ? '#ffffff' : 'transparent',
                  color: isTabActive ? '#059669' : '#64748b',
                  boxShadow: isTabActive ? '0 2px 8px rgba(15, 23, 42, 0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body (Scrollable / Expands Downwards Only) */}
        <div
          data-testid="kiosk-settings-body"
          style={{
            flex: 1,
            padding: '24px 28px',
            overflowY: 'auto',
            background: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          {/* Tab 1: Device */}
          {activeTab === 'device' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  현재 키오스크 기기 지정
                </label>
                <select
                  value={formDeviceId}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  {terminalList.map((opt) => (
                    <option key={opt.device_id} value={opt.device_id} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {opt.device_name} {opt.terminal_id ? `(TID: ${opt.terminal_id} / ${opt.van_provider})` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#047857', fontWeight: 600, margin: '8px 0 0 0' }}>
                  * 선택 시 파트너센터에 등록된 단말기 번호(TID)가 자동 바인딩됩니다.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    연동 단말기 번호 (TID)*
                  </label>
                  <input
                    type="text"
                    value={formTerminalId}
                    onChange={(e) => setFormTerminalId(e.target.value)}
                    placeholder="예: 88010003"
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    VCAT 데몬 포트
                  </label>
                  <input
                    type="text"
                    value={formVcatPort}
                    onChange={(e) => setFormVcatPort(e.target.value)}
                    placeholder="예: 9099"
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  결제 제공사 (VAN)
                </label>
                <select
                  value={formProviderType}
                  onChange={(e) => setFormProviderType(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="KCP_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 NHN KCP VAN (현장 단말기)</option>
                  <option value="KOCES_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 KOCES 코세스 VAN (현장 단말기)</option>
                  <option value="NICE_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 NICE 정보통신 VAN (현장 단말기)</option>
                </select>
              </div>

              <div style={{ paddingTop: '2px' }}>
                <button
                  type="button"
                  onClick={handlePingVcat}
                  disabled={isPinging}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '14px',
                    color: '#1e293b',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  {isPinging ? <Loader2 size={16} className="animate-spin" color="#059669" /> : <Zap size={16} color="#d97706" />}
                  단말기 통신 점검 (VCAT Ping)
                </button>
                {pingStatus && (
                  <p style={{ fontSize: '12.5px', color: '#059669', fontWeight: 700, textAlign: 'center', margin: '8px 0 0 0' }}>
                    {pingStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 1.5: Menus & Auth Methods */}
          {activeTab === 'menus' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {policyGuardMsg && (
                <div
                  style={{
                    padding: '11px 14px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    color: '#b45309',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} color="#d97706" />
                  <span>{policyGuardMsg}</span>
                </div>
              )}

              {/* Section 1: Kiosk Menu On/Off */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      메인 화면 메뉴 노출 제어 (기기별 개별 설정)
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                      파트너센터 설정과 무관하게 현재 키오스크에서 특정 메뉴만 개별 ON/OFF 할 수 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetMenuOverrides}
                    disabled={Object.keys(formMenuOverrides).length === 0}
                    style={{
                      padding: '7px 11px',
                      borderRadius: '10px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: Object.keys(formMenuOverrides).length > 0 ? '#ecfdf5' : '#f1f5f9',
                      border: Object.keys(formMenuOverrides).length > 0 ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
                      color: Object.keys(formMenuOverrides).length > 0 ? '#047857' : '#94a3b8',
                      cursor: Object.keys(formMenuOverrides).length > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <RotateCcw size={12} />
                    파트너센터 기본값 복원
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {configurableMenus.map((menu) => {
                    const partnerDefault = getPartnerMenuDefault(menu.id);
                    const isOverridden = Object.prototype.hasOwnProperty.call(formMenuOverrides, menu.id);
                    const isEnabled = isKioskMenuEnabled(menu.id, formMenuOverrides, partnerDefault);

                    return (
                      <div
                        key={menu.id}
                        onClick={() => handleToggleMenu(menu.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: isEnabled ? '#ffffff' : '#f1f5f9',
                          border: isEnabled ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          boxShadow: isEnabled ? '0 2px 6px rgba(16, 185, 129, 0.08)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          cursor: 'pointer',
                          opacity: isEnabled ? 1 : 0.72,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '14px' }}>{menu.emoji}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: isEnabled ? '#0f172a' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {menu.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: isOverridden ? '#fef3c7' : '#e2e8f0',
                                color: isOverridden ? '#b45309' : '#475569',
                              }}
                            >
                              {isOverridden ? '기기 개별설정' : `파트너센터(${partnerDefault ? 'ON' : 'OFF'})`}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: isEnabled ? '#10b981' : '#cbd5e1',
                            color: isEnabled ? '#ffffff' : '#475569',
                            flexShrink: 0,
                          }}
                        >
                          {isEnabled ? 'ON' : 'OFF'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Member Auth Methods On/Off & Default Tab */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    회원인증 수단 ON/OFF 및 기본 시작 탭
                  </h4>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                    이 키오스크에 장착된 하드웨어(카메라, QR리더기, NFC)에 맞춰 인증 탭을 켜거나 끄고 첫 화면 기본 탭을 지정합니다.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {AUTH_METHOD_ITEMS.map((item) => {
                    const isServerDisabledFace = item.key === 'FACE' && faceTerminalEnabled === false;
                    const isEnabled = formAuthMethods[item.key] !== false && !isServerDisabledFace;
                    const isDefault = formDefaultAuthMode === item.key && isEnabled;

                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: isEnabled ? '#ffffff' : '#f1f5f9',
                          border: isDefault
                            ? '2px solid #059669'
                            : isEnabled
                            ? '1px solid #93c5fd'
                            : '1px solid #cbd5e1',
                          boxShadow: isEnabled ? '0 2px 6px rgba(15, 23, 42, 0.04)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '8px',
                          opacity: isEnabled ? 1 : 0.72,
                        }}
                      >
                        <div
                          onClick={() => !isServerDisabledFace && handleToggleAuthMethod(item.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            cursor: isServerDisabledFace ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px' }}>{item.emoji}</span>
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: isEnabled ? '#0f172a' : '#64748b' }}>
                                {item.label}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#64748b', margin: '3px 0 0 0', fontWeight: 500 }}>
                              {isServerDisabledFace ? '매장 정책상 안면인식 비활성화됨' : item.desc}
                            </p>
                          </div>

                          <div
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: isEnabled ? '#2563eb' : '#cbd5e1',
                              color: isEnabled ? '#ffffff' : '#475569',
                              flexShrink: 0,
                            }}
                          >
                            {isEnabled ? 'ON' : 'OFF'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                          <button
                            type="button"
                            disabled={!isEnabled}
                            onClick={() => isEnabled && setFormDefaultAuthMode(item.key)}
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              background: isDefault ? '#ecfdf5' : '#f8fafc',
                              border: isDefault ? '1px solid #10b981' : '1px solid #e2e8f0',
                              color: isDefault ? '#047857' : isEnabled ? '#475569' : '#94a3b8',
                              cursor: isEnabled ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <Star size={11} fill={isDefault ? '#059669' : 'none'} color={isDefault ? '#059669' : 'currentColor'} />
                            {isDefault ? '현재 기본 시작 탭' : '기본 시작 탭으로 지정'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section C: Intermediate Gap Threshold */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      ⏱️ 중간 빈타석 표시 기준 시간 (대기시간 포함 자동 계산)
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                      예약과 다음 예약 사이의 빈 시간이 기준 시간 미만이면 뒤 예약과 하나로 묶어 통합 종료시각으로 표시합니다. (기기 표준값: 60분)
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  {[50, 60, 70, 80, 90, 120].map((minOpt) => {
                    const isSelected = formMinGapMinutes === minOpt;
                    return (
                      <button
                        key={minOpt}
                        type="button"
                        data-testid={`min-gap-opt-${minOpt}`}
                        onClick={() => setFormMinGapMinutes(minOpt)}
                        style={{
                          padding: '10px 6px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontWeight: 800,
                          background: isSelected ? '#10b981' : '#ffffff',
                          border: isSelected ? '1.5px solid #059669' : '1px solid #cbd5e1',
                          color: isSelected ? '#ffffff' : '#334155',
                          boxShadow: isSelected ? '0 3px 8px rgba(16, 185, 129, 0.25)' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {minOpt}분{minOpt === 60 ? ' (표준)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Connection */}
          {activeTab === 'connection' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  로컬 서버 API 주소
                </label>
                <input
                  type="text"
                  value={formApiUrl}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="예: http://127.0.0.1:8000"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  매장 코드 (Store Code)
                </label>
                <input
                  type="text"
                  value={formStoreCode}
                  onChange={(e) => setFormStoreCode(e.target.value)}
                  placeholder="예: H01-SE-001"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  키오스크 기기 인증키
                </label>
                <input
                  type="password"
                  value={formDeviceKey}
                  onChange={(e) => setFormDeviceKey(e.target.value)}
                  placeholder="파트너센터 발급 기기 인증키"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 3: Maintenance */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  padding: '18px 20px',
                  background: formIsMaintenance ? '#fffbeb' : '#f8fafc',
                  border: formIsMaintenance ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                    <AlertTriangle size={17} color="#d97706" />
                    임시 점검 모드 (화면 잠금)
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                    활성화 시 일반 고객의 터치를 차단하고 점검 안내를 띄웁니다.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsMaintenance}
                  onChange={(e) => setFormIsMaintenance(e.target.checked)}
                  style={{ width: '24px', height: '24px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
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
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '20px',
                    fontWeight: 800,
                    textAlign: 'center',
                    letterSpacing: '8px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0 0', fontWeight: 500 }}>
                  * 좌측 상단 5회 탭 시 입력할 관리자 비밀번호입니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer (Fixed Bottom) */}
        <div
          data-testid="kiosk-settings-footer"
          style={{
            flexShrink: 0,
            padding: '18px 28px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '12px 22px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              color: '#475569',
              fontSize: '13.5px',
              fontWeight: 800,
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
