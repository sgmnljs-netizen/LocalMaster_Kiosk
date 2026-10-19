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
          width: '660px',
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
                단말기(TID), 기기별 노출 메뉴 및 회원인증 방식을 설정합니다.
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
            { key: 'menus', label: '메뉴 & 인증 설정', icon: <LayoutGrid size={15} /> },
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
        <div style={{ padding: '24px 28px', minHeight: '320px', maxHeight: '68vh', overflowY: 'auto', boxSizing: 'border-box' }}>
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

          {/* Tab 1.5: Menus & Auth Methods */}
          {activeTab === 'menus' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {policyGuardMsg && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '12px',
                    color: '#fbbf24',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{policyGuardMsg}</span>
                </div>
              )}

              {/* Section 1: Kiosk Menu On/Off */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                      메인 화면 메뉴 노출 제어 (기기별 개별 설정)
                    </h4>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0 0' }}>
                      파트너센터 설정과 무관하게 현재 키오스크에서 특정 메뉴만 개별 ON/OFF 할 수 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetMenuOverrides}
                    disabled={Object.keys(formMenuOverrides).length === 0}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: Object.keys(formMenuOverrides).length > 0 ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                      border: Object.keys(formMenuOverrides).length > 0 ? '1px solid rgba(52, 211, 153, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: Object.keys(formMenuOverrides).length > 0 ? '#34d399' : '#6b7280',
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
                          background: isEnabled ? 'rgba(16, 185, 129, 0.09)' : 'rgba(255, 255, 255, 0.03)',
                          border: isEnabled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          cursor: 'pointer',
                          opacity: isEnabled ? 1 : 0.65,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '14px' }}>{menu.emoji}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: isEnabled ? '#ffffff' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {menu.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '6px',
                                background: isOverridden ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.07)',
                                color: isOverridden ? '#fbbf24' : '#9ca3af',
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
                            background: isEnabled ? '#10b981' : '#374151',
                            color: isEnabled ? '#051b14' : '#9ca3af',
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
              <div style={{ paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                    회원인증 수단 ON/OFF 및 기본 시작 탭
                  </h4>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0 0' }}>
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
                          background: isEnabled ? 'rgba(59, 130, 246, 0.09)' : 'rgba(255, 255, 255, 0.03)',
                          border: isDefault
                            ? '1.5px solid #34d399'
                            : isEnabled
                            ? '1px solid rgba(59, 130, 246, 0.35)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '8px',
                          opacity: isEnabled ? 1 : 0.65,
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
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: isEnabled ? '#ffffff' : '#9ca3af' }}>
                                {item.label}
                              </span>
                            </div>
                            <p style={{ fontSize: '10.5px', color: '#9ca3af', margin: '3px 0 0 0' }}>
                              {isServerDisabledFace ? '매장 정책상 안면인식 비활성화됨' : item.desc}
                            </p>
                          </div>

                          <div
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: isEnabled ? '#3b82f6' : '#374151',
                              color: '#ffffff',
                              flexShrink: 0,
                            }}
                          >
                            {isEnabled ? 'ON' : 'OFF'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <button
                            type="button"
                            disabled={!isEnabled}
                            onClick={() => isEnabled && setFormDefaultAuthMode(item.key)}
                            style={{
                              width: '100%',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              background: isDefault ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              border: isDefault ? '1px solid rgba(52, 211, 153, 0.5)' : '1px solid transparent',
                              color: isDefault ? '#34d399' : isEnabled ? '#d1d5db' : '#6b7280',
                              cursor: isEnabled ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <Star size={11} fill={isDefault ? '#34d399' : 'none'} />
                            {isDefault ? '현재 기본 시작 탭' : '기본 시작 탭으로 지정'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
